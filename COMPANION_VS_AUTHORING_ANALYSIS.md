# Companion ↔ Rule Authoring: Reverse-Engineering Analysis, Duplication Audit & Restructure Plan

**Date:** 2026-08-18
**Subjects:** `pega-infinity-authoring@Pega` v0.0.4 (Pegasystems) vs `app-intelligence-companion` v0.1.0 (Alamaticz)
**Method:** Static reverse-engineering of the shipped plugin — `infinity-rules-mcp.jar` bytecode string extraction, `application.yml`, `manifest.json` (820 entries), `skills-graph.json` (786 nodes / 306 edges), full read of the overlap-candidate skills — plus **live confirmation** against the running MCP server's own log (`logs/infinity-rules-mcp.log`), a live `search-skills` call, and a live `neo4j_query`. No assumptions inherited from prior build notes; every claim below is from a file read or a call made in this session.

---

## 0. Answers up front

| Your question | Answer |
|---|---|
| Am I duplicating the rule-authoring plugin's skills? | **No — one partial exception.** 9 of 11 Companion skills have no counterpart. `pega-doc-generator` partially overlaps `methodology-explain-application`. Three suspected duplicates (`methodology-application-security`, `prove-pr-change-with-evals`, `methodology-blueprint-delivered`) were read in full and **cleared** — different audiences and different jobs. |
| Do we have redundant MCP tools? | **Yes — 6 of PDS's 15 tools duplicate authoring tools**, but only *within the one Pega instance the authoring plugin is authenticated against*. Outside it, PDS is the only path. The fix is scoping, not deletion. |
| Can we have a skill layer like theirs? | **Yes — fully proven end to end, not just theorised.** The running server logs `skills.custom-paths = <not set>` at every startup, and a standalone test run with the variable set produced `Loaded 821 effective skills from 2 source(s)` — the extension point works exactly as designed, including comma-separated multi-path lists. It is currently wired to nothing. Details and caveats in §2. |
| What else can be done? | 7 ranked enhancements in §6. The top three: inject Impact Analysis into the ChangeRequest Review gate, make code review schema-backed against their 34 JSON schemas, and exploit PDS's cross-environment reach — which nothing currently does. |

**The single most important number in this document:** Companion spends **~1,660 tokens of always-on context** on 11 skill descriptions. The authoring plugin spends **~109 tokens** to gate **820**. That is 15× the standing cost for 4.5% of the catalogue. See §5.

---

## 1. Reverse-engineering the rule-authoring plugin

### 1.1 It is a two-layer system, and only the thin layer is ever in context

```
LAYER 1 — Claude-visible, always loaded          LAYER 2 — MCP-served, on demand
┌──────────────────────────────────────┐        ┌────────────────────────────────────────┐
│ claude-skills/                       │        │ resources/pega-skills/                 │
│   pega-assistant/SKILL.md   (214ch)  │ ─────► │   manifest.json      820 entries       │
│   pega-setup/SKILL.md       (198ch)  │  list- │   graphs/skills-graph.json  786 nodes  │
│                                      │  skills│   skills/    50 dirs, ~500 example .md │
│ TOTAL ALWAYS-ON: 436 chars ≈ 109 tok │  get-  │   library/   11 std-library references │
└──────────────────────────────────────┘  skill └────────────────────────────────────────┘
```

`pega-assistant/SKILL.md` is **20 lines**. Its entire content is a dispatch contract:

1. Call `list-skills` before answering Pega questions.
2. Load with `get-skill` — never rely on memory.
3. Confirm application context early.
4. All writes go through a ChangeRequest.
5. Never write to base ruleset; never auto-approve.

That is the whole always-on footprint. Everything else is retrieved on demand.

### 1.2 Retrieval is graph-ranked, not keyword-matched

The `search-skills` tool description states the algorithm outright: **graph-based Personalized PageRank**. It resolves seed nodes from the query, expands over `skills-graph.json` (306 edges, each carrying `relation: SIMILAR:n_concepts`, `confidence`, `weight`, `confidence_score`), and returns ranked skills. Bytecode log strings confirm the fallback: `"search-skills: graph not loaded, falling back to manifest-only lexical search"`.

A live call (query: *"impact analysis blast radius of a rule change before promotion"*) returns a **Skill Bundle** with structure worth copying exactly:

- Results **grouped by category** — `[Cross-cutting Skills]`, `[Rule Skills]`, `[Reference Tables]`, `[Related Artifacts]`.
- **Per-result provenance** — `Found via: related to methodology-change-request-workflow` vs `Found via: lexical match`. The PageRank expansion is made visible to the agent, so it can tell a direct hit from a graph-adjacent one.
- **Dependency edges rendered inline** — `Requires: methodology-rule-authoring` and `See also: …`. The agent gets the prerequisite chain without a second call.
- Closes with `Use get-skill to load full content for any skill from this list.`

`list-skills` additionally exposes `parent` and `groupByParent` — meaning **`examples/` and `references/` files are first-class child artifacts of a parent skill**, individually addressable. That is the mechanism that keeps a 90-file skill from ever loading as one block. It is the direct fix for Companion's load-granularity problem (§5).

**This is what "built beautifully" means concretely: they built a knowledge graph over their own skills, and they expose its edges to the agent.** Note the irony — Companion's entire value proposition is a knowledge graph over Pega rules, and it does not apply that pattern to itself.

**One live result matters more than the rest.** That query — the plainest possible phrasing of impact analysis — returned `methodology-change-request-workflow`, `prove-pr-change-with-evals`, `methodology-rule-authoring`, and a spread of rule-type skills. **Nothing about dependency analysis, blast radius, or what a change might break.** This is direct empirical proof of the gap §6.1 proposes to fill, and proof that a Companion `impact-analysis` skill in a shared catalogue would rank into exactly this query.

### 1.3 Content is layered inside each skill, too

```
skills/rules-rule-obj-activity/
  SKILL.md            ← thin: authoring notes + index tables pointing outward
  schema/*.json       ← SOURCE OF TRUTH for the payload (34 schemas plugin-wide)
  examples/           ← ~90 files: whole rules + per-method step shapes (pySteps/*)
  references/         ← method-catalog, preconditions, transitions, step-looping
```

