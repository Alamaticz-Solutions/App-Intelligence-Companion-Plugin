# Output Contracts — registry, Work-Item Manifest, branch completeness gate

This skill produces **one machine-readable deliverable**: a Work-Item Manifest. There is no JSON
"ledger" and no DOCX/Excel plan — those were removed in v3.0.0. The manifest does not contain
rule payloads (field-by-field values); it contains **diagnosis and routing**: which rule type,
what it must do, which Pega Infinity Authoring Plugin skill authors it, in what order, and how to
prove the branch actually contains it. Authoring itself is done entirely by the plugin's own
skills (`methodology-change-request-workflow`, `methodology-assignment-authoring`, the `rules-*`
rule-type skills, and their `schema/`+`examples/`) — this skill never invents a create-rule/
update-rule payload. See SKILL.md §Phase 4 for the handoff procedure.

## Shared context registry (working file, per run)

`<FlowAction>_analysis_registry.md` (or `.json`) in the working directory. Maintained by the
orchestrator's own reasoning turns (normal file writes, never a script). Contents per SKILL.md
§Shared context registry. It is a working artifact; the manifest below is the deliverable.

Registry must include the **`classInheritanceMap`** structure:
```json
{
  "classInheritanceMap": {
    "PDS-FW-HRLifeFW-Work-ContractRequest": ["PDS-FW-HRLifeFW-Work", "Work-", "@baseclass"],
    "PDS-ProviderCase": ["@baseclass"]
  }
}
```

It must also include, from Phase 0, the two backend handles this run is operating against (see
SKILL.md §Phase 0 — Confirm source and write backends): `sourceBackend` (the PDS MCP environment
analysis reads from) and `writeBackend` (the Pega Infinity Authoring Plugin application this run
will author into), plus whatever `precedentApps` were discovered for this engagement (see
`patterns-meta.md` §Precedent grounding).

## Work-Item Manifest (the deliverable — the plugin's authoring input)

