---
name: pega-doc-generator
description: "Generates platform-agnostic and/or Pega Blueprint specification documents FROM an existing Pega application, via graph reverse-engineering. Explicit-request only -- not for general Pega questions, rule lookups, debugging, or code review. Requires PDS MCP."
---

# Pega Application Documentation Generator

Reverse-engineers a Pega application into two complete specification documents using the
PDS MCP server (Neo4j graph + DynamoDB rule summaries) — composed with the authoring plugin's
`methodology-explain-application` and `methodology-blueprint-delivered` skills rather than
re-deriving what those already answer more cheaply (see CORE PRINCIPLES below).

**Trigger phrases:** "generate docs for this Pega app", "document this application",
"reverse-engineer this Pega app", "create a spec from Pega", "write a platform-agnostic spec",
"write a Pega Blueprint", "produce requirements from this Pega application". Do not trigger for
general Pega development questions, rule lookups, debugging, or code review.

**Output documents:**
- `[AppName]_Platform_Agnostic_Spec.md` — Zero Pega terminology; for React/Node developers
- `[AppName]_Pega_Blueprint_Spec.md` — Full Pega-native reference; for Pega architects. Structure
  this document's sections to match the authoring plugin's `methodology-blueprint-delivered`
  phases (Blueprinting / Authoring / Value Activation) so it reads as genuinely import-shaped, not
  just Pega-flavored prose.

**Reference files — read before using:**
- [`references/query-patterns.md`](references/query-patterns.md) — All Cypher queries + parsing patterns
- [`references/document-templates.md`](references/document-templates.md) — Section structure for both documents
- [`references/lsa-review-checklist.md`](references/lsa-review-checklist.md) — Deep review items (LSA perspective)

**Compose, don't re-derive — application overview is cheaper from the authoring plugin.** If the
authoring plugin is connected, delegate the application-overview section (app label/description,
case types, full stage/process/step lifecycle, data objects with fields, personas) to its
`methodology-explain-application` skill — one `get-application` call, live and structurally
authoritative, instead of reconstructing it from graph traversal. Reserve graph traversal for what
only the graph can answer: rule-level implementation detail, dependency closure, cross-rule tracing,
and dead-rule detection. Fall back to full graph reconstruction only if the authoring plugin isn't
connected.

---

## CORE PRINCIPLES

**PRINCIPLE 1 — Review before asking.**
Run the full Phase 1 autonomous review before asking the user anything. Surface findings as a
structured summary. Only ask questions for gaps the graph genuinely cannot answer.

**PRINCIPLE 2 — One question at a time.**
Ask exactly one question per message. Number each: "Question 3 of ~12". Never list questions.
Wait for an answer before asking the next. If a user answer is ambiguous, clarify in the same
turn before moving on.

**PRINCIPLE 3 — Never assume abbreviations or business meaning.**
Never expand abbreviations from rule names. Never infer domain meaning from class names alone.
Always confirm with the user. Example: "APProcess_Flow" — does AP mean Accounts Payable,
Approval Process, or something else? Ask.

**PRINCIPLE 4 — Lock and confirm.**
After each user answer, restate your understanding as a short locked summary before proceeding.
Example: "Locked ✓ AP = Approval Process, not Accounts Payable."

**PRINCIPLE 5 — Surface unexpected findings.**
When a tool reveals something surprising (an extra case type, an unusual flow branch, a
deny rule, a cross-app queue trigger), always surface it to the user and ask them to confirm
or correct before documenting it.

**PRINCIPLE 6 — Never write documents until all sections are LOCKED.**
Documents are the final output. Show a progress tracker after every 3–4 questions.
Write only after the user confirms the complete knowledge base summary.

**PRINCIPLE 7 — Respect rule scope.**
Only document rules belonging to the top-level application ruleset OR rules from built-on
rulesets that are directly referenced by application rules. Never document platform/framework
stubs.

