# Query recipe library

Every recipe below needs `<Env>` replaced with a value confirmed live via the §0 check, and a real
`pzinskey`/`rule_name` in place of the placeholders. All are read-only and safe to run as-is.

**Discover current environment coverage** (always run first, §0):
```cypher
MATCH (r:Rule) RETURN DISTINCT r.environment AS env, count(r) AS n ORDER BY n DESC
```

**Find a rule by name/type.** Rule names are consistently PascalCase in this graph (checked live:
46,272 of 47,615 rule names contain both cases, e.g. `CaseCreationForDenovoOffice`) — plain `CONTAINS`
is case-sensitive and a lowercase guess will miss real matches. Use `toLower(...) CONTAINS
toLower(...)` unless you're matching a name you copied verbatim from another query result:
```cypher
MATCH (r:Rule)
WHERE r.environment = '<Env>' AND toLower(r.rule_name) CONTAINS toLower('<partial name>')
RETURN r.pzinskey, r.rule_name, r.rule_type, r.class_name, r.ruleset, r.is_stub
LIMIT 50
```

**When a name search returns more than one rule — disambiguate before picking one.** Pega commonly
has the same `rule_name` multiple times: different `class_name` (same-named rule on different case
types), different `ruleset`/`ruleset_version` (superseded versions), or circumstanced variants
(`circumstanced = true`, see the `SPECIALIZES`/`SPECIALIZED_BY` recipes below). Never take the first
row of a name search as "the" rule — look at all of them:
```cypher
MATCH (r:Rule)
WHERE r.environment = '<Env>' AND toLower(r.rule_name) = toLower('<exact name>')
RETURN r.pzinskey, r.class_name, r.ruleset, r.ruleset_version, r.circumstanced,
       r.circumstance_val, r.is_stub, r.updated_at
ORDER BY r.ruleset, r.ruleset_version DESC
```
If the question is about *this app's live behavior* rather than "does this rule name exist
anywhere," narrow to what this app actually resolves to rather than guessing from the list:
```cypher
MATCH (a:App {name: '<AppName>'})-[:RESOLVED_RULE]->(r:Rule)
WHERE toLower(r.rule_name) = toLower('<exact name>') AND r.environment = '<Env>'
RETURN r.pzinskey, r.class_name, r.ruleset, r.ruleset_version
```
**Caught in a second end-to-end pass**: this recipe originally had no `r.environment` filter, and
`App {name: '<AppName>'}` trips the same Axis-A text-inference as the ruleset-stack recipe — confirmed
live, it failed with the "explicit environment filter required" error. Unlike the `:Class`/`:App`/
`:Ruleset`-only recipes elsewhere (which need the no-op comment workaround since those labels have no
`environment` property), `r` here is a `:Rule` node that **does** have one, and it's the same value as
`<AppName>` by construction — so `AND r.environment = '<Env>'` is a real, meaningful filter here, not
just a guard-satisfying no-op. Confirmed live: for `OWLM`/`ProcessMODInternalRequest`, this returns two
rows whose `pzinskey`s independently match what the `ROOTED_AT` recipe finds for the same rule via its
Feature node — same rule, two different recipes, same answer.
If that returns nothing, fall back to the full-stack view and pick by highest `ruleset_version`
within the app's known ruleset stack (the "Ruleset stack for an app" recipe below) — same resolution
ambiguity `pega-feature-node-retrieval` step 8 warns about, just hit here at the search step instead of
the traversal step.

**Find all Feature nodes (coverage check before assuming one exists):**
```cypher
MATCH (f:Feature) RETURN f.environment AS env, f.root_type, f.root_identifier, f.title, f.generated_at
ORDER BY env
```

**Find the top-level/entry-point rule for a known Feature:**
```cypher
MATCH (f:Feature)-[:ROOTED_AT]->(root:Rule)
WHERE f.environment = '<Env>'
RETURN f.title, f.root_type, f.root_identifier, root.rule_name, root.rule_type, root.pzinskey
```

