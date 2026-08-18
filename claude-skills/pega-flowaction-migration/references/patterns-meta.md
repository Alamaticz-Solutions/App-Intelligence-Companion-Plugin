# Pattern Catalog Meta-Information — target platform, environment mapping, footprint, and precedent grounding

This file contains cross-cutting metadata and guidelines for the Pega Traditional UI to Constellation migration design-pattern catalog. It is read by all analysis subagents.

## Target platform

- **Default target: Pega Infinity '25 (25.1.x)** — latest GA line as of July 2026 (25.1 GA
  2025-09-24; 25.1.1 2025-10-29; 25.1.2 2026-02-16). Infinity '26 is announced roadmap. Pin the
  actual target in the registry at Phase 0 (ask the user only if they signal a different one).
- **Version-sensitive claims**: whenever a finding rests on a Constellation capability limit
  (autocomplete display fields, multi-select, editable tables, reference-field presentation),
  verify against the local target platform capability cache: [constellation-capabilities-25.md](file:///c:/Users/ManojRajakumar/OneDrive%20-%20Alamaticz%20Solutions/Desktop/Projects%20-%20Alamaticz/Heritage%20Modernization/pega-flowaction-migration/references/constellation-capabilities-25.md). Only search docs.pega.com (WebSearch/WebFetch) if a capability is unlisted or target version changes, and update the local capabilities cache accordingly.
  Two '25 examples that already matter to recommendations here: reference fields can be configured as **cards** (single and multi-select variants), and a **Case Hierarchy widget** exists for the utilities pane — both strengthen the default preference for Data References over copied scalars.

## Environment name mapping (use these exact strings in PDS MCP tool calls)

**This table is the HRLifeImp engagement's own mapping, not a fixed list of apps every engagement
will have.** Every run resolves its own mapping fresh at Phase 0 (see §Precedent grounding below);
the four rows below are what that resolution produced for HRLifeImp, kept here as a worked
example and as the basis for this catalog's own evidence citations. The four reference/target apps
used for evidence in *this catalog* are indexed in the graph under these literal `environment`
values — **not** the shorter names people use in conversation:

| Conversational name | `environment` value in Neo4j / PDS MCP | Role |
|---|---|---|
| HRLife | **`HRLifeImp`** | Migration TARGET — classic UI Kit, the app actually being migrated |
| OARC | **`OARCAPP`** | Constellation-native reference app #1 |
| OWLM | **`OWLM`** | Constellation-native reference app #2 (`pyIsConstellationApp=true`) |
| odpipeline | **`ODPipeline`** | Cosmos/React app — modernized but NOT Constellation; "modern but not Constellation" comparison point |

Getting this wrong is the single most common cause of a false "403" or empty-result — always
confirm with `MATCH (r:Rule) RETURN DISTINCT r.environment, count(*)` if a query against an
assumed environment string comes back empty.

## Rule-type footprint (architectural fingerprint)

Carried forward from the original pattern investigation (pre-dates the July 2026 re-verification
above; re-run the counts if a fresh fingerprint matters to a specific engagement). Top rule types
per environment — supporting context showing how far each app already is from classic UI Kit
architecture:

| Rule Type | OARCAPP | OWLM | ODPipeline | HRLifeImp |
|---|---|---|---|---|
| Rule-UI-View | 350 | 392 | 65 | **0 (absent from top 15)** |
| Rule-HTML-Section | 43 | — | 201 | **672** |
| Rule-UI-Localization | 286 | 338 | — | — |
| Rule-Obj-Property | 219 | 130 | 84 | 835 |
| Rule-Obj-Model | 143 | 198 | 105 | 928 |
| Rule-Obj-Report-Definition | 119 | 127 | 177 | **418** |
| Rule-Declare-Pages | 69 | 128 | 83 | 308 |
| Rule-Obj-Activity | 82 | 176 | 108 | 568 |
| Rule-Obj-Flow | — | — | — | **651** |
| Rule-Obj-FlowAction | 43 | — | 33 | — |
| Rule-HTML-Harness | 53 | 45 | 33 | — |
| Rule-Obj-Corr | — | — | — | 252 |
| Rule-HTML-Paragraph | — | — | — | 244 |

**Reading this table:** OARCAPP and OWLM both show `Rule-UI-View` as their #1 or #2 rule type — the
Constellation-native building block. ODPipeline (Cosmos) sits in between: it has adopted
`Rule-UI-View` (65) but is still dominated by `Rule-HTML-Section` (201), confirming Cosmos
migrations are commonly partial/hybrid. **HRLifeImp has zero `Rule-UI-View` rules in its top 15 at
all** — its architecture is 100% classic (`Rule-HTML-Section` 672, `Rule-Obj-Flow` 651,
`Rule-Obj-Corr` 252, `Rule-HTML-Paragraph` 244) with no Constellation-style constructs present
anywhere yet. This single table is the clearest evidence that HRLife is pre-migration in the
literal architectural sense, not just pattern-by-pattern.

## Migration priority summary

Grouped by how strong the evidence is and how large the remediation effort looks (same earlier
investigation as the footprint above — treat as directional, not re-verified):

**Well-precedented, low-ambiguity conversions (reuse the OARCAPP/OWLM pattern directly):**
- Pattern 9 (Dynamic Layout → Page List View) — strong `multirecordlist`/`SimpleTable` precedent
  in OWLM, directly reusable naming/config convention.
- Pattern 22 (Edit Validate) — only 2 rules to remediate, and 65 `Rule-Obj-Validate` rules already
  match the target pattern.
- Pattern 10 (Action Sets) — no standalone Action Set rules found anywhere; likely little to no
  work.
- Pattern 5 (Labels) — mechanical, bulk-extractable pass across 672 sections, clear target pattern
  (`Rule-UI-Localization`).
- Pattern 21 (Custom HTML) — clear target pattern (`Rule-HTML-Paragraph`), one confirmed offending
  mechanism (`Rule-HTML-Fragment` includes) to hunt down.

**Confirmed gaps requiring net-new design work (no reference app fully solves this today):**
- Pattern 1, 2 (API/Query-enabled Data Pages) — gap exists even in OWLM; needs fresh governance,
  not copying.
- Pattern 19 (RD-bound dropdowns → Data Page) — confirmed in both HRLife and ODPipeline; the
  Cosmos migration didn't solve it either.
- Pattern 17 (node vs. requestor scope) — present even in ODPipeline; full `pyScope` audit needed.
- Pattern 20 (New Harness → Initialization Stage) — the single largest structural item; a
  case-type-by-case-type redesign workstream, not a rule port.
- Pattern 13 (Report joins/sub-reports) — actively growing in HRLife (`pyDeleteMemo`: "Added new
  join class", updated 2026), should be a freeze-and-flatten governance action, not a one-time
  cleanup.

**Open items needing a follow-up targeted investigation before they can be documented with
confidence:**
- Pattern 3 (Relevant Records) — needs an App Definition-level check, not rule XML.
- Pattern 6 (top-level page properties in views) — no concrete HRLife violation pulled yet.
- Pattern 12 (Combo Box multi-select) — no working Constellation example found in either reference
  app; recommend a build spike.
- Pattern 14 (Page Group/Value Group) — no confirmed instance in any app yet; needs a bulk
  `pyPropertyMode` query.
- Pattern 15 (temporary/clipboard pages) — needs Activity/Data Transform step-level inspection,
  not rule-name search.
- Pattern 8, 16 (dynamic-parameter data pages, deferred load) — confirmed present in HRLife with
  no directly-verified Constellation-side replacement example this session (OARCAPP/OWLM XML
  fetches were blocked); re-run once the 403 issue is resolved.

## Precedent grounding — discovered `precedentApps`, per engagement

**OWLM and OARCAPP are the precedent apps discovered in the HRLifeImp engagement — a worked
example of the mechanism below, not a hardcoded assumption true of every engagement.** SKILL.md
§Phase 0 Step 2 discovers the actual precedent apps for the current run and records them in the
registry as `precedentApps`. Confirmed necessary in practice: a run against a different
environment (`PegaCSSample`) correctly found no indexed OWLM/OARC and reported the absence rather
than fabricating a citation — any future run's precedent step must degrade the same way, not
assume these two names.

Before finalizing any redesign recommendation:

1. Search the registry's `precedentApps` (same environment as the migration target) for a
   precedent — `neo4j_query` / `get_rule_summaries` by rule type and business concept (e.g. how
   does this engagement's Constellation-native reference app implement a person lookup? how does
   it render a case-owned list?). Use each app's literal `environment` graph value from
   `precedentApps`, not a shorter conversational name.
2. When a precedent exists, **cite it** in the recommendation (app + class + rule name) and align
   with it; when the generic guidance and the precedent disagree, prefer the precedent and state
   why (Pattern 12 below is a worked example of exactly this from the HRLifeImp engagement — the
   stated guidance said Combo Box, the OWLM precedent says SimpleTableSelect, prefer the
   precedent).
3. When no precedent exists — either `precedentApps` is empty for this engagement, or the search
   comes back empty — say so explicitly ("no precedent found in `<precedentApps>`" or "no
   already-migrated app found in this environment") rather than staying silent or defaulting to a
   stale app name. That absence is itself information for the supervising developer.

**Evaluation use (HRLifeImp-specific):** for validating changes to this skill *using the HRLifeImp
engagement specifically*, OARCAPP/OWLM remain the ground-truth corpus — pick a migrated view whose
Traditional ancestor still exists, run the analysis on the ancestor's flow action, and compare the
recommendation against what the team actually built. This evaluation method is not itself
portable to other engagements without their own already-migrated reference app; where none exists,
evaluate against the plugin's own rule-type schemas/examples instead.
