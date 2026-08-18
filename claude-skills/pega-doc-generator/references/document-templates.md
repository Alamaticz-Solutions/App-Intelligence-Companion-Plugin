# Document templates — section structure and language rules

<!-- Reconstructed 2026-08-18 alongside query-patterns.md — see that file's header note for why. -->

Both documents draw from the same locked knowledge base (Phase 2/3's confirmed findings) but are
written for different readers, in different vocabularies. Never reuse a paragraph verbatim across
both — translate it.

## Shared writing rules (both documents)

- **Only write what was LOCKED** (CORE PRINCIPLE 6). If a section has an open gap the user never
  resolved, say so in the document itself (`> **Open item**: ...`) rather than silently omitting it
  or guessing to fill the hole.
- **No GUIDs, pzInsKeys, or raw class names in reader-facing prose** — use resolved labels. An
  appendix/reference table at the end of each document may list `pzInsKey ↔ rule_name` mappings for
  traceability, but the body text should read naturally.
- **State business intent before mechanism** — "Approvals over $10,000 require a second sign-off"
  before "the flow branches on `.ApprovalAmount > 10000`."
- **Every claim traces to a locked finding** — don't introduce anything in the document that wasn't
  either confirmed by the graph in Phase 1 or explicitly locked with the user in Phase 3.

---

## `[AppName]_Platform_Agnostic_Spec.md`

**Audience**: a React/Node developer with zero Pega background. **Zero Pega terminology** — no
"flow," "activity," "data transform," "ruleset," "harness." Translate every Pega concept to its
generic equivalent before it reaches this document:

| Pega concept | Platform-agnostic translation |
|---|---|
| Case type | Entity / workflow / record type |
| Flow / stage | Process / workflow state machine / lifecycle stage |
| Flow action | Form / user action / API endpoint |
| Activity / Data Transform | Business logic / service function |
| Decision Table / When rule | Business rule / conditional logic |
| Property | Field |
| Class hierarchy | Data model / type hierarchy |
| Access role / privilege | Permission / role-based access rule |
| SLA | Deadline / escalation policy |
| Connector (Connect-REST etc.) | External API integration |
| Queue Processor / Job Scheduler | Background job / scheduled task |
| Correspondence / Notification | Email / notification template |

### Section structure

```
# [AppName] — Platform-Agnostic Specification

## 1. Overview
Plain-English purpose, who uses it, what business problem it solves.

## 2. Data Model
Entities, fields (with types), relationships. From Step 1.4/1.10/1.12.
Table per entity: Field | Type | Required | Notes.

## 3. Workflows
One subsection per case type. Lifecycle states, transitions, what triggers each transition.
State diagram (ASCII or Mermaid) per workflow.

## 4. User Roles & Permissions
Role | What they can do | What they can see. From Step 1.8.
Note any deny/restriction explicitly — a rebuild that misses a deny rule is a security regression.

## 5. Business Rules
Every decision table / When rule / declarative rule, restated as plain conditional logic.
"If X and Y, then Z" — not Pega syntax.

## 6. Screens & User Actions
Per screen: purpose, fields shown, actions available, validation rules. From Step 1.7.

## 7. Integrations
External system | Direction | Data exchanged | Trigger | Error handling. From Step 1.17.
Explicitly flag anything found to be a mock/stub endpoint per Step 1.17's guidance — a rebuild
should not treat these as production-ready without the user's confirmation.

## 8. Notifications
Trigger | Recipient | Channel | Content summary. From Step 1.15.

## 9. Background Processing
Job | Schedule/trigger | What it does. From Step 1.20.

## 10. Non-Functional Requirements
Performance, availability, compliance, data retention — from Phase 3's clarification answers.

## 11. Known Gaps / Open Items
Anything the review couldn't resolve even after clarification — stated plainly, not buried.
```

---

## `[AppName]_Pega_Blueprint_Spec.md`

**Audience**: a Pega architect. Full Pega-native vocabulary — this is the opposite translation
direction from the Platform-Agnostic spec. Structure the sections to mirror the authoring plugin's
`methodology-blueprint-delivered` phases (Blueprinting → Authoring → Value Activation) so the
document reads as genuinely import-shaped guidance for a re-implementation or handoff, not just
Pega-flavored prose describing the same content as the other document.

### Section structure

```
# [AppName] — Pega Blueprint Specification

## 1. Application Overview
Rule inventory summary (Step 1.1), ruleset stack (Step 1.2), class hierarchy (Step 1.4).

## 2. Blueprinting — Business Intent
Case types and their business purpose. Stage maps (Step 1.5) presented as Pega stage/process/step
structure, not translated away. Case hierarchy (Step 1.6).

## 3. Authoring — Foundation
### 3.1 Data Model
Rule-Obj-Class hierarchy, Rule-Obj-Property inventory per class (Step 1.10), Rule-Obj-FieldValue
dropdown definitions if present (Step 1.12 — note explicitly if not found in the graph).

### 3.2 Case & Usability Configuration
Flows, flow actions, decision logic (Step 1.11), routing (workbaskets if present — Step 1.14),
SLAs (Step 1.13).

### 3.3 Security & Data Integration
Personas, access roles, privileges, deny rules (Step 1.8). Connectors and services (Step 1.17).

### 3.4 Automation & Integration
Decision tables/trees, When rules, Declare Expressions/Triggers (Step 1.11). AI/GenAI rules if
present (Step 1.16 — note explicitly if not found). Background processing: agents, job schedulers,
queue processors (Step 1.20).

### 3.5 Case Usability
Portals, navigation, harnesses/sections/views (Step 1.7). Reports and dashboards (Step 1.18).
Attachment categories (Step 1.19). Notifications and correspondence (Step 1.15).

## 4. Value Activation Considerations
Guardrail/technical-debt flags (Step 1.21) — surfaced here as pre-promotion cleanup items, not
buried as a footnote. Case locking/concurrency/audit notes (Step 1.22).

## 5. Rule Reference Appendix
Full pzInsKey ↔ rule_name ↔ rule_type table, grouped by section above — the traceability map a
reviewing architect needs to go from this document back to the live rule.

## 6. Known Gaps / Open Items
Same content as the Platform-Agnostic spec's equivalent section, in Pega terms where relevant.
```

## Language rules (both documents)

- **Definitive statements only** where the finding is graph-confirmed — no "likely"/"probably"/
  "appears to" hedging on something the graph directly answered (same discipline as
  `pega-code-review`'s banned-word list).
- **Hedge explicitly, and only, on genuinely unresolved gaps** — "This connector's summary does not
  specify a retry policy; not confirmed against live configuration" is correct hedging; "this
  probably retries on failure" is not.
- **Don't invent business meaning for an abbreviation the user didn't confirm** — if PRINCIPLE 3's
  question went unanswered, the document should say `[AP — unconfirmed abbreviation]`, not silently
  pick the most likely expansion.
