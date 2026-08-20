---
name: app-owlm-automation-and-logic
description: "OWLM background processing (Queue Processors, Job Schedulers), decision tables, flow structures, and open items requiring confirmation."
---

# 9. Background Processing

## 9.1 Queue Processors — reconciled roster

| Queue Processor | Base Class | Threads / Attempts / Interval | Role | Source |
|---|---|---|---|---|
| ProcessMODInternalRequest | `PDS-OWLM-Work` | 6 / 3 / 1×2.0 | Handles location/staff updates originating from Service Requests and TMP-related work objects. | Both |
| ProcessLocationCRUDRequest | `PDS-Data-ServiceRequest` | 6 / 3 / 1×2.0 | CRUD operations for Location and Staff updates within Service Requests (Bulk Edits). | Both |
| ProcessMODAPIRequest | `PDS-PBD-Data-SharedData` | 4 / 3 / 1×2.0 | Handles inbound MOD API requests (OWLID update path). | Both |
| ProcessWebsiteMigrationRequest | `WebsiteMigration` | 1 / 3 / 1×2.0 | Deliberately single-threaded — legacy/serial migration path. | Both |
| ProcessMODDailyScheduledTask | `PDS-OWLM-Work-Website` | 6 / 3 / 1×2.0 | Executes each of the daily scheduled task types dispatched by the Job Scheduler. | Both |
| UpdateMDMRecordInTable | (not specified) | 6 / 3 / 1×2.0 | MDM record sync; dedicated `TMPErrorHandling` error-handling step. | Graph pass only |
| ProcessWebsiteDetails | (not specified) | 6 / 3 / 1×2.0 | Largest processor (40-rule network); office hours, services, staff mapping. | Graph pass only |
| MODStaffHistory (JobScheduler) | (not specified) | daily | Extracts staff/website history, emails report, archives to Box.com. | Graph pass only |
| ProcessMarketingUpdate | `PDS-Data-ServiceRequest` | 6 / 3 / 1×2.0 | Propagates staff/location marketing changes out to the website. | Live-inspection pass only |
| ProcessOfficeUpdateRequest | `PDS-PBD-Data-SharedData-Location` | 6 / 3 / 1×2.0 | Pushes website-originated changes (including cancellations) back into Office 360. | Live-inspection pass only |
| ProcessStaffUpdateRequest | Office ruleset | (not specified) | Background processing of staff data updates for responsiveness/data integrity. | Live-inspection pass only |

**Common configuration baseline:** Property-based processing mode, delayed queue enabled (`pyIsDelayedProperty = true`), up to 6 concurrent worker threads (except where noted), 3 retry attempts with exponential backoff (1s → 2s → 4s), `BackgroundProcessing`-only node type, and alerting via PEGA0117 (long-running activity), PEGA0131 (slow data-flow component, 900s), and PEGA0134 (queue items unprocessed too long, threshold 5000).

## 9.2 Job Scheduler — daily automation

OWLM runs a single cluster-level Job Scheduler — `ProcessMODDailyScheduledTask` — once per day to drive all of its recurring background processing. This is the single entry point for daily automation; individual background jobs are not scheduled independently.

| Property | Value |
|---|---|
| Rule type | Rule-Async-JobScheduler |
| Recurrence | Daily, every 1 day, start time 00:05:00 |
| Time zone | PST8PDT |
| Applicable to | Cluster (fires once per cluster, not once per node) |
| Node type | BackgroundProcessing |
| Access group | OWLM:Authors |
| Triggers activity | ProcessMODDailyScheduledTask (class PDS-OWLM-Work-Website) |
| Alert | PEGA0118 — long-running job scheduler activity, threshold 20 seconds |

> **Note:** The scheduler itself does not do the processing — it fires once at 00:05 AM and hands off to an activity, which fans out into many independently-timed queue items.

