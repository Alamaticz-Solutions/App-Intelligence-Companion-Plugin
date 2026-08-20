---
name: pega-neo4j-cypher-querying
description: "Writes correct Cypher against the PDS Neo4j knowledge graph (via PDS MCP's neo4j_query/get_schema tools) on the first or second try instead of several rounds of trial and error — the two-axis environment landmine, real node/relationship schema, ref_category taxonomy, and a recipe library for the recurring asks (blast radius, root-to-leaf tree from a given rule name, rule-name disambiguation, entry-point/root discovery, Feature node lookup, class hierarchy, ruleset stack, overrides/stubs/circumstances). Grounded directly in the PDS MCP tool source and the Graph Building UI builder source, not assumption."
---

<!-- Skill version: 1.7.0 | 2026-08-20 — generalized §0 off the legacy hardcoded-alias roster after a freshly-provisioned deployment confirmed its apps are not in that list; the skill must never require an edit just because a new app got ingested, and must never assume any specific app name is present. -->

# Writing correct Cypher against the PDS graph

## Trigger phrases
"what calls X" / "what breaks if I change X" / "blast radius of X", "find the entry point /
top-level rule for...", "trace dependencies of...", "what's the class hierarchy of...", "which
ruleset stack does app X use", "find rules by name/type", any impact-analysis or dependency-closure
question that needs raw Cypher — via `neo4j_query`/`get_schema` (PDS MCP or PDS-MCP-Remote).

If the question is "how does case type/queue processor/job scheduler X work" (business-facing
process explanation, not a dependency/schema question), use `pega-feature-node-retrieval` instead — it
layers Feature-node-specific procedure on top of the query mechanics this skill covers. The two
compose: this skill is what `pega-feature-node-retrieval` step 4 and its `search_rules` fallback lean on
for the actual traversal Cypher.

## Nothing below is a fixed fact except where marked "structural" — re-verify live, every session
This was written against source (`PDS MCP` repo, `Graph Building UI/backend/pds_graph` repo). The
graph is **redeployable per client/instance** — the specific apps indexed, the rule counts, and even
the environment-value set are properties of *this deployment*, not of the skill, and **must never be
hardcoded into this skill or assumed from a prior session.** Treat every number below as belonging to
one historical snapshot, never as a fixed roster: one check against a freshly-provisioned instance
found a small number of tagged apps plus a large untagged bulk (`environment: null`, base/framework
rules not attributed to any app) — a completely different roster and shape from an earlier snapshot
this skill was originally written against, with no app names in common. **Always re-derive the live
app roster with §0's discovery query before trusting any environment name — never name a specific app
in your own reasoning unless you just saw it come back from that query this session.**

## 0. The environment landmine — two unrelated things share one name

This is the single biggest source of silent-wrong-answer trial and error. There are **two
different "environment" concepts** and they use different value sets:

