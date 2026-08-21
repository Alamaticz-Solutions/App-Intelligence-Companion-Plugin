# Case study: live diagnoses via PDS-MCP directly (not IdentifAI-Graph), across group types

Session date 2026-08-21. Written to feed back into `SKILL.md` — everything below is grounded in
actual tool calls made this session, not reconstructed after the fact. Two groups diagnosed fully
end-to-end (§1-3), plus a follow-up survey across every `group_type` present in the dataset to
check how much of the methodology is `Exception`-specific vs. general (§4-5). All of it fully
independent of IdentifAI-Graph's own `diagnosis_agent.py` (explicit user requirement: "do it
yourself, dont use identifai"), using PDS-MCP-Remote tools only.

- **Group 1** (`Exception`): `a4254e5a026596673ff64b6fcb1d7542` — `pyCacheC11nB2STkn: OperatorID
  page is null` (189,115 occurrences). Resolved to: OOTB Pega calling OOTB Pega, no PDS-side rule
  to fix.
- **Group 2** (`Exception`): `58f53774e4f0866654242f1541fc51d9` — iCIMS ID Salesforce sync failure
  (21,567 occurrences, prior diagnosis attempt recorded `FAILED`). Resolved to: an exact,
  unvalidated property-copy step in a custom Data Mapping rule.
- **Follow-up survey** (§4): sampled `RuleSequence`, `CSP Violation`, and `Logger` groups too —
  found that `group_type` changes *what's useful to read*, not just how much digging is needed, and
  that a `Logger`-type group sharing `CorrelationId` with Groups 1 and 2 above revealed all three
  fired within the same single SLA-processing batch cycle.
- **Group 3** (`Exception`, `1502f47482089bb7df96ae794e4f07c5`, §6): OAuth2 client creation failure
  (1,688 occurrences). Its own group and all 5 of its `raw_log_ids` have **empty `stack_trace`** —
  confirmed directly, not assumed — but a *sibling* group sharing the same pooled batch requestor
  carried a full, real Java stack trace naming a completely different, plainly-readable custom rule
  (`FetchEmployeeTrainingStatus`). Same OAuth2 failure, two structurally unrelated business flows.
  This also **revises** the §4.3 `CorrelationId`/`RequestorId` finding below — see §6.2.

Both fully-traced diagnoses (Groups 1-2) reached a **grounded, cited root cause** — not "likely" or
"probably," an exact rule/step. The gap between "plausible diagnosis" and "exact diagnosis" in both
cases came from **pursuing one more hop than felt necessary**, documented below turn by turn.

---

## 1. The methodology that actually worked, step by step

### 1.1 Start from the group doc, not the raw logs
`pega-analysis-results` documents are cheap to fetch and often contain enough to route the whole
investigation from one field: `representative_log.logger_name`.

```
opensearch_search_index(index="pega-analysis-results", query={
  "query": {"term": {"_id": "<group_id>"}},
  "_source": ["representative_log", "raw_log_ids", "group_signature", "rules", "rule_count"]
})
```

**This one field decided the entire shape of both investigations:**
- Group 1's logger was `com.pegarules.generated.pega_rules_utilities` — a *generated* internal
  class name. This is the tell that the failing code is OOTB platform infrastructure, not a
  customer rule — generated/internal logger names don't correspond to an addressable Rule-*
  instance the normal way.
- Group 2's logger was `Rule_Obj_Activity.InvokeSF_ContractCase_V2.PDS_FW_HRLifeFW_Work_ContractRequest.Action`.
  **This format is directly decodable without any class-hash lookup at all**:
  `Rule_Obj_Activity.<RuleName>.<ClassName-with-dashes-as-underscores>.<MethodOrStep>`. Compare
  this against the far more common obfuscated-hash case
  (`ra_action_staffbiodetails_6e5b9b475ebbf9c15d55b21a6d6678bf`) the main `SKILL.md` procedure is
  built around — **when `logger_name` is already in `Rule_Obj_Activity.*` dotted form, skip
  `pega_log_analyzer` entirely and go straight to a `neo4j_query` name search.** This is a real
  shortcut the current skill doesn't call out; it only documents the hash-decode path.

