/**
 * Workflow Definition Schema Validation
 * Uses Zod for compile-time and runtime validation
 */

import { z } from 'zod';

const stepTypes = [
  'log',
  'http',
  'transform',
  'condition',
  'delay',
  'email',
  'webhook',
  'database',
  'lambda',
] as const;

export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(100).default(3),
  delayMs: z.number().int().min(100).max(600000).default(1000),
  backoffMultiplier: z.number().min(1).max(10).default(2),
  maxDelayMs: z.number().int().min(100).max(3600000).default(30000),
});

export const WorkflowStepSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, {
      message: 'Step ID must start with letter',
    }),
  type: z.enum(stepTypes),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  config: z.record(z.unknown()).optional(),
  next: z.string().optional(),
  onError: z.string().optional(),
  timeoutMs: z.number().int().min(1000).max(3600000).optional(),
  retryPolicy: RetryPolicySchema.optional(),
});

export const WorkflowDefinitionSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, {
      message: 'Workflow name must start with letter',
    }),
  description: z.string().max(2000).optional(),
  steps: z.array(WorkflowStepSchema).min(1),
  trigger: z
    .object({
      type: z.enum(['manual', 'webhook', 'schedule', 'event']),
    })
    .optional()
    .default({ type: 'manual' }),
  timeoutMs: z.number().int().min(1000).max(86400000).optional(),
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

export function validateWorkflowDefinition(
  definition: unknown
): { success: true; data: WorkflowDefinition } | { success: false; errors: z.ZodError } {
  const result = WorkflowDefinitionSchema.safeParse(definition);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

export function validateWorkflowStep(
  step: unknown
): { success: true; data: WorkflowStep } | { success: false; errors: z.ZodError } {
  const result = WorkflowStepSchema.safeParse(step);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

export class WorkflowValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: string[]
  ) {
    super(message);
    this.name = 'WorkflowValidationError';
  }
}

export function assertValidWorkflowDefinition(definition: unknown): WorkflowDefinition {
  const result = validateWorkflowDefinition(definition);
  if (!result.success) {
    const errorMessages = result.errors.errors.map(
      (e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`
    );
    throw new WorkflowValidationError('Invalid workflow definition', errorMessages);
  }
  return result.data;
}
