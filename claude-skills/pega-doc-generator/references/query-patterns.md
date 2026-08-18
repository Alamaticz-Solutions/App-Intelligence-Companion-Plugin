# Query patterns for the 22-step autonomous review

<!-- Reconstructed 2026-08-18: the original `pega-doc-generator.skill` import (from
     `Downloads/pega-doc-generator.skill`) never actually contained this file, despite SKILL.md
     referencing it in 4 places — confirmed by extracting the original .skill archive, which
     contains only SKILL.md. Written fresh, grounded against a live `get_schema` call and a live
     rule_type distribution check on the OWLM environment (2026-08-18) rather than guessed. -->

All queries below use `pega-neo4j-cypher-querying`'s conventions — confirm the live `r.environment`
value first (its §0), and prefer `toLower(...) CONTAINS toLower(...)` for name matching. Replace
`<App>` with the confirmed environment value and `<AppRuleset>`/`<pzinskey>` as needed throughout.

**Rule-type grounding**: the type strings below are confirmed present in the graph as of 2026-08-18
(`MATCH (r:Rule) RETURN DISTINCT r.rule_type, count(*)` scoped to `OWLM`, plus a full-graph check for
several types not seen there). Where a step's expected rule type was **not found anywhere in the
current graph** (noted per-step below), say so plainly in Phase 1's summary rather than silently
returning an empty section — that's a real "not present in this app" finding, or a graph-coverage
gap worth flagging, not something to paper over.

## Step 1.1 — Rule inventory + case types
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.is_stub = false
RETURN r.rule_type, count(*) AS n ORDER BY n DESC
```
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.rule_type = 'Rule-Obj-CaseType' AND r.is_stub = false
RETURN r.rule_name, r.class_name, r.pzinskey
```