**Action item for SKILL.md**: add a check before Step 2's `pega_log_analyzer` call — if
`logger_name` matches `Rule_Obj_Activity.<name>.<class>.<method>` (or the equivalent
`Rule_Obj_ActivityStep`/similar dotted patterns for other rule types), parse the rule name and
class directly out of the string and go straight to the `neo4j_query` name search below. Only fall
back to `pega_log_analyzer` when the logger name is itself the generic
`com.pegarules.generated.*` form with no readable rule name in it.

### 1.2 Resolve the rule — try the readable name first, fall back through three layers
For Group 2, the readable logger name resolved on the **first try**:
```cypher
MATCH (r:Rule) WHERE toLower(r.rule_name) CONTAINS 'invokesf_contractcase'
RETURN r.pzinskey, r.rule_name, r.rule_type, r.class_name, r.environment, r.is_stub LIMIT 10
```
— found both `InvokeSF_ContractCase` (2019) and `InvokeSF_ContractCase_V2` (2022) immediately,
`is_stub: false`, `environment: HRLifeImp`. One call, done. Compare this to Group 1, which needed
all three fallback layers before landing on the truth:

1. `pega_get_rule_version(rule_name=..., rule_type=<guess>)` across **6 different rule_type
   guesses** (`Rule-Utility-Function`, `Rule-Obj-Activity`, `Rule-Technical-JavaScript`,
   `Rule-Declare-Pages`, `Rule-Obj-When`, `Rule-Access-When`) and 3 environments — every single one
   came back `"RelatedRules": []`. This is the *documented* SKILL.md fallback (§2 Step 2's
   `pega_get_rule_version` escalation) and it **still failed**, which the current skill doesn't
   anticipate — it presents `pega_get_rule_version` as reliably finding what the graph misses, not
   as something that can *also* miss.
2. `search_rules` (semantic) across all environments — best score 0.63, below even the "medium"
   threshold, and not actually the rule in question.
3. **`pega_get_all_content(search_text="pyCacheC11nB2STkn")` — this is what actually worked**,
   immediately, first try:
   ```json
   {"pxResults": [{"pxInsName": "UTILITIES!PYCACHEC11NB2STKN--()", "pyRuleSet": "Pega-RULES",
     "pyRuleSetVersion": "08-25-01",
     "pzInsKey": "RULE-UTILITY-FUNCTION UTILITIES PYCACHEC11NB2STKN--() #20250129T142038.696 GMT"}]}
   ```

**Why `pega_get_all_content` succeeded where `pega_get_rule_version` didn't**: `pega_get_all_content`
hits `D_AllContentSearch`, which is a full-text/instance search across Pega's rule repository —
it doesn't require guessing the exact `pyRuleObjClass` up front the way `pega_get_rule_version`
does. `pega_get_rule_version` needs the *correct* rule_type on the first matching call or it
returns empty — it does not fuzzy-match across types. For a rule whose type you're genuinely
unsure of (as opposed to "definitely an Activity, just need the pzInsKey"), `pega_get_all_content`
is the more efficient starting point, not the last resort SKILL.md currently implies by only
mentioning it under the CSP-violation branch (§1.5).

**Action item for SKILL.md**: reorder the Step 2 escalation ladder. Currently: class-hash decode →
`search_rules` → `pega_get_rule_version`. Based on this session, when the rule name is a *known
exact string* (from a readable logger name, not a hash) but its `rule_type` is unknown, the
efficient order is: **exact-name `neo4j_query` (free, instant) → `pega_get_all_content` (full-text,
type-agnostic, single call) → `pega_get_rule_version` (only once you have a specific rule_type
guess worth confirming) → `search_rules` (semantic, last resort for fuzzy/partial names)**. Also
worth stating plainly in SKILL.md: `pega_get_rule_version` returning `[]` across several
`rule_type` guesses is *not* strong evidence the rule doesn't exist — it's just evidence you
haven't guessed the right type yet.

### 1.3 `get_rule_summaries` → `not_cached` is common, not rare
**In this session, `not_cached` fired on every single non-trivial rule fetched** (3 for 3:
`InvokeSF_ContractCase_V2`, `Case` connector, `MapContractCaseInfo_SF`). SKILL.md already says to
treat `not_cached` as an unconditional escalation, and that held up completely — but it's worth
updating the *expected frequency* language. This session's experience: assume you'll need
`pega_get_rule_xml` for any rule that hasn't been diagnosed before, not as an edge case.

