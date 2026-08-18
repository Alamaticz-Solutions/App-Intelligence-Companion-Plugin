---
name: pega-code-review
description: "Formal pre-promotion code review for a Pega rule/branch — mandatory graph investigation (G1-G4), PASS/WARN/FAIL verdict with an auto-FAIL-upgrade for multi-app blast radius, per-rule-type defect checklists (Activity, Data Transform, generic). Mirrors IdentifAI-Graph's code_review_agent.py/registry.py exactly, grounded live. Distinct from pega-impact-analysis (forecasts a proposed change) and pega-log-diagnosis (reacts to a live failure) — this is a governance gate on a change someone already wrote."
---

<!-- Skill version: 1.2.1 | 2026-08-18 — fixed Step 3b's get-skill path: no trailing .json on the
     schema skill name, confirmed live (the .json-suffixed form 404s). -->
<!-- Skill version: 1.1.0 | 2026-08-17 — dependency-content check added after an independent review caught a real missed CRITICAL -->

# Pre-promotion code review: mandatory graph queries → defect checklist → PASS/WARN/FAIL

## Trigger phrases
"review this rule before promotion", "code review this branch", "is this safe to promote", "LSA
review", any request to formally gate a rule change someone has already written before it merges.
**Distinct from the other two skills in this family**: `pega-impact-analysis` forecasts a *proposed*
change before it's written; `pega-log-diagnosis` reacts to a failure already in production; this
skill reviews a change that's already been authored, as the gate before it ships.

## What this is
`IdentifAI-Graph/backend/agents/code_review_agent.py` + `registry.py` define this exactly — read
directly, not inferred. Three things carried over verbatim because they're load-bearing, not stylistic:
- **The four mandatory graph queries (G1-G4)**, run before reading any rule logic, not after.
- **The verdict rubric**, including an automatic FAIL-upgrade rule: multi-app blast radius + a
  functional defect present overrides everything else to FAIL, regardless of the defect's own severity.
- **Per-rule-type defect checklists** (Activity, Data Transform, generic fallback for everything
  else) — specific, named failure patterns with a fixed severity each, not open-ended judgment.

**Compose, don't duplicate**: business-impact/Feature-node grounding reuses `pega-feature-node-retrieval`;
graph gaps hand off to `pega-live-gap-fill`; the actual rule-type-specific *authoring* correctness
reference (independent of this review checklist) already exists as bundled plugin runtime skills —
`get-skill("rules-rule-obj-activity")`, `get-skill("rules-rule-obj-model")`, etc. — cross-check
against those for anything more current than the fixed checklist below, which is a review lens, not
the authoring source of truth.

## Procedure

**Step 0 — Get the rule(s) under review.** For a whole branch: `pega_get_branch_rules(branch_id=...)`
(use `pega_list_branches` first if you don't have the ID). For a single rule: the `pzInsKey`/
`rule_name`+`rule_type` directly. Confirm environment per `pega-neo4j-cypher-querying` §0 before the first
graph call.

**Step 1 — G1-G4, before reading any rule logic.** Confirmed live (grounded against
`ValidateStaffInformation`, `ProcessServiceRequestUpdate`, others): these queries as written have **no
explicit `WHERE r.environment=` filter** — they're deliberately cross-app for G2/G3 (that's the point,
blast radius spans apps by design). Tested and confirmed they don't trip the Axis-A landmine for
typical rule/class names (none of the tested names embedded an alias substring), but a rule literally
named something like `DealApprovalActivity` would — if one of these errors with "explicit environment
filter required," add a harmless comment mentioning `environment` (`pega-neo4j-cypher-querying` §6's
Class/Ruleset workaround), don't add a real filter that would defeat G2/G3's cross-app purpose.

```cypher
-- G1: Existence and stub check — ALWAYS run first
MATCH (r:Rule)
WHERE toLower(r.rule_name) = toLower('<rule_name>') AND r.rule_type = '<rule_type>'
RETURN r.rule_name, r.class_name, r.ruleset, r.ruleset_version,
       r.is_stub, r.environment, r.pzinskey
ORDER BY r.is_stub ASC, r.ruleset_version DESC
LIMIT 10
```
Decision rules: **all rows `is_stub=true`** → OOTB platform rule, review governance only, never
propose logic changes (fetch its XML only if truly needed). **No rows at all** → don't conclude
"not present" — try `pega_get_rule_xml`/`pega-live-gap-fill` before writing any finding, same
discipline as `pega-log-diagnosis`'s `pega_get_rule_version` escalation. **Multiple non-stub rows,
different `ruleset_version`** → a shadow-override exists; flag which version actually resolves at
runtime (highest version in the app's ruleset stack — `pega-neo4j-cypher-querying` §6's ruleset-stack
recipe answers this).

