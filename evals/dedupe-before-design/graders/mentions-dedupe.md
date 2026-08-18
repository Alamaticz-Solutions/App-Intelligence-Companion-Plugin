---
type: regex
pattern: "(dedupe|duplicate|search-rules|search-features|already exists|already solved)"
flags: "i"
match: "contains"
target: "last_message"
---

The response should mention checking for an existing/duplicate rule (`pega-designer`'s semantic
dedupe check via `search-rules`/`search-features`) before proposing a brand-new one — this is what
prevents duplicate-rule sprawl, called out as a real design requirement in
`PLUGIN_BUILD_CONTEXT.md`'s Intake-stage architecture. Skipping straight to "here's the new rule
design" without this step is exactly the failure mode this eval checks for.
