---
name: pega-app-knowledge
description: "Standing discipline for every other Companion skill (pega-log-diagnosis, pega-impact-analysis, pega-code-review, pega-doc-generator): check per-application knowledge first before re-deriving something already known, and write back anything hard-won and non-obvious afterward — into the plugin's own bundled Knowledge/ folder, not personal session memory, so it ships to every internal team member who installs this plugin. Not a one-off trigger phrase — the first and last step of app-specific work."
---

<!-- Skill version: 2.1.0 | 2026-08-18 — added the manifest.json write-back step so Knowledge/
     findings are reachable through the Rule Authoring plugin's own skill catalogue, not just
     Companion's native loading; confirmed live that files here are silently dropped without it. -->
<!-- Skill version: 2.0.0 | 2026-08-17 — moved from Claude Code's personal ~/.claude/projects memory
     (machine/session-local, doesn't travel with the plugin) to the plugin's own bundled Knowledge/
     folder, since this plugin is distributed to the whole internal team, not used by one person on
     one machine. -->

# Per-application knowledge layer: check first, write back what's hard-won

## Trigger phrases
Any application-specific task — a diagnosis, an impact analysis, a code review, a doc-generation run
— for an app this Companion has worked with before. Not a standalone trigger phrase so much as a
**standing discipline**: the first two steps of every other skill in this family
(`pega-log-diagnosis`, `pega-impact-analysis`, `pega-code-review`, `pega-doc-generator`) should check
here before spending tool calls re-deriving something already known, and the last step of each should
write back anything non-obvious that was hard to find.

## What this is
The user's Companion Plugin architecture document describes a `/Knowledge Or Memory or Docs` layer,
populated per-application by KT sessions: application documentation, design patterns to follow,
important notes, and "memory." That full KT-driven documentation doesn't exist yet for any app in
this environment — `pega-doc-generator` is the skill that would eventually produce it. **This skill
is the interim, cheap layer**: it captures what's *already been discovered* through normal
diagnosis/review/analysis work, so the next person on the team doesn't re-pay the cost of
re-discovering it.

**Compose, don't duplicate**: this is not a substitute for `pega-doc-generator`'s full KT-session
output, and it does not replace `pega-neo4j-cypher-querying`/`pega-feature-node-retrieval` as the live source of
truth for anything re-derivable in one query. It exists specifically for the gap between those two —
facts that took multiple tool calls, a live bug, or cross-referencing several sources to establish,
and would otherwise be silently re-discovered (or missed) next time.

## Where it lives — and why this isn't Claude Code's personal memory system
**This plugin is distributed to the internal team, not used by one person on one machine.** Claude
Code's own per-project memory (`~/.claude/projects/<project>/memory/`) is machine- and session-local
— content saved there on one person's laptop is invisible to every teammate who installs this plugin.
That's the wrong mechanism for knowledge meant to ship with the plugin, so this skill deliberately
does **not** use it.

Instead, per-app knowledge lives as plain markdown files bundled inside the plugin itself, at:
```
${CLAUDE_PLUGIN_ROOT}/Knowledge/Application/<AppName>/<topic>.md
```
`${CLAUDE_PLUGIN_ROOT}` is Claude Code's own substitution variable for "wherever this plugin is
installed" — confirmed to resolve inside skill markdown content, not just `.mcp.json`/hook configs —
so this path is reliable regardless of the user's current working directory or where the plugin was
installed from. Naming convention: `app-<lowercase-app-name>-<topic>.md` (e.g.
`Knowledge/Application/OWLM/app-owlm-known-defects.md`), so files are greppable/listable as a group
within each app's folder.

**The write-back/distribution model, stated plainly — this is not live multi-user sync:**
- If you're working from the plugin's own **source tree** (this repository, wherever the team keeps
  it — the same place `PLUGIN_BUILD_CONTEXT.md` lives), writing a new finding into
  `Knowledge/Application/<App>/` **is** updating the shared source. It reaches the rest of the team
  the normal way this plugin gets distributed to them (a repo pull, a re-share, a version bump) — not
  automatically, not instantly, but it is the real, durable, team-visible copy once that happens.
- If you're running from an **installed** copy of the plugin (e.g. under
  `~/.claude/plugins/cache/...` on a teammate's machine, not this source tree),
  **`${CLAUDE_PLUGIN_ROOT}` is not guaranteed to survive a plugin update** — anything written there
  can be silently overwritten the next time the plugin is updated, and it never reaches other
  teammates regardless, since it only exists on that one installed copy. If you can tell you're
  running from an installed copy (not this source repo) and find something worth keeping, say so
  explicitly and suggest it be reported back to whoever maintains the plugin source, rather than
  writing it into a location that may not persist or propagate.
- **`${CLAUDE_PLUGIN_DATA}`** (a separate variable — the plugin's own persistent-across-updates data
  directory, machine-local) is the right place for genuinely per-machine scratch notes that shouldn't
  ship to the team at all. That should be rare for this skill — the whole point of this layer is
  knowledge the *team* benefits from, not one installation's private notes. Default to
  `Knowledge/Application/` inside the plugin; only reach for `${CLAUDE_PLUGIN_DATA}` if a finding is
  genuinely specific to one team member's own local setup.

Each file's frontmatter: `name`, `description` (one line, used to decide relevance), and freeform body
content — a fact, then **Why:** (what made this hard to find), then **How to apply:** (when it should
change future behavior), same structure as before. Type the finding in the filename/topic, not a
formal `type:` field — `known-defects`, `naming-traps`, `shared-data-model`, `docs-status` are the
categories seen so far, add new topic files as needed rather than cramming unrelated findings into one.

**What does NOT belong here**: rule lists, ruleset stacks, Feature-node counts, case-type inventories
— anything a single live `neo4j_query`/`search_features` call re-derives. If it's cheap to re-verify,
verifying it live is more trustworthy than a stale snapshot; only save the things that were
*expensive* or *surprising* to find.

## Procedure

**Before starting app-specific work**: check `${CLAUDE_PLUGIN_ROOT}/Knowledge/Application/<AppName>/`
for existing files relevant to the task (a defect that might explain a symptom, a naming trap that
might cause a false disambiguation, a known data-sharing relationship that might explain an
unexpected cross-app hit). Treat a hit as a lead to confirm, not a fact to act on unverified — if a
file names a specific rule/pzInsKey, check it's still there before building a diagnosis on top of it;
these files aren't re-verified automatically and can go stale as the graph changes.

**After finding something non-obvious and verified**: write it to
`${CLAUDE_PLUGIN_ROOT}/Knowledge/Application/<AppName>/app-<name>-<topic>.md` (new file per topic, or
append to an existing one if the topic matches) — fact, then **Why:**, then **How to apply:**. Link
back to the skill/session that found it if useful context (e.g. "found during a `pega-code-review`
pass on X"). **Then add (or update) that file's entry in
`Knowledge/Application/manifest.json`** — `name`, `description`, `path` (relative to
`Knowledge/Application/`, e.g. `OWLM/app-owlm-known-defects.md`), `category: "knowledge"`,
`prompt: false`. This is what makes the finding reachable through the Rule Authoring plugin's own
`list-skills`/`search-skills`/`get-skill` when the optional cross-catalogue wiring is active
(`pega-companion`'s setup Step 7) — **confirmed live 2026-08-18**: without a manifest, the loader
silently drops every file here with `Ignoring manifestless markdown '<path>' because it is not under
a skill root with SKILL.md` (no error, just silence); with the manifest, all of them load cleanly. A
knowledge file that exists but isn't in the manifest is invisible to that catalogue even though it's
still readable directly from disk — don't skip this step.

## Populated example: OWLM
First populated 2026-08-17, from findings made across a session's `pega-code-review`,
`pega-impact-analysis`, and `pega-log-diagnosis` end-to-end tests (originally captured in Claude
Code's personal memory system, then moved into the plugin's own `Knowledge/` folder so they'd actually
ship with the plugin). See `Knowledge/Application/OWLM/`:
- `app-owlm-known-defects.md` — a real, currently-unfixed CRITICAL defect found during code review.
- `app-owlm-naming-traps.md` — name-collision and app-attribution traps confirmed live.
- `app-owlm-shared-data-model.md` — cross-app data/ruleset sharing specific to OWLM.
- `app-owlm-docs-status.md` — status of the full KT-driven documentation (not yet run).

These are a starting point, not a complete picture — the full `pega-doc-generator` pass for OWLM
hasn't been run yet (see the docs-status file). Extend these files (or add new `app-owlm-*` ones) as
more OWLM-specific findings turn up in future diagnosis/review/analysis work, rather than starting a
parallel note-taking convention. When work touches a new app for the first time, create its folder
(`Knowledge/Application/<NewApp>/`) the same way rather than waiting for a dedicated setup step.

## What NOT to do
- Don't write per-app findings to Claude Code's personal `~/.claude/projects/.../memory/` system —
  it's machine/session-local and will not reach any other team member who installs this plugin. That
  was this skill's original design and it was wrong for a team-distributed plugin; don't regress to it.
- Don't duplicate re-derivable graph facts here (rule counts, ruleset stacks, Feature-node
  inventories) — that's what makes this layer stale and untrustworthy; keep it to genuinely hard-won,
  non-obvious findings only.
- Don't treat a knowledge-file hit as ground truth without re-verifying the specific claim if the task
  is about to act on it (ship a fix, block a promotion) — these files aren't automatically
  re-validated against the live graph.
- Don't write into `${CLAUDE_PLUGIN_ROOT}` from what you can tell is an installed (not source-tree)
  copy of the plugin expecting it to reach the team or survive an update — it may do neither. Flag the
  finding back to the plugin's maintainers instead.
- Don't use this skill as a substitute for actually running `pega-doc-generator` when the user wants
  the full KT-style documentation — this is the cheap interim layer, not the real thing.
- Don't write a new knowledge file without also adding its `Knowledge/Application/manifest.json`
  entry — confirmed live, an un-manifested file is silently invisible to the Rule Authoring plugin's
  catalogue even though it's still readable directly from disk.
