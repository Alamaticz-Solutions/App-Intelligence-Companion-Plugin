---
name: pega-log-diagnosis
description: "Diagnoses a Pega production error end-to-end from a log excerpt/stack trace/class hash — root cause, exact point of failure, technical blast radius, and (the part IdentifAI's own diagnosis agent doesn't do) business-process impact grounded in :Feature nodes. Composes pega-neo4j-cypher-querying and pega-feature-node-retrieval rather than duplicating them. Same tool surface as IdentifAI-Graph's diagnosis_agent.py (verified by source), so this works even when the IdentifAI web app itself isn't open."
---

<!-- Skill version: 1.7.0 | 2026-08-17 — pega_get_rule_version elevated: found a rule the graph and cross-app search both missed -->

# Diagnosing a Pega error: logs → rule → graph → business process

## Trigger phrases
"debug this error", "why is X failing / throwing", "diagnose this exception/stack trace", "what
broke and what does it affect", a pasted Pega log excerpt, stack trace, or obfuscated Java class
name (e.g. `ra_action_staffbiodetails_6e5b9b475ebbf9c15d55b21a6d6678bf`).

## What this is, and what it isn't
`IdentifAI-Graph` (`.../IdentifAI-Graph/backend/agents/diagnosis_agent.py`) already runs a hand-rolled
Claude tool-use loop that does most of this via a **hosted MCP** — and that hosted MCP is, verified by
source, **the same server** as `PDS-MCP-Remote` in this session: identical tool names
(`pega_log_analyzer`, `neo4j_query`, `get_schema`, `get_rule_summaries`, `pega_get_rule_xml`,
`search_rules`, `pega_fetch_entire_ruleset_stack`, `pega_get_branch_rules`) reach the same underlying
systems as IdentifAI's diagnosis agent, hitting the same OpenSearch indices (`pega-logs`,
`pega-analysis-results`, `pega-knowledge-base` — confirmed against `PDS MCP/src/tools/
opensearch_tools/*.py` source, and the OpenSearch host itself resolves to
`search-identifai-streaming-db-*.aos.us-west-1.on.aws` when called from here). **One real gap,
confirmed live**: `search_analysis_results`/`search_logs`/`search_knowledge_base` exist in `PDS MCP`
source but are **not registered as tools on this deployment** — only the generic
`opensearch_search_index` (Query DSL) is exposed here, so §2 Steps 0/1 use that instead of the named
tools this section's source-comparison might otherwise imply are directly callable.

**What this skill adds that `diagnosis_agent.py` doesn't have**: its tool list has no `search_features`
and no Feature-node access at all (confirmed — read its documented 9-tool list). Its "Impact Analysis"
section is graph blast-radius plus free-form LLM reasoning about business impact, not grounded in
anything. This skill's step 5 closes that gap using `search_features`/`pega-feature-node-retrieval`.

**Compose, don't duplicate**: technical blast-radius/closure queries reuse `pega-neo4j-cypher-querying`'s
recipes verbatim; Feature-node reading discipline reuses `pega-feature-node-retrieval`'s procedure verbatim.
When the graph/MCP data is stale, missing, or ambiguous mid-diagnosis (step 2/3's rule is missing or
`is_stub`, a ruleset-stack version is ambiguous, step 5 has no Feature-node coverage), reach for
`pega-live-gap-fill` — that's its job, not duplicated here. This skill is the orchestration layer that
chains the read-only diagnostic tools for the specific "debug this error" shape.

## 0. Live-check OpenSearch before relying on it — fixed once, fragile infrastructure underneath
As of 2026-08-17, `opensearch_list_indices` was confirmed **broken** (DNS resolution failure on the
configured host), then fixed and confirmed **working** (verified live: `pega-logs` 10,212 docs,
`pega-analysis-results` 252, `pega-knowledge-base` 2). Fix committed at `PDS MCP@32004f9`. Root cause,
so a future recurrence is fast to diagnose instead of re-investigated from scratch:

