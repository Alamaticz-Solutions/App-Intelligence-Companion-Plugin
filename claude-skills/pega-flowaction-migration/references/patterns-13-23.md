# Design Patterns 13–23 — verbatim statement + real, live-verified evidence

This file contains the second half of the team's numbered design-pattern catalog (Patterns 13–23), verbatim statements from `Heritage_Modernization_Patterns_2.xlsx`, and live-verified evidence.

See `patterns-meta.md` for target platform details, environment mappings, footprint stats, and precedent grounding.
See `patterns-1-12.md` for Patterns 1–12.
See `patterns-extended.md` for extended patterns E13–E20.

---

## The numbered design patterns (13–23)

Confidence levels:
- **CONFIRMED** — a live query/XML fetch this session produced the cited evidence.
- **NO EVIDENCE FOUND** — searched with a real method and found nothing; treat as an open item,
  not a clean bill of health, unless stated otherwise.
- **INCONCLUSIVE** — tool/access limitation prevented a conclusive check; the limitation is named
  so a future pass knows what to try differently.

---

### Pattern 13 — Reports with joins/sub-reports should be flattened

**What to check:** `Rule-Obj-Report-Definition` → `pySource.pyJoinInfo` (`pyJoinClassName`
rowdata), `pySource.pySubReportInfo` (`pySubClassName` rowdata), and `pyPagesAndClasses` (list of
classes touched — should be exactly 1 for a flat report).

**How to check:**
```cypher
MATCH (r:Rule) WHERE r.environment='HRLifeImp' AND r.rule_type='Rule-Obj-Report-Definition' AND r.is_stub=false
RETURN r.rule_name, r.class_name, r.pzinskey ORDER BY r.rule_name
```
Then `pega_get_rule_xml` each candidate and grep `pyJoinClassName`, `pySubClassName`,
`pyPagesAndClassesClass`.

**Evidence (CONFIRMED for HRLife; corrects the premise for OWLM):** HRLife offenders:
`CO_MissingProviderTransactions` (`PDS-FW-HRLifeFW-Work-ContractRequest`) — join to
`PDS-Data-LocationSummary` **and** sub-report on `PDS-ProviderCase`, 3 classes total, and its own
`pyDeleteMemo` literally says "Added new join class" (updated 2026-01-21 — actively growing, not
legacy debt). `CompletedTasksByWorkGroup` (`History-Work-`) joins into `PDS-FW-HRLifeFW-Work`.
`EpicSummaryReport` joins to `Index-PDS-Data-EpicTransactionInfo`. Counter-example for calibration:
`FetchAssociatedProviderInfo` is genuinely flat. **Correction:** the assumption that Constellation
apps are always flat does not hold — OWLM's `FetchKidWebsite_Parent` has a genuine join
(`pyJoinClassName=Link-Folder`, 2 classes), and `FetchActiveWebsite_Details` spans 2 classes via
`pyPagesAndClasses`. OARC XML access 403'd for the reports attempted, so OARC's flatness is
INCONCLUSIVE, not confirmed.

**Migration implication:** `CO_MissingProviderTransactions`, `CompletedTasksByWorkGroup`, and
`EpicSummaryReport` must each be split into a base report per class before they can back a
Constellation view. Since joins are being actively added to HRLife reports in current development,
raise this as a **freeze-and-flatten governance issue**, not a one-time migration task. Since even
OWLM isn't fully flat, treat "flatten before migrating" as a per-report engineering call, not a
blanket rule implied by "Constellation forbids all cross-class reports."

---

### Pattern 14 — Page Group / Value Group properties should be converted to Page List

**What to check:** `Rule-Obj-Property` → `pyPropertyMode` (observed values: `String`, `Page`,
`PageList` — never `Group`/`ValueGroup` in this codebase). Name-pattern matching alone is
unreliable — several "Group"-named properties are actually `String`.