```cypher
-- G2: Cross-app blast radius
MATCH (caller:Rule)-[:REFERENCES]->(r:Rule)
WHERE toLower(r.rule_name) = toLower('<rule_name>') AND r.rule_type = '<rule_type>'
  AND caller.is_stub = false
RETURN caller.environment AS app, count(caller) AS caller_count,
       collect(caller.rule_name)[0..4] AS sample_callers
ORDER BY caller_count DESC
```
**Multiple apps returned** → enterprise-wide blast radius; any functional defect here is P0 across
every listed app, and per the verdict rubric (Step 4) this forces FAIL regardless of the defect's own
severity. **Single app** → score normally. **Zero rows** → note blast radius as unverified, not "no
callers" — same "empty result is a claim, verify it" discipline as everywhere else in this skill family.

```cypher
-- G3: Caller contract — what each caller type expects
MATCH (caller:Rule)-[:REFERENCES]->(r:Rule)
WHERE toLower(r.rule_name) = toLower('<rule_name>') AND r.rule_type = '<rule_type>'
  AND caller.is_stub = false
RETURN caller.rule_name, caller.rule_type, caller.class_name, caller.environment, caller.ruleset
ORDER BY caller.environment, caller.rule_name
LIMIT 25
```
Breakage mode by caller type: **`Rule-Obj-Activity`** caller → parameter/page-name changes break it
directly. **`Rule-Declare-Pages`** caller → this rule feeds a data page; removing an output property
makes the data page silently return empty, not error. **`Rule-Obj-Model`** caller → renaming an output
property breaks that Data Transform's mapping with no error. **`Rule-Obj-Report-Definition`** caller →
column renames break report output silently. Document which caller types are actually present and the
specific breakage mode for each.

```cypher
-- G4: Outbound dependencies
MATCH (r:Rule)-[:REFERENCES]->(dep:Rule)
WHERE toLower(r.rule_name) = toLower('<rule_name>') AND r.rule_type = '<rule_type>'
  AND r.is_stub = false
RETURN dep.rule_name, dep.rule_type, dep.class_name, dep.is_stub, dep.ruleset, dep.ruleset_version
ORDER BY dep.is_stub DESC, dep.rule_name
LIMIT 20
```
**`dep.is_stub=true`** → OOTB dependency, confirm it's actually present in the app's ruleset stack
before flagging anything. **Same dep name, multiple versions** → a dependency-side shadow-override;
confirm which one resolves. **Dep absent from the graph entirely** → the called rule isn't promoted to
this environment yet, or isn't here at all — flag as HIGH, don't assume it's fine.

**Step 2 — Fetch rule content, summaries before XML.** `get_rule_summaries` is cheap and cached;
`pega_get_rule_xml` is the escalation — cap at 2 fetches per review unless the defect clearly needs
more. Stop once root cause can be stated with concrete evidence, same discipline as
`pega-log-diagnosis`. If `get_rule_summaries` returns `source: "not_cached"`, that's an unconditional
escalation to XML (same three-outcome handling as `pega-log-diagnosis` Step 3), not an optional one.

**Confirmed live miss, caught by an independent second-pass review (`pega-independent-code-reviewer`)
on `PopulateConfirmationMessage`**: a WARN-verdict review turned out to have missed a real CRITICAL
defect (a stale `ExpressionBuilder` cache — all 6 WHEN branches, confirmed by fetching the dependency
directly, not the 5 the independent pass itself first reported) because G4 only confirms an outbound
dependency *exists* with a single version — it says nothing about whether that dependency's own
content has a defect. **If G4 shows a business-logic-bearing outbound dependency (Data Transform,
Decision Table, `Rule-Obj-Validate`) and fetch budget allows, fetch that dependency's own content and
run the same CRITICAL checklist items (stale `ExpressionBuilder` cache especially) against it, not
just the rule under review** — a defect can live entirely inside a called rule and never appear in
the calling rule's own step list. This is the single most valuable thing an independent second
reviewer catches, precisely because it requires drilling one level deeper than the review under time
pressure tends to go.

**Step 3 — Apply the rule-type-specific checklist.**

