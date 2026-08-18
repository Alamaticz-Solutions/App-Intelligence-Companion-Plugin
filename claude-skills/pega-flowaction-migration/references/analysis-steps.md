# Analysis Steps 3–8 — full definitions

These were formerly defined in the base heritage-modernization skill, which has been **retired**;
this file is now the only definition. Step numbers are kept so the team's vocabulary and prior
findings stay valid. Definitions were confirmed against the deterministic pipeline
(`constellation-migration/`) on 2026-07-16. All work here is done by agents reasoning over MCP
tool output — no scripts (see SKILL.md hard rule).

## Step 3 — Field extraction and grouping (per section)

1. Enumerate bound field cells per the binding rules in `xml-mechanics.md` (FIELD cells,
   direct-child `pyValue`, template/system exclusions listed not dropped).
2. Group occurrences by **property path**, case-insensitively. One property bound in several
   cells is ONE field with several occurrences.
3. Per occurrence record: control (`pyFormat`/`pyControl`), read-only, required + requiredWhen
   (see the conditional-required encoding note in xml-mechanics.md), visibleWhen, anchored flag,
   and the full source record (primary + all sources seen).
4. Derive per field: leaf name, context class (embedded page path for multi-segment paths, else
   the section class), whether any occurrence uses a list control
   (`pxDropdown, pxAutoComplete, pxRadioButtons, pxMultiSelect, pxCheckboxList, pxSmartPrompt`),
   named data pages / report definitions, and all source params (with by-reference flags).
5. A source is only meaningful when the control is a picklist — plain text/date/number cells
   often carry a stray template `pyListSource=associated` that is NOT a real field source.

## Step 4 — Property rule analysis (per property)

Fetch the property's own `Rule-Obj-Property` (chain-walk the class per the procedure in
SKILL.md role 1 when the candidate class doesn't define it). Read, per the vocabulary in
xml-mechanics.md: mode (`PageGroup`/`ValueGroup` → Step 8d), type, default control, and the
**property-level source (Table Type)**.

**Key signal:** if the property itself already carries a LocalList / DataPage /
ReportDefinition source, the field is Constellation-ready (REUSE_AS_IS) independent of any
cell-level override — this is pattern #4 satisfied. Record the property-level source name.

## Step 5 — App-wide conflict scan (per list-sourced property / shared data page)

A reuse/create decision for a list-sourced property **cannot be made from one section in
isolation**. Procedure:

1. Find every section in the entire application referencing the property (graph inbound
   `REFERENCES`, deduped to one row per section name, filtered to `Rule-HTML-Section`).
2. For each referencing section, read how it sources the property: source kind + name + the
   **set of param names** used.
3. Classify the cross-section pattern (closed enum):
   - `NO_CELL_SOURCE` — no section sources it at the cell level (property-level only).
   - `NO_CONFLICT` — one source, identical params everywhere.
   - `PARAM_VARIANCE` — one source, differing params across sections.
   - `SOURCE_VARIANCE` — different sources across sections.
