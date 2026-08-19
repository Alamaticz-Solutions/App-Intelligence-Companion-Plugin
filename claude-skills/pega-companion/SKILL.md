---
name: pega-companion
description: "Entry point for any Pega Infinity graph/log/diagnostic question -- Neo4j-grounded impact analysis, code review, log RCA, per-app knowledge, Constellation migration. Read-only; every fix terminates in the Rule Authoring plugin's ChangeRequest workflow, never a direct write."
---

<!-- Skill version: 1.0.0 | 2026-08-18 -->

# App Intelligence Companion

This plugin answers Pega questions the Rule Authoring plugin's own 50 skills can't: dependency
graphs, blast radius, production log diagnosis, cross-environment comparison, and per-application
tribal knowledge. It never writes to Pega directly.

## Before you dispatch: check the data-access gate first

If the question touches applications, case types, rules, branches, cases, or data pages **at all** —
even just to ask "what applications exist" or "how many case types" as part of a bigger question that
also asks for raw graph counts — load `pds-pega-data-access` **first**, before any other specialist
skill, and follow its routing decision for that part of the question. This applies even when the
question is phrased as a graph/Cypher request; a mixed question ("what applications, how many case
types, and how many rules/nodes are in the graph") splits into a data-access part (applications, case
types — live Pega concepts) and a graph-count part (raw rule/node totals — `pega-neo4j-cypher-
querying`'s territory). Resolve the data-access part through `pds-pega-data-access`'s routing policy
before falling through to `pega-neo4j-cypher-querying` for the rest. Do not let a "raw Cypher" or
"graph" framing skip this gate — `pds-pega-data-access` triggers on the Pega concepts in the question,
not on how the question is worded.

## Find the right specialist skill

This plugin ships ten specialist skills. Rather than listing all of them here, search for the one
that fits:

- If the Rule Authoring plugin's MCP is connected, call its `search-skills` with your query —
  Companion's skills are indexed there alongside Pega's own 50 (see `pega-companion-seam` for the
  handoff contract).
- Otherwise, use Claude Code's own Skill discovery — each specialist skill's own frontmatter
  `description` states its trigger phrases directly.

Quick map, by question shape:

| Question shape | Skill |
|---|---|
| "What breaks if I change X?" (before the change) | `pega-impact-analysis` |
| "Why did X fail in production?" (after the fact) | `pega-log-diagnosis` |
| "How does case type / queue processor / job scheduler X work?" | `pega-feature-node-retrieval` |
| Raw Cypher against the PDS graph | `pega-neo4j-cypher-querying` |
| "Has this been fixed elsewhere?" / DEV-vs-PROD drift | `pega-cross-environment` |
| "Is this rule/branch safe to promote?" | `pega-code-review` |
| "Generate a spec / reverse-engineer this app" | `pega-doc-generator` |
| "Migrate this Flow Action / Case Type to Constellation" | `pega-flowaction-migration` |
| Starting or resuming a ChangeRequest, proposing a new feature | `pega-companion-seam` |
| Graph gap, stale data, ambiguous result mid-task | `pega-live-gap-fill` |
| Any question touching Pega rules/cases/applications/branches/data pages, even mixed with other asks | `pds-pega-data-access` — **check this gate first, see above** |
| Per-application notes: naming traps, known defects, conventions | `pega-app-knowledge` |

## Two invariants, always

1. **Read-only.** Companion never calls a write tool (`create-rule`, `update-rule`, `copy-rule`,
   `perform-action`, or similar). Every fix it identifies terminates in a ChangeRequest via the Rule
   Authoring plugin (`pega-companion-seam`) — never a direct edit.
2. **Check `pega-app-knowledge` first, write back what's hard-won.** Before spending tool calls
   re-deriving something already known about an application, check the plugin's bundled
   `Knowledge/Application/<App>/` notes. After a non-obvious finding, write it back there so it
   ships to the whole team, not just this session.
