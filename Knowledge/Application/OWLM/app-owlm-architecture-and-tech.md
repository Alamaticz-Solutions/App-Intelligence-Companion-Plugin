---
name: app-owlm-architecture-and-tech
description: "OWLM architecture, design patterns, rule inventory, class hierarchy, integrations, security model, and LSA code review checklist."
---

# 7. Architecture and Design Patterns

1. **Queue-processor-per-integration-domain.** Multiple `Rule-Async-QueueProcessor` rules each own one bounded concern (internal requests, MDM updates, website details, website migration, location CRUD, MOD API, marketing updates, office-update sync). All share the same retry shape, varying only thread count by expected volume/criticality.
2. **Decision-table-driven routing over hardcoded branching.** Request/record type resolution is consistently pushed into `Rule-Declare-DecisionTable` rules rather than embedded in activity logic, keeping request-type-to-behavior mapping centrally editable.
3. **Shared "AppExtension" declarative-page pattern.** `D_OWLMAppExtension` / `D_OfficeAppExtension` declarative pages recur across nearly every queue processor and scheduler as a shared configuration/lookup layer. More broadly, `Rule-Declare-Pages` (`D_...` naming) act as a caching layer in front of Report Definitions or REST connectors, parameterized by ClockID/OfficeNumber/ProviderID to avoid repeated DB or API calls.
4. **Component-based application layering.** OWLM is built on the `Office` application plus five reusable components (`ServiceFileParsing`, `ExcelFileParsing`, `SBBoxIntegration`, `MSGraphIntegration`, and governance components `PegaRuleReviewTool`/`CodeQualityGovernance`) rather than reimplementing file-parsing/storage integration locally.
5. **Migration-as-a-parallel-path.** `ProcessWebsiteMigrationRequest` and `ProcessWebsiteDetails` are kept as separate queue processors with separate activity chains rather than folding legacy-data migration into the standard update path — isolates one-time/bulk migration logic from steady-state processing.
6. **Consistent harness quartet per case type.** Every top-level case type exposes the same four harnesses (`pyCreate`, `Perform`, `Review`, plus a case-named `UIPages` harness), giving a predictable UI shape across all case types.
7. **Paired "base + Managed" role model.** Each functional persona (Marketing Users, Staff Managers, Read-Only, etc.) has a parallel `...Managed` access role, suggesting a data-scoped/managed-agent access pattern layered on top of a flat functional-role model.
8. **Explicit error-handling model on integration-heavy processors.** `UpdateMDMRecordInTable` names a dedicated `TMPErrorHandling` model step distinct from its main path — error handling as a first-class step, not just try/catch wrapping.
9. **Case-type stage/flow orchestration.** Case types follow a consistent Request Information → Processing → Resolution stage pattern, with screen-flows routing conditionally by request sub-type before reaching a shared Confirmation step.
10. **Token/auth caching for external integrations.** Dedicated Declare Pages cache OAuth2/JWT tokens per session, decoupled from the business data pages that consume them (e.g. Box folder integration, CRED Stream integration).
11. **Flow action pre/post processing.** UI flow actions consistently pair a pre-processing data transform (populate) with a validation activity and a post-processing transform/activity to commit changes — separating UI population, validation, and persistence concerns.
12. **Reusable tab containers with deferred loading.** Both the Website and Staff Bio landing pages use CaseView/OneColumnTab templates with DeferLoad tabs gated by individual "when" visibility rules, so a tab's content and its data page are not fetched until the user opens it.
13. **Queue-based asynchronous processing.** Nearly every write that touches external systems (Office 360, the marketing website, MDM, Box) is decoupled from the user transaction via a Queue Processor.

---

# 8. Technical Foundations

## 8.1 Application structure
- **App class root pattern:** `DataClass = PDS-OWLM-Data`, `LinkClass = PDS-OWLM-Link`, `UIPagesClass = PDS-OWLM-UIPages`, work pool = `PDS-OWLM-Work`.
- **Depends on:** Office (application), ServiceFileParsing, SBBoxIntegration, MSGraphIntegration, ExcelFileParsing, PegaRuleReviewTool, CodeQualityGovernance (all version-pinned components).

## 8.2 Rule inventory — reconciled

| Rule Type | Count | LSA Reading (live pass) |
|---|---|---|
| Rule-Obj-Property | ~537 | Expected to dominate — normal for a data-rich office/staff domain. |
| Rule-UI-View | ~402 | Large UI surface, consistent with the 20-tab Website / 5-tab Staff Bio landing pages. |
| Rule-UI-Localization | 324 | Good sign — labels are localized rather than hardcoded into sections. |
| Rule-Obj-Model | 219 | Heavy use of Data Transforms/Models for mapping — favors declarative mapping over Activity-based mapping, the preferred Pega pattern. |
| Rule-Obj-Activity | ~208 | Worth a periodic audit — Activities should be reserved for control flow/integration orchestration; any Activity doing pure data mapping is a guardrail candidate for conversion to a Data Transform. |
| Rule-Declare-Pages | ~193 | Consistent with the caching pattern (pattern 3). |
| Rule-Obj-When | 132 | — |
| Rule-Obj-Report-Definition | 132 | — |
| Rule-HTML-Harness | 42 | — |
| Rule-Declare-DecisionTable | 40 | Healthy use of decision tables for business rules instead of hardcoded conditionals. |

## 8.3 Class hierarchy (OWLM-owned classes)