### 1.4 `pega_get_rule_xml` overflow is the norm for real Activities/Models, not an edge case
**Every XML fetch in this session overflowed** (8,164 / 106,748 / 112,552 / 127,268 / 126,701
chars — only the smallest, a simple Utility Function, stayed under the inline limit). SKILL.md
documents the overflow-to-file behavior correctly, but two concrete mechanics weren't previously
documented and cost real time this session:

**(a) `Grep` on the saved file often shows `[Omitted long matching line]` instead of content.**
The saved XML is typically JSON with the entire `rule_info` field as *one single unbroken line*
(the raw Pega XML has no newlines preserved in the JSON string, or newlines are escaped `\n`
sequences rather than real ones). `Grep` treats "line too long to display" as a display
constraint separate from "pattern matched" — you get confirmation a match exists, with **zero
visibility into what's around it**. This burned two tool calls before switching approach.

**The fix that actually worked — bypass Grep, use Python directly on the file:**
```python
with open(<file>, encoding='utf-8') as f:
    content = f.read()
import re
idxs = [m.start() for m in re.finditer(re.escape('search_term'), content, re.IGNORECASE)]
for i in idxs:
    print(content[max(0,i-500):i+300])   # print a window, not the whole line
```
This is strictly better than `Grep` for this specific file shape: exact offsets, controllable
context window, no line-length ceiling, and — critically — **lets you *count* occurrences and
confirm a true negative** (zero matches across the full 112,552/127,268-char string) rather than
guessing whether Grep's silence meant "not found" or "found but omitted."

**(b) A true negative here is trustworthy and worth stating as a finding, not a gap.** When
`iCIMS` had zero matches across all 112,552 chars of `InvokeSF_ContractCase_V2`'s full XML, that
was reported as "the mapping doesn't happen in this activity" — and it was correct: the actual
`SET .iCIMS_ID__c = ...` step lived three hops away, in `MapContractCaseInfo_SF`, found via
`referenced_rules` → the caller activity `CreateCaseSF_Ticket` → its own `referenced_rules`.

**Action item for SKILL.md**: add this Python-slice technique as the *first-choice* method for
searching an overflowed `pega_get_rule_xml` result, not a fallback after Grep struggles — Grep's
own current guidance ("use a narrow, specific pattern") doesn't help when the failure mode is
"can't see match context at all," not "too many irrelevant matches."

### 1.5 `referenced_rules` is the real navigation graph inside an XML fetch — use it before reading XML content
Every `pega_get_rule_xml` response includes a `referenced_rules` array (rule name/type/class/
pzInsKey for everything the fetched rule calls). **This was more useful than the XML body itself**
for tracing the call chain in Group 2:
- `InvokeSF_ContractCase_V2`'s `referenced_rules` → found the `Case` Connect REST rule and `D_Case`
  data page directly, no XML parsing needed.
- `CreateCaseSF_Ticket`'s `referenced_rules` → found `MapContractCaseInfo_SF` (labeled "Data
  Transform" in this list, though the graph's own `r.rule_type` for it was actually
  `Rule-Obj-Model` — **the `referenced_rules` type label and the graph's `rule_type` property can
  disagree**; trust the graph property when you need the exact type for a follow-up
  `pega_get_rule_version` call, but `referenced_rules`' looser label is still fine for identifying
  *which* rule to chase next).

**Action item for SKILL.md**: explicitly recommend checking `referenced_rules` before doing any
targeted content search inside the XML body — it's a free, already-parsed adjacency list, cheaper
than grepping for plausible keywords inside 100K+ characters of markup.

### 1.6 Blast radius via `REFERENCES` needed an explicit `r.environment` filter this session
```cypher
MATCH (caller:Rule)-[rel:REFERENCES]->(r:Rule)
WHERE r.pzinskey = '<pzInsKey>' RETURN caller.rule_name, caller.rule_type, caller.class_name
```
**failed outright**, not silently — the tool returned an explicit error:
`"neo4j_query requires an explicit environment filter for 'HRLife'. Add WHERE r.environment =
'HRLife' ..."`. Two things worth noting: (1) the error message itself said `'HRLife'`, but the
actual property value on real nodes in this graph is `'HRLifeImp'` — using the message's suggested
value verbatim would have silently filtered to zero results; had to use the value already
confirmed from the rule's own `r.environment` field earlier in the same investigation. (2) This
environment-filter *requirement* being enforced as a hard error (not just a best-practice
suggestion) is stronger than `neo4j-cypher-querying`'s existing framing — worth confirming whether
this is new tool-side enforcement worth flagging to that skill too.