**How to check:** Sample broadly (don't filter by name alone):
```cypher
MATCH (r:Rule {rule_type:'Rule-Obj-Property'}) WHERE r.environment='<env>'
WITH r, rand() as rr RETURN r.rule_name, r.class_name, r.pzinskey ORDER BY rr LIMIT 12
```
then `pega_get_rule_xml` each and check `<pyPropertyMode>`.

**Evidence (NO EVIDENCE FOUND, genuine sample):** 16 properties pulled across all four apps —
every one resolved to `String`, `Page`, or `PageList`. Zero `Group`/`ValueGroup`. Confirmed false
positives from name-matching alone: `Additional_Jobs_group` (HRLifeImp) → actually `PageList`;
`Additional_AGGroup` → `String`; `JobFamilyGroup` (both HRLifeImp and OARCAPP) → `String` in both;
`IsAdGroupsUpdated` (OWLM) → `String`. `Index-*` classes initially looked like Page Group
candidates but are auto-generated Declare Index target classes (`Rule-Declare-Index`), a different
feature entirely.

**Migration implication:** No genuine Page Group/Value Group instances confirmed in this sample.
Don't apply this pattern as a blanket migration rule without a full-corpus scan (~835 HRLifeImp
properties) turning up real Group-mode hits. Treat as unverified/likely low-incidence rather than
a confirmed migration driver — flag to the team that the sample doesn't support the pattern's
implied prevalence.

**xlsx tag-hint note (2026-07-17, re-verified):** the team's updated xlsx says check
`<pyPageType>` for value `Group`. **This field is not a `Rule-Obj-Property` field at all** — it
was found on `Rule-Declare-Pages` (Data Page) XML instead, with value `normal` on `D_GetPositionID_WD`/
`D_GetSmileGenAPI`, describing Data Page structure (normal vs. list), unrelated to property
page-group typing. Broadened the property sample to 21 total (16 original + 5 more, including 2
more "Group"-named ones: `Additional_Jobs_group`, `JobFamilyGroup`) — `pyPageType` never appears on
any property XML checked; only `pyPropertyMode` does, still never `Group`/`ValueGroup`. The xlsx
hint is wrong on both the field name and the rule type it applies to — keep using
`pyPropertyMode` on `Rule-Obj-Property` as this pattern's check.

---

### Pattern 15 — Temporary (clipboard-only) pages logic won't work

*(Unratified in the original 12 but load-bearing enough to keep in this catalog — extended
numbering shared with 16–20 below.)*

**What to check:** `Rule-Obj-Activity`/`Rule-Obj-Data-Transform` step sequences for a `Page-New`
step with no corresponding `Call Save`/`Call CommitToDB`/`Commit` step. Not graph-queryable —
requires reading the step list inside fetched XML.

**How to check:** `pega_get_rule_xml` candidate activities, inspect the ordered step list
(`pyStepsActivityName` / step type sequence).

**Evidence (INCONCLUSIVE):** `AddLocationSummaryInfo` (`PDS-FW-HRLifeFW-Work-ContractRequest`) is
a good citizen: `Page-New` → `Apply-DataTransform` → `Call Save` → `Call CommitToDB`. By contrast
`AppendReq_OutcomeValue` (`PDS-FW-HRLifeFW-Work`) has **no Page-New, no Save, no Commit at all** —
every step is a `Property-Set` against a **named page** `OutcomePage`
(class `PDS-FW-HRLifeFW-Data-HiringMatrix`, declared via `pxNamedPageReferences`, not created in
this activity). Whether `OutcomePage` is committed by a caller elsewhere wasn't traced — that
requires following the activity's callers, out of scope for a single-activity check.

**Migration implication:** Flag `AppendReq_OutcomeValue` and its `OutcomePage` named-page pattern
for manual caller-chain review before Constellation migration — Constellation's DX API model
doesn't support ad hoc named/clipboard pages the way classic activities do. Needs a broader sweep
of HRLifeImp's ~568 activities to confirm present/absent with confidence.

---

### Pattern 16 — Deferred load actions need redesign