1. **`OPENSEARCH_URL` on the `PDS_APP_CRED` Lambda (`us-east-1`) pointed at a hostname that never
   existed as a DNS record anywhere** — not a propagation delay, a genuinely non-existent name.
   OpenSearch is **self-hosted on a single EC2 instance** (`identifai-opensearch`,
   `i-0e47946b96f046502`, `us-west-1`, stable Elastic IP `13.56.113.149`, port `9200`) — not a
   managed AWS OpenSearch Service domain despite the old hostname's naming convention suggesting one.
   Fixed by pointing `OPENSEARCH_URL` at the instance directly.
2. **The Lambda's OpenSearch client hardcoded `verify_certs=True`** (`PDS MCP/src/infrastructure/
   opensearch/client.py`) against an instance serving a self-signed cert — TLS handshake failed
   outright regardless of the hostname fix. Fixed in code (`verify_certs=False`), which required a
   full image rebuild/redeploy since it's a container-image Lambda (`Dockerfile` also needed a fix —
   it still referenced a pre-`src/`-refactor flat layout and didn't build against current `HEAD`).
3. **`OPENSEARCH_USER`/`OPENSEARCH_PASS` (`Alamaticz`/`Alamaticz#2024`) didn't correspond to any real
   user** — confirmed by reading `internal_users.yml` directly from the running OpenSearch container
   via SSM; only OpenSearch's stock demo users existed. The instance had been replaced (whatever the
   original `search-identifai-streaming-db-*` domain was) without the app-specific user ever being
   re-provisioned. Fixed using the real `admin` credentials, sourced from the `identifai-backend` App
   Runner service's (paused) environment config — that was the actual source of truth, not this
   repo's `.env` or the Lambda's own prior values, which both carried the same stale credentials.

**This is a single self-hosted EC2 instance with no managed HA — it can go down for reasons unrelated
to any of the above** (instance stopped, OpenSearch process crashed, disk full). Don't assume a future
connectivity failure is the same root cause; check with one cheap call before building a plan around
raw log search:
```
opensearch_list_indices()
```
If it fails, **don't retry in a loop** — fall back immediately to asking the user to paste the
relevant log excerpt / stack trace / error message directly (from the IdentifAI UI's Group Detail
page, or Pega's own Admin Studio log viewer). Everything past step 2 works identically whether the
raw signal came from OpenSearch or was pasted by the user — only step 1 (KB/prior-group search) and
step 0's own log pull depend on OpenSearch being reachable. If it's down again and the user wants it
fixed rather than worked around, the checklist above (DNS/URL → cert verification → real user
credentials, in that order) is where to start looking, not from zero.

**`search_analysis_results`/`search_logs`/`search_knowledge_base` are not registered as tools on this
MCP deployment — confirmed by exhaustive `ToolSearch`, despite existing in `PDS MCP` source.** Only
the generic `opensearch_search_index(index, query)` (full OpenSearch Query DSL) is exposed. Source
existing in the repo doesn't mean a tool is live here — always verify via `ToolSearch` before assuming
a documented tool name works, and use the reconstructed Query DSL bodies in §2 Step 0/1 below instead.

## 0b. Which app does this error belong to? — analyzed directly against both indices, not assumed

**Neither OpenSearch index reliably carries app identity — confirmed by tracing real documents through
both, not by reading the mapping alone.** This is the single hardest part of diagnosis and deserves
its own procedure, not a one-line caveat.

**`pega-analysis-results` (the grouped/aggregated view) has no `environment` field at all**, confirmed
against the live mapping. Its only app-adjacent signal is `rules[].rule_name`/`class_hash` — populated
on just 15 of 252 groups checked live; the other 237 (mostly platform/infrastructure errors — job
schedulers, dataflow/stream timeouts) have `rule_count: 0` and an empty `rules` array. **Tracing a
group's `raw_log_ids`/`representative_log.sample_log_id` back to its source document in `pega-logs`
does not recover app identity either** — confirmed on two separate groups; the raw documents behind
both were themselves missing the one field that would have helped (next paragraph). Grouping doesn't
strip app identity, it's just usually not there upstream either.

**`pega-logs` (raw log lines) has a real app field — `log.app`, format `"<AppName>:<version>"` — but
it's populated on only ~7.4% of documents** (757 of 10,212 checked live: `PegaRULES:8` (platform),
`HRLifeImp:01.01.01`, `CCPM:01.01.01`, `CredentialingImp:01.01.01`, `PegaAESRemote:8` — no `OWLM`
anywhere in the current dataset). **The `AppName` half matches the Neo4j graph's `r.environment`
property exactly** (`HRLifeImp` = `HRLifeImp`) — when present, this is a direct, reliable bridge, no
translation needed. But `log.app` is populated specifically on session/access-group-scoped entries
(e.g. `AgentExecution` tied to a real access group) and **absent on `JobSchedulerExecution`/
`DataFlow`/batch-thread entries** — which is most error volume, since those run in a shared pooled
thread serving multiple apps' queued work at once, not scoped to one app. Confirmed on two different
job-scheduler-thread error groups: both had `log.app` missing on every one of their raw log lines.

