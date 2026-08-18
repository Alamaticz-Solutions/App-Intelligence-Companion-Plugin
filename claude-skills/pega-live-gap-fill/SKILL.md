---
name: pega-live-gap-fill
description: "General-purpose: when the PDS Neo4j graph, its cached summaries, or PDS MCP search results are stale, missing, or ambiguous mid-task, use the Pega Infinity Authoring plugin to fetch the live truth directly from Pega instead of reporting a gap. Covers application-context switching (confirmed live: maps 1:1 to the graph's r.environment values), which tools to reach for per gap type, and the permission caveat (not every app is switchable for every operator). Referenced by pega-neo4j-cypher-querying, pega-feature-node-retrieval, and pega-log-diagnosis rather than duplicated in each."
---

<!-- Skill version: 1.2.0 | 2026-08-18 — the "1:1 bridge" below is no longer complete: the graph now
     has an environment (CCPMInt) the authoring plugin's roster doesn't expose at all, confirmed live
     on both sides same-session. This is expected drift, not a bug — re-verify the roster/environment
     lists live every time rather than trusting either list below as current. -->

# Filling graph/MCP gaps with the live Pega Infinity Authoring plugin

## Trigger phrases
Not usually invoked as a standalone user request — reached for **mid-task**, from inside another
skill's procedure, whenever one of these happens: the graph has no node for a `pzInsKey` (or it's
`is_stub=true`/`fetch_failed=true`), a cached rule summary looks stale relative to what's needed,
`RESOLVED_RULE`/a name search returns ruleset-stack ambiguity and you need to know what's actually
live right now, or no `:Feature` node covers a business process you need to describe. Also usable
directly: "check live Pega for X" / "is the graph up to date on Y."

## Structural fact: one Pega tenant, many applications, confirmed live
The Authoring plugin is configured against **one** Pega instance (`pega_base_url` in this plugin's
config) — it is not multi-instance like PDS MCP's connections across ~10 environments (see
`pega-cross-environment`). Live check (`list-available-applications`, re-confirmed 2026-08-18): that
one instance hosts **12 applications** as an `pxCurrentAppStack`-style roster — `OWLM`, `Deal`,
`DenovoImp`, `Office`, `OARCAPP`, `CCPM`, `ODH`, `OKTA`, `PBDR`, `PBD`, `ODPipeline`, `HRLifeImp` — and
`switch-application-context` moves between them without a new connection.