At 00:05 AM PST8PDT every day, the scheduler triggers the `ProcessMODDailyScheduledTask` activity, which:
1. Looks up the full list of daily task types from the `ProcessMODDailyScheduledTask` Decision Table.
2. For each row, reads its configured Hour(s)/Minute(s)/Second(s) delay.
3. Sets required properties and calculates the actual delayed fire time relative to the 00:05 base.
4. Enqueues one item per task onto the `ProcessMODDailyScheduledTask` Queue Processor, then cleans up temporary clipboard data.

This design means the 00:05 trigger is really a staggering point — lightweight tasks fire almost immediately, while heavier or lower-priority tasks (e.g. BOT Output Tracking) are deliberately delayed by several hours so they do not all compete for background threads at the same instant.

### 9.2.1 The 16 daily task types
- Activate Upcoming Project (+0h 0m)
- Change Data Tracking (+0h 0m)
- Process CDT Response (+1h 30m)
- Activate Suspended Project (+0h 0m)
- Process Pending Closure Project (+0h 0m)
- Permanent Close Pending Project (+0h 0m)
- Suspend Active Project (+0h 0m)
- Daily BIX Extract (+1h 30m)
- BOT Output Tracking (+8h 15m)
- Expansion Office Update (+0h 0m)
- Missing Required Fields (+0h 0m)
- Queue Staff License Retry (+0h 0m)
- Notify Pending Staff Review (+5h 55m)
- Query Weighted Score BOX (+0h 0m)
- Generate Active Offices File BOX (+0h 0m)
- Trigger Active Website Prerequisite (+0h 0m)

## 9.3 End-to-end daily automation flow

**00:05 Job Scheduler fires** (once daily, cluster-wide) → **Activity reads the 16-task Decision Table** → **16 items enqueued (staggered by configured delay)** → **Queue Processor executes each item** (retryable, alertable, on BackgroundProcessing nodes only).

## 9.4 SLA, workbaskets, and access-deny — confirmed scope limits

- **No `Rule-Obj-SLARule` and no `Rule-Obj-WorkBasket` rules exist anywhere in OWLM.** This app routes work via queue processors/schedulers and direct assignment rather than SLA-timed workbaskets. If case aging/escalation is expected, it is not implemented via standard Pega SLA/workbasket mechanisms.
- **Dropdown/field-value enumeration is not fully feasible from the graph.** `Rule-Obj-Field-Value` is not a captured node type anywhere in the PDS knowledge graph.

## 9.5 Decision Tables — Key Logic

40 `Rule-Declare-DecisionTable` rules drive OWLM's business logic. The most significant, by domain:

**Staff review / office-type logic**
- `DetermineReviewTaskNeeded` — the largest table (59 rows): cross-references ~59 job codes against parent/child office type combinations to decide Review/Ignore/Add per side — the core "does this staff change need a review task" engine.
- `DetermineServiceRequestAccess` — role-gated allow-list of which Service Request types each MOD role may perform.
- `FetchAddressUpdateCases` — hardcoded allow-list of 32 specific case IDs (W-278, W-154, ... W-52) all resolving to true.
- `DetermineClosedOffice_Child` — currently has no active rows.

**MOD API / MDM integration**
- `DetermineMODAPI_Record`, `DetermineMODAPI_Request`, `DetermineMODUpdate`.

**Role / access validation**
- `DetermineOWLRoleBasedValidation`, `DetermineOWLRoleBasedValidation_Multiple`, `DetermineRecipientRole_OTA`.

**Customer Review / Yext**
- `YextRulesConfiguration`, `PopulateCustomerReviewAttribute`, `GetExceptionalYEXTRoleUpdate`.

**Correspondence content selection**
- `GetProcessBasedCorrName`, `GetProcessBasedMailSubject`, `DetemineMailNeeded_OWLMRequest`.