**`log.RequestorId` doesn't help either** — tested live: a requestor ID from an app-less log line had
three other log lines in the same session, all equally app-less (all `JOBSCHEDULER_THREAD_10`
entries). Correlating across a requestor's other log lines is a reasonable idea that didn't pan out on
this data; don't assume it will elsewhere without checking.

**Given all of the above, resolving app identity is a procedure, not a lookup — in this order:**
1. Check `log.app` on the raw log line(s) first (via `opensearch_search_index` on `pega-logs`, or via
   a group's `raw_log_ids` if starting from `pega-analysis-results`) — free and authoritative when
   present, but expect it to be missing for anything batch/job-scheduler/dataflow-shaped.
2. If absent (the common case for infrastructure-flavored errors), **extract every rule/class/activity
   name visible in the message or stack trace** and run an **unscoped, cross-app** `neo4j_query` name
   search (`pega-neo4j-cypher-querying`'s whole-graph guidance — no `WHERE r.environment=` filter) — let the
   graph tell you which environment(s) actually have a matching rule, rather than guessing the app from
   what the name superficially resembles.
3. **A name that looks app-specific can belong to a different app entirely — confirmed live, not
   hypothetical.** Searching for `ServiceRequest` (an OWLM case type) surfaced a group whose rule
   (`ProcessServiceRequestUpdate`) turned out to belong to **`Deal`**, which has its own, separately-named
   `PDS-Deal-Work-ServiceRequest` case type — only caught because the cross-app search step ran before
   assuming OWLM. If the cross-app search returns hits in more than one environment for the same name,
   that's a real ambiguity to surface, not something to silently resolve by picking one.
4. If the graph has nothing either, that's exactly `pega-live-gap-fill`'s scenario — check live via the
   authoring plugin before concluding the rule doesn't exist anywhere.

## 1. The environment landmine applies here too — same mechanism, wider blast radius
`pega_log_analyzer`, `get_rule_summaries`, `pega_get_rule_xml`, `pega_fetch_entire_ruleset_stack`,
and `pega_get_branch_rules` all resolve their `environment` parameter through the **same**
`resolve_environment()`/`PEGA_CONFIGS` mechanism as `neo4j_query` (confirmed: same 8 aliases,
`odpipeline, Tax, OWLM, Deal, Denovo, OARC, CCPM, HRLife`, same silent-fallback-to-default behavior
on a miss) — see `pega-neo4j-cypher-querying` §0 Axis A for the full mechanics, it's identical here. Get
this wrong on `pega_log_analyzer` specifically and you silently query the **wrong live Pega
instance's** class-hash cache — a class hash is instance-specific, so this doesn't even fail loudly,
it just returns "not found" or (worse) a coincidental wrong match. Confirm which app/environment the
error actually came from before calling any of these tools, not after.

## 2. Procedure

**Step 0 — Gather the raw signal.** From the user's paste, or from OpenSearch via
`opensearch_search_index` if step 0's check passed (real field names, confirmed against the live
mapping — `rules`/`representative_log`/`group_signature`/`group_type`/`count`, no `environment`
field, see the trap above):
```
opensearch_search_index(index="pega-analysis-results", query={
  "size": 20,
  "query": {"bool": {"should": [
    {"match_phrase": {"representative_log.exception_message": "<fragment>"}},
    {"wildcard": {"rules.rule_name.keyword": "*<rule/case-type keyword>*"}},
    {"wildcard": {"group_signature.keyword": "*<keyword>*"}}
  ]}},
  "_source": ["group_signature", "group_type", "count", "rule_count", "rules", "representative_log", "status"]
})
```
`match`/`match_phrase` on `group_signature`/`representative_log.*` works for free-text fragments;
`wildcard` on the `.keyword` sub-field is what actually finds app/rule-name substrings — a plain
`match` against those fields returned zero hits in testing where `wildcard` found real results. Most
groups (237 of 252 checked live) have `rule_count: 0` — that's normal for platform/infrastructure
errors (job schedulers, stream/dataflow timeouts), not a sign the query is wrong.

**Always pass `_source` to restrict fields — confirmed live, `opensearch_search_index` itself can
overflow this session's tool-output budget without it**, not just `pega_get_rule_xml` (§2 Step 3). A
plain `{"query": {"term": {"group_type": "CSP Violation"}}}` with no `_source` filter produced a
56,776-character result that got redirected to a file; the same query with `_source` restricted to
the handful of fields actually needed returned instantly and inline. Default to `_source` on every
`opensearch_search_index` call, not just the ones that felt likely to be large.
```
opensearch_search_index(index="pega-logs", query={
  "size": 20, "query": {"query_string": {"query": "<query_string syntax>"}},
  "sort": [{"@timestamp": "desc"}]
})
```
You need at minimum: the exception/stack trace text, and which app/environment it came from — §0b is
the actual procedure for that second part, not a name-match guess.

**Step 1 — KB gate, before spending any tool calls on investigation.** Same Tier-0 idea as
`diagnosis_agent.py`'s KB gate — a prior expert-approved diagnosis for the same error pattern means
the rest of this procedure is unnecessary:
```
opensearch_search_index(index="pega-knowledge-base", query={
  "size": 5,
  "query": {"multi_match": {"query": "<error signature / exception text>",
    "fields": ["title", "error_pattern", "diagnosis_report", "resolution", "expert_feedback"]}}
})
```
A strong hit (judge by whether `error_pattern`/`title` plausibly matches, same score-calibration
discipline as `pega-feature-node-retrieval`) → report it directly, cite it as KB-sourced, stop here. This
index had only 2 documents at last check — a miss here is the common case, not a signal anything's
wrong.

**Step 1.5 — Confirm this is actually a rule-execution error before assuming Steps 2-5 apply.**
Confirmed live: `group_type` on `pega-analysis-results` isn't always "a rule broke" — the observed
values are `Exception` (235 of 252 checked live), `RuleSequence` (15), and `CSP Violation` (2).
**`CSP Violation` groups have no rule, no class hash, and no stack trace at all** — they're the
*browser* blocking a page resource (e.g. `"CSP Violation | Blocked: https://fonts.googleapis.com |
Violated: style-src-elem"`) because Pega's Content-Security-Policy header doesn't allow-list that
host under that directive. Steps 2-4 (resolve a rule, get its logic, blast-radius) are meaningless
here — there is no failing rule. Instead:
```
pega_get_all_content(search_text="<the blocked domain, e.g. fonts.googleapis.com>", environment="<Env>")
```
This finds the CSP policy rule and/or the UI rule referencing the blocked resource — confirmed live,
this surfaced `RULE-ACCESS-CSP PXDEFAULTSECURED` (the platform-default CSP policy) as the actual
configuration object. **Root Cause** for this category is "the CSP policy doesn't allow-list this
host under this directive," and **Resolution** is either extending the CSP rule to allow it (if the
resource is legitimate) or removing the reference to it (if it's stale/unneeded) — not anything
resembling the rule-logic diagnosis Steps 2-5 are built for. Skip straight to a report shaped around
this, don't force a `CSP Violation` group through the rule-resolution steps.

`Exception`/`RuleSequence` groups are the shape Steps 2-5 are actually built for — proceed normally.

**Step 2 — Resolve the failing rule.** If the trace has an obfuscated Java class name:
```
pega_log_analyzer(request_class="<class name from the trace>", environment="<confirmed via §1>")
```
**Confirmed live bug in this tool**: it reports `pzInsKey: null` even on a *successful* resolution.
The tool only checks the API response for `pzInsKey`/`pxInsKey`/`pyInsKey`/`insKey`, but
`D_LogAnalyzerAPI` can return the answer under a different field name — observed live: `rule_key`
(e.g. `"raw": {"rule_key": "RULE-OBJ-ACTIVITY ...", ...}`). **Always check the `raw` object for a
usable key before treating `pzInsKey: null` as a real miss** — a large fraction of "misses" may just
be this extraction gap, not the class-hash cache actually failing.

If `raw` genuinely has nothing usable either — the class-hash cache is per-instance and can be
stale/cleared since the error happened — fall back to `search_rules` on whatever rule-name/
exception-message fragments are visible in the trace, then confirm the candidate against the trace's
class/method names before treating it as the failure point.

**If a candidate rule name looks right but neither the graph nor cross-app `search-rules` finds it,
try `pega_get_rule_version` before concluding it's absent — confirmed live, it found a rule that
*both* of those missed.** A rule on the `SystemMonitoring` ruleset (`ProcessExceptionCases_PDC`,
class `SM-Monitoring-Data-SnowTicketMetrics`) returned nothing from an unscoped `neo4j_query` name
search **and** nothing from `pega-live-gap-fill`'s `search-rules(allApps="true")` — both came back
empty — yet `pega_get_rule_version` found it immediately, `pyRuleAvailable: "Yes"`:
```
pega_get_rule_version(rule_name="<candidate name>", rule_type="<pyRuleObjClass, e.g. Rule-Obj-Activity>")
```
The likely reason: the graph only covers the 9 tracked PDS app environments, and `search-rules`
appears scoped to applications the operator's access group can see — a bare ruleset like
`SystemMonitoring`, used directly by a scheduled job rather than belonging to one of the 12 listed
applications, falls outside both. **Treat `pega_get_rule_version` as a check to run before declaring
a rule absent, not only after both other paths have already failed** — it queries rule existence
directly (`D_GetListOfRelatedRules`) rather than through an app-scoped or semantic-search lens, and
can succeed exactly where both of those miss. Only after `pega_get_rule_version` also comes back
empty across a couple of plausible name variants (case, underscores, common suffixes) is "the rule
doesn't exist under that name at all" the honest conclusion.

**Step 3 — Confirm the rule's actual logic.** Once you have a `pzInsKey`:
```
get_rule_summaries(pz_ins_keys=["<pzInsKey>"], environment="<Env>")
```
Three possible outcomes, not two — confirmed live: `source: "dynamo_cache"` (fine for most answers,
escalate if high-stakes), `source: "freshly_generated"` (fine as-is), or **`source: "not_cached"`**
with no summary content at all, just a message pointing at `pega_get_rule_xml`. Treat `not_cached` as
an unconditional escalation, not an optional one — there's nothing to read otherwise:
```
pega_get_rule_xml(pz_ins_key=..., app_name=..., app_version=..., environment=...)
```
**This can return enough content to overflow this session's own tool-output budget** (observed live:
a 59,947-character result got redirected to a saved file instead of returned inline). The saved file
can itself be one giant unbroken line — `Read` with a line-based `limit` may still exceed the token
budget, and `Grep` may not find tag boundaries if the content isn't formatted the way a pattern
expects. If a full read isn't economical, use `Grep` with a narrow, specific pattern (a known tag
name, a keyword from the error) rather than trying to read the whole file, and say plainly if you
could only read part of it — don't silently drop this and treat the escalation as if it failed. Never
call `get_rule_summaries` on a rule marked `is_stub=true` — reference it by name only.

