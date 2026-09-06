// Validates parsed Outfitter YAML/JSON documents against bundled JSON Schemas.
import { readFileSync } from 'node:fs';

import type { AnySchema, ErrorObject, ValidateFunction } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';

export type SchemaName = 'settings' | 'agent' | 'system-extension-hook' | 'workflow';

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

export const WORKFLOW_OUTPUT_TYPES = ['pull-request', 'git-commit', 'git-branch', 'issue'] as const;
export type WorkflowOutputType = (typeof WORKFLOW_OUTPUT_TYPES)[number];

const readSchema = (schemaFileName: string): unknown =>
  JSON.parse(readFileSync(new URL(`../schemas/${schemaFileName}`, import.meta.url), 'utf8'));

const settingsSchema = readSchema('settings.schema.json');
const agentSchema = readSchema('agent.schema.json');
const systemExtensionHookSchema = readSchema('system-extension-hook.schema.json');
const workflowSchema = readSchema('workflow.schema.json');
const outputTypeSchemas = Object.fromEntries(
  WORKFLOW_OUTPUT_TYPES.map((type) => [type, readSchema(`output-type.${type}.schema.json`)]),
) as Record<WorkflowOutputType, unknown>;

const ajv = new Ajv2020({ allErrors: true });
ajv.addFormat('uri', /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]*$/u);

const validators: Record<SchemaName, ValidateFunction> = {
  settings: ajv.compile(settingsSchema as AnySchema),
  agent: ajv.compile(agentSchema as AnySchema),
  'system-extension-hook': ajv.compile(systemExtensionHookSchema as AnySchema),
  workflow: ajv.compile(workflowSchema as AnySchema),
};

const outputValueValidators = new Map<WorkflowOutputType, ValidateFunction>();

export const createValidationResult = (issues: readonly ValidationIssue[]): ValidationResult => ({
  valid: issues.length === 0,
  issues,
});

export const validateSchema = (schemaName: SchemaName, document: unknown): ValidationResult => {
  const validate = validators[schemaName];

  if (validate(document)) {
    return createValidationResult([]);
  }

  return createValidationResult((validate.errors as readonly ErrorObject[]).map(formatAjvError));
};

export const validateOutputValue = (type: WorkflowOutputType, value: unknown): ValidationResult => {
  let validate = outputValueValidators.get(type);
  if (validate === undefined) {
    validate = ajv.compile(outputTypeSchemas[type] as AnySchema);
    outputValueValidators.set(type, validate);
  }

  if (validate(value)) return createValidationResult([]);

  return createValidationResult((validate.errors as readonly ErrorObject[]).map(formatAjvError));
};

const formatAjvError = (error: ErrorObject): ValidationIssue => ({
  path: error.instancePath === '' ? '/' : error.instancePath,
  message: String(error.message),
});
