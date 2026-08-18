# Agent Roles, Concurrency, and Dispatch — multi-agent reference

Extracted from SKILL.md to keep the main skill file focused on orchestration flow (Phase 0/1).
Read by the orchestrator when planning wave dispatch; individual agents read only their own
role definition plus the reference files named in their input spec.

## Agent roles (purpose-built, not clones)

**1. Property-Resolution Agent** (Wave 1, several in parallel, one batch of properties each)
- Input from orchestrator: a batch of property nodes from the tree, each with its cell context
  (SmartPromptClass, control, binding section) already known from Phase 1; paths to
  `references/analysis-steps.md`, `references/xml-mechanics.md`, `references/patterns-1-12.md`,
  `references/patterns-13-23.md`, `references/patterns-meta.md`.
- Does Step 4 (own `Rule-Obj-Property` fetch: `pyPropertyMode`, exact `PageGroup`/`ValueGroup`
  check per Step 8d, `pyStringType`, default control, property-level source) and the class
  chain-walk procedure below when the cell's class doesn't have a matching property.
- **Class resolution procedure (exact — there is no `Class`/`INHERITS_FROM` graph shortcut,
  confirmed absent by direct query)**:
  1. Check `classInheritanceMap` in the registry. If the candidate class's parent chain is cached, use it directly and skip steps 2–4.
  2. Query the graph for the candidate class's own `Rule-Obj-Class` node.
  3. If absent, fall back to `pega_get_rule_version` (`rule_type=Rule-Obj-Class`) — hits live
     Pega and resolves classes the graph hasn't indexed.
  4. Fetch that class's XML, read `<pyDerivesFrom>` — the single immediate parent. Repeat with the parent until the chain runs out, caching the resolved chain in `classInheritanceMap`.
  5. For a property inside a grid row, start from the grid's `pyPageListPropertyClass` (the row's
     own class), not the parent section's class or the cell's `SmartPromptClass` — verified
     directly to give the wrong answer when skipped.
  6. Chain runs out with no match → `NEEDS_REVIEW`, cite the exact chain and candidates checked.
     Two unrelated properties sharing an unusual ancestor class is a signal worth investigating
     (possible embedded-page relationship) but not proof by itself.
- Applies Step 6 (5-way decision), including Step 6.6 for embedded page/page-list properties.
- **Output contract**: per property — `(class, name)`, resolved chain (if walked), type/mode,
  default control, property-level source, decision, Constellation config, whether list-sourced
  (flag for the Conflict-Scan Agent if so), pattern hits by number, reason citing the exact
  tag/value read.

**2. Data-Page/Report-Definition Readiness Agent** (Wave 1, parallel, one batch of DPs each)
- Input: every data page found in Phase 1 plus any surfaced by Wave-1 property agents; reference
  file paths as above.
