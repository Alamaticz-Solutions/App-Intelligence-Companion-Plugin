# App Intelligence Companion Plugin

A read-only, graph-grounded intelligence layer for Pega Infinity applications — diagnosis, impact
analysis, code review, design precedent, and per-application knowledge — built on top of the PDS
Neo4j knowledge graph (via **PDS MCP**). It never authors a Pega rule itself; every proposed change
terminates in a handoff to the [**Pega Infinity Authoring Plugin**](../Pega%20Infinity%20Authoring%20Plugin/)'s
governed `methodology-change-request-workflow` (branch isolation, mandatory human review, audit
trail). Companion and Authoring are meant to be installed together — see
[`PEGA_CLAUDE_CODE_SETUP.md`](./PEGA_CLAUDE_CODE_SETUP.md) to get both running.

Internal Alamaticz Solutions tooling — not published to a public marketplace. Source lives at
[`Alamaticz-Solutions/App-Intelligence-Companion-Plugin`](https://github.com/Alamaticz-Solutions/App-Intelligence-Companion-Plugin).

## What it does

- **Diagnoses production errors end-to-end** — log excerpt/stack trace/class hash → root cause,
  exact point of failure, technical blast radius, business-process impact.
- **Forecasts the impact of a proposed change** *before* it's made — blast radius, risk level,
  affected applications, override risk — and can inject that report directly into a
  ChangeRequest case before a human approves it.
- **Reviews a rule/branch for promotion** — the same G1–G4 graph investigation and PASS/WARN/FAIL
  rubric the platform's own review agent uses, plus an independent second-pass reviewer with no
  visibility into the first review, for an unbiased verdict.
- **Grounds new-feature design in real precedent** — how *this specific app* has already solved a
  similar problem, pulled from the graph, not generic Pega best practice — plus a semantic dedupe
  check so a near-duplicate rule doesn't get proposed.
- **Answers open-ended structural questions** about the dependency graph — "what calls X," "trace
  the tree from this root," "what's the class hierarchy above Y" — that don't fit any of the above.
- **Resolves graph gaps** (stub rules, unresolved references) via an escalating chain from the
  static graph, to raw XML/rule-content tools, to Pega's own live resolution as the authoritative
  last resort — reporting a genuine "can't resolve this" plainly instead of guessing.
- **Remembers what's hard-won about each application** — defects, naming traps, cross-app
  data-sharing quirks — in a knowledge base that ships *with the plugin*, so the whole team benefits
  from what one diagnosis session discovered, not just the machine it ran on.

## How it fits with the Authoring Plugin

Every write action — creating or editing a rule, advancing a case — happens through the Authoring
Plugin's own governed tools. Companion's role is everything *around* that: catching duplicates before
they're proposed, grounding new work in precedent, and putting real dependency visibility in front of
the human reviewer before they approve a promotion. See `PLUGIN_BUILD_CONTEXT.md` for the full
architecture rationale (the "how Companion and Rule Authoring fill each other's flaws" design), and
`claude-skills/pega-companion-seam/SKILL.md` for the orchestration that ties the two together across
the ChangeRequest lifecycle (intake → authoring → review → complete).

## Structure

```
.claude-plugin/plugin.json    — plugin manifest
.claude-plugin/marketplace.json — self-contained marketplace, for a persistent no-flag install
.mcp.json                     — wires the PDS MCP server (remote, per-client Lambda URL)
claude-skills/manifest.json    — explicit catalogue for the Authoring Plugin's optional skill-pack extension point (Step 7 of setup)
claude-skills/<name>/SKILL.md — 13 skills; frontmatter description is the trigger condition
claude-agents/<name>.md       — 6 agents, independently invocable, not only skill-dispatched
Knowledge/Application/<App>/  — per-application knowledge base, ships with the plugin
hooks/hooks.json               — SessionStart banner + a PostToolUse graph-empty-result reminder
evals/<case>/prompt.md + graders/*.md — 3 safety/discipline eval cases (early-access, unrun so far)
```

**Skills**: `pega-companion` (entry point — start here to find the right specialist skill),
`pega-companion-seam` (the intake→authoring→review→complete orchestrator — the ChangeRequest
handoff itself), `pega-impact-analysis`, `pega-code-review`, `pega-log-diagnosis`,
`pega-doc-generator`, `pega-flowaction-migration`, `pega-neo4j-cypher-querying`,
`pega-feature-node-retrieval`, `pega-cross-environment`, `pega-live-gap-fill`,
`pds-pega-data-access`, `pega-app-knowledge`.

All 12 specialist skills are also loadable through the Authoring Plugin's own `list-skills`/
`search-skills`/`get-skill` — an extension point confirmed live 2026-08-18 (see
`COMPANION_VS_AUTHORING_ANALYSIS.md` §2 and setup Step 7). Optional; Claude Code's native plugin
skill discovery already works without it.

**Agents**: `pega-designer` (Designing), `pega-graph-traverser` (Graph Traversing),
`pega-gap-coverage` (Gap Coverage), `pega-log-rca` (Log/RCA), `pega-verifier` (Verification &
Validation), `pega-independent-code-reviewer` (Code Review). All read-only; Gap Coverage and Log/RCA
in particular are meant to be called directly, ad hoc, by other agents mid-task — not gated behind a
skill trigger phrase.

## Scope

Single-client, not multi-tenant, for now. PDS MCP's current deployment hardcodes one client's Pega/
Neo4j/DynamoDB credentials per Lambda; the multi-tenant Postgres-driven model (`Graph Building UI`)
is deliberately deferred. See `PLUGIN_BUILD_CONTEXT.md` for the full build history and open items.

## Status

Actively built out this session — 11 skills and 6 agents in place, manifest wired and verified
against Claude Code's plugin schema. See `PLUGIN_BUILD_CONTEXT.md`'s "Immediate next steps" for what's
still open (currently: an end-to-end live test against a real client's PDS MCP + Authoring Plugin
connection hasn't been run yet).
