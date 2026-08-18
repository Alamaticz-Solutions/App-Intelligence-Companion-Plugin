---
name: pega-feature-node-retrieval
description: "Answers business/functional questions about a PDS Pega case type, queue processor, or job scheduler by retrieving its :Feature node from Neo4j efficiently and correctly — existence check first, token-cheap targeted reads, environment-filter landmine avoided, provenance-aware confidence, full-path tracing for debugging. Falls back to rule-level search when no Feature node exists. Works for any app/root/coverage level, current or future — nothing below is a fixed fact, everything is a re-derivable check."
---

<!-- Skill version: 2.0.0 | 2026-08-13 -->

# Using Feature nodes efficiently

## Trigger phrases
"how does X work", "explain the Y process/flow", "what validations/SLA/access control does Z have",
"what rules does W touch", "walk me through the <case type / queue processor> business logic",
"is <case type> ready for..." (business-facing, not code-facing), plus any debugging/impact-analysis
question scoped to a specific feature ("trace where X is set," "what would changing Y affect").

If the question is about one specific rule's own logic (not a whole process), skip this skill —
go straight to `search_rules` / `get_rule_summaries`.

This skill is specific to the PDS graph (Neo4j via the PDS MCP tools, `pds_graph/tools/
build_feature_node.py` in the `PDS All Application Graphs` repo) — it's installed at the
user level so it's available from any session on this machine, but the tools and file paths it
references (`.claude/CLAUDE.md`, `python -m pds_graph.tools.build_feature_node`) only resolve when
you're actually working against that repo/graph.

## Nothing here is a fixed fact — this section is a set of checks, not a snapshot

This skill was written against one point-in-time state of the graph (2026-08-13, 3 Feature nodes,
all in OWLM). **That state will change** — more Feature nodes get built, more rule summaries get
cached, more apps may get indexed. Every numeric claim, environment value, and coverage statement
below is a **worked example of how to run the check**, not a fact to carry forward unchecked. Run
the check every time; don't recall the answer from a prior session.

**0a. Discover current Feature node coverage** (cheap, ~0 tokens, always run this first — never
assume from memory how many nodes exist or which apps have them):
```cypher
MATCH (f:Feature) RETURN f.environment AS env, f.root_type, f.root_identifier, f.title, f.generated_at ORDER BY env
```
Whatever this returns *is* the current coverage. If the target root isn't in the results, that's
your answer to "does a Feature node exist" — no node is the normal case for most roots, not a
bug to work around.

**0b. Discover the real `environment` values before filtering anything.** The `environment`
parameter on `search_features`/`search_rules` filters correctly when it exactly matches a value
that actually exists on a node — but silently **no-ops to unfiltered, cross-environment results**
when it matches nothing (verified pattern: passing a value with zero real matches returned
results from a different app entirely, rather than erroring or returning empty). The tool's own
docstring enum is not reliable — it has been found wrong for most apps against real data (e.g.
`odpipeline` documented vs. `ODPipeline` actually stored; short forms like `Denovo`/`OARC`/`HRLife`
documented vs. longer real values actually stored). Don't trust the docstring or a table from a
prior session — pull the live values:
```cypher
MATCH (r:Rule) RETURN DISTINCT r.environment AS env, count(r) AS n ORDER BY env
```
Use exactly what this returns. If an app the user names isn't in the list, say so — don't guess a
spelling and silently get cross-app leakage. **Then still inspect the `environment` field on every
row a search tool returns**, regardless of which value you passed — the parameter is a hint, not a
guarantee, even when you passed a value confirmed to exist.

**0c. `neo4j_query` enforces its own filter differently and harder**: it does a literal string
check for `WHERE x.environment = '<Env>'` in your Cypher text before running anything, and errors
if that clause isn't present verbatim. Always write it explicitly, using a value confirmed by 0b.

## Structural facts about the data model (these don't change with coverage growth)

**Structured JSON fields on the Feature node are authoritative over its own prose.** The synthesis
model sometimes over-reports gaps in its own `## N. Known gaps` prose section relative to what
`technical_summary.gaps`/`rule_provenance` actually record (verified once: a rule marked resolved
in `rule_provenance` was still listed as an open gap in the prose). The structured fields are
code-parsed from the traversal, the prose is model-written — when they disagree, trust the
structured field.

**`technical_summary.rule_inventory[0]` can be a parsing artifact**, not real data — the model
sometimes emits the literal markdown table header as if it were a data row. Sanity-check index 0
before using it; drop it if it's clearly the header (`rule`/`type`/`role` as literal values).