**PRINCIPLE 8 — Ask when uncertain, never guess.**
If the graph returns something ambiguous, ask the user. It is always better to ask one
focused question than to document something incorrectly.

---

## PHASE 1 — AUTONOMOUS APPLICATION REVIEW

Run all 22 steps silently before interacting with the user.
Present a single structured summary at the end. See `references/query-patterns.md` for
all Cypher queries used in each step.

### Step 1.1 — Locate Application and Rule Inventory
Query rule inventory by type. Find all case types.

### Step 1.2 — Ruleset Stack and Built-On Applications
Identify all rulesets referenced. Find cross-ruleset references.
Only include external rules if directly referenced by application rules.

### Step 1.3 — Rule Resolution and Inheritance
Check for:
- Rules overridden locally (same rule name exists in both app and built-on ruleset)
- Circumstanced rules (same rule name, different circumstance key)
- Ruleset version locking (open-ended vs pinned versions)
Flag overrides and circumstances — they change runtime behaviour.

### Step 1.4 — Class Hierarchy
Query all Rule-Obj-Class. Build the full class tree.

### Step 1.5 — Case Types, Flows, and Stage Maps
For each case type: fetch all flows, get summaries, extract:
- Stage names and sequence
- Flow actions at each step (with screen description from summary)
- Decision branches (approval, rejection, alternate paths)
- Sub-case / child case creation (CreateCase, pxCreateCase, pyCreateSubcase)
- Wait/timer conditions and the exact property used as the trigger
- Activities called at each step

### Step 1.6 — Case Hierarchy
Map parent → child case relationships. Identify:
- Which case creates which child case
- What triggers the creation
- Whether the parent waits for the child (synchronous dependency)
- Data passed from parent to child

### Step 1.7 — Portal and Navigation Review
Query portals, landing pages, harnesses, sections, views.
Build navigation chains: Portal → Tab → Landing Page → Harness → Section → Fields.
Use rule summaries to extract screen descriptions (field labels, instructions, button captions).
Document what each screen shows and what actions are available.

### Step 1.8 — Security: Personas, Roles, Privileges, Deny Rules
Query personas, access roles, privileges, and — critically — access deny rules.
Build a security matrix: Role × Action × Case Type.
Check for field-level security (read-only, hidden, editable per role).
Note: a deny rule overrides all grants — flag any deny rules found.

### Step 1.9 — Top-Level Entry Points (Feature Discovery)
Find all rules with no incoming references within the application.
See `references/query-patterns.md` Query 8 for the full rule type list.
Treat each as a distinct feature. Special handling:
- Queue Processors: check if triggered from a different Pega application
- Job Schedulers: capture schedule, activity, and purpose
- Service rules: capture direction, endpoint, auth method
- File/Email listeners: capture trigger and routing logic

### Step 1.10 — Data Model (Properties)
Query all Rule-Obj-Property. Group by class.
Flag: unique identifiers, required fields, system-generated, calculated (declarative).

### Step 1.11 — Decision Logic
Query: DataTransforms, Decision Tables, Decision Trees, When Rules,
Declare Expressions, Declare Triggers.
These carry significant business logic that is NOT visible in flows.
Summarise the purpose of each. Flag complex decision tables — they need a
dedicated section in the Platform-Agnostic spec as business rules.

### Step 1.12 — Field Values (Dropdown Options)
Query Rule-Obj-Field-Value for all properties with coded values.
These define every dropdown option, status label, and coded field in the application.
A developer rebuilding the UI needs every option per field.

### Step 1.13 — SLA Rules
Query Rule-Obj-SLARule per assignment.
Extract: goal interval, deadline interval, passed-deadline interval,
actions at each threshold (notify, reassign, escalate).

### Step 1.14 — Workbasket Inventory
Query Rule-Obj-WorkBasket. List each workbasket with routing rules and monitoring role.

### Step 1.15 — Notifications and Correspondence
Query correspondence rules, notifications, job schedulers.
Extract: trigger, recipients, subject, content, attachments.