Three load-bearing conventions:

- **Schema-as-truth.** `methodology-rule-authoring` states it explicitly: *"When the example and schema appear to disagree, trust the schema."*
- **Example-first authoring.** "Find the closest example and use it as-is" — including a `stub.md` minimal-valid-payload per rule type.
- **Declared prerequisites.** Rule-type skills open with `**Prerequisite:** Load methodology-rule-authoring first` — a dependency chain, not a flat list.

### 1.4 Taxonomy

| Prefix | Count | Purpose |
|---|---|---|
| `rules-*` | 34 | One per Pega rule type. Schema-backed. Authoring payload shapes. |
| `methodology-*` | 14 | Procedure/workflow (change-request-workflow, explore-case-type, integration…). |
| `library-*` | 2 + 11 refs | Expression/function reference material. |

---

## 2. The extension point — the headline finding

### 2.1 What the bytecode says

`BOOT-INF/classes/application.yml`:

```yaml
pega:
  skills:
    path:         ${PEGA_SKILLS_PATH:}
    custom-paths: ${PEGA_CUSTOM_SKILLS_PATHS:}
```

`PegaProperties$Skills` is a record of `(path, customPaths)`. `SkillLoader` merges the sources and tracks provenance via `SkillLoader$SkillSource`, a record of `(label, root, custom)`.

**The running server confirms all of this.** From `logs/infinity-rules-mcp.log`, at every single startup:

```
com.pega.mcp.tools.SkillLoader - Loaded 820 effective skills from 1 source(s)
    using duplicate policy BASE_WINS (overrides=0, ignored=0)
com.pega.mcp.tools.SkillTools  - Loaded 820 skills from config
    (pega.skills.path=.../resources/pega-skills), duplicate-policy=BASE_WINS source
c.pega.mcp.config.PegaConfigLogger -   skills.custom-paths     = <not set>
```

Three facts fall directly out of those lines:

1. `skills.custom-paths` is a **real, actively-read, explicitly-logged** configuration property. It is not vestigial. It is simply unset.
2. Skill loading is **already multi-source** (`from 1 source(s)`) with live override accounting (`overrides=0, ignored=0`). Adding a second source is the designed path, not a hack.
3. **The default duplicate policy is `BASE_WINS`, not `reject`** — correcting the inference I drew from the bytecode error strings alone.

Collisions are governed by `SkillLoader$DuplicatePolicy`, whose parse error names the full enum (`Expected one of: reject, custom-wins, base-wins.`). `BASE_WINS` being the default has an important consequence for you, covered in §2.3(d).

`CustomSkillFilesystemLoader` loads **manifestless** packs — it scans for `<skill-dir>/SKILL.md`, parses YAML frontmatter, and enforces (per its own error strings, corroborated by `SkillValidator`):

- must start with YAML frontmatter, with a closing delimiter
- non-blank `name` and non-blank `description`
- **frontmatter `name` must equal the directory-derived skill name**

### 2.2 What this means for you

**Companion's skills can be served through the authoring plugin's own `list-skills` / `search-skills` / `get-skill`.** They would appear in the same ranked catalogue the authoring agent already consults — not as a parallel system the agent has to be told to check separately. That is the cheapest possible route to "our skill like the rule authoring skill."

Cross-check performed: all 11 Companion skill directories already have frontmatter `name` matching the directory name. The pack is *nearly* valid as-is.

### 2.3 Four caveats, all confirmed, all actionable

**(a) The shipped `.mcp.json` wires the wrong variable name — confirmed live.** It passes:

```json
"PEGA_LOCAL_SKILLS_PATH": "${PEGA_LOCAL_SKILLS_PATH}"
```

`PEGA_LOCAL_SKILLS_PATH` appears **nowhere** in `application.yml`, in any extracted class, or in the server's own startup config dump. The live variable is `PEGA_CUSTOM_SKILLS_PATHS`, and **this is now proven, not inferred** — see the live test below.

**LIVE TEST, 2026-08-18 — extension point confirmed working end to end.** Ran `infinity-rules-mcp.jar --spring.profiles.active=stdio` directly (bypassing the plugin's own `.mcp.json`, so the wrong-variable-name bug above couldn't mask the result) with `PEGA_CUSTOM_SKILLS_PATHS` pointed at a throwaway probe skill. The resulting log:

```
SkillLoader - Loading skills from filesystem: C:\temp\skilltest
SkillLoader - No manifest found in C:\temp\skilltest; discovering skills from filesystem conventions
SkillLoader - Loaded 821 effective skills from 2 source(s) using duplicate policy BASE_WINS (overrides=0, ignored=0)
SkillTools  - Skills graph loaded: 786 nodes, 306 edges — search-skills available
PegaConfigLogger -   skills.custom-paths     = C:/temp/skilltest
```

821 = 820 base + 1 probe skill. **Green.** A follow-up run with three comma-separated paths (`C:\temp\skilltest,C:\temp\skilltest2,C:\temp\skilltest3`) loaded cleanly as `4 source(s)`, 824 effective skills — **comma-separated `custom-paths` is confirmed supported**, resolving the one open question from the first pass.

One nuance from that log worth flagging for Phase 2: `Skills graph loaded: 786 nodes, 306 edges` is unchanged by the custom source — the PageRank graph is read only from the base `skills.path`, not from `custom-paths`. A shipped Companion `skills-graph.json` will not merge into their ranking graph. Companion skills will be **discoverable** via `list-skills`/`get-skill` and via `search-skills`'s lexical fallback, but will not get the `Found via: related to X` / `Requires:` / `See also:` treatment §1.2 showed for bundled skills, unless Pegasystems adds a custom-graph-path property later. Not a blocker — it just means a Companion skill's own `description` has to work harder for lexical matching, since it won't get a PageRank boost.

**(b) You cannot set this variable from inside Companion.** It is an environment variable on *the authoring plugin's* MCP subprocess. Companion has no ability to inject env into another plugin's server. Options, in order of preference:

1. Set `PEGA_CUSTOM_SKILLS_PATHS` as a machine/user-level environment variable before Claude Code launches. The live test above used exactly this mechanism.
2. Ask Pegasystems to correct the `.mcp.json` variable name. It is a one-word fix and it makes their own extension point usable without a manual workaround.
3. Document it as a setup step in `PEGA_CLAUDE_CODE_SETUP.md` in the meantime.

**(c) A manifest is recommended, not mandatory — corrected after live testing.** The original bytecode-only read of `CustomSkillFilesystemLoader`'s error strings suggested any directory with more than one `.md` file would trip a "manifestless primary skill inferred from multiple markdown files" collision. **Live-tested and refuted**: a probe directory containing both `SKILL.md` (name: `probe-multi`) and a sibling `other.md` (name: `probe-multi-other`) loaded **both** as independent skills with no error — the loader evidently disambiguates on the `SKILL.md` filename itself, not on file count. The stricter error path exists in the bytecode for a narrower case not exercised by this layout (most likely: two files that are *both* plausible primaries, e.g. neither named `SKILL.md`).

This is moot for Companion regardless: checked every one of the 11 skill directories, and **none has a second `.md` file directly beside its `SKILL.md`** — `pega-flowaction-migration`'s 13 references and 3 examples, and `pega-doc-generator`'s `query-patterns.md`, all live inside `references/`/`examples/` subdirectories, never as siblings of `SKILL.md`. Manifestless loading will work for the pack as it exists today. Still recommend shipping `manifest.json` anyway — it's what unlocks per-skill `category`, richer `description` handling, and eventually a merged graph if Pegasystems adds that — but it is no longer a blocking requirement.

**(d) Default collision policy is `BASE_WINS` — confirmed live — a colliding Companion skill is silently discarded.** Both live runs logged `duplicate policy BASE_WINS (overrides=0, ignored=0)`. With `BASE_WINS`, a name collision means your skill is quietly dropped (`ignored` increments) and Pega's version wins, with no error surfaced anywhere.

Companion's 11 names do not collide with the current 50. But `methodology-impact-analysis` or `methodology-code-review` are entirely plausible future Pega additions, and if either lands, your skill vanishes without a message. **Namespace the whole pack (`companion-*`) — this caveat upgrades that from tidiness to a correctness requirement.** Also monitor the `ignored=` counter in the startup log; it is your only collision signal.

---

## 3. Duplication audit — Companion's 11 skills vs the authoring plugin's 50

| Companion skill | Nearest authoring skill | Verdict |
|---|---|---|
| `neo4j-cypher-querying` | *(none)* | **Unique.** No graph capability exists anywhere in the authoring plugin. |
| `feature-node-retrieval` | `methodology-explore-case-type` | **Adjacent, orthogonal.** Theirs drills live rule-by-rule to find *what needs work*, stopping at the first actionable issue. Yours answers *how the business process works* from a precomputed `:Feature` node. Different question, different cost profile. Should cross-reference each other; neither should be deleted. |
| `pega-log-diagnosis` | *(none)* | **Unique.** OpenSearch + graph correlation has no counterpart. |
| `pega-impact-analysis` | *(none)* | **Unique — and it is their single biggest blind spot.** See §6.1. |
| `pega-code-review` | `methodology-application-security`; `prove-pr-change-with-evals` | **Both cleared on full read.** `application-security` performs OWASP ASVS / Top-10 / CVSS scans against a *deployed web app or API* and emits an HTML report — not rule review. `prove-pr-change-with-evals` builds eval scenarios for changes to the `infinity-skills` / `infinity-rules-mcp` **repos** — audience is plugin developers, not application teams. Your build-context claim about this one was correct; it is now verified rather than inherited. |
| `pega-doc-generator` | `methodology-explain-application`; `methodology-blueprint-delivered` | **The one real partial overlap.** See §3.1. |
| `pega-flowaction-migration` | `rules-rule-obj-flowaction` + `methodology-rule-authoring` | **No overlap.** Yours ends at a Work-Item Manifest; theirs starts at a payload. The seam is already clean. |
| `pega-companion-seam` | `methodology-change-request-workflow` | **Wraps, does not duplicate** — with one gap. See §3.2. |
| `pega-live-gap-fill` | *(consumes authoring tools)* | **Unique by construction.** |
| `pds-pega-data-access` | *(routing policy)* | **Unique** — but asserts a backend state that isn't true yet. See §4.4. |
| `pega-app-knowledge` | *(none)* | **Unique.** |

**Bottom line: you are not duplicating their skills.** The redundancy in this system is in the MCP tool surface, not the skill layer.

### 3.1 `pega-doc-generator` — the one overlap, and why to exploit rather than delete it

`methodology-explain-application` answers application-overview questions from **exactly one `get-application` call** — app label/description, case types, full stage/process/step lifecycle structures, data objects with fields, personas. Its own call discipline says *"Don't begin with many rule-level calls… If payload contains the answer, stop tool-calling."*

Your doc-generator reconstructs much of that from graph traversal. For the overview sections, their path is cheaper, live, and structurally authoritative.

`methodology-blueprint-delivered` is **not** a doc generator — it is the Blueprint Delivered delivery methodology (Blueprinting → Authoring → Value Activation, plus the "golden thread" fidelity principle). But it defines the artifact your **"Pega Blueprint Spec"** output is implicitly targeting.

**Recommendation:** don't cut doc-generator. Restructure it to *compose*:

- Overview / case types / data model / personas → delegate to `get-application` (their path).
- Rule-level implementation, dependency closure, cross-rule tracing, dead-rule detection → graph (your path — they cannot do this).
- Blueprint Spec output → conform to `methodology-blueprint-delivered`'s structure so the spec is actually import-shaped.

Net effect: the document gets more accurate *and* cheaper, and stops re-deriving what one API call returns.

### 3.2 A gap in `pega-companion-seam` worth fixing now