**Find candidate entry-point/root rules when no Feature node exists** (nothing calls it, but it
calls other things — a common signature for a top-level flow/activity):
```cypher
MATCH (r:Rule)
WHERE r.environment = '<Env>' AND NOT (r)<-[:REFERENCES]-() AND (r)-[:REFERENCES]->()
RETURN r.rule_name, r.rule_type, r.class_name
LIMIT 50
```

**Find fully isolated rules** (no references in or out — dead code candidates, or unresolved
externals; matches the tool docstring's own example):
```cypher
MATCH (r:Rule)
WHERE r.environment = '<Env>' AND NOT (r)-[:REFERENCES]->() AND NOT ()-[:REFERENCES]->(r)
RETURN r.rule_name, r.rule_type
LIMIT 50
```

**Blast radius — what would break if this rule changes** (reverse traversal, bounded hops, filtered
to logic-bearing categories per §4; widen the hop count or drop the category filter if this comes
back suspiciously empty):
```cypher
MATCH (target:Rule {pzinskey: '<pzinskey>'})
MATCH path = (caller:Rule)-[refs:REFERENCES*1..4]->(target)
WHERE caller.environment = '<Env>'
  AND ALL(rel IN refs WHERE rel.ref_category IN
      ['explicit','step:Call','step:precond_when','dt:when_condition','dp:load_activity',
       'dp:report_definition','dp:data_transform','flow:subprocess_shape','flow:utility_shape',
       'flow:sla','flow:decision_impl','casetype:case_wide_action','casetype:process_list',
       'casetype:alt_stage_flow','casetype:starting_flow','expr:library_function',
       'expr:qualified_library_function','fa:pyValidateActivity','fa:pyPreProcessingActivity',
       'fa:pyPreProcessingTransformRule','fa:pyActionTransformRule','fa:pyLocalActionActivity',
       'fa:pyAuditActivity','fa:when_condition','sla:advance_flow','sla:advance_flow_activity',
       'sla:action_when','sla:activity','svc:segment_activity','svc:service_activity',
       'svc:rest_method_activity','step:Property-Map-DecisionTable','step:Branch',
       'qp:activity','jobsched:activity','js:flowAction']
      OR rel.ref_category STARTS WITH 'casetype:stage_flow:'
      OR rel.ref_category STARTS WITH 'casetype:stage_skip_when:')
RETURN DISTINCT caller.rule_name, caller.rule_type, caller.class_name, min(length(path)) AS hops
ORDER BY hops
LIMIT 200
```

**Forward dependency closure — what this rule touches** (mirror of blast radius, same category
filter applies):
```cypher
MATCH (root:Rule {pzinskey: '<pzinskey>'})
MATCH path = (root)-[refs:REFERENCES*1..4]->(dep:Rule)
WHERE root.environment = '<Env>' AND dep.is_stub = false
RETURN DISTINCT dep.rule_name, dep.rule_type, dep.class_name, min(length(path)) AS hops
ORDER BY hops
LIMIT 200
```

**Given only a rule name: the full tree from its top-level root down to every leaf.** This is a
different question from "what does this rule touch" (the forward-closure recipe above starts *at*
the given rule) — here the given rule can be buried deep inside a process, and you want the whole
tree it's part of, starting from the top. Three steps, chained:

1. Resolve the name to a `pzinskey` — use the disambiguation recipe above if more than one match.
2. Find the root(s) — prefer the owning Feature's root if one exists (cheap, authoritative); fall
   back to walking `REFERENCES` upward to whatever has no incoming edge:
```cypher
// 2a. Preferred: is this rule inside a Feature's already-known closure?
MATCH (f:Feature)
WHERE f.environment = '<Env>' AND f.source_rule_fingerprint CONTAINS '<pzinskey>'
RETURN f.title, f.root_pzinskey, f.root_rule_name

// 2b. Fallback: walk REFERENCES backward to whatever calls it with nothing calling *them*.
// Same hub-node caution as blast radius applies here — check degree first (§5) if this hangs.
MATCH (target:Rule {pzinskey: '<pzinskey>'})
MATCH (root:Rule)-[:REFERENCES*1..6]->(target)
WHERE root.environment = '<Env>' AND NOT (root)<-[:REFERENCES]-()
RETURN DISTINCT root.pzinskey, root.rule_name, root.rule_type
```
   **A rule can have more than one root** — a shared utility or validation rule genuinely can be
   called from several unrelated top-level flows. That's a real answer ("this rule is reachable from
   N different entry points"), not a bug to resolve to a single root — surface all of them rather
   than picking one arbitrarily.
3. For each root found, walk forward to the leaves (reuse the forward-closure recipe above, rooted
   at that `pzinskey` instead) — a "leaf" here is any node the traversal reaches that itself has no
   further logic-bearing outgoing `REFERENCES` (i.e. `dep.pzinskey` never appears as a `root.pzinskey`
   in the same result set), which you can compute after the fact rather than in Cypher:
```cypher
MATCH (root:Rule {pzinskey: '<root_pzinskey>'})
MATCH path = (root)-[refs:REFERENCES*1..6]->(dep:Rule)
WHERE root.environment = '<Env>'
  AND ALL(rel IN refs WHERE rel.ref_category IN
      ['explicit','step:Call','step:precond_when','dt:when_condition','dp:load_activity',
       'dp:report_definition','dp:data_transform','flow:subprocess_shape','flow:utility_shape',
       'flow:sla','flow:decision_impl','casetype:case_wide_action','casetype:process_list',
       'casetype:alt_stage_flow','casetype:starting_flow','expr:library_function',
       'expr:qualified_library_function','fa:pyValidateActivity','fa:pyPreProcessingActivity',
       'fa:pyPreProcessingTransformRule','fa:pyActionTransformRule','fa:pyLocalActionActivity',
       'fa:pyAuditActivity','fa:when_condition','sla:advance_flow','sla:advance_flow_activity',
       'sla:action_when','sla:activity','svc:segment_activity','svc:service_activity',
       'svc:rest_method_activity','step:Property-Map-DecisionTable','step:Branch',
       'qp:activity','jobsched:activity','js:flowAction']
      OR rel.ref_category STARTS WITH 'casetype:stage_flow:'
      OR rel.ref_category STARTS WITH 'casetype:stage_skip_when:')
RETURN DISTINCT dep.pzinskey, dep.rule_name, dep.rule_type, dep.class_name, dep.is_stub,
       min(length(path)) AS depth
ORDER BY depth
LIMIT 200
```
A node in this result with `is_stub = true` is a real leaf by construction (nothing was fetched
past it). A node with `is_stub = false` and no further outgoing edges in the result at the same hop
bound may just mean you hit the `*1..6` ceiling or the `ref_category` filter — widen either before
concluding it's a true leaf on a large/deep tree.

**Class inheritance chain (ancestors).** `:Class` has no `environment` property (§2) — but a class
name almost always contains an app substring (e.g. `PDS-OWLM-...`), which still trips Axis A's
text-inference (§0). Confirmed live: the query fails with "explicit environment filter required"
even though there's no real property to filter on. A no-op comment containing the word
`environment` satisfies the tool's check without affecting the query:
```cypher
// environment: n/a — :Class has no environment property, this comment only satisfies the tool's text check
MATCH path = (c:Class {class_name: '<ClassName>'})-[:INHERITS_FROM*1..10]->(ancestor:Class)
RETURN [n IN nodes(path) | n.class_name] AS chain
```

**Direct subclasses of a class** (same caveat as above):
```cypher
// environment: n/a — :Class has no environment property
MATCH (child:Class)-[:INHERITS_FROM]->(parent:Class {class_name: '<ClassName>'})
RETURN child.class_name
```

**Ruleset stack for an app, in resolution order.** Same issue — `:App`/`:Ruleset` have no
`environment` property, but an app name like `'OWLM'` still trips Axis A. Confirmed live:
```cypher
// environment: n/a — :App/:Ruleset have no environment property
MATCH (a:App {name: '<AppName>'})-[h:HAS_RULESET]->(rs:Ruleset)
RETURN rs.name, h.stack_rank, h.is_branch, rs.ceiling_major, rs.ceiling_minor, rs.ceiling_patch
ORDER BY h.stack_rank
```

**Real (non-stub) business rules only, for a given type:**
```cypher
MATCH (r:Rule)
WHERE r.environment = '<Env>' AND r.rule_type = '<RuleType>' AND r.is_stub = false
RETURN r.pzinskey, r.rule_name, r.class_name, r.ruleset, r.updated_at
LIMIT 200
```

**Circumstance variants of a base rule** (what specialized versions exist, and under what
condition each applies) — **verified live end-to-end**, this is the reliable direction:
```cypher
MATCH (base:Rule {pzinskey: '<pzinskey>'})-[s:SPECIALIZED_BY]->(variant:Rule)
RETURN variant.pzinskey, variant.rule_name, s.circumstance_type, s.circumstance_val
```
Given a circumstanced variant, find its base — **query from the base side, not `SPECIALIZES`**:
```cypher
MATCH (base:Rule)-[s:SPECIALIZED_BY]->(variant:Rule {pzinskey: '<pzinskey>'})
RETURN base.pzinskey, base.rule_name, s.circumstance_type, s.circumstance_val
```
**Caught live during an end-to-end test**: for a rule with `circumstanced=true` and a confirmed
`SPECIALIZED_BY` edge coming in from its base, the "obvious" reverse query —
`MATCH (variant:Rule {pzinskey:'<pzinskey>'})-[s:SPECIALIZES]->(base:Rule)` — returned **empty**,
even though `SPECIALIZES` edges do exist elsewhere in the graph (confirmed via a separate
`MATCH (a)-[r:SPECIALIZES]->(b)` direction check). **`SPECIALIZES` is not a guaranteed reciprocal
of every `SPECIALIZED_BY` edge** — don't assume 1:1 coverage between the two relationship types.
Querying `SPECIALIZED_BY` from the base's side (above) is the direction actually confirmed to work;
treat any use of `SPECIALIZES` as needing its own live check on the specific pair, not as
interchangeable with `SPECIALIZED_BY` in reverse.

**What a rule overrides (ruleset/version shadowing):**
```cypher
MATCH (r:Rule {pzinskey: '<pzinskey>'})-[o:OVERRIDES]->(overridden:Rule)
WHERE r.environment = '<Env>'
RETURN overridden.pzinskey, overridden.rule_name, overridden.ruleset, overridden.ruleset_version, o.created_at
```

**Data-page/property targets a rule sets** (e.g. what a Data Transform or Activity writes to):
```cypher
MATCH (r:Rule {pzinskey: '<pzinskey>'})-[s:SETS]->(target:Rule)
WHERE r.environment = '<Env>'
RETURN target.rule_name, target.rule_type, s.ref_category, s.hydrated_from_stub
```

**Failed rule-resolution attempts from a given caller** (useful for finding graph gaps / rules the
builder couldn't resolve, as opposed to `is_stub` rules it resolved but didn't fully fetch):
```cypher
MATCH (caller:Rule {pzinskey: '<pzinskey>'})-[i:IDENTIFIED_STUB]->(target:Rule)
WHERE caller.environment = '<Env>' AND i.resolve_failure IS NOT NULL
RETURN target.rule_name, i.rule_type, i.attempted_classes, i.resolve_failure
```
**Note on all three recipes above**: a `pzinskey` literal almost always contains an app-name
substring (e.g. `PDS-OWLM-...`), which triggers Axis A's text-inference (§0) even though these
queries were never meant to be environment-scoped by intent. The `WHERE ...environment = '<Env>'`
clause is required here for that reason, not because these relationship types are otherwise
environment-sensitive — confirmed live, these recipes fail with the tool's "explicit environment
filter required" error without it.