*`Rule-Obj-Activity`* — CRITICAL (any one = FAIL): self-assignment inside a `FOR_EACH` loop body
(`.X = .X` where target and source are the same page — the target gets its own empty/default value,
not the source; name the step, property, and what downstream code receives). A precondition/routing
defect that skips steps performing required setup. A stale `ExpressionBuilder` cache (stored
expression ≠ canonical) — state which version Pega actually evaluates at runtime. HIGH: a `Call` step
with no `pyOnException` (name the exception that propagates uncaught). `Page-New` with no matching
`Page-Remove` (memory leak under load — name the page). Empty `pyActivityPrivilegeList` on an
externally-callable activity. `Obj-Open-By-Handle` with no prior handle validation. MEDIUM: a bloated
parameter list from an uncleaned clone (>15 unused params). `ForEach` on a large page list with no exit
condition. Hardcoded literals that should be Constants/CDTs/Data Pages. Nesting >4 levels deep
(summarize *all* affected steps in one finding, don't list each separately). A backward jump to a
lower step — potential infinite loop, escalate to CRITICAL if it's provably unbounded. LOW: unverified
clone lineage, an unmerged branch, a blank description, no PegaUnit test.

*`Rule-Obj-Model`* (Data Transform) — CRITICAL: a true self-assignment **outside** a mapping block
(`SET .X = .X` at top level is a genuine no-op) — but **`.X = .X` inside `APPEND_AND_MAP_TO` or
`UPDATE_PAGE WITH_VALUES_FROM` is valid cross-page copy, never flag it**, that's the source page
context, not a defect. Stale `ExpressionBuilder` cache, same as Activity — AND-vs-OR here is a logic
inversion, not just a style issue. A mapping-completeness gap: a target property set in the
`OTHERWISE` branch but missing from one or more `WHEN` branches. HIGH: missing `OTHERWISE`/null safety
leaving a property at default/empty on an unhandled branch. `pxExecuteAnActivity` called inside a
`SET` expression (bypasses normal error handling). A dynamic `APPLY-MODEL` whose runtime model name
can't be statically traced. MEDIUM: multiple consecutive `SORT` operations on the same page list
(should collapse to one multi-key sort). Nesting >4 levels. Hardcoded literals. `EXIT_MODEL` without
all outputs populated. LOW: same governance items as Activity.

*Any other rule type* — no dedicated checklist exists (matches `registry.py`'s own `_default`
fallback, which is honest about this rather than pretending equal depth). Perform a governance/
structural review instead: rule status/availability/access group, checkout/branch/clone-lineage
governance, empty privilege list on an externally-callable rule, blank description on an API-facing
rule. State explicitly in the report that step-level analysis for this rule type uses generic
heuristics, not a dedicated checklist — cross-check `get-skill("rules-rule-<type>")` from the plugin's
own runtime skill registry for anything type-specific it documents that this generic pass would miss.

**Step 3b — Schema validation, deterministic, no judgment involved.** The authoring plugin ships 34
JSON schemas — one per rule type — as the declared source of truth for that rule type's payload.
**Confirmed live, 2026-08-18**: `get-skill(name="rules-<rule-type-lowercase-with-hyphens>/schema/
<rule-type-lowercase-with-hyphens>")` — **no `.json` suffix on the skill name**, even though the
underlying content is JSON (e.g. `rules-rule-obj-activity/schema/rule-obj-activity` returns the
schema; the same name with `.json` appended 404s with "Did you mean 'rules-rule-obj-activity'?").
The returned schema is exactly what this step needs: a `required` array, `enum` constraints, and
`x-pega-autoFill` markers on system-derived fields — live-confirmed on `Rule-Obj-Activity`'s schema.
This step is separate from Step 3's
checklist: the checklist finds *logic* defects (self-assignment, stale caches); this step finds
*structural* defects the checklist doesn't cover at all — a field the schema marks required but the
rule omits, an enum value the rule sets that the schema doesn't allow, a conditional-requirement
violation (a field required only in a specific mode/configuration), or a field present that the
schema says is auto-derived and should never be hand-set. Fetch the rule's own content (already
available from Step 2) and the matching schema, and diff structurally:
- **Missing required field** → HIGH (CRITICAL if the missing field is load-bearing for correctness,
  e.g. a required routing/precondition field, not cosmetic metadata).
- **Invalid enum value** → CRITICAL if it would fail to save/execute at all; HIGH if it saves but
  behaves unpredictably.