**What to check:** `Rule-HTML-Section` (or embedded `Embed-Harness-Section`) →
`pyLoadDeferred` / `pyDeferLoadRetrievalActivity`. Not graph-queryable — internal XML fields.

**How to check:** `pega_get_rule_xml` on section candidates, grep `pyLoadDeferred>` /
`pyDeferLoadRetrievalActivity>`.

**Evidence (NO EVIDENCE of `true` usage, schema CONFIRMED both sides):** Checked 40+ HRLife
section instances (`GetProviderTMPCasesSummary`, `ImportantTablesChanges` and its 20 embedded
sub-sections, `ContractTerm_CommonInfo` and its 11 sub-sections, plus embedded sections on three
Flow Actions) — `pyLoadDeferred` is present everywhere and **always `false`** in this sample;
`pyDeferLoadRetrievalActivity` always empty. Confirmed via the Constellation-native OARC
`Rule-UI-View` (`CollectProviderInfo`) that its JSON schema (`pxViewMetadata`/`pxContextMetadata`)
has **no equivalent field at all** — a structurally different rule format, not just a toggled-off
flag.

**Migration implication:** If a broader sweep later finds `pyLoadDeferred=true` somewhere in
HRLife, those are hard migration blockers — Constellation views have no rule-level flag to map to;
the loading strategy must be re-architected as component-level lazy loading in the DX/React layer.
Not confirmed present in this sample, but the check method and blocker severity are established.

---

### Pattern 17 — Node-scoped Data Pages should be Requestor-scoped

**What to check:** `Rule-Declare-Pages` → `pyScope` (`node` vs `thread`/`requestor`). Not
graph-indexed — must sample XML.

**How to check:** `pega_get_rule_xml` on Data Page candidates (bias the sample toward
reference/lookup/config/operator-style data pages — the most likely node-scope candidates), grep
`<pyScope>`.

**Evidence (INCONCLUSIVE — partial sample):** 12 Data Pages sampled across all four apps,
deliberately biased toward node-scope-likely candidates — **all 12 came back `thread`-scoped**,
including every reference/config-style HRLife candidate checked. This is a meaningful but partial
sample against ~308 HRLifeImp Data Pages (and ~588 total across the four apps); `pyScope` isn't
graph-queryable so a full sweep wasn't performed this session.

**Migration implication:** No evidence of an active node-scoping problem in the sample, but this
can't be confidently closed out without a full-XML batch sweep of all Rule-Declare-Pages (grep
`pyScope` across all ~588). Don't report this pattern as resolved based on the current sample size.

**xlsx tag-hint note (2026-07-17, re-verified and target value corrected):** the team's updated
xlsx says convert `node` to `requestor`. Broadened the sample to 32 Data Pages total (12 prior +
20 more) — **zero `node`-scoped Data Pages found anywhere** in this codebase; `node` is not the
actual anti-pattern here (0/32). `thread` is the overwhelming real value (31/32, ~97%) — this is
the real target of any remediation, not `node`. Confirmed `requestor` scope is a real, achievable
target, not hypothetical: `D_FetchTaskList` (ODPipeline, `PDS-ODPipeline-Data-TaskConfiguration`)
has `pyScope=requestor`. **Correction: the pattern statement should read "convert `thread`-scoped
Data Pages carrying requestor/session-specific data to `requestor`," not "convert `node` to
`requestor`"** — the xlsx's premise that `node`-scoped pages are prevalent isn't supported by
evidence across 32 samples, and the actual scope migration this codebase needs is thread→requestor.

---

### Pattern 18 — Temporary case creation logic is deprecated

**What to check:** `Rule-Obj-CaseType` → `pyCreateTemporaryObject`.

**How to check:** `pega_get_rule_xml` on case-type pzInsKeys (`PYDEFAULT` variant), grep
`pyCreateTemporaryObject>`.