**Axis A — the tool's `environment` parameter (connection routing).** `neo4j_query(cypher,
environment=...)` and `get_schema(environment=...)` pass this through `resolve_environment()` →
`normalize_environment()` (`PDS MCP/src/core/config.py`), which fuzzy-matches your string against a
**hardcoded, closed alias list baked into that source file** — a fixed set of app names chosen at
some point in the past. **This list does not auto-update as new apps get ingested — any app not
already in that source file at the time it was last edited will NOT match, regardless of what it's
called.** If nothing matches, it silently falls back to a hardcoded default environment — no error.
That means: **do not treat Axis A's alias list as the set of "known apps," and never hardcode any
app's name into this skill as if it were guaranteed to match.** It only affects connection routing,
and in any deployment where every app shares one Neo4j instance (verify this — see below), Axis A
doesn't actually gate which data you can reach; only Axis B (your `WHERE` clause) does. Don't spend
effort getting a new app added to the alias list — the correct fix for any app, named or not, is to
skip relying on the `environment` parameter's routing/matching behavior entirely and filter
explicitly with Axis B instead, below.

**Axis B — the `r.environment` / `f.environment` property on nodes (data partition).** This is set
in the graph builder to the literal application name used for that ingest run — an arbitrary string
per deployment, not normalized against Axis A's aliases at all, and not limited to any fixed list.
This is the value that actually scopes a query to one app. **Always discover it live, every session,
regardless of whether you've seen this deployment before:**
```cypher
MATCH (r:Rule) RETURN DISTINCT r.environment AS env, count(r) AS n ORDER BY n DESC
```
Use exactly what this returns, verbatim, casing included — never reuse an app-name list from a prior
session or from this skill's own examples, and don't trust a tool docstring's example alias list as
if it were the real property value set (that list is Axis A's legacy aliases, not Axis B's live
data). A `null` env in the results means untagged/shared rules — decide per-question whether those
belong in scope (usually not, for an app-scoped question).

**Whether Axis A matters at all depends on the deployment — check, don't assume.** If every app
shares one Neo4j connection, Axis A's routing is a no-op for read queries once connected, and Axis B
is 100% of what scopes your results. If a deployment instead uses per-app Neo4j instances, Axis A's
routing becomes load-bearing again and an app missing from the alias list may be genuinely
unreachable — confirm which situation you're in (a single quick connectivity check against any
Axis-B-discovered app name) before assuming the "just filter with Axis B" workaround is sufficient.

**Axis A can also get inferred from your Cypher text itself, not just an explicit parameter —
confirmed live.** `resolve_environment()` falls back to `infer_environment_from_text(cypher)` when no
`environment` argument is passed, and that scans the **entire Cypher string** for an alias substring
— including inside string literals that have nothing to do with intent. A query with no `environment`
argument, filtering nothing by environment, but containing a literal `pzinskey` value that happens to
contain one of Axis A's hardcoded alias substrings gets silently resolved to that alias purely from
the substring match — which then trips the "explicit environment filter required" guard on a query
that never meant to be environment-scoped at all. If you get that error on a query that doesn't look
like it should need one, this is why — add the `WHERE r.environment = '<Env>'` clause (now required
whether you intended it or not), don't fight the inference.

**`r.environment` can absolutely be null on real nodes — this is NOT a structural guarantee, it
varies per deployment.** One snapshot showed zero nulls (every rule stamped with an environment on
ingest); a different deployment showed the *opposite* — the large majority of `Rule` nodes untagged
(`environment: null`), alongside a small number of tagged-app rules. Don't assume either behavior;
check `MATCH (r:Rule) RETURN r.environment IS NULL AS is_untagged, count(*) AS n` (or the DISTINCT
query above, which already surfaces a `null` row if present) before relying on "every rule has an
environment." Whichever way it comes out, `WHERE r.environment = '<Env>'` **excludes non-matching/null
nodes silently** rather than erroring — same shape of failure as everything else in this section. If
a rule you expect to find isn't turning up, `MATCH (r:Rule {pzinskey: '<x>'}) RETURN r.environment`
before assuming it's not in the graph at all — it may be there but untagged.

### App-scoped vs. whole-graph queries — two legitimate patterns, pick deliberately

Every recipe in §6 defaults to **app-scoped**: `WHERE r.environment = '<Env>'`, one app at a time.
That's correct for "what does this rule do," "what breaks in this app," anything where the answer is
about one app's live behavior. But plenty of real questions are legitimately **whole-graph**: "does
any app have a rule named X," "how many rules of type Y exist total," "which apps have Feature node
coverage" (that recipe in §6 is already whole-graph by design — no `environment` filter, it returns
`env` as a column specifically so you see coverage across every app at once).

**Writing an intentional whole-graph query is simple — omit the environment filter entirely:**
```cypher
MATCH (r:Rule) WHERE toLower(r.rule_name) CONTAINS toLower('<name fragment>')
RETURN r.pzinskey, r.rule_name, r.environment, r.rule_type, r.class_name
LIMIT 50
```
Confirmed live: this runs cleanly across every environment in the deployment with no guard interference, **as long as
the query text doesn't happen to contain an Axis-A alias substring anywhere** (§0 above). Always
`RETURN r.environment` as a column on a whole-graph query — not just to see where each row came from,
but because it doubles as insurance against the next point.

**The Axis-A landmine cuts the other way here too.** A whole-graph query that searches for a name
fragment which *happens* to contain an alias substring (e.g. searching for `'dealer'`, which contains
`'deal'`) gets Axis A silently inferred and the environment-mention guard enforced — on a query that
was never meant to be scoped at all. Confirmed live: this doesn't silently narrow your results (the
guard only checks that the word `"environment"` appears in the text somewhere, not that it's used in
a real `WHERE` filter — §1), so a query that already `RETURN`s `r.environment` satisfies the guard
without actually restricting anything. This is one more reason to make `r.environment` a standing
habit in whole-graph `RETURN` clauses, not just a nice-to-have: it pre-empts the guard from ever
blocking a query you didn't intend to scope, whether or not this particular query happens to trigger
inference.

**If a whole-graph query still errors** ("explicit environment filter required") even with
`r.environment` in the `RETURN` clause, that's the tool's substring check on `"environment"` in the
lowercased query text — which `RETURN r.environment` already satisfies, so this shouldn't happen; if
it does, the query text doesn't actually contain that column literally (e.g. it's coming from an
alias or a computed field) — add a harmless comment (`// environment: intentionally whole-graph`) as
the guaranteed fallback, same technique as §6's Class/App/Ruleset recipes use for the same reason.