- **A field present that the schema marks as auto-filled/auto-derived** → MEDIUM (governance/hygiene,
  not a functional defect, unless the hand-set value actually conflicts with what would be derived).
- **Conditional requirement violated** (field required only under a specific mode the rule is
  actually in) → same severity as a missing required field.
If the rule type does not have a schema (not currently possible — all 34 `create-rule`/`update-rule`-
supported types have one; confirm via `methodology-rule-authoring`'s supported-type table), skip this
step and say so explicitly rather than silently omitting it.

**Step 4 — Verdict, computed from Steps 1-3b, not eyeballed.**
- **PASS** — no CRITICAL or HIGH findings.
- **WARN** — one or more HIGH findings, no functional (CRITICAL) defect.
- **FAIL** — one or more CRITICAL findings. **Automatic override to FAIL** if G2 showed multi-app
  blast radius *and* a functional defect exists, regardless of what the defect's own severity would
  otherwise imply — this is the one rule that overrides everything else in this rubric.

**Step 5 — Business impact.** Same fold-in discipline as `pega-impact-analysis`/`pega-log-diagnosis`:
run `pega-feature-node-retrieval` anchored on this rule, fold the Feature's `title`/`business_summary` (or
its absence) into "Enterprise Graph Context," not a new top-level section — the agent's own format has
no slot for it.

**Step 6 — Report, in the exact format `code_review_agent.py` produces:**

```
## Code Review: {rule_name}

### Executive Summary
{2-3 sentences: what this rule does, overall health, single biggest risk}

### Verdict
PASS | WARN | FAIL

### Enterprise Graph Context
{Blast radius: X callers across Y apps, from G2. Caller type risk matrix, from G3. Shadow-override
status, from G1/G4. Stub classification and what it means for review scope. Business
process/Feature-node context from Step 5, folded in here.}

### Findings

#### CRITICAL — Functional Defects
- [Step X] <finding>          (or "None found.")

#### HIGH — Reliability & Security Risks
- [Step X] <finding>          (or "None found.")

#### MEDIUM — Performance & Maintainability
- [Step X or Architecture] <finding>   (or "None found.")

#### LOW — Governance & Style
<finding>                     (or "None found.")

### Top 3 Actions
1. (most critical fix — exact step, property path, what to change it to)
2. (second)
3. (third)
```

Language rules, carried over verbatim: **definitive statements only** — banned words: likely,
probably, might, may, appears to, seems to, could be, possibly, perhaps. **Only report step numbers
from THIS rule's own XML** — a called rule's internal steps are context only; if a called rule has a
defect, report it at the call site step in the rule under review, not inside the called rule. **Don't
list the same finding type more than once** — summarize all affected steps in one finding.

## What NOT to do
- Don't skip G1-G4 or read rule logic before running them — they're mandatory and first, not optional
  context.
- Don't flag `.X = .X` as self-assignment inside `APPEND_AND_MAP_TO`/`UPDATE_PAGE WITH_VALUES_FROM` —
  that's valid cross-page copy, a real finding only applies to self-assignment inside a `FOR_EACH` body
  or a top-level `SET` outside a mapping block.
- Don't downgrade a CRITICAL-plus-multi-app-blast-radius combination to WARN — the auto-FAIL-upgrade
  is not a suggestion, apply it every time G2 shows 2+ apps and a functional defect is present.
- Don't propose logic changes to a rule where G1 showed all rows `is_stub=true` — that's OOTB, review
  governance only.
- Don't conclude "not present"/"no callers" from an empty G1/G2 result without escalating — same
  "empty result needs verification, not acceptance" discipline as the rest of this skill family
  (`pega-live-gap-fill` for missing rules, note-as-unverified for empty blast radius).
- Don't add a new top-level section for business impact — fold it into "Enterprise Graph Context,"
  same discipline as `pega-impact-analysis`'s "Change Requirements" and `pega-log-diagnosis`'s "Impact
  Analysis."
- Don't treat the Activity/Data Transform checklists as exhaustive or as the authoring source of
  truth — they're a fixed review lens; cross-check the plugin's own `rules-rule-obj-*` runtime skills
  for anything more current or rule-type-specific they document.
- Don't skip Step 3b because Step 3's checklist already ran — schema validation catches a disjoint
  class of defects (structural payload correctness) that the logic checklist was never designed to
  find, and vice versa. Run both.
- Don't flag a schema-marked auto-derived field as a defect just because it's present — only flag it
  if the hand-set value actually conflicts with what would be derived, per Step 3b.
