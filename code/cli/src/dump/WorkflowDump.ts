import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { findResource } from '../resolver/Resource.js';
import { compareSlugs } from '../resolver/Resource.js';
import type { EffectiveResourceSet } from '../resolver/Resource.js';
import type { AgentDefaults, HarnessDefaults } from '../settings/Settings.js';
import { isWorkflowDefinitionIssue, readWorkflowDefinition } from '../resolver/WorkflowDefinition.js';
import type { WorkflowDefinition } from '../resolver/WorkflowDefinition.js';
import { resolveWorkflowOutputs } from '../resolver/WorkflowOutput.js';
import { dumpAgent } from './Dump.js';
import type { DumpResult } from './Dump.js';
import { escapesRoots } from './Containment.js';

/** Walks a workflow root through its nested workflows, collecting every agent actor it references. */
export const collectWorkflowClosure = (set: EffectiveResourceSet, root: string) => {
  const workflows: WorkflowDefinition[] = [];
  const agents = new Set<string>();
  const errors: string[] = [];
  const seen = new Set<string>();
  const queue = [root];
  while (queue.length > 0) {
    const slug = queue.shift()!;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const resource = findResource(set, 'workflow', slug);
    if (resource === undefined) {
      errors.push(`workflow '${root}' references unknown workflow '${slug}'.`);
      continue;
    }
    const definition = readWorkflowDefinition(resource.winner.path);
    if (isWorkflowDefinitionIssue(definition)) {
      errors.push(`workflow '${slug}': ${definition.message}`);
      continue;
    }
    if (definition.id !== slug) {
      errors.push(`workflow id '${definition.id}' must match its directory '${slug}'.`);
      continue;
    }
    workflows.push(definition);
    for (const actor of Object.values(definition.actors)) if (actor.kind === 'agent') agents.add(actor.profile);
    for (const node of definition.nodes) if (node.workflow !== undefined) queue.push(node.workflow);
  }
  return { workflows, agents: [...agents].sort(), errors };
};

const mergeTree = (source: string, target: string, written: string[], errors: string[]): void => {
  /* v8 ignore next -- dumpAgent always creates its .agents output root. */
  if (!existsSync(source)) return;
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    /* v8 ignore next -- dumpAgent copies resources and never emits symbolic links. */
    if (lstatSync(sourcePath).isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      mergeTree(sourcePath, targetPath, written, errors);
    } else if (entry.isFile()) {
      if (existsSync(targetPath)) {
        /* v8 ignore next 2 -- resolved closures can repeat only the same winning resource; this remains defensive. */
        if (!lstatSync(targetPath).isFile() || !readFileSync(targetPath).equals(readFileSync(sourcePath)))
          errors.push(`workflow closure contains conflicting file '${targetPath}'.`);
        continue;
      }
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
      written.push(targetPath);
    }
  }
};

/** Export a workflow and every nested workflow/agent closure. Workflows remain configuration only. */
export const dumpWorkflow = (
  set: EffectiveResourceSet,
  workflowSlug: string,
  outDirectory: string,
  projectDirectory?: string,
  agentDefaults?: AgentDefaults,
  harnessDefaults?: HarnessDefaults,
): DumpResult => {
  const closure = collectWorkflowClosure(set, workflowSlug);
  if (closure.errors.length > 0) return { writtenPaths: [], warnings: [], errors: closure.errors };
  const outRoot = join(outDirectory, '.agents');
  if (existsSync(outRoot))
    return { writtenPaths: [], warnings: [], errors: [`workflow dump refuses existing destination '${outRoot}'.`] };

  const temporary = mkdtempSync(join(tmpdir(), 'outfitter-workflow-'));
  mkdirSync(outRoot, { recursive: true });
  const written: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const compositions: unknown[] = [];
  const definitions = new Map(closure.workflows.map((workflow) => [workflow.id, workflow] as const));

  try {
    for (const agent of closure.agents) {
      const agentDump = join(temporary, agent);
      const result = dumpAgent(set, agent, agentDump, projectDirectory, agentDefaults, harnessDefaults);
      warnings.push(...result.warnings);
      errors.push(...result.errors);
      const composition = join(agentDump, '.agents', '.outfitter', 'composition.json');
      /* v8 ignore next -- a successful dumpAgent always writes its composition manifest. */
      if (existsSync(composition)) {
        const parsed = JSON.parse(readFileSync(composition, 'utf8')) as { compositions: unknown[] };
        compositions.push(...parsed.compositions);
        rmSync(composition);
      }
      mergeTree(join(agentDump, '.agents'), outRoot, written, errors);
    }

    for (const workflow of closure.workflows) {
      const resource = findResource(set, 'workflow', workflow.id)!;
      if (
        escapesRoots(
          resource.winner.path,
          set.layers.map((layer) => layer.root),
        )
      ) {
        errors.push(`workflow '${workflow.id}' resolves outside the tree and cannot be safely dumped.`);
        continue;
      }
      const target = join(outRoot, 'workflows', workflow.id, 'workflow.yaml');
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(resource.winner.path, target);
      written.push(target);
    }

    if (errors.length > 0) {
      rmSync(outRoot, { recursive: true, force: true });
      return { writtenPaths: [], warnings, errors };
    }
    const fileEntries = written
      .map((path) => ({
        path: path.slice(outRoot.length + 1),
        sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
      }))
      .sort((a, b) => compareSlugs(a.path, b.path));
    const manifestTarget = join(outRoot, '.outfitter', 'workflow-composition.json');
    mkdirSync(dirname(manifestTarget), { recursive: true });
    writeFileSync(
      manifestTarget,
      `${JSON.stringify(
        {
          version: 1,
          root: workflowSlug,
          workflows: closure.workflows.map((workflow) => {
            const resource = findResource(set, 'workflow', workflow.id)!;
            return {
              id: workflow.id,
              outputs: resolveWorkflowOutputs(workflow, definitions),
              source: {
                layer: resource.winner.layer.label,
                path: relative(resource.winner.layer.root, resource.winner.path),
              },
            };
          }),
          agents: closure.agents,
          compositions,
          files: fileEntries,
        },
        null,
        2,
      )}\n`,
    );
    written.push(manifestTarget);
    return { writtenPaths: written.sort(), warnings: [...new Set(warnings)], errors: [] };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
};
