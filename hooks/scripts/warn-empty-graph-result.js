#!/usr/bin/env node
// PostToolUse hook on the PDS MCP neo4j_query tool. Encodes a discipline already documented
// (repeatedly, after real false negatives) across this plugin's skills — an empty blast-radius/
// closure result is a claim to double-check via pega-gap-coverage/pega-live-gap-fill, not
// evidence "nothing's there" — as an actual reminder that fires every time, not just prompt text
// the model might skim past under time pressure. Advisory only: never blocks, always exits 0.
// Field names for the tool's response are not confirmed against a live schema (this plugin's own
// MCP connection wasn't available to verify against during authoring — see PLUGIN_BUILD_CONTEXT.md)
// so this checks several plausible shapes and fails open (does nothing) if none match, rather than
// risk throwing on an unexpected shape.
//
// hooks.json's matcher name (mcp__plugin_app-intelligence-companion_PDS_MCP__neo4j_query) has
// stronger support as of 2026-08-18: the sibling Rule Authoring plugin was observed live in-session
// using the pattern mcp__plugin_<plugin.json name>_<mcp server key, spaces→underscores>__<tool>
// (confirmed: mcp__plugin_pega-infinity-authoring_Pega_Infinity_Authoring__list-skills). Applying
// that same rule to this plugin's plugin.json name (app-intelligence-companion) and .mcp.json server
// key ("PDS MCP") reproduces the matcher exactly as written below — analogical confirmation, not yet
// a literal same-plugin live observation. Re-confirm the very first time this plugin is actually
// loaded with a live PDS MCP connection and neo4j_query is called for real.

let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    const cypher = input?.tool_input?.cypher || "";
    const looksLikeClosureQuery = /REFERENCES/i.test(cypher);
    if (!looksLikeClosureQuery) return process.exit(0);

    const response =
      input?.tool_response ?? input?.tool_output ?? input?.response ?? input?.result ?? input?.output;
    const text = typeof response === "string" ? response : JSON.stringify(response ?? "");
    const looksEmpty =
      text === "[]" || text === "" || text === "null" || /^\s*\[\s*\]\s*$/.test(text);

    if (looksEmpty) {
      process.stderr.write(
        "[App Intelligence Companion] This REFERENCES query returned empty. Per pega-neo4j-cypher-" +
          "querying's own documented false negatives (queue-processor/job-scheduler roots, " +
          "FlowAction callers were missed by an unfiltered/miscategorized query before), don't " +
          "report this as a confirmed 'nothing found' yet — widen the ref_category filter, check " +
          "unfiltered, or hand off to pega-gap-coverage/pega-live-gap-fill first.\n"
      );
    }
  } catch {
    // Fail open — never block or error out on an unexpected input shape.
  }
  process.exit(0);
});
process.stdin.on("error", () => process.exit(0));
