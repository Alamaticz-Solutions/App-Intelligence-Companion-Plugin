---
name: pds-pega-data-access
description: "Routing policy for live Pega lookups (rules, cases, branches, data pages) between PDS MCP and the pega-infinity-authoring plugin. TRIGGER before calling any pega-infinity-authoring tool, or any Pega rule/case/branch/data-page question, even unnamed."
---

# PDS MCP Pega Data Access via Infinity Authoring

**Read this skill first, every time.** The moment a task involves the
pega-infinity-authoring plugin — or any Pega rule/case/branch/data-page
question at all — load this skill before making the first tool call. Do not
start improvising with `run-data-page` or guessing a dataViewID until you've
checked whether this file already documents the exact recipe (see §2).

## 0. Authority is scoped, not global — the tri-state rule

PDS MCP's `config.py` still holds its own `PEGA_CONFIGS`/`NEO4J_CONFIGS` for every environment
it's configured against — it has **not** dropped its own Pega credentials, contrary to what an
earlier version of this skill claimed. Which side is authoritative depends on what's being asked,
not a blanket policy:

1. **Inside the authoring plugin's configured instance** (its `pega_base_url`) — the authoring
   plugin's own tools are authoritative: OAuth'd, live, ruleset-resolved, and governed by the
   ChangeRequest workflow. Use §1/§2 below.
2. **Outside that instance** — any other environment PDS MCP is configured for (the graph currently
   spans ~10 — see `pega-neo4j-cypher-querying`) — the authoring plugin cannot reach it at all.
   **PDS MCP's own Pega-credentialed tools are the only path.** Call them directly; don't try to
   route through the authoring plugin first.
3. **Structure, history, dependency closure, logs, rule summaries — regardless of instance** — PDS
   MCP (the graph, OpenSearch, DynamoDB) is authoritative. The authoring plugin has no equivalent
   capability at all, so there's no routing decision to make.

One permanent exception inside case 1: `get-rule-resolve-handle` performs **runtime circumstance
resolution with real case context**. The graph's precomputed rule-priority data can enumerate every
candidate and the priority order, but only live Pega can say which one actually fires for a given
case — that's a category difference from staleness, not something delta processing fixes.

Never assume or hardcode a specific base URL, instance name, or application list — always resolve
these dynamically from the live plugin connection.

**Do not hardcode a specific tool-name prefix.** Plugin tool names can vary by
install. Instead, find the currently-available tool whose description matches
the capability described below, and call that.

**Application context first — discover, don't assume.** Infinity Authoring
operates on one application context at a time. Before making any call below:
1. Use the plugin's capability to list available applications (e.g. "list
   available applications") to see the live, current set — do not rely on any
   previously-remembered or hardcoded list of application names, since the
   set of available applications depends entirely on the connected Pega
   instance and can change over time.
2. Match the user's request against that live list (by name or close
   description) to pick the right application.