**Step 4 — Technical impact.** Run `pega-neo4j-cypher-querying`'s blast-radius recipe rooted at this
`pzInsKey` — don't re-derive the Cypher, that skill already has the `ref_category` noise filter and
the hub-node performance guard worked out. This answers "what else breaks."

**Step 5 — Business impact (the gap this skill closes).** Run `pega-feature-node-retrieval`'s procedure
starting from its step 1 existence check, but anchor the search on **this specific rule**, not a
vague topic:
1. `search_features` on the business context implied by the rule name/class (e.g. the case type or
   process it sits in) — read the `description` before trusting a hit, same triage discipline.
2. Confirm the rule actually belongs to that Feature's closure — check whether its `pzInsKey` appears
   in the candidate's `source_rule_fingerprint`, or run `pega-neo4j-cypher-querying`'s "find the root(s) of
   a given rule" recipe (§6 there) and check whether any returned root matches a Feature's
   `root_pzinskey`.
3. **If no Feature node's closure contains this rule, say so plainly** — report the technical blast
   radius from step 4 as the impact, and name the case type/process by the rule's `class_name` if
   inferable, rather than inventing a business narrative with no grounding. This mirrors
   `pega-feature-node-retrieval`'s own "no coverage" fallback — it's the normal case for most rules, not a
   failure of this skill.

