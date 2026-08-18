---
name: pega-companion-seam
description: "The Companion ↔ Rule Authoring seam — orchestrates a proposed Pega change across the ChangeRequest lifecycle (intake → authoring → review → complete), calling Companion's own graph-grounded skills/agents at each stage and handing every actual write off to the Rule Authoring plugin's governed methodology-change-request-workflow. Covers the single highest-value capability in this whole plugin: injecting a blast-radius/Impact Analysis report into the ChangeRequest case before a human approves it. Trigger on: proposing a new rule/feature, starting or resuming a ChangeRequest, or asking whether a change is ready for review/promotion."
---

<!-- Skill version: 1.1.0 | 2026-08-18 — closed the deterministic-workflow pre-flight gap (Review
     steps must not assume the rule-type-skills path); added PegaUnit result consumption with
     root-cause correlation into the Review-stage injection -->

# Companion ↔ Rule Authoring: the seam skill

## What this is
This is the dispatcher that ties Companion's read-only graph intelligence to the Rule Authoring
plugin's write-capable, governed authoring workflow. It doesn't do any analysis itself — every
finding it uses comes from another skill/agent — and it never authors anything itself. Its job is
sequencing: know which stage of the ChangeRequest lifecycle a request is in, call the right
Companion capability for that stage, and hand off to the authoring plugin's own
`methodology-change-request-workflow` for every actual write. This is the design's own stated
highest-value capability (injecting Impact Analysis into the case before human review) — treat the
Review stage below as the part that must not be skipped, even under time pressure.

## Trigger phrases
"I want to add/change X in [app]", "let's build this feature", "start a change request for X",
"is this rule ready to promote", "review this change before it goes up for approval", "what's the
status of this change request" — any request that implies moving a Pega change through intake,
authoring, review, or completion. If the request is purely analytical with no intent to actually
author anything ("what would break if I changed X" with no plan to do it), that's
`pega-impact-analysis` directly — this skill is for when a change is actually being pursued.

## Hard boundary
Companion never gains write capability. Every PDS MCP tool this skill's composed
skills/agents use is get/search/analyze only. The one narrow exception, scoped tightly: **Review
stage may attach an analysis report to an already-existing ChangeRequest case** (a note/attachment,
not rule content) using the authoring plugin's own governed case-action tools — this is additive and
informational only. This skill never calls `create-rule`/`update-rule`/`copy-rule`, never advances a
case's stage or status (approve/reject/promote), and never does anything the human reviewer hasn't
explicitly asked for. Every rule-content write, and every case-stage transition, happens through
`methodology-change-request-workflow` under the human's own direction — not triggered by this skill.

## Procedure — by lifecycle stage

**Stage: Intake — a new rule/feature is being proposed, nothing authored yet.**
1. Check `pega-app-knowledge` memory for this app first — a known convention or defect might already
   shape the answer.
2. Hand off to `pega-designer` (the Designing Agent). It runs the semantic dedupe check
   (`search-rules`/`search-features` — catches "this already exists" before a duplicate gets
   proposed, which the authoring plugin's own literal/keyword search can't do) and produces a
   precedent-grounded design citing how this app has actually solved similar problems before.
3. If `pega-designer` finds a likely duplicate, stop here and surface it — don't proceed to
   authoring a redundant rule. If it finds real gaps in the graph while searching for precedent,
   it will itself route to `pega-gap-coverage` — you don't need to intervene.
4. Once a design is confirmed and the user wants to proceed, load `get-skill("methodology-change-
   request-workflow")` from the authoring plugin and follow *its* procedure to actually open the
   ChangeRequest / branch — this skill stops directing at that point; the authoring plugin's own
   workflow owns branch isolation and case creation from here.

**Stage: Authoring — a branch/case exists, rule content is being written.**
This skill does not participate here beyond one thing: if the person authoring needs to know how
this app has handled a similar pattern before (which `pega-designer` should have already surfaced at
Intake, but a new sub-question can come up mid-authoring), route back to `pega-designer` or directly
to `pega-graph-traverser` for a narrower ad hoc question. All actual rule editing happens through the
authoring plugin's own rule-type skills — this skill never touches rule content.