### Step 1.16 — AI and GenAI Rules
Query AI Agents, AI Tools, Connect-GenerativeAI, GenAI Coach rules.
Extract: model, trigger point, input, output, tools used.

### Step 1.17 — Integration Rules
Query all connector and service rules.
Extract: type, direction, authentication method, sync vs async,
retry/error handling, request/response property mapping.
Flag connectors that appear to point to mock/stub endpoints.

### Step 1.18 — Reports and Dashboards
Query report definitions and landing pages.
Note role-scoped report variants.

### Step 1.19 — Attachment Configuration
Query attachment category rules.
Extract: storage location (DB vs external), size limits, access control per category.

### Step 1.20 — Agent and Background Processing
Query: Rule-Obj-Agent (legacy Pega agents), scheduled activities, batch flows,
Queue Processors. Distinguish from AI Agents (Rule-AI-Agent).

### Step 1.21 — Guardrails and Technical Debt Signals
Check for:
- Deprecated rule types (Rule-Obj-HTML, legacy HTML rules used instead of sections)
- Rule-Obj-Activity doing work that should be Data Transforms (logic-heavy activities)
- Hardcoded values in activities vs configuration-driven decision tables
Flag these in the Blueprint spec as technical notes.

### Step 1.22 — Case Locking, Concurrency, and Audit
Check for DoNotUnlock parameters across all flows (not just one).
Note if case history / audit trail is relied upon (affects rebuild design).
Note if Pulse/collaboration feed is used.

---

## PHASE 2 — REVIEW SUMMARY PRESENTATION

Present a single structured summary covering all 22 steps. Format:

```
## [AppName] — Application Review Summary

### Rule Inventory
[Rule Type | Count table]

### Ruleset Stack
[Rulesets found + cross-reference counts + override/circumstance flags]

### Case Types and Stage Maps
[Case Type | Stages | Key flows | Sub-cases created]

### Case Hierarchy
[Parent → Child diagram]

### Class Hierarchy
[ASCII tree]

### Top-Level Features (Entry Points)
[Rule Type | Rule Name | Description | Trigger source]

### Portal and Navigation
[Portal → Tab → Landing Page → Screen chain per role]

### Security Model
[Roles | Portals | Access | Deny rules found Y/N]

### Data Model Summary
[Classes + property counts + key fields identified]

### Decision Logic
[DataTransforms, Decision Tables, When Rules, Declare Expressions found]

### Field Values (Dropdowns)
[Property | Options count | Sample values]

### SLA Model
[Assignments with SLAs | Goal/Deadline intervals]

### Workbaskets
[Name | Routing | Monitoring role]

### Notifications
[Correspondence rules + inferred triggers]

### AI / GenAI Features
[Agent | Model | Trigger | Purpose]

### Integrations
[Type | Rule | Direction | Auth | Sync/Async]

### Attachments
[Category | Storage | Access]

### Background Processing
[Agents, Schedulers, Queue Processors, trigger sources]

### Technical Debt Flags
[Deprecated types, hardcoded values, complex activities found]

### Gaps — Questions Needed
[Numbered list of items the graph could NOT answer]
```

Then ask: **"Does this review look correct? Shall I proceed with questions to fill in the gaps?"**

---

## PHASE 3 — CLARIFICATION QUESTIONS

Ask only what the graph cannot answer. Work through the gaps list from Phase 2.
One question per message. Number each question.

### Standard Question Bank

**Business context:**
> "Who uses this application and what business problem does it solve?
> The class names suggest [X] — is that correct?"
*(Only ask if the domain is not obvious from rule names.)*

**Target platform:**
> "Is the goal to produce a platform-agnostic spec (for a React/Node rebuild),
> a Pega Blueprint spec, or both?"

**Stage meaning:**
> "The graph shows stages: [X, Y, Z]. What does each stage represent in the
> real business process? I want to make sure I document the business intent,
> not just the rule names."

**Role clarification:**
> "I found these roles: [list]. Can you describe who each person is in the
> real organisation and what they are responsible for?"

