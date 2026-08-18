# Design Patterns 1–12 — verbatim statement + real, live-verified evidence

This file contains the first half of the team's numbered design-pattern catalog (Patterns 1–12), verbatim statements from `Heritage_Modernization_Patterns_2.xlsx`, and live-verified evidence.

See `patterns-meta.md` for target platform details, environment mappings, footprint stats, and precedent grounding.
See `patterns-13-23.md` for Patterns 13–23.
See `patterns-extended.md` for extended patterns E13–E20.

---

## The numbered design patterns (1–12)

Source: the team's `Heritage_Modernization_Patterns_2.xlsx` (supersedes the original
`Heritage_Modernization_Patterns.xlsx`, which had only 12 patterns and no "which xml tag to check"
column). **The xlsx's own "which xml tag to check" hints are not automatically trustworthy** — several were found wrong
or incomplete on re-verification (see the per-pattern "xlsx tag-hint note" callouts below); never
carry a tag hint into a finding without checking it against real rule XML first.

Confidence levels:
- **CONFIRMED** — a live query/XML fetch this session produced the cited evidence.
- **NO EVIDENCE FOUND** — searched with a real method and found nothing; treat as an open item,
  not a clean bill of health, unless stated otherwise.
- **INCONCLUSIVE** — tool/access limitation prevented a conclusive check; the limitation is named
  so a future pass knows what to try differently.

---

### Pattern 1 — All Data Pages should be API-enabled

**What to check:** `Rule-Declare-Pages` → `pyMethodStatus` field (value `"API"` when enabled). Not
graph-indexed — must fetch rule XML per Data Page, there is no shortcut query.

**How to check:**
```cypher
MATCH (r:Rule) WHERE r.environment='HRLifeImp' AND r.rule_type='Rule-Declare-Pages'
RETURN r.rule_name, r.pzinskey
```
Then `pega_get_rule_xml` each candidate and grep `<pyMethodStatus>`.

**Evidence (CONFIRMED):** 9 of 10 sampled Data Pages across all four apps had `pyMethodStatus`
blank — including every HRLife sample (`D_Acc_FinNotification`, `D_Account`, `D_FetchCaseData`,
`D_FetchFSTicketStatus_Info`, `D_FetchEpicCaseInfo`, `D_GetOperatorDetails`). One confirmed
positive exists: OWLM's `D_FetchAdGroups` has `pyMethodStatus=API`. This is not something HRLife
inherits "for free" from being modernized — even the Constellation-native apps mostly leave it
unset.

**Migration implication:** Treat as an explicit governance checklist item across all ~308
HRLifeImp Data Pages — a bulk remediation pass, not spot-fixes. Sample rate suggests near-100%
currently need the flag set.

---

### Pattern 2 — Any Data Page invoking a REST Connector should be Query-enabled

**What to check:** `Rule-Declare-Pages` → `pyIsQueryable` field, cross-referenced against
`pyDeclarePagesDataSource` (must be `Connector` — a direct Connect-REST source — for this pattern
to apply; `ReportDefinition`/`ObjOpen`/`LoadActivity`-sourced pages are out of scope for this
specific check).

**How to check:** Same enumeration query as Pattern 1, then grep `<pyDeclarePagesDataSource>` and
`<pyIsQueryable>` in the fetched XML.

**Evidence (CONFIRMED violation exists, INCONCLUSIVE for HRLife specifically):**
`D_GetProviderLocations` (ODPipeline, class `PDS-Data-PrLocation`) has
`pyDeclarePagesDataSource=Connector` (backed by Connect-REST `RemovePrLocation`) with
`<pyIsQueryable/>` present but empty — a genuine, confirmed violation. Other samples
(`D_FetchFSTicketStatus_Info`=true, `D_FetchCaseData`=false, `D_FetchEpicCaseInfo`=false,
`D_FetchAdGroups`=true) are all `ReportDefinition`-sourced, not directly relevant. No
direct-REST-sourced HRLife Data Page was located in this sample — a wider sweep of HRLife's data
pages by `pyDeclarePagesDataSource=Connector` is needed to name a concrete HRLife offender.