**Evidence (CONFIRMED, currently clean):** `false` in all three sampled case types:
HRLife `PDS-HRLifeImp-Work-ContractRequest`, OARC `OARC-POR-Work-ServiceRequest`, OWLM
`PDS-OWLM-Work-ServiceRequest`. The field exists identically in classic and Constellation-native
case types.

**Migration implication:** No urgent remediation needed for the sampled case types. If a wider
sweep of HRLife's ~230 case types finds any with `pyCreateTemporaryObject=true`, those need
explicit redesign — but don't assume it's an issue without checking, since the sampled evidence is
clean.

**xlsx tag-hint note (2026-07-17, re-verified — field does not exist, corrected name found):**
the team's updated xlsx says check `pyStartingFlowType` → "Open" case-creation setting →
"temporary object checkbox" and "skip create harness checkbox." Re-fetched HRLife
`PDS-HRLifeImp-Work-ContractRequest` and OWLM `PDS-OWLM-Work-ServiceRequest` case-type XML in
full: **`pySkipCreateHarness` does not exist anywhere** in either case type's XML or in a sampled
Flow's XML. The real, existing field with a similar purpose is **`pySkipNewHarness`**, but it
lives on `Rule-Obj-Flow`, not the case type (confirmed `false` on HRLife's
`GetContractInfo_ScreenFlow`) — see Pattern 23 below, which is the pattern this field actually
belongs to. `pyStartingFlowType` is real, but it is not a checkbox-bearing setting — it's simply
the name of the case type's starting Flow (e.g. `pyStartCase`), stored in
`pyCasetypeStartingFlows`, and it **only exists on case types still using the legacy
single-starting-flow model** (present on HRLife's ContractRequest, absent on OWLM's
ServiceRequest, which has an empty `pyCasetypeStartingFlows` list because it uses the newer
Stage/Process model instead — see Pattern 20 below). **Correction: drop `pySkipCreateHarness` and
the "Open case creation setting" framing from this pattern's check — use `pyCreateTemporaryObject`
only, as already documented above; the harness-navigation concern the xlsx's note also raised
belongs to Pattern 23, not this one.**

---

### Pattern 19 — The use of Data Pages with dynamic parameters referenced from Section Rules should be reviewed

*(This numbering collides conceptually with Pattern 8's wording in the source xlsx — treat Pattern
8 above as the canonical statement of this idea and this entry as the specific "RD-bound dropdown"
sub-case, kept as its own numbered finding because the evidence and remediation differ sharply.)*

**What to check:** `Rule-HTML-Section`/`Rule-UI-View` → `REFERENCES` → `Rule-Obj-Report-Definition`
directly (bypassing a Data Page) — specifically for dropdown/autocomplete controls in
`Embed-Control-Mode-ListDefinition-ReportDefinition` mode.

**How to check:**
```cypher
MATCH (ui:Rule)-[:REFERENCES]->(rd:Rule) WHERE ui.rule_type='Rule-HTML-Section' AND rd.rule_type='Rule-Obj-Report-Definition'
RETURN ui.environment, count(*)
```

**Evidence (CONFIRMED — the strongest cross-app signal in this whole catalog):** Aggregate counts:
**HRLifeImp 45**, ODPipeline 35, DenovoImp 22, TaxApplication 5, Monitoring 4 — **OARCAPP 0, OWLM
0**. Named HRLife hits: `CanceliCIMSRequest`→`ResolvedStatuses`,
`CollectTeamMemberDetails`/`ReassignMgr`/`HMmailID`/`SUbCaseReassign`→`FetchOperatorDetails` (same
RD reused across ≥4 sections), `TeamMemberSearchFields`→`DataTableEditorReport`. Verified the exact
anti-pattern in `CollectTeamMemberDetails` XML: control block is
`Embed-Control-Mode-ListDefinition-ReportDefinition` with `pySourceName>FetchOperatorDetails` — a
dropdown/typeahead literally configured to source the RD with no Data Page intermediary. The
Cosmos migration (ODPipeline, 35 hits) did **not** solve this automatically either.

