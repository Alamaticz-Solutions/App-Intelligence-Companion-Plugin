# Pega Infinity '25 (25.1.x) Constellation UI Capabilities Reference

This document serves as the local source of truth for Constellation UI capabilities in the target environment (Infinity '25). All version-sensitive capability claims made by subagents must verify against this cache before generating findings.

---

## 1. Picklists, Autocomplete, and Search Mappings

### Autocomplete Component
* **Display Limit:** Constellation `AutoComplete` supports displaying **only a single property** in its suggestion list (Pattern 11). 
* **Multi-column display:** Classic multi-column dropdowns/typeaheads (using `pyAdditionalFields` lists) are **unsupported**.
* **Remediation:** Redesign to display a single key value, and surface other fields read-only on the screen, or use a `SimpleTableSelect` modal.

### Multi-Select Selection
* **Combo Box vs. Table Selection:** While Cosmos React supports multi-select combo boxes, the proven Constellation-native mechanism for selecting multiple records is **`SimpleTableSelect` with `selectionMode: "multi"`** (Pattern 12).
* **Remediation:** Map list properties requiring multi-select to `SimpleTableSelect` configurations.

### Selection Copy Mappings
* **DX API Philosophy:** Constellation does not support copying a dozen fields through UI-level postValue event bindings (e.g. `pySetValueOnSelect`). Data should be linked via single- or multi-record **Data References** (Pattern E14).
* **Identifier Keys:** Do not copy internal identifiers like `.pyID`, `.pxObjClass`, and `.pzInsKey` as business data in Constellation views.

---

## 2. Lists and Tables (Repeating Layouts)

### Tables (SimpleTable / List Page)
* **Rendering:** Repeating Dynamic Layouts (RDLs) must be replaced with embedded list properties rendered via a **View of type `mobilelistpage`** (Pattern 9) or Cosmos-native table layouts.
* **Nesting:** Genuinely nested tables (outer-grid to inner-grid) require data model restructuring. Constellation does not support direct nested UI table grids.

### Editable Tables
* **Limits:** In-line editing in tables is supported for **Embedded Data lists** (records owned entirely by the case and modified inside the case).
* **Reference Lists:** Tables backed by reference data (read-only query data pages) are **read-only** in table forms. Editing must happen via separate modal edit flows.

---

## 3. Harnesses, Stages, and Navigation

### Case Initialization
* **Initialization Stage:** The legacy Pega "New Harness" is deprecated. Case creation must route through an **Initialization Stage** (represented by `pyIsInitializationStage=true` on the first stage of the Case Type) (Pattern 20).
* **Temporary Cases:** Temporary case creation (`pyCreateTemporaryObject=true`) is deprecated in Constellation (Pattern 18).

### Screen Flows & Custom Harnesses
* **Perform / Review Harnesses:** Constellation uses OOTB standard harnesses (`Perform`, `Review`, `pyCreate`) exclusively. Custom tabbed harnesses (like `PDSTabbedScreenFlow`) are **unsupported** (Pattern 23).
* **Remediation:** Redesign screen flows using standard Stage/Process multi-step navigation.

---

## 4. UI Expressions & Context

### Context Scope
* **Workspace / Thread Context:** Relative bindings (leading dot `.Property`) are required. Views cannot reference the top-level `pyWorkPage` or clipboard pages directly (Pattern 6).
* **UI Conditions:** Dynamic visibility/required-ness conditions must be evaluated against **Case Data** (Pattern E16). Referencing harness names, requestor details (`pxRequestor`), active portals, or client-side DOM states is unsupported.

---

## 5. Layout and Styling

### Pixel-Fidelity Layouts
* **Design Templates:** Constellation enforces clean, template-driven responsive layouts. Fixed pixel dimensions, inline styles, custom skin rules, and raw inline CSS classes are **unsupported** (Pattern E19).
* **Remediation:** Map layout elements to default Constellation structural templates.