**Step 6 — Correlate with prior occurrences.** If step 1 didn't hit but step 0's
`opensearch_search_index` call on `pega-analysis-results` found a same-signature group with a
`diagnosis.report` already populated (`diagnosis.status` other than `PENDING`), incorporate it — don't
re-derive a root cause the platform already established, especially if this run is a re-diagnosis
after the KB was updated.

**Step 7 — Report, in the exact shape `diagnosis_agent.py` produces — not a variant.** Read directly
from its `_SYSTEM_PROMPT` (`IdentifAI-Graph/backend/agents/diagnosis_agent.py`) and confirmed against
a real saved diagnosis in `pega-analysis-results` (the `pzProcessBIXExtractEvents` group, §0's Step 6
example) that this is exactly what production output looks like: **plain-caps section headers, no
markdown `##`, exactly four sections, in this order, no more**:

```
ROOT CAUSE
(What went wrong and why — cite tool evidence.)

EXACT POINT OF FAILURE
(Rule type, name, class, step. State whether it's a resolution failure or logic defect.)

IMPACT ANALYSIS
(What is broken, how many affected, blast radius from graph query results.)

STEP-BY-STEP SOLUTION
(Numbered, concrete steps a developer can execute. End with a verification step.)
```

Fill them from this skill's steps — **this skill's Feature-grounded business impact is real added
value over `diagnosis_agent.py`'s own output, but it folds into `IMPACT ANALYSIS` as a labeled
sub-part, it does not become a fifth section**:
- **ROOT CAUSE** — what actually failed and why, from step 2/3's evidence. Cite the tool evidence
  (which call surfaced which fact), matching the saved-diagnosis example's style ("Tool evidence:
  ...").