**Migration implication:** Hard blocker at real scale, not theoretical — 45 confirmed
Section-to-RD direct bindings in HRLife must each get a Data-Page layer inserted before/during
Constellation conversion. Because `FetchOperatorDetails` alone backs ≥4 sections, one new Data
Page wrapping it remediates multiple violations at once — prioritize by shared-RD reuse.

---

### Pattern 20 — New Harness should map to an Initialization Stage

*(Called out by the source spreadsheet's own note as the pattern needing the most detail — that
holds up: this is the single largest structural finding in the catalog.)*

**What to check:** `Rule-Obj-CaseType` → `pyStages` (`Embed-Stage`) →
`pyIsInitializationStage` on the case type's first stage, plus what flow runs there.

**How to check:** `pega_get_rule_xml` on the case type, grep `pyIsInitializationStage>`,
`pyStageName>`, `pxCreatedInPRPCVersion>` (the last tells you whether the rule predates the
Initialization Stage feature entirely).

**Evidence (CONFIRMED, real structural blocker):** HRLife's
`PDS-HRLifeImp-Work-ContractRequest` (`pxCreatedInPRPCVersion=07-01-07` — genuinely never re-saved
on a modern Pega version) has stages `Collect Contract Information → TMP Update → Epic Update →
Propagate Data → Resolution → Cancel → Collect Contract Term`, and **`pyIsInitializationStage`
occurs zero times anywhere in the case type's XML — the field is absent, not merely false.**
OWLM's `PDS-OWLM-Work-ServiceRequest` has `PRIM0 "Request Information"` with
`pyIsInitializationStage=true` explicitly set. OARC's `OARC-POR-Work-ServiceRequest`'s first stage
is literally named "Initialization Stage" with the same flag explicitly `true`.

**Migration implication:** This is a **structural case-type redesign, not a rule port or a
settings flip** — the classic rule instance genuinely lacks the attribute the Constellation
harness-to-stage mapping depends on, it isn't just toggled off. Every in-scope HRLife case type's
pre-first-stage logic (today living as heavily-conditional-skip first-stage flow logic) needs
extraction into a dedicated Initialization stage with a mandatory starting flow, mirroring
OWLM's `Request Information`/OARC's `Initialization Stage` pattern. Scope as its own workstream per
case type — the single largest design decision in the whole catalog.

**xlsx tag-hint note (2026-07-17, re-verified, model distinction clarified):** the team's updated
xlsx also mentions `pySkipCreateHarness` and "the starting flow's first shape/harness reference"
for this pattern. Confirmed `pySkipCreateHarness` doesn't exist (see Pattern 18's note above). The
underlying two case-creation models are now precisely distinguished: **legacy single-starting-flow
model** (`pyCasetypeStartingFlows` → `pyStartCase`, present on HRLife's ContractRequest, absent on
OWLM) vs. **Stage/Process model** (`pyStages` → `pyProcesses` → `pyFlowName`, where
`pyIsInitializationStage` lives — present on OWLM/OARC, absent on HRLife). A case type is on one
model or the other, not both — check which model a case type uses first (is
`pyCasetypeStartingFlows` populated, or is `pyStages` populated with `pyIsInitializationStage`
fields present at all) before applying this pattern's check.

---

### Pattern 21 — Custom HTML should be redesigned using standard components

**What to check:** Constellation `Rule-UI-Paragraph`/`Rule-HTML-Paragraph` (standard instructional
component) vs. HRLife sections that `REFERENCES` a `Rule-HTML-Fragment` directly (raw HTML/JS
embedded inline).

**How to check:**
```cypher
MATCH (r:Rule) WHERE r.environment='OWLM' AND (r.rule_type='Rule-UI-Paragraph' OR r.rule_type='Rule-HTML-Paragraph')
RETURN r.rule_name, r.class_name, r.rule_type, r.pzinskey LIMIT 15

MATCH (r:Rule {environment:'HRLifeImp'})-[:REFERENCES]->(f:Rule {rule_type:'Rule-HTML-Fragment'})
RETURN DISTINCT r.rule_name, r.rule_type, f.rule_name LIMIT 20
```