## Step 1.2 — Ruleset stack + cross-ruleset references
```cypher
// environment: n/a — :App/:Ruleset have no environment property (pega-neo4j-cypher-querying §6 no-op workaround)
MATCH (a:App {name: '<App>'})-[h:HAS_RULESET]->(rs:Ruleset)
RETURN rs.name, h.stack_rank, h.is_branch, rs.ceiling_major, rs.ceiling_minor, rs.ceiling_patch
ORDER BY h.stack_rank
```
Cross-ruleset references — rules in this app's rulesets that reference a rule in a *different*
ruleset (a "built-on" dependency):
```cypher
MATCH (r:Rule)-[:REFERENCES]->(dep:Rule)
WHERE r.environment = '<App>' AND dep.ruleset <> r.ruleset AND dep.is_stub = false
RETURN DISTINCT dep.ruleset, count(DISTINCT dep.rule_name) AS distinct_rules_referenced
ORDER BY distinct_rules_referenced DESC
```
Per PRINCIPLE 7 / this skill's own scope rule: only document a built-on rule if it's directly
referenced by an application rule (the query above already enforces that by construction — it never
walks past one hop into the built-on ruleset's own dependencies).

## Step 1.3 — Rule resolution, overrides, circumstances
Local overrides (same name, present in both app and a built-on ruleset):
```cypher
MATCH (r1:Rule), (r2:Rule)
WHERE r1.environment = '<App>' AND r2.environment = '<App>'
  AND toLower(r1.rule_name) = toLower(r2.rule_name) AND r1.rule_type = r2.rule_type
  AND r1.ruleset <> r2.ruleset AND r1.pzinskey < r2.pzinskey
RETURN r1.rule_name, r1.rule_type, collect(DISTINCT r1.ruleset) AS ruleset_a, collect(DISTINCT r2.ruleset) AS ruleset_b
LIMIT 100
```
Circumstanced rules (see also `pega-neo4j-cypher-querying`'s circumstance-variant recipe for the
`SPECIALIZED_BY` direction, which is the more reliable way to enumerate these):
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.circumstanced = true
RETURN r.rule_name, r.rule_type, r.circumstance_type, r.circumstance_val, r.pzinskey
```
Ruleset version locking — open-ended vs pinned, inferred from whether multiple `ruleset_version`
values exist for the same `(rule_name, rule_type, ruleset)`:
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.is_stub = false
WITH r.rule_name AS name, r.rule_type AS type, r.ruleset AS rs, collect(DISTINCT r.ruleset_version) AS versions
WHERE size(versions) > 1
RETURN name, type, rs, versions
```

## Step 1.4 — Class hierarchy
```cypher
// environment: n/a — :Class has no environment property
MATCH (c:Class) WHERE c.class_name STARTS WITH '<AppClassPrefix>' AND c.is_app_class = true
RETURN c.class_name, c.depth ORDER BY c.depth, c.class_name
```
Full ancestor chain for a specific class (see `pega-neo4j-cypher-querying` §6 for the canonical form):
```cypher
// environment: n/a — :Class has no environment property, this comment only satisfies the tool's text check
MATCH path = (c:Class {class_name: '<ClassName>'})-[:INHERITS_FROM*1..10]->(ancestor:Class)
RETURN [n IN nodes(path) | n.class_name] AS chain
```

## Step 1.5 — Flows and stage maps
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.rule_type = 'Rule-Obj-Flow' AND r.is_stub = false
RETURN r.rule_name, r.class_name, r.pzinskey
```
Flow-to-flow-action and flow-to-subprocess edges (walk `REFERENCES` with the flow-specific
`ref_category` values — see `pega-neo4j-cypher-querying` §4 for the full taxonomy):
```cypher
MATCH (flow:Rule {pzinskey: '<flow_pzinskey>'})-[ref:REFERENCES]->(dep:Rule)
WHERE ref.ref_category IN ['flow:subprocess_shape','flow:utility_shape','flow:sla','flow:decision_impl','casetype:starting_flow']
   OR ref.ref_category STARTS WITH 'casetype:stage_flow:'
RETURN dep.rule_name, dep.rule_type, ref.ref_category
```
Then `get_rule_summaries` on the flow's own `pzinskey` for stage names, sequence, decision branches,
and sub-case creation signatures (`CreateCase`/`pxCreateCase`/`pyCreateSubcase` — these appear in the
summary's Technical Steps, not as a separate graph relationship). Wait/timer conditions are also
summary-only; there's no dedicated relationship type for them in this graph.

## Step 1.6 — Case hierarchy
No dedicated `:CREATES_CASE`-style relationship exists in this graph — parent→child case creation is
visible only in a flow's rule summary (the same `CreateCase`/`pxCreateCase`/`pyCreateSubcase` calls
found in Step 1.5). Cross-reference `Rule-Obj-CaseType`'s own `REFERENCES` edges to case-type-shaped
targets as a starting point, then confirm/fill in from summaries — don't claim a parent→child edge
exists in the graph structurally when it's actually summary-derived.

## Step 1.7 — Portal and navigation
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.rule_type IN
  ['Rule-Portal','Rule-HTML-Harness','Rule-HTML-Section','Rule-UI-View','Rule-UI-View-LandingPage']
  AND r.is_stub = false
RETURN r.rule_type, r.rule_name, r.pzinskey ORDER BY r.rule_type, r.rule_name
```
Build the Portal → Tab → Landing Page → Harness → Section → Fields chain by walking `REFERENCES`
from the portal rule forward (`ref_category` values here are typically UI-shaped, e.g.
`ui:deferload_child` and similar — cross-check `pega-neo4j-cypher-querying` §4's full taxonomy for
what's currently enumerated; this is one of the noisier categories per that skill's own guidance, so
expect to filter). Use `get_rule_summaries` for field labels, instructions, and button captions —
those live in the summary text, not as graph properties.

## Step 1.8 — Security: personas, roles, privileges, deny rules
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.rule_type IN
  ['Rule-Persona','Rule-Access-Role-Name','Rule-Access-Role-Obj','Rule-Access-Privilege']
  AND r.is_stub = false
RETURN r.rule_type, r.rule_name, r.pzinskey ORDER BY r.rule_type, r.rule_name
```
`Rule-Access-Role-Obj` rows are the actual Role×Class×Action grants/denies — fetch their summaries
and look explicitly for deny entries (the summary states this in plain text; there's no separate
`is_deny` graph property). Build the Role × Action × Case Type matrix from these summaries, and flag
every deny rule found per PRINCIPLE 5 — a deny always overrides a grant, so it changes the story.

## Step 1.9 — Top-level entry points (Feature discovery) — "Query 8"
Two complementary approaches — run both, they catch different shapes of "top level":
```cypher
-- 8a. Rules with no incoming REFERENCES within the app (classic entry-point signature)
MATCH (r:Rule)
WHERE r.environment = '<App>' AND r.is_stub = false
  AND NOT (r)<-[:REFERENCES]-()
  AND r.rule_type IN ['Rule-Obj-CaseType','Rule-Obj-Flow','Rule-Async-QueueProcessor',
                       'Rule-Async-JobScheduler','Rule-Service-REST','Rule-Service-File',
                       'Rule-Service-Email','Rule-Connect-REST','Rule-Obj-Activity']
RETURN r.rule_type, r.rule_name, r.pzinskey
ORDER BY r.rule_type, r.rule_name
```
```cypher
-- 8b. Prefer a Feature node's own root if one already exists — cheaper, pre-computed
MATCH (f:Feature) WHERE f.environment = '<App>'
RETURN f.title, f.root_type, f.root_identifier, f.root_rule_name, f.root_pzinskey, f.business_summary
ORDER BY f.title
```
Confirmed rule types for the special-handling cases this step calls out: `Rule-Async-QueueProcessor`,
`Rule-Async-JobScheduler`, `Rule-Service-REST`/`Rule-Service-File`/`Rule-Service-Email`,
`Rule-Connect-REST` are all present in the graph (2026-08-18 check). For each Queue Processor found,
check whether its callers are all within `<App>` or whether `REFERENCES` edges originate from a
*different* `r.environment` — that's the "triggered from a different application" signal Step 1.9
asks for.

## Step 1.10 — Data model (properties)
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.rule_type = 'Rule-Obj-Property' AND r.is_stub = false
RETURN r.class_name, count(*) AS property_count
ORDER BY property_count DESC
```
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.rule_type = 'Rule-Obj-Property'
  AND r.class_name = '<ClassName>' AND r.is_stub = false
RETURN r.rule_name, r.pzinskey
```
"Unique identifier / required / system-generated / calculated" flags aren't separate graph
properties — pull them from `get_rule_summaries` per property, or (cheaper, if the property count is
large) sample the class's key properties first rather than fetching every property's summary.

## Step 1.11 — Decision logic
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.rule_type IN
  ['Rule-Obj-Model','Rule-Declare-DecisionTable','Rule-Declare-DecisionTree','Rule-Obj-When',
   'Rule-Declare-Expressions','Rule-Declare-Trigger']
  AND r.is_stub = false
RETURN r.rule_type, r.rule_name, r.class_name, r.pzinskey
ORDER BY r.rule_type, r.rule_name
```
All six types confirmed present in the graph (`Rule-Declare-Trigger` is rare — 3 rows graph-wide as
of this check, don't be surprised if an app has none). Flag any Decision Table whose summary
indicates more than ~6 conditions or nested `OR` logic as needing its own dedicated subsection in the
Platform-Agnostic spec, per this step's own instruction.

## Step 1.12 — Field values (dropdown options)
**Not confirmed present in this graph as of 2026-08-18** — a full-graph search for `FieldValue`/
`Field-Value` in `rule_type` returned zero rows. This may mean the graph builder doesn't currently
ingest `Rule-Obj-FieldValue` as a distinct node type, or that no ingested app happens to use it
heavily enough to show up. **Don't silently skip this step** — try the query below, and if it
returns nothing, say so explicitly in the Phase 1 summary ("Field Values: not present in graph — may
need a live check via the authoring plugin's `get-rule`/`list-rules` with `ruleType=Rule-Obj-
FieldValue`, or the app genuinely has none") rather than presenting an empty section as if it were a
confirmed finding.
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.rule_type = 'Rule-Obj-FieldValue' AND r.is_stub = false
RETURN r.class_name, r.rule_name, r.pzinskey
LIMIT 200
```

## Step 1.13 — SLA rules
**Rule type is `Rule-Obj-ServiceLevel`, not `Rule-Obj-SLARule`** — confirmed live (55 rows
graph-wide as of this check); don't guess the other name.
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.rule_type = 'Rule-Obj-ServiceLevel' AND r.is_stub = false
RETURN r.rule_name, r.class_name, r.pzinskey
```
Goal/deadline/passed-deadline intervals and per-threshold actions (notify/reassign/escalate) are
summary-only — fetch via `get_rule_summaries`, there's no dedicated graph property for interval
values.

## Step 1.14 — Workbasket inventory
**Not confirmed present in this graph as of 2026-08-18** — a full-graph search for `Basket` in
`rule_type` returned zero rows. Same handling as Step 1.12: try the query, and if empty, say so
explicitly rather than presenting a blank section as a finding.
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.rule_type = 'Rule-Obj-WorkBasket' AND r.is_stub = false
RETURN r.rule_name, r.pzinskey
```

## Step 1.15 — Notifications and correspondence
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.rule_type IN
  ['Rule-Notification','Rule-Obj-Corr','Rule-CorrType','Rule-Corr-Fragment']
  AND r.is_stub = false
RETURN r.rule_type, r.rule_name, r.pzinskey
ORDER BY r.rule_type, r.rule_name
```
Trigger, recipients, subject, content, attachments are summary-derived — no dedicated graph
properties for these.

## Step 1.16 — AI and GenAI rules
**`Rule-AI-Agent`/`Rule-AI-Tool`/`Rule-Connect-GenerativeAI` were not found anywhere in the current
graph** (full-graph check, 2026-08-18) — these are newer Pega Infinity '25+ rule types per the
authoring plugin's own `rules-rule-ai-agent`/`rules-rule-ai-tool` skills, and no currently-ingested
app appears to use them yet. Try the query below; report "none found" as a real finding (this app
predates or doesn't use GenAI features), not a query failure.
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.rule_type IN
  ['Rule-AI-Agent','Rule-AI-Tool','Rule-Connect-GenerativeAI']
  AND r.is_stub = false
RETURN r.rule_type, r.rule_name, r.pzinskey
```

## Step 1.17 — Integration rules
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.rule_type IN
  ['Rule-Connect-REST','Rule-Service-REST','Rule-Service-File','Rule-Service-Email']
  AND r.is_stub = false
RETURN r.rule_type, r.rule_name, r.pzinskey
ORDER BY r.rule_type, r.rule_name
```
Direction (inbound `Service-*` vs outbound `Connect-*`), auth method, sync/async, and retry/error
handling are summary-derived. Flag a connector as a likely mock/stub if its summary's endpoint looks
like a placeholder (`localhost`, `example.com`, a literal `TODO`/`TBD`) — there's no graph flag for
this, it's a text-pattern judgment call.

## Step 1.18 — Reports and dashboards
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.rule_type = 'Rule-Obj-Report-Definition' AND r.is_stub = false
RETURN r.rule_name, r.class_name, r.pzinskey
```
Role-scoped variants: look for multiple report definitions with a similar `rule_name` stem
(circumstanced or per-role naming convention) — cross-check against Step 1.8's role list.

## Step 1.19 — Attachment configuration
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.rule_type = 'Rule-Obj-AttachmentCategory' AND r.is_stub = false
RETURN r.rule_name, r.pzinskey
```
Storage location, size limits, and per-category access control are summary-derived.

## Step 1.20 — Agent and background processing
**Legacy Pega agents use rule type `Rule-Agent-Queue`, not `Rule-Obj-Agent`** — confirmed live (5
rows graph-wide as of this check).
```cypher
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.rule_type IN
  ['Rule-Agent-Queue','Rule-Async-JobScheduler','Rule-Async-QueueProcessor']
  AND r.is_stub = false
RETURN r.rule_type, r.rule_name, r.pzinskey
ORDER BY r.rule_type, r.rule_name
```
Distinguish these from Step 1.16's `Rule-AI-Agent` by rule type string alone — the naming is
confusingly similar but they are unrelated rule families (legacy background processing vs GenAI).

## Step 1.21 — Guardrails and technical debt signals
No dedicated "guardrail score" property exists on `:Rule` in this graph — this step is a pattern
search, not a single query:
```cypher
-- Deprecated: HTML rules used where sections/harnesses are the modern equivalent
MATCH (r:Rule) WHERE r.environment = '<App>' AND r.rule_type STARTS WITH 'Rule-HTML' AND r.is_stub = false
RETURN r.rule_type, r.rule_name, r.pzinskey
```
```cypher
-- Candidate logic-heavy activities (high outbound REFERENCES fan-out is a rough proxy for complexity)
MATCH (r:Rule)-[:REFERENCES]->(dep:Rule)
WHERE r.environment = '<App>' AND r.rule_type = 'Rule-Obj-Activity' AND r.is_stub = false
WITH r, count(dep) AS fanout
WHERE fanout > 15
RETURN r.rule_name, r.pzinskey, fanout ORDER BY fanout DESC
```
Hardcoded-literal detection has no graph signal at all — this requires reading step content via
`get_rule_summaries`/`pega_get_rule_xml` on flagged candidates, not a Cypher query.

## Step 1.22 — Case locking, concurrency, audit
No dedicated graph relationship for `DoNotUnlock`, case history usage, or Pulse/collaboration —
these are summary-derived from `Rule-Obj-Flow`/`Rule-Obj-Activity` summaries. Sample a handful of
the app's flows found in Step 1.5 (not necessarily all of them) and check their summaries for these
signals rather than fetching every flow's full content for this one check.

---

## Parsing Pattern — `get_rule_summaries`

Each summary object returned contains (per the tool's own description): **Business Purpose**
(plain-English), **Technical Steps** (execution order, exact conditions), **Key Conditions** (all
if/else branches and precondition expressions), and **source** (`"dynamo_cache"` for an instant
cached hit, or `"freshly_generated"` if the tool had to fetch and generate on the fly).

- **Never call this for `is_stub = true` rules** — reference them by name only (per the tool's own
  guidance); a stub has no real content to summarize.
- **`source: "freshly_generated"` is slower per-call** — if summarizing many rules from a step above,
  batch up to 20 `pzinskey`s per call rather than one at a time, and expect a cache-miss batch to take
  noticeably longer than a cache-hit one.
- **If `source` is missing entirely, or the summary is empty/near-empty for a non-stub rule**, that's
  the same "not_cached" escalation case `pega-code-review`/`pega-log-diagnosis` handle — escalate to
  `pega_get_rule_xml` for that specific rule rather than reporting the section as empty.
- **Extract stage/sequence/branch info from Technical Steps, not Business Purpose** — Business
  Purpose is prose for the final documents; Technical Steps is the structured source for the review
  phase's stage maps, decision branches, and field-label extraction.
