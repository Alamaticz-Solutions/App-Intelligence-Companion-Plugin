# App Intelligence Companion Plugin — Build Context

Handoff doc for continuing this build in a new session. Paste this whole file (or point Claude at its path) to resume.

## Goal
Package the "App Intelligence Companion Plugin" as a real, installable Claude Code plugin — mirroring the structure of the sibling `Pega Infinity Authoring Plugin` repo, which is a working reference. The Companion directory is currently empty except `.claude/settings.local.json` — this is a from-scratch packaging job, not a novel design problem; most of the pieces already exist scattered across other repos and Downloads.

## Scope decision (confirmed)
**Per-client only, not multi-client, for now.** PDS MCP (`PDS MCP/src/core/config.py`) is a single hardcoded-per-client deployment (Lambda Function URL, `PEGA_CONFIGS`/`NEO4J_CONFIGS`/`DYNAMO_CONFIGS` dicts keyed by app name, one client's credentials baked in via env vars). That's fine as-is. Do **not** try to generalize this to the Graph Building UI's multi-tenant Postgres-driven model yet — that's explicitly deferred to later.

## Reference structure (from `Pega Infinity Authoring Plugin`, known-working)
```
.claude-plugin/plugin.json   — manifest: name, description, version, skills path, agents path, mcpServers path
.mcp.json                    — MCP server wiring
claude-skills/<name>/SKILL.md — one folder per skill, YAML frontmatter `description:` is the trigger condition
resources/                   — bundled jar / skill library / static assets
```
`plugin.json` supports both a `skills` field and an `agents` field pointing at directories — so Companion agents should live in `claude-agents/<name>.md`, not just this-project's local `.claude/agents/`.

PDS MCP itself (`PDS MCP/src/api/server.py`) runs as a public, no-auth Lambda Function URL, reached via `npx mcp-remote <url>`. `.mcp.json` is:
```json
{
  "mcpServers": {
    "PDS MCP": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${user_config.pds_mcp_url}"]
    }
  }
}
```
**Naming resolved (2026-08-17):** `AppAiIntelli` and `PDS_LOCAL` were both historical names different team members used for the same, single backend — there is only one MCP server, `PDS MCP`. Standardized on that name everywhere: `.mcp.json`'s server key, `.claude/settings.local.json`'s `enabledMcpjsonServers`, and the two skills that had drifted (`pega-doc-generator` said `AppAiIntelli MCP`, `pds-pega-data-access` said `PDS_LOCAL` throughout its title/body) are now all fixed to say `PDS MCP`.

## Skills — final inventory
Started at 8 named skills in the original architecture doc. After checking for overlap with the authoring plugin's 45 bundled skills (`Pega Infinity Authoring Plugin/resources/pega-skills/skills/`) and checking pre-built `.skill` files in Downloads, here's where things stand:

| Skill | Status | Notes |
|---|---|---|
| Heritage Modernization | **DONE — import as-is** | `C:\Users\ManojRajakumar\Downloads\pega-flowaction-migration.skill`. v3.0.0, mature, bottom-up multi-agent dependency-chain analysis for Constellation migration readiness, own internal subagent roles, hands off to authoring plugin's ChangeRequest workflow. Analysis-only, never authors directly. |
| Doc Generation | **DONE — import as-is** | `C:\Users\ManojRajakumar\Downloads\pega-doc-generator.skill`. 22-step autonomous graph review → locked one-question-at-a-time clarification loop → writes Platform-Agnostic + Pega Blueprint specs. Deliberately does NOT delegate to subagents (needs live turn-by-turn dialogue with user — a legitimate exception to the dispatch pattern below). Requires MCP server named `PDS MCP`. |
| MCP Usage / Data Access | **DONE (mostly) — import + merge** | `C:\Users\ManojRajakumar\Downloads\pds-pega-data-access.skill`. This answers the original "Dpage tools" question from the architecture doc — no named per-Dpage tools needed; instead this skill routes all live Pega lookups through the generic `run-data-page` tool with documented `dataViewID`s, params, response-shaping, and real prod gotchas (case-sensitive `D_pzGetCaseDetails`, pool-class ALL-CAPS format quirk, a data view that's permanently 403'd — don't retry it). **Key architecture stance baked into this skill: Companion (now standardized as `PDS MCP` — see naming note below) should stop holding its own Pega credentials entirely and route all live Pega access through the already-authenticated Rule Authoring plugin.** This conflicts with PDS MCP's current `config.py` which hardcodes its own `PEGA_CONFIGS` per app — worth resolving which is authoritative when we assemble the plugin. |
| Neo4j | **build new** | Query construction, schema understanding, when to run queries. |
| Log Analysis | **build new** | OpenSearch + graph correlation for debugging. Should route to Log/RCA Agent. |
| Companion ↔ Rule Authoring | **DONE** | `claude-skills/pega-companion-seam/SKILL.md`. The seam skill. Absorbs what was originally listed as a separate "Rule Authoring Skill usage Skill" (same concern, merge to one). Orchestrates the 4-stage ChangeRequest lifecycle (Intake → Authoring → Review → Complete), dispatching to `pega-designer`/`pega-impact-analysis`/`pega-code-review`/`pega-verifier`/`pega-gap-coverage` per stage. Implements the Review-stage report-injection design (see below) as its core capability. This was the most important skill to get right. |
| Code Review | **build new** | Reviews rule changes on a branch with graph context. NOT the same as authoring plugin's `prove-pr-change-with-evals` (that's for evaling the authoring plugin's own dev artifacts, different audience). Routes to Code Review Agent. |

**Naming inconsistency — resolved 2026-08-17:** `pega-doc-generator.skill` expected an MCP server named `AppAiIntelli`; `pds-pega-data-access.skill` referred to the same backend as `PDS_LOCAL`. Confirmed: same thing, two historical names from different team members who built these skills independently — there is only one MCP server. Standardized everywhere on `PDS MCP`.

**Before writing any new skill:** check Downloads for more pre-built `.skill` files covering Neo4j, Log Analysis, or Companion↔Rule-Authoring — two out of the original list have already turned up prebuilt, don't assume the remaining three don't exist somewhere too.

**Checked and skipped, 2026-08-18**: `C:\Users\ManojRajakumar\Downloads\Feature_Examination_Skill.md` — turned out to be an earlier copy of the already-integrated `feature-node-retrieval` skill (identical `name`, near-identical content), missing only the one sentence added when this plugin integrated it with `pega-live-gap-fill`. Confirmed via diff, not skimmed. User confirmed: skip it, don't overwrite the in-plugin (better) version. If more files turn up in Downloads, diff against the existing skill of the same `name` before assuming it's new content.

## Agents — final inventory
Started at 8. Trimmed to 6 after de-duplication and cutting one redundant with the authoring plugin's own tool access:

| Agent | Status | Notes |
|---|---|---|
| Designing Agent | **DONE** | `claude-agents/pega-designer.md`. End-to-end planning; grounds authoring in app-specific precedent pulled from the graph (not generic Pega best practice) — see Flaw #3 below. Also runs the semantic dedupe check (Intake row below) and flags when `pega-impact-analysis` should run before authoring. |
| Graph Traversing Agent | **DONE** | `claude-agents/pega-graph-traverser.md`. Core differentiator, no equivalent anywhere in the authoring plugin. Answers open-ended structural questions by composing `neo4j-cypher-querying`/`feature-node-retrieval`, no fixed report format — other agents call it directly for ad hoc traversal instead of writing Cypher themselves. |
| Gap Coverage Agent | **DONE** | `claude-agents/pega-gap-coverage.md`. Resolves graph gaps (`IDENTIFIED_STUB` nodes, `resolve_failure`) via an escalation chain: static graph re-check → PDS MCP XML/rule-content tools → authoring plugin's `get-rule-resolve-handle` as authoritative last resort. Reports the resolution ceiling plainly when even that doesn't settle it, instead of giving up silently. Directly callable ad hoc by other agents (V&V, Code Review, Designing, Graph Traversing) whenever they hit a gap. |
| Log/RCA Agent (merged) | **DONE** | `claude-agents/pega-log-rca.md`. Original list had "RCA Agent" and "Log Analysis Agent" as separate — same job, merged to one. Thin wrapper around `pega-log-diagnosis`, directly callable ad hoc; hands off to `pega-gap-coverage`/`pega-graph-traverser` mid-diagnosis when it hits a graph gap or an open-ended structural question. |
| Verification & Validation Agent | **DONE** | `claude-agents/pega-verifier.md`. **Confirmed scope: meta-QA on other Companion agents' outputs/claims, NOT functional testing of Pega changes** (that's already covered by the authoring plugin's `methodology-application-tests`). Adversarially re-checks high-stakes claims (e.g. "safe to change, nothing else references this") before they reach the human — a false "safe" is the single most dangerous failure mode in this whole system. |
| Code Review Agent | **DONE** | `claude-agents/pega-independent-code-reviewer.md`. Explicitly should NOT inherit other agents' prior reasoning/context — invoke as a fresh subagent, not a fork, so it stays unbiased per the original design intent. |
| ~~Pega Agent (Pega-tools-only)~~ | **cut** | Redundant with the authoring plugin's own tool access. Confirmed as legit standalone tool-of-last-resort logic gets absorbed into V&V Agent instead (calling authoring-plugin tools directly for live cross-checks), not a separate agent. |

**Design principle on skills vs agents (with one confirmed exception):** Skills should generally be thin dispatchers into agents — recognize the trigger, hand off to a subagent, keep heavy multi-tool-call work out of the main conversation's context. Exception: Doc Generation skill correctly stays single-threaded because it needs live turn-by-turn user dialogue, which a subagent can't hold. **Also confirmed by user: agents are not exclusively skill-invoked — several are legitimately standalone** (Gap Coverage and Log/RCA in particular should be directly callable ad hoc, not gated behind a skill trigger phrase; and agents can call each other directly — e.g. V&V triggering Gap Coverage mid-task — without ever routing through a skill).

## Architecture design: how Companion and Rule Authoring fill each other's flaws
This came out of an explicit design discussion — the two plugins are meant to be bidirectionally complementary, not one enriching the other one-way. Mapped onto the ChangeRequest lifecycle's 4 stages (intake / authoring / review / complete):

| Stage | Companion → Rule Authoring | Rule Authoring → Companion |
|---|---|---|
| Intake | Semantic dedupe check (`search-rules`/`search-features`) before proposing a new rule — prevents duplicate-rule sprawl (authoring plugin's native search is literal/keyword, not semantic) | — |
| Authoring | Precedent/convention grounding from the graph — Designing Agent checks how *this app* has solved similar problems before, not generic Pega best practice | Gap Coverage's stub-resolution fallback chain calls `get-rule-resolve-handle` as authoritative when static graph resolution can't settle it |
| Review | **Blast-radius / Impact Analysis report** injected into the ChangeRequest case before human approval — walks `REFERENCES`/`SETS`/`OVERRIDES`/`SPECIALIZED_BY` edges from the target rule, classifies read vs write, direct vs transitive. This is the single highest-value capability — the authoring plugin's `methodology-change-request-workflow` gives a human review gate, but today the human reviews a bare diff with zero dependency visibility. | — |
| Complete | — | *(Was discussed as "targeted re-sync trigger on merge" — but confirmed unnecessary: delta processing already keeps the graph fresh via the native RulesDelta CSV → S3 → EventBridge → delta_processor path. Don't build a second sync mechanism.)* |

**Flaws corrected during discussion — do not re-litigate these:**
- ~~"Delta processing isn't tenant-aware"~~ — WRONG, corrected. Every delta_processor query is properly parameterized by `TENANT_ID`. The only real gap was that the AWS deployment configs (`task-definition-delta-processor.json`, `eventbridge-delta-target*.json`) never set `PDS_TENANT_ID`, so it defaults to tenant 0 — irrelevant now since scope is confirmed per-client (single tenant), not multi-client.
- ~~"Graph goes stale after a merge, need Rule-Authoring-triggered targeted re-sync"~~ — WRONG, corrected. Delta processing already handles this via Pega's native RulesDelta export on branch merge. Don't build a redundant sync path.
- **Still valid, correctly scoped:** static circumstance/rule resolution (`pds_rule_highest_resolved`, one row per `(app, name, class, circumstance)`) is precomputed rule-priority data, not runtime evaluation. Freshness (delta processing) doesn't fix this — it's a category difference, not a staleness gap. The graph can tell you every candidate resolution and priority order; only live Pega (`get-rule-resolve-handle`, called with real case context) can tell you which one actually fires for a specific case. Hand off to live resolution at exactly the moments circumstance/context matters, not more broadly.
- **Confirmed real, no counter-argument raised:** Companion should never gain write capability — it stays read/analyze-only by design (every PDS MCP tool is get/search/analyze). Rule Authoring's `methodology-change-request-workflow` (branch isolation, mandatory human review, audit trail, never auto-approve) is the only legitimate write/governance path. Any Companion-driven fix must terminate in a ChangeRequest, never write directly.

## Immediate next steps (step by step, as requested)
1. ~~Resolve the `AppAiIntelli` vs `PDS_LOCAL` naming question.~~ **DONE — standardized on `PDS MCP` everywhere (2026-08-17).**
2. Check Downloads for any other pre-built `.skill` files (Neo4j, Log Analysis, Companion↔Rule-Authoring) before writing new ones.
3. Decide the PDS MCP credential-duplication question: keep `config.py`'s own `PEGA_CONFIGS`, or fully defer live Pega access to the authoring plugin per `pds-pega-data-access.skill`'s stance.
4. ~~Write the remaining new skills~~ **DONE — all 4 covered**: Neo4j (`neo4j-cypher-querying`), Log Analysis (`pega-log-diagnosis`), Companion↔Rule-Authoring (`pega-companion-seam`, written 2026-08-17), Code Review (`pega-code-review`).
5. ~~Write the remaining agent (Log/RCA)~~ **DONE — all 6 agents now built.**
6. ~~Scaffold `.claude-plugin/plugin.json` and `.mcp.json`.~~ **DONE** — both exist and are wired (`plugin.json`'s `agents` field fixed 2026-08-17 to the required array-of-file-paths format; was previously a directory string that would have registered zero agents).
7. Assemble: copy in the 3 pre-built `.skill` files (done), drop in the newly-written skills/agents (done, all 11 skills + 6 agents in place), wire the manifest (done). `pega-app-knowledge` (v2.0.0) now reads/writes `${CLAUDE_PLUGIN_ROOT}/Knowledge/Application/<App>/` so per-app findings ship with the plugin to the whole internal team, instead of Claude Code's personal per-machine memory. ~~Still missing: a README/setup doc~~ **DONE** — `README.md` and `PEGA_CLAUDE_CODE_SETUP.md` written 2026-08-17. One item in the setup doc is explicitly flagged unverified: how `userConfig` (`pds_mcp_url`) actually prompts on first install couldn't be confirmed from Claude Code's public docs — the doc tells the reader to expect an interactive prompt and to ask a maintainer if it doesn't appear, rather than guessing a manual-override mechanism. Confirm this against a real fresh install and tighten the doc once known. Stray `logs/*.log` cleanup attempted 2026-08-17: the older dated log (`infinity-rules-mcp-2026-08-14.0.log`) is deleted. `infinity-rules-mcp.log` could **not** be removed — it's locked by the Pega Infinity Authoring Plugin's MCP server, which is actively running (connected in this session) and writing to it; that log only exists inside Companion's folder because that process happened to be launched with this directory as its working directory, not because Companion itself produces it. Delete it once no live session has that MCP server running from here, or (once this becomes a git repo) add `logs/` to `.gitignore` so it stops mattering regardless. `.claude-plugin/marketplace.json` written 2026-08-18, self-contained layout by explicit user choice (lives inside Companion's own `.claude-plugin/` alongside `plugin.json`, `source: "./"` referencing itself, chosen over adding marketplace infra to the shared `Projects - Alamaticz` parent folder). **Fully tested and CONFIRMED WORKING end-to-end, 2026-08-18** — turns out there's a scriptable CLI (`claude plugin marketplace add/list/remove`, `claude plugin install/uninstall/details/validate`), separate from the interactive `/plugin` slash commands, that doesn't need a TTY:
- `claude plugin validate "<path>" --strict` → passed clean.
- `claude plugin marketplace add "<path>"` → registered successfully as `app-intelligence-companion-marketplace`, confirmed via `claude plugin marketplace list`. **The self-referencing layout is real and supported**, not just schema-plausible.
- `claude plugin install app-intelligence-companion@app-intelligence-companion-marketplace -y` → installed cleanly to `~/.claude/plugins/cache/...`.
- **`userConfig` mechanism now definitively confirmed** (this replaces the earlier "expect an interactive prompt" guess, which was wrong): installing **without** `--config` does **not** prompt — it installs successfully and prints `1 userConfig option not yet set — run /plugin configure ... or pass --config KEY=VALUE`. The actual mechanism is `/plugin configure <plugin>@<marketplace>` (interactive) or `claude plugin install ... --config pds_mcp_url=<url>` (scriptable, tested with a placeholder value) — never an automatic prompt on first MCP-server start. Values persist in `~/.claude/settings.json`, confirmed by grep.
- A fresh `-p` session after install (no `--plugin-dir` needed at all) correctly loaded **all 11 skills and all 6 agents** by name — full runtime confirmation on top of the earlier `--plugin-dir` test.
- One cosmetic-only quirk: `claude plugin details <plugin>` reported `Agents (0)` in its component-inventory display even though all 6 agent files were confirmed physically present in the installed cache directory *and* confirmed loading correctly at actual runtime in the same session. Looks like a display/counting bug specific to that inventory command for the array-of-file-paths `agents` format, not a real functional gap — flagged, not blocking.
- **Test artifacts cleaned up afterward**: uninstalled the plugin, removed the test marketplace registration, and confirmed the placeholder `pds_mcp_url` value left no trace in `~/.claude/settings.json` — this machine's real Claude Code state is back to how it was before this test.

## Hooks and evals (added 2026-08-18)

**Hooks** — `hooks/hooks.json` (auto-discovered default path; do **not** also add a `"hooks"` field to
`plugin.json` pointing at the same file — confirmed live to cause a "Duplicate hooks file detected"
error and `hook-load-failed`, since Claude Code loads the default path automatically regardless).
Two hooks, both narrowly scoped to Companion's own tools/behavior — deliberately **not** a blanket
write-blocking hook on the Authoring Plugin's tools, which would break that plugin's own legitimate
use whenever both are loaded together (the normal case):
- `SessionStart` → `hooks/scripts/session-banner.js`. Prints a read-only-mode reminder every session.
  **Confirmed firing live** via `--debug-file`: `Hook SessionStart:startup (SessionStart) success:`
  followed by the exact banner text.
- `PostToolUse` on `neo4j_query` → `hooks/scripts/warn-empty-graph-result.js`. Advisory only (never
  blocks): if a `REFERENCES`-shaped query returns empty, reminds the agent to check
  `pega-gap-coverage`/`pega-live-gap-fill` before reporting "nothing found," encoding a discipline
  this plugin's skills had to learn the hard way (documented real false negatives on queue-processor/
  job-scheduler roots and FlowAction callers). **The matcher's exact tool name
  (`mcp__plugin_app-intelligence-companion_PDS_MCP__neo4j_query`) is inferred by direct analogy from
  the Authoring Plugin's own confirmed live naming pattern, not independently verified** — this
  plugin's own MCP connection wasn't reachable during authoring (no `pds_mcp_url` available in this
  environment). A wrong name means the hook silently never fires (safe failure mode, not dangerous)
  — reconfirm the exact tool name once a real client connection is available and correct the matcher
  if it's off.

**Evals** — `evals/<case>/prompt.md` + `evals/<case>/graders/*.md`, 3 cases written, schema confirmed
via `claude-code-guide`. **`claude plugin eval` is genuinely early-access-gated in this environment —
confirmed by actually running it** (`` `plugin eval` is currently in early access ``), so these are
authored correctly but **could not be run or verified here**. All 3 were deliberately chosen to be
testable without live MCP access (evals don't get tool access by default unless `--allow-tools`
grants it), using `regex`/`tool_used` deterministic graders against the agent's own stated approach:
- `no-direct-write/` — the single most safety-critical invariant: does Companion refuse to author a
  rule directly even when explicitly asked to skip the ChangeRequest process?
- `dedupe-before-design/` — does a new-feature request trigger the semantic dedupe check before
  proposing a design?
- `graph-before-logic/` — does a code-review request describe the mandatory G1-G4 graph investigation
  before/alongside reading the rule's own logic?

Run `claude plugin eval .` once eval access is enabled for this account/org to get real scores.

**Setup doc updated to match confirmed reality, not the earlier guess** — Step 5's "expect an interactive prompt" replaced with the actual `/plugin configure` / `--config` mechanism. Both install paths (`--plugin-dir`/alias, and marketplace `add`+`install`) are now confirmed working; no open items remain here except supplying a real client `pds_mcp_url` when someone actually deploys this for a client.
8. Test end-to-end against one client's actual PDS MCP Lambda + authoring plugin connection — **partially run 2026-08-17, real findings below.**

**End-to-end test results (2026-08-17):**
- **Plugin load — CONFIRMED live.** Ran `claude --plugin-dir "<this folder>" -p "list every skill and agent loaded"` as an actual fresh headless process, not a schema read. Result: all 11 skills and all 6 agents loaded and were named correctly. This is the strongest possible confirmation that the `agents`-field fix (array of file paths, not a directory string) actually works — a wrong format would have shown zero agents, not an error.
- **`.mcp.json` wiring — CONFIRMED live.** The plugin's own MCP server registered under the correct namespaced name, `plugin:app-intelligence-companion:PDS MCP` — confirms the naming resolution (PDS MCP, not AppAiIntelli/PDS_LOCAL) took effect end-to-end, not just in the source files.
- **PDS MCP backend — CONFIRMED live** (via this session's existing separate connection to the same backend, not routed through the plugin's own not-yet-configured `.mcp.json`): `get_schema` returned 47,632 Rule / 9 App / 14 Feature / 181 Ruleset nodes — real growth from the 47,615 Rule count `neo4j-cypher-querying` last documented, consistent with that skill's own "re-verify, don't trust a cached count" guidance. A fresh whole-graph environment query also surfaced **`CCPMInt`** — an environment value not in that skill's previously-documented 9-value list. Real live drift, exactly the scenario that skill's §0 discipline exists for; the skill's own instruction to always re-run the discovery query rather than trust the list is doing its job.
- **Authoring Plugin backend — CONFIRMED live** (same caveat): `list-available-applications` returned all 12 applications, 11 switchable, and **`HRLifeImp` specifically not switchable** for this operator — an exact, independent reconfirmation of the permission caveat `pega-live-gap-fill` already documents.
- **NOT verified — the actual `${user_config.pds_mcp_url}` resolution through this plugin's own `.mcp.json`.** No client Lambda URL was available to supply in this test environment, and deliberately not hunted for one — it's a no-auth Lambda Function URL, i.e. possession is equivalent to access, not something to go digging for just to complete a test.
- **New, real finding on `userConfig` behavior**: in **non-interactive (`-p`) mode with no `pds_mcp_url` set, the MCP server does not error and does not prompt — it sits in "still connecting" indefinitely with no fast, clear failure.** This confirms the setup doc's cautious wording was warranted, and adds a concrete troubleshooting fact: anyone running Companion via a script/non-interactive session without first setting `pds_mcp_url` will see silent non-response, not a clear error pointing at the missing config. **Still unconfirmed**: whether a normal *interactive* `claude` session prompts for the value on first use — this tool environment has no way to simulate an interactive TTY, so that specific behavior needs one person to actually try it once and report back.

## Key file locations
- `Pega Infinity Authoring Plugin/` — working reference plugin structure
- `PDS MCP/` — Companion's backend MCP server (Lambda, single-client hardcoded config)
- `Graph Building UI/backend/pds_graph/` — the graph-building engine (multi-tenant SaaS, mature, delta processing works correctly — deferred, not needed for per-client scope)
- `App Intelligence Companion Plugin/` — target directory, currently empty, this is what we're building
- `C:\Users\ManojRajakumar\Downloads\*.skill` — pre-built skill zip files, check here before writing new ones
