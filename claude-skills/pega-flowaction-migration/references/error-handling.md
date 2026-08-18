# Error Recovery — orchestrator retry and failure handling

This file governs how the orchestrator handles agent failures, PDS MCP tool errors, and
wave-blocking decisions. Read by the orchestrator; individual agents do not need this file
(they simply do their best and return — the orchestrator decides what to do with failures).

## Agent retry policy

- **Incomplete return** (missing output-contract fields): send back to the same agent once,
  naming the exact missing fields. If the second attempt is still incomplete, mark the node
  `NEEDS_REVIEW` with `reason: "agent failed to produce required fields after 2 attempts"`
  and proceed — do not block the wave.
- **Max retries per agent**: 2 (initial + 1 retry). Never retry more than once.
- **Contradictory return** (agent returns findings that conflict with registry entries from
  prior agents): do not auto-resolve — mark `NEEDS_REVIEW` with both sides cited, surface
  the conflict in the manifest's `needsReview[]`. The orchestrator does not guess which is right.

## PDS MCP tool failures

| Failure | Action |
|---|---|
| 403 / permission error | Retry once with environment param omitted (per `xml-mechanics.md` §Envelope). If still 403, mark the rule `NEEDS_REVIEW` with `reason: "403 on pega_get_rule_xml, rule inaccessible"`. |
| Timeout / no response | Retry once after 10 seconds. If still failing, same `NEEDS_REVIEW` treatment. |
| Empty result (valid query, no rows) | Not an error — record as "not found in graph" and fall back to `pega_get_rule_version` per the chain-walk procedure in `agent-roles.md` §Property-Resolution Agent. |
| `neo4j_query` syntax error | Fix the Cypher and retry. Do not count syntax-fix retries against the 2-attempt limit. |
| Wrong environment string | The most common cause of false 403s. Verify with `MATCH (r:Rule) RETURN DISTINCT r.environment, count(*)` and retry with the correct string. See `patterns-meta.md` §Environment name mapping. |

## Wave-blocking rules

- **A failed leaf node does NOT block its parent section's wave.** The parent Section-Analysis
  agent receives the failed node as `status: NEEDS_REVIEW` in its input and treats it as an
  unresolved dependency — its own decision on anything that depends on that node stays Provisional.
- **A failed Section-Analysis agent DOES block its parent section** (if any), since the parent
  cannot synthesize without the child's findings. The orchestrator skips that parent in the
  current wave and schedules it for the next wave with a note explaining the blockage.
- **The final wave (root section + Flow Action rule) always runs**, even if some children are
  `NEEDS_REVIEW` — it produces a `PARTIAL` manifest rather than no manifest at all. A partial manifest
  is vastly more useful than a run that stops mid-analysis with nothing to show.
- **Never silently drop a failed node.** Every failure appears in the manifest's `needsReview[]`
  and `completeness.limitations[]`.

## Checkpointing

- Write the registry to disk **after every wave completes** — if the run is interrupted, the
  registry reflects everything completed up to the last full wave.
- For case-type runs: write the case-type-level registry after each Flow Action's deep-dive
  completes, so a partial run (user stops after N of the selected set) still yields a usable
  partial rollup.
- If the user explicitly stops a run, report what's complete, what's in-progress, and what's
  untouched — never report a partially-analyzed node as analyzed.

## Output Schema Validation

- **Manifest validation check**: Prior to starting Phase 4 (Build handoff), the orchestrator must validate `<FlowAction>_migration_manifest.json` against `references/work-item-manifest-schema.json`.
- **Validation Failure Action**: If validation fails (e.g. due to missing required properties, unrecognized enums like invalid decisions or rule classifications, a `workItems` entry missing `authoringSkill` or `manualReason` as required by its `operation`, or bad structure):
  1. The orchestrator **must block** Phase 4 entirely — no `create-rule`/`update-rule`/`copy-rule` call may be made from an unvalidated manifest.
  2. The orchestrator logs the validation error and notifies the Reconciliation Agent to repair the manifest.
  3. A manifest that violates the schema must never be handed to Phase 4.

