---
name: pega-impact-analysis
description: "Proactive enterprise-wide impact analysis for a proposed rule change — 'what breaks, who's affected, what must be done' BEFORE the change is made. Mirrors IdentifAI-Graph's impact_analysis_agent.py exactly (markdown-header format, deterministic risk rubric, 3-hop blast radius), grounded live against a confirmed false-positive multi-app risk case. Composes pega-neo4j-cypher-querying/pega-feature-node-retrieval/pega-live-gap-fill rather than duplicating them. The proactive mirror of pega-log-diagnosis, which is reactive/post-incident."
---

<!-- Skill version: 1.0.0 | 2026-08-17 -->

# Change-impact analysis: rule → blast radius → risk level → change requirements

## Trigger phrases
"what happens if I change X", "is it safe to modify X", "impact of changing X", "what breaks if I
touch this rule" — asked **before** a change is made, as part of planning it. This is the proactive
mirror of `pega-log-diagnosis` (reactive, post-incident) — same underlying graph machinery, opposite
direction in time. If the question is about an error that already happened, use `pega-log-diagnosis`
instead.

## What this is, and what it isn't
`IdentifAI-Graph/backend/agents/impact_analysis_agent.py` does exactly this job today, via a
LangChain `AgentExecutor` scoped to `GRAPH_TOOLS` (`neo4j_query` + `get_schema` only — no rule-content
fetch, no Feature-node access). Its `_SYSTEM_PROMPT`, read directly, is the ground truth for output
shape — **don't improvise a different format**:

- **Markdown `##` headers**, not `diagnosis_agent.py`'s plain-caps style — these are two genuinely
  different report formats in the same codebase; preserve each exactly, don't homogenize them.
- **A deterministic risk rubric** (below) — compute it from confirmed counts, don't eyeball it.
- **3-hop blast radius**, not `pega-log-diagnosis`'s 4-hop default — the agent's own contract says
  "transitive callers up to 3 hops," so this skill's recipe uses `*1..3`, not `pega-neo4j-cypher-querying`
  §6's `*1..4` blast-radius recipe verbatim — adjust the hop bound when reusing it here.

**What this skill adds that `impact_analysis_agent.py` doesn't have**: no Feature-node/business-impact
grounding (same gap `pega-log-diagnosis` closed for `diagnosis_agent.py`) — folded into "Change
Requirements" below, not a new top-level section, same discipline as before. Also: the agent's own
tool scope can't fill a graph gap (no live-Pega fallback) — this skill hands off to
`pega-live-gap-fill` when the graph has nothing.

**Compose, don't duplicate**: rule disambiguation and blast-radius mechanics reuse
`pega-neo4j-cypher-querying`'s recipes (with the 3-hop adjustment above); business-impact grounding reuses
`pega-feature-node-retrieval`; graph gaps hand off to `pega-live-gap-fill`. Once impact is understood, the
actual change mechanics belong to the plugin's own bundled runtime skill
(`get-skill("methodology-change-request-workflow")`) — this skill stops at "here's the impact," it
doesn't author the change itself.

## Procedure

**Step 0 — Resolve the exact rule instance being proposed for change.** You need one specific
`pzInsKey`, not "a rule with this name" — use `pega-neo4j-cypher-querying`'s disambiguation recipe (§6
there) if the name search returns more than one match. Getting this wrong means every step below
analyzes the wrong rule's blast radius.

**Step 1 — Full neighbourhood: who owns it, who calls it directly.**
```cypher
MATCH (r:Rule {pzinskey: '<pzinskey>'})
WHERE r.environment = '<Env>'
OPTIONAL MATCH (a:App)-[:RESOLVED_RULE]->(r)
OPTIONAL MATCH (caller:Rule)-[ref:REFERENCES]->(r)
RETURN collect(DISTINCT a.name) AS owningApps,
       collect(DISTINCT {name: caller.rule_name, type: caller.rule_type, category: ref.ref_category}) AS directCallers
```

