import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { discoverLayers } from '../../src/resolver/Layer.js';
import { listResources } from '../../src/resolver/Resource.js';
import { resolveResources } from '../../src/resolver/Resolver.js';
import { validateEffectiveSet } from '../../src/resolver/ResolverValidation.js';
import { readWorkflowDefinition } from '../../src/resolver/WorkflowDefinition.js';
import type { WorkflowDefinition, WorkflowDefinitionIssue } from '../../src/resolver/WorkflowDefinition.js';
import { resolveWorkflowOutputs } from '../../src/resolver/WorkflowOutput.js';
import { validateOutputValue, WORKFLOW_OUTPUT_TYPES } from '../../src/validation/SchemaValidator.js';
import type { WorkflowOutputType } from '../../src/validation/SchemaValidator.js';

const roots: string[] = [];
const writeWorkflow = (outputs: string): string => {
  const root = mkdtempSync(join(tmpdir(), 'outfitter-workflow-output-schema-'));
  roots.push(root);
  const path = join(root, 'workflow.yaml');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `version: 1
id: delivery
title: Delivery
description: Deliver a change.
actors: {}
outputs:
${outputs}
nodes:
  - {id: draft, action: draft, description: Draft a pull request.}
  - {id: review, workflow: review, description: Review the pull request.}
`,
  );
  return path;
};

const readIssue = (outputs: string): WorkflowDefinitionIssue =>
  readWorkflowDefinition(writeWorkflow(outputs)) as WorkflowDefinitionIssue;

const writeCatalogWorkflow = (catalog: string, slug: string, content: string): void => {
  const path = join(catalog, 'workflows', slug, 'workflow.yaml');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};

