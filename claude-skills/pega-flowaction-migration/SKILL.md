---
name: pega-flowaction-migration
description: "Analyzes Pega Flow Actions and Case Types for Constellation migration readiness (analysis only — no authoring). Resolves dependency chains via PDS MCP, performs bottom-up multi-agent analysis, and outputs a Work-Item Manifest that hands off directly to the Pega Infinity Authoring Plugin's ChangeRequest-based rule authoring (rule-type skills, methodology skills), so the resulting branch ruleset actually contains every rule the migration needs."
---

<!-- Skill version: 3.0.0 | Last updated: 2026-08-03 | Changelog: see end of file -->

# Pega Flow Action / Case Type → Constellation Migration Analysis (multi-agent, bottom-up)

## Trigger phrases

This skill activates on requests like:
- "migrate this flow action to Constellation"
- "analyze a flow action for Constellation readiness"
- "build a migration plan for a flow action"
- "migrate this case type to Constellation"
- "analyze a case type for Constellation readiness"
- "build a migration plan for a case type"

## Overview

**This skill is analysis-only.** It never calls `create-rule`/`update-rule`/`copy-rule` itself and
never invents a rule payload. Its job ends at producing a **Work-Item Manifest**: a structured
diagnosis of what must change, expressed as routing information (which rule type, what it must do,
which Pega Infinity Authoring Plugin skill authors it, in what order) — never as field-level
payloads. Phase 4 (§Phase 4 — Build handoff) describes how that manifest is handed to the plugin's
own authoring skills so the resulting ChangeRequest branch actually contains every rule the
migration needs. There is no JSON "ledger" and no DOCX/Excel deliverable — those were removed in
v3.0.0 in favor of the manifest, which is designed to be consumed by an agent, not read by a human
as a report (see `references/output-contracts.md`).

This skill has two entry points, resolved automatically from the name given (see Phase 0):

- **A Flow Action** — produces a **Work-Item Manifest** by walking the Flow Action's **complete
  dependency chain** — starting from the Flow Action rule itself, down through its screen, every
  included section, every grid, every property bound to a field, every data page, every
  When/Field Value rule — and analyzing it **bottom-up**: leaves first, then each parent analyzed
  with its children's findings already in hand, all the way back up to the Flow Action. That
  upward walk is where the actual migration strategy for the whole flow gets decided. Sections are
  never analyzed standalone; every section in the tree gets its own specialized Section-Analysis
  subagent within a Flow Action run.
- **A Case Type** — a case type owns stages, which run processes/flows, which contain Flow
  Actions; a mid-size classic case type has been found to reach 18-24 Flow Actions, roughly
  20x the scope of a single Flow Action run. This entry point is always **two-phase**
  (`references/casetype-enumeration.md`): a cheap **Phase 0a inventory** enumerates every Flow
  Action the case type reaches and stops for review; an explicit follow-up **Phase 0b deep-dive**
  then runs the *exact same* per-Flow-Action machinery described below, once per selected Flow
  Action, followed by a case-type-level rollup (§Case-Type Reconciliation Agent,
  `references/output-contracts.md` §Case-Type outputs). Never auto-proceed from inventory to
  deep-dive, and never analyze more Flow Actions than were explicitly selected — the cost gap
  between the two phases is large. A case-type run produces one Work-Item Manifest per migration
  unit; Phase 4 authors the whole case type's backlog into **one** branch (§Phase 4).

Analysis covers two dimensions with equal weight, for every Flow Action analyzed either way:

1. **Data-model readiness** — property resolution, sources, data-page queryability, grids,
   app-wide sharing conflicts (Steps 3–8, `references/analysis-steps.md`).
2. **UI behavior** — action sets and event chains (postValue / refresh / RunActivity), refresh
   targets, conditions, list-source selection mappings (SetValueOnSelect), and where that logic
   must live in Constellation (`references/ui-behavior-analysis.md`).

This skill is **self-contained**: the former "base heritage-modernization skill" has been retired
and its step definitions now live in `references/analysis-steps.md`. Step numbers (3–8) are kept
so existing findings and the team's vocabulary stay valid.

This skill is built to run **inside Claude Code**, using Claude Code's Task tool to run multiple
**purpose-built subagents in parallel** — different agent roles for different kinds of work, not
N identical clones. Parallelism cuts wall clock time; the shared context registry (below) is what
keeps those parallel agents from losing information that other agents already found.