**Which recipes in §6 are whole-graph by design, already**: "Discover current environment coverage,"
"Find all Feature nodes," and §4's `ref_category` taxonomy query. Everything else in §6 is app-scoped
by design — don't strip their `WHERE r.environment=` clause to "make them whole-graph" without
thinking about it, since blast-radius/closure results in particular get dramatically noisier and
slower across all 9 environments at once (§5's hub-node warning gets worse, not better, at that
scale).

## 1. Tool-layer hard constraints (from `PDS MCP/src/tools/neo4j_query.py` source)

- **Environment-mention check, not a strict `WHERE` match.** The tool only checks that the literal
  substring `"environment"` (case-insensitive) appears somewhere in your Cypher text — it does not
  parse for a specific `WHERE r.environment = '<x>'` clause. Still always write an explicit,
  correctly-cased `WHERE r.environment = '<value from the live check>'` — the loose check exists to
  catch you forgetting entirely, not to validate correctness.
- **Silent `LIMIT 200`.** If your Cypher has no `LIMIT` clause, one is appended automatically. An
  exploratory query that looks complete may be silently truncated — add your own `LIMIT` (or a
  `count()` aggregation) when you need to know the true result size.
- **Write operations are blocked** by a regex on `CREATE|MERGE|SET|DELETE|REMOVE|DROP|CALL apoc.|
  CALL dbms.|LOAD CSV` — read-only only, this graph is never mutated from a query session.
- **`get_schema` samples only the first 100 nodes per label** to infer property names/types. Rare or
  sparse properties can be invisible in its output — don't treat its property list as exhaustive if
  a query against a property you expect returns nothing.

## 2. Node/relationship model (structural — confirmed against `get_schema` + live direction checks)

**Node labels:**
- `:Rule` — a Pega rule instance. Key properties: `pzinskey` (unique key), `rule_name`, `rule_type`,
  `class_name`, `environment`, `ruleset`, `ruleset_version`, `version_patch`, `is_stub`,
  `circumstanced`/`circumstance_type`/`circumstance_val`, `available`, `created_at`/`updated_at`,
  `last_operator`/`last_op_name`, `traversed`, `fetch_failed`.
- `:Feature` — a synthesized closure document for one root (case type / queue processor / job
  scheduler). Key properties: `title`, `description`, `summary`, `business_summary`,
  `technical_summary` (JSON string), `root_pzinskey`, `root_type`, `root_identifier`,
  `root_rule_name`, `environment`, `source_rule_fingerprint`, `related_case_types`,
  `generated_at`/`updated_at`. Also carries dozens of `embedding_section_*` list properties — **never
  `RETURN f` on a Feature node**, always name the specific properties you need, or the output will
  blow past any reasonable budget. See `pega-feature-node-retrieval` for the full read discipline here.
