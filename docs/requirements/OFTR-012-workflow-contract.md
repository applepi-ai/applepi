# OFTR-012: Workflow Contract

## Overview

Outfitter resolves, validates, lists, and exports declarative workflow resources without executing
them. This contract defines the workflow resource and its typed output declarations for
[#377](https://github.com/ai-outfitter/outfitter/issues/377).

## Requirements

### OFTR-012.1: Workflow Resource Shape

1. A workflow resource MUST declare `version: 1`, and its `id` MUST match the directory slug that
   contains its `workflow.yaml` file.
2. A workflow MUST declare its actors and nodes in the supported workflow resource shape.
3. Every node MUST declare exactly one of `action` or `workflow`.
4. Every node `needs` reference MUST name another node in the same workflow.
5. Every nested `workflow` reference MUST resolve by workflow slug.
6. Nested workflow references MUST NOT form a cycle.

### OFTR-012.2: Output Declarations

1. A workflow MAY declare an `outputs` object whose property names MUST match the workflow node ID
   pattern.
2. Every output entry MUST declare exactly one of the exclusive shapes `{ from, type }` or
   `{ from, output }`, and an output entry MUST NOT contain additional properties.
3. An output entry's `from` value MUST name a node in the declaring workflow.
4. An output entry with `type` MUST name an action node, and an output entry with `output` MUST name
   a nested-workflow node.
5. An output entry that maps a nested workflow output MUST name an output declared by the referenced
   nested workflow.
6. An action output's resolved type MUST be its declared `type`.
7. A mapped output's resolved type MUST be the resolved type of the named nested workflow output,
   including through multiple mapping levels.
8. Resolved outputs MUST be ordered deterministically by output name.

### OFTR-012.3: Output Value Types

1. An action output's `type` MUST be one of `pull-request`, `git-commit`, `git-branch`, or `issue`.
2. Outfitter MUST provide one JSON Schema for each supported output type.
3. Each output value schema MUST describe a forge-neutral field subset shared by the corresponding
   GitHub and Forgejo REST representations and MUST permit execution engines to carry additional
   fields.
4. The supported output type list MUST be the single source of truth for schema validation and MUST
   remain consistent with the workflow schema enum and the available output value schema files.

### OFTR-012.4: Export and Listing

1. `outfitter list workflows --json` MUST include each workflow's resolved, name-sorted `outputs`
   object and MUST use `{}` when the workflow declares no outputs.
2. The workflow composition manifest MUST include the same resolved `outputs` object for every
   workflow and MUST use `{}` when the workflow declares no outputs.
3. Output keys and fields in exported metadata MUST use a deterministic order.
4. Repeated dumps of the same effective resources MUST produce byte-identical files.
5. Dumped `workflow.yaml` files MUST remain verbatim copies of their source documents.
6. Existing workflows without output declarations MUST remain valid, and their listing and manifest
   exports MUST change only by the addition of an empty `outputs` object.
7. Non-JSON workflow listing output MUST remain unchanged.

### OFTR-012.5: Execution Boundary

1. Outfitter MUST NOT execute workflows or record concrete workflow output values.
2. Recording concrete output values MUST remain the responsibility of the execution engine.
3. Node `needs` references MUST represent only intra-workflow ordering.
4. Cross-task dependencies MUST be evaluated by an execution engine against declared workflow
   outputs.
5. A runtime carrying a workflow output value over A2A SHOULD use the `outfitter-task/v1` artifact
   metadata keys `output` for the declared output name, `type` for its resolved output type, and
   `value` for the concrete value validated against that type's schema.
