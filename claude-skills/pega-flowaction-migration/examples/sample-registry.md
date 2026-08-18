# Sample Registry — ClinicianInformation (mid-run snapshot, Wave 2 in progress)

This is an example of what the shared context registry looks like during a real analysis run.
The orchestrator maintains this file on disk and updates it after every agent returns. This
snapshot is from the `ClinicianInformation` Flow Action analysis, captured after Wave 1
completed and Wave 2 (section analysis) is in progress.

Use this as a structural reference when creating your own registry — the exact content will
differ for every Flow Action, but the shape and fields should match.

---

## Run metadata

| Field | Value |
|---|---|
| Environment | HRLifeImp |
| Flow Action | ClinicianInformation (`PDS-FW-HRLifeFW-Work-ContractRequest`) |
| Target platform | Pega Infinity 25.1 |
| UI sourcing | `pySectionReference` |
| Registry file | `ClinicianInformation_analysis_registry.md` |
| Manifest file | `ClinicianInformation_migration_manifest.json` |
| Source backend | PDS MCP, environment `HRLifeImp` |
| Write backend | Pega Infinity Authoring Plugin, application `HRLifeImp` (confirmed same instance at Phase 0 Step 2) |

## Class inheritance cache (`classInheritanceMap`)

```json
{
  "classInheritanceMap": {
    "PDS-FW-HRLifeFW-Work-ContractRequest": ["PDS-FW-HRLifeFW-Work", "Work-", "@baseclass"],
    "PDS-ProviderCase": ["@baseclass"]
  }
}
```

## Dependency tree (status markers)

```
ClinicianInformation (FA)                      [pending — final wave]
├── ClinicianInformation_Existing (Section)     [in-progress — Section-Analysis-1]
│   ├── .ProviderData.ClinicianInfo.ClockId     [done — Property-Batch-1]
│   ├── .ProviderData.ClinicianInfo.ProviderName [done — Property-Batch-1]
│   ├── .ProviderData.ClinicianInfo.PersonalEmailAddress [done — Property-Batch-1]
│   ├── D_GetProviderCaseInfo                   [done — DP-Batch-1]
│   ├── IsClinicianInfoSelectedExisting_CO      [done — Logic-Batch-1]
│   └── IsProviderType_NonMed                   [done — Logic-Batch-1]
├── ClinicianInformation_Existing_02 (Section)  [pending — Wave 2]
│   └── (children TBD — discovered as refresh target)
└── ClinicianInformation_New (Section)          [pending — Wave 2]
    ├── .ProviderData.ClinicianInfo.ClockId      [done — shared with above]
    └── D_GetProviderCaseInfo                    [done — shared with above]
```

## Resolved properties (keyed by class, name)

### `PDS-ProviderCase.ClockId`

| Field | Value |
|---|---|
| Resolved class | `PDS-ProviderCase` |
| Chain walked | `PDS-FW-HRLifeFW-Work-ContractRequest` → `PDS-FW-HRLifeFW-Work` → `@baseclass` — not found; restarted from `SmartPromptClass=PDS-ProviderCase` → found directly |
| Type | Text |
| Mode | String |
| Default control | `pxAutoComplete` |
| Property-level source | none |
| Decision | `NEEDS_REVIEW` |
| Verify flag | `CELL_LEVEL_SOURCE_NEEDS_APPWIDE` |
| List-sourced | yes → flagged for Conflict-Scan Agent |
| Pattern hits | E14 (hidden copies of `.pyID`, `.pxObjClass`, `.pzInsKey`) |

### `PDS-ProviderCase.ProviderName`

| Field | Value |
|---|---|
| Resolved class | `PDS-ProviderCase` |
| Chain walked | direct on SmartPromptClass |
| Type | Text |
| Mode | String |
| Default control | `pxTextInput` |
| Property-level source | none |
| Decision | `REUSE_AS_IS` |
| List-sourced | no |
| Pattern hits | none |

## Data pages

### D_GetProviderCaseInfo

| Field | Value |
|---|---|
| Queryable | `false` |
| Status | active |
| Source | `ReportDefinition` (`FetchProviderCaseInfo`) |
| Parameters | `ClockId` (STRING, by-reference) |
| Step 8a fix | Mark as API + Allow querying any column |
| Step 8b | flat (no joins in `FetchProviderCaseInfo`) |

## Logic rules

### IsClinicianInfoSelectedExisting_CO (When)

| Field | Value |
|---|---|
| Type | `Rule-Obj-When` |
| Behavior | Checks whether an existing clinician has been selected (provider data populated) |
| Properties read | `.ProviderData.ClinicianInfo.ClockId` |
| Taxonomy | `CASE_DATA` |
| Classification | `SUPPORTED_AS_IS` |
| Constellation destination | Visibility condition (direct translation) |

### IsProviderType_NonMed (When)

| Field | Value |
|---|---|
| Type | `Rule-Obj-When` |
| Behavior | Checks `pyWorkPage.OfficeType` — **Pattern #6 violation** (literal `pyWorkPage` reference) |
| Properties read | `.OfficeType` (via `pyWorkPage`) |
| Taxonomy | `UI_CONTEXT` (references top-level page directly) |
| Classification | `SUPPORTED_WITH_RECONFIGURATION` |
| Constellation destination | Rewrite as relative case-data condition |
| Pattern hits | #6 (top-level page reference in When rule) |

## Discovered-dependency queue

| Rule | Type | Found where | Status |
|---|---|---|---|
| SetExisitingClinicianInfo | Data Transform | `ClinicianInformation_Existing` action chain (pre-refresh DT) | pending — dispatched to Logic-Batch-2 |
| ClinicianInformation_Existing_02 | Section | `ClinicianInformation_Existing` refresh target | pending — added to tree |

## Pattern-hit tally (running)

| Pattern | Count | Locations |
|---|---|---|
| #5 | 2 | EffectiveDateLabel caption, section title |
| #6 | 1 | `IsProviderType_NonMed` When rule → `pyWorkPage.OfficeType` |
| E13 | 1 | ClockId autocomplete → refresh + `SetExisitingClinicianInfo` |
| E14 | 1 | ClockId autocomplete → hidden copies (`.pyID`, `.pxObjClass`, `.pzInsKey`) |
| E17 | 1 | ClockId autocomplete → `keyboard/down` trigger |
| E18 | 1 | `pyAllowFreeFormInput=true` on ClockId autocomplete |