**Evidence (CONFIRMED, pervasive):** OWLM `ADGroupsData_Instructions`
(`PDS-Office-Data-ADGroups`) stores instructional text as clean sanctioned markup via `pxContent` —
no inline script. OARCAPP has a dozen analogous Paragraph rules (`EMPIDInstruction`,
`NotificationInstruction`, etc.). HRLifeImp's violation is **cross-cutting, not isolated**: dozens
of sections (`ChangeCaseSummary`, `ClinicianLocationInfo`, `CollectTeamMemberDetails`,
`CompensationPlanInfo`, `ConfigureAppAccess`, and more) all `REFERENCES` a shared
`Rule-HTML-Fragment` called `pzGridOpenAction` (raw HTML/JS wiring grid row-click behavior).
Additionally `CaptureLegalEntityDetails` (`PDS-FW-HRLifeFW-Work-LegalEntity`) references
`pzRadiogroupIncludes` — a Fragment providing custom radio-group client-side glue.

**Migration implication:** `pzGridOpenAction` and `pzRadiogroupIncludes` are pervasive,
high-blast-radius Fragment dependencies across dozens of HRLifeImp sections — inventory and
replace with native Constellation grid/radio-group component behavior as a dedicated workstream,
not a one-off fix on whichever section is being converted at the time.

---

### Pattern 22 — Edit Validate is not supported in Constellation; use Obj-Validate instead

**What to check:** `Rule-Edit-Validate` (should be near-zero / retired) vs. `Rule-Obj-Validate`
(the supported mechanism, attached at the Flow Action level) counts per app. `Rule-Obj-Property` →
`pyEditValidate` field for which properties still reference an Edit-Validate rule.

**How to check:**
```cypher
MATCH (r:Rule) WHERE r.rule_type IN ['Rule-Edit-Validate','Rule-Obj-Validate'] AND r.is_stub=false
RETURN r.environment AS env, r.rule_type AS type, count(r) AS cnt ORDER BY env, type

MATCH (src:Rule)-[rel:REFERENCES]->(r:Rule)
WHERE r.rule_type='Rule-Obj-Validate' AND src.rule_type='Rule-Obj-FlowAction'
RETURN src.rule_name, r.rule_name, r.class_name
```