**Step 2 — Blast radius: transitive callers up to 3 hops** (matches the agent's own contract — not
4). Reuse `pega-neo4j-cypher-querying`'s `ref_category` filter (§4), adjusted to `*1..3`:
```cypher
MATCH (target:Rule {pzinskey: '<pzinskey>'})
MATCH path = (caller:Rule)-[refs:REFERENCES*1..3]->(target)
WHERE caller.environment = '<Env>'
  AND ALL(rel IN refs WHERE rel.ref_category IN
      ['explicit','step:Call','step:precond_when','dt:when_condition','dp:load_activity',
       'dp:report_definition','dp:data_transform','flow:subprocess_shape','flow:utility_shape',
       'flow:sla','flow:decision_impl','casetype:case_wide_action','casetype:process_list',
       'casetype:alt_stage_flow','casetype:starting_flow','expr:library_function',
       'expr:qualified_library_function','fa:pyValidateActivity','fa:pyPreProcessingActivity',
       'fa:pyPreProcessingTransformRule','fa:pyActionTransformRule','fa:pyLocalActionActivity',
       'fa:pyAuditActivity','fa:when_condition','sla:advance_flow','sla:advance_flow_activity',
       'sla:action_when','sla:activity','svc:segment_activity','svc:service_activity',
       'svc:rest_method_activity','step:Property-Map-DecisionTable','step:Branch',
       'qp:activity','jobsched:activity','js:flowAction']
      OR rel.ref_category STARTS WITH 'casetype:stage_flow:'
      OR rel.ref_category STARTS WITH 'casetype:stage_skip_when:')
RETURN DISTINCT caller.rule_name, caller.rule_type, caller.class_name, min(length(path)) AS hops
ORDER BY hops
LIMIT 200
```
Count the distinct rows — this is the "dependent rules" count the risk rubric (Step 6) needs.

**Confirmed live bug in this exact recipe, caught during end-to-end testing before this skill
shipped**: for a `Rule-UI-View` (or other UI-shaped rule — `Rule-HTML-Section`, `Rule-HTML-Paragraph`,
etc.), the filter above returns **zero** rows for a rule with **confirmed real callers**. Tested on
`AddressInfo` (OWLM): Step 1 found 2 direct callers (`CollectBasicInformation`, `EditBasicInformation`,
both `Rule-UI-View`, both category `ui:reference_child` — "this section is embedded inside that one"),
but Step 2's filtered query returned empty, because `ui:reference_child`/`ui:pyInclude`/
`ui:deferload_child` are excluded as noise by `pega-neo4j-cypher-querying`'s filter — correctly, for
activity/logic-rule impact analysis, but **wrongly** for a UI rule's own blast radius, where "which
section embeds this one" *is* the load-bearing dependency, not noise. **For any rule whose `rule_type`
is UI-shaped, add `ui:reference_child`, `ui:pyInclude`, `ui:deferload_child` to the filter list** —
otherwise this step silently reports "no dependents" on a rule that demonstrably has real callers,
which would wrongly compute LOW risk in Step 6 for something that isn't. Check the target's
`rule_type` before running Step 2 and choose the filter accordingly; don't apply the logic-bearing
filter unconditionally.

**Step 3 — Multi-app presence, with the disambiguation this rubric actually needs.** The naive check
("does this rule name exist in other environments") produces false positives — **confirmed live**:
`AddressInfo` exists in both `OWLM` (`Rule-UI-View` on the `OWLM` ruleset) and `HRLifeImp`
(`Rule-Obj-Property` on the `PDS` ruleset) — completely unrelated rules that happen to share an
English-word name, not a shared/framework rule at real cross-app risk. Check `rule_type` and
`ruleset` before counting a name match as genuine multi-app exposure:
```cypher
MATCH (r:Rule) WHERE toLower(r.rule_name) = toLower('<name>')
RETURN r.environment, r.rule_type, r.class_name, r.ruleset, r.pzinskey
```
Only environments where `rule_type` matches **and** the `ruleset` is the same (or is a ruleset known
to be in multiple apps' stacks — check via `pega-neo4j-cypher-querying`'s ruleset-stack recipe) represent
real cross-app exposure. A same-name, different-type/different-ruleset hit in another app is a
naming coincidence — exclude it from the app count, don't let it inflate risk to HIGH/CRITICAL.

**Step 4 — Override chain, both directions.** `OVERRIDES` is `Rule → Rule`, confirmed live
(`pega-neo4j-cypher-querying` §2) — check both what overrides *this* rule and what *this* rule itself
overrides, they mean different things for risk:
```cypher
// Child-class specializations that override this rule — a parent-rule change may not
// propagate to these, causing inconsistent behavior. This is the agent's "Override Risk" section.
MATCH (child:Rule)-[o:OVERRIDES]->(r:Rule {pzinskey: '<pzinskey>'})
WHERE child.environment = '<Env>'
RETURN child.pzinskey, child.rule_name, child.ruleset, child.ruleset_version, o.created_at

// What this rule itself overrides — if this rule were removed instead of changed, the shadowed
// base-ruleset behavior would resurface. Worth surfacing even though the agent's own format doesn't
// have a dedicated slot for it — fold into Override Risk as a second finding.
MATCH (r:Rule {pzinskey: '<pzinskey>'})-[o:OVERRIDES]->(base:Rule)
WHERE r.environment = '<Env>'
RETURN base.pzinskey, base.rule_name, base.ruleset, base.ruleset_version, o.created_at
```