**Migration implication:** Audit every HRLife Data Page's `pyDeclarePagesDataSource`; wherever
it's `Connector`, verify `pyIsQueryable=true` before Constellation cutover. ODPipeline shows this
gets missed even in a modernized app — don't assume HRLife is clean just because no example was
pulpped yet.

**xlsx tag-hint note (2026-07-17, re-verified):** the team's updated xlsx says check
`<pySQLOption>`. That field is real, but it lives **inside each `pyDataSourceList`/
`Embed-DeclarePageSource` row** (confirmed on `D_Contact`, `D_GetPositionID_WD` in HRLifeImp and
`D_GetSmileGenAPI` in OWLM, all `pySQLOption=false`) — it's a boolean describing whether that
data source is SQL/Report-Definition-backed vs. a connector, not a query-enabled toggle. It is
**not the same field** as `pyIsQueryable` (a separate, top-level `Rule-Declare-Pages` field). Keep
using `pyIsQueryable` as the check for this pattern; `pySQLOption` answers a different question.

---

### Pattern 3 — All Properties, When Rules, Data Transforms, and Views must be marked as Relevant Records

*(Widened 2026-07-17 per the team's updated xlsx to explicitly include Data Transforms alongside
Properties/When Rules/Views — the finding below was re-checked against a Data Transform and a
Constellation View too, not just re-worded.)*

**What to check:** No `pyRelevant*`/`pxRelevant*` field exists on `Rule-Obj-Property`,
`Rule-Obj-When`, or `Rule-Application` XML in this Pega version range (rules span 7.3–25.1.1,
none carry it).

**How to check:** Fetch full XML for a sample property, a When rule, and the `Rule-Application`
rule itself (`RULE-APPLICATION HRLIFEIMP 01.01.02`), grep for any "Relevant" string.

**Evidence (CONFIRMED as NO rule-level flag exists, re-verified 2026-07-17 with two more rule
types):** Zero occurrences of "Relevant" in any form across `Rule-Obj-Property`, `Rule-Obj-When`,
and the full `Rule-Application` XML (78,696 chars). Re-checked with a Data Transform
(`RULE-OBJ-MODEL @BASECLASS DEFAULT_DT`, OARCAPP) and a Constellation `Rule-UI-View`
(`RULE-UI-VIEW @BASECLASS CASEFOLLOWERS`, ODPipeline, including its `pxViewMetadata`/
`pxContextMetadata` JSON) — no relevant/curation/isRecord-style field in either. Also fetched the
full `Rule-Application` XML for OWLM (31.7K chars) and OARCAPP (35.8K chars) and scanned in full —
same absence. This corroborates the hypothesis: **Relevant Records is an App Studio "Records
Explorer"/Data-Designer curation concept, not a per-rule-instance attribute** — it will never show
up via rule-XML sampling or a graph `REFERENCES` query, for any of the four rule types the widened
statement now covers.