## Reference files (progressive disclosure)

| File | Contents | Who must read it |
|---|---|---|
| `references/analysis-steps.md` | Steps 3–8 definitions, 5-way decision, verify-flag codes, reconciliation invariants | Property, DP/RD, Grid, Conflict-Scan, Reconciliation agents; orchestrator |
| `references/xml-mechanics.md` | Mandatory parsing rules + evidence-verified XML vocabulary (bindings, sources, action sets, conditions, selection mappings) | **Every agent, before its first XML parse** |
| `references/ui-behavior-analysis.md` | Action-set/event/condition analysis procedure, Traditional→Constellation action treatments, 7-way feature classification, logic-rule briefs | Section-Analysis and Logic-Rule agents; orchestrator (for the FA rule itself) |
| `references/patterns-1-12.md` | The team's numbered patterns 1–12 with verbatim statements, live-verified evidence, and xlsx tag-hint corrections | All analysis agents |
| `references/patterns-13-23.md` | Patterns 13–23 (including new Pattern 23, custom harness redesign) with live-verified evidence | All analysis agents |
| `references/patterns-extended.md` | Extended patterns E13–E20 (UI-behavior blockers, team ratification pending) | Section-Analysis, Logic-Rule agents; orchestrator |
| `references/patterns-meta.md` | Target platform, environment name mapping, rule-type footprint, migration priority summary, precedent-app grounding (discovered live per engagement, never hardcoded) | All analysis agents |
| `references/output-contracts.md` | Registry layout, Work-Item Manifest schema, closed enums, the Phase 4 branch-completeness gate, **plus §Case-Type outputs** (inventory/manifest wrapper schema) | Orchestrator, Reconciliation, Case-Type Reconciliation agents; whoever runs Phase 4 |
| `references/casetype-enumeration.md` | Case Type entry point only: Phase 0a inventory procedure (Cypher traversal, stub filtering), Phase 0b deep-dive handoff | Orchestrator, only when the entry point is a Case Type |
| `references/agent-roles.md` | All 9 agent role definitions with input/output contracts, concurrency caps, outer-wave dispatch | Orchestrator |
| `references/error-handling.md` | Retry policy, PDS MCP failure handling, wave-blocking rules, checkpointing | Orchestrator |

**Dispatch rule:** Claude Code subagents do not inherit this skill's context. Every dispatched
agent prompt must (a) name the exact reference files to read, by absolute path, and (b) paste the
task-specific registry excerpts inline. An agent told to "check the registry" in the abstract has
effectively been told nothing.

## Hard rule: no scripts anywhere in the analysis

