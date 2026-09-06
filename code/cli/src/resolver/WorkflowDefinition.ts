import { readFileSync } from 'node:fs';

import { validateSchema } from '../validation/SchemaValidator.js';
import type { WorkflowOutputType } from '../validation/SchemaValidator.js';
import { parseYamlDocument } from '../validation/YamlDocument.js';

export type WorkflowActor =
  | { readonly kind: 'agent'; readonly profile: string; readonly skills?: readonly string[] }
  | { readonly kind: 'human' | 'tool' | 'system'; readonly profile?: never; readonly skills?: readonly string[] };

export interface WorkflowIntegration {
  readonly kind?: string;
  readonly server?: string;
  readonly tools?: readonly string[];
  readonly repository?: string;
  readonly ref?: string;
  readonly path?: string;
  readonly sha256?: string;
}

export interface WorkflowNode {
  readonly id: string;
  readonly description: string;
  readonly action?: string;
  readonly workflow?: string;
  readonly actor?: string;
  readonly environment?: string;
  readonly needs?: readonly string[];
  readonly skill?: string;
  readonly skills?: readonly string[];
  readonly prompt_fragment?: string;
  readonly prompt_fragments?: readonly string[];
  readonly uses?: readonly string[];
  readonly if?: string;
}

export type WorkflowOutput =
  | { readonly from: string; readonly type: WorkflowOutputType; readonly output?: never }
  | { readonly from: string; readonly output: string; readonly type?: never };

export interface WorkflowDefinition {
  readonly version: 1;
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status?: string;
  readonly actors: Readonly<Record<string, WorkflowActor>>;
  readonly environments?: Readonly<Record<string, unknown>>;
  readonly integrations?: Readonly<Record<string, WorkflowIntegration>>;
  readonly checks?: Readonly<Record<string, unknown>>;
  readonly triggers?: readonly Readonly<Record<string, unknown>>[];
  readonly outputs?: Readonly<Record<string, WorkflowOutput>>;
  readonly nodes: readonly WorkflowNode[];
  readonly feedback?: readonly { readonly from: string; readonly to: string }[];
}

export interface WorkflowDefinitionIssue {
  readonly path: string;
  readonly message: string;
}

export const isWorkflowDefinitionIssue = (
  value: WorkflowDefinition | WorkflowDefinitionIssue,
): value is WorkflowDefinitionIssue => 'message' in value;

export const readWorkflowDefinition = (path: string): WorkflowDefinition | WorkflowDefinitionIssue => {
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch (error) {
    return { path, message: `workflow.yaml is not readable: ${String(error)}` };
  }

  const parsed = parseYamlDocument(content, path);
  if (!parsed.ok) return { path, message: `workflow.yaml is not valid YAML: ${parsed.issue.message}` };

  const validation = validateSchema('workflow', parsed.document);
  if (!validation.valid) {
    const issue = validation.issues[0];
    return { path, message: `workflow.yaml is invalid at ${issue.path}: ${issue.message}.` };
  }

  return parsed.document as WorkflowDefinition;
};