**Migration implication:** This line item cannot be verified or enforced via rule-XML inspection
or an automated migration-manifest check, for Properties, When Rules, Data Transforms, or Views
alike. Re-scope it as a manual App Studio configuration task (compare HRLifeImp's Data Designer /
Records Explorer configuration against OWLM/OARCAPP's in Dev Studio directly) rather than folding
it into the automated per-rule analysis pipeline.

---

### Pattern 4 — Associating data pages with properties should be done at the property level

**What to check:** `Rule-Obj-Property` → `REFERENCES` edge to `Rule-Declare-Pages` (correct
pattern) vs. `Rule-Obj-Property` → `REFERENCES` edge directly to `Rule-Obj-Report-Definition`
(the anti-pattern — property should never point straight at a Report Definition).

**How to check:**
```cypher
MATCH (p:Rule)-[:REFERENCES]->(dp:Rule) WHERE dp.rule_type='Rule-Declare-Pages' AND p.rule_type='Rule-Obj-Property'
RETURN p.environment, count(*)

MATCH (p:Rule)-[:REFERENCES]->(rd:Rule) WHERE p.rule_type='Rule-Obj-Property' AND rd.rule_type='Rule-Obj-Report-Definition'
RETURN p.environment, count(*)
```

**Evidence (CONFIRMED, already good practice in HRLife):** Property→DataPage edge counts:
HRLifeImp 17, OARCAPP 7, OWLM 5, ODPipeline 1. Named HRLife examples: `DailyDraw_InfoList` →
`D_FetchDailyDraw_InfoList`; `OptionalOutcomes`/`RequiredOutcomes`/`RequiredNotVisible` →
`D_HiringMatrixList`; `Standard_SWList`/`OtherSoftwareList`/`DepartmentSpecificList` →
`D_SoftwareList`; `TMPCaseInformation` → `D_FetchTMPCaseInformation`. The anti-pattern query
(property → Report Definition directly) returned **zero hits in every environment**.

**Migration implication:** No remediation needed for this specific sub-check — the property-level
DP association convention is already followed everywhere it's used in HRLife. Migration effort
here is inventory/mapping (confirming coverage across all ~835 HRLifeImp properties), not fixing
violations. Note the low edge count relative to total property inventory suggests most list
population actually happens via runtime activities/data transforms rather than declared
property-level sourcing — confirm per-screen during detailed design.

**xlsx tag-hint note (2026-07-17, re-verified):** the team's updated xlsx says check
`<pySourceType>`/`<pyDataPageReference>` on the property's Advanced tab. **Neither field exists**
in any of the three named example properties' XML (`DailyDraw_InfoList`, `OptionalOutcomes`,
`TMPCaseInformation`, all HRLifeImp). The real field is **`pyDataObject`** (e.g.
`D_FetchDailyDraw_InfoList`, `D_HiringMatrixList`, `D_FetchTMPCaseInformation`), with supporting
fields `pyDataObjectClass`, `pyDataRetrievalType` (`AUTOMATICNONREF`/`AUTOMATIC`),
`pyIsAssociation=true`, `pyTargetProperty`, and `pyDOParamList` — this is the literal field-level
form of the same relationship the graph `REFERENCES` edges already captured. Use `pyDataObject`,
not `pySourceType`/`pyDataPageReference`, when checking a property's XML directly.

---

### Pattern 5 — Labels should not be referenced directly within Views

**What to check:** Constellation `Rule-UI-View` → `pxViewMetadata` JSON `label` values (should be
`@L` tokens resolving through a `localeReference` to a `Rule-UI-Localization` rule) vs. HRLife
`Rule-HTML-Section` hardcoded caption/title strings (`pyTitle`, `pyLabel`, literal text).

**How to check:**
```cypher
MATCH (v:Rule {environment:'OWLM', rule_type:'Rule-UI-View'})-[:REFERENCES]->(l:Rule {rule_type:'Rule-UI-Localization'})
RETURN v.rule_name, v.class_name, l.rule_name LIMIT 15

MATCH (r:Rule {environment:'HRLifeImp', rule_type:'Rule-UI-Localization'}) RETURN count(r)
```
Then `pega_get_rule_xml` on a candidate view/section and grep for `@L`, `pyTitle`, `pyLabel`.

**Evidence (CONFIRMED violation, systemic):** OWLM's `AdGroups_AdGroupsList` view
(`PDS-Office-Data-ADGroups`) has a top-level `"localeReference":"@LR PDS-OFFICE-DATA-ADGROUPS!VIEW!ADGROUPS_ADGROUPSLIST"`
and every field label uses `@L` (`"label":"@L AdGroups List"`, `"label":"@L Description"`, etc.) —
zero literal captions. **HRLifeImp has zero `Rule-UI-Localization` rules at all**
(`MATCH...WHERE environment='HRLifeImp' AND rule_type='Rule-UI-Localization' RETURN count(r)` → 0
rows). `ChangeRequestSummaryInfo` (`PDS-FW-HRLIFEFW-WORK`) hardcodes
`<pyTitle>Request Summary</pyTitle>` and `<pyTitle>Team Member Information</pyTitle>` directly in
the section markup with zero localization references.

**Migration implication:** Every hardcoded caption across HRLifeImp's ~672 `Rule-HTML-Section`
rules must be extracted into new `Rule-UI-Localization`/field-value entries before Constellation
views can bind them via `@L` — there is no existing localization infrastructure to reuse. This is
100% net-new supporting infrastructure, not a refactor of existing rules.

