# Case-Type Enumeration — Phase 0a/0b procedure

This file governs the **Case Type entry point**. It is read by the orchestrator only, before any
subagent dispatch, and only when Phase 0's entry-point detection (SKILL.md §Phase 0) resolves the
given name to a `Rule-Obj-CaseType` rather than a `Rule-Obj-FlowAction`. If the entry point is a
Flow Action, none of this file applies — use the existing single-Flow-Action Phase 0/1 unchanged.

A case type run is **always two-phase**: Phase 0a (inventory) always runs and always stops for
review before any deep analysis; Phase 0b (deep-dive) only runs on an explicit follow-up
invocation naming which Flow Action(s) from the inventory to analyze. Never auto-proceed from 0a
to 0b — the cost difference between the two is large (0a is a handful of graph queries and light
XML fetches; 0b re-runs the full single-Flow-Action machinery, which on its own has needed
multiple background agent dispatches and 450K+ subagent tokens for one mid-size Flow Action).

## Environment name mapping

Resolved fresh per engagement — see `patterns-meta.md` §Environment name mapping and §Precedent
grounding. The literal `environment` graph values used for the HRLifeImp engagement
(`HRLifeImp`, `OARCAPP`, `OWLM`, `ODPipeline`) are a worked example, not a fixed list. Confirm with
`MATCH (r:Rule) RETURN DISTINCT r.environment, count(*)` if unsure which strings apply to the
current engagement.

## Phase 0a — Inventory

### Step 1 — resolve the Case Type identity

```cypher
MATCH (r:Rule) WHERE r.environment = '<env>' AND r.rule_name = '<CaseTypeName>'
  AND r.pzinskey STARTS WITH 'RULE-OBJ-CASETYPE '
RETURN r.pzinskey, r.class_name
```

Same identity discipline as the Flow-Action path: `(class_name, rule_name)` is the real identity,
never bare name; take the latest `pzinskey` timestamp within one identity. Note the class name
convention seen in practice — e.g. `PDS-HRLifeImp-Work-ContractRequest`, not a guessable label.

### Step 2 — enumerate the Flow Action set (proven Cypher pattern)

**Do not trust `rule_type` as a filter** — some Flow/FlowAction graph nodes have `rule_type`
overwritten with their `class_name`, which silently undercounts if you filter on it. Always match
by `pzinskey STARTS WITH 'RULE-OBJ-FLOW '` / `'RULE-OBJ-FLOWACTION '` instead.

```cypher
MATCH (ct:Rule {pzinskey:'<CaseTypeKey>'}) WHERE ct.environment='<env>'
MATCH (ct)-[:REFERENCES]->(f1:Rule) WHERE f1.pzinskey STARTS WITH 'RULE-OBJ-FLOW '
OPTIONAL MATCH (f1)-[:REFERENCES]->(f2:Rule) WHERE f2.pzinskey STARTS WITH 'RULE-OBJ-FLOW '
OPTIONAL MATCH (f2)-[:REFERENCES]->(f3:Rule) WHERE f3.pzinskey STARTS WITH 'RULE-OBJ-FLOW '
WITH ct, collect(DISTINCT f1)+collect(DISTINCT f2)+collect(DISTINCT f3) AS flows
UNWIND flows AS f
MATCH (f)-[rel:REFERENCES]->(fa:Rule) WHERE fa.pzinskey STARTS WITH 'RULE-OBJ-FLOWACTION '
RETURN DISTINCT fa.rule_name, fa.class_name, fa.pzinskey, rel.ref_category, f.rule_name AS viaFlow
```

Also check for Flow Actions referenced **directly on the case type** (not via a flow) — these
exist and matter (e.g. `pyChangeStage`, `pyReopen`, `pyUpdateCaseDetails` are commonly wired this
way):

```cypher
MATCH (ct:Rule {pzinskey:'<CaseTypeKey>'}) WHERE ct.environment='<env>'
MATCH (ct)-[rel:REFERENCES]->(fa:Rule) WHERE fa.pzinskey STARTS WITH 'RULE-OBJ-FLOWACTION '
RETURN DISTINCT fa.rule_name, fa.class_name, fa.pzinskey, rel.ref_category
```

`rel.ref_category` distinguishes:
- **explicit** — a direct assignment-shape reference, or a Flow Action wired directly onto the
  case type. Higher confidence this Flow Action is genuinely reachable/used.
- **implicit** — resolved from a `pyFlowName` string match rather than a structural edge. Still
  real, but carry the distinction into the inventory rather than treating both the same.

