# OFTR-013: Workflow Contract

## Overview

Outfitter resolves, validates, lists, and exports declarative workflow resources without executing
them. This contract defines the workflow resource and its typed output declarations for
[#377](https://github.com/ai-outfitter/outfitter/issues/377).

## Requirements

### OFTR-013.1: Workflow Resource Shape

1. A workflow resource MUST declare `version: 1`, and its `id` MUST match the directory slug that
   contains its `workflow.yaml` file.
2. Every node MUST declare exactly one of `action` or `workflow`.
3. Every node `needs` reference MUST name another node in the same workflow.
4. Every nested `workflow` reference MUST resolve by workflow slug.
5. Nested workflow references MUST NOT form a cycle.

### OFTR-013.2: Output Declarations

1. A workflow MAY declare an `outputs` object whose property names MUST match the workflow node ID
   pattern.
2. Every output entry MUST take exactly one of two shapes: `{ from, type }` or `{ from, output }`.
   An output entry MUST NOT carry any other property.
3. An output entry's `from` value MUST name a node in the declaring workflow.
4. An output entry with `type` MUST name an action node. An output entry with `output` MUST name a
   nested-workflow node.
5. An output entry with `output` MUST name an output declared by the referenced nested workflow.
6. An action output's type is its declared `type`. A mapped output's type is the type of the named
   nested workflow output, resolved through every mapping level.
7. Existing workflows without an `outputs` object MUST remain valid.

### OFTR-013.3: Output Value Types

1. An output `type` MUST be one of `pull-request`, `git-commit`, `git-branch`, or `issue`. Any other
   value MUST be rejected.
2. Outfitter MUST publish one JSON Schema for each supported output type.
3. Each output value schema MUST describe the forge-neutral field subset shared by the GitHub and
   Forgejo REST representations of that resource, and MAY be extended by an execution engine with
   additional fields.

### OFTR-013.4: Export and Listing

1. Machine-readable workflow listings MUST include each workflow's resolved `outputs`, ordered by
   output name, with every entry carrying its resolved type.
2. The workflow composition manifest MUST include the same resolved `outputs` for every workflow
   in the closure.
3. Repeated exports of the same resolved workflow MUST produce byte-identical files.
4. Exported `workflow.yaml` files MUST remain verbatim copies of their source documents.

### OFTR-013.5: Execution Boundary

1. Outfitter MUST NOT execute workflows and MUST NOT record concrete output values.
2. Recording concrete output values is the responsibility of the execution engine.
3. Node `needs` references express only intra-workflow ordering. Cross-task dependencies MUST be
   evaluated by an execution engine against declared workflow outputs.
4. A runtime carrying a workflow output value over A2A SHOULD use the `outfitter-task/v1` artifact
   metadata keys `output` for the declared output name, `type` for its resolved output type, and
   `value` for the concrete value validated against that type's schema.