- `:Class` — a Pega class in the inheritance tree. Properties: `class_name`, `depth`,
  `is_app_class`, `is_pega_base`.
- `:Ruleset` — properties `name`, `ceiling_major`/`ceiling_minor`/`ceiling_patch`.
- `:App` — properties `name`, `version`.

**Relationship types (direction verified live, `MATCH (a)-[r:TYPE]->(b) RETURN labels(a), labels(b)`):**
- `(:Rule)-[:REFERENCES {ref_category, ref_class, ref_type}]->(:Rule)` — caller → callee. This is
  the dependency edge everything else in this skill's recipes builds on. **`ref_category` has 200+
  distinct values** (full live count, not the "30+" a first pass under-counted — see §4 for the
  curated logic-bearing subset); an unfiltered traversal drowns in UI/security/locale noise.
- `(:Feature)-[:ROOTED_AT]->(:Rule)` — the Feature's entry-point/"hero" rule.
- `(:App)-[:HAS_RULESET {is_branch, stack_rank}]->(:Ruleset)` — one app's ruleset stack, ordered by
  `stack_rank`.
- `(:Rule)-[:BELONGS_TO]->(:Class)` — a rule's owning class.
- `(:Class)-[:INHERITS_FROM {parent_type}]->(:Class)` — child → parent, one hop per level.
- `(:App)-[:RESOLVED_RULE]->(:Rule)` — the rule instance this app's resolution actually resolved to
  (as opposed to every same-name/class instance across the ruleset stack — see
  `pega-feature-node-retrieval` step 8's ruleset-stack caveat, same underlying issue).
- `(:Rule)-[:SPECIALIZES {circumstance_type, circumstance_val, rule_name, rule_type}]->(:Rule)` /
  `(:Rule)-[:SPECIALIZED_BY {circumstance_type, circumstance_val}]->(:Rule)` — circumstanced-rule
  pairs, direction confirmed live (both `Rule → Rule`).
- `(:Rule)-[:OVERRIDES {created_at}]->(:Rule)`, `(:Rule)-[:SETS {hydrated_from_stub, ref_category,
  ref_class, ref_type}]->(:Rule)`, `(:Rule)-[:IDENTIFIED_STUB {attempted_classes, caller_class,
  ref_category, ref_class, ref_type, resolve_failure, rule_name, rule_type}]->(:Rule)` — narrower-use
  edges (ruleset override tracking, data-page `SETS` targets, and failed-resolution stub bookkeeping
  respectively), also confirmed `Rule → Rule` live. See §5 for a recipe on each — don't assume this
  direction holds forever if the builder changes; the one-line check below is cheap enough to re-run
  if a query using one of these looks wrong:
  ```cypher
  MATCH (a)-[r:SPECIALIZES]->(b) RETURN labels(a), labels(b) LIMIT 3
  ```

## 3. `is_stub` / real-rule filtering (confirmed from the builder)

A `:Rule` node can exist as a **stub** — referenced by something else but never fully fetched/parsed
(`is_stub: true`, sometimes with `is_platform_stub` for `px/py/pz`-prefixed platform rules). Stubs
carry a name/type/class but no real content. For any query answering "what does this actually do"
(as opposed to "what's in the dependency graph structurally"), filter `is_stub = false`. For pure
structural/impact-analysis questions ("does anything reference X"), stubs are fine to include —
they still represent a real edge, just an unexplored target.

**Zero outgoing `REFERENCES` doesn't always mean "calls nothing" even for a fully-traversed,
non-stub rule — caught live for `Rule-Async-QueueProcessor` specifically.** In one app checked,
several of its queue processors had exactly 1 outgoing `REFERENCES` edge (to their processing
activity), but a few others had **0** — despite `is_stub=false`, `fetch_failed=false`,
`traversed=true` on all of them. This looks like a genuine reference-extraction gap for this rule
type (or these specific instances), not a stub or a query problem, and isn't tied to any one app —
re-verify per app rather than assuming a prior app's finding transfers. If a forward-closure/
blast-radius query on a queue-processor (or any rule type you haven't checked before) comes back with
0 hits despite the root being fully traversed, don't conclude "calls nothing" from the graph alone —
confirm via `pega-live-gap-fill`'s `get-rule` (live Pega content) before reporting it as a dead end.

## 4. `ref_category` taxonomy — filter before you traverse, not after

**Full live count: 200+ distinct values**, not the "30+" an earlier top-30-by-volume pass
under-counted (`MATCH ()-[r:REFERENCES]->() RETURN DISTINCT r.ref_category, count(r) ORDER BY
count(r) DESC` with no `LIMIT` — the earlier version of this section ran that query capped at 30 rows
and missed everything past the top 30, including some of the most load-bearing categories below).
Re-run uncapped for the current full list; this evolves as the builder's reference-extraction
improves, and low-volume categories matter disproportionately (see the entry-point categories next).

**Root-type entry-point categories — the single highest-leverage part of this filter.** Every
Feature-node root type has its own category for the first hop from root to its actual logic, and
these are all **low-volume** (tens of occurrences, not thousands) — easy to miss by eyeballing a
volume-sorted list, but leaving one out means a root of that type returns **zero** closure/blast-radius
results regardless of hop count, not "fewer" results:
- `qp:activity` (53 occurrences graph-wide) — a queue-processor's (`Rule-Async-QueueProcessor`) link
  to its processing activity. Verified live on one app's queue processor: without this, closure
  returns empty despite a real, single outgoing edge.
- `jobsched:activity` (33) — the job-scheduler (`Rule-Async-JobScheduler`) equivalent. Verified live
  the same way on one app's job scheduler.
- `js:flowAction` (1, graph-wide — genuinely this rare) — another job-scheduler entry hook; include it
  even at this volume, since "rare" here means "rarely applicable," not "rarely correct."
- `casetype:starting_flow` (192) — a case type's entry flow, the case-type analog of the two above.
  Not verified populated in every app checked (one app had zero edges of this category) — include it
  anyway since it's clearly the right category by name and has real volume elsewhere; don't be
  surprised if it's sparse for a given app.

**Stage-flow categories are dynamic, not enumerable.** `casetype:stage_flow:<Stage Name>` and
`casetype:stage_skip_when:<Stage Name>` each generate a distinct category **per literal stage name**
in the source Pega application (`casetype:stage_flow:Bio`, `casetype:stage_flow:Intake`, dozens more
seen live, none reusable across apps). Don't try to enumerate these in an `IN [...]` list — match the
prefix instead: `rel.ref_category STARTS WITH 'casetype:stage_flow:'` /
`'casetype:stage_skip_when:'`. This is what actually wires a case type's stages to their flows —
skipping it silently drops the entire stage-progression logic from a case-type root's closure.

**For blast-radius / impact-analysis / dependency-closure queries**, beyond the entry-point and
stage-flow categories above, prefer these general logic/control-flow-bearing categories — the noise
floor otherwise is `ui:*`, `security:*`, and `expr:property_access` (real edges, rarely what "what
breaks if I change this" means):
`explicit, step:Call, step:precond_when, dt:when_condition, dp:load_activity, dp:report_definition,
dp:data_transform, flow:subprocess_shape, flow:utility_shape, flow:sla, flow:decision_impl,
casetype:case_wide_action, casetype:process_list, casetype:alt_stage_flow, expr:library_function,
expr:qualified_library_function, fa:pyValidateActivity, fa:pyPreProcessingActivity,
fa:pyPreProcessingTransformRule, fa:pyActionTransformRule, fa:pyLocalActionActivity,
fa:pyAuditActivity, fa:when_condition, sla:advance_flow, sla:advance_flow_activity, sla:action_when,
sla:activity, svc:segment_activity, svc:service_activity, svc:rest_method_activity,
step:Property-Map-DecisionTable, step:Branch` — still a starting filter to tune per question, not a
closed allowlist covering all 200+ values; broaden it (or drop the filter) if a recipe returns
suspiciously few hits, same discipline as the entry-point categories above.

**Caught live across two end-to-end test passes (2026-08-17)**: the original list omitted every
`fa:*` category (false negative on `ValidateStaffInformation`, a Validate rule with two genuine
FlowAction callers — zero blast-radius hits until widened), then a second pass on a different app
found `qp:activity` and `jobsched:activity` missing too (false negative on **every** queue-processor
and job-scheduler root — not a rare edge case, a structural gap affecting 2 of the 3 root types
Feature nodes commonly use). Checked `fa:pyConfirmHarness`/`fa:pySectionReference` specifically and left them
out on purpose — UI-composition (which harness/section shows), not control-flow. **Treat an empty
blast-radius/closure result as "check the unfiltered edges before trusting the empty set," always** —
this has now produced two real false negatives, not a hypothetical risk.

## 5. Performance & cycles

**Hub nodes exist, but they did not actually blow up in testing — the original version of this
warning overstated the risk.** `REFERENCES` in-degree across `:Rule` averages ~5.7 but peaks at
**5,579** for the single most-referenced rule (`pxTextInput`, a platform HTML property — a base Pega
framework rule, not app-specific, so this scale finding should generalize across apps). **Empirically
tested directly on that exact node**: a `*1..4` traversal returned in
normal time both with §4's `ref_category` filter (200-row cap reached, as expected) and **fully
unfiltered** (7,467 distinct callers, no filter at all) — no hang, no timeout, at the true worst case
this graph currently has. At ~47K total `Rule` nodes, this graph just isn't large enough for the
combinatorial-explosion scenario to bite within 4 hops, even at the max-degree node.

**What this means practically**: don't treat a slow or hanging blast-radius query as expected
behavior on a legitimate hub node — that's not what happens here, so something else is more likely
wrong (a genuinely huge hop bound, a missing filter combined with a much deeper traversal than `*1..4`,
or an unrelated connectivity issue). The degree-check recipe below is still useful **diagnostically**
— if a query is unexpectedly slow, checking degree tells you whether a hub node is even a plausible
explanation — but don't pre-emptively narrow a query "just in case" based on degree alone; this graph
tolerated the worst case fine.
```cypher
MATCH (r:Rule {pzinskey: '<pzinskey>'})
WHERE r.environment = '<Env>'
RETURN COUNT { (r)<-[:REFERENCES]-() } AS inDegree, COUNT { (r)-[:REFERENCES]->() } AS outDegree
```
(`size((r)<-[:REFERENCES]-())` — the older pattern-in-`size()` form — is rejected outright by this
server's Neo4j version with a syntax error; confirmed live. Use `COUNT { }` instead, as above.)
Still worth revisiting if the graph grows an order of magnitude (more apps ingested, deeper rulesets)
— the untested regime is hop bounds well past 4, or a hub node with an order-of-magnitude higher
degree than 5,579, neither of which exists in this graph as of this check.

**Cycles are possible and not guarded against.** Recursive activities and mutual data-page calls can
put cycles in the `REFERENCES` graph. Cypher's variable-length `*1..4` pattern still terminates (hop
count is bounded), and the recipes' `DISTINCT` + `min(length(path))` dedupe repeated arrivals at the
same node — so the recipes as written are safe from infinite loops or duplicate rows. What they don't
give you is a shortest/simple-path guarantee if you go looking for `path` itself (not just endpoint
nodes) at higher hop bounds; if a recipe needs the actual path (not just "is X reachable"), prefer
`shortestPath((a)-[:REFERENCES*1..N]-(b))` or add `apoc.path` cycle-safety if it's available on this
connection — don't assume plain `*1..N` path enumeration stays cheap much past 4 hops on a graph with
hub nodes like the one above.

## 6. Query recipe library

Full recipes with copy-pasteable Cypher live in
[`references/recipe-library.md`](references/recipe-library.md) — load it once you know which
recipe you need, rather than always pulling the whole library in. Index, by task:

| Need | Recipe in the reference file |
|---|---|
| Confirm live environment values before anything else (§0) | "Discover current environment coverage" |
| Find a rule by partial/exact name | "Find a rule by name/type"; "When a name search returns more than one rule" |
| Narrow a name to what one app actually resolves to | third block under the disambiguation recipe |
| Check whether a `:Feature` node exists / find one | "Find all Feature nodes" |
| Entry point for a known Feature | "Find the top-level/entry-point rule for a known Feature" |
| Entry point when no Feature node exists | "Find candidate entry-point/root rules" |
| Dead-code / unreferenced rules | "Find fully isolated rules" |
| Blast radius (what breaks if this rule changes) | "Blast radius" |
| Forward dependency closure (what this rule touches) | "Forward dependency closure" |
| Full root-to-leaf tree from just a rule name | "Given only a rule name: the full tree..." (3-step chain) |
| Class ancestors / subclasses | "Class inheritance chain"; "Direct subclasses of a class" |
| Ruleset stack for an app | "Ruleset stack for an app" |
| Real (non-stub) rules of a given type | "Real (non-stub) business rules only" |
| Circumstance variants of a rule, or a variant's base | "Circumstance variants of a base rule" |
| What a rule overrides | "What a rule overrides" |
| What a Data Transform/Activity writes to | "Data-page/property targets a rule sets" |
| Graph gaps the builder couldn't resolve | "Failed rule-resolution attempts" |

Every recipe needs `<Env>` replaced with a value confirmed live via the §0 check, and a real
`pzinskey`/`rule_name` in place of the placeholders. All are read-only and safe to run as-is.

## What NOT to do
- **Don't conflate Axis A (tool `environment` param) with Axis B (`r.environment` property).** They
  have different value sets and different failure modes — Axis A fails silently to a default
  connection, Axis B fails silently to unfiltered cross-app results. Confirmed by source, not
  inference — see §0.
- Don't trust the tool docstring's `environment` example list as the property's real value set —
  it's Axis A's aliases, always re-check Axis B live.
- Don't assume no `LIMIT` means "all results" — the tool silently caps at 200.
- Don't traverse `REFERENCES` for blast-radius/impact questions without a `ref_category` filter —
  the unfiltered result is dominated by UI/security noise, not the logic path you're asking about.
- Don't treat `get_schema`'s property list as exhaustive — it's a 100-node sample per label.
- Don't run `rule_name CONTAINS '<x>'` with a lowercase guess and conclude "no match" — names are
  PascalCase in this data; use `toLower(...) CONTAINS toLower(...)`.
- Don't run a `*1..4` (or deeper) `REFERENCES` traversal on a target without checking its
  in-degree/out-degree first if it's slow — hub nodes exist (max in-degree 5,579 vs. average 5.7)
  and `LIMIT` doesn't bound the search space, only the output.
- Don't re-derive a `:SPECIALIZES`/`:OVERRIDES`/`:SETS`/`:IDENTIFIED_STUB` edge's direction from
  scratch — it's confirmed `Rule → Rule` for all four (§2), with recipes in §6. Only re-check live
  if a query using one of these starts returning nothing where you expect results — that's the
  signal the builder changed the direction, not a reason to distrust this doc pre-emptively.
- Don't answer "how does X work" from this skill's recipes alone — that's `pega-feature-node-retrieval`'s
  job; this skill is the query-construction layer underneath it.
- Don't conclude "not in the graph" and stop when a query against a specific `pzInsKey` comes back
  empty — the graph is a point-in-time build; `pega-live-gap-fill` fetches the live rule directly when
  that's the actual blocker.

## Keeping this skill current
This doc mixes structural facts (tool source behavior, relationship directions, property names —
stable until the tools/builder are redeployed) with live snapshot facts (environment values,
`ref_category` list, degree numbers — drift as more apps get ingested). If a live check in §0 or §4
returns something materially different from what's written here (a new environment value, a
`ref_category` not in the §4 list, degree numbers an order of magnitude off), update that section in
place rather than leaving this doc to quietly mislead the next session — the same discipline
`pega-feature-node-retrieval` uses for its own coverage numbers.