- **EXACT POINT OF FAILURE** — rule type, name, class, and step (step 3), and explicitly state
  resolution failure vs. logic defect, matching the prompt's own instruction.
- **IMPACT ANALYSIS** — blast radius from step 4 (note the `ref_category` filter so the reader knows
  it's logic-path callers, not every UI/security reference) **and** business impact from step 5 as a
  clearly labeled part of the same section — the affected process/case type by name from the owning
  Feature's `title`/`business_summary`, or an explicit "no Feature-node coverage for this rule" if
  step 5's fallback applies. Don't split these into separate top-level sections.
- **STEP-BY-STEP SOLUTION** — numbered, concrete steps a developer can execute, grounded in what step
  3 actually showed was wrong, ending with a verification step (matching the saved-diagnosis example's
  own closing "Verification:" step).

**Two rules from `diagnosis_agent.py`'s `_SYSTEM_PROMPT`, carried over verbatim — not this skill's own
invention, but load-bearing enough to state explicitly rather than leave implicit:**
- **Never propose changing an OOTB rule** (`py*`/`pz*`-prefixed) **as the fix — fix the caller
  instead.** The saved `pzProcessBIXExtractEvents` diagnosis (§0's Step 6 example) demonstrates this
  directly: root cause was a blank Access Group on an OOTB internal activity, and the solution section
  explicitly says "Do not modify `pzProcessBIXExtractEvents`... Fix the caller/configuration." Apply
  this rule whenever the failing rule identified in step 2/3 has that prefix — the fix belongs in
  whatever custom rule/configuration invokes it, not in the platform rule itself.
- **Only cite identifiers actually retrieved from a tool call — never invent a `pzInsKey`, rule name,
  or class name** to fill a gap in the report. If a fact isn't confirmed by step 2-5's evidence, say
  it's unconfirmed rather than writing something plausible-sounding.

**If Step 1.5 routed this to the `CSP Violation` branch**, the same four headers still apply — ROOT
CAUSE is the CSP policy/directive gap, EXACT POINT OF FAILURE names the `Rule-Access-CSP` rule (or
referencing UI rule) instead of a failing business rule, IMPACT ANALYSIS is the blocked
resource/occurrence count, STEP-BY-STEP SOLUTION is the policy update or reference removal. Don't
invent different section names for this category — same shape, different content.

## What NOT to do
- Don't call OpenSearch tools without the §0 connectivity check first, and don't retry them in a loop
  when they fail — fall back to a user-pasted excerpt immediately.
- Don't assume `search_analysis_results`/`search_logs`/`search_knowledge_base` exist as tools just
  because they're in `PDS MCP` source — verify via `ToolSearch`, and use `opensearch_search_index`
  with the query bodies in §2 Steps 0/1 if they're not registered (confirmed not registered on this
  deployment as of this check).
- Don't treat a `pega_log_analyzer` `pzInsKey: null` as "the rule can't be identified" without first
  checking the `raw` object — confirmed live, a successful resolution can still report `null` because
  the tool doesn't check every field name the API actually uses (`rule_key` observed). Only fall back
  to `search_rules` after checking `raw` finds nothing either.
- Don't assume an app from a keyword/name match in `pega-analysis-results` (no `environment` field
  exists on these documents) — confirmed live, `ServiceRequest` matched a `Deal` rule, not the OWLM
  one it superficially resembled. Resolve the candidate rule cross-app first (§0b), let that tell you
  the environment.
