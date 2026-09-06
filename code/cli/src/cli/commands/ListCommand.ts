// Provides `outfitter list [kind]` over the effective resource set.

import { Command } from 'commander';

import { strictAmbiguityFailureMessage } from '../../resolver/AmbiguityWarnings.js';
import type { EffectiveResourceSet, ResourceKind } from '../../resolver/Resource.js';
import {
  agentLocalKinds,
  compareSlugs,
  findResource,
  listAgentResources,
  listResources,
  resourceKinds,
} from '../../resolver/Resource.js';
import { resolveEffectiveSet } from '../../resolver/ResolverContext.js';
import { isWorkflowDefinitionIssue, readWorkflowDefinition } from '../../resolver/WorkflowDefinition.js';
import type { WorkflowDefinition } from '../../resolver/WorkflowDefinition.js';
import { resolveWorkflowOutputs } from '../../resolver/WorkflowOutput.js';
import type { ResolvedWorkflowOutputs } from '../../resolver/WorkflowOutput.js';
import { formatSettingsIssue } from '../../settings/SettingsLoader.js';
import type { CommandObject } from './CommandObject.js';
import { resolveHomeDirectory, resolveProjectDirectory } from './ProcessDefaults.js';

export interface ListInput {
  readonly homeDirectory: string;
  readonly projectDirectory: string;
  readonly kind?: string;
  readonly agent?: string;
  readonly strict?: boolean;
}

export interface ListResult {
  readonly exitCode: number;
  readonly messages: readonly string[];
  readonly resources: readonly ListResourceEntry[];
}

export interface ListResourceEntry {
  readonly kind: ResourceKind;
  readonly slug: string;
  readonly layer: string;
  readonly path: string;
  readonly ownerAgent: string | null;
  readonly outputs?: ResolvedWorkflowOutputs;
}

export interface ListCommandDependencies {
  readonly homeDirectory?: string;
  readonly projectDirectory?: string;
  readonly writeLine?: (message: string) => void;
}

const kindByPlural: ReadonlyMap<string, ResourceKind> = new Map([
  ['agents', 'agent'],
  ['skills', 'skill'],
  ['knowledge', 'knowledge'],
  ['commands', 'command'],
  ['workflows', 'workflow'],
]);

const pluralByKind: ReadonlyMap<ResourceKind, string> = new Map([
  ['agent', 'agents'],
  ['skill', 'skills'],
  ['knowledge', 'knowledge'],
  ['command', 'commands'],
  ['workflow', 'workflows'],
]);

const resolveKindFilter = (kind: string | undefined): readonly ResourceKind[] => {
  if (kind === undefined) {
    return resourceKinds;
  }

  const resolved = kindByPlural.get(kind);

  if (resolved === undefined) {
    throw new Error(`Unknown resource kind '${kind}'. Expected one of: ${[...kindByPlural.keys()].join(', ')}.`);
  }

  return [resolved];
};

const assertKnownAgent = (set: EffectiveResourceSet, agent: string | undefined): void => {
  if (agent !== undefined && findResource(set, 'agent', agent) === undefined) {
    throw new Error(`Unknown agent '${agent}'. Run 'outfitter list agents' to see resolvable agents.`);
  }
};

const listGlobalResources = (set: EffectiveResourceSet, kind: ResourceKind, enabledWorkflows: readonly string[]) =>
  kind === 'workflow'
    ? enabledWorkflows.flatMap((slug) => {
        const resource = findResource(set, 'workflow', slug);
        return resource === undefined ? [] : [resource];
      })
    : listResources(set, kind);

const readWorkflowDefinitions = (set: EffectiveResourceSet): ReadonlyMap<string, WorkflowDefinition> => {
  const definitions = new Map<string, WorkflowDefinition>();
  for (const resource of listResources(set, 'workflow')) {
    const definition = readWorkflowDefinition(resource.winner.path);
    if (!isWorkflowDefinitionIssue(definition)) definitions.set(resource.slug, definition);
  }
  return definitions;
};

