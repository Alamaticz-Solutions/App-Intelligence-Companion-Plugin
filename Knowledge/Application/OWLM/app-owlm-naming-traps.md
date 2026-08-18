---
name: app-owlm-naming-traps
description: "Confirmed name-collision and app-attribution traps for OWLM — cases where a rule/case-type name looks like it belongs to OWLM but doesn't, or vice versa."
metadata: 
  node_type: memory
  type: project
  originSessionId: be6f6b9d-3b3a-4878-8c3a-2ac138455438
  modified: 2026-08-17T17:21:35.664Z
---

## "ServiceRequest" is not unique to OWLM

`ServiceRequest` is an OWLM case type, but a cross-app name search for "ServiceRequest" also
surfaces `ProcessServiceRequestUpdate`, which belongs to **`Deal`** (its own separately-named
`PDS-Deal-Work-ServiceRequest` case type), not OWLM.

**Why:** Confirmed live during `pega-log-diagnosis` end-to-end testing — assuming OWLM from the name
alone would have diagnosed the wrong application entirely. Only caught because the diagnosis
procedure's §0b requires an unscoped, cross-app graph search before assuming an app from a name.

**How to apply:** Never resolve "which app does this error/rule belong to" from name resemblance
alone. Run the cross-app search first (`pega-neo4j-cypher-querying` whole-graph guidance, no
`environment` filter) and check every environment that returns a hit — if more than one app has a
plausible match, that's a real ambiguity to surface, not something to silently pick OWLM for just
because the name is suggestive of it.

## "AddressInfo" exists in both OWLM and HRLifeImp — unrelated rules, same English-word name

`AddressInfo` exists as a `Rule-UI-View` on the `OWLM` ruleset (OWLM) and separately as a
`Rule-Obj-Property` on the `PDS` ruleset (`HRLifeImp`) — same name, different `rule_type`, different
`ruleset`, no actual relationship.

**Why:** Confirmed live during `pega-impact-analysis` testing — a naive "does this name exist in
another app" check would have inflated risk to HIGH/CRITICAL for what's actually a same-name
coincidence with zero real cross-app exposure.

**How to apply:** Before counting a same-name hit in another environment as genuine multi-app risk,
check `rule_type` and `ruleset` match (or that the ruleset is genuinely shared across both apps'
stacks) — see `pega-impact-analysis` Step 3 for the full disambiguation query. This applies to any
OWLM rule with a common, generic English-word name, not just `AddressInfo` specifically — treat a
name-only match against another app as a coincidence to disprove, not risk to assume.

## `UpdateStaffInformation` exists as both a FlowAction and a View, same name

OWLM has `UpdateStaffInformation` as both `Rule-Obj-FlowAction` and `Rule-UI-View` — a legitimate
FlowAction/View pairing sharing a name, not a duplicate/error. Don't treat a second hit for a name
already resolved as an ambiguity to flag — check `rule_type` first; a FlowAction+View pair sharing a
name is the normal Pega authoring pattern, not a collision.

**Why:** Encountered during `pega-impact-analysis`/`pega-code-review` disambiguation on OWLM rules —
worth distinguishing from the genuine collision cases above so a future search doesn't over-flag it.

**How to apply:** When disambiguating a name search that returns 2 rows for the same OWLM rule name,
check whether they're a `Rule-Obj-FlowAction` + `Rule-UI-View` pair before treating it as an
ambiguity — that pairing is expected, not a red flag.
