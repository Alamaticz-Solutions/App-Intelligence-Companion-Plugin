#!/usr/bin/env node
// SessionStart hook — reinforces Companion's core, non-negotiable invariants every session,
// not just in skill prose: (1) this plugin never authors a Pega rule directly, and (2) the
// pds-pega-data-access skill governs routing for every live Pega lookup and must be loaded
// before the first pega-infinity-authoring tool call or Pega question, not discovered reactively
// mid-task. Purely informational, never blocks — reads stdin only to stay well-formed, ignores
// its content.

process.stdin.resume();
process.stdin.on("end", () => {
  process.stderr.write(
    "[App Intelligence Companion] Read-only mode: this plugin never authors Pega rules or " +
      "advances a case directly. Every proposed change hands off to the Pega Infinity Authoring " +
      "plugin's methodology-change-request-workflow for the actual write.\n"
  );

  const additionalContext =
    "Before calling any pega-infinity-authoring tool, or answering any Pega rule/case/branch/" +
    "data-page question (even one that doesn't name a tool), load the pds-pega-data-access skill " +
    "first. It governs routing between the graph (App Intelligence Companion) and live Pega " +
    "(Rule Authoring plugin), and documents that neither the app roster nor any environment name " +
    "should ever be assumed from memory — always re-derive it live. Do not skip this and improvise " +
    "with a data-page call or a guessed application/environment name.";

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext,
      },
    })
  );
  process.exit(0);
});
process.stdin.on("error", () => process.exit(0));
