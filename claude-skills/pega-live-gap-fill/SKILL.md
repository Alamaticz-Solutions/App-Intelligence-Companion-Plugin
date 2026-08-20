---
name: pega-live-gap-fill
description: "General-purpose: when the PDS Neo4j graph, its cached summaries, or PDS MCP search results are stale, missing, or ambiguous mid-task, use the Pega Infinity Authoring plugin to fetch the live truth directly from Pega instead of reporting a gap. Covers application-context switching (confirmed live: maps 1:1 to the graph's r.environment values), which tools to reach for per gap type, and the permission caveat (not every app is switchable for every operator). Referenced by pega-neo4j-cypher-querying, pega-feature-node-retrieval, and pega-log-diagnosis rather than duplicated in each."
---

<!-- Skill version: 1.3.0 | 2026-08-20 — stripped every hardcoded app-name/roster example after a
     completely different deployment (different app names, different counts, no overlap with the
     rosters this skill used to cite) showed those examples were being read as current facts. The
     "1:1 bridge isn't always complete" lesson is real and generalizes; the specific names it was
     demonstrated with do not — re-verify the roster/environment lists live every time, every
     deployment, rather than trusting any list in this file as current. -->

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
config) — it is not multi-instance like PDS MCP's connections across however many environments it
spans (see `pega-cross-environment`). How many applications that one instance hosts, and their names,
is a property of the connected instance, not a fixed fact of this skill — always discover it live via
`list-available-applications()` (an `pxCurrentAppStack`-style roster) rather than assuming a count or
name list from a prior session or deployment. `switch-application-context` moves between whatever
applications that live call returns, without a new connection.

**The bridge to `pega-neo4j-cypher-querying` §0 Axis B**: application `applicationName` here often
matches the graph's `r.environment` property values, for whichever apps happen to overlap between the
two systems — but this must be **live-verified per app, per session**, never assumed from a prior
match. Once you've live-verified an `r.environment` value this way, **that exact string is your
`switch-application-context` target** for the apps that do overlap — no alias translation needed,
unlike PDS MCP's own fuzzy Axis-A aliases (which don't necessarily hold string-for-string against the
graph's literal value — `switch-application-context` wants the graph's literal value, not the MCP
alias).

**This is not guaranteed to be a clean 1:1 bridge — confirmed live in one deployment, and treat that
as a standing risk in every deployment, not a one-time incident.** The graph's `r.environment` set can
include a value that, when you re-run `list-available-applications`, is simply **not** in the
authoring roster at all — and conversely, the authoring roster can include applications that were
never claimed to have graph coverage. **Neither list is authoritative for the other** — this is
exactly the "PDS reaches environments the authoring plugin can't" asymmetry `pega-cross-environment`
documents. Practical consequence: if a gap concerns a rule whose `r.environment` value has no matching
entry in the live authoring roster, there is **no** live-fallback path through this skill —
`switch-application-context` has nothing to switch to. Say so plainly as a resolution-ceiling finding
(same discipline as `pega-gap-coverage` step 4), don't keep retrying a switch that can't succeed.
Don't reuse either list as a fixed fact from a prior check — re-run `list-available-applications` /
`pega-neo4j-cypher-querying`'s §0 check every time, same live-verify discipline as everywhere else in
this skill family.

**Permission caveat, confirmed live**: not every listed application is switchable for the current
operator — in one deployment, one specific application in an otherwise-switchable roster came back
`switchable: false` (no alias) for the connected operator. Check the `switchable` field on every
application before assuming you can reach it — this is access-group-gated per operator, re-verify per
session rather than assuming today's roster (or any particular app's switchability) still holds.

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
  it's in the current `list-available-applications` roster **and** `switchable` — confirmed live, one
  deployment had an environment fail the first check entirely (not in the roster at all) while a
  different application in the same roster failed the second (`switchable: false`) — two different
  failure modes, check both, for whichever apps this deployment actually has.
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
