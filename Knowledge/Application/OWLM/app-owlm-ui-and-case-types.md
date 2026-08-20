---
name: app-owlm-ui-and-case-types
description: "OWLM case types, UI architecture (Website & Staff tabs), and Bulk Edits routing logic."
---

# 4. Case Types

| Case Type (label) | Implementation Class | Prefix | Directly Creatable | Currently In Use |
|---|---|---|---|---|
| Website | `PDS-OWLM-Work-Website` | `W-` | Yes | Yes |
| Website Request | `PDS-OWLM-Work-WebsiteRequest` | `WR-` | Yes | Yes |
| Bulk Edits (labeled "ServiceRequest" in the graph) | `PDS-OWLM-Work-ServiceRequest` | `MOD-SR-` | Yes | Yes |
| Expansion Request | `PDS-OWLM-Work-ExpansionRequest` | `E-` | Yes | No — not currently in use |
| Expansion Request (second variant) | `PDS-OWLM-Work-Website-ExpansionRequest` | `E-` | Yes | No — not currently in use |
| File Download | `PDS-OWLM-Work-FileDownload` | `F-` | Yes | No — not currently in use |
| Customer Review | `PDS-OWLM-Work-CustomerReview` | `C-` | No — created programmatically (Yext email/file intake) | Yes |
| Document Upload | `PDS-OWLM-Work-DocumentUpload` | (n/a) | No — child/utility case | No — not currently in use |
| Staff Setup | `PDS-OWLM-Work-StaffSetup` | (n/a) | No — child case created during staff onboarding | No — not currently in use |

Live-verified via `list-casetypes`: exactly the 6 directly-creatable case types above were confirmed active in the running instance.

> **Team confirmation:** Expansion Request (both variants), File Download, Document Upload, and Staff Setup exist in the ruleset and are technically live/creatable, but per direct team confirmation **these five are not part of the current active workflow** — they are not presently in day-to-day use. 

## 4.1 Case narratives

- **Website** — Manages the full lifecycle of an office's website: creation, updates, temporary/permanent closure, staff/location/service/attribute edits, and cancellation requests.
- **Website Request** — Intake and resolution of requests for new or updated websites; supports both automated and manual review paths.
- **Bulk Edits (ServiceRequest)** — Multi-step requests covering bulk staff/location edits, license management, and website reorder, with branching validation.
- **Expansion Request** (both variants) — *Not currently in use*. Handles requests to expand an office's footprint/services. Two distinct case types share this label.
- **Customer Review** — Three linear stages: Review Request intake → Process Request (automated/timed) → Resolution. Reviews arrive largely automatically via the Yext email listener.
- **File Download** — *Not currently in use*.
- **Document Upload** — *Not currently in use*. Guided intake for document (notably Excel) submission, confirmation of intent, and downstream parsing. Flagged `known_incomplete = true`.
- **Staff Setup** — *Not currently in use*. Onboards and configures staff members: party creation, location assignment, and background propagation of staff data.

---

# 5. User Interface — Website and Staff Bio Tabs

## 5.1 Website tabs

The Website case type (`PDS-OWLM-Work-Website`) landing page (`pyDetails`, `CaseView` template) exposes up to **20 tabs**. Most are individually gated by an `Is<Tab>TabVisible` when-rule, so a given office will not necessarily show all 20 — visibility depends on role, data-quality state, and whether the office is an expansion/co-located site.