- Don't treat `log.app` on `pega-logs` as reliably present — confirmed live, it's on only ~7.4% of
  documents, and specifically absent on job-scheduler/dataflow/batch-thread entries, which is most
  error volume. Go straight to the graph cross-search (§0b step 2) for those rather than searching for
  a field that's unlikely to be there.
- Don't try to correlate app identity via `log.RequestorId` across a session's other log lines as a
  shortcut — tested live, it didn't surface anything `log.app` itself didn't already show.
- Don't treat `get_rule_summaries`'s `source: "not_cached"` as equivalent to `dynamo_cache` (i.e.
  "usable, just maybe stale") — it means no content at all; escalate to `pega_get_rule_xml`
  unconditionally, not only when stakes are high.
- Don't silently give up on a `pega_get_rule_xml` result that overflowed to a saved file — it can be
  one unbroken line that `Read`'s line-based `limit` doesn't help with either; use targeted `Grep`
  patterns, and say plainly if only part of it was readable within budget.
- Don't skip the KB gate (step 1) to "be thorough" — it's there specifically to avoid re-diagnosing
  what's already solved, same reasoning as `diagnosis_agent.py`'s own Tier-0 gate.
- Don't report Business Impact from the rule/class name alone when no Feature node's closure actually
  contains the rule — that's guessing, not grounding, and defeats the reason this skill exists.
- Don't re-derive blast-radius or Feature-lookup Cypher from scratch — reuse
  `pega-neo4j-cypher-querying`/`pega-feature-node-retrieval`'s existing recipes and procedure.
- Don't assume the environment for `pega_log_analyzer`/`get_rule_summaries`/etc. from the error text
  alone — confirm it (§1) before the first tool call, since a wrong environment here doesn't error,
  it silently queries a different live Pega instance.