const resolveCatalog = (catalogWorkflows: Readonly<Record<string, string>>) => {
  const root = mkdtempSync(join(tmpdir(), 'outfitter-workflow-output-catalog-'));
  roots.push(root);
  const home = join(root, 'home');
  const project = join(root, 'project');
  const catalog = join(project, '.agents');
  for (const [slug, content] of Object.entries(catalogWorkflows)) writeCatalogWorkflow(catalog, slug, content);
  const set = resolveResources(
    discoverLayers({ homeDirectory: home, projectDirectory: project, settings: { sources: [] } }).layers,
  );
  return { project, set };
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const sha = 'a'.repeat(40);
const validOutputValues: Readonly<Record<WorkflowOutputType, unknown>> = {
  'pull-request': {
    number: 12,
    html_url: 'https://forge.example/acme/widgets/pulls/12',
    head: { sha, label: 'feature' },
    base: { repo: { full_name: 'acme/widgets', private: false } },
    merge_commit_sha: null,
    title: 'Ship it',
  },
  'git-commit': {
    sha,
    html_url: `https://forge.example/acme/widgets/commit/${sha}`,
    repository: 'acme/widgets',
    message: 'Ship it',
  },
  'git-branch': {
    name: 'feature/workflow-outputs',
    commit: { sha, url: `https://forge.example/acme/widgets/commit/${sha}` },
    repository: 'acme/widgets',
    protected: false,
  },
  issue: {
    number: 377,
    html_url: 'https://forge.example/acme/widgets/issues/377',
    repository: 'acme/widgets',
    title: 'Typed workflow outputs',
  },
};

// THIS TEST VALIDATES A HARD REQUIREMENT (OFTR-012.2). YOU MUST NOT MODIFY THIS TEST UNLESS THE REQUIREMENT CHANGES. Workflow output declarations have exclusive, closed, schema-validated shapes.
describe('workflow output declaration schema', () => {
  it('parses action outputs and nested output mappings', () => {
    const result = readWorkflowDefinition(
      writeWorkflow(`  pull-request:
    from: draft
    type: pull-request
  verdict:
    from: review
    output: verdict
`),
    ) as WorkflowDefinition;

    expect(result.outputs).toEqual({
      'pull-request': { from: 'draft', type: 'pull-request' },
      verdict: { from: 'review', output: 'verdict' },
    });
  });

  it.each([
    ['an unknown output type', '  result: {from: draft, type: deployment}\n'],
    ['both type and output', '  result: {from: draft, type: issue, output: verdict}\n'],
    ['neither type nor output', '  result: {from: draft}\n'],
    ['an invalid output name', '  BadName: {from: draft, type: issue}\n'],
    ['an extra output entry key', '  result: {from: draft, type: issue, label: Result}\n'],
  ])('rejects %s', (_description, outputs) => {
    expect(readIssue(outputs).message).toContain('workflow.yaml is invalid');
  });

  it('rejects duplicate YAML output keys', () => {
    expect(
      readIssue(`  result: {from: draft, type: issue}
  result: {from: draft, type: git-commit}
`).message,
    ).toContain('workflow.yaml is not valid YAML');
  });
});

// THIS TEST VALIDATES A HARD REQUIREMENT (OFTR-012.3). YOU MUST NOT MODIFY THIS TEST UNLESS THE REQUIREMENT CHANGES. Every supported output type has a forge-neutral value schema synchronized with the workflow enum.
describe('workflow output value schemas', () => {
  it.each(WORKFLOW_OUTPUT_TYPES)('accepts a well-formed %s and rejects a missing required field', (type) => {
    expect(validateOutputValue(type, validOutputValues[type])).toEqual({ valid: true, issues: [] });
    expect(validateOutputValue(type, {})).toMatchObject({ valid: false });
  });

  it('keeps the exported type list, workflow enum, and schema files synchronized', () => {
    const schemaDirectory = new URL('../../src/schemas/', import.meta.url);
    const workflowSchema = JSON.parse(readFileSync(new URL('workflow.schema.json', schemaDirectory), 'utf8')) as {
      properties: { outputs: { additionalProperties: { oneOf: [{ properties: { type: { enum: string[] } } }] } } };
    };
    const schemaTypes = readdirSync(schemaDirectory)
      .map((name) => /^output-type\.(.+)\.schema\.json$/u.exec(name)?.[1])
      .filter((type): type is string => type !== undefined)
      .sort();

    expect(workflowSchema.properties.outputs.additionalProperties.oneOf[0].properties.type.enum).toEqual(
      WORKFLOW_OUTPUT_TYPES,
    );
    expect(schemaTypes).toEqual([...WORKFLOW_OUTPUT_TYPES].sort());
  });
});

// THIS TEST VALIDATES A HARD REQUIREMENT (OFTR-012.2). YOU MUST NOT MODIFY THIS TEST UNLESS THE REQUIREMENT CHANGES. Output sources and nested mappings resolve only across compatible nodes and declared nested outputs.
describe('workflow output reference validation', () => {
  it('reports every invalid output source and mapping shape', () => {
    const { project, set } = resolveCatalog({
      child: `version: 1
id: child
title: Child
description: Child workflow.
actors: {}
nodes:
  - {id: work, action: work, description: Work.}
`,
      invalid: `version: 1
id: invalid
title: Invalid
description: Invalid output references.
actors: {}
outputs:
  missing-source: {from: absent, type: issue}
  workflow-with-type: {from: nested, type: issue}
  action-with-output: {from: work, output: result}
  missing-nested-output: {from: nested, output: absent}
nodes:
  - {id: work, action: work, description: Work.}
  - {id: nested, workflow: child, description: Run child.}
`,
    });

    expect(validateEffectiveSet(set, project).map((finding) => finding.message)).toEqual(
      expect.arrayContaining([
        "output 'missing-source' references unknown node 'absent'.",
        "output 'workflow-with-type' uses type with workflow node 'nested'; nested workflow outputs must use output.",
        "output 'action-with-output' maps output from action node 'work'; action outputs must use type.",
        "output 'missing-nested-output' references unknown output 'absent' on workflow 'child'.",
      ]),
    );
  });

  it('resolves output types through a two-level nested mapping chain', () => {
    const { project, set } = resolveCatalog({
      leaf: `version: 1
id: leaf
title: Leaf
description: Produce a verdict.
actors: {}
outputs:
  verdict: {from: decide, type: issue}
nodes:
  - {id: decide, action: decide, description: Decide.}
`,
      middle: `version: 1
id: middle
title: Middle
description: Map the leaf verdict.
actors: {}
outputs:
  result: {from: leaf, output: verdict}
nodes:
  - {id: leaf, workflow: leaf, description: Run leaf.}
`,
      root: `version: 1
id: root
title: Root
description: Map the middle result.
actors: {}
outputs:
  final: {from: middle, output: result}
nodes:
  - {id: middle, workflow: middle, description: Run middle.}
`,
    });
    const findings = validateEffectiveSet(set, project);
    const definitions = new Map(
      listResources(set, 'workflow').map((resource) => {
        const definition = readWorkflowDefinition(resource.winner.path) as WorkflowDefinition;
        return [resource.slug, definition] as const;
      }),
    );

    expect(findings).toEqual([]);
    expect(resolveWorkflowOutputs(definitions.get('root')!, definitions)).toEqual({
      final: { from: 'middle', type: 'issue', output: 'result' },
    });
  });

  it('does not add an output error when the nested workflow itself is unknown', () => {
    const { project, set } = resolveCatalog({
      root: `version: 1
id: root
title: Root
description: Reference an unknown workflow once.
actors: {}
outputs:
  final: {from: missing, output: result}
nodes:
  - {id: missing, workflow: absent, description: Run missing workflow.}
`,
    });
    const messages = validateEffectiveSet(set, project).map((finding) => finding.message);

    expect(messages.filter((message) => message.includes("workflow 'absent'"))).toEqual([
      "node 'missing' references unknown workflow 'absent'.",
    ]);
    expect(messages.some((message) => message.includes("output 'final'"))).toBe(false);
  });

  it('bounds output resolution when invalid nested definitions form a cycle', () => {
    const cyclic = {
      version: 1,
      id: 'cycle',
      title: 'Cycle',
      description: 'Cycle output mappings.',
      actors: {},
      outputs: { result: { from: 'again', output: 'result' } },
      nodes: [{ id: 'again', workflow: 'cycle', description: 'Recurse.' }],
    } satisfies WorkflowDefinition;

    expect(resolveWorkflowOutputs(cyclic, new Map([['cycle', cyclic]]))).toEqual({});
  });
});