`<FlowAction>_migration_manifest.json`, written by the Reconciliation Agent. Must validate against
[work-item-manifest-schema.json](file:///c:/Users/ManojRajakumar/OneDrive%20-%20Alamaticz%20Solutions/Desktop/Projects%20-%20Alamaticz/Heritage%20Modernization/pega-flowaction-migration/references/work-item-manifest-schema.json).
Closed enums only — never free text where an enum is defined. Shape (annotated):

```json
{
  "rootRule": { "name": "", "type": "Rule-Obj-FlowAction", "class": "", "pzinskey": "",
                "environment": "" },
  "targetPlatform": { "product": "Pega Infinity", "versionLine": "25.1",
                      "capabilityChecks": [ { "claim": "", "source": "", "checkedOn": "" } ] },
  "sourceBackend": { "system": "PDS MCP", "environment": "" },
  "writeBackend": { "system": "Pega Infinity Authoring Plugin", "application": "",
                     "sameInstanceAsSource": true, "note": "" },
  "uiSourcing": "pySectionReference | pyViewReference | inlineDesignTemplate",
  "dependencyTree": { "name": "", "type": "", "class": "",
                      "children": [ "…recursive…" ], "status": "done | unresolved" },

  "rules": [ {
      "name": "", "type": "", "class": "", "pzinskey": "",
      "summary": "plain-English behavior",
      "patternHits": [ { "pattern": "#5 | E13", "evidence": "exact tag/value", "location": "" } ],
      "classification": "7-way enum (features) — omit for pure data rules",
      "constellationDestination": "for logic rules: dataPageLoad | calculatedField | assignmentSubmit | processStep | validation | remove",
      "effort": "Low | Medium | High",
      "precedent": { "app": "", "rule": "", "note": "" },
      "provisionalOrFinal": "Provisional | Final"
  } ],

  "fields": [ {
      "property_path": "", "leaf": "", "context_class": "",
      "controls": [], "list_sourced": false,
      "decision": "REUSE_AS_IS | REUSE_ADD_FIELD_SOURCE | CONSOLIDATE | CREATE_NEW | NEEDS_REVIEW",
      "appwide_pattern": "NO_CELL_SOURCE | NO_CONFLICT | PARAM_VARIANCE | SOURCE_VARIANCE | null",
      "verify_flags": [ { "code": "", "detail": "", "why": "" } ],
      "constellation_config": { "field_type_hint": "", "control": "", "source": "" },
      "property_rule": { "mode": "", "type": "", "property_source_type": "", "property_source_name": "" }
  } ],

  "actionChains": [ {
      "section": "", "control": "", "boundProperty": "",
      "triggers": [ { "event": "", "keyCode": "" } ],
      "chain": [ { "action": "", "target": "", "targetSection": "",
                   "dataTransform": "", "activity": "", "conditions": [] } ],
      "businessBehaviour": "one sentence",
      "treatment": "from ui-behavior-analysis.md §B",
      "patternHits": [], "classification": "7-way enum"
  } ],

  "conditions": [ { "name": "", "negatedUse": false, "usedFor": [], "usedIn": [],
      "logicSummary": "", "taxonomy": "CASE_DATA | DATA_PAGE_DEPENDENT | PAGE_EXISTENCE | UI_CONTEXT | REQUESTOR_OR_THREAD | FUNCTION_BASED | ACTIVITY_DEPENDENT",
      "classification": "7-way enum", "action": "" } ],

  "listSources": [ { "section": "", "control": "", "source": { "type": "", "name": "", "params": [] },
      "valueProperty": "", "displayProperty": "", "searchColumns": [],
      "copies": [ { "from": "", "to": "", "hidden": false } ] } ],

  "step8": {
    "8a_data_pages": { "count": 0, "data_pages": [], "required_change": "" },
    "8b_report_definitions": [ { "name": "", "flatten": false, "reasons": [] } ],
    "8c_rule_manifest": {},
    "8d_page_value_groups": [ { "leaf": "", "mode": "", "action": "" } ],
    "8e_picklist_radio": [ { "leaf": "", "decision": "", "verdict": "reusable | redesign-source" } ]
  },

  "patternTally": { "#1": 0, "…": 0, "E20": 0 },

  "workItems": [ {
      "seq": 1,
      "targetRule": { "type": "Rule-UI-View", "class": "", "name": "" },
      "operation": "create | copy-then-update | update | reuse-as-is | manual",
      "authoringSkill": "rules-rule-ui-view",
      "methodologySkill": "methodology-assignment-authoring",
      "sourceRule": { "type": "Rule-HTML-Section", "class": "", "name": "" },
      "behaviorContract": "one sentence — the business behavior this rule must preserve",
      "authoringNotes": [ "non-obvious quirks the authoring agent must know going in — NOT a payload; the authoring agent gets the payload from the named skill's own schema/examples" ],
      "dependsOn": [],
      "patternHits": [],
      "manualReason": "populated only when operation=manual — e.g. rule type absent from methodology-rule-authoring's create/update support table"
  } ],

  "needsReview": [ { "item": "", "blockingFact": "", "resolution": "" } ],

  "completeness": { "status": "COMPLETE | PARTIAL | BLOCKED",
      "analysedRuleCount": 0, "unresolvedDependencyCount": 0,
      "missingRules": [], "limitations": [] }
}
```

Rules for the manifest:
- `workItems` is **diagnosis and routing, never a rule payload**. It never contains field/value
  pairs for the target rule (no `pyViewReference`, no `pxViewMetadata`, nothing schema-shaped) —
  that is the authoring agent's job, using `authoringSkill`'s own `schema/` and `examples/`, per
  the plugin's own discipline ("trust the schema for field validity... treat the example as a
  rigid template"). If a work item is tempted to specify exact field values, that's a sign the
  analysis is overstepping into authoring — stop and route it through the named skill instead.
- `authoringSkill` must be a real skill name resolvable via the plugin's `get-skill` — verify it
  appears in `methodology-rule-authoring`'s "Supported create/update rule types" table before
  emitting `operation: create | copy-then-update | update`. If the target rule type is **not** in
  that table (confirmed absent for `Rule-HTML-Section` and `Rule-Obj-CaseType` as of this
  writing — re-check the table each run, plugin versions change), `operation` must be `manual`
  with `manualReason` naming the missing capability. Never invent a workaround (e.g. authoring a
  case type via freeform activity calls) — a `manual` item is a legitimate, honestly-reported
  output, not a failure.
- `methodologySkill` is populated when a cross-rule-type umbrella skill governs the sequencing
  (e.g. `methodology-assignment-authoring` for a FlowAction+View pair) — omit it for single-rule
  items with no such umbrella.
- Every entry that rests on an app-wide judgment carries `provisionalOrFinal` (on `rules[]`
  entries) or is reflected via `needsReview`; nothing Provisional may become a `workItems` entry
  with `operation` other than `manual`/deferred — it goes to `needsReview` instead.
- Every claim cites evidence (tag/value or tool call) — same discipline as before.
- `dependsOn` must reflect real authoring order (properties before the view that binds them,
  the view before the FlowAction that references it, etc.) — defer to the relevant plugin
  methodology skill's own dependency graph rather than re-deriving it (see SKILL.md §Phase 4).

## Phase 4 completeness gate — verified against the branch, not against this file

The manifest's own `completeness` block describes **analysis** completeness (did every rule in
the dependency tree get analyzed). It is not proof the migration was built. The **build**
completeness gate is separate and is checked against the live branch after Phase 4 authoring:

For every `workItems` entry with `operation` in `create | copy-then-update | update`, call
`get-rule` on the target rule identity, scoped to the ChangeRequest's branch ruleset, and confirm
it resolves with `pyRuleFormStatus: Good`. Where the plugin's `list-rules` supports filtering by
branch/ruleset, cross-check the full branch inventory against the manifest's non-manual work items
as a second pass. Every non-manual, non-reuse-as-is item must be present in the branch before the
ChangeRequest review summary is presented to the user — a gap here blocks presenting Review, is
reported by name, and is never silently dropped. `manual` items are reported as outstanding
manual steps in the review summary, not as failures.

---

## Case-Type outputs (only when the entry point is a Case Type — see `casetype-enumeration.md`)

Two additional artifacts exist at case-type scope, produced in this order, on top of (never
instead of) the unmodified per-Flow-Action manifests each deep-dived Flow Action already produces
via the contract above.

### Phase 0a deliverable — Flow Action inventory

`<CaseType>_flowaction_inventory.json`, schema defined in `casetype-enumeration.md` §Step 6.
Produced by the orchestrator directly (no Reconciliation Agent needed for this — it's a Phase 0
artifact, not an analysis result). This is where a case-type run stops for user review before any
deep analysis proceeds.

### Phase 0b deliverable — Case-Type Work-Item Manifest

`<CaseType>_migration_manifest.json`, written by the **Case-Type Reconciliation Agent** once every
selected Flow Action's own deep-dive (unmodified per-FA manifest, per the contract above) has
completed. Does not flatten or duplicate per-FA content — wraps it:

```json
{
  "rootRule": { "name": "", "type": "Rule-Obj-CaseType", "class": "", "pzinskey": "",
                "environment": "" },
  "targetPlatform": { "…same shape as the per-FA manifest…": "" },
  "writeBackend": { "…same shape as the per-FA manifest…": "" },
  "flowActionInventory": [ "…copied from the Phase 0a inventory, with status updated to analyzed | skipped-not-selected | error…" ],

  "perFlowActionManifests": {
      "<FlowActionName>": "…the exact, unmodified per-FA manifest object from that Flow Action's own <FlowAction>_migration_manifest.json — embedded by reference or inline, never re-derived or altered…"
  },

  "sharedItems": [ {
      "kind": "property | dataPage | section | reportDefinition",
      "identity": { "class": "", "name": "" },
      "usedByFlowActions": [ "" ],
      "decisionAcrossFlowActions": "SAME_DECISION | CONFLICTING_DECISION",
      "conflictDetail": "populated only when CONFLICTING_DECISION — which Flow Action decided what, and why",
      "resolvedDecision": "the case-type-level authoritative decision, or NEEDS_REVIEW"
  } ],

  "caseTypePatternTally": { "#1": 0, "…union across analyzed Flow Actions, not a sum of duplicates…": 0 },

  "caseTypeWorkItems": [ "…same shape as a per-FA workItems entry, but deduped by target rule identity (class, name) — a shared Data Page fixed once produces ONE entry even if 3 Flow Actions reference it, with a note listing all Flow Actions it unblocks…" ],

  "caseTypeManualSteps": [ "…every workItems entry across the whole case type with operation=manual, deduped by target rule identity — this is the authoritative list of what a human must do by hand, including any Rule-Obj-CaseType-level changes (e.g. stage/process restructuring) that no plugin skill can author…" ],

  "caseTypeCompleteness": {
      "status": "COMPLETE | PARTIAL | BLOCKED",
      "flowActionsInScope": 0, "flowActionsAnalyzed": 0,
      "flowActionsSkipped": [ { "name": "", "reason": "skipped-stub | skipped-not-selected | error" } ],
      "limitations": []
  }
}
```

