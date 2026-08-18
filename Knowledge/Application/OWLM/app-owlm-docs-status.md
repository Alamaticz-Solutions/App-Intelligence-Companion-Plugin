---
name: app-owlm-docs-status
description: "Where to find/generate OWLM's fuller documentation — status of the full pega-doc-generator KT-style pass, which has not yet been run for OWLM."
metadata: 
  node_type: memory
  type: reference
  originSessionId: be6f6b9d-3b3a-4878-8c3a-2ac138455438
  modified: 2026-08-17T17:21:57.427Z
---

`pega-doc-generator` (the 22-step Phase-1 autonomous application-review + document-generation skill,
producing a Platform-Agnostic Spec and a Pega Blueprint Spec) has **not** been run for OWLM as of
2026-08-17. Everything currently known about OWLM (see [[app-owlm-known-defects]],
[[app-owlm-naming-traps]], [[app-owlm-shared-data-model]]) comes from incidental findings during
`pega-log-diagnosis`/`pega-impact-analysis`/`pega-code-review` test passes, not a dedicated KT-style
review — treat it as partial, not comprehensive.

Live graph coverage for OWLM: Feature nodes exist for its case types (`ServiceRequest`,
`WebsiteRequest`, `Website`, `CustomerReview`, etc.), queue processors, and job schedulers — run
`MATCH (f:Feature) WHERE f.environment = 'OWLM' RETURN f.root_type, f.root_identifier, f.title` to
get the current list live rather than trusting a cached count here (that's exactly the kind of
re-derivable fact this per-app memory layer should not duplicate).

**How to apply:** If the user asks for OWLM's full application documentation (not just an answer to
a specific diagnosis/review/impact question), that's a `pega-doc-generator` run, not something these
project-type memory files already contain — point to running that skill rather than trying to
synthesize a full picture from these incidental notes alone.
