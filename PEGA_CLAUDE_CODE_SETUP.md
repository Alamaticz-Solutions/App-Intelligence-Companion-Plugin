# App Intelligence Companion Plugin – Claude Code Setup Guide (Windows)

Step-by-step instructions for getting the **App Intelligence Companion Plugin** running in
**Claude Code**, for internal Alamaticz Solutions team members. This plugin is not published to a
public marketplace — it's shared internally, currently via this OneDrive-synced folder.

Companion is the read-only, graph-grounded analysis layer. It assumes the
**[Pega Infinity Authoring Plugin](../Pega%20Infinity%20Authoring%20Plugin/PEGA_CLAUDE_CODE_SETUP.md)**
is already installed and authenticated on your machine — several Companion skills (live gap-fill,
data-page access, the ChangeRequest handoff) call into it directly. Set that up first if you haven't.

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Step 1: Verify Node.js / npx](#step-1-verify-nodejs--npx)
3. [Step 2: Confirm the Authoring Plugin is already set up](#step-2-confirm-the-authoring-plugin-is-already-set-up)
4. [Step 3: Get the plugin folder onto your machine](#step-3-get-the-plugin-folder-onto-your-machine)
5. [Step 4: Load the plugin in Claude Code](#step-4-load-the-plugin-in-claude-code)
6. [Step 5: Provide the PDS MCP URL](#step-5-provide-the-pds-mcp-url)
7. [Step 6: Verify the connection](#step-6-verify-the-connection)
8. [Step 7 (optional): Surface Companion's skills through the Authoring Plugin's own catalogue](#step-7-optional-surface-companions-skills-through-the-authoring-plugins-own-catalogue)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:
* Windows 10/11.
* [Claude Code CLI](https://code.claude.com/) installed and already authenticated (`claude --version`
  works).
* Node.js (v18+) installed — Claude Code does **not** bundle its own Node runtime; this plugin's MCP
  connection needs `npx` on your `PATH` separately.
* The **Pega Infinity Authoring Plugin** already installed and authenticated (see its own setup doc,
  linked above) — Companion is not a substitute for it and depends on it for any live Pega access.
* This shared project folder synced/available on your machine (it already is, if you're reading this
  from the OneDrive-synced `Projects - Alamaticz` directory).
* **This client's PDS MCP Lambda Function URL** — ask whoever administers the PDS MCP deployment for
  your team; it's not something you can discover from inside the plugin itself.

---

## Step 1: Verify Node.js / npx

The plugin's own MCP server is reached via `npx -y mcp-remote <url>` (see `.mcp.json`), so `npx` needs
to work before Claude Code can start it. Open PowerShell and run:
```powershell
npx --version
```
If this fails, install Node.js (v18+) first — [nodejs.org](https://nodejs.org) or
`winget install OpenJS.NodeJS.LTS` — then open a **new** PowerShell window and re-check.

---

## Step 2: Confirm the Authoring Plugin is already set up

If you haven't already run through `Pega Infinity Authoring Plugin`'s own setup doc
(`PEGA_CLAUDE_CODE_SETUP.md` in that project), do that first — Companion is designed to hand off every
actual Pega write, and several of its skills (`pds-pega-data-access`, `pega-live-gap-fill`,
`pega-companion-seam`'s Review-stage report injection) call the Authoring Plugin's own tools directly.
Companion without it installed will still answer graph-only questions, but anything requiring live
Pega access (a stale/missing graph entry, a ChangeRequest handoff, a data-page lookup) won't work.

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
jar itself never reads this variable name (§ Step 7 below covers the one it actually reads,
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

---

## Step 3: Get the plugin folder onto your machine

If you're reading this file from inside the OneDrive-synced `Desktop\Projects - Alamaticz\App
Intelligence Companion Plugin` folder, you already have it — OneDrive sync keeps it current. Note the
full path; you'll need it in Step 4. If this project moves to a shared git repo instead, `git clone`
it and use that local path in place of the OneDrive path below.

---

## Step 4: Load the plugin in Claude Code

**For a single session (confirmed working end-to-end 2026-08-17 — this exact command was run headless
against this exact plugin folder and all 11 skills + 6 agents loaded correctly. Two more skills
(`pega-companion`, `pega-cross-environment`) and a `manifest.json` were added 2026-08-18, structurally
identical to the original 11 — not yet re-confirmed with a fresh `--plugin-dir` run, but nothing about
the loading mechanism changed):**
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

**A persistent, no-flag install — confirmed working end-to-end 2026-08-18** — via
`.claude-plugin/marketplace.json` (already in this repo, self-contained: it registers this same
folder as its own single-plugin marketplace). Use the scriptable CLI (`claude plugin ...`), not the
interactive `/plugin` slash commands — both work, but the CLI form below is what was actually tested
and is easier to copy-paste correctly:
```powershell
claude plugin marketplace add "C:\Users\<you>\OneDrive - Alamaticz Solutions\Desktop\Projects - Alamaticz\App Intelligence Companion Plugin"
claude plugin install app-intelligence-companion@app-intelligence-companion-marketplace --config pds_mcp_url=<your-client-pds-mcp-url> -y
```
Once installed this way, the plugin is active in every `claude` session automatically — no flag or
alias needed. To check it's there: `claude plugin list`. To remove it later:
`claude plugin uninstall app-intelligence-companion@app-intelligence-companion-marketplace`.

---

## Step 5: Provide the PDS MCP URL

The plugin declares one required setting, `pds_mcp_url` (see `.claude-plugin/plugin.json`'s
`userConfig`), which feeds into `.mcp.json`'s `${user_config.pds_mcp_url}` substitution.

**Confirmed mechanism (tested 2026-08-18) — there is no automatic prompt.** Installing or loading the
plugin without setting this value succeeds silently and just leaves the PDS MCP tools unusable; you
have to set it yourself, one of two ways:

- **If you installed via the marketplace (Step 4's persistent option)**, pass it at install time:
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

---

## Step 6: Verify the connection

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

---

## Step 7 (optional): Surface Companion's skills through the Authoring Plugin's own catalogue

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

---

## Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| `npx: command not found` / `npx --version` fails | Node.js not installed, or PATH not refreshed | Install Node.js LTS, then open a **new** PowerShell window. |
| Companion's skills/agents don't appear at all | `--plugin-dir` path is wrong, or the flag wasn't used this session | Double-check the exact path (copy it from File Explorer's address bar), re-run with `--plugin-dir`. |
| PDS MCP tools time out or say "not connected" | `pds_mcp_url` wasn't set, or points at the wrong client's Lambda | Re-check Step 5; confirm the URL with your PDS MCP administrator. |
| PDS MCP shows "still connecting" and never resolves, especially in a scripted/`-p` session | Confirmed 2026-08-17: this is exactly what happens when `pds_mcp_url` isn't set and Claude Code isn't running interactively — there's no separate error, just a permanent non-response | Set `pds_mcp_url` (Step 5) before running non-interactively; don't assume it's a network/Lambda issue first. |
| A Companion skill tries to call an Authoring-Plugin tool and fails | Authoring Plugin isn't installed/authenticated in this session | Complete `Pega Infinity Authoring Plugin`'s own setup first (Step 2 above), then retry. |
| **Every Authoring-Plugin tool is unavailable, `Plugin MCP server error - mcp-config-invalid: ... Missing environment variables: PEGA_LOCAL_SKILLS_PATH`** | `PEGA_LOCAL_SKILLS_PATH` has no value anywhere in the environment — confirmed live 2026-08-18, this is a hard blocker in the Authoring Plugin's own `.mcp.json`, not a Companion issue | See Step 2's hard-blocker box. Set it to any **non-empty** value (an empty string does not work — confirmed both ways), then open a genuinely new terminal window. |
| `switch-application-context` / live Pega calls say an app isn't reachable | Your operator account doesn't have access to that application | Expected, not a bug — `pega-live-gap-fill` checks a `switchable` flag per app; not every app is available to every operator. |
| A `[User]`-scoped env var fix (`PEGA_LOCAL_SKILLS_PATH`, `PEGA_CUSTOM_SKILLS_PATHS`) doesn't seem to take effect | Windows doesn't reliably propagate a persisted `User` env var change to process trees that were already running — confirmed live 2026-08-18, multiple fresh `claude --plugin-dir` launches from an already-open terminal still saw the old value | Close the terminal entirely and open a brand new one (or sign out/in) rather than just re-running the command in the same window. |

---
*Document prepared for the Alamaticz Solutions Pega development team.*
