---
name: pega-cross-environment
description: "Compares a rule across the multiple Pega environments PDS MCP's graph spans (currently ~10) -- has a defect already been fixed elsewhere, does this rule differ between two environments (drift), what does a working version of a currently-failing rule look like in an environment where it works. A capability the Rule Authoring plugin cannot offer at all -- it reaches only the one instance it's authenticated against."
---

<!-- Skill version: 1.0.0 | 2026-08-18 -->

# Cross-environment comparison

## What this is, and why it exists
The Rule Authoring plugin holds one OAuth session against **one** Pega instance. PDS MCP's graph
spans however many environments it's been configured/ingested against — confirmed live 2026-08-18:
**10 environments, ~47,632 rules** (`HRLifeImp`, `ODPipeline`, `DenovoImp`, `CCPM`, `OWLM`, `OARCAPP`,
`Deal`, `Office`, `ODH`, `CCPMInt` — re-derive this list live, it grows as more apps get ingested; see
the landmine note below). This asymmetry is a real capability gap the Authoring plugin cannot fill
regardless of which app it's currently pointed at — Companion is the only side of this plugin pair
that can answer "how does this compare to somewhere else."

**Not hypothetical — caught live, same session, both sides, 2026-08-18.** `CCPMInt` is in the graph
(14 rules) but **absent** from the Authoring plugin's `list-available-applications` roster (12 apps,
confirmed `totalCount: 12`, no `CCPMInt` entry). Any rule tagged `r.environment = 'CCPMInt'` has no
live-fallback path through `pega-live-gap-fill` — `switch-application-context` has nothing to target.
This skill's Step 2 environment-presence check is not a defensive formality; it will actually fire in
practice.

## Trigger phrases
"has this defect already been fixed in another environment", "does this rule differ between DEV and
PROD", "what does the working version of this rule look like elsewhere", "compare this rule across
environments", "is this a drift issue", any question that requires seeing the same logical rule in
more than one `r.environment`.

## Nothing below is a fixed fact — re-derive live, every session
The environment count, names, and rule totals are a snapshot. Also load `pega-neo4j-cypher-querying`
§0 before writing any query here — the tool-level `environment` parameter (Axis A) and the
`r.environment` property (Axis B) are two different things with two different value sets, and this
skill's whole job is comparing across the property axis, so getting that landmine wrong here is
worse than usual. **A known live trap**: PDS MCP's own `neo4j_query` tool description lists an
example environment set that is stale relative to the graph's real values (confirmed 2026-08-18 —
four listed values don't exist, three real ones aren't listed). Never trust the tool docstring's
example list; always run the discovery query below first.

## Procedure

**Step 1 — Discover the real environment set, live, every time.**
```cypher
MATCH (r:Rule) RETURN DISTINCT r.environment AS env, count(r) AS n ORDER BY n DESC
```
Don't reuse a remembered list from a prior session or from this skill's own text above — it's a
snapshot, and the set grows as more apps get ingested.

**Step 2 — Resolve the rule identically in each candidate environment.** A rule's `pzinskey` is not
portable across environments (different instances, different key sequences) — match on
`rule_name` + `rule_type` (+ `class_name` if the name alone is ambiguous, same disambiguation
discipline as `pega-neo4j-cypher-querying`), scoped per environment:
```cypher
MATCH (r:Rule)
WHERE r.environment = '<Env>' AND toLower(r.rule_name) = toLower('<exact name>')
  AND r.rule_type = '<rule_type>'
RETURN r.pzinskey, r.class_name, r.ruleset, r.ruleset_version, r.is_stub, r.updated_at
```
Run this once per environment being compared. **A rule present in one environment and absent in
another is itself a finding** — don't treat "not found" as an error to route around; it's frequently
the actual answer (the fix hasn't been promoted there yet, or the app doesn't exist in that
environment at all).

**Step 3 — Metadata-level comparison first (fast, always available).** Before fetching any content,
compare what the graph already has: `ruleset`/`ruleset_version` (is one environment ahead of
another?), `is_stub` (is it a real business rule in one environment but only a referenced stub in
another — usually means the app doesn't own that rule there), `updated_at` (a large gap is itself a
signal worth surfacing even before a content diff). State this comparison plainly — it often answers
"does this differ" without needing Step 4 at all.

**Step 4 — Content-level diff, only when metadata isn't enough.** If the question needs to know
*what* differs, not just *whether*, fetch each environment's rule content (`get_rule_summaries` first,
`pega_get_rule_xml` as the escalation — same summaries-before-XML discipline as
`pega-code-review`/`pega-log-diagnosis`) and diff structurally: which steps/properties/conditions
differ, not just "they're different." **This step is less proven than Steps 1-3** — it depends on
PDS MCP actually being configured with live Pega credentials for each environment being compared
(`config.py`'s per-environment `PEGA_CONFIGS`), which varies by deployment. If a fetch for a given
environment fails or is unauthorized, say so plainly and fall back to the metadata-level comparison
from Step 3 for that environment rather than silently dropping it from the report.

**Step 5 — Fold into the calling context, don't re-derive its job.** This skill answers "how does
X differ across environments" — it doesn't diagnose *why* on its own. When the trigger was "this rule
is failing in PROD," hand the working-environment's version back to `pega-log-diagnosis` as the
comparison baseline for root-causing the PROD failure, rather than this skill trying to conclude the
root cause itself. When the trigger was "has this already been fixed," the answer here (found /
not found / found-but-different) is usually the whole answer — no further handoff needed.

## What NOT to do
- Don't hardcode the environment list from this file's text or from the `neo4j_query` tool's own
  docstring example — both are known to drift; Step 1's live discovery query is mandatory, not a
  suggestion.
- Don't assume a `pzinskey` is comparable across environments — it isn't; match on name+type, not key.
- Don't treat "not found in environment X" as a failure state — it's frequently the actual finding
  (not promoted yet, or the app doesn't exist there).
- Don't skip straight to Step 4's content fetch when Step 3's metadata comparison already answers the
  question — content diffing is the expensive path, reserve it for when the metadata genuinely isn't
  enough.
- Don't conclude this skill's job includes root-causing a failure — that's `pega-log-diagnosis`'s
  job; this skill supplies the cross-environment comparison it needs, not a substitute diagnosis.
