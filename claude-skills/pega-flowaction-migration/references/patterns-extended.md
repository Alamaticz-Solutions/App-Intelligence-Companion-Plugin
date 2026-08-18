# Extended Patterns E13–E20 — UI-behavior blockers

This file contains extended patterns E13–E20 representing UI-behavior blockers separate from the numbered patterns 1–23.

See `patterns-meta.md` for target platform details, environment mappings, footprint stats, and precedent grounding.
See `patterns-1-12.md` for Patterns 1–12.
See `patterns-13-23.md` for Patterns 13–23.

---

## Extended patterns E13–E20 (UI-behavior blockers, separate from the numbered 1–23)

Added 2026-07-16 from the section-analysis spec merge; **team ratification pending** — cite as
"E13"…"E20" so they can never be confused with the xlsx-derived 1–22 or 23. They capture UI-behavior
blockers the numbered list doesn't cover. Full analysis procedure: `ui-behavior-analysis.md`.

| # | Pattern | Standard replacement | Default classification | Status |
|---|---|---|---|---|
| E13 | Activities or Data Transforms invoked from UI control events or section refreshes (including `pyPreDataTransform` on a refresh action). **Field corrected 2026-07-17: the real, populated field is `pyActionSets` → `pyEvents`/`pyActions` — `pyBehaviors` (a separate, sibling field) has never been observed populated and should not be used as the check. Same underlying structure as Pattern 10.** | Relocate the logic to a supported boundary: data-page load, calculated field, assignment submit, or process step. | SUPPORTED_WITH_PROCESS_REDESIGN | `proposed` |
| E14 | Selection copies multiple properties through the UI (`pySetValueOnSelect` chains), especially hidden copies of internal identifiers (`.pyID`, `.pxObjClass`, `.pzInsKey`). | Single-record Data Reference; scalar mapping at a process boundary; never internal keys as business data. | SUPPORTED_WITH_DATA_MODEL_CHANGE | `proposed` |
| E15 | Custom HTML/JS: non-auto-generated sections, hand-written streams, legacy or custom `Rule-HTML-Property` controls, Run Script, DOM manipulation, inline `<style>` blocks. | Standard Constellation components; approved custom DX component only when a named business behavior proves them insufficient. | REQUIRES_CUSTOM_DX_COMPONENT or NOT_SUPPORTED_REMOVE_OR_REPLACE | `proposed` |
| E16 | UI-context-dependent conditions: Whens/expressions reading harness, portal, action name, `pxRequestor`, thread/temporary pages, or page existence. | Rewrite the condition against case data; move context decisions into the process. | SUPPORTED_WITH_RECONFIGURATION | `proposed` |
| E17 | Keyboard-, hover-, or double-click-specific triggers (`pyKeyCode` non-empty). | Remove; rely on standard interaction, unless a supported accessibility pattern exists. | NOT_SUPPORTED_REMOVE_OR_REPLACE | `proposed` |
| E18 | Business integrity dependent on client state: hidden values populated only by UI selection, logic dependent on refresh order, free-form input on reference lookups. | Declarative/process logic; validated Data References; explicit "not found" paths. | SUPPORTED_WITH_PROCESS_REDESIGN | `proposed` |
| E19 | Pixel-fidelity layout devices: freeform layouts, fixed pixel dimensions, inline styles, skin-specific formats. | Adopt Constellation design templates; do not reproduce layouts pixel-for-pixel. | SUPPORTED_WITH_RECONFIGURATION | `proposed` |
| E20 | Local actions / modal flows launched from controls. | Constellation optional actions (case-wide or assignment-level) or explicit process steps. | SUPPORTED_WITH_PROCESS_REDESIGN | `proposed` |

Also watch for real Constellation blockers that fit neither list — name these as their own
findings; don't force them into a number they don't match.

---

## Extended Pattern Promotion Pipeline

Extended patterns (prefixed with `E`) capture new architectural blockers surfaced during analysis that are not currently defined in the core team spreadsheet. They transition through a defined lifecycle:

```
[proposed] ──> Review by supervising developers ──> [approved] ──> Merge into main catalog (Pattern 24+)
                                                 └──> [deprecated] ──> Retired / Removed
```

### Lifecycle Status Definitions
* **`proposed`**: Documented by analysis subagents but pending formal ratification from the application architectural board.
* **`approved`**: Ratified by the architecture team. The recommended treatment is standard and is permitted to be included in build instruction planning.
* **`deprecated`**: Found to be inaccurate, duplicate, or handled via standard OOTB Pega upgrades. Not reported in migration plans.

### Promotion to Numbered Catalog
When a proposed pattern is **`approved`** and standard remediation tools are implemented, it is promoted to the core catalog (e.g. `Pattern 24`, `Pattern 25`, etc.) with its verbatim statement updated. The corresponding `E` code is retired to avoid duplicate reporting.

