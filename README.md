# App Intelligence Companion Plugin

A read-only, graph-grounded intelligence layer for Pega Infinity applications — diagnosis, impact
analysis, code review, design precedent, and per-application knowledge — built on top of the PDS
Neo4j knowledge graph (via **PDS MCP**). It never authors a Pega rule itself; every proposed change
terminates in a handoff to the [**Pega Infinity Authoring Plugin**](../Pega%20Infinity%20Authoring%20Plugin/)'s
governed `methodology-change-request-workflow` (branch isolation, mandatory human review, audit
trail). Companion and Authoring are meant to be installed together — see the
[Full Setup Guide (Windows)](#full-setup-guide-windows) below to get both running.

Internal Alamaticz Solutions tooling. Not published to a public marketplace, but any teammate with
repo access can install it straight from git — no manual cloning or file copying required. Source
lives at
[`Alamaticz-Solutions/App-Intelligence-Companion-Plugin`](https://github.com/Alamaticz-Solutions/App-Intelligence-Companion-Plugin).

## Prerequisites

- [Claude Code](https://claude.com/claude-code) CLI installed.
- Git access to `Alamaticz-Solutions/App-Intelligence-Companion-Plugin` (HTTPS auth or an SSH key
  registered with GitHub).

## Install From This Repository

This repo carries its own self-contained marketplace at `.claude-plugin/marketplace.json`, so Claude
Code can add it as a marketplace source directly from the git URL — the same pattern Pega uses for
`infinity-ai-plugins`, just pointed at our repo.

```bash
claude plugin marketplace add https://github.com/Alamaticz-Solutions/App-Intelligence-Companion-Plugin.git
claude plugin install app-intelligence-companion@app-intelligence-companion-marketplace
```

Or with an SSH git URL:

```bash
claude plugin marketplace add git@github.com:Alamaticz-Solutions/App-Intelligence-Companion-Plugin.git
claude plugin install app-intelligence-companion@app-intelligence-companion-marketplace
```

After install, restart your Claude Code session (or run `/reload-plugins`) so the plugin's skills,
agents, and hooks load.

> [!TIP]
> On Windows, adding the marketplace can fail with a "Filename too long" error. If that happens,
> enable Git long-path support and retry:
> ```bash
> git config --system core.longpaths true
> ```

## Update An Existing Install

When this repo gets a newer plugin build, refresh from the same marketplace source:

```bash
claude plugin marketplace update app-intelligence-companion-marketplace
claude plugin update app-intelligence-companion@app-intelligence-companion-marketplace
```

Then run `/reload-plugins` or start a new Claude Code session.

## Full Setup Guide (Windows)

Step-by-step instructions for getting Companion fully running in Claude Code on Windows, including
the Pega Infinity Authoring Plugin dependency and the PDS MCP connection. Steps 1–2 and 5–7 below are
Windows-specific (`PowerShell`, `[Environment]::SetEnvironmentVariable`); Steps 3–4 and the
Troubleshooting table apply on any OS with the commands adapted accordingly.

Companion is the read-only, graph-grounded analysis layer. It assumes the **Pega Infinity Authoring
Plugin** is already installed and authenticated on your machine — several Companion skills (live
gap-fill, data-page access, the ChangeRequest handoff) call into it directly. Set that up first if you
haven't.

**Contents:** [Prerequisites](#full-guide-prerequisites) ·
[Step 1: Verify Node.js / npx](#step-1-verify-nodejs--npx) ·
[Step 2: Confirm the Authoring Plugin is already set up](#step-2-confirm-the-authoring-plugin-is-already-set-up) ·
[Step 3: Get the plugin folder onto your machine](#step-3-get-the-plugin-folder-onto-your-machine) ·
[Step 4: Load the plugin in Claude Code](#step-4-load-the-plugin-in-claude-code) ·
[Step 5: Provide the PDS MCP URL](#step-5-provide-the-pds-mcp-url) ·
[Step 6: Verify the connection](#step-6-verify-the-connection) ·
[Step 7 (optional): Surface Companion's skills through the Authoring Plugin's own catalogue](#step-7-optional-surface-companions-skills-through-the-authoring-plugins-own-catalogue) ·
[Troubleshooting](#troubleshooting)

### Full-guide prerequisites

Before starting, ensure you have:
* Windows 10/11 (for the steps that use PowerShell/`[Environment]::SetEnvironmentVariable` below;
  other steps work on any OS).
* [Claude Code CLI](https://code.claude.com/) installed and already authenticated (`claude --version`
  works).
* Node.js (v18+) installed — Claude Code does **not** bundle its own Node runtime; this plugin's MCP
  connection needs `npx` on your `PATH` separately.
* The **Pega Infinity Authoring Plugin** already installed and authenticated (see its own setup doc)
  — Companion is not a substitute for it and depends on it for any live Pega access.
* Access to this repository (a git clone, or the OneDrive-synced project folder, if that's how your
  team distributes it).
* **This client's PDS MCP Lambda Function URL** — ask whoever administers the PDS MCP deployment for
  your team; it's not something you can discover from inside the plugin itself.

### Step 1: Verify Node.js / npx

The plugin's own MCP server is reached via `npx -y mcp-remote <url>` (see `.mcp.json`), so `npx` needs
to work before Claude Code can start it. Open PowerShell and run:
```powershell
npx --version
```
If this fails, install Node.js (v18+) first — [nodejs.org](https://nodejs.org) or
`winget install OpenJS.NodeJS.LTS` — then open a **new** PowerShell window and re-check.

### Step 2: Confirm the Authoring Plugin is already set up

If you haven't already run through the Authoring Plugin's own setup doc, do that first — Companion is
designed to hand off every actual Pega write, and several of its skills (`pds-pega-data-access`,
`pega-live-gap-fill`, `pega-companion-seam`'s Review-stage report injection) call the Authoring
Plugin's own tools directly. Companion without it installed will still answer graph-only questions,
but anything requiring live Pega access (a stale/missing graph entry, a ChangeRequest handoff, a
data-page lookup) won't work.

**Hard blocker, confirmed live 2026-08-18 — don't skip this.** The Authoring Plugin's own `.mcp.json`
references `${PEGA_LOCAL_SKILLS_PATH}` with no default value. If that variable has **no value at all**
in the environment, Claude Code's own MCP config validator refuses to start the Authoring Plugin's
MCP server outright: `Plugin MCP server error - mcp-config-invalid: MCP server Pega Infinity
Authoring invalid: Missing environment variables: PEGA_LOCAL_SKILLS_PATH`. Confirmed via a fresh
headless `claude --plugin-dir` launch — every one of the Authoring Plugin's tools (including the ones
Companion's own skills depend on) is unavailable in that state, with no other error surfaced anywhere
in the session. This is a defect in the Authoring Plugin's own `.mcp.json`, not something Companion
causes or can fix — but you'll hit it regardless of which plugin you think you're debugging.

**Fix**: set `PEGA_LOCAL_SKILLS_PATH` to **any non-empty value** — confirmed live, an *empty* string
still trips the same `mcp-config-invalid` error (Claude Code's validator treats empty the same as
unset), but any non-empty placeholder satisfies it and the server connects cleanly
(`Successfully connected (transport: stdio)`, confirmed by forcing a real tool call through it). The
jar itself never reads this variable name (Step 7 below covers the one it actually reads,
`PEGA_CUSTOM_SKILLS_PATHS`), so the placeholder's actual content is irrelevant — it only has to be
non-empty:
```powershell
[Environment]::SetEnvironmentVariable("PEGA_LOCAL_SKILLS_PATH", "unused", "User")
```
**Then open a genuinely new terminal window** — confirmed this session: a `[User]`-scoped
`SetEnvironmentVariable` call does **not** reliably propagate to process trees already running, or to
new processes spawned from a shell/session that started before the change (multiple fresh
`claude --plugin-dir` launches from an already-running PowerShell/automation session still saw the
variable as unset after it was persisted). If a fresh launch still shows the same
`mcp-config-invalid` error, the fix hasn't propagated yet — close everything and start a brand new
terminal (or sign out/in) rather than assuming the fix didn't work.

### Step 3: Get the plugin folder onto your machine

**Preferred — clone the git repo** (real version history, easy to pull updates):
```powershell
git clone https://github.com/Alamaticz-Solutions/App-Intelligence-Companion-Plugin.git
```
Note the full path to the cloned folder; you'll need it in Step 4.

**Alternative — a synced copy** (e.g. OneDrive). If you're reading this file from inside a
synced project folder, you already have a working copy that stays current automatically, and
everything below works identically against either location. Note its full path if you're using this
path instead of a clone.

**A note on every path below**: the rest of this guide uses an example OneDrive path
(`C:\Users\<you>\OneDrive - Alamaticz Solutions\Desktop\Projects - Alamaticz\App Intelligence
Companion Plugin`) in its example commands. If you cloned the git repo instead, substitute wherever
you cloned it to — every command works identically either way, only the path string changes.

### Step 4: Load the plugin in Claude Code

**For a single session** — a fresh headless `claude --plugin-dir` run against this exact plugin
folder loads every skill and agent correctly by name, the `SessionStart` hook fires, and (once the
Step 2 `PEGA_LOCAL_SKILLS_PATH` fix is applied) the Authoring Plugin's own MCP server connects
successfully through it:
```powershell
claude --plugin-dir "C:\Users\<you>\OneDrive - Alamaticz Solutions\Desktop\Projects - Alamaticz\App Intelligence Companion Plugin"
```
This loads the plugin's skills, agents, and MCP server for that session only — you'll need to repeat
the flag (or use the alias below) every time you launch Claude Code.

**To avoid retyping it every session**, add a PowerShell profile alias/function
(`notepad $PROFILE` to edit yours):
```powershell
function claude-companion { claude --plugin-dir "C:\Users\<you>\OneDrive - Alamaticz Solutions\Desktop\Projects - Alamaticz\App Intelligence Companion Plugin" @args }
```
Then launch with `claude-companion` instead of `claude` whenever you want this plugin active.

**A persistent, no-flag install** — use the marketplace commands from
[Install From This Repository](#install-from-this-repository) above instead of `--plugin-dir`. Once
installed that way, the plugin is active in every `claude` session automatically. To check it's
there: `claude plugin list`. To remove it later:
`claude plugin uninstall app-intelligence-companion@app-intelligence-companion-marketplace`.

### Step 5: Provide the PDS MCP URL

The plugin declares one required setting, `pds_mcp_url` (see `.claude-plugin/plugin.json`'s
`userConfig`), which feeds into `.mcp.json`'s `${user_config.pds_mcp_url}` substitution.

**There is no automatic prompt.** Installing or loading the plugin without setting this value
succeeds silently and just leaves the PDS MCP tools unusable; you have to set it yourself, one of two
ways:

- **If you installed via the marketplace**, pass it at install time:
  ```powershell
  claude plugin install app-intelligence-companion@app-intelligence-companion-marketplace --config pds_mcp_url=<your-client-pds-mcp-url> -y
  ```
  or, in an interactive session, run `/plugin configure app-intelligence-companion@app-intelligence-companion-marketplace`.
- **If you're using `--plugin-dir`/the alias**, run `/plugin configure app-intelligence-companion@app-intelligence-companion-marketplace`
  in an interactive session the first time.

Have your client's PDS MCP Lambda Function URL (see Prerequisites above) ready either way. The value
is stored in your own `~/.claude/settings.json`, not in this shared plugin folder — each team member
sets their own.

**Worth knowing**: if you launch Claude Code non-interactively (`claude -p "..."`) against this plugin
before `pds_mcp_url` is set, you won't get a clear error either — the `PDS MCP` server just sits in
"still connecting" indefinitely and its tools never become available. If PDS MCP tools seem to
silently do nothing, check whether `pds_mcp_url` is actually set before assuming a connectivity issue.

### Step 6: Verify the connection

Ask Claude something that requires the PDS MCP connection, for example:
```text
Which Pega applications does PDS MCP currently have graph coverage for?
```
or, more specifically:
```text
Run a neo4j_query to list distinct r.environment values across the graph.
```
**Expected outcome**: a real list of application/environment names (not a "tool not found" or
connection error). If it works, also confirm the plugin's skills/agents are visible by asking
`"what Companion skills are available?"` — you should see `pega-companion-seam`, `pega-impact-
analysis`, `pega-code-review`, etc. in the response.

### Step 7 (optional): Surface Companion's skills through the Authoring Plugin's own catalogue

The Authoring Plugin's MCP server (`infinity-rules-mcp.jar`) can load an external skill pack into
its own `list-skills` / `search-skills` / `get-skill` tools, alongside its bundled 50 — confirmed
live 2026-08-18 by running the jar standalone with the variable set (`Loaded 832 effective skills
from 2 source(s)`, `skills.custom-paths = <path>`, zero errors, zero collisions). This makes
Companion's specialist skills discoverable through the *Authoring* agent's own graph-ranked search,
not just Companion's native Claude Code loading.

This is **optional** — Companion's skills already work today via Claude Code's normal plugin skill
discovery, with or without this step. Do this if you want the Authoring Plugin's own agent to be
able to find Companion's skills when it searches its catalogue.

**The Authoring Plugin's shipped `.mcp.json` wires the wrong environment variable name**
(`PEGA_LOCAL_SKILLS_PATH`, which the jar no longer reads) — this has been reported upstream, but
until it's fixed, set the *live* variable directly at the OS level, since Claude Code has no way to
inject an env var into another plugin's MCP subprocess from inside Companion itself:

```powershell
[Environment]::SetEnvironmentVariable(
  "PEGA_CUSTOM_SKILLS_PATHS",
  "C:\Users\<you>\OneDrive - Alamaticz Solutions\Desktop\Projects - Alamaticz\App Intelligence Companion Plugin\claude-skills,C:\Users\<you>\OneDrive - Alamaticz Solutions\Desktop\Projects - Alamaticz\App Intelligence Companion Plugin\Knowledge\Application",
  "User"
)
```
The second, comma-separated path is optional — it also surfaces the per-application `Knowledge/`
notes (`pega-app-knowledge`'s write-back target) through the same catalogue. Comma-separated
multi-path lists are confirmed live to work (2026-08-18, 3 sources loaded cleanly). Each side needs
its own `manifest.json` to load reliably: `claude-skills/manifest.json` already covers the 13
specialist skills; `Knowledge/Application/manifest.json` covers today's 4 OWLM knowledge files and
must gain one entry per new file going forward (`pega-app-knowledge`'s own write-back procedure now
includes this step) — **confirmed live**: a knowledge `.md` file with no `manifest.json` entry is
silently dropped (`Ignoring manifestless markdown '...' because it is not under a skill root with
SKILL.md`), since none of these files are literally named `SKILL.md`.

Then **close everything and open a genuinely new terminal window** before relaunching Claude Code —
confirmed live 2026-08-18: restarting *within* an already-running terminal/automation session is not
enough, since a `[User]`-scoped env var change doesn't reliably reach new processes spawned from a
shell that predates the change (same caveat as Step 2's `PEGA_LOCAL_SKILLS_PATH` fix above). A fresh
top-level terminal is the reliable way to confirm the change actually took.
To verify it took: ask the Authoring Plugin's agent to `search-skills` for something Companion
covers (e.g. `"blast radius impact analysis before changing a rule"`) and check whether
`pega-impact-analysis` or another Companion skill appears in the result. You can also check
`logs/infinity-rules-mcp.log` in the Authoring Plugin's own working directory for
`skills.custom-paths = ...` (confirms it bound) and `Loaded N effective skills from 2 source(s)`.

A `claude-skills/manifest.json` is already included in this plugin, so the Authoring Plugin loads
exactly Companion's 13 primary skills under this path (not every stray file in `references/`/
`examples/` subfolders) — confirmed live 2026-08-18: 833 = 820 base + 13, zero errors, zero
collisions, versus 845 (noisy recursive discovery of every reference file as its own skill) without
a manifest.

### Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| `npx: command not found` / `npx --version` fails | Node.js not installed, or PATH not refreshed | Install Node.js LTS, then open a **new** PowerShell window. |
| Companion's skills/agents don't appear at all | `--plugin-dir` path is wrong, or the flag wasn't used this session | Double-check the exact path (copy it from File Explorer's address bar), re-run with `--plugin-dir`. |
| PDS MCP tools time out or say "not connected" | `pds_mcp_url` wasn't set, or points at the wrong client's Lambda | Re-check Step 5; confirm the URL with your PDS MCP administrator. |
| PDS MCP shows "still connecting" and never resolves, especially in a scripted/`-p` session | Confirmed 2026-08-17: this is exactly what happens when `pds_mcp_url` isn't set and Claude Code isn't running interactively — there's no separate error, just a permanent non-response | Set `pds_mcp_url` (Step 5) before running non-interactively; don't assume it's a network/Lambda issue first. |
| A Companion skill tries to call an Authoring-Plugin tool and fails | Authoring Plugin isn't installed/authenticated in this session | Complete the Authoring Plugin's own setup first (Step 2 above), then retry. |
| **Every Authoring-Plugin tool is unavailable, `Plugin MCP server error - mcp-config-invalid: ... Missing environment variables: PEGA_LOCAL_SKILLS_PATH`** | `PEGA_LOCAL_SKILLS_PATH` has no value anywhere in the environment — confirmed live 2026-08-18, this is a hard blocker in the Authoring Plugin's own `.mcp.json`, not a Companion issue | See Step 2's hard-blocker box. Set it to any **non-empty** value (an empty string does not work — confirmed both ways), then open a genuinely new terminal window. |
| `switch-application-context` / live Pega calls say an app isn't reachable | Your operator account doesn't have access to that application | Expected, not a bug — `pega-live-gap-fill` checks a `switchable` flag per app; not every app is available to every operator. |
| A `[User]`-scoped env var fix (`PEGA_LOCAL_SKILLS_PATH`, `PEGA_CUSTOM_SKILLS_PATHS`) doesn't seem to take effect | Windows doesn't reliably propagate a persisted `User` env var change to process trees that were already running — confirmed live 2026-08-18, multiple fresh `claude --plugin-dir` launches from an already-open terminal still saw the old value | Close the terminal entirely and open a brand new one (or sign out/in) rather than just re-running the command in the same window. |

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
claude-skills/manifest.json    — explicit catalogue for the Authoring Plugin's optional skill-pack extension point (Step 7 of the Full Setup Guide above)
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