8 `Rule-Obj-Class` rules are owned directly by the OWLM ruleset:
- `PDS-OWLM-Data-GeographicRegion`
- `PDS-OWLM-Data-GlobalExclude`
- `PDS-OWLM-Data-GlobalInclude`
- `PDS-OWLM-Work-Website`
- `PDS-Office-Data-ADGroups`
- `PDS-Office-Data-Disclaimer`
- `PDS-Office-Data-OfficeServices`
- `PDS-Office-Data-Technologies`

All other OWLM work/data classes inherit structurally from `PDS-OWLM-Work / Work-` without a separate owned class rule — standard Pega pattern-inheritance, not a gap.

**Ruleset stack:**
- **OWLM-owned rulesets:** `OWLM` (main), `OWLMDelegation` (LSA-delegated rules), `OWLMInt` (integration-layer rules).
- **Referenced platform/cross-app rulesets:** (~40 total) Pega framework rulesets (`Pega-RULES`, `Pega-ProcessEngine`, `Theme-Cosmos`, etc.), PDS shared rulesets (`PDS`, `PDSInt`, `PDSAPI`, `PDS-SharedData`), and cross-application dependencies (`Office`, `ServiceFileParsing`, `SBBoxIntegration`, `MSGraphIntegration`, `ExcelFileParsing`).

## 8.4 Integrations

| Rule | Type | Direction | Purpose |
|---|---|---|---|
| GetSmileGenAPI | Connect-REST | Outbound | Provider-related lookup |
| GetBoxFolderInfo / PDSBoxFileContent / PDSBoxCreateFile / PDSBoxDeleteFile / PDSBoxFolder | Connect-REST | Outbound | Box.com document storage (folder + file CRUD) |
| ProviderDetails | Connect-REST | Outbound | Provider/staff directory lookup |
| CREDStreamLicenseAPI / CREDStreamJWTToken | Connect-REST | Outbound | Professional license verification, with dedicated JWT token exchange |
| ProcessYextEmailRequest | Service-Email | Inbound | Listens for Yext-originated customer review emails |
| MODSystemAccess | Service-File | Inbound | System access/operator provisioning file feed |
| UploadWebsiteMigrationData (×5 flows) | Service-File | Inbound | Bulk website/staff migration data intake |
| ProcessCustomerReview / ProcessCustomerReviewV2 | Service-File | Inbound | Customer review file intake |
| MOD API (v1) | Service-REST | Inbound | External-facing MOD API endpoint |
| WebsiteMigration / Staff Bio Data Update_Migration | Service-REST | Inbound | Migration-specific inbound endpoints |

## 8.5 Security model

- **8** `Rule-Persona` definitions, **24** `Rule-Access-Role-Name` rules, **22** `Rule-Access-Privilege` rules, **19** `Rule-Access-Role-Obj` rules.
- **Privilege naming convention:** `PDS-OWLM-UIPages_<CaseType>` gates each case type's UI harnesses.
- **No `Rule-Access-Deny` rules exist anywhere in OWLM** — access control is allow-list only.

---

# 11. LSA Code Review Checklist

Standard Pega Lead System Architect guardrail and code-review categories, for use on future OWLM changes:

### Class & Data Model
- New classes follow the organization's class-naming and layering conventions (no business logic placed directly on the Work- base class).
- Properties are typed correctly (no over-use of Text/Value for structured data) and reused from existing classes where an equivalent already exists, rather than redeclared.
- Page/Page List properties are scoped appropriately (thread vs. requestor vs. clipboard) to avoid memory bloat.

### Process & Case Design
- Case type stages map to real business milestones, not just UI screens.
- Flow actions separate pre-processing, validation, and post-processing rather than mixing UI population and persistence logic in one place.
- Decision gateways in flows use When rules / Decision Tables, not inline expressions duplicated across multiple flows.

### Reuse & Maintainability
- No copy-pasted sections/flows where a parameterized, shared rule would work — check for near-duplicate Rule-UI-View or Rule-Obj-Activity names before authoring a new one.
- Activities are reserved for orchestration/integration; straight data mapping is done in Data Transforms or Declare rules.
- Hardcoded values (URLs, thresholds, office numbers, ruleset names) are externalized to Data Pages, Decision Tables, or Dynamic System Settings — not embedded in Activities/Flows.

### Performance
- Declare Pages used for expensive lookups are appropriately scoped/cached (requestor vs. thread) and parameterized, not reloaded unnecessarily.
- Long-running or external-system work is queued (Queue Processor) rather than executed inline in the user's transaction — OWLM does this consistently.
- Report Definitions avoid unfiltered/unbounded result sets; explicit filters and paging are present.

### Security & Compliance
- Access is controlled via Access Roles/Privileges, not by hiding UI controls alone (a hidden button is not access control).
- PII/HR data (staff bio, clock IDs, compensation-adjacent fields) is restricted to appropriate access groups.
- Integrations (Box, CRED Stream, MDM) use the token-caching pattern rather than re-authenticating per call.

### Testing & Guardrails
- Guardrail warnings are either resolved or explicitly justified with a named reviewer — an unjustified warning should not persist across releases.
- Pega Unit test coverage exists for case types and key activities, especially ones with branching logic.
- Rule descriptions and memos are populated meaningfully.

### Naming & Documentation
- Rule names are descriptive and consistent with the domain vocabulary already in use (`ProcessX` / `D_X` / `IsXTabVisible` patterns are followed consistently in OWLM — keep extending, don't diverge).
- Numeric-suffix clone names (`_1`, `_2`) are renamed to something meaningful once finalized, rather than left as clone artifacts.