**Two different authoring paths can reach Review — the Review-stage steps below must not assume
either one.** The authoring plugin's own `methodology-change-request-workflow` has a pre-flight step:
before opening the case, it calls `list-available-authoring-workflows`, and if a deterministic
workflow matches the request (and stays within that workflow's stated `Limitation:`), it runs
`create-case` against that workflow's own case type instead of the rule-type-skills path this seam
was originally written around. **Do not assume the rule-type-skills path was used.** The Review-stage
procedure below operates on the branch/case as it exists, not on how it got there, so it stays
correct either way — but don't skip Impact Analysis or Code Review just because a change came in
through a deterministic workflow believing it's "already validated"; it still needs the same
dependency-visibility injection a hand-authored change would get.

**Stage: Review — a rule/branch is ready for human approval before promotion.** This is the
capability the whole seam exists for; don't shortcut it.
1. Run `pega-impact-analysis` on every rule the change touches — full blast radius, risk level,
   affected applications, override risk, per that skill's exact report format. If any rule is a stub
   or has an unresolved reference, `pega-impact-analysis` will itself hand off to `pega-gap-coverage`.
2. Run `pega-code-review` on the branch — G1-G4 graph investigation, PASS/WARN/FAIL verdict, defect
   checklist. For a second, unbiased pass (recommended before anything promotes, especially if this
   session already reasoned about the change), spawn `pega-independent-code-reviewer` fresh rather
   than reusing this session's own review.
3. **If either report's bottom line is high-stakes** (a risk level of HIGH/CRITICAL, or a PASS/WARN
   verdict about to gate an actual promotion), spawn `pega-verifier` to independently re-check the
   load-bearing claims before they reach the human — a false "safe to promote" is the single most
   dangerous failure mode in this whole system, and this is the step that catches it.
4. **Check for PegaUnit results.** `methodology-change-request-workflow`'s Authoring-stage submission
   auto-triggers PegaUnit execution against `pyBranchID` and returns a test execution ID. If the case
   has one, retrieve the results before injecting the report (next step). Any failure gets root-caused, not
   just listed: feed the failing test case's rule and error into `pega-log-diagnosis`'s
   graph-correlation approach to identify the actual point of failure, the same way it would for a
   production log excerpt. Fold that root cause into the injected report rather than reporting a bare
   "N tests failed" — the human reviewer needs to know *why*, not just the count.
5. **Inject the findings into the ChangeRequest case, not just into chat.** Use whichever
   authoring-plugin capability actually attaches a note/attachment to the case (commonly
   `perform-action` against a local "Add Note"-shaped action, or a dedicated attach-report capability
   if the connected instance exposes one) — discover the right one via the case's own available
   actions (`get-case-assignments`/`get-assignment`) rather than hardcoding a flow-action name, same
   discipline `pds-pega-data-access` uses for data-page tools. Attach: the Impact Analysis report, the
   Code Review verdict, the Verifier's per-claim findings (if run), and the PegaUnit results with root
   cause for any failure (if a test execution exists). This is additive only — it
   does not advance the case, approve anything, or touch rule content.
6. State plainly whether the case is ready for human review or not, and why — but the actual
   approve/reject decision belongs to the human reviewer inside the ChangeRequest workflow, never to
   this skill.

**Stage: Complete — a change has merged.** No action needed. Delta processing (RulesDelta CSV → S3 →
EventBridge → `delta_processor`) already keeps the graph fresh on merge — don't build or trigger a
second sync mechanism here; this was explicitly considered and rejected during design (see
`PLUGIN_BUILD_CONTEXT.md`'s "Flaws corrected" section). If the user asks "is the graph caught up
after this merge," that's a `pega-graph-traverser` freshness check (does the merged rule show up,
non-stub), not something this skill re-derives.

## What NOT to do
- Don't skip the Review-stage injection step because the reports were already shown in chat — the
  whole point is that the human reviewer sees dependency visibility *inside the case*, not buried in
  a conversation they may not have scrolled back through.
- Don't hardcode a flow-action/local-action name for attaching the report — discover it from the
  case's own available actions, same discipline as `pds-pega-data-access`'s data-page tool selection.
- Don't call `create-rule`/`update-rule`/`copy-rule`, or any action that advances a case's stage or
  status, from this skill — that's the human's call, taken through the authoring plugin's own
  workflow, never triggered here.
- Don't build a second graph-freshness sync mechanism at the Complete stage — delta processing
  already handles it; this was explicitly re-litigated and rejected once already.
- Don't re-derive Impact Analysis or Code Review logic here — this skill sequences those skills, it
  doesn't duplicate their procedures.
- Don't treat a `pega-designer` dedupe hit as a soft suggestion — stop and confirm with the user
  before proceeding to author something that already exists.