**Abbreviation confirmation:**
> "I see a rule called '[RuleName]'. I want to confirm — does '[abbrev]' stand
> for [Option A] or [Option B]? I won't assume."

**Data visibility:**
> "Does each [Role] user see only their own records, or can they see all records
> across the organisation?"

**Sub-case confirmation:**
> "The graph suggests [CaseTypeA] creates a [CaseTypeB] during the [Stage] stage.
> Can you confirm — is this a sub-case (child of the parent), or an independent
> case that just references the parent?"

**Approval depth:**
> "The approval step in [Flow] uses the standard Pega approval subprocess.
> Is this a single approver, a chain (reports-to manager hierarchy), or an
> any-of model where one approval is sufficient? What happens if no one approves
> within a set time?"

**Queue processor trigger:**
> "I found a Queue Processor rule: [Name]. Is this triggered from within this
> application, or does a separate Pega application queue messages to it?
> What activity does the queuing?"

**Integration confirmation:**
> "I found [N] connector rules: [list]. Which of these are actively used in
> production vs framework placeholders or stubs?"

**Scheduled/batch processing:**
> "Beyond the Job Scheduler rules I found, are there any overnight or
> scheduled batch processes that update cases or trigger downstream systems?"

**SLA clarification:**
> "I found SLA rules on [assignments]. What should happen when the deadline
> is breached — escalate to a manager, reassign, send a notification, or
> something else?"

**Field values confirmation:**
> "I found dropdown options for [property]: [list]. Are these the complete and
> current set of valid values, or have any been added/removed recently?"

**Deny rules:**
> "I found access deny rules for [role/action]. Can you confirm the business
> reason for this deny — is it intentional security, or a legacy restriction
> that may no longer apply?"

**Technical debt acknowledgement:**
> "I found [N] guardrail flags / deprecated rule types. Do you want these
> documented as technical notes in the Blueprint spec, or should I focus only
> on current functional behaviour?"

**Edge cases:**
> "Are there any special scenarios, exception flows, or business rules a
> developer rebuilding this would need to know that aren't visible in the
> rule names? For example: VIP vendors, special event categories, manual
> override processes?"

**Non-functional requirements:**
> "Are there performance, availability, data retention, or compliance
> requirements to capture? For example: response time SLAs, GDPR/data
> privacy rules, archival policy?"

**Final confirmation:**
> [Show the complete locked knowledge base summary]
> "Does this look correct and complete? Anything missing before I write
> the documents?"

---

## PHASE 4 — DOCUMENT WRITING

Write both documents only after all sections are LOCKED and the user has
confirmed the final summary. See `references/document-templates.md` for
exact section structure and language rules.

Save to `/mnt/user-data/outputs/` and present with `present_files`.

---

## TOOL USAGE

| Tool | When to use |
|---|---|
| `neo4j_query` | Inventory, cross-refs, hierarchy, entry-point discovery, override detection |
| `get_rule_summaries` | Business purpose, field labels, flow steps, screen descriptions. Batch up to 20. |
| `search_rules` | When pzInsKey is unknown — semantic search by business function |
| `pega_get_rule_xml` | ONLY when: summaries return "not_cached", exact decision table values needed, dynamic activity references suspected |
| `get_data_page` | Live config data (reference tables, field values). May return 403 — have fallback. |

Parsing `get_rule_summaries`: see `references/query-patterns.md` section "Parsing Pattern".

---

## PROGRESS TRACKER FORMAT

Show after every 3–4 questions:

```
LOCKED ✓  Application review (Phase 1 complete)
LOCKED ✓  Business context
LOCKED ✓  Case types and stage maps
LOCKED ✓  Class hierarchy and ruleset stack
LOCKED ✓  Decision logic (DataTransforms, Decision Tables)
PENDING   Approval depth confirmation
PENDING   Queue processor trigger source
PENDING   Integration active/stub confirmation
PENDING   Non-functional requirements
PENDING   Final user confirmation
```
