import { z } from "zod";
import { validateCronExpression } from "./cron";

const navigateStepSchema = z.object({
  type: z.literal("navigate"),
  url: z.string().url(),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).optional()
});

const newPageStepSchema = z.object({
  type: z.literal("newPage")
});

const clickStepSchema = z.object({
  type: z.literal("click"),
  selector: z.string().min(1),
  button: z.enum(["left", "right", "middle"]).optional(),
  timeoutMs: z.number().int().positive().optional()
});

const fillStepSchema = z.object({
  type: z.literal("fill"),
  selector: z.string().min(1),
  value: z.string(),
  timeoutMs: z.number().int().positive().optional()
});

const pressStepSchema = z.object({
  type: z.literal("press"),
  key: z.string().min(1),
  selector: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().optional()
});

const waitForSelectorStepSchema = z.object({
  type: z.literal("waitForSelector"),
  selector: z.string().min(1),
  state: z.enum(["attached", "detached", "visible", "hidden"]).optional(),
  timeoutMs: z.number().int().positive().optional()
});

const extractTextStepSchema = z.object({
  type: z.literal("extractText"),
  selector: z.string().min(1),
  outputKey: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().optional()
});

const screenshotStepSchema = z.object({
  type: z.literal("screenshot"),
  fileName: z.string().min(1).optional(),
  fullPage: z.boolean().optional()
});

const closePageStepSchema = z.object({
  type: z.literal("closePage")
});

export const browserTaskSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  steps: z.array(
    z.discriminatedUnion("type", [
      navigateStepSchema,
      newPageStepSchema,
      clickStepSchema,
      fillStepSchema,
      pressStepSchema,
      waitForSelectorStepSchema,
      extractTextStepSchema,
      screenshotStepSchema,
      closePageStepSchema
    ])
  ).min(1)
});

export const taskDefinitionSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  request: browserTaskSchema
});

const intervalScheduleSchema = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().optional(),
  mode: z.literal("interval").optional(),
  intervalMinutes: z.number().int().min(1).max(7 * 24 * 60),
  request: browserTaskSchema,
  definitionId: z.string().uuid().optional()
});

const cronScheduleSchema = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().optional(),
  mode: z.literal("cron"),
  cronExpression: z.string().min(9).max(100).superRefine((value, context) => {
    try {
      validateCronExpression(value);
    }
    catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "Invalid cron expression."
      });
    }
  }),
  request: browserTaskSchema,
  definitionId: z.string().uuid().optional()
});

export const scheduleSchema = z.union([intervalScheduleSchema, cronScheduleSchema]);

export const userBootstrapSchema = z.object({
  username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(10).max(200)
});

export const userCreateSchema = z.object({
  username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(10).max(200),
  role: z.enum(["admin", "operator", "viewer"])
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const requestWebhookSchema = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().optional(),
  targetType: z.literal("request"),
  request: browserTaskSchema
});

const definitionWebhookSchema = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().optional(),
  targetType: z.literal("definition"),
  definitionId: z.string().uuid()
});

const scheduleWebhookSchema = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().optional(),
  targetType: z.literal("schedule"),
  scheduleId: z.string().uuid()
});

export const webhookSchema = z.union([
  requestWebhookSchema,
  definitionWebhookSchema,
  scheduleWebhookSchema
]);

export const bundleSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().datetime().optional(),
  name: z.string().min(1).max(120),
  definitions: z.array(taskDefinitionSchema).default([]),
  schedules: z.array(scheduleSchema).default([])
});