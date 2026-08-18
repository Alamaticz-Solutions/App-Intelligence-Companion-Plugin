# Sample Agent Prompt — Property-Resolution Agent (Wave 1)

This is an example of what the orchestrator pastes into a Claude Code Task tool call for a
Wave-1 Property-Resolution Agent. Study how it:

1. Names exact reference file paths (absolute — subagents don't inherit the skill's context)
2. Pastes the task-specific registry excerpts inline (not a pointer to "check the registry")
3. Specifies every required output-contract field the agent must return
4. Gives just enough context per property for the agent to start immediately

---

## Example prompt

```
You are a **Property-Resolution Agent** analyzing a batch of properties from the
ClinicianInformation Flow Action's dependency tree.

**Read these reference files before starting** (read each one fully):
- /absolute/path/to/references/analysis-steps.md — Steps 3–8 definitions
- /absolute/path/to/references/xml-mechanics.md — mandatory XML parsing rules
- /absolute/path/to/references/patterns-1-12.md — patterns 1–12
- /absolute/path/to/references/patterns-13-23.md — patterns 13–23
- /absolute/path/to/references/patterns-meta.md — environment mapping + target platform

**Environment:** HRLifeImp
**Target platform:** Pega Infinity 25.1

---

**Your batch (3 properties):**

1. `.ProviderData.ClinicianInfo.ClockId`
   - Binding section: ClinicianInformation_Existing
   - SmartPromptClass: PDS-ProviderCase
   - Control: pxAutoComplete
   - Cell source: datapage (D_GetProviderCaseInfo)

2. `.ProviderData.ClinicianInfo.ProviderName`
   - Binding section: ClinicianInformation_Existing
   - SmartPromptClass: PDS-ProviderCase
   - Control: pxTextInput (read-only)
   - Cell source: none (populated via pySetValueOnSelect from ClockId autocomplete)

3. `.OfficeType`
   - Binding section: ClinicianInformation_Existing_02
   - SmartPromptClass: PDS-FW-HRLifeFW-Work-ContractRequest
   - Control: pxTextInput (read-only)
   - Cell source: none (populated via data transform)

---

**For each property, perform:**
- Step 4: fetch the `Rule-Obj-Property` using `pega_get_rule_xml` or graph query. If
  the property is not found on the SmartPromptClass, walk the class chain using the
  procedure in `references/agent-roles.md` §Class resolution procedure.
- Step 6: apply the 5-way decision from `references/analysis-steps.md`.
- Step 6.6: if the property has `pyPropertyMode` = Page or PageList, apply the embedded
  page/page-list analysis.
- Check against all numbered patterns (1–23) and note any hits with exact evidence.

---

**Required output (per property — do not omit any field):**

```json
{
  "property_path": ".ProviderData.ClinicianInfo.ClockId",
  "leaf": "ClockId",
  "context_class": "PDS-ProviderCase",
  "resolved_chain": ["PDS-ProviderCase (direct)"],
  "type": "Text",
  "mode": "String",
  "default_control": "pxAutoComplete",
  "property_level_source": { "type": null, "name": null },
  "decision": "NEEDS_REVIEW",
  "verify_flags": [
    {
      "code": "CELL_LEVEL_SOURCE_NEEDS_APPWIDE",
      "detail": "autocomplete sourced from D_GetProviderCaseInfo at cell level",
      "why": "need Step 5 app-wide scan to confirm this source is consistent"
    }
  ],
  "constellation_config": {
    "field_type_hint": "Text",
    "control": "AutoComplete",
    "source": "D_GetProviderCaseInfo (pending queryable fix)"
  },
  "list_sourced": true,
  "pattern_hits": [
    { "pattern": "E14", "evidence": "pySetValueOnSelect copies .pyID, .pxObjClass, .pzInsKey (hidden)" }
  ],
  "reason": "Property found directly on PDS-ProviderCase. pyPropertyMode=String, pyStringType=Text. Autocomplete sourced from D_GetProviderCaseInfo at cell level — no property-level source. Decision deferred to Step 5 app-wide scan."
}
```

Return one JSON block per property. If a property cannot be resolved after exhausting
the class chain, return `decision: "NEEDS_REVIEW"` with `reason` citing the exact chain
walked and all classes checked.
```

---

## Notes for orchestrator authors

- The `\absolute\path\to\...` must be real absolute paths on the machine — subagents
  cannot resolve relative paths against the skill directory.
- Paste only the properties this agent needs, not the whole registry. Each agent gets
  its own slice.
- The JSON output format shown above must match `references/output-contracts.md`
  §`fields[]` schema exactly. Update this example if the schema changes.