- Step 8a: fetch the DP's own rule (`pega_get_rule_version` fallback if not graph-indexed);
  `pyIsQueryable`, Status, parameters, structure; state the exact fix (patterns #1/#2).
- Step 8b: if RD-sourced, fetch the RD and check joins/sub-reports/index access; flag `FLATTEN`
  or `ASSOCIATION` with the specific joined class named. Check every conditional source if the DP
  has more than one (confirmed to happen — one DP picked between two RDs by a parameter).
- **Output contract**: per DP — name, queryable status, parameters, RD source(s) checked, flatten
  verdict per source, exact remediation steps.

**3. Grid/Nested-Grid Specialist Agent** (Wave 1 or 2 depending on tree shape, parallel by grid)
- Input: every grid node from Phase 1 (page-list property, class, columns, nesting flag, header
  caption); reference file paths.
- Confirms the page-list property's own Step 4 (coordinate with the Property-Resolution Agent
  via the registry — don't re-derive if already resolved there) and Step 8d.
- Documents full column list (bound property + control per column), confirms nesting structure,
  and the header-caption pattern-#5 check. Grid-level pattern #9 finding: state the redesign as
  "replace the RDL with an embedded list property + a View rendering the list" — the xlsx
  wording — not as a pass-through to a Table component.
- If this "grid" is actually an outer wrapper with its own separate page-list property nested
  around an inner grid: documents both levels explicitly, restating the inner grid's column list
  here too so a reader stopping at the outer level still sees the complete picture.
- **Output contract**: grid name, page-list property + class, nesting relationship (none / outer
  / inner, with the other level named), full column list, header-caption finding, row-level
  action sets (hand off to the owning Section-Analysis agent via the registry), pattern hits.

**4. App-Wide Conflict-Scan Agent** (dispatched whenever a Wave-1 or Wave-2 agent flags a
list-sourced property or shared data page — runs alongside later waves, not blocking them)
- Input: one property or data page pzinskey flagged as list-sourced/shared; reference file paths.
- Runs the Step 5 scan: every OTHER section in the *entire application* (not just this tree's
  scope) referencing the same property or DP; classify the cross-section pattern per
  `references/analysis-steps.md` (NO_CELL_SOURCE / NO_CONFLICT / PARAM_VARIANCE /
  SOURCE_VARIANCE). Returns an exact count and section list, never an estimate — if the count is
  large (confirmed: one shared DP in a prior run was used by 35 sections across 7+ unrelated
  business flows), state that exactly and mark the item `NEEDS_REVIEW` as its own follow-up
  rather than resolving it from partial information.
- **Output contract**: property/DP identity, exact reference count, section-name sample,
  cross-section pattern. The orchestrator maps this output to update the registry state machine (upgrading Provisional to Final `REUSE_ADD_FIELD_SOURCE` on `NO_CONFLICT`, or flagging `CONSOLIDATE_OR_SPLIT` on conflicts).

**5. Section-Analysis Agent** (Wave 2+, parallel within a wave, one section each)
- Input from orchestrator: the section's identity and Phase-1 node data, **plus the full
  structured output of every child node already completed**, pasted inline — this is the "carry
  context upward" contract; paths to `references/ui-behavior-analysis.md`,
  `references/xml-mechanics.md`, `references/patterns-1-12.md`, `references/patterns-13-23.md`, `references/patterns-extended.md`.
- Fetches the section's own XML itself (`pega_get_rule_xml`) — the deep read is this agent's
  job, not a paste from Phase 1.
- Does three things:
  a. **Pattern synthesis** — checks the section against every applicable pattern (1–12 and
     E13–E20), citing numbers and exact evidence. States explicitly what's inherited from each
     child ("inherits pattern #5 from `EffectiveDateLabel`, no new issue at this level") rather
     than re-deriving it. Confirms grid/nesting and stale-View results already established.
  b. **UI-behavior analysis** — the full procedure in `references/ui-behavior-analysis.md`:
     normalize every action set into an action chain, analyze conditions, extract list-source
     selection mappings (every `pyPropertyTarget`), map each behavior to its Constellation
     treatment with a 7-way feature classification.
  c. **Dependency discovery** — reports any logic rule or refresh-target section not already in
     the registry to the discovered-dependency queue. It does NOT analyze those rules itself.
- **Output contract**: section name/class, pattern hits (own + inherited, clearly separated),
  decision rollup for its own direct bindings, `actionChains[]`, `conditions[]`,
  `listSources[]`, `newDependencies[]`, one-line pointers to each child's full detail (child
  detail lives in the registry, not repeated here).

**6. Logic-Rule Agent** (Wave 1 for tree-discovered rules; on-demand for queued discoveries;
parallel, one small batch each)
- Input: a batch of When / Field Value / Data Transform / Activity / Validate / custom-control
  rules, each with the exact context that references it (section, control, event, action);
  paths to `references/ui-behavior-analysis.md` (§Logic-rule briefs), `references/xml-mechanics.md`,
  `references/patterns-1-12.md`, `references/patterns-13-23.md`.
- Fetches each rule's XML and follows the per-type brief: what the rule does, what it touches,
  whether it is UI-context dependent, and **where its logic must live in Constellation** (data
  page load / assignment submit / process step / calculated field / validation / remove).
- **Output contract**: per rule — identity, type, plain-English behavior, properties/pages
  touched, UI-context classification, 7-way feature classification, Constellation destination,
  pattern hits, evidence citations.

**7. Reconciliation Agent** (single, dispatched once, after every wave is complete)
- Input: the complete registry; paths to `references/analysis-steps.md` (§Reconciliation
  invariants) and `references/output-contracts.md`.
- Groups every property by `(class, name)` identity across the whole tree; where a property
  appears under multiple sections, confirms one authoritative decision (Final if no conflict
  anywhere and Step 5 is complete; otherwise Provisional/NEEDS_REVIEW with the specific reason).
- Verifies the reconciliation invariants by reasoning (no scripts): every XML-bound field
  accounted for; every graph-only property explained; every picklist has a resolved source or an
  explicit flag; every action chain's referenced logic rule analyzed or listed as unresolved.