4. Decision upgrade:
   - `NO_CONFLICT` → **REUSE_ADD_FIELD_SOURCE** ("configure the source once on the field" —
     property-level association, pattern #4).
   - `PARAM_VARIANCE` / `SOURCE_VARIANCE` → stays **NEEDS_REVIEW**, tagged
     `CONSOLIDATE_OR_SPLIT` with the full evidence (section, source, params per usage). The
     judgment call: variance that is runtime-derivable (role/stage/case-type) → **CONSOLIDATE**
     via a unified/wrapper data page; genuinely different data → **CREATE_NEW** (split
     properties).
5. Report **exact counts and section lists, never estimates**. Large fan-out (a prior run found
   one shared DP used by 35 sections across 7+ unrelated flows) → `NEEDS_REVIEW` as its own
   follow-up item.
6. **Provisional vs Final State Machine Transitions:** Any per-section decision on a shared list-sourced item starts as `Provisional` (marked as `CELL_LEVEL_SOURCE_NEEDS_APPWIDE`). The orchestrator monitors the asynchronous Conflict Scan Agent to resolve the decision state:
   - When scan returns `NO_CONFLICT` → Upgrade decision to `REUSE_ADD_FIELD_SOURCE` and mark `Final`.
   - When scan returns `PARAM_VARIANCE` or `SOURCE_VARIANCE` → Set decision to `CONSOLIDATE_OR_SPLIT` under `NEEDS_REVIEW` and mark `Final` (indicating a finalized conflict determination).
   Dependent sections must update their status from `Provisional` to match these finalized outcomes.

## Step 6 — The five-way decision (per field)

Closed enum: `REUSE_AS_IS` | `REUSE_ADD_FIELD_SOURCE` | `CONSOLIDATE` | `CREATE_NEW` |
`NEEDS_REVIEW`. Never emit free text for a decision. Apply the cases **in order**:

1. **Not list-sourced at all** (no list control, no cell source, no associated source) →
   `REUSE_AS_IS`, with a plain config (Constellation type hint + control).
2. **Within-section source variance** (two different named sources for the same property inside
   one section) → `NEEDS_REVIEW` + `SOURCE_VARIANCE_WITHIN_SECTION`. Constellation allows
   exactly ONE source per field — consolidate (unified/wrapper DP) or split (CREATE_NEW);
   whether the variance is runtime-derivable is judgment.
3. **Associated (property-level) source, no competing cell source:**
   - Step 4 confirmed the property carries a LocalList/DataPage/ReportDefinition source →
     `REUSE_AS_IS`, citing the property-level source.
   - Property rule not read or shows no property-level source → `NEEDS_REVIEW` +
     `ASSOCIATED_SOURCE_UNVERIFIED`.
4. **List control with no resolvable source** → `NEEDS_REVIEW` + `LIST_CONTROL_NO_SOURCE`. A
   dropdown with no detectable source may be a parse miss OR genuinely source-less — it must
   never pass silently as "no source".
5. **Single cell-level source** → `NEEDS_REVIEW` + `CELL_LEVEL_SOURCE_NEEDS_APPWIDE`, resolved
   by Step 5 (NO_CONFLICT → `REUSE_ADD_FIELD_SOURCE`; variance → `CONSOLIDATE_OR_SPLIT`).

Constellation type hints: Text/String/Identifier → Text; Integer/Double/Decimal → Number;
DateTime → DateTime; Date → Date; TimeOfDay → Time; TrueFalse → Boolean.

### Step 6.6 — Page / PageList / group-mode properties

- Resolve the embedded/row class first: for a grid row, from the grid's
  `pyPageListPropertyClass` (never the section class or the cell's SmartPromptClass).
- Decide the Constellation model: **Embedded Data** when the rows are case-owned (created and
  edited within the case), **Data Reference** (single- or multi-record) when rows are selected
  from a source. Pattern #9 applies to the rendering (embedded list property + a View), patterns
  #11/#12/E14 to the selection experience.
- `PageGroup` / `ValueGroup` mode → Step 8d: REDESIGN (unsupported in Constellation UI) —
  normally convert to a page list keyed by an explicit property.

### Verify-flag codes (closed list — a later agent/reducer branches on these)

`SOURCE_VARIANCE_WITHIN_SECTION`, `CELL_LEVEL_SOURCE_NEEDS_APPWIDE`, `LIST_CONTROL_NO_SOURCE`,
`MULTI_SOURCE_IN_CELL`, `UNKNOWN_SOURCE_KIND`, `PROPERTY_RULE_NOT_READ`,
`ASSOCIATED_SOURCE_UNVERIFIED`, `CUSTOM_SECTION_UNPARSEABLE`, `DELEGATED_TO_INCLUDED_SECTION`,
`NON_ANCHORED_BINDING`, `CONSOLIDATE_OR_SPLIT`, `NON_STANDARD_CONTROL` (value set via a
non-bound-control mechanism — e.g. click-to-run-transform icon tiles instead of a standard
control — with no direct Constellation equivalent; added after a real run hit this case and the
code did not yet exist in this list — this closed list is authoritative and mirrors
`work-item-manifest-schema.json`'s `fields[].verify_flags[].code` enum exactly; if a new code is
ever needed, add it here **and** in the schema in the same change, never one without the other).
Every flag carries `detail` (what was seen, citing tags/values) and `why` (why it needs review).

## Step 8 — Constellation readiness checklist (per flow-action tree, rolled up)

- **8a — Data pages**: every distinct DP (cell-level + property-level, deduped). Required
  change per patterns #1/#2: *"Mark as API (Allow query using a JSON object) + check 'Allow
  querying any column'"*; REST-connector-sourced DPs must be Query-enabled. Record
  `pyIsQueryable`, status, parameters, structure, and the exact fix per DP.
- **8b — Report definitions**: per RD, flatten check — joins (`pyJoinClass`), real sub-reports
  (`pySubReportName` non-empty), index access (`pyUseIndex` / `-Index-` class). Any hit →
  verdict `FLATTEN` (denormalize into one queryable source) or `ASSOCIATION` (model the joined
  class as an association), naming the specific joined class. No hits → "flat — ok as-is".
  Check **every** conditional source when a DP picks between RDs by parameter.
- **8c — Rule-type manifest**: the deduped list of actively-used rules by type for the tree
  (sections, properties, DPs, RDs, Whens, Field Values, transforms, activities, validates,
  controls) — the migration bill of materials.
- **8d — Page/Value Group properties**: every property whose mode is `PageGroup` or
  `ValueGroup` → `REDESIGN — unsupported in Constellation UI`, with the proposed replacement.
- **8e — Picklist/radio verdicts**: per list-controlled field — `reusable` when the property
  carries its own source (Step 4) or the app-wide decision is `REUSE_ADD_FIELD_SOURCE`;
  `redesign-source` when the decision is `NEEDS_REVIEW` for source variance.

## Reconciliation invariants (Reconciliation Agent — verify by reasoning, no scripts)

- **(A) XML field coverage** — independently recount bound field cells from the raw XML (the
  minimal invariant: FIELD cell + `.`-prefixed pyValue, minus `.pyTemplate*`) and confirm every
  one appears in the rolled-up findings; every miss is named, not summarized.
- **(B) Graph upper-bound** — every graph-referenced property NOT in the findings must be
  explained as one of: page container segment, condition-only reference, by-reference source
  parameter, delegated to an included section, or `px`/`py`/`pz` system property. Exclusions are
  listed, never silently dropped.
- **(C) Silent-source guard** — every picklist field has a resolved source or an explicit
  verify flag.
- **(D) UI-behavior closure** — every action chain's referenced logic rule (When / DT /
  activity) and every refresh-target section is either analyzed in the registry or listed under
  unresolved items. Match names case-insensitively throughout.
