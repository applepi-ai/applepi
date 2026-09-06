import type { WorkflowDefinition, WorkflowOutput } from './WorkflowDefinition.js';
import type { WorkflowOutputType } from '../validation/SchemaValidator.js';

export interface ResolvedWorkflowOutput {
  readonly from: string;
  readonly type: WorkflowOutputType;
  readonly output?: string;
}

export type ResolvedWorkflowOutputs = Readonly<Record<string, ResolvedWorkflowOutput>>;

const resolvedActionType = (definition: WorkflowDefinition, output: WorkflowOutput): WorkflowOutputType | undefined => {
  const node = definition.nodes.find((candidate) => candidate.id === output.from);
  return node?.action === undefined ? undefined : output.type;
};

const resolvedMappedType = (
  workflowSlug: string | undefined,
  outputName: string,
  definitions: ReadonlyMap<string, WorkflowDefinition>,
  visited: ReadonlySet<string>,
): WorkflowOutputType | undefined => {
  if (workflowSlug === undefined) return undefined;
  const nested = definitions.get(workflowSlug);
  const nestedOutput = nested?.outputs?.[outputName];
  if (nested === undefined || nestedOutput === undefined) return undefined;

  const key = `${nested.id}\u0000${outputName}`;
  if (visited.has(key)) return undefined;
  return resolvedType(nested, nestedOutput, definitions, new Set([...visited, key]));
};

const resolvedType = (
  definition: WorkflowDefinition,
  output: WorkflowOutput,
  definitions: ReadonlyMap<string, WorkflowDefinition>,
  visited: ReadonlySet<string>,
): WorkflowOutputType | undefined => {
  if (output.type !== undefined) return resolvedActionType(definition, output);
  const workflowSlug = definition.nodes.find((candidate) => candidate.id === output.from)?.workflow;
  return resolvedMappedType(workflowSlug, output.output, definitions, visited);
};

/** Resolves and name-sorts the valid output declarations of one workflow without mutating inputs. */
export const resolveWorkflowOutputs = (
  definition: WorkflowDefinition,
  definitions: ReadonlyMap<string, WorkflowDefinition>,
): ResolvedWorkflowOutputs => {
  const resolved: Record<string, ResolvedWorkflowOutput> = {};
  const outputs = definition.outputs ?? {};
  for (const name of Object.keys(outputs).sort()) {
    const output = outputs[name];
    const type = resolvedType(definition, output, definitions, new Set([`${definition.id}\u0000${name}`]));
    if (type === undefined) continue;
    resolved[name] =
      output.output === undefined ? { from: output.from, type } : { from: output.from, type, output: output.output };
  }
  return resolved;
};
