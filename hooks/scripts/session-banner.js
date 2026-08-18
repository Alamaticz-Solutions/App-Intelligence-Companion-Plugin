#!/usr/bin/env node
// SessionStart hook — reinforces Companion's core, non-negotiable invariant every session,
// not just in skill prose: this plugin never authors a Pega rule directly. Purely informational,
// never blocks — reads stdin only to stay well-formed, ignores its content.

process.stdin.resume();
process.stdin.on("end", () => {
  process.stderr.write(
    "[App Intelligence Companion] Read-only mode: this plugin never authors Pega rules or " +
      "advances a case directly. Every proposed change hands off to the Pega Infinity Authoring " +
      "plugin's methodology-change-request-workflow for the actual write.\n"
  );
  process.exit(0);
});
process.stdin.on("error", () => process.exit(0));