| # | Tab | Purpose |
|---|---|---|
| 1 | Details | Landing summary combining Basic Info, Web Attributes, IRS Info, Building Info and Expansion into one rolled-up view. |
| 2 | Missing Data | Surfaces required fields still incomplete for the office record, visible before go-live. |
| 3 | Basic | Core office identity — name, number, region, and other primary identifying attributes. |
| 4 | Real Estate | Building/lease details — the physical real-estate record behind the office. |
| 5 | IRS | Tax/IRS-related identifiers and attributes tied to the office entity. |
| 6 | Location | Address and geographic details used for mapping, search, and marketing display. |
| 7 | Domains | Web domain(s) registered/associated with the office's site. |
| 8 | Web | General website configuration/content attributes for the office's page. |
| 9 | IT | IT-related configuration for the office (systems, technical contacts, etc.). |
| 10 | Staff | The staff roster assigned to this office, sourced from linked Staff/Staff Bio records. |
| 11 | Ad Groups | Marketing/advertising group associations for the office. |
| 12 | Services | Services offered at the office, shown on the public website. |
| 13 | Technologies | Clinical/operational technologies available at the office. |
| 14 | Languages | Languages spoken/supported at the office, for patient-facing display. |
| 15 | Office Hours | Operating hours configuration for the office. |
| 16 | Co-Located Office(s) | Other offices sharing the same physical location — visible only when the office is not itself an expansion. |
| 17 | Parent Office | Link to the parent office, for expansion/satellite locations. |
| 18 | Yext Review | Yext listing/review management — restricted to administrators (`IsAdministrator`). |
| 19 | Marketing API | Marketing API integration details/status for the office's public listing. |
| 20 | History | Full audit history of changes made to the office record. |

Together these tabs make the Website case the single system of record for everything the public-facing marketing site needs about an office.

## 5.2 Staff Bio tabs

> **Note — Office layer, not OWLM-owned:** the implementation class `PDS-Office-Work-StaffBio` is prefixed `PDS-Office-`, not `PDS-OWLM-` — this case type lives in the separate Office application layer that OWLM depends on, not in the OWLM ruleset itself. It's included here because OWLM's Website "Staff" tab consumes it directly.

The Staff Bio case type landing page exposes **5 tabs**, each independently visibility-gated:

| # | Tab | Purpose | Visible when |
|---|---|---|---|
| 1 | Basic Info | Core identity — name, ClockID, contact details, job profile. | `IsBasicTabVisible` |
| 2 | Bio | Biography/professional profile content used for marketing display. | `IsBioTabVisible` |
| 3 | Education | Education history and credentials. | `IsEducationTabVisible` |
| 4 | Associated Profiles | Other Clock ID profiles linked to the same person. | `IsAssociatedProfilesTabVisible` |
| 5 | History | Full change/audit history for the staff record. | `IsOWLMAuthors` |

---

# 6. Bulk Edits — Routing Detail

"Bulk Edits" is the internal/original label of the Service Request case type (`PDS-OWLM-Work-ServiceRequest`). Despite the name, it is **not** a batch-upload tool — it is a single branching intake case that lets a user submit one or more related updates (staff, location, license, website reorder) through one guided form, all converging on one Confirmation/submit step.

## 6.1 How it routes

The case's `CreateForm_Default` flow captures `ServiceRequestType` and `UpdateType` up front, then evaluates three chained EXPRESSION decision gateways to route the user to the correct sub-form:

- **Decision1:** is `UpdateType` = "Location"? → routes to Location Information.
- **Decision2:** is `ServiceRequestType` = "Update Staff And Bio"? → routes to Update Staff Information.
- **Decision3** (post Bio/Education branch): is location information still needed? → Location Information if yes, Website Reorder if no.

Every branch — Staff Information, Location Information, Bio Information, Education Information, or Website Reorder — reconverges on the shared Confirmation step before the case resolves.

## 6.2 Why it exists

Rather than maintaining a separate case type per request category, Bulk Edits consolidates license updates, staff/bio changes, location changes, and website reorder requests into a single case type with property-driven routing — one Confirmation touchpoint, one case-wide action set (Edit Details / Change Stage / Reopen), and one alternate Cancel Request stage that cascades cancellation to any child cases.

Once submitted, Bulk Edits requests feed the Queue Processors — staff and location changes captured here are queued for asynchronous propagation to Office 360, the marketing website, and MDM.