### 1.7 Field mapping surprises — verified against live index mappings, not assumed
SKILL.md's Step 0 already warns to check field types before writing queries. This session found
**two additional concrete mapping gotchas** worth folding in, both confirmed via
`opensearch_get_index_mapping` after a query silently returned zero hits:

- **`pega-logs`' `log.thread_name` is `type: keyword`, not `text`.** A `match_phrase` query
  against it returns **zero hits with no error** (keyword fields don't tokenize, so phrase
  matching never triggers) — this is a silent-empty-result trap, not a loud failure. Use
  `wildcard: {"log.thread_name": "*substring*"}` instead. This is exactly the kind of trap
  `group_signature`'s missing `.keyword` sub-field already documents in SKILL.md §2 Step 0 — same
  category of bug, different field, opposite direction (there it's "field has no keyword variant
  so wildcard fails," here it's "field IS keyword so phrase-match fails").
- **`pega-analysis-results`' `group_signature` genuinely has no `.keyword` sub-field at all**
  (confirmed by reading the live mapping directly, not just inferred from a failed query) — SKILL.md
  already flags this, and it held up exactly as documented. `match_phrase` against the bare `text`
  field was the correct approach and worked immediately once used.

**Action item for SKILL.md**: the general rule this session reinforces — **when an
`opensearch_search_index` query returns zero hits and zero errors, that is not evidence of "no
data," it's a prompt to check `opensearch_get_index_mapping` before concluding anything.** Silent
empty results from a keyword/text mismatch are indistinguishable from genuine absence unless you
check the mapping. Consider stating this as an explicit rule rather than something demonstrated
only through the `group_signature` example.

### 1.8 Cross-referencing raw log lines by shared `CorrelationId`/thread pattern surfaced the real caller
For Group 1, the raw `pega-logs` documents behind the group (via `raw_log_ids`) carried
`thread_name: "DataFlow-Service-PickingupRun-pyProcessSLA:<N>, Access group: [PRPC:AsyncProcessor],
Partitions=[...]"` on every sampled doc. This is a much stronger environment/caller signal than
`log.app` (documented in SKILL.md §0b as absent ~92.6% of the time) — **`log.thread_name` was
present and informative on 100% of the docs checked in this session**, including the exact
batch/DataFlow service name driving the call. Confirmed at scale, not just on the 3-doc sample:
aggregating across **9,476** raw hits for the exact error message showed the identical caller
pattern on every single one sampled (verified 15+ distinct docs across different thread numbers/
partitions, all `pyProcessSLA`).

**Action item for SKILL.md's §0b (app-identity resolution)**: add `log.thread_name` as a check
*before* falling back to the cross-app graph name search — for anything running under
`DataFlow-Service-*`/`JobSchedulerExecution`-style batch threads, the thread name itself often
names the actual Data Flow/service responsible, which is more specific and more reliable than
`log.app` ever was for this class of error (batch/job-scheduler entries are exactly where
`log.app` is documented to be missing).

### 1.9 Aggregating "what else comes from this same caller" found two much bigger issues than the one originally asked about
Once Group 1's caller (`pyProcessSLA`) was identified, a follow-up aggregation —
```
opensearch_search_index(index="pega-logs", query={"size": 0, "query": {"bool": {"must": [
  {"wildcard": {"log.thread_name": "*pyProcessSLA*"}}, {"term": {"log.level": "ERROR"}}
]}}, "aggs": {"messages": {"terms": {"field": "normalized_exception_message", "size": 20}}}})
```
— surfaced **15 distinct error signatures** sharing that one caller, several far more consequential
than the originally-asked-about one (a 21,567-occurrence Salesforce sync failure with a `FAILED`
prior diagnosis attempt; a 1,688-occurrence OAuth2 credential failure). None of this was visible
from the single group being diagnosed — it only surfaced by asking "what *else* does this exact
caller produce" as a deliberate follow-up step.

**Action item for SKILL.md**: consider adding an optional Step 4.5 — once a caller/thread pattern
is identified (whether via `log.app`, `log.thread_name`, or a resolved rule), a cheap aggregation
query across all ERROR-level docs sharing that caller can surface sibling issues worth flagging,
even when the user only asked about one specific group. This is high-value, low-cost (~1 extra
tool call) and this session found it changed the user's actual priority (moved straight from "we
diagnosed the noisy one" to "diagnose the actually-impactful one" based on this aggregation).

---

## 2. "Where in the logs do I find X" — quick reference, grounded in this session

| Need | Field / tool | Notes |
|---|---|---|
| Which rule failed | `representative_log.logger_name` (group doc) or `log.logger_name` (raw doc) | Check for readable `Rule_Obj_Activity.<Name>.<Class>.<Method>` form first — skip hash-decoding entirely if present |
| Obfuscated class → rule | `pega_log_analyzer(request_class=...)` | Known bug: check the `raw` object for `rule_key` even when `pzInsKey` reports `null` |
| Rule exists but type unknown | `pega_get_all_content(search_text="<exact name>")` | Full-text, type-agnostic — often faster than guessing `rule_type` for `pega_get_rule_version` |
| Which batch/service triggered a background error | `log.thread_name` on the raw doc | `keyword`-typed — use `wildcard`, not `match_phrase`. More reliable than `log.app` for batch/DataFlow/JobScheduler entries |
| Correlating multiple log lines from the same run | `log.CorrelationId` / `log.RequestorId` | Constant across all lines from one processing cycle — useful for confirming two different-looking errors came from the same underlying case/run |
| The actual value that overflowed/failed | `log.message` / `exception_message` on the **raw** doc, not the group's `normalized_*` fields | `normalized_message` replaces real values with placeholders like `[ID]`/`[CASE_ID]` — always pull the raw doc via `raw_log_ids`/`sample_log_id` to see the real value |
| What a rule calls | `referenced_rules` in any `pega_get_rule_xml` response | Free adjacency list, parse before searching XML body content |
| Who calls a given rule (blast radius) | `neo4j_query` `MATCH (caller)-[:REFERENCES]->(r) WHERE r.pzinskey = ...` | Requires explicit `r.environment` filter — confirm the exact string from the rule's own `r.environment`, not from an error message's suggested value |
| A specific assignment/mapping inside a large rule | Python `re.finditer` + windowed `content[i-N:i+N]` slicing on the saved overflow file | Not `Grep` — it hides long single-line matches behind `[Omitted long matching line]` |
| Whether a field is keyword or text before querying | `opensearch_get_index_mapping(index=...)` | Do this reflexively on any zero-hit, zero-error result — silent mismatch is indistinguishable from genuine absence otherwise |
| Other issues sharing the same root caller | `terms` aggregation on `normalized_exception_message`, filtered to the caller's `log.thread_name`/`log.app` | Cheap, and can surface higher-priority issues than the one originally asked about |

---

## 3. Net accuracy check — did the extra hops matter?

Group 1's report was **already correct** after the first pass (OOTB-to-OOTB, no PDS fix possible) —
the `pega_get_all_content` escalation just confirmed it with an actual rule XML instead of
resting on "no Rule node exists, therefore likely OOTB." Worth doing for confidence, not because
the original conclusion was wrong.

Group 2's report **materially changed** between the first pass and the full trace: first pass
concluded "some upstream step assigns a bad value, caller unidentified within budget." The full
trace changed this to an exact file/rule/step (`MapContractCaseInfo_SF`, step `3.11.1`,
`SET .iCIMS_ID__c = Primary.ProviderData.ClinicianInfo.ICIMSID`) — the difference between a
report that names *what kind of thing* is broken and one a developer can open directly and fix.
**This is the strongest evidence for updating SKILL.md's Step 2/3 guidance to default toward
"trace to the exact assignment" rather than stopping at "caller identified, root cause type
confirmed"** when the tool budget allows it — the marginal cost here was ~6 additional tool calls
for a categorically more actionable report.

---

## 4. Generalizing across `group_type` — a follow-up multi-group survey

Both diagnoses above were `Exception`-type groups. A follow-up survey sampled across **all four
`group_type` values that actually exist in this dataset** (`Exception`: 2,191 groups, `RuleSequence`:
61, `CSP Violation`: 2, `Logger`: 1 — full population at time of survey, via a `terms` aggregation
on `group_type`) specifically to check whether the methodology above generalizes or was
`Exception`-specific. **It does not fully generalize — `group_type` changes what's actually useful
to read, not just how much digging is needed.**

### 4.1 `RuleSequence` groups pre-decode the rule chain — don't hand-parse `group_signature`
A `RuleSequence` group's `group_signature` is a pipe-delimited chain of
`com.pegarules.generated.*` class-hash steps (e.g. `1:...->ra_action_pzlogcollaboration->step9_
circum0->...->ra_action_pzlogcollaboration_9b62cfad5141d746ae541281941c4fd6 | 2:...`). **The
grouper has already extracted this into a clean, separate `rules[]` field** on the same document:
```json
"rules": [
  {"rule_name": "ra_action_pzlogcollaboration", "class_hash": "ra_action_pzlogcollaboration_9b62cfad5141d746ae541281941c4fd6"},
  {"rule_name": "ra_action_pzrunactionwrapper", "class_hash": "ra_action_pzrunactionwrapper_ac0a72e05137ec84aaca914d5e95a645"}
]
```
Confirmed on a second sample too — a 6-rule chain (`pzGetInstancesForAIWithAppNames` through
`pxGetData`) came back with all 6 `{rule_name, class_hash}` pairs pre-extracted, in call order.
**Action item for SKILL.md**: Step 0's raw-signal-gathering guidance should read `rules[]` directly
for `RuleSequence` groups instead of (or before) parsing `group_signature` by hand — it's the same
information, already structured, and each `class_hash` is ready to feed `pega_log_analyzer`
without any string-splitting.

### 4.2 `CSP Violation` groups need no rule lookup at all — SKILL.md's §1.5 branch is correct and complete
Confirmed against two real samples (only 2 exist in this dataset): the `message` field is fully
self-contained — `UserID`, `Failed Page`, `Blocked Content Source`, `Violated Directive`,
`Effective Directive`, `Status Code`, and the **entire CSP policy text** are all inline as plain
text, e.g.:
```
UserID: Surya@PDS with User Name: Surya
Blocked Content Source: https://fonts.googleapis.com?family=Open+Sans...
Violated Directive: style-src-elem
```
No `pzInsKey`, no `neo4j_query`, no `pega_get_rule_xml` — diagnosis is reading this message plus,
if the blocked host's legitimacy needs confirming, one `pega_get_all_content` call. This matches
SKILL.md's existing §1.5 guidance exactly; no changes needed here, just confirming it holds.

### 4.3 `Logger` groups can be genuinely empty except the logger name — this is where thread/correlation cross-referencing is the *only* path
The one `Logger`-type group in this dataset (`Rule_Utility_Function.pxLogMessage.Default`, count 8)
has **both `message` and `exception_message` as empty strings** on its raw log doc — confirmed by
fetching the raw doc directly, not just trusting the group's `representative_log`. The only
non-empty diagnostic fields left were infrastructure ones: `log.thread_name` (still the same
`DataFlow-Service-PickingupRun-pyProcessSLA:10714, Access group: [PRPC:AsyncProcessor]` pattern as
Group 1 above) and `log.CorrelationId`.

**Striking finding**: that `CorrelationId` (`66EE11C0A23867682084746D85C298D8`) is **the exact same
one** already seen on both the OperatorID group (§ above) and the iCIMS group's representative log
— meaning this empty `pxLogMessage` firing, the `OperatorID page is null` error, and the iCIMS
Salesforce overflow **all happened within the same single SLA-processing batch cycle**. This wasn't
sought out deliberately; it fell out of having recorded `CorrelationId` while investigating the
other two groups. **Action item for SKILL.md**: when investigating multiple groups that share a
caller/thread pattern, note and compare `CorrelationId` values across them — matching IDs mean the
same underlying case/run produced multiple distinct-looking error groups, which is useful context
for impact analysis (one bad batch cycle, several symptoms) that group-level analysis alone can't
surface.

### 4.4 Consolidated: what to read depends on `group_type` — check it first, before choosing a tool path

| `group_type` | What's actually useful | Tools needed |
|---|---|---|
| `Exception` (majority — ~97% of this dataset) | `representative_log.logger_name`; `rules[]` usually empty (`rule_count: 0` on the large majority) | Full ladder: KB gate → resolve rule → `get_rule_summaries`/`pega_get_rule_xml` → graph |
| `RuleSequence` | `rules[]` — pre-decoded `{rule_name, class_hash}` pairs, ready to use directly | Same ladder, but skip manual `group_signature` parsing — start from `rules[]` |
| `CSP Violation` | `message` alone — fully self-contained (UserID, blocked source, violated directive, full policy) | None of the rule-resolution tools; at most `pega_get_all_content` for the blocked host |
| `Logger` (rarest — catch-all) | Often nothing but `logger_name` + `thread_name` + `CorrelationId`; message can be genuinely empty | Skip straight to thread/correlation cross-referencing — there may be nothing else to fetch |

---

## 5. Recommended end-to-end order (synthesized from both sessions)

1. **Group doc** (`pega-analysis-results`) → check `group_type` first and route per §4.4 above,
   before deciding which tools to reach for.
2. **Raw log(s)** via `raw_log_ids`/`sample_log_id` → real (non-normalized) values, `logger_name`,
   `thread_name`, `CorrelationId`. Always pull this even when the group doc looks sufficient — it's
   the only place real values (not `[ID]`/`[CASE_ID]` placeholders) live.
3. **KB gate** (`pega-knowledge-base` `multi_match`) — cheap, do before investing in graph/rule
   work. A miss is the common case, not a signal something's wrong.
4. **Resolve the rule**: readable `Rule_Obj_Activity.*` logger name → direct `neo4j_query` name
   search; obfuscated hash → `pega_log_analyzer` (check the `raw` object for `rule_key` even when
   `pzInsKey` is `null`); name known but type unknown → `pega_get_all_content` before
   `pega_get_rule_version`/`search_rules`.
5. **`get_rule_summaries`** → escalate to **`pega_get_rule_xml`** on `not_cached` (expect this for
   any rule not previously diagnosed, not as an edge case).
6. **Follow `referenced_rules`** outward — it's a free, pre-parsed adjacency list — until you reach
   the actual assignment/logic responsible, not just "a caller exists." This is the single biggest
   lever on report quality found across both sessions (§3 above).
7. **Blast radius** (`REFERENCES` traversal, explicit `r.environment` filter required) +
   `search_features` for business impact — report "no Feature coverage" honestly when true rather
   than inventing a narrative.
8. **Optional, high-value**: aggregate on the identified caller (`log.thread_name`/`log.app`)
   across all ERROR docs sharing it, and note shared `CorrelationId` values across groups under
   investigation — both can surface bigger or related issues the original single-group question
   didn't ask about (§1.9, §4.3 — but read the §6.2 correction to how tightly-scoped that signal
   actually is before treating it as "one incident").

