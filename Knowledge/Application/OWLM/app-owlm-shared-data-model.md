---
name: app-owlm-shared-data-model
description: "Cross-app data/ruleset sharing specific to OWLM — where a change in OWLM can have blast radius in a sibling app even though the rule itself lives in OWLM's own ruleset."
metadata: 
  node_type: memory
  type: project
  originSessionId: be6f6b9d-3b3a-4878-8c3a-2ac138455438
  modified: 2026-08-17T17:21:49.188Z
---

## `ProcessServiceRequestUpdate_MOD` — an OWLM-specific clone of a pattern shared with Office

OWLM carries a `_MOD` suffix variant (`ProcessServiceRequestUpdate_MOD`) of a Data Transform pattern
that also exists, separately, in `Office` — distinct `pzInsKey`s, not the same rule instance, but the
same authoring pattern cloned per app. `MOD` is OWLM's internal app label/case-ID prefix (confirmed
via `get-application`: `Label: MOD`), which is why OWLM-specific clones carry that suffix.

**Why:** Encountered while resolving which app a `ServiceRequest`-related rule belonged to — the
`_MOD` suffix is a reliable signal that a rule is the OWLM-specific clone of a shared pattern, not a
generic naming choice. Worth knowing before assuming a `_MOD`-suffixed rule is unique to OWLM with no
sibling-app counterpart to check for drift.

**How to apply:** If reviewing/changing a `_MOD`-suffixed OWLM rule, check whether `Office` (or other
apps) has a same-pattern counterpart without the suffix before assuming the logic is OWLM-only — the
two can drift independently since they're separate rule instances, which is itself worth flagging if
a fix in one should logically apply to the other.

## OWLM shares its location/office data model with sibling apps via `PDS-PBD-Data-*` classes

OWLM's location/office reference data (used by rules like `AddressInfo`) sits on shared
`PDS-PBD-Data-SharedData-Location`-family classes that other apps (`Deal`, `Office`) also read from —
not OWLM-private data, even when the consuming rule (e.g. a `Rule-UI-View`) is OWLM-specific.

**Why:** Relevant context for blast-radius reasoning — a change to the shared data model's shape
(not just to an OWLM-specific rule) can affect Deal/Office even if no OWLM rule directly references
them, which `pega-impact-analysis`'s rule-centric blast-radius queries won't surface on their own
since they trace `REFERENCES` edges between rules, not shared-class data-shape dependencies.

**How to apply:** If a proposed OWLM change touches the shape of shared `PDS-PBD-Data-*` data
(adding/removing/renaming a property, not just changing OWLM-side logic), treat this as a
class-level, not rule-level, blast-radius question — flag it as needing cross-app review even if
`pega-impact-analysis`'s standard `REFERENCES` traversal shows only OWLM callers.