3. Confirm/switch to that application context using the plugin's
   context-switching capability (e.g. "switch application context" / "set
   application alias") before making any data call. If the user's request
   implies a different app than the one currently active, switch first.
4. If the user's target application isn't in the live list, say so — do not
   guess a close match silently.

---

## 1. Native replacements — use these directly, no data-page knowledge needed

| Need | Use |
|---|---|
| Full XML/definition of a specific Pega rule (by pzInsKey) | The plugin's rule-fetch capability ("get rule"). Pass the pzInsKey directly — no base64 encoding, no manual XML tag extraction. It returns structured rule data already. |
| List a user's cases | The plugin's "list cases" capability. |
| Details of one case by ID | **On this Pega instance, the native "get case details" tool does not work — see §2 "Case details (this instance's actual data view)" for the working override.** On a different/unverified instance, try the native tool first; only fall back to the §2 override if it 404s. |
| Case assignments / a specific assignment | The plugin's "get case assignments" / "get assignment" capabilities. |
| Metadata for a data page (params, fields) | The plugin's "get data view metadata" capability, passing the dataViewID. |
| Any arbitrary Pega data page by ID | The plugin's generic data-page-runner capability (commonly named `run-data-page`), passing `dataViewID` and any parameters as key-value pairs. |

## 2. Data pages with no native tool — use the generic data-page-runner

For each of these, call the generic run-a-data-page capability with the
`dataViewID` and parameters shown, then reshape the raw response as
described. This carries forward the exact param names and response-shaping
PDS MCP's Python code used to do.

### Resolve a rule from a log stack trace (log analyzer)
- **When:** the user has an obfuscated Java class name from a Pega exception/stack trace (e.g. `ra_action_staffbiodetails_6e5b9b475ebbf9c15d55b21a6d6678bf`) and needs the Pega rule that generated it.
- **dataViewID:** `D_LogAnalyzerAPI`
- **Params:** `Request_class` = the obfuscated class name
- **Response shaping:** look for `pzInsKey` (fall back to `pxInsKey`, `pyInsKey`, or `insKey`) in the result and surface it prominently. Once you have it, feed it into the rule-fetch capability (§1) for a full rule review.

### Full-text content search
- **When:** searching Pega content by arbitrary text (e.g. a property name like `pyLabel`).
- **dataViewID:** `D_AllContentSearch`
- **Params:** `searchText` = the search text
- **Response shaping:** none — return as-is.

### List available development branches
- **When:** the user wants to see what dev branches exist, optionally filtered by application.
- **dataViewID:** `D_GetAvailableBranchesForAppStack`
- **Params:** none
- **Response shaping:** the raw result is `pxResults[].pxPages.Branches` objects. For each, pull `pyBranchID` → `branch_id`, `pzAppName` → `app_name`, `pzAppVersion` → `app_version`. Skip any entry with an empty `branch_id`. If the user asked for a specific app, keep only branches whose `app_name` contains that app name (case-insensitive).

### Rules contained in a branch
- **When:** the user wants the rule contents of a specific dev branch.
- **dataViewID:** `D_BranchContent`
- **Params:** `branchID` = the branch ID (e.g. `Pl-347`)
- **Response shaping:** the raw result is a `pxResults[]` list. For each entry, extract: `rule_name` (`pyRuleName`, else `name`, else `pxInsName`), `class_name` (`pyClassName`, else `className`), `rule_type` (`pyClassLabel`, else `pyClass`, else `ruleType`), `ruleset` (`pyRuleSet`, else `ruleSetName`), `last_updated` (`pxUpdateDateTime`, else `pxSaveDateTime`), `pz_ins_key` (`pzInsKey`, else `insKey`). If the user asked for a specific rule type, keep only entries whose `rule_type` contains that value (case-insensitive).

### All versions of a rule
- **When:** the user wants the version/circumstance history of a named rule.
- **dataViewID:** `D_GetListOfRelatedRules`
- **Params:** `RuleName` = the rule name (`pyRuleName`), `RuleType` = the rule's class (`pxRuleObjClass`)
- **Response shaping:** the raw result is a `pxResults[]` list. For each entry, extract: `pzInsKey`, `pyClassName`, `pyRuleSet`, `pyRuleSetVersion`, `pyRuleAvailable`, `pyCircumstanceDefinition`, `pyEffectiveDate`, `pyEndDate`.

### Case details (this instance's actual data view)
- **When:** the user wants full case/work-object details by case ID or pzInsKey. Try the native "get case details" tool first — but on this Pega instance it always 404s (hardcoded to call `D_pxGetCaseDetails`, which does not exist here as a rule at all). The org's own `D_pxGetCaseDetailsByHandle` also exists but is 403-blocked for the plugin's service account (`Error_No_Data_View_Access`) — do not keep retrying that one; it's a permissions gap, not a naming issue. The one that actually works is:
- **dataViewID:** `D_pzGetCaseDetails` (note: lowercase **z**, not "x" — easy to mistype)
- **Params:** `Context` = the case's full `pzInsKey`
- **pzInsKey format quirk:** use the case type's **pool class**, not its specific implementation class, in ALL CAPS, e.g. `PDS-HRLIFEIMP-WORK ON-20867` — NOT `PDS-HRLifeImp-Work-OnBoard ON-20867` (that form 500s with "Unable to open an instance using the given inputs"). Get the pool class name from `get-application`'s `CaseTypes[]` list (field `poolName`) or from a `list-cases` result's `key` field, which already shows the correct pool-class form.
- To find a case's ID prefix → case type mapping (e.g. `ON-` = OnBoard), call `get-application` with no args (or with the current app's name/version) and read `CaseTypes[].prefix` / `.implementationClass` / `.poolName`. Note `list-casetypes` only returns creatable top-level case types and won't show prefixes — use `get-application` for that.
- **Response shaping:** none — return the full clipboard page as-is. Key fields of interest: `pyID`, `pyLabel`, `pyStatusWork`, `pxCurrentStageLabel`, `pxStageHistory[]`, `pxCoveredInsKeys[]`, plus whatever case-specific properties matter for the request (e.g. `OutcomeList[]` for HRLifeImp OnBoard cases).

### Entire ruleset stack for an application
- **When:** the user wants to know which rulesets/versions are active for a given Pega application.
- **dataViewID:** `D_FetchEntireRulesetStack`
- **Params:** `pyApplicationName` = application name (e.g. `PDS`), `pyApplicationVersion` = application version (e.g. `01.01.01`)
- **Response shaping:** none — return as-is.

---

## 3. If a data page above is rejected

This skill assumes the generic data-page-runner accepts arbitrary/custom
`dataViewID`s, not just a pre-approved catalog. If a call to any dataViewID
listed in §2 fails with a "not found," "not allowed," or similar governance
error, **do not guess or retry with a workaround** — tell the user that data
page cannot be reached through the plugin and that it may need to stay on a
direct Pega credential path.