- Assembles the pattern-hit tally, the readiness-checklist rollup (8a–8e), and the overall
  migration-strategy summary (what's clean reuse, what needs redesign, what's blocked, how the
  app-wide-shared items should be sequenced separately from this flow action's own work).
- Builds `workItems[]`: for every rule that must be created, copied+updated, or updated, resolves
  `authoringSkill` by checking the target rule type against `methodology-rule-authoring`'s
  "Supported create/update rule types" table (via `get-skill`/`list-skills` on the plugin, not
  from memory — that table changes across plugin versions). Type covered → `authoringSkill` set,
  operation `create`/`copy-then-update`/`update`. Type absent from the table → `operation: manual`
  with `manualReason` naming the gap. **Never specifies a field-level payload** — that's Phase 4's
  job using the named skill's own schema.
- **Writes and validates `<FlowAction>_migration_manifest.json`** — constructs the manifest JSON
  per the schema in `references/output-contracts.md` and validates it against
  `references/work-item-manifest-schema.json`. If schema errors are present, does not output the
  file and reports validation failures back to the orchestrator.
- This file is the entire input to Phase 4 (Build handoff) — there is no separate build-agent
  contract or document-writing step; the manifest itself is the deliverable.

**9. Case-Type Reconciliation Agent** (Case Type runs only — single, dispatched once, after every
selected Flow Action's own Phase 0-3 deep-dive has completed; one layer above the per-FA
Reconciliation Agent, does not replace it)
- Input: every selected Flow Action's completed, unmodified per-FA manifest (each already produced
  by its own Reconciliation Agent per role 7 above); the Phase 0a inventory; paths to
  `references/output-contracts.md` §Case-Type outputs.
- Runs the **`sharedItems` scan**: groups every `(class, name)` identity appearing in more than
  one Flow Action's `rules[]`/`fields[]` and compares decisions across them. Same decision
  everywhere → `SAME_DECISION`. Different decisions → `CONFLICTING_DECISION`, `NEEDS_REVIEW`, both
  sides cited. This is a genuinely new problem the per-FA Step 5 app-wide scan doesn't surface at
  case-type granularity — a property or data page two Flow Actions in the *same case* both touch,
  each independently deciding differently.
- Unions `patternTally` across Flow Actions and dedupes `workItems` (now `caseTypeWorkItems`) by
  target rule identity — a shared fix referenced by multiple Flow Actions becomes one work item,
  not N near-duplicates.
- Collects every `operation: manual` item across every Flow Action into `caseTypeManualSteps`,
  deduped — including any change needed at the `Rule-Obj-CaseType` level itself (e.g. adding a
  Constellation Initialization Stage), which is always `manual` since that rule type is absent
  from the plugin's create/update support table.
- Rolls up `completeness` honestly across every Flow Action, including every skipped one and why.
- **Writes `<CaseType>_migration_manifest.json`** per `references/output-contracts.md` §Case-Type
  outputs — the entire input to Phase 4 for a case-type run (one ChangeRequest, one branch,
  covering the whole case type's `caseTypeWorkItems`), structurally the same handoff pattern as
  role 7 above, just one layer up.

## Concurrency discipline

5–8 items per agent within a wave, cap concurrent agents at roughly 6–8, more sequential waves
rather than larger batches for a big tree. For a scope small enough that Wave 1 has 3 or fewer
leaves total, a single agent handling all of them is fine — don't force parallelism onto a
trivially small tree.

## Outer-wave concurrency (Case Type runs only, Phase 0b) [PROVISIONAL]

> **⚠ PROVISIONAL** — these caps have not been validated against a real case-type run.
> After the first real case-type deep-dive, update these numbers with actual token/cost
> data and remove this tag.

This layer sits **above** everything else in this section, which stays entirely unchanged: each
selected Flow Action's own Phase 0-3 run (waves, registry, reconciliation) is dispatched and
executed exactly as documented above, in full, once per Flow Action. The only new thing is how
many of those full runs happen at once.

- **Cap concurrent Flow-Action deep-dives at 1–2 at a time**, not the 6–8 used for inner Wave-1
  items — each deep-dive already saturates a large concurrency budget on its own (a single
  mid-size Flow Action has needed multiple background agent dispatches and 450K+ subagent tokens
  in practice), so running several concurrently multiplies that risk rather than just cutting wall
  clock time.
- Use the inventory's `sizeSignal` (`references/casetype-enumeration.md` §Step 5) to batch: never
  schedule two "large" Flow Actions in the same concurrent slot. Small/medium ones can pair more
  freely.
- **Checkpoint between batches**: update the case-type-level registry with each completed Flow
  Action's manifest summary before starting the next batch, so a partial run (user stops after N of
  the selected set) still yields a usable partial case-type rollup.
- Recalibrate these caps after the first real case-type run, the same way the inner 5–8/6–8
  caps were calibrated from a real single-Flow-Action run; don't treat these numbers as final
  without that evidence.

## Orchestrator discipline

These rules apply to the orchestrator (main session) specifically:

- **An incomplete agent return goes back to that agent**, with the missing output-contract fields
  named explicitly — the orchestrator does not fill gaps by inference. See
  `references/error-handling.md` for retry limits and wave-blocking rules.
- **Verify anything that sounds like a statistic before it goes in the document.** A prior run
  stated a graph capability (`Class` nodes + `INHERITS_FROM` edges) that turned out not to exist,
  and separately "corrected" a property's class from a right answer to a wrong one with no
  supporting evidence. Every specific factual claim — a reference count, a resolved class, a
  "confirmed via X" statement — must trace to an actual tool call made in this run.