`methodology-change-request-workflow` has a **Pre-flight Step** the seam skill does not account for: before creating the ChangeRequest, the agent calls `list-available-authoring-workflows`, and if a deterministic authoring workflow matches the intent (and the request stays inside that workflow's stated `Limitation:`), it uses `create-case` with the matched `caseTypeID` and works through workflow screens — **bypassing the rule-type-skills path entirely**.

The seam's Review-stage report injection must therefore hook the *ChangeRequest case*, not the skills-path authoring flow — otherwise it silently no-ops on every deterministic-workflow change.

Also confirmed in their doc, and useful to the seam: from `Open-Review`, submitting `pyReviewAndApprove` with `pyApprovalDecision: "Keep working"` loops the case back to `Open-Authoring` while preserving the branch and authored rules. That is the seam's re-entry path when an Impact Analysis surfaces a problem at review time.

---

## 4. MCP tool redundancy — three buckets, not two

### 4.1 Bucket 1 — genuinely unique to PDS (the moat; keep unconditionally)

`neo4j_query` · `get_schema` · `opensearch_list_indices` · `opensearch_get_index_mapping` · `opensearch_search_index` · `pega_log_analyzer` · `search_features` · `get_rule_summaries` · `pega_get_all_content`

Nothing in the authoring plugin comes close. This is the entire reason Companion exists.

### 4.2 Bucket 2 — genuinely duplicated *within the authoring plugin's own instance*

| PDS tool | Authoring equivalent | Which wins, and why |
|---|---|---|
| `search_rules` | `search-rules`, `list-rules` | **Authoring** — live, app-scoped (`applicationNames`), ruleset-resolved |
| `pega_get_rule_xml`, `pega_get_rule_version` | `get-rule` (`detail="full"`) | **Authoring** for current truth; **PDS** for *history* and for rules the graph missed |
| `get_data_page` | `run-data-page` + `get-data-view-metadata` | **Authoring** — metadata discovery, live auth |
| `pega_get_cases` | `list-cases`, `get-case-details`, `get-case-assignments`, `get-assignment` | **Authoring** — richer, assignment-aware |
| `pega_fetch_entire_ruleset_stack` | `get-application` | **Authoring** for the current app; **PDS** when you need the stack without switching context |
| `pega_list_branches`, `pega_get_branch_rules` | *(no clean equivalent)* | **PDS** — closest authoring path is `list-rules` with branch scoping. Weakest duplication claim of the six. |

### 4.3 Bucket 3 — *looks* duplicated, is not

PDS MCP's `config.py` carries `PEGA_CONFIGS` / `NEO4J_CONFIGS` / `DYNAMO_CONFIGS` across multiple environments — **10 are present in the graph right now, holding ~47,632 rules** (verified live, §6.5). The authoring plugin holds **one** OAuth session against **one** Pega instance (which hosts 12 switchable applications — but one instance).

**PDS's Pega-live tools are the only path to any environment the authoring plugin isn't pointed at.** Deleting them would remove a capability, not a redundancy.

### 4.4 Resolving your open build-context item #3

Your `pds-pega-data-access` skill asserts *"PDS MCP no longer maintains its own Pega credentials"* — but `config.py` still does. The skill states a policy the backend has not implemented. Don't resolve this by picking one side globally. The correct rule is tri-state:

> **1.** Inside the authoring plugin's configured instance → **authoring tools are authoritative.** OAuth'd, live, ruleset-resolved, governed.
> **2.** Outside that instance (other environments) → **PDS is the only path.** Keep `PEGA_CONFIGS`.
> **3.** Structure, history, dependency closure, logs, rule summaries → **PDS is authoritative regardless of instance.** No authoring equivalent exists.

And one permanent exception that is not duplication at any scope: `get-rule-resolve-handle` performs **runtime circumstance resolution with real case context**. The graph's `pds_rule_highest_resolved` is precomputed rule-priority data — it can enumerate every candidate and the priority order, but only live Pega can say which one actually fires for a given case. That is a category difference, not a freshness gap.

`pds-pega-data-access` currently documents only case 1. Add cases 2 and 3.

---

## 5. The context-cost argument, quantified

| | Companion | Authoring |
|---|---|---|
| Always-on skills | 11 | 2 |
| Always-on description bytes | **6,633 chars ≈ 1,660 tokens** | **436 chars ≈ 109 tokens** |
| Catalogue reachable behind them | 11 | **50 skills / 820 addressable artifacts** |
| Marginal cost of one new skill | permanent context tax, every session | free |

*(The 820 figure counts child artifacts — examples, references, schemas — not peer-level skills, so don't read it as "820 vs 11." The honest comparison is the first two rows: **11 always-on descriptions vs 2**, and 1,660 standing tokens vs 109.)*

Per-skill breakdown of Companion's standing cost:

| Skill | desc chars | SKILL.md lines |
|---|---:|---:|
| `pega-doc-generator` | 839 | 400 |
| `pds-pega-data-access` | 766 | 114 |
| `pega-companion-seam` | 638 | 108 |
| `neo4j-cypher-querying` | 612 | 603 |
| `pega-live-gap-fill` | 577 | 99 |
| `pega-impact-analysis` | 530 | 210 |
| `feature-node-retrieval` | 509 | 214 |
| `pega-code-review` | 505 | 237 |
| `pega-app-knowledge` | 501 | 131 |
| `pega-log-diagnosis` | 493 | 392 |
| `pega-flowaction-migration` | 448 | 486 |
| **Total** | **6,633** | **2,994** |

Two distinct problems are visible here:

1. **Standing cost.** 1,660 tokens are spent in every session — including sessions with no Pega work at all.
2. **Load granularity.** When a skill *does* trigger, the whole body loads. `neo4j-cypher-querying` is 603 lines, of which a given task needs one recipe. The authoring plugin solved this by splitting bodies into `references/` and `examples/` that load individually.

Several descriptions are doing catalogue work in the always-on slot. `pds-pega-data-access`'s 766-character description enumerates 19 tool names — that content belongs in a searchable catalogue entry, not in every session's preamble.

---

## 6. Enhancements — ranked by value

### 6.1 Inject Impact Analysis into the ChangeRequest Review gate ★ highest value

Their `methodology-change-request-workflow` gives a mandatory human approval gate — but **the human reviews a bare diff with zero dependency visibility**. You have 3-hop blast radius over `REFERENCES` / `SETS` / `OVERRIDES` / `SPECIALIZED_BY`. Make it a hard rule in `pega-companion-seam`: the blast-radius report is written to the case (`pyAuthoringNotes` or as an attachment) **before** `pyReviewAndApprove` is presented — including on the deterministic-workflow path (§3.2). This is the largest single asymmetry between the two plugins.

### 6.2 Make code review schema-backed, not checklist-only

The authoring plugin ships **34 JSON schemas** as declared source of truth for rule payloads. `pega-code-review` is currently checklist-and-judgment. Have it `get-skill` the rule-type schema and validate the authored payload against it: required fields, enum validity, conditional requirements, fields that should have been omitted because they auto-derive. Deterministic defect detection with no judgment involved — pure accuracy gain for near-zero effort.

### 6.3 Ground design in *both* precedents

`pega-designer` grounds authoring in how *this application* solved similar problems (graph precedent). The authoring plugin grounds it in the platform-canonical `examples/` corpus (~500 files). Neither does both. A designer that pulls the closest `examples/` file *and* the closest in-app precedent produces designs that are simultaneously idiomatic and consistent with the codebase they land in.

### 6.4 Semantic dedupe at Intake

Their `search-rules` is literal/keyword. You have `search_features` plus graph adjacency. "Does something that already does this exist?" is a question only Companion can answer — and duplicate-rule sprawl is a real, expensive Pega failure mode. Already in your design; make it a mandatory Intake step rather than an optional one.

### 6.5 Exploit cross-environment reach — currently unclaimed

**Verified live this session** (`MATCH (r:Rule) RETURN r.environment, count(*)`): the graph holds **10 environments, ~47,632 rules**:

| env | rules | | env | rules |
|---|---:|---|---|---:|
| `HRLifeImp` | 15,559 | | `OARCAPP` | 2,586 |
| `ODPipeline` | 15,521 | | `Deal` | 2,532 |
| `DenovoImp` | 4,690 | | `Office` | 1,205 |
| `CCPM` | 2,660 | | `ODH` | 255 |
| `OWLM` | 2,610 | | `CCPMInt` | 14 |

PDS reaches all 10; the authoring plugin reaches 1. **No Companion skill exploits this today.** Unclaimed capabilities with no equivalent anywhere in either plugin:

- "Has this defect already been fixed in another environment?"
- "Does this rule differ between DEV and PROD?" (drift detection)
- "This rule failed in PROD — what does the same rule look like where it works?"

This may be the highest-value *unbuilt* capability in the whole system.

**A live landmine found while verifying this.** PDS MCP's own `neo4j_query` tool description tells the agent the environments are `'odpipeline', 'Tax', 'OWLM', 'Deal', 'Denovo', 'OARC', 'CCPM', 'HRLife'`. Four of those eight values **do not exist in the graph**: the real values are `DenovoImp`, `OARCAPP`, `HRLifeImp`, `ODPipeline` (capital O-D-P), and there is no `Tax` environment at all — while `Office`, `ODH`, and `CCPMInt` are real and go unmentioned. Any agent that trusts the tool description and writes `WHERE r.environment = 'Denovo'` gets **zero rows and no error** — a silent false negative, exactly the failure mode `hooks/scripts/warn-empty-graph-result.js` exists to catch. Fix the tool description in PDS MCP (§7 Phase 4).

### 6.6 Consume PegaUnit results

Their CR workflow auto-triggers PegaUnit on `pyBranchID` when the Authoring stage submits, and returns a **test execution ID**. Nothing consumes it. Companion could correlate failures → graph → root cause automatically, closing the loop between their testing and your diagnosis, and feeding the result straight back into the Review report from §6.1.

### 6.7 Serve `Knowledge/` back to the authoring agent — ✅ DONE, live-tested

`pega-app-knowledge` accumulates per-app naming traps, known defects, and shared-data-model notes in `Knowledge/Application/<App>/`. Previously that only helped when *Companion* was asked. Shipped as a second `custom-paths` entry alongside `claude-skills/` — the **authoring** agent now gets your app-specific traps while it is authoring. This closes the "flaws filled by the other plugin" loop that was previously one-way (Companion enriched authoring only at the seam).

**One real correction found while implementing this, not present in the original plan**: `Knowledge/Application/OWLM/`'s four files are plain topic notes (`app-owlm-known-defects.md`, etc.), none literally named `SKILL.md`. Live-tested (2026-08-18): manifestless discovery **silently drops** any file that isn't under a `SKILL.md`-anchored directory — `Ignoring manifestless markdown 'OWLM/app-owlm-known-defects.md' because it is not under a skill root with SKILL.md`, no error, just silence. Adding an explicit `Knowledge/Application/manifest.json` (name/description/path per file, `category: "knowledge"`) fixed it completely: `837 = 833 + 4`, zero errors. This is also the first confirmed evidence that **manifest-declared entries don't need the target file to carry YAML frontmatter matching a directory-name convention** — the manifest supplies the metadata directly, sidestepping the manifestless-mode naming rules entirely. `pega-app-knowledge`'s write-back procedure now requires a manifest entry alongside every new knowledge file, or the file is invisible to this catalogue despite being on disk.

---

## 7. The plan

### Phase 0 — Verify the last link — ✅ DONE, confirmed green (2026-08-18)

Ran the jar directly (`java -jar infinity-rules-mcp.jar --spring.profiles.active=stdio`) as a standalone subprocess with `PEGA_CUSTOM_SKILLS_PATHS` set — deliberately bypassing the plugin's own (buggy) `.mcp.json` so that bug couldn't mask the result. Log confirmed: `skills.custom-paths = C:/temp/skilltest`, `Loaded 821 effective skills from 2 source(s)`. A second run with three comma-separated paths confirmed `custom-paths` accepts a delimited list (`4 source(s)`, 824 skills). Full evidence in §2.3(a).

**Result: Green. Phase 2 proceeds as written**, targeting the authoring MCP directly — no PDS MCP fallback needed. One nuance discovered: the PageRank skills graph is loaded only from the base `skills.path`, not from `custom-paths` — Companion skills get `list-skills`/`get-skill`/lexical-`search-skills` discoverability but not graph-ranked relations unless Pegasystems later adds a custom-graph property. Corrected the manifest requirement too: manifestless loading tolerated a directory with two `.md` files in testing, and it's moot anyway since none of Companion's 11 skills have a second `.md` beside `SKILL.md` (§2.3c).

### Phase 1 — Collapse the always-on surface

Mirror their two-layer shape:

1. Write **one** always-on entry skill, `pega-companion` (~200 chars description), modeled directly on `pega-assistant`: name the trigger space, instruct Claude how to reach the Companion catalogue, and state the two invariants (read-only; every write terminates in a ChangeRequest).
2. Demote the other 10 to catalogue entries.
3. Split oversized bodies into `references/` the way they do, and register them as **child artifacts** so `list-skills --parent` and `get-skill` can address them individually (§1.2) — `neo4j-cypher-querying`'s recipe library and `pega-flowaction-migration`'s 13 references should never load as one block.
4. Move catalogue prose out of the frontmatter (`pds-pega-data-access`, `pega-doc-generator`).

**Target: ~1,660 → ~110 always-on tokens.**

> ⚠️ **Sequencing constraint — do not demote before a catalogue exists to receive the demoted skills.**
> A skill that is neither in an always-on description nor in any MCP catalogue is **undiscoverable**: Claude Code has no third discovery path. Running step 2 before Phase 2 lands would silently disable 10 of your 11 capabilities.
>
> Safe order: do steps **1, 3, and 4 now** — they are pure wins and break nothing (step 1 adds an entry point; steps 3–4 shrink descriptions and split bodies while the skills remain ordinary Claude Code skills). Hold step 2 until Phase 2's catalogue is live and a `search-skills` call actually returns a Companion skill. If Phase 0 comes back red and the PDS-MCP fallback is needed, step 2 waits for *that* instead. Steps 3 and 4 alone recover a large share of the context saving without any discovery risk.

### Phase 2 — Serve the catalogue through the authoring MCP *(gated on Phase 0)*

1. Build `resources/companion-skills/` = `manifest.json` + `skills/<name>/SKILL.md` (+ `references/`, `examples/`).
2. **Explicit manifest is mandatory**, not optional (§2.3c).
3. **Namespace every skill** (`companion-*`) to stay clear of `DuplicatePolicy: reject` against future Pega additions.
4. Adopt their taxonomy: `graph-*` (cypher, feature-node, traversal recipes) · `diagnostics-*` (log-diagnosis, impact-analysis, code-review) · `methodology-*` (seam, app-knowledge) · `reference-*` (recipe library, `ref_category` taxonomy).
5. Ship `graphs/skills-graph.json` in their format (nodes with `keywords`/`concepts`/`community`, `SIMILAR:n_concepts` edges with confidence) so `search-skills` ranks Companion skills semantically **alongside** Pega's rather than after them.
6. Include `Knowledge/Application/<App>/` as catalogue entries (§6.7).

### Phase 3 — Build the enhancements

In the order given in §6. 6.1 and 6.2 are the highest value-per-effort; 6.5 is the largest unclaimed capability.

### Phase 4 — Fix confirmed defects

- **`hooks/scripts/warn-empty-graph-result.js` matcher.** The tool name `mcp__plugin_app-intelligence-companion_PDS_MCP__neo4j_query` is inferred by analogy, never verified. A wrong name means the hook silently never fires. Verify against a real connection.
- **`pds-pega-data-access` vs `config.py`.** The skill asserts PDS holds no Pega credentials; the backend still does. Adopt the tri-state rule (§4.4) and update the skill.
- **PDS MCP's `neo4j_query` tool description lists stale environment values.** Four of the eight named values don't exist in the graph; three real ones go unmentioned (§6.5). This causes silent zero-row results. Highest-priority fix in this phase — it corrupts every environment-scoped query an agent writes.
- **`.mcp.json` variable name.** Report the `PEGA_LOCAL_SKILLS_PATH` / `PEGA_CUSTOM_SKILLS_PATHS` mismatch upstream to Pegasystems — it makes their own extension point unusable as shipped.
- **Watch `ignored=` in the authoring server's startup log** once a custom pack is live. Under `BASE_WINS` it is the only signal that one of your skills was silently dropped for a name collision (§2.3d).

---

## 8. Target architecture

```
                        ┌─────────────────────────────────────────┐
   ALWAYS-ON            │  pega-assistant  (109 tok)              │
   ~220 tokens total    │  pega-companion  (~110 tok)             │
                        └──────────────────┬──────────────────────┘
                                           │  list-skills / search-skills / get-skill
                                           │  (ONE catalogue, TWO producers)
                        ┌──────────────────▼──────────────────────┐
   ON-DEMAND            │  base pack:   820 Pega entries          │
   CATALOGUE            │  custom pack: Companion + Knowledge/    │
                        │  ranked by ONE skills graph             │
                        └──────────────────┬──────────────────────┘
                                           │
              ┌────────────────────────────┴───────────────────────────┐
              ▼                                                        ▼
    ┌───────────────────────┐                        ┌─────────────────────────────┐
    │  PDS MCP  (READ)      │                        │ Authoring MCP (READ + WRITE)│
    │  graph · logs · hist  │                        │ live truth · governance     │
    │  10 environments      │                        │ 1 instance, 12 apps         │
    └───────────┬───────────┘                        └─────────────┬───────────────┘
                │                                                  │
                │      ChangeRequest lifecycle (their governance)  │
                ├──► Intake:    semantic dedupe ──────────────────►│
                ├──► Authoring: graph precedent + their examples ─►│
                ├──► Review:    ★ BLAST RADIUS INJECTED ──────────►│ human approves
                └──► Complete:  PegaUnit results ◄─── correlate ───┘
```

### Invariants

1. **Companion never writes.** Every fix terminates in a ChangeRequest. Non-negotiable.
2. **Authority is scoped, not global** (§4.4): authoring owns live truth inside its instance; PDS owns structure, history, logs, and everything outside it.
3. **One catalogue, two producers.** Companion's skills are discoverable by the authoring agent, not a parallel system it must be told to check.
4. **Always-on context is a fixed budget.** One entry skill per plugin. Every new capability is a catalogue entry, never a new always-on description.

---

## 9. Verification status of every claim in this document

| Claim | Basis |
|---|---|
| Two-layer architecture, 436 always-on chars | Read `claude-skills/*/SKILL.md`; measured |
| 820 manifest entries, 786 graph nodes, 306 edges | Parsed `manifest.json`, `skills-graph.json` |
| `search-skills` uses Personalized PageRank over the skills graph | Its own tool description + `SkillSearchService` / `SkillGraphLoader` |
| Bundle output: categories, provenance, `Requires:` / `See also:` | **Live `search-skills` call this session** |
| `list-skills` exposes parent/child artifacts | Its own tool schema (`parent`, `groupByParent`) |
| Authoring catalogue has no impact-analysis capability | **Live `search-skills` call returned none for that exact query** |
| `pega.skills.custom-paths` is real, read, and `<not set>` | **Live server log, every startup** |
| Skill loading is multi-source with override accounting | **Live log: `Loaded 820 … from 1 source(s) … (overrides=0, ignored=0)`** |
| Default duplicate policy is `BASE_WINS` | **Live log** (corrects an earlier bytecode-only inference of `reject`) |
| `DuplicatePolicy = reject \| custom-wins \| base-wins` | `SkillLoader$DuplicatePolicy` constant pool |
| `PEGA_LOCAL_SKILLS_PATH` appears nowhere in the jar | grep across extracted classes, `application.yml`, and the live config dump |
| Manifestless packs fail on multiple `.md` per dir | `CustomSkillFilesystemLoader` error strings |
| `name` must equal directory name | `CustomSkillFilesystemLoader` + `SkillValidator` |
| Three suspected duplicates cleared | Full read of all three SKILL.md files |
| CR workflow pre-flight bypasses the skills path | Full read of `methodology-change-request-workflow` |
| Context-cost figures | Measured programmatically from both plugins |
| 10 environments, ~47,632 rules; tool description is stale | **Live `neo4j_query` this session** |
| `PEGA_CUSTOM_SKILLS_PATHS` env var binds to `pega.skills.custom-paths` | **VERIFIED LIVE — standalone jar run, 2026-08-18, `821 effective skills from 2 source(s)`** |
| `custom-paths` accepts a comma-separated list | **VERIFIED LIVE — standalone jar run, 2026-08-18, `824 effective skills from 4 source(s)`** |
| Manifestless loading tolerates 2+ `.md` files in one dir | **VERIFIED LIVE (narrower error case than the bytecode strings suggested) — and moot for Companion regardless (§2.3c)** |
| Skills graph (PageRank ranking) loads only from base `skills.path`, not `custom-paths` | **VERIFIED LIVE — `786 nodes, 306 edges` unchanged after adding a custom source** |

## 10. Completion pass — 2026-08-18, follow-up session

All four plan phases (§7) were implemented, then subjected to a second, independent end-to-end pass:
a full link/cross-reference audit, live bidirectional gap-filling verification, and live testing of
every newly-written or newly-restructured piece against the real graph and the real authoring MCP.
This surfaced three genuine defects the build pass missed — the value of testing separately from
building:

1. **`pega-doc-generator` had three dead links from day one, not introduced by this session's
   changes.** Its `SKILL.md` referenced `references/query-patterns.md`, `references/document-
   templates.md`, and `references/lsa-review-checklist.md` in 4 places — none existed. Confirmed by
   extracting the original `pega-doc-generator.skill` archive from `Downloads/`: it never contained a
   `references/` folder at all. All three were reconstructed from scratch, grounded against a live
   `get_schema` call and a live rule-type distribution check (not guessed) — including flagging, per
   type, which rule types the 22-step review expects but the current graph doesn't actually contain
   (`Rule-Obj-FieldValue`, `Rule-Obj-WorkBasket`, `Rule-AI-Agent`/`Rule-AI-Tool`/`Rule-Connect-
   GenerativeAI` — zero rows graph-wide as of this check) and two step-1.12/1.13/1.20 rule-type name
   corrections (`Rule-Obj-ServiceLevel` not "Rule-Obj-SLARule"; `Rule-Agent-Queue` not
   "Rule-Obj-Agent").
2. **`pega-code-review`'s new Step 3b had a wrong path.** Live-tested the exact `get-skill` call it
   instructs: `rules-rule-obj-activity/schema/rule-obj-activity.json` 404s
   (`Did you mean 'rules-rule-obj-activity'?`); the correct name has **no `.json` suffix** —
   `rules-rule-obj-activity/schema/rule-obj-activity` — confirmed live, returns the real schema with
   `required`/`enum`/`x-pega-autoFill` exactly as Step 3b assumes. Fixed.
3. **`pega-live-gap-fill`'s "1:1 bridge" claim was stale, caught live in real time.** The graph now
   has an environment (`CCPMInt`, 14 rules) that is **not** in the Authoring plugin's 12-app roster —
   confirmed on both sides in the same session (`neo4j_query` on one side, a fresh
   `list-available-applications` call on the other, `totalCount: 12`, no `CCPMInt` entry). This is a
   live-caught instance of exactly the asymmetry §6.5/`pega-cross-environment` predicted, not a
   hypothetical — updated the skill to state the bridge is no longer 1:1 and to treat an
   authoring-plugin-unreachable environment as a resolution-ceiling case, not a retry loop.

Everything else tested clean on the first pass:
- **`pega-cross-environment`** (new, previously untested): ran its actual Step 2/3 recipe live and it
  immediately surfaced a real finding — `ProcessOfficeUpdateRequest`, a shared utility rule, running
  **4 different versions across 4 environments**, spanning `01-01-07` (Office, 2024-07-15) to
  `02-05-23` (DenovoImp, 2026-05-21, stored under a differently-named ruleset `Denovo` vs. the
  environment tag `DenovoImp`).
- **`pega-code-review`'s G1/G2** (pre-existing, re-verified): ran live against the same rule, exact
  match to documented behavior including the deliberate no-`environment`-filter cross-app design.
- **The recipe library extracted from `pega-neo4j-cypher-querying`** (Feature-node lookup, root
  lookup via `ROOTED_AT`): both ran clean against real data, exact match to documented output shape.
- **Full link audit** across every `claude-skills/*/SKILL.md` and `claude-agents/*.md`: every
  cross-referenced skill/agent name resolves to a real file; the only false positives were OpenSearch
  index names (`pega-logs`, `pega-analysis-results`, `pega-knowledge-base`) that happen to match the
  `pega-*` backtick-quote pattern. `pega-flowaction-migration`'s 12 reference/example files were
  fully imported (unlike doc-generator) — confirmed present, not just claimed.
- **Bidirectional gap-filling** confirmed concretely, both directions: Companion → Authoring
  (semantic dedupe, dual-precedent design, mandatory blast-radius injection at Review, schema
  validation, PegaUnit root-cause correlation, cross-environment comparison, per-app knowledge) and
  Authoring → Companion (`pega-gap-coverage`'s `get-rule-resolve-handle` escalation as authoritative
  live resolution, `pega-live-gap-fill`'s live rule-content fetch and app-context switching, the 34
  schemas and ~500 canonical examples both now consumed by Companion's own code-review and design
  skills). Neither direction is asserted — both have a concrete, named live-tested mechanism.
- **Final reload**, all changes together: `Loaded 837 effective skills from 3 source(s)
  (overrides=0, ignored=0)` — zero errors, zero warnings attributable to Companion's content.

## 11. Production-readiness pass — 2026-08-18, second follow-up

Asked directly "is this production ready" — answering that honestly required actually running the
plugin as a real installed plugin (`claude --plugin-dir ... -p`), not just static analysis, which
surfaced one genuine hard blocker and closed out the remaining open items from the original audit.

**Hard blocker found and fixed: `PEGA_LOCAL_SKILLS_PATH` unset makes Claude Code refuse to start the
Authoring Plugin's MCP server at all — independent of anything Companion does.** The Authoring
Plugin's `.mcp.json` references `${PEGA_LOCAL_SKILLS_PATH}` with no default value. Confirmed live via
a fresh headless launch: `mcp-config-invalid: Missing environment variables: PEGA_LOCAL_SKILLS_PATH`
— no other error surfaces anywhere, every Authoring-plugin tool (and everything in Companion that
depends on it) is just silently gone. **The fix needed one correction after a first attempt**: an
*empty* string does not satisfy Claude Code's validator (tested explicitly — same error persists);
only a **non-empty** value works. Confirmed working end to end: `PEGA_LOCAL_SKILLS_PATH=unused` →
`Successfully connected (transport: stdio) in 10598ms`, then a real tool call reached the permission
gate (proof the server is live, not just started). Applied persistently on this machine
(`[Environment]::SetEnvironmentVariable`, `User` scope), documented in `PEGA_CLAUDE_CODE_SETUP.md`
Step 2 and the Troubleshooting table.

**Separately confirmed: Windows `[User]`-scoped env var changes don't reliably reach already-running
process trees.** After persisting both `PEGA_LOCAL_SKILLS_PATH` and `PEGA_CUSTOM_SKILLS_PATHS`,
multiple fresh `claude --plugin-dir` launches spawned from an already-open automation/terminal
session still saw both as unset — only explicitly setting them inline (`$env:VAR = ...`) before
launch worked reliably in that session. A genuinely new top-level terminal window is required to pick
up a persisted change; "restart Claude Code" within the same terminal is not equivalent. Documented
as a caveat everywhere the setup guide tells the reader to set a persistent env var.

**Full headless reload confirmed working, first time since today's content changes**: all 13 skills
+ 6 agents load correctly by name (`claude --plugin-dir ... -p "list every skill and agent..."`), the
`SessionStart` hook fires (`Hook SessionStart:startup (SessionStart) success`), and — with the
`PEGA_LOCAL_SKILLS_PATH` fix applied inline — the Authoring Plugin's MCP server connects successfully
and its tools are reachable (confirmed by forcing a real call through it).

**Two items remain genuinely outside what can be verified or fixed from this side:**
- `claude plugin eval` is still early-access-gated — confirmed by actually attempting a run (not just
  reading `--help`, which does work and shows full usage): ``plugin eval` is currently in early
  access`. Unchanged from the original 2026-08-17 audit finding. The 3 authored eval cases
  (`dedupe-before-design`, `graph-before-logic`, `no-direct-write`) remain schema-correct but unrun.
- **No `pds_mcp_url` is configured anywhere on this machine** — checked `.mcp.json`'s reference,
  `~/.infinity-rules-mcp/config.json` (holds only `pega_base_url`, a different value), and global
  Claude Code settings. Per this plugin's own documented stance ("possessing that no-auth URL is
  equivalent to having access"), this was not hunted for further — it's a value only the user or
  their PDS MCP administrator should supply. Without it, Companion's own `PDS MCP` server fails
  cleanly with `Invalid URL` (expected, documented, not a bug) — but it also means the empty-graph-
  result hook's exact tool-name matcher (`mcp__plugin_app-intelligence-companion_PDS_MCP__
  neo4j_query`) still can't be verified by literally triggering it, only by the strong analogical
  evidence already documented in §2.3(a)/the hook script's own header comment.

**Verdict**: with the `PEGA_LOCAL_SKILLS_PATH` fix applied and a genuinely fresh terminal, the plugin
is production ready for its core function. The two remaining items (eval early-access, a real
`pds_mcp_url`) are account/administrator-level prerequisites, not defects in the plugin itself.