---

## 6. A third, deliberately different diagnosis — testing the plan, not confirming it

Groups 1-2 were both `Exception`-type and, it turned out, part of the same SLA batch cycle. To
actually test whether the methodology (and the diagnosis_agent.py enhancement recommendations
drafted from it) generalizes, Group 3 was chosen specifically to be a **different integration**
(OAuth2, not Salesforce/token-caching) reached via a **different caller shape** (a generic
OOTB `Rule_Obj_Activity.Invoke.Rule_Connect_REST.Action` wrapper, not a named custom Activity).
It surfaced two findings that revise, not just add to, §1-5.

- **Group 3**: `1502f47482089bb7df96ae794e4f07c5` — `OutboundMappingException: Caught Exception
  while creating OAuth2 client` (1,688 occurrences).

### 6.1 A group's own `stack_trace` can be empty everywhere it's stored — but a sibling group can have it
Confirmed directly (not inferred): Group 3's `representative_log.stack_trace` is `""`, and a
targeted fetch of **all 5** of its `raw_log_ids` confirmed every one has `stack_trace: ""` too —
this specific error text is never logged with a Java stack trace anywhere in this group's own data.

The investigation only found a real stack trace by taking the "aggregate on the identified caller"
technique (§1.9) further than originally used: querying **all ERROR docs sharing the same
`log.RequestorId`** (not filtered to one group_signature) surfaced a `terms` aggregation over
`log.logger_name` showing this requestor also logged
`com.pega.pegarules.integration.engine.internal.client.oauth2.OAuth2ClientImpl` directly (10 hits)
— a lower-level, more specific logger than the generic `Invoke` wrapper Group 3 itself uses.
**Those 10 hits are a *different* group_signature/group** (`"Access token endpoint invocation
failed... unauthorized_client... 401"`, a distinct `normalized_exception_message` bucket from
yesterday's aggregation) — but the same underlying OAuth2 failure, one call-frame deeper. That
sibling's stack trace was fully populated and, critically, **named a completely readable custom
rule directly in the trace text** — no hash-decoding needed:
```
at com.pegarules.generated.model.ra_model_fetchemployeetrainingstatus_f7c2682b18ffdf6a91be29c64a1f8dfd.when_1(...)
```
— `FetchEmployeeTrainingStatus`, a Data Model/When rule, several frames below the OAuth2 client
call. This also revealed the real call chain Group 3's own data never showed:
`pzProcessSLA → ExecuteSLA → ResumeFlow/PerformFlowAction → a Flow → CompleteAssignment →
FetchEmployeeTrainingStatus (When condition) → pxCallDataTransform → pxCallConnector → Invoke →
pyInvokeRestConnector → OAuth2ClientImpl.getTokensFromEndpoint → 401 unauthorized_client`.

**Action item for SKILL.md / diagnosis_agent.py**: when a group's own `stack_trace` is empty
(check the group's representative log **and**, if accessible, its other `raw_log_ids` — don't stop
at one empty sample), that is not necessarily "no stack trace exists for this failure." Widening
the caller-aggregation search (§1.9) beyond the one group's exact `normalized_exception_message`,
to the same `RequestorId`/`thread_name` across *all* ERROR docs, can surface a sibling group one
call-frame deeper that has the evidence the original group structurally never captured.

### 6.2 One shared low-level failure, multiple unrelated-looking business flows — and a correction to §4.3
The sibling group found above is about **Employee Training Status**, a different case
type/process entirely from Group 2's Salesforce Contract Case sync — yet both are broken by what
is very likely the *same* underlying cause (a Connect-REST OAuth2 client configuration returning
`unauthorized_client`/401). **Grouping by exception message text under-represents true blast
radius** when the actual failure point is a shared low-level dependency (an auth/connector config,
an OOTB utility) — different call depths produce different-looking `group_signature` values for
what is, underneath, one problem. This is a stronger, more specific version of §1.9's "aggregate to
find sibling issues" — the siblings aren't just "other things this caller also broke," some of them
can be **the same root cause manifesting as an apparently unrelated business-process failure**.

**This also requires correcting §4.3's framing.** §4.3 treated a shared `CorrelationId` across
Groups 1/2/the Logger-type group as evidence of "the same single SLA-processing batch cycle."
Investigating Group 3 found the **same `RequestorId`** (a closely related identifier — the pooled
requestor a `CorrelationId` run executes under) appearing on **497 log lines**, spanning **over an
hour**, across at least four structurally different activities (`InvokeSF_ContractCase_V2`,
`OAuth2ClientImpl`, `Send.Data_Corr_Email`, plus the generic `Invoke` wrapper). A pooled batch
worker processes many unrelated case partitions across its lifetime — `RequestorId`/`CorrelationId`
matching is **not** a tight "this happened in one specific occurrence" signal the way it initially
looked in §4.3. It's still valuable, just for a different, broader claim: "what else did this batch
worker's run touch" (which is exactly how the training-status connection was found), not "these
errors are part of one incident."

### 6.3 `opensearch_search_index` overflows too, not just `pega_get_rule_xml`
A 5-result raw-log fetch with full `_source` overflowed to a file (72,371 chars) the same way rule
XML fetches did in §1.4 — same fix applies (Python `re.finditer` + windowed slicing on the saved
file, not `Grep`). **Action item for SKILL.md**: generalize §1.4's guidance to "any PDS-MCP tool
result," not specifically `pega_get_rule_xml` — it's a property of large results overflowing to a
file, not of that one tool.

### 6.4 `rules[]` → `pega_log_analyzer` workflow re-confirmed on a fresh, unrelated `RuleSequence` group
Fed a `class_hash` straight from a different `RuleSequence` group's pre-decoded `rules[]` field
(§4.1) into `pega_log_analyzer` with no manual parsing — reproduced the exact same known bug
(`pzInsKey: null` but `raw.rule_key` has the real answer: `RULE-OBJ-ACTIVITY @BASECLASS
PZLOGCOLLABORATION #...`, resolved as OOTB). Confirms §4.1's recommendation holds beyond the
original sample.