**Every step of the analysis — discovery, property reads, pattern matching, class resolution,
conflict scanning, section synthesis, UI-behavior extraction — is performed by an agent directly
calling PDS MCP tools (`neo4j_query`, `pega_get_rule_xml`, `pega_get_rule_version`,
`get_rule_summaries`, `search_rules`) and reasoning over the returned XML/JSON.** No agent writes
or executes a Python, Bash, or JS script to parse XML, walk the tree, merge results, or compute
anything, at any point in Phases 0–2. This includes the orchestrator. If a step feels like it
wants a script (e.g. "count how many sections reference this property" or "merge these three
agents' findings into one table"), do it by reading and reasoning over the tool output directly.

Two write-side exceptions, both assembly rather than analysis:
- The **Work-Item Manifest and registry** are written by an agent's own reasoning turn as normal
  file writes (Write/Edit tools), never generated by a script.
- **Phase 4 rule authoring** (`create-rule`/`update-rule`/`copy-rule` and the surrounding
  ChangeRequest lifecycle calls) is writes via the Pega Infinity Authoring Plugin's own approved
  MCP tools, driven by that plugin's own skills — not a script, and not this skill's concern to
  re-implement. This skill's job stops at the manifest; Phase 4 describes the handoff, it does not
  contain analysis logic.

Nothing about the migration findings themselves ever passes through a script.

**Bright-line test:** if the operation processes migration findings, parses rule XML, walks a
dependency tree, resolves a property chain, counts references, or merges agent results, it is
**analysis** and must be done by agent reasoning over tool output directly. If the operation
assembles a document, formats output for display, or writes structured data to a file, it is
**assembly** and is allowed. When in doubt, it's analysis.

## Target platform, precedents, and evaluation

- **Default target: Pega Infinity '25 (25.1.x)** — the latest GA line as of July 2026 (25.1 GA
  2025-09-24; latest patch 25.1.2, 2026-02-16; Infinity '26 is announced roadmap). At Phase 0,
  confirm the target with the user if they name one; record it in the registry either way.
- **Capability claims are version-sensitive.** When a finding depends on what Constellation can
  or cannot do (autocomplete display fields, multi-select, editable tables, reference-field
  presentation), verify against the current "What's new in Constellation UI" release notes on
  docs.pega.com (WebFetch/WebSearch when available) before declaring a blocker, and cite the
  check in the finding. Never assert a Constellation limitation from memory alone.
- **Precedent apps are discovered at Phase 0, per engagement — never assumed.** Query the current
  environment for applications already Constellation-migrated (`pyIsConstellationApp=true`, or ask
  the user directly which apps in this engagement are already migrated) and record the result as
  `precedentApps` in the registry: a list of `{conversationalName, environmentValue, role}`. Before
  finalizing any redesign recommendation, search the discovered `precedentApps` for a precedent
  implementation (`search_rules` / graph, by rule type and concept). When one exists, cite the
  precedent rule (app + class + name) in the recommendation; when it contradicts generic guidance,
  prefer the precedent and say why. **Specific precedent apps were discovered this way in one past
  engagement** — treat that as a worked example of the mechanism, never as a hardcoded assumption
  true of every engagement, and never name a specific app here as if it's guaranteed to recur. If
  Phase 0 finds no already-migrated app in the current environment, say so explicitly
  (`precedentApps: []`) and drop precedent-grounding for that run rather than defaulting to a stale
  app name — confirmed to happen in practice (a run against a different app correctly reported no
  precedent apps indexed in that environment, proving the mechanism must not be hardcoded to any
  specific app names). The apps discovered in that one past engagement are also this skill's own
  evaluation ground truth for that engagement specifically: to validate changes to the skill using
  that engagement, pick a migrated precedent view whose Traditional ancestor still exists and
  compare the skill's recommendation to what the team actually built.

## The design-pattern catalog

The team's numbered patterns (from `Heritage_Modernization_Patterns_2.xlsx`, currently 1–23; #24
is a title-only stub awaiting team input and is intentionally excluded until then) live in
`references/patterns-1-12.md` and `references/patterns-13-23.md`, while extended patterns E13–E20
live in `references/patterns-extended.md`. **Cite by number, don't paraphrase.** If a
newer version of the xlsx is available in the current project, re-read it, live-verify anything
new or changed against real Pega rules before writing it in (the xlsx's own "which xml tag to
check" hints have already been found wrong or incomplete for several patterns — never trust a tag
hint without checking it against real rule XML first), and use its wording for the statement text.
Real blockers that fit no numbered pattern are named as their own findings — never forced into a
number they don't match.

## Cardinal parsing rules (full set in `references/xml-mechanics.md` — mandatory reading)

1. The graph is a candidate list; **the XML is the source of truth** — it over-counts and
   under-counts in both directions.
2. Rule identity is `(class_name, rule_name)`, matched **case-insensitively**; never bare name.
   Within one identity, take the latest pzinskey timestamp.
3. Auto-gen gate: `pyAutoHTML=true` + empty `pyJavaStream` + no non-empty `pyLegacyControl`.
   Never gate on `pzIsAutoGenerated`.
4. A field binding is a `rowdata` with `pyType=FIELD` whose **direct-child** `pyValue` starts
   with `.`.
5. **An empty rule-name tag is not an invocation** — an empty `pyActivity` or an empty
   `pyPreDataTransform/pyName` means no activity / no data transform, regardless of surrounding
   structure.

---

## Phase 0 — Resolve the entry point (Orchestrator, sequential)

Run by the **orchestrator** (the main Claude Code session) before dispatching any subagent.

### Step 0 — detect entry-point type

Given a rule name + environment, determine whether it names a Case Type or a Flow Action **before**
doing anything else:

```
MATCH (r:Rule) WHERE r.environment = '<env>' AND r.rule_name = '<Name>'
  AND r.pzinskey STARTS WITH 'RULE-OBJ-CASETYPE '
RETURN r.pzinskey, r.class_name
```

- **Match found** → this is a **Case Type run**. Stop reading this section and go to
  `references/casetype-enumeration.md` §Phase 0a for the inventory procedure. Everything below
  this point in Phase 0/1 (and the single-Flow-Action wave architecture in §Multi-Agent
  Architecture) still applies — case-type runs invoke it unmodified, once per selected Flow
  Action, during Phase 0b. Do not run a separate/parallel Phase 0 procedure for case types; there
  is exactly one Flow-Action-level Phase 0, reused by both entry points.
- **No match** → this is a standalone **Flow Action run**. Continue with Step 1 below exactly as
  before.

Don't guess from the name's shape (e.g. assuming "…Request" sounds like a case type) — always
query, since case types and flow actions can have similar-looking names.

### Step 1 — resolve the Flow Action

1. Query the graph for the Flow Action by name + environment:
   ```
   MATCH (r:Rule) WHERE r.environment = '<env>' AND r.rule_name = '<FlowActionName>'
     AND r.rule_type = 'Rule-Obj-FlowAction'
   RETURN r.pzinskey, r.class_name
   ```
   Multiple rows = different rules on different classes (`(class_name, rule_name)` is the real
   identity, never name alone). Confirm which with the user, or scope each separately. Within one
   `(class, name)`, take the latest `pzinskey` timestamp.
2. Fetch the Flow Action's XML. Resolve which of the three known UI-sourcing mechanisms it uses —
   check all three, since different Flow Actions in the same app have been found using different
   ones:
   - `pySectionReference` (points directly at a `Rule-HTML-Section`)
   - `pyViewReference` (points at a `Rule-UI-View`)
   - An inline Design Template body whose `pySections[].pySectionBody[].pyInclude` names a section
3. Note the Flow Action's other wired rules: `pyValidateActivity`, `pyActionTransformRule`, local
   action / post-processing activity. These become root-level sibling nodes in the tree, analyzed
   in the final wave alongside the root section.
4. Record in the registry: environment, resolved Flow Action identity, UI-sourcing mechanism,
   target platform version, and the output file path (registry, manifest).

### Step 2 — confirm source and write backends (mandatory, do not skip)

This skill reads via PDS MCP (`neo4j_query`, `pega_get_rule_xml`, environment strings — always
discovered live, never a hardcoded example); Phase 4 authors via the Pega Infinity Authoring Plugin's own OAuth'd connection
(`list-available-applications`, `get-application`, `switch-application-context`). **These are two
separate backends and being the same Pega instance is an assumption, not a guarantee.** Before
Phase 1 starts:

1. Call the plugin's `list-available-applications` / `get-application` to identify which
   application the write side is currently authenticated against.
2. Confirm with the user (or from environment naming conventions, if unambiguous) that this is the
   same Pega instance the PDS MCP `environment` string names. If it is not, stop and ask — do not
   proceed on an unverified assumption that analysis and authoring point at the same system.
3. Record both handles in the registry as `sourceBackend` (`{system: "PDS MCP", environment}`) and
   `writeBackend` (`{system: "Pega Infinity Authoring Plugin", application, sameInstanceAsSource}`)
   — these carry through unchanged into the Work-Item Manifest (`references/output-contracts.md`).
4. Discover `precedentApps` for this engagement now (see §Target platform above) and record them in
   the registry alongside the two backend handles.

## Phase 1 — Build the full dependency tree (Orchestrator, sequential — do not parallelize this phase)

Tree discovery must produce one consistent, authoritative picture before any parallel analysis
starts, so it stays with the orchestrator, single-threaded, using only `neo4j_query` and
`pega_get_rule_xml` — no subagents yet.

1. From the root section, recursively walk `REFERENCES` edges **and** read each section's own
   XML — the graph over-counts (pulls in unrelated same-named rules from distant classes,
   condition-only refs, system props) **and** under-counts (has been confirmed to miss real field
   bindings entirely). Treat the graph as a candidate list; confirm and complete it against the
   actual XML every time, per `references/xml-mechanics.md`.
2. Recurse into every section's includes until no new sections appear, building the tree
   bottom-up as you go (children discovered before the parents that include them).