**Evidence (CONFIRMED, fully — the best-precedented pattern in the whole catalog):** Counts:
HRLifeImp Edit-Validate 2 / Obj-Validate 65; OARCAPP 0 / 33; OWLM 0 / 20. HRLife detail:
`EmailAddressValidation` genuinely referenced by property `MarketingEmail`
(`pyEditValidate=EmailAddressValidation` confirmed in the property's own XML) — real usage to
migrate. `PhoneNumberValidation` has **zero inbound references of any relationship type** — spot
checked the most plausible candidate property (`phoneNumber`, `PDS-FW-HRLifeFW-Work`) and its
`pyEditValidate` is empty; genuinely orphaned. OARC/OWLM confirmed exclusive `Obj-Validate` usage
attached at the Flow Action: OARC `CollectProviderUserDetails`→`ValidateProviderUserDetails`,
`AddLocation`→`ValidateAddLocation`, `AddProvider`→`ValidateAddProvider`; OWLM
`Create`→`ValidateKidWebsiteExists`, `LicenseInformation`→`ValidateLicenseInformation`,
`UpdateOfficeLocationStatus`→`ValidateTemporaryClosureDates`.

**Migration implication:** Port `MarketingEmail`'s validation logic from `EmailAddressValidation`
(Edit-Validate) into an `Obj-Validate` rule invoked from its owning Flow Action(s), mirroring
OARC's `ValidateAddLocation`-style pattern. `PhoneNumberValidation` can likely be dropped as dead
code (pending a final confirmation nothing outside the indexed rulesets references it) rather than
migrated. The much larger existing `Obj-Validate` footprint (65 rules, referenced by 53 Flow
Actions) requires **no architectural change** — it already matches the Constellation-proven
pattern exactly. Lowest-risk, best-precedented item in the whole catalog.

---

### Pattern 23 — Custom harness in flows should be redesigned

*(New 2026-07-17, added from the team's updated xlsx and fully live-verified — not carried over
from an earlier write-up.)*

**What to check:** `Rule-Obj-Flow` → `pyCategory` (value `"ScreenFlow"` marks a screen flow) →
`pyScreenFlowHarness`/`pyHarnessPurpose` on the flow's shapes, cross-referenced against
`pxRuleReferences` entries with `pxRuleObjClass=Rule-HTML-Harness` for a non-standard harness name
(OOTB names look like `Perform`/`pyCreate`/`Review`/auto-generated; anything else is custom).

**How to check:** `pega_get_rule_xml` the `Rule-Obj-Flow`; grep `pyCategory`,
`pyScreenFlowHarness`, `pyHarnessPurpose`; cross-reference `pxRuleReferences` for the harness's
`pxRuleFamilyName`.

**Evidence (CONFIRMED):** Three real HRLifeImp screen flows across **two different case types**
all reference the same **custom-named** harness `PDSTabbedScreenFlow` (not an OOTB name):
`GetContractInfo_ScreenFlow` (`RULE-OBJ-FLOW PDS-FW-HRLIFEFW-WORK-CONTRACTREQUEST
GETCONTRACTINFO_SCREENFLOW #20260618T082908.260 GMT`), `DuplicateContractCheck`
(`...CONTRACTREQUEST DUPLICATECONTRACTCHECK #20201121T042848.537 GMT`), and
`RemoveProviderCollectInfo` (`PDS-FW-HRLifeFW-Work-RemoveProvider REMOVEPROVIDERCOLLECTINFO
#20250901T110111.916 GMT`) — the harness itself exists as two separate same-named instances, one
per owning case type (`RULE-HTML-HARNESS PDS-FW-HRLIFEFW-WORK-CONTRACTREQUEST
PDSTABBEDSCREENFLOW #20251113T164430.788 GMT` and the `PDS-FW-HRLifeFW-Work-RemoveProvider`
sibling). **Constellation-side comparison:** OWLM has zero `Rule-Obj-Flow` rules with
"screenflow" in the name at all — it uses the Stage/Process case-type model exclusively, with no
classic screen-flow-with-harness construct. OARCAPP's `Rule-HTML-Harness` rules use OOTB-standard
names (`Perform`, `pyCreate`, `Review`), confirming custom tab-navigation harnesses are a
HRLifeImp-specific legacy pattern, not something even a partially-modernized app carries forward.

**Migration implication:** Redesign `GetContractInfo_ScreenFlow`, `DuplicateContractCheck`, and
`RemoveProviderCollectInfo` (and any other flow referencing `PDSTabbedScreenFlow`, or any other
custom-named harness found in a broader sweep) as Constellation Stage/Process navigation — mirror
OWLM's `PDS-OWLM-Work-ServiceRequest` model (`pyStages`/`pyIsInitializationStage`/
`pyProcesses.pyFlowName`, no harness construct at all) rather than porting the custom harness
forward. Since `PDSTabbedScreenFlow` is reused identically across at least two case types, treat
its replacement as a shared design pattern to apply consistently, not a one-off per flow.

---

### Pattern 24 — *(intentionally excluded, pending team input)*

The xlsx's row 24 ("Flow action section configuration page context other than current page
context") has no supporting content — no notes, no alternative, no XML tag — and was excluded
from this catalog per explicit user instruction (2026-07-17): "don't include that pattern, its
still needs to finished and updated in sheet, we can do that later." Do not analyze against a
pattern #24; the number is intentionally left unused rather than reserved with a stub, since the
team may reshape the statement entirely once they finish the row.