---

### Pattern 6 — Top-level Page properties cannot be directly referenced in Views

**What to check:** Constellation views use context-relative `@P .Property` bindings scoped to the
view's own embedded class (never an absolute `pyWorkPage.*` path). HRLife sections reading a
property directly off `pyWorkPage` outside their own target embedded class are the violation.

**How to check:** `pega_get_rule_xml` on Constellation views confirms the `@P .` (leading-dot,
relative) pattern. For HRLife, grep fetched section/harness XML for the literal string
`pyWorkPage`.

**Evidence (INCONCLUSIVE — real tooling limitation, not absence of the problem):** Constellation
side confirmed: `AdGroups_AdGroupsList` uses `"referenceList":"@P .AdGroupsList"`,
`"value":"@P .name"` — all relative to the view's own class. On the HRLife side, six different
rules were checked (`CaseHeaderDetails`, `ChangeRequestSummaryInfo`,
`CaptureLegalEntityDetails`, `BulkProcessUpdateInfo`, `ClinicianLocationInfo`, harness `Confirm`)
and **none contained a literal `pyWorkPage` string**. **Root cause**: classic Section rule XML
stores field bindings as internal `pyInclude`/`pyValue` embed references resolved by the rules
engine at render time, not as a plain-text `pyWorkPage.X` path — so a literal grep is unlikely to
surface this violation even where it exists at runtime. Confirming it would need the
generated/rendered HTML or JS output, which this MCP toolset does not expose.

**Migration implication:** Do not report this pattern as either present or absent in HRLife based
on rule-XML search — it's provably not verifiable that way. Recommend a manual review pass in Dev
Studio/App Explorer on sections known to be reused across multiple parent contexts (the strongest
structural signal that a section might reach outside its own class), rather than a keyword search.