**Step 5 — Business impact (the gap this skill closes over the agent's own output).** Run
`pega-feature-node-retrieval`'s procedure anchored on this specific `pzInsKey`, same as
`pega-log-diagnosis` step 5 — find the owning Feature's `title`/`business_summary` if one exists, or
say plainly that no Feature node covers it. Fold this into **Change Requirements** below as "which
business process/stakeholders should be notified," not a new top-level section — the agent's own
format has no slot for it, and this skill's value-add is filling that gap without breaking the shape.

**Step 6 — Risk level, computed, not estimated.** Exact thresholds from `impact_analysis_agent.py`'s
own prompt — apply them mechanically from Steps 1-4's confirmed counts:
- **LOW** — 1 app, <5 dependent rules (Step 2's count), no overrides in either direction.
- **MEDIUM** — 1 app, 5-20 dependent rules, or has child-class specializations (Step 4's first query
  non-empty).
- **HIGH** — 2+ apps (Step 3's *disambiguated* count, not the raw name-match count) or >20 dependent
  rules.
- **CRITICAL** — 3+ apps, or a framework-level rule (ruleset shared across many apps' stacks) with
  50+ dependents.

**Step 7 — If any step above found nothing where you expected something** (rule missing from the
graph entirely, blast radius suspiciously empty), that's `pega-live-gap-fill`'s scenario — confirm
live before reporting "no dependents" as if it were a confirmed fact rather than a graph gap.

**Step 8 — Report, in `impact_analysis_agent.py`'s exact format** — markdown headers, not plain caps:

```
## Impact Analysis: {rule_name}

### Proposed Change
{what's being changed and why}

### Risk Assessment
RISK LEVEL: [LOW / MEDIUM / HIGH / CRITICAL]
{one line justifying it against the Step 6 thresholds, citing the actual counts}

### Affected Applications
{each app and its dependent-rule count within it — from Step 1/3, disambiguated}

### Dependency Map
{direct callers from Step 1, and the notable transitive ones from Step 2}

### Override Risk
{child-class overrides from Step 4, both directions if both are non-empty}

### Change Requirements
{which apps need regression testing, which specializations need review, which teams/business
processes need notification (Step 5's Feature-node finding goes here), whether a coordinated
multi-app deployment is required}

### Recommendation
{PROCEED / PROCEED WITH CAUTION / BLOCK — brief justification tied to the risk level}
```

Per the agent's own `<language_rules>`: **be definitive** — name exact rule names, app names, and
counts from the query results, don't hedge. If the graph has no data for the rule at all (and
`pega-live-gap-fill` also confirms it's genuinely missing, not just a graph gap), state that
explicitly and mark risk **UNKNOWN**, not a guessed level.

**Step 9 — Hand off, don't author.** Once impact is understood and the user wants to proceed, the
actual change belongs to the plugin's own bundled workflow — `get-skill("methodology-change-request-
workflow")` — not this skill. This skill's job ends at "here's what you're dealing with."

## What NOT to do
- Don't use `diagnosis_agent.py`'s plain-caps report format here, or this format for diagnosis —
  they're deliberately different in the source, preserve both.
- Don't use a 4-hop blast radius here — this agent's contract is 3 hops, confirmed from its own
  prompt; `pega-log-diagnosis`'s 4-hop default doesn't apply to this skill.
- Don't count a same-name rule in another environment as multi-app risk without checking `rule_type`
  and `ruleset` — confirmed live false positive (`AddressInfo`, unrelated `Rule-UI-View` vs
  `Rule-Obj-Property`). This is the single easiest way to over-state risk to HIGH/CRITICAL wrongly.
- Don't eyeball the risk level — compute it from Step 6's thresholds against Steps 1-4's actual
  counts, and cite the counts in the report.
- Don't add a "Business Impact" top-level section — fold Feature-node findings into "Change
  Requirements," matching how `pega-log-diagnosis` folds it into "Impact Analysis" rather than adding
  a fifth section there.
- Don't author the actual rule change as part of this skill — hand off to the plugin's
  `methodology-change-request-workflow` runtime skill once impact is understood.
- Don't report "no dependents" or "no overrides" as a confirmed finding without considering whether
  it's actually a graph gap (`pega-live-gap-fill`) — especially for a rule the graph might not have
  full closure coverage for.