**The bridge to `pega-neo4j-cypher-querying` §0 Axis B**: application `applicationName` here matches the
graph's `r.environment` property values for most of the roster — verified 2026-08-17: `OWLM, Deal,
DenovoImp, Office, OARCAPP, CCPM, ODH, ODPipeline, HRLifeImp` appear identically on both sides. Once
you've live-verified an `r.environment` value this way, **that exact string is your
`switch-application-context` target** for the apps that do overlap — no alias translation needed,
unlike PDS MCP's own fuzzy Axis-A aliases (`odpipeline`→`ODPipeline` doesn't hold string-for-string,
but `switch-application-context` wants the graph's literal value, not the MCP alias).

**This is no longer a clean 1:1 bridge — confirmed live 2026-08-18, same session, both sides.** The
graph's `r.environment` set has grown to include `CCPMInt` (14 rules: `Rule-Obj-Property`,
`Rule-Obj-Model`, `Rule-Obj-Activity`) — re-run `list-available-applications` and it is **not** in the
12-app roster above, confirmed the same session (`totalCount: 12`, no `CCPMInt` entry). Conversely,
`OKTA`/`PBDR`/`PBD` are in the authoring roster but were never claimed to have graph coverage (they
weren't part of the original 9-way verified match either). **Neither list is authoritative for the
other any more — this is exactly the "PDS reaches environments the authoring plugin can't" asymmetry
`pega-cross-environment` documents, now caught live, not hypothetical.** Practical consequence: if a
gap concerns a rule whose `r.environment = 'CCPMInt'`, there is **no** live-fallback path through this
skill — `switch-application-context` has nothing to switch to. Say so plainly as a resolution-ceiling
finding (same discipline as `pega-gap-coverage` step 4), don't keep retrying a switch that can't
succeed. Don't reuse either list as a fixed fact — re-run `list-available-applications` /
`pega-neo4j-cypher-querying`'s §0 check every time, same live-verify discipline as everywhere else in
this skill family.

**Permission caveat, confirmed live**: not every listed application is switchable for the current
operator. At check time, 11 of 12 were switchable; `HRLifeImp` showed `switchable: false` (no alias)
for this operator. Check the `switchable` field before assuming you can reach a given environment —
this is access-group-gated per operator, re-verify per session rather than assuming today's roster.

## Procedure

**0. Check current context first — never assume.** `get-application()` with no arguments returns
whatever's *currently* active, not a default:
```
get-application()
```
If the gap concerns a different app than what's active, confirm it's reachable and switch:
```
list-available-applications()                        # confirm target is present and switchable
switch-application-context(target="<env value from pega-neo4j-cypher-querying §0>")
```

**1. Pick the tool by gap type:**
- **Graph has nothing for this `pzInsKey`** (missing, `is_stub=true`, `fetch_failed=true`) →
  `get-rule(key="<pzInsKey>", detail="summary")`, escalate to `detail="full"` if the summary doesn't
  answer the question.
- **A search result or graph edge might point at a withdrawn/superseded version** (the ruleset-stack
  ambiguity both `pega-neo4j-cypher-querying` and `pega-feature-node-retrieval` step 8 flag at the graph level)
  → `get-rule-resolve-handle(pzInsKey="<key>")` — this runs Pega's own live resolution
  (`D_pxGetRuleInfo`) before fetching, which is a stronger answer to "what's actually live" than any
  graph edge or cached `RESOLVED_RULE` relationship.
- **Cached summary (`source: "dynamo_cache"`) is suspect or the question is high-stakes** → `get-rule`
  as the tie-breaker; its content is live by construction, authoritative over both the Dynamo cache
  and the graph.
- **Can't locate the rule by name/key at all** → `search-rules(searchText="<name/keyword>")` (add
  `allApps="true"` if you're not sure which app it's in, `ruleType` to narrow); or
  `list-rules(ruleType="<required>", ruleName="<name>")` for an exact-match lookup.
  **`allApps="true"` is slow — confirmed live, one such call took 66.7 seconds.** Worth it when you
  genuinely don't know the app and the graph also came up empty (a real "does this exist anywhere at
  all" question, confirmed with a genuinely non-existent rule name in that same 66.7s call), but don't
  reach for it as a first guess when a narrower search (a specific app already suspected, or
  `ruleType` set) would answer the same question faster.
- **No `:Feature` node covers the business process you need to describe** → `get-application()`'s
  `CaseTypes` list, plus `list-application-objects`/`get-case-details`/`list-cases` for live examples,
  to reconstruct enough business context to name the affected process. **Label this explicitly as
  live-reconstructed, not Feature-node-grounded** in whatever report consumes it — same
  provenance-honesty discipline as `pega-feature-node-retrieval` step 5, just naming a third tier
  (`live_authoring_plugin`) alongside its `verified_xml`/`dynamo_cache`.

**2. State provenance in the output.** Whatever consumes this (a diagnosis report, a query answer)
should say the fact came from a live authoring-plugin call, not the graph/cache — the reader needs to
know it reflects right now, for whichever app you had switched to, not necessarily what the graph
will show after its next build.

## What NOT to do
- Don't assume any PDS graph environment is reachable from this plugin without checking both that
  it's in the current `list-available-applications` roster **and** `switchable` — confirmed live,
  `CCPMInt` fails the first check entirely (not in the roster at all) and `HRLifeImp` fails the
  second (`switchable: false`) — two different failure modes, check both.
- Don't use this as a bulk replacement for `neo4j_query`/`get_rule_summaries` — these are live REST
  calls to Pega, slower and rate-limited compared to the graph. Reach for it for the specific gap, not
  as a faster path for things the graph already answers cheaply.
- Don't translate a graph `r.environment` value through PDS MCP's Axis-A alias table before using it
  as a `switch-application-context` target — it needs the graph's literal value, that's the whole
  point of the 1:1 bridge above.
- Don't forget which application is currently active mid-task if you've switched away from the one
  the rest of your evidence is about — `get-application()` has no "give me the original" undo; track
  it yourself if you need to switch back.
- Don't silently blend a live-fetched fact with graph-cached facts in a report without marking which
  is which — that's exactly the provenance discipline this skill exists to preserve.
