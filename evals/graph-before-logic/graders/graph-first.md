---
type: regex
pattern: "(G1|G2|G3|G4|graph investigation|blast radius|dependency)"
flags: "i"
match: "contains"
target: "last_message"
---

The response should describe the mandatory graph investigation (`pega-code-review`'s G1-G4 steps —
blast radius, overrides, multi-app presence, business-impact grounding) as happening before or
alongside reading the rule's own logic, not skip straight to "read the rule and report a verdict."
This mirrors IdentifAI-Graph's own `code_review_agent.py` procedure and is the single check that
catches a rule that looks locally fine but has real, ungrounded blast radius.