**Update (2026-07-16, live skill test on Flow Action `ClinicianInformation`): confirmed instance
found, method correction.** Searching Section XML for a literal `pyWorkPage` string, as originally
described above, is not where this pattern actually surfaces. A real, confirmed violation was found
instead in a **When rule's condition expression**: `IsProviderType_NonMed`
(`PDS-FW-HRLifeFW-Work-ContractRequest`) contains a literal `pyWorkPage.OfficeType` reference in
its expression. **Broaden the check**: fetch `Rule-Obj-When` XML for conditions driving
visibility/required-ness on a section (not just the section's own XML) and grep those for
`pyWorkPage` too — the anti-pattern can live in the condition logic a section merely references,
not only in the section's own field bindings.

**xlsx tag-hint note (2026-07-17, re-verified — false lead, do not add):** the team's updated xlsx
says check `<pyPagesAndClassesPage>`/`<pyPagesAndClassesClass>` in the section. Checked both the
`IsProviderType_NonMed` When rule (where it IS populated: `pyPagesAndClassesPage=pyWorkPage`,
`pyPagesAndClassesClass=PDS-FW-HRLifeFW-Work`) and the section itself, `ClinicianInformation_Existing_02`
(where it's completely empty, despite the section being the one referencing the violating When
rule). Cross-checked a second section, `ClinicianInformation_New` — also populated, again naming
the **top-level** Work page/class, the opposite of an embedded/joined page. This field is Pega's
generic rule-dependency tracker ("which pages/classes does this rule's expression touch"), not a
flattening/embedded-page flag — it does not correlate with the actual anti-pattern. **Do not use
`pyPagesAndClasses*` as a Pattern 6 signal**; keep the literal `pyWorkPage.<Property>` string
search inside `pyCondition`/`pyConditionValue1`/`pyWhenChange.pyUnmodifiedPath` as the only check.

---

### Pattern 7 — Flow Action buttons cannot be hidden dynamically; use validations/business rules instead

**What to check:** `Rule-Obj-FlowAction` → embedded `pyDefaultButton` (`Embed-Harness-Button`) →
`pyVisibleWhen`. Also check case-type-level `pySkipOrAllowType`/`pyWhenToSkip` as the actual gating
mechanism observed in practice.

**How to check:** `pega_get_rule_xml` directly on a Flow Action pzInsKey (not graph-queryable) —
prior "403" errors on this were caused by wrong app_name; using the correct environment string
resolves cleanly.

**Evidence (CORRECTED from an earlier assumption):** Fetched full XML for three Flow Actions —
HRLife `ClinicianInformation`, OARC `CollectProviderInfo`, OWLM `CollectRequestInformation` — all
three share an **identical schema**: `pyVisibleWhen` exists on every one, classic and
Constellation-native alike, but was **empty in every sampled instance**. The field is not a
classic-only construct and is not unreachable via XML — it's simply unused in this codebase.
Actual action-availability gating in these apps happens at the **case-type/stage level** via
`pySkipOrAllowType` (`when`/`always`/`never`) + `pyWhenToSkip`, confirmed on OWLM's
`PDS-OWLM-Work-ServiceRequest` (`pySkipOrAllowType>when`, `pyWhenToSkip>!pxIsEmail` gating the
"Initialize Request" process).

**Migration implication:** Where HRLife has a populated `pyVisibleWhen` on a Flow Action button,
it migrates conceptually as-is (the field exists in Constellation too) — but since real gating
logic in this codebase lives at the case/stage level, audit `pySkipOrAllowType`/`pyWhenToSkip`
conditions first, not individual buttons, when redesigning action availability.

---

### Pattern 8 — Data Pages with dynamic parameters referenced from Section Rules should be reviewed

**What to check:** `Rule-HTML-Section` → `REFERENCES` → `Rule-Declare-Pages`, optionally chained
(`Rule-Declare-Pages` → `REFERENCES` → another `Rule-Declare-Pages`).

**How to check:**
```cypher
MATCH (s:Rule {rule_type:'Rule-HTML-Section'})-[:REFERENCES]->(dp1:Rule {rule_type:'Rule-Declare-Pages'})-[:REFERENCES]->(dp2:Rule {rule_type:'Rule-Declare-Pages'})
WHERE s.environment='HRLifeImp' RETURN s.rule_name, dp1.rule_name, dp2.rule_name
```

**Evidence (CORRECTED — a previously-cited example was wrong, but the underlying pattern is
real):** `ClinicianInformation_Existing` (previously cited as a 2–3-deep chain) actually references
exactly **one** Data Page (`D_GetProviderCaseInfo`), which chains only to an Activity and a Report
Definition — no further DP chain. A genuine 2-level chain does exist elsewhere:
`pyWorkListCombinedWidget` → `D_pyUserWorkList` → `D_PortalContext`. Also confirmed a genuinely
parameterized Data Page: `D_GetOfficeLocationInfo`, taking an `OfficeType` STRING input parameter
(default `"Region"`).

**Migration implication:** Don't over-index migration effort on the ContractRequest/Clinician
sections for DP-chain risk specifically — the earlier example doesn't hold. Instead flag
worklist/portal-widget sections (`pyWorkListCombinedWidget` and siblings) and any section using
`D_GetOfficeLocationInfo`-style parameterized DPs for parameter-mapping review, since Constellation's
component-driven load model resolves parameters differently than a runtime activity chain.

---

### Pattern 9 — Repeating Dynamic Layouts should be replaced with embedded list properties, rendered via a View

**What to check:** Constellation `Rule-UI-View` → `pxViewType` (observed value: **`mobilelistpage`**,
not `multirecordlist` as sometimes assumed) bound to a Data Page via `referenceList`. HRLife
`Rule-HTML-Section` → `pyBodyType` (`REPEATING`/`SIMPLELAYOUT`/`INCLUDE`), `pySourceType=Property`,
`pyPageListProperty` / `pyUsingPage` pointing at a list property.

**How to check:** Enumerate `Rule-UI-View` candidates by name pattern (`list`/`grid`/`repeat`/`table`)
in OARCAPP/OWLM, and `Rule-HTML-Section` candidates by name in HRLifeImp; `pega_get_rule_xml` each
and grep the fields above.

**Evidence (CONFIRMED, strong on both sides):** OARCAPP `EmployeeRecordList`
(`OARC-POR-Work-EmployeeRecord`) and OWLM `CustomerReviewList` (`PDS-OWLM-Work-CustomerReview`) are
both `pxViewType=mobilelistpage` bound via `"referenceList":"D_<Name>List"`. HRLife confirmed
genuine repeats over list properties, not name coincidences: `CompensationList`
(`SIMPLELAYOUT`+`INCLUDE`, `pyUsingPage>.ContractCompensationList(<APPEND>)`), `LocationList`
(`REPEATING`, `pyPageListProperty=.LocationsList`), `RPLocationsList` (`INCLUDE`,
`.LocationsList`/`.ClockIDList`), `pyAssignmentListGadget` (`REPEATING`,
`.ProviderData.ProviderContractTerms`).

**Note on wording:** the pattern says RDLs should be **replaced with** embedded list properties + a
rendering View — stronger than "maps cleanly to Constellation's Table component." State the
redesign in those exact terms when this pattern hits, not as a pass-through.

**Migration implication:** `CompensationList`, `LocationList`, `RPLocationsList`, and
`pyAssignmentListGadget` are legitimate candidates to replace with a Constellation
`mobilelistpage` view bound directly to their existing list properties — one of the
strongest, most directly reusable conversion recipes in the whole catalog.

**xlsx tag-hint note (2026-07-17, re-verified — false lead, do not add):** the team's updated
xlsx says check `<pyIsRepeatLayoutGroup>` = true. Checked it on a confirmed-`REPEATING`
instance (`LocationList`, populated `pyPageListProperty=.LocationsList`) — `pyIsRepeatLayoutGroup`
is `false` there too, same as on every non-repeating section sampled. It's uncorrelated with the
actual anti-pattern (likely tracks an unused legacy "Repeat Layout Group" container type). Also
note `CompensationList` shows no `pyBodyType=REPEATING` in its own body at all — its repeat wiring
is delegated to a separately-included grid section (`ContractAbstractRDH`) via
`pyUsingPage=.ContractCompensationList(<APPEND>)`, so a naive `pyBodyType` grep on the wrapper
section alone can miss the real pattern-9 hit; follow `SUB_SECTION` includes before concluding a
section has no grid. **Do not use `pyIsRepeatLayoutGroup`**; keep `pyBodyType=REPEATING` +
populated `pyPageListProperty` as the sole check, including on included sections.

---

### Pattern 10 — All Action Sets should be reconfigured using the Form Settings available in the Flow Action rule

**What to check:** Whether `Rule-Obj-ActionSet` exists as a rule type at all, anywhere in the graph.

**How to check:**
```cypher
MATCH (r:Rule) WHERE r.rule_type='Rule-Obj-ActionSet' RETURN r.environment, count(*)
```

**Evidence (CONFIRMED moot):** Zero results across the entire graph (HRLifeImp, OARCAPP, OWLM,
ODPipeline, plus CCPM/Deal/DenovoImp/Office/TaxApplication/Monitoring/ODH). No embedded Action Set
config was found on sampled Flow Actions either — the `pyActionWhensList`/
`pxFARefreshSettingsOfView` structures present are unrelated When-rule/refresh-setting constructs.

**Migration implication:** This pattern is moot for this codebase — there is nothing to
reconfigure because standalone Action Set rules were never used. Skip this checklist line item
rather than spending audit time on it (a quick App Explorer spot-check is still reasonable before
fully closing it out, since embedded config could theoretically exist outside rule-type inventory).

**xlsx tag-hint note (2026-07-17, re-verified — corrects Pattern 10 AND the E13 extended
pattern):** the team's updated xlsx says check `<pyActionSets>` in section/flow-action XML — this
field **is real and populated** (unlike `Rule-Obj-ActionSet` the rule type, which is confirmed
absent). Fetched `ClinicianInformation_New`'s autocomplete control and found real
`pyActionSets`/`Embed-Control-Mode-ActionSets` rows: `pyEvents=[change]` →
`pyActions=[postValue, refresh(pyPreDataTransform.pyName=SetExisitingClinicianInfo, target=thisSection)]`,
and a second row for `pyEvents=[down/keyboard]` with a similar chain. **This is the same
structure previously written up under extended pattern E13 as "`pyBehaviors` action chains" —
that field name was wrong.** `pyBehaviors` (nested under `pySimpleLayoutProps > pyEditBehaviors >
pyBehaviors`) was checked across 22 occurrences in this same section and was **empty in every
single one**; it is a separate, unrelated, consistently-empty field, likely confused with
`pyActionSets` because each `pyActionSets` row uses `pxObjClass=Embed-Control-Mode-Behaviors`
internally (a row-class name, not the field name). **Corrected check for both Pattern 10 and E13
going forward: `pyActionSets` → `pyEvents`/`pyActions`, looking for a populated `refresh` action
or non-empty `pyPreDataTransform`. Do not use `pyBehaviors` as a detection signal — it has never
been observed populated.** Pattern 10's "Action Sets → Flow Action Form Settings" framing and
E13's "activities/DTs invoked from UI events" framing describe the same underlying XML structure;
treat a `pyActionSets` hit as evidence for both, not two independent findings.

---

### Pattern 11 — The Autocomplete control in Constellation supports displaying only a single property

**What to check:** Constellation `Rule-UI-View` `AutoComplete` component config
(`pxViewMetadata` → `type:"AutoComplete"`, one `datasource`/`value` pair). HRLife classic control:
`Embed-Control-Mode-ListDefinition` with a `pyAdditionalFields` repeating list, each row carrying
its own `pyDisplayProperty`/`pyPropertyTarget`/`pyColumnWidth`.

**How to check:** `pega_get_rule_xml` on a candidate Constellation view and a candidate HRLife
section control, grep the fields above.

**Evidence (CONFIRMED, both sides):** OWLM `AddLocationWithMultipleProviders_AdditionStaffList`
(`PDS-OWLM-Work-ServiceRequest`) — exactly one `datasource` (`@ASSOCIATED .StaffIdentifier`) and one
`value` (`@P .StaffIdentifier`). HRLife `ProviderSearchFields` (`PDS-FW-HRLifeFW-Work`) —
`pyFormat=pxAutoComplete` backed by report definition `FetchTeamMemberLifeCycleInfo`, with a
`pyAdditionalFields` list carrying at least 3–4 rows, each with its own `pyDisplayProperty`
(`.ClockId`, `.ContactId`, `.ClinicianPersonalEmail`→`.PDSUserPersonalMailID`) and its
own `pyColumnWidth`/`pyAlignment` — a genuine multi-column autocomplete, structurally impossible to
express in Constellation's single-datasource `AutoComplete` component.

**Migration implication:** Any HRLife autocomplete relying on `pyAdditionalFields` multi-column
display (e.g. `ProviderSearchFields`, `TeamMemberSearchFields`) loses the secondary columns on
migration — redesign via a data-page column surfaced elsewhere, or a `SimpleTableSelect`-style
typeahead-into-table pattern (see Pattern 12).

---

### Pattern 12 — Multi-select functionality should be implemented using the Combo Box control

**What to check:** `Rule-UI-View` `pxViewMetadata` for `"type":"SimpleTableSelect"` +
`"selectionMode":"multi"`.

**Evidence (CONFIRMED — the corrected mechanism, not the stated one):** OWLM
`EditLanguagesInformation_Languages` (`PDS-Office-Data-Languages`) and
`EditServicesInformation_ServicesList` (`PDS-Office-Data-OfficeServices`) both use
`"mode":"multiselect"` / `{"type":"SimpleTableSelect","config":{...,"selectionMode":"multi",...}}`.

**Migration implication:** Target HRLife multi-select fields (multi-value pick lists,
languages/services-style attributes) at a `SimpleTableSelect` (`mode: multiselect`)
data-reference view, not a Combo Box — this is proven out twice in OWLM and the "Combo Box"
guidance appears to not reflect the actually-shipped Constellation control. Until the team
re-ratifies this pattern's wording, cite both the original statement and this correction when it
fires. See `patterns-meta.md` §Precedent grounding for the correction details.