**Section embeddings exist but nothing in this toolset can query them.** Every node also stores
`embedding_section_*` properties, but a cosine-similarity Cypher query needs a query vector, and no
MCP tool here computes one. Don't attempt the vector path. Instead, jump to a section by matching
its `## N. Heading` text inside `f.summary` (see Step 3).

**Similarity scores on this corpus run lower than the tool's documented bands.** Don't assume the
tool docstring's ≥0.82 "HIGH" / 0.65–0.82 "MEDIUM" thresholds hold as literal cutoffs — a genuinely
correct top match has been observed scoring ~0.69–0.75. When the candidate pool for a root type is
small (often true — most apps have few or zero Feature nodes per 0a), the top-ranked result is
usually right even at a "MEDIUM" score; don't discount it on score alone. Recalibrate per query by
checking whether the top result's title/description plausibly matches the question, not by the
score in isolation.

## Procedure

**1. Existence check** — this is 0a. Two different situations, don't collapse them:
- **The question names a specific root** ("the Service Request case type," "the migration queue
  processor") → 0a tells you directly whether that root has a node. No match → say so, go to the
  no-coverage fallback below.
- **The question is natural-language and doesn't name a root** ("edit staff details," "how does
  the bug report get to sales") → 0a's result list is a set of *candidates* to check, not an
  answer in itself. **Do not conclude "no Feature node covers this" from 0a alone** — a root's
  `title` can be generic or business-branded (e.g. a case type internally about staff/location
  edits titled "Bulk Edits") and won't obviously match your question's wording by eye. Step 2 is
  mandatory here, on every candidate 0a returned, before ruling any of them out — this is not
  optional triage, it's the step that failure mode above is entirely made of.

**No node relevant after step 2 actually ran** → say so plainly, then fall back to `search_rules` +
`neo4j_query` closure traversal to answer instead. Building a new Feature node costs real
OpenAI-call money and writes to a graph with a finite relationship-cap headroom (check current
usage before assuming it's fine) — surface it as a decision for the user to make, never build one
yourself to answer a question. If the process still needs describing right now, `pega-live-gap-fill`
can reconstruct enough live business context from the authoring plugin (case types, live examples) —
label it explicitly as live-reconstructed, not Feature-node-grounded, per that skill's own discipline.

**2. Triage before reading anything large.** `search_features(query, environment=<value confirmed
in 0b>, k=1)` returns a `description` (2–4 sentences) alongside the full `summary` — read the
description first to confirm this is the right root before paying for the full document. See the
scoring note above before discarding a result on score alone.

**3. Read only what the question needs.** Feature node documents run large (tens of thousands of
characters for a nontrivial closure) and can exceed a single tool call's output budget at even
`k=3` — request the minimum:
- Structural facts (access control, queue concurrency/retry, gaps, rule roles) → pull the specific
  property via `neo4j_query`: `f.technical_summary`, `f.entry_points`, `f.related_case_types`,
  `f.source_rule_fingerprint`. These are JSON strings — parse, don't regex.
- Narrative for one part of the process → find the relevant `## N.` heading in `f.summary` by
  name, then read around it rather than the whole field.
- Whole-process walkthrough → `f.summary` in full is justified; prefer `f.business_summary` if a
  shorter variant answers the question.
- **If the question is answered directly and completely by the prose itself, stop here.**

**4. For anything beyond what the prose directly answers — debugging, "which rule actually does
X," impact analysis — never land on one rule and stop, however that rule was found.** A single
semantic-search hit and a single deterministic `pzinskey` lookup share the same failure mode: both
return one rule in isolation with no confirmation it's the instance actually wired into *this*
feature's live path. A same-concept rule from an unrelated app or case type (e.g. a different
feature's own similarly-named config/email/validation rule) can look right by name or summary
alone. `technical_summary.rule_inventory` and `source_rule_fingerprint` are a **checklist of what's
in scope for this root's closure, not a shortcut to the answer** — they confirm a rule belongs
here, not how it connects to what you're asking about.

Instead: **trace the connecting path between the root's `root_pzinskey` (the "hero" rule) and the
target area along `:REFERENCES`**, via `neo4j_query` (bounded hops, filtered to logic-bearing rule
types — Flow, FlowAction, Validate, When, View, Model, Activity, Declare-Pages, Report-Definition,
DecisionTable, Corr, same set `build_feature_node.py` uses), and read every rule on that path —
cached summary via `get_rule_summaries`, or live XML via `pega_get_rule_xml` for anything
load-bearing — before answering. This confirms "this is the rule *this* feature calls," not just
"a rule that matches the concept." Treat this as the default depth for any question that isn't
fully answered by step 3's prose, not a fallback for edge cases — it matters more, not less, as
more Feature nodes and rule summaries exist to produce a plausible-looking wrong answer from.

**`search_rules` (semantic search over rule summaries) has exactly two legitimate uses here — never
as a standalone answer source:**
- **No Feature node exists at all (step 1's fallback).** There's no root/closure to anchor a trace,
  so this is the honest starting point: `search_rules(query, environment=<confirmed via 0b>)`,
  then `neo4j_query` from whatever it surfaces to build a closure by hand (walk `:REFERENCES`
  outward, same rule-type filter as above) before treating any single hit as the answer — same
  discipline as path-tracing, just without a pre-built root to start from.
- **A Feature node exists, but the target isn't an obvious name in `rule_inventory`** (a "fuzzy"
  target — "where's the discount logic" with no rule literally named that). Run `search_rules`
  unscoped by root (it has no closure-scoping parameter), then **keep only hits whose `pzinskey`
  appears in this root's `source_rule_fingerprint`** — that's what actually scopes an unscoped
  semantic search to "belongs to this feature," rather than trusting the query text alone to stay
  on-topic. A hit outside the fingerprint is a same-concept rule from somewhere else in the graph,
  not part of this closure — don't use it, even if it looks like a great match.

In both cases, the same score-calibration note applies (see above): judge a result by whether its
summary plausibly matches, not by the raw score.

**5. Confidence follows provenance, not confidence follows prose.** For any fact feeding a
decision or deliverable (not just idle Q&A), check that fact's rule in
`technical_summary.rule_provenance`:
- `"verified_xml"` → state it plainly, it was read live at build time.
- `"dynamo_cache"` → fine for most answers, but if the question is high-stakes or the rule looks
  load-bearing for the answer, escalate with `pega_get_rule_xml` before asserting it as fact —
  this is the same discipline as `[[feedback-verify-against-live-data]]`.
- Listed only in `technical_summary.gaps` → say explicitly "not covered by this Feature node,"
  don't guess from the rule name.

**6. Staleness — check before trusting an old node for anything that matters.** Compare
`f.generated_at` against how long ago that was; if it's old relative to how fast that app's rules
change, or the question matters, re-run `python -m pds_graph.tools.build_feature_node ...
--check-staleness` (free, read-only, compares `source_rule_fingerprint` against live `updated_at`)
rather than assuming the node still reflects current rules.

**7. Related-roots caveat.** `f.related_case_types` splits into genuine shared dependencies (same
class) and name-only collisions (different class — two unrelated rules that happen to share a
name). Never merge a collision's facts into the root you're answering about.

**8. Ruleset-stack caveat — sharpest exactly where path-tracing (step 4) matters most.** If the
path you're walking depends on which specific rule instance is live (a `:REFERENCES` target with
multiple same-name/class instances across environments — the same failure mode step 4 guards
against, at the graph-edge level instead of the search level), don't trust the graph edge alone —
cross-check against `pega_fetch_entire_ruleset_stack` for the target app. See `.claude/CLAUDE.md`
"Known graph gaps."

## What NOT to do
- **Don't rule out Feature node coverage from 0a's list alone when the question doesn't name a
  root.** Observed failure: asked "what fields are available to edit staff details," 0a returned 3
  nodes including one titled "Bulk Edits" — dismissed as unrelated by title, when its own
  `description` explicitly named staff/location edits as its core scope and `rule_inventory`
  listed the exact `UpdateStaffInformation` flow action. The agent then fell back into an unrelated
  app and answered from one unverified rule there instead. Titles can be business-branded and
  won't obviously match the question — check `description`/`rule_inventory` (step 2) before
  concluding "no coverage," every time the root wasn't named explicitly.
- Don't dump a full `f.summary` into context "just in case" — pull the narrow field/section the
  question needs.
- Don't reuse an `environment` value, coverage count, or score threshold from a past session
  without re-running the 0a/0b checks — this graph is actively being built out.
- Don't pass the tool docstring's `environment` enum values verbatim — verify against 0b, and still
  check each result row's own `environment` field.
- Don't treat `## N. Known gaps` prose as the complete gap list — `technical_summary.gaps` is.
- Don't build a new Feature node to answer a question — surface the option and cost, let the user
  decide.
- **Don't answer a debugging/detail question from one rule, however it was found** — a single
  semantic-search hit or a single `pzinskey` lookup off `rule_inventory`/`source_rule_fingerprint`
  both lack the surrounding context that confirms the rule is actually wired into this feature's
  live path. Trace the connecting path from `root_pzinskey` instead (step 4).