**Case-Type Reconciliation Agent's job** (single agent, dispatched once, after every selected Flow
Action's deep-dive wave completes — mirrors the per-FA Reconciliation Agent's role but one layer
up):
1. Collect every selected Flow Action's completed, unmodified manifest.
2. Run the **`sharedItems` scan**: for every `(class, name)` identity appearing in more than one
   Flow Action's `rules[]`/`fields[]` arrays, compare their decisions. Same decision everywhere →
   `SAME_DECISION`, `resolvedDecision` mirrors it. Different decisions → `CONFLICTING_DECISION`,
   `resolvedDecision: NEEDS_REVIEW` with both sides cited in `conflictDetail`. This is a genuinely
   new reconciliation problem the per-FA Step 5 app-wide scan doesn't surface at case-type
   granularity — a property or data page two Flow Actions in the *same case* both touch, each
   independently deciding differently, is exactly the scenario this catches.
3. Union `patternTally` across Flow Actions (sum per pattern number/tag, not per-FA duplication of
   the same finding on a shared rule — a shared rule's pattern hit counts once).
4. Dedupe `workItems` by target rule identity — a shared fix referenced by multiple Flow Actions
   becomes one work item noting every Flow Action it unblocks, not N near-identical copies.
5. Collect every `operation: manual` item across every Flow Action into `caseTypeManualSteps`,
   deduped, including anything at the case-type rule itself (e.g. `Rule-Obj-CaseType` stage
   restructuring for Constellation's Initialization Stage requirement — always `manual`, since
   `Rule-Obj-CaseType` is absent from the plugin's create/update support table).
6. Roll up `completeness` honestly — list every skipped Flow Action and why; never silently omit
   one from the count.

**Conflict definition (closed rules):**

- **Same decision family, same specifics** → `SAME_DECISION`. Examples:
  `REUSE_AS_IS` in FA-1 and FA-2; `REUSE_ADD_FIELD_SOURCE` with the same
  source name in both.
- **Same decision family, different specifics** → `CONFLICTING_DECISION`.
  Example: `REUSE_ADD_FIELD_SOURCE` in FA-1 (source=D_GetProviderCaseInfo)
  vs `REUSE_ADD_FIELD_SOURCE` in FA-2 (source=D_GetOperatorDetails) — same
  enum value but incompatible sources.
- **Different decision families** → `CONFLICTING_DECISION`. Example:
  `REUSE_AS_IS` in FA-1 vs `NEEDS_REVIEW` in FA-2.
- **Provisional vs Final**: a `Provisional` decision in one FA does NOT
  automatically conflict with a `Final` decision in another — but the
  `resolvedDecision` inherits `Provisional` status (the weakest link rule).
  The conflict is about the *decision value*, not its confidence level.

### Case-type build handoff

One ChangeRequest case, one branch, covering the whole case type — not one per Flow Action (see
SKILL.md §Phase 4). `caseTypeWorkItems` (deduped) plus each Flow Action's own non-shared work
items are the complete authoring backlog for that single branch. The completeness gate above
(§Phase 4 completeness gate) runs once, against the branch, at the end — checking every non-manual
work item across the *entire case type*, not per Flow Action.
