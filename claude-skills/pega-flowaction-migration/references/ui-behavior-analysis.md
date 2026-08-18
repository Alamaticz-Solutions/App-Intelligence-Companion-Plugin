# UI-Behavior Analysis — action sets, events, conditions, selection mappings

Merged into this skill 2026-07-16 from the section-level analysis spec. Run by every
**Section-Analysis Agent** for its section; the **orchestrator** applies the same lens to the
Flow Action rule itself (buttons, Form Settings, wired validation/transform — patterns #7, #10)
in the final wave. All XML tag names below are defined and evidence-anchored in
`xml-mechanics.md` — read that first.

The goal is never to describe the UI mechanics for their own sake: it is to name the **business
behavior** the mechanics implement, so the Constellation design can preserve the behavior while
discarding the mechanism.

## A. What to extract

1. **Container/layout behavior** — per layout: visibility / read-only / disabled conditions,
   deferred load, refresh conditions, pre-processing activity or data transform (**active only
   when the name is non-empty**), page context / using page, custom CSS classes, inline styles,
   fixed dimensions (E19 evidence).
2. **Per-field behavior** — required + requiredWhen (per the conditional-required encoding),
   visibleWhen, readOnlyWhen/disabled, helper text, free-form-input flags on lookups.
3. **Action chains** — normalize every `pyActionSets` rowdata into:
   `{control, boundProperty, event, keyCode?, chain: [{action, target?, targetSection?,
   dataTransform?, activity?, params?, conditions?}], triggers: [events sharing the chain]}`.
   Chain order = rowdata index order. The same chain under `change` and `keyboard/down` is one
   chain with two triggers.
4. **Selection mappings** — for every list-sourced selection control: source (DP/RD + params),
   value property, display property, search columns (`pyUseForSearch`), visible columns
   (`pyShow`), and **every `pySetValueOnSelect`/`pyPropertyTarget` copy**, explicitly separating
   visible copies from hidden copies (`pyShow=false`). Copies of `.pyID`, `.pxObjClass`,
   `.pzInsKey` are always pattern E14 evidence.
5. **Included-section context** — using page / page context / params / conditional or dynamic
   includes (property-driven names).
6. **New dependencies** — every When named in a condition, every DT/activity named in an action,
   every refresh-target section, every custom control: if not already in the registry, report it
   to the discovered-dependency queue. Do NOT analyze it yourself.

## B. Traditional action → Constellation treatment

Constellation has no per-control event/action model: views are rendered declaratively by the
form engine, and processing happens at defined boundaries (data page load, assignment submit,
process step, calculated field). Map every chain:

| Traditional action | Constellation treatment | Pattern |
|---|---|---|
| `postValue` | Remove — field state is already reactive in the Constellation form engine | #10 |
| `refresh` (thisSection) | Replace with declarative rendering: visibility/disabled conditions on case data, calculated fields | #10 (+E13 if a pre-DT is attached) |
| `refresh` (otherSection) | The dependency between views must become data-driven; redesign the dependent view to render from case data that is already correct | #10 (+E13 if a pre-DT is attached) |
| Pre-refresh data transform | Relocate: data-page load logic, calculated field, or assignment/process boundary | E13 |
| `RunActivity` from a control | Relocate to process logic (post-processing, case action, service/data page) | E13 |
| Set value / selection copies | Single-record Data Reference + mapping at a process boundary; calculated fields for derivations | E14 |
| Launch local action | Constellation optional action (case-wide or assignment-level) or an explicit process step | E20 |
| Run script / custom JS | Remove, or approved custom DX component when the business behavior genuinely requires it | E15 |
| Keyboard/hover/double-click triggers (`pyKeyCode` non-empty) | Remove unless a supported accessibility pattern exists | E17 |
| Open assignment / navigate | Case-appropriate navigation; verify the specific capability against the pinned target version |  |

Do not assume a Traditional autocomplete maps directly to a Constellation combo box — choose
between Picklist, single-record Data Reference, multi-record Data Reference, Embedded Data with
a query-backed table, or a dedicated search step (see `patterns-1-12.md` #11/#12 and `patterns-extended.md` E14).

## C. Condition analysis

For every condition encountered (cell, container, action):

1. Record where it's used (visibility / required / read-only / disabled / action gate) and
   whether it's negated (`!Name`).
2. Named When rules go to a Logic-Rule agent (via the queue if new). Inline expressions are
   analyzed in place.
3. Classify (closed taxonomy): `CASE_DATA` (simple case-data logic) | `DATA_PAGE_DEPENDENT` |
   `PAGE_EXISTENCE` | `UI_CONTEXT` (harness/portal/action-name dependent) |
   `REQUESTOR_OR_THREAD` | `FUNCTION_BASED` | `ACTIVITY_DEPENDENT`.
4. `UI_CONTEXT`, `REQUESTOR_OR_THREAD`, `PAGE_EXISTENCE` → pattern E16: the condition must be
   rewritten against case data. Triggers include references to `pyDisplayHarness`, `pyAction`
   parameters, `pxRequestor`, thread/temporary named pages, page-existence checks, portal or
   harness names, DOM/client state.
5. `CASE_DATA` conditions usually translate directly to Constellation visibility/required
   conditions — say so, citing the properties involved.

## D. Feature classification (7-way, closed)

Applied to **features/behaviors** (an action chain, a condition, a control pattern, a layout
device). Fields/properties keep the 5-way decision from `analysis-steps.md` — the two enums
coexist and both appear in the manifest. Never invent other values.

`SUPPORTED_AS_IS` | `SUPPORTED_WITH_RECONFIGURATION` | `SUPPORTED_WITH_DATA_MODEL_CHANGE` |
`SUPPORTED_WITH_PROCESS_REDESIGN` | `REQUIRES_CUSTOM_DX_COMPONENT` |
`NOT_SUPPORTED_REMOVE_OR_REPLACE` | `UNKNOWN_REQUIRES_DEPENDENCY_ANALYSIS`

Every classified feature carries: evidence (exact tags/values), business impact, recommended
target design, migration effort (`Low`/`Medium`/`High`), and the dependent rules that must be
(or were) analyzed. "Represented differently in Constellation" is NOT
`NOT_SUPPORTED_REMOVE_OR_REPLACE` — reserve that for behaviors whose business requirement should
not be preserved.

## E. Logic-rule briefs (for the Logic-Rule Agent)

- **When rule** — fetch it; state the exact condition, the properties and pages it reads;
  classify per §C; state Constellation suitability and the rewrite if UI-context-dependent.
- **Data Transform** — list source and target properties, page contexts, loops, data-page
  references, functions, side effects; state why the UI invokes it (from the calling context
  provided in your task) and **where the logic must live in Constellation**: data-page load,
  calculated field, assignment submit, or process step. A DT that exists only to copy
  selection scalars is superseded by a Data Reference (E14) — say so instead of relocating it.
- **Activity** — step-by-step: methods, page usage, parameters, database operations and
  commits, UI-coupled methods (Show-*, HTML streams); state the refactor destination
  (process step / case action / service) and anything that cannot move (flag it).
- **Validate / Edit-Validate** — what it checks, client vs server; Constellation placement:
  Flow Action validation, field-level validation, or process logic. Note pattern #7: button
  availability is controlled through validations/business rules, not dynamic hiding.
- **Custom control (Rule-HTML-Property) / HTML fragment / script** — retrieve it and its
  referenced fragments/JS/CSS/functions; describe the user-visible behavior; determine whether
  a standard Constellation component covers it; custom DX component only when proven
  insufficient (E15), and name exactly which behavior forces it.

## F. Evidence and quality rules

- **Empty = inactive**: an empty `pyActivity`, an empty `pyPreDataTransform/pyName`, an empty
  refresh condition is NOT configuration. Never report one as active.
- **Default ≠ configured**: a tag appearing with its generated default on every section is
  metadata, not intent. Only report intentionally configured behavior as behavior.
- **Negations**: resolve `!WhenName` by analyzing `WhenName` and inverting; record the negation
  in the finding.
- **Facts vs inferences**: findings cite the exact tag/value read. Inferences are marked
  "likely / appears to" and name the exact rule whose retrieval would confirm them.
- **Consistency flags**: genuinely contradictory configuration (not the normal
  required+requiredWhen encoding) is flagged, not silently resolved.
- **Business framing**: every chain and mapping ends with one sentence of business behavior
  ("the user searches by Clock ID or email; selecting a provider fills the clinician's details
  and reveals the details panel") — that sentence is what the target design must preserve.

## G. Worked example (real, from HRLifeImp `ClinicianInformation_Existing`)

The section binds an autocomplete to `.ProviderData.ClinicianInfo.ClockId`, sourced by data page
`D_GetProviderCaseInfo` (result class `PDS-ProviderCase`). Search columns: `ClockId`,
`PersonalEmailAddress`; visible result columns: `ClockId`, `ProviderName`,
`PersonalEmailAddress`. On selection it copies six values (`pySetValueOnSelect=true`):
`ProviderName` and `PersonalEmailAddress` to `.ProviderData.ClinicianInfo.*`, and **hidden**
(`pyShow=false`) copies of `.pyID` → `CaseID`, `.pxObjClass` → `ObjClass`, `.pzInsKey` →
`CaseKey` (E14). Free-form input is allowed (`pyAllowFreeFormInput=true` — E18). Required is
condition-based (`pyRequiredWhen=!IsClinicianInfoSelectedExisting_CO`). Its `pyActionSets` chain
fires on `change` and again on `keyboard/down` (E17): `postValue`, then `refresh` of
`thisSection` with pre-DT `SetExisitingClinicianInfo` (E13), then `refresh` of `otherSection`
`ClinicianInformation_Existing_02` (an implicit dependency) with the same pre-DT.

**Target design**: a single-record Clinician/Provider **Data Reference** (selection by Clock ID
with display of name/email per #11's single-display constraint — verify against the pinned
target version), case-owned scalar copies replaced by the reference plus mapping at the
assignment/process boundary; the dependent view renders declaratively from case data; the
keyboard trigger and refresh chain are dropped; free-form entry is replaced by an explicit
"not found → create new" path if the business requires it.

## H. Section-Analysis output contract (UI-behavior portion)

Return, structured: `actionChains[]` (normalized per §A.3, each with treatment + pattern +
7-way classification), `conditions[]` (per §C, with taxonomy + classification + action),
`listSources[]` (per §A.4, every pyPropertyTarget listed, hidden copies marked),
`includedContext[]`, `newDependencies[]` (`{type, class, name, foundWhere, why}`), and
`riskNotes[]`. Plus the pattern-synthesis portion defined in SKILL.md role 5.
