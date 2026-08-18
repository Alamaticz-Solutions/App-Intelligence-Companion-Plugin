# LSA review checklist — deep review items

<!-- Reconstructed 2026-08-18 alongside query-patterns.md — see that file's header note for why.
     Declared as a "read before using" reference in SKILL.md's opening list but not invoked from any
     specific numbered step in the body; use it as a lens across Phase 1's steps and Phase 2's
     Technical Debt Flags section, not as a standalone extra phase. -->

An LSA (Lead System Architect) reviewing this application for reusability, maintainability, and
promotion-readiness looks past "does it work" to "is it built the way this platform expects it to be
built." This checklist is that lens, applied across the same 22-step review — not a separate pass.
Findings here belong in Phase 2's **Technical Debt Flags** section and, for the Blueprint spec, its
**Value Activation Considerations** section (§4 of `document-templates.md`).

## Rule reuse and centralization
- Is business logic that's used in more than one place actually centralized (a shared Data
  Transform/Activity), or copy-pasted per case type? Step 1.21's fan-out query is a rough proxy;
  confirm by checking whether near-identical rule names/summaries recur across different classes.
- Does this app duplicate a rule that already exists in a built-on/framework ruleset instead of
  extending it? (Cross-check Step 1.3's override findings — an override that re-implements from
  scratch rather than calling `pxSuper.*` or delegating is a reuse miss, not just a shadow.)

## Rule type appropriateness
- Logic-heavy Activities that should be Data Transforms (Step 1.21's fan-out flag is one signal;
  another is an Activity whose summary describes pure data mapping with no branching/integration).
- Decision logic hardcoded in a When rule or Activity `if` chain that should be a Decision Table
  (easier for a business user to maintain, auditable, delegatable).
- `Rule-HTML-*` rules (Step 1.21) used where a modern Section/View is the platform-current
  equivalent — flag as a modernization item, not a functional defect.

## Class structure
- Is the class hierarchy (Step 1.4) genuinely reflecting a data model, or is it flat with everything
  crammed into one or two classes? A flat hierarchy on an app with many distinct entity types is
  itself a finding.
- Are work classes and data classes cleanly separated, or is case-specific logic living in a shared
  data class (a common source of unintended cross-case-type coupling)?

## Ruleset hygiene
- Version locking (Step 1.3's last query) — an app entirely on open-ended `-01-01` versions has no
  real change control; an app that's over-pinned to exact patch versions may be silently missing
  fixes from its built-on rulesets. Neither extreme is automatically wrong, but state which one this
  app does and let the reader judge.
- Rulesets with a very high override count relative to their size (cross-reference Step 1.2's stack
  with Step 1.3's overrides) suggest the app is fighting its framework rather than extending it.

## Security posture
- Deny rules (Step 1.8) — is each one traceable to an actual business reason, or does it look like a
  leftover from a removed feature? Flag ones that can't be explained from the summary alone as a
  question for Phase 3, not a silent assumption either way.
- Field-level security — are sensitive fields (PII, financial amounts) actually restricted per role,
  or open to every persona that can see the case at all?
- Any externally-facing service (Step 1.17's `Rule-Service-*` rules) with authentication that looks
  weaker than the data it exposes warrants an explicit flag, not a pass-through mention.

## Integration resilience
- Connectors (Step 1.17) with no visible retry/error-handling configuration in their summary — flag
  as a reliability gap, distinct from the "is this a stub/mock" flag that step already produces.
- Synchronous connectors called from a user-facing flow step (vs. async/queued) are a latency risk
  worth naming explicitly if the connector's own summary suggests a slow external system.

## Case lifecycle integrity
- SLA coverage (Step 1.13) — are the case's meaningful assignments actually covered, or only some?
  A case type with zero SLA rules found is itself worth surfacing, not silently treated as "nothing
  to report."
- Locking discipline (Step 1.22) — `DoNotUnlock` used inconsistently across a case type's flows is a
  concurrency risk (a step that expects the lock held finding it released).

## What NOT to do with this checklist
- Don't turn every item above into a finding regardless of severity — this is a lens for judgment,
  not a mandatory-fail gate like `pega-code-review`'s CRITICAL checklist. State findings with their
  actual weight (a real reliability risk vs. a minor modernization suggestion).
- Don't apply this checklist as a separate Phase 1.5 — fold its findings into the existing steps'
  own output and into Phase 2's Technical Debt Flags section, so the review stays one coherent pass.
