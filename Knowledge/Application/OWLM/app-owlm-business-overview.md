---
name: app-owlm-business-overview
description: "OWLM business overview, executive summary, capabilities, personas, and upstream data origination pipelines."
---

# 1. Executive Summary

OWLM (application label **MOD**, version 01.01.01, owned by **PDS**) is the Pega Infinity application that manages the **website, local-listing, and staff/provider directory presence of a multi-location dental practice group**. Two independent upstream pipelines — a Deal-driven Office pipeline and a Workday-driven Staff pipeline — converge inside OWLM, which then drives the public-facing website content, local-listing syndication (Yext), and staff/provider directory for every office in the network.

This document merges two prior analysis passes into one reference:
- **A graph-first pass** (Neo4j knowledge-graph reverse engineering, cross-checked live against the running Pega instance via the Infinity Authoring plugin) — covering rule inventory, case types, decision-table logic, integrations, security, and flow structure.
- **A live rule-inspection pass** (`search_rules` / `pega_get_rule_xml` against the running ruleset) — covering upstream data-origination pipelines, full tab-level UI structure, Job Scheduler operational detail, and an LSA-style code review.

Where the two passes describe the same thing with different numbers (e.g. rule counts, the Queue Processor roster), both figures are shown and flagged rather than silently reconciled.

---

# 2. What OWLM Does

Based on class names, integrated systems, and case-type behavior, OWLM manages the **website, local-listing, and staff/provider directory presence of a multi-location office network** — evidenced most strongly by the `GetServices` decision table, which maps roughly 32 explicit dental service names (braces/orthodontics, crowns, root canal/endodontics, wisdom teeth/oral surgery, pediatric pulpectomy, etc.) against office types, combined with `GetSmileGenAPI`, `ProviderDetails`, and `CREDStreamLicenseAPI` (professional licensing) integrations and the Yext local-listings/reviews integration.

Core business capabilities:
- **Website lifecycle management** — request, create, update, temporarily/permanently close, and migrate office websites.
- **Staff & provider directory management** — onboard staff/providers, maintain bio data, licensing, and job-code/role mapping per office.
- **Local listings & customer reviews** — sync office/provider data to Yext and process incoming customer reviews.
- **Bulk / service-request edits** — batched staff, location, and license changes routed through a single "Bulk Edits" request type.
- **Document intake** — Excel/document upload and parsing for bulk data changes.
- **Cross-system synchronization** — nightly and event-driven sync to MDM (master data management), a downstream MOD API, and file storage (Box.com).

## 2.1 Personas and access roles

**Personas (8):** Field Markets, IAM Users, Marketing Users, MOD Administrator, Read Access Users, ROC Users, Staff Managers, Users.

**Access roles (24):** each persona has a base role and most have a parallel "...Managed" variant (e.g. `OWLM:MarketingUsers` / `OWLM:MarketingUsersManaged`), plus dedicated `OWLM:SecurityAdministrator`, `OWLM:PegaAPI` (service account access), `OWLM:EnterpriseAccess`, `OWLM:SysAdm4`, and `OWLM:User4` roles.

Every major case type restricts its UI privilege (`PDS-OWLM-UIPages_<CaseType>`) to the same five roles: `AuthorsManaged`, `MarketingUsersManaged`, `ReadOnlyUsersManaged`, `StaffMangersManaged`, `UsersManaged` (all scoped to `Data-Portal`). Document Upload currently has no roles/privilege attached.

## 2.2 External business relationships

| System | Purpose |
|---|---|
| Yext | Local-listing syndication and customer review intake (email + file listener) |
| Box.com | Document/file storage for website and staff-history attachments |
| MDM platform | Master-data synchronization of location/provider records |
| CRED Stream | Professional license number verification/lookup |
| "Smile"/Provider Details APIs | Provider (staff/practitioner) directory lookups |
| MS Graph, Excel/Service File Parsing | Office-365 and spreadsheet-based data intake components |
| Office (application) | OWLM depends on the separate "Office" Pega application — source of staff/HR master data |
| Workday / TMP | Upstream source-of-truth for staff onboarding, via TMP as a pass-through |
| Deal / Office 360 | Upstream source-of-truth for new office provisioning |

---

# 3. Data Origination — How Office and Staff Records Reach OWLM

OWLM sits at the end of a multi-application chain that originates a deal, provisions an office, and populates that office with staff. Two independent creation pipelines feed OWLM — one for Office data (deal-driven) and one for Staff data (Workday-driven) — and **OWLM is responsible for creating and maintaining the link between the two**.

## 3.1 Office creation pattern

An Office record is provisioned from a closed/announced Deal. The deal data flows forward into an Office case, which in turn is represented as a **MOD Office** (the Master/Modification Office record OWLM's Website case type tracks) — the object that ultimately drives the OWLM Website tabs.

**Flow:** Deal → Office → MOD Office
1. A Deal is announced/closed in the Deal case. 
2. The announcement triggers creation of an Office case (Office 360 application). 
3. The Office case data is synchronized into OWLM as a MOD Office record — this becomes the Website case type instance.

## 3.2 Staff creation pattern

Staff records follow a separate pipeline that starts from Workday. A Workday payload is delivered to **TMP**; TMP sends a transaction into the OWLM application carrying the staff details, and OWLM creates the Staff record from that transaction. **OWLM is also where the Staff–Office link is established and maintained — not upstream in TMP.**

**Flow:** Workday Payload → TMP → OWLM Transaction → Staff Created
1. Workday produces the source-of-truth onboarding payload for a new or changed staff member. 
2. The payload is sent to TMP, which packages it into a transaction. 
3. TMP sends that transaction to the OWLM application with the full staff details. 
4. OWLM processes the transaction and creates the Staff record — and at this point also establishes the Staff–Office link, tying the new Staff record to its parent MOD Office.

> **Staff ↔ Office link is created and maintained inside OWLM, not upstream in TMP or Workday.** This is a deliberate design choice: TMP is a pass-through for onboarding data, but the relationship between a staff member and the office(s) they belong to is OWLM's responsibility, because OWLM is what serves that relationship out to the Website tabs, Bulk Edits functionality, and the daily Job Scheduler tasks.

## 3.3 Combined flow — how the two pipelines meet

The Office pipeline and the Staff pipeline are independent in origin but converge inside OWLM: a Staff record created via the TMP transaction is linked to the MOD Office record that was created via the Deal → Office pipeline. This combined object model is what every downstream feature (Website tabs, Staff tabs, Bulk Edits, Queue Processors, the Job Scheduler) ultimately operates on.

| Pipeline | Origin | Path | Result |
|---|---|---|---|
| Office | Deal (DealLog) | Deal → Office → MOD Office | MOD Office record backing the Website case |
| Staff | Workday | Workday Payload → TMP → OWLM Transaction | Staff record, linked to its MOD Office |
