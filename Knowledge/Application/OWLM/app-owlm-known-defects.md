---
name: app-owlm-known-defects
description: "Known, currently-unfixed live defects found in OWLM rules during code review / impact analysis passes — check before diagnosing a related symptom."
metadata: 
  node_type: memory
  type: project
  originSessionId: be6f6b9d-3b3a-4878-8c3a-2ac138455438
  modified: 2026-08-17T17:21:19.519Z
---

## Stale ExpressionBuilder cache in `PopulateScreenInstructions` (Data Transform, OWLM)

All 6 `WHEN` branches of `PopulateScreenInstructions` (`pzInsKey`: `RULE-OBJ-MODEL PDS-OWLM-WORK
POPULATESCREENINSTRUCTIONS #20250117T114137.886 GMT`) carry the stale cached expression
`equalsIgnoreCase(.ServiceRequestType,"Add New Location(s)")` in their `ExpressionBuilder` cache —
including branch 1, whose own canonical condition is `"Add New Staff(s)"`. Confirmed live by fetching
the rule's own XML directly (`pega_get_rule_xml`), not just by confirming the dependency exists.

**Why:** Found during a `pega-code-review` pass on the caller `PopulateConfirmationMessage`, which
only checks G4 (does the outbound dependency exist) — not what's inside it. My own first-pass review
gave WARN and missed this; an independent second-pass review (`pega-independent-code-reviewer`
pattern) caught it and gave FAIL, initially reporting "5 of 6" branches affected — I re-verified
directly and found it's actually all 6, worse than first reported. This exact miss is why
`pega-code-review`'s Step 2 now requires fetching a business-logic-bearing dependency's own content
when fetch budget allows, not just confirming G4 shows it exists — see `pega-code-review`'s SKILL.md
Step 2 for the general rule this specific incident produced.

**How to apply:** If a diagnosis/review touches `PopulateConfirmationMessage`,
`PopulateScreenInstructions`, or anything else in OWLM that calls `PopulateScreenInstructions`,
treat this as a live, real, currently-unfixed defect — not a false positive to re-litigate. If a
symptom looks like "wrong screen instructions shown for a Staff service request," this is the first
thing to check. As of 2026-08-17 this has not been fixed in the live instance; re-verify via
`pega_get_rule_xml` before assuming it's since been patched.