**Other supporting tables**
- `GetServices` (authored as `GetSerivces`, a typo in the rule name) — maps ~32 canonical dental service names to office-type applicability.
- `DetermineOfficeName_Change` / `MapCoLocatedOfficeNumber` / `MapDealAddressType`
- `PopulateOfficeDays`, `PopulateAuditMapping_DT` / `pyGetTopicForAIFields`, `PopulateTabNames`.

## 9.6 Flow / Stage Structure

Most OWLM flows are intentionally simple/linear — logic lives in decision tables and activities, not flow branching. `CustomerReview` and `DocumentUpload` are genuinely simple, mostly-automated flows, while `Website`'s own flows carry the real branching complexity, feeding into the `DetermineMODStages`/`ProcessMODDailyScheduledTask` decision-table engine.

## 9.7 Correspondence and Attachments
- **Correspondence (12 email rules + 1 fragment)**: `ServiceRequestInformation`, `NotifyCustomerReview`, `BiWeekly_Report_CDT`, `DailyReport_MOD`, `DailyReport_Staff`, `DisplayTempClosureInstructions / _Active`, `MissingRequiredFields`, `NotifyDBANameUpdate`, `NotifyPendingStaffReview`, `PermanentClosureInstructions`, `pzSampleOneColumnEmail / OWLMBorderStyle`.
- **Attachment categories (3)**: `YextCustomerReview / YextReview`, `CaseDocument`.

---

# 10. Important Notes — Open Items Requiring Confirmation

**10.1 Document Upload flagged incomplete**
The graph's automated analysis explicitly marked the Document Upload feature as `known_incomplete = true`.

**10.2 Document Upload has no role/privilege gating**
Unlike every other top-level case type, Document Upload's access-control scan returned no privilege and no roles attached to its harnesses.

**10.3 Hardcoded individual email addresses in production routing logic**
The `YextRulesConfiguration` decision table routes customer-review notifications to two hardcoded personal addresses for specific offices/regions.

**10.4 Duplicate "Expansion Request" case type**
Two distinct case types are both labeled "Expansion Request" (`PDS-OWLM-Work-ExpansionRequest` and `PDS-OWLM-Work-Website-ExpansionRequest`).

**10.5 Hardcoded case-ID allow-list in a decision table**
`FetchAddressUpdateCases` is a decision table whose entire content is 32 hardcoded case IDs all resolving to `true`.

**10.6 A decision table is effectively a stub**
`DetermineClosedOffice_Child` currently has no active condition rows.

**10.7 Two independent rule pulls disagree on the Queue Processor roster and rule counts**
Both broadly agree on rule-type counts but list different Queue Processors (see §9.1). Recommend a direct `list-rules` pull filtered to `Rule-Async-QueueProcessor` in the live instance to produce one authoritative roster.

**10.8 Rule-name collisions across case types**
Several rule names (`CreateForm_Default`, `Confirmation`, `Create`, `Pre_StaffInformation`) recur identically across multiple case-type classes.

**10.9 AI-topic lookup rule exists but is currently disabled**
`pyGetTopicForAIFields` is a single-row table hardcoded to `false`.

**10.10 Customer Review file intake has two versions live**
Both `ProcessCustomerReview` and `ProcessCustomerReviewV2` service-file rules are present.

**10.11 LSA review findings (live-inspection pass)**
- **Unit test coverage gap:** 4 of the 5 Service/Setup case types inspected carry an unresolved `pxPegaUnit` guardrail warning.
- **Environment access flag:** most inspected case types carry `pxLimitedAccess = Dev` even though they are actively used in what reads as a live application.
- **Cloned/renamed rule names:** several Website tabs (`RealEstate_1`, `IRS_1`, `Basic_1`, `Bio_1`) carry a numeric suffix typical of Pega's "Save As" clone naming.
- **Positive finding:** Queue Processor configuration is consistent and correct across every inspected processor.

**10.12 Business domain confirmation still recommended**
"OWLM" and "MOD" were never expanded by a human in either analysis pass. The `GetServices` decision table and the provider/licensing integrations are strong evidence for the dental-practice-network framing used throughout this document.