const listEntry = (
  resource: ReturnType<typeof listResources>[number],
  definitions: ReadonlyMap<string, WorkflowDefinition>,
): ListResourceEntry => {
  const provenance = {
    kind: resource.kind,
    slug: resource.slug,
    layer: resource.winner.layer.label,
    path: resource.winner.path,
    ownerAgent: resource.winner.ownerAgent ?? null,
  };
  if (resource.kind !== 'workflow') return provenance;
  const definition = definitions.get(resource.slug);
  return {
    ...provenance,
    outputs: definition === undefined ? {} : resolveWorkflowOutputs(definition, definitions),
  };
};

export const executeListCommand = (input: ListInput): ListResult => {
  const { set, settings, settingsIssues, warnings, ambiguityWarnings } = resolveEffectiveSet(input);

  if (settingsIssues.length > 0) {
    const detail = settingsIssues.map(formatSettingsIssue).join('; ');
    throw new Error(`Cannot list resources with invalid settings: ${detail}`);
  }

  const messages: string[] = warnings.map((warning) => `warning: ${warning}`);

  if (input.strict === true && ambiguityWarnings.length > 0) {
    return { exitCode: 1, messages: [...messages, `error: ${strictAmbiguityFailureMessage}`], resources: [] };
  }

  assertKnownAgent(set, input.agent);
  const entries: ListResourceEntry[] = [];
  const definitions = readWorkflowDefinitions(set);

  for (const kind of resolveKindFilter(input.kind)) {
    const hasAgentContext = input.agent !== undefined && agentLocalKinds.includes(kind);
    const globalResources = listGlobalResources(set, kind, settings.workflows!);
    const localResources = hasAgentContext ? listAgentResources(set, input.agent, kind) : [];
    const resources = new Map(globalResources.map((resource) => [resource.slug, resource]));
    for (const resource of localResources) resources.set(resource.slug, resource);
    entries.push(
      ...[...resources.values()]
        .sort((left, right) => compareSlugs(left.slug, right.slug))
        .map((resource) => listEntry(resource, definitions)),
    );

    messages.push(`${pluralByKind.get(kind)!}${hasAgentContext ? ` (agent ${input.agent})` : ''}:`);
    messages.push(
      ...(resources.size === 0
        ? ['  (none)']
        : [...resources.values()]
            .sort((left, right) => compareSlugs(left.slug, right.slug))
            .map(
              (resource) =>
                `  ${resource.slug}  [${resource.winner.layer.label}${
                  resource.winner.ownerAgent === undefined ? '' : '; agent-local'
                }]`,
            )),
    );
  }

  return { exitCode: 0, messages, resources: entries };
};

export const createListCommand = (dependencies: ListCommandDependencies = {}): CommandObject => ({
  name: 'list',
  description: 'List resolvable resources (agents, skills, knowledge, commands, workflows).',
  register(program: Command): void {
    program.addCommand(
      new Command('list')
        .description('List resolvable resources (agents, skills, knowledge, commands, workflows).')
        .argument('[kind]', 'Restrict to one kind: agents, skills, knowledge, commands, or workflows.')
        .option('--strict', 'Treat ambiguous source resolution as fatal.')
        .option('--json', 'Emit stable machine-readable JSON with resource provenance.')
        .option(
          '--agent <id>',
          'Resolve resources in an agent context, including its agent-local skills/knowledge/commands.',
        )
        .action((kind: string | undefined, options: { agent?: string; strict?: boolean; json?: boolean }) => {
          const result = executeListCommand({
            /* v8 ignore next 2 -- process defaults are exercised by the CLI entrypoint, not unit tests. */
            homeDirectory: resolveHomeDirectory(dependencies.homeDirectory),
            projectDirectory: resolveProjectDirectory(dependencies.projectDirectory),
            kind,
            agent: options.agent,
            strict: options.strict,
          });

          /* v8 ignore next -- console fallback is direct CLI behavior; tests inject a writer. */
          const write = dependencies.writeLine ?? console.log;
          if (options.json === true)
            write(
              JSON.stringify(
                { ok: result.exitCode === 0, resources: result.resources, diagnostics: result.messages },
                null,
                2,
              ),
            );
          else for (const message of result.messages) write(message);

          if (result.exitCode !== 0) process.exitCode = result.exitCode;
        }),
    );
  },
});