Real scale to expect (confirmed on HRLifeImp): `PDS-HRLifeImp-Work-ContractRequest` ≈ 24 distinct
Flow Actions (21 nested + 3 case-wide direct); `PDS-HRLifeImp-Work-Change` ≈ 18. Constellation-
native case types (OARCAPP/OWLM) are typically much leaner — single digits, sometimes zero
`REFERENCES` at all for simple case types. Don't assume every case type is large; check first.

### Step 3 — filter stub / framework-default Flow Actions

Some referenced Flow Actions resolve to **STUB nodes** — unindexed base/framework rules never
overridden in the target ruleset (`is_stub=true`, or a node with metadata only, no real XML to
fetch). These are standard Pega defaults shared across nearly every case type, not migration
targets. Maintain a seeded, extensible exclusion list:

```
Create, pyReopen, pyChangeStage, pyUpdateCaseDetails
```

For each Flow Action found in Step 2, check `is_stub` on its node and cross-reference against this
list. Anything matching either condition is excluded from deep-dive scope but **still recorded in
the inventory** with `status: "skipped-stub"` and the reason — never silently drop it, since a
reviewer may want to override.

### Step 4 — cross-check against the case type's own XML (lightweight)

Unlike the Flow-Action→section traversal (where the graph badly over/under-counts and XML is the
only source of truth), this case-type→flow-action traversal is a **clean graph walk** — confirmed
by direct comparison against case-type XML in prior investigation. The XML cross-check here is a
light confirmation pass, not a full re-derivation:

```
pega_get_rule_xml on the case type's own pzinskey
```

Read `pyStages`/`Embed-Stage` (`pyStageID`, `pyStageName`) and their nested `pyProcesses`
(`Embed-StageProcess`, `pyFlowName`/`pxFlowID`). Confirm the stage/process names line up with what
the graph traversal returned — if a stage/process appears in the XML with no corresponding flow
found in Step 2, note it as a gap to investigate, don't silently ignore it.

### Step 5 — rough size signal (cheap, root-section-only)

For each surviving (non-excluded) Flow Action, fetch **only its root section's XML length**
(don't walk the full dependency tree — that's Phase 0b's job). Bucket as:
- **Small** — root section XML well under ~50K chars, no early sign of deep nesting
- **Medium** — 50K-150K chars
- **Large** — 150K+ chars, or multiple immediately-visible large sub-section includes

This is a cheap heuristic (one fetch per Flow Action), not a promise — its only purpose is to
inform Phase 0b's outer-wave batching (SKILL.md §Outer-wave concurrency) so two "large" Flow
Actions never get scheduled in the same concurrent batch.

### Step 6 — write the inventory artifact and stop

Produce `<CaseType>_flowaction_inventory.json`:

```json
{
  "caseType": { "name": "", "class": "", "pzinskey": "", "environment": "" },
  "stages": [ { "stageId": "", "stageName": "", "processes": [ { "flowName": "", "pxFlowID": "" } ] } ],
  "flowActions": [ {
      "name": "", "class": "", "pzinskey": "",
      "owningStage": "", "owningProcess": "", "nestingPath": ["viaFlow1", "viaFlow2"],
      "refCategory": "explicit | implicit",
      "status": "candidate | skipped-stub | skipped-excluded",
      "sizeSignal": "small | medium | large | unknown"
  } ],
  "summary": { "totalFound": 0, "candidatesForDeepDive": 0, "skippedStubs": 0 }
}
```

**Stop here.** Present the inventory and summary to the user. Do not proceed to Phase 0b without
an explicit follow-up naming which Flow Action(s) (or "all") to deep-dive.

## Phase 0b — Deep-dive (only on explicit selection)

For each selected Flow Action, run the **existing, unmodified** single-Flow-Action Phase 0-3
exactly as documented in SKILL.md and the other reference files — same Cardinal parsing rules,
same wave structure, same per-FA registry/manifest. Nothing about the inner per-FA machinery
changes at case-type scope; only the outer scheduling and final rollup differ (see SKILL.md
§Outer-wave concurrency and §Case-Type Reconciliation Agent).

Do not merge Flow Actions' trees. Each keeps its own independent registry file and Work-Item
Manifest — the Case-Type Reconciliation Agent rolls these up afterward (see
`output-contracts.md` §Case-Type outputs), it does not change how any individual Flow Action is
analyzed. Phase 4 (build handoff) then runs **once**, against the rolled-up case-type manifest,
not once per Flow Action (`output-contracts.md` §Case-type build handoff).