3. For every section, enumerate and add as its own tree node, one level below that section:
   - **Every property bound to a `FIELD` cell** (direct-child `pyValue` starting with `.`). Do
     not just narrate a property from the cell — it must become its own node.
   - **Every data page**, cell-level and (once opened in Phase 2) property-level.
   - **Every When rule / Field Value rule** driving visibility, required-ness, or captions —
     including Whens named inside `pyActionConditions` and `pyRequiredWhen` (strip `!` negation
     to resolve the rule; record the negation).
   - **Every grid (Repeating Dynamic Layout)**: `pyPageListProperty`, `pyPageListPropertyClass`,
     `pyRepeatDirection`, full column list, and its own header-table caption (a separate
     pattern-#5 candidate from the column headers, which are normal static text, not a violation).
   - **Whether a "wrapper" section is secretly a second, outer grid.** Read every wrapper's own
     `pySectionBody` before assuming it's a pass-through — a prior run found a "_Signed" wrapper
     that looked like a simple include but was itself bound to its own, different
     `pyPageListProperty`, producing a genuinely nested outer-grid → inner-grid structure.
   - **Whether a same-named `Rule-UI-View` exists.** If so, compare `pxUpdateDateTime` on both;
     if the section is newer, the View is stale (found to be systemic in a prior run). Flag for
     deletion/regeneration; never analyze the stale View as if it reflected the current screen.
   - **Whether the section carries UI behavior**: note (do not yet analyze) every non-empty
     `pyActionSets` block, refresh/pre-processing configuration, and refresh-target section named
     in `pyActionAPI/pySection` — refresh targets are implicit dependencies the graph may miss;
     add them to the tree as sections if not already present. Record per section node:
     `has UI behavior: yes/no + event count`. Deep analysis happens in Phase 2 per
     `references/ui-behavior-analysis.md`.
4. List exclusions explicitly rather than silently dropping them: `px`/`pz` system-plumbing
   properties, `.pyTemplate*` placeholders, properties referenced only inside a When/visibility
   condition with no direct cell binding.
5. Root of the tree: the root section, the Flow Action's wired rules as siblings, then the Flow
   Action rule itself.

**Write the tree to the shared context registry** before dispatching any subagent — this tree is
what every subsequent agent's task assignment is built from.

## Shared context registry — how agents avoid losing information

Claude Code subagents are dispatch-and-return: they don't share live memory with each other. All
cross-agent information must move through the orchestrator and a **shared registry file** the
orchestrator maintains on disk (markdown or JSON, orchestrator's choice — written by the
orchestrator's own reasoning turn as a normal file write, never by a script) and updates after
every agent returns. Treat this registry as the single source of truth; an agent's findings that
never make it into the registry are effectively lost.

**Registry contents, kept current throughout the run:**
- The full dependency tree from Phase 1, with a status marker per node (`pending` /
  `in-progress` / `done`) updated as agents report back.
- **`classInheritanceMap`**: maps classes to their resolved parent lists (e.g. `{"ClassA": ["ParentClass", "@baseclass"]}`) to avoid redundant parent fetches across multiple properties.
- **One resolved entry per property**, keyed by `(class_name, rule_name)` — never bare name.
  Once any agent resolves a property's class via the chain-walk, record the result here so no
  other agent re-derives it independently or, worse, resolves it differently. Include the
  resolved class, the exact `pyDerivesFrom` chain walked, type/mode, and decision.
- **One entry per data page / report definition**, with its Step 8a/8b readiness result.
- **App-wide conflict scan results** per shared property/data page (Step 5), including the exact
  section count and list — not an estimate.
- **Stale-View findings** and **grid/nested-grid findings** from Phase 1.
- **Per-section UI-behavior findings**: normalized action chains (control, property, event,
  key code, action sequence with wiring, targets), condition inventory, list-source selection
  mappings including every `pyPropertyTarget`.
- **One entry per logic rule** (When / Data Transform / Activity / Validate / custom control)
  with its analysis and the Constellation destination for its logic.
- **Discovered-dependency queue**: logic rules and refresh-target sections surfaced during
  Phase 2 (e.g. a data transform inside a refresh action) that were not in the Phase 1 tree.
  The orchestrator dispatches Logic-Rule agents for queued items in the next wave.
- A running **pattern-hit tally** covering patterns 1–12 and E13–E20 (which pattern, how many
  times, where) — this feeds the migration-strategy summary directly.

**When the orchestrator dispatches an agent for a parent node**, it must include, inline in that
agent's task prompt, the full structured findings of every already-completed child node from the
registry — not a pointer, and not a re-statement in the orchestrator's own words. Paste the child
agents' actual returned findings. The parent agent's job is to add to that context, not
reconstruct it.

**Every agent's own return to the orchestrator must be structured**, not free-flowing prose, so
it can be dropped into the registry and into a future agent's prompt without reinterpretation.
Minimum structure per agent type is given with each role below.

## Multi-Agent Architecture (Claude Code, Task tool)

### Orchestrator (main session)
Runs Phase 0 and Phase 1 itself. Maintains the shared registry and the discovered-dependency
queue. Decides dispatch waves. Collects every agent's structured output, updates the registry,
and checks each returned result against that agent's required output fields before moving on —
an incomplete return gets sent back to the same agent with what's missing named explicitly, not
silently patched by the orchestrator guessing (see `references/error-handling.md` for retry
limits and wave-blocking rules). Applies the UI-behavior lens to the Flow Action rule itself
(buttons, Form Settings, wired validation/transform — patterns #7 and #10) in the final wave.
Runs the final Reconciliation step itself or via one dedicated agent (the manifest is the last
analysis artifact — there is no separate document-writing step). Phase 4 (Build handoff) is a
separate, sequential procedure the orchestrator runs after the manifest validates, per §Phase 4.

### Wave-based dispatch (why waves, not one big parallel batch)
The tree has real dependencies (a section can't be analyzed before its children are), so
parallel dispatch happens **within** a wave, not across the whole tree at once:
- **Wave 1 — true leaves in parallel**: every property, data page, When rule, and Field Value
  rule with no further dependencies. Properties and data pages go to their specialist agents;
  When / Field Value / already-known transforms and activities go to Logic-Rule agents. Batch
  liberally (5–8 per agent, cap ~6–8 concurrent agents, more waves rather than larger batches
  for a big tree).
- **Wave 2 — innermost sections**: any section whose entire child set finished in Wave 1
  (typically grid row templates and simple leaf-including sections).
- **Wave 3+ — each next level up**: sections whose children finished in the prior wave.
  **Discovered-dependency queue items** (logic rules surfaced by Section-Analysis agents) are
  dispatched at the start of the earliest wave after their discovery; a section's decision that
  depends on a queued rule stays Provisional until that rule's analysis returns.
- **Asynchronous Conflict-Scan Execution**: Conflict-Scan agents (Role 4) run asynchronously alongside Wave 3+ sections once a shared property/DP is flagged. The orchestrator tracks Conflict-Scan progress via a state machine:
  - Dispatched: Shared item marked `CELL_LEVEL_SOURCE_NEEDS_APPWIDE` (Provisional).
  - Scan Complete (NO_CONFLICT): Decision upgraded in registry to `REUSE_ADD_FIELD_SOURCE` (Final).
  - Scan Complete (SOURCE_VARIANCE / PARAM_VARIANCE): Decision set to `CONSOLIDATE_OR_SPLIT` (NEEDS_REVIEW).
  Once updated, the orchestrator updates dependent section decisions from Provisional to Final or NEEDS_REVIEW.
- **Final wave — root**: root section synthesis, the Flow Action's wired rules, then the Flow
  Action rule itself, done by the orchestrator directly (this step is inherently the
  migration-strategy summary and benefits from the orchestrator holding the complete registry).

If the tree is large, say so and checkpoint progress (update the registry, report wave-by-wave)
rather than skipping property-level, app-wide, or action-set analysis to finish faster.

### Agent roles, concurrency caps, and case-type outer-wave dispatch

See `references/agent-roles.md` for all 9 agent role definitions (input/output contracts),
inner-wave concurrency discipline (5–8 items/agent, 6–8 concurrent), and outer-wave
concurrency for case-type Phase 0b runs.

---

## Phase 3 — Output: Work-Item Manifest

One artifact from the reconciled dataset — analysis stops here:

1. **`<FlowAction>_migration_manifest.json`** — machine-readable, schema and closed enums in
   `references/output-contracts.md`. Written by the Reconciliation Agent. `workItems[]` is
   **diagnosis and routing, never a rule payload** — it names the target rule type, the operation,
   the plugin skill that authors it (`authoringSkill`), and the dependency order; it never
   specifies field values. If a work item is tempted to include exact field values, that's the
   analysis overstepping into authoring — route it through the named skill instead.
2. **Schema verification** — before the manifest is handed to Phase 4, it is validated against
   `references/work-item-manifest-schema.json`. If validation fails, Phase 4 does not start; the
   orchestrator logs the schema errors and re-dispatches the Reconciliation Agent to fix the
   structure.

**Case Type runs** produce this same artifact **per selected Flow Action** (unchanged), plus two
case-type-level artifacts on top: the Phase 0a `<CaseType>_flowaction_inventory.json` and the
Phase 0b `<CaseType>_migration_manifest.json` (written by the Case-Type Reconciliation agent, role
9 above) — full schema and structure in `references/output-contracts.md` §Case-Type outputs.

## Phase 4 — Build handoff (Pega Infinity Authoring Plugin authors; this skill routes)

This phase is not analysis and contains no new analysis logic — it is a fixed procedure for
handing the manifest to the plugin's own skills. If the plugin is not installed/connected in this
session, stop after Phase 3 and hand the manifest to the user or to whatever agent does have it —
do not attempt to author rules through any other mechanism.

1. **Load the plugin's own workflow skills first**, don't re-derive their logic here:
   `methodology-change-request-workflow` (ChangeRequest lifecycle, branch isolation) and
   `methodology-assignment-authoring` (FlowAction+View creation/modification order) via `get-skill`.
   This skill's `workItems[].dependsOn` should already agree with those skills' own dependency
   graphs (properties → view → FlowAction → flow wiring); if they disagree, the plugin skill's
   order wins — fix the manifest, not the plugin.
2. **One ChangeRequest, one branch, per migration unit** — one Flow Action run is one
   ChangeRequest case; a Case Type run is **one** ChangeRequest case covering the whole case
   type's deduped `caseTypeWorkItems`, not one per Flow Action (`references/output-contracts.md`
   §Case-type build handoff). Follow `methodology-change-request-workflow`'s own Branch ID
   Selection Rules verbatim — never invent a different branch-naming scheme here.
3. **Walk `workItems` in `dependsOn` topological order.** For each item:
   - `operation: manual` — never call a write API. Record it as an outstanding manual step (with
     `manualReason`) in `pyAuthoringNotes` and in the eventual review summary. `Rule-Obj-CaseType`
     structural changes (e.g. adding the Constellation Initialization Stage) and any other rule
     type absent from `methodology-rule-authoring`'s create/update support table are always
     `manual` — never worked around with a different rule type or a raw activity call.
   - `operation: reuse-as-is` — no rule write. Note "verified reusable, no change" in
     `pyAuthoringNotes`.
   - `operation: create | copy-then-update | update` — `get-skill(authoringSkill)` (and
     `methodologySkill` when populated), then follow **that skill's own `schema/` and
     `examples/`** to build the payload — treat the example as a rigid template, per that skill's
     own discipline. This skill's `authoringNotes[]` are context for the authoring agent (what the
     business behavior must preserve, non-obvious quirks already discovered during analysis), not
     a substitute for reading the schema. Never invent a field name or payload shape here.
   - After each write, verify with `get-rule` (`pyRuleFormStatus: Good`) and update
     `pyAuthoringNotes` with the created/updated rule's instance key, per
     `methodology-rule-authoring`'s own verify step.
4. **PegaUnit test cases**, per `methodology-change-request-workflow`'s testable-type list, for
   every authored rule whose type qualifies — created before submitting the Authoring stage,
   exactly as that skill mandates.
5. **Completeness gate (the real one) — `references/output-contracts.md` §Phase 4 completeness
   gate.** For every non-manual, non-reuse-as-is work item, confirm it actually resolves in the
   branch via `get-rule` before presenting the Review stage to the user. A gap here blocks
   presenting Review and is named explicitly — never silently dropped. This gate checks the
   **branch**, not this skill's own manifest file, which only proves analysis was complete, not
   that authoring happened.
6. **Submit Authoring → Review**, exactly per `methodology-change-request-workflow`'s mandatory
   pause — this skill adds nothing to that approval gate and never auto-approves.

## Discipline notes

Core rules that govern every agent's output quality. Some are also stated in the reference
files they most closely relate to — the cross-references below show where.

- **Provisional vs Final**: a decision based only on evidence inside this Flow Action's own tree
  is Provisional until the Step 5 app-wide scan for that item has actually run. Never present
  Provisional findings as Final. (See also `references/analysis-steps.md` §Step 5.)
- **Version-sensitive capability claims must cite a release-notes check** for the pinned target
  version (see §Target platform above). "Constellation can't do X" without a citation is not a
  finding. (See also `references/patterns-meta.md` §Target platform.)
- **Precedent-first**: a redesign recommendation that a discovered precedent app has already solved
  differently must follow the precedent or explicitly justify diverging from it. (See also
  `references/patterns-meta.md` §Precedent grounding.)
- **Empty ≠ configured**: an empty rule-name tag is not an invocation; a generated default is not
  intentional configuration; a feature represented *differently* in Constellation is not
  *unsupported*. Distinguish facts from inferences — mark inferences "likely/appears to" and name
  the exact rule whose retrieval would confirm them. (See also `references/xml-mechanics.md`
  §Envelope and `references/ui-behavior-analysis.md` §F.)
- Orchestrator-specific discipline (retry policy, statistic verification) is in
  `references/agent-roles.md` §Orchestrator discipline and `references/error-handling.md`.
- **Analysis routes, it never authors.** A `workItems` entry names a rule type, an operation, and
  the plugin skill that authors it — never a field/value payload. If writing a work item feels
  like it wants to specify `pyViewReference` or any other schema-shaped field, that instinct is
  wrong for this skill; stop and let the named `authoringSkill` supply that from its own
  `schema/`+`examples/` in Phase 4. `manual` is a legitimate, honestly-reported outcome (a rule
  type outside the plugin's create/update support table), not a failure to work around.

---

## Changelog

| Version | Date | Changes |
|---|---|---|
| 3.0.0 | 2026-08-03 | **Breaking redesign.** Removed the JSON migration ledger and DOCX/Excel deliverables entirely. Replaced with a Work-Item Manifest (`references/output-contracts.md`, `references/work-item-manifest-schema.json`, renamed from `ledger-schema.json`) that routes each rule to the Pega Infinity Authoring Plugin's own `authoringSkill`/`methodologySkill` instead of specifying payloads — this skill is now strictly analysis-only. Added Phase 4 (Build handoff): ChangeRequest/branch lifecycle via `methodology-change-request-workflow`, FlowAction+View sequencing via `methodology-assignment-authoring`, and a real completeness gate checked against the live branch (`get-rule` per work item) rather than a static file. Added Phase 0 Step 2 (confirm source PDS-MCP backend and write-target plugin backend are the same Pega instance) and Phase-0 `precedentApps` discovery, replacing the hardcoded OWLM/OARC precedent assumption (proven necessary by a real cross-app run against `PegaCSSample`, where OWLM/OARC are not indexed). Closed the `verify_flags.code` schema/prose drift found in review (schema now enforces the same closed list `analysis-steps.md` documents, including `NON_STANDARD_CONTROL`). Case-Type outputs updated to match (one branch per case type, `caseTypeManualSteps` added for rule types the plugin cannot author, e.g. `Rule-Obj-CaseType` stage restructuring). |
| 2.2.0 | 2026-07-17 | Added `classInheritanceMap` cache to registry; implemented asynchronous Conflict-Scan state machine and state transition rules; added JSON Schema validation step for the ledger; integrated `references/constellation-capabilities-25.md` as target platform source. |
| 2.1.0 | 2026-07-17 | Restructured: agent roles extracted to `references/agent-roles.md`; `pyBehaviors`→`pyActionSets` corrected across all files; `examples/` directory added; `references/error-handling.md` added; `patterns.md` split into 4 files; frontmatter description shortened; `sharedItems` conflict spec tightened; no-scripts bright-line test added |
| 2.0.0 | 2026-07-17 | Pattern 23 added; xlsx tag-hint corrections; `pyBehaviors` field correction documented in patterns.md |
| 1.0.0 | 2026-07-16 | Initial self-contained skill (base heritage-modernization skill retired) |
