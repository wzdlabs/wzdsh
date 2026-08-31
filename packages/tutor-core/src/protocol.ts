import { z } from "zod";
import { LearnerSchema } from "./schemas";

const CommandBaseSchema = z.object({
  commandId: z.string().min(1),
});

export const TutorCommandSchema = z.discriminatedUnion("type", [
  CommandBaseSchema.extend({
    type: z.literal("start_session"),
    learnerId: z.string().min(1),
    displayName: z.string().min(1),
    weeklyHours: z.number().positive().max(80).optional(),
    targetRole: z.string().min(1).optional(),
  }),
  CommandBaseSchema.extend({
    type: z.literal("learner_message"),
    learnerId: z.string().min(1),
    content: z.string().min(1),
  }),
  CommandBaseSchema.extend({
    type: z.literal("request_hint"),
    learnerId: z.string().min(1),
    competencyId: z.string().min(1),
    context: z.string().optional(),
  }),
  CommandBaseSchema.extend({
    type: z.literal("record_activity"),
    learnerId: z.string().min(1),
    competencyId: z.string().min(1),
    minutes: z.number().int().positive().max(480),
  }),
  CommandBaseSchema.extend({
    type: z.literal("submit_assessment"),
    learnerId: z.string().min(1),
    competencyId: z.string().min(1),
    score: z.number().min(0).max(100),
    evidenceId: z.string().min(1).optional(),
  }),
  CommandBaseSchema.extend({
    type: z.literal("run_code"),
    learnerId: z.string().min(1),
    code: z.string(),
    timeoutMs: z.number().int().positive().max(30_000).optional(),
  }),
  CommandBaseSchema.extend({
    type: z.literal("show_progress"),
    learnerId: z.string().min(1),
  }),
  CommandBaseSchema.extend({
    type: z.literal("close_session"),
    learnerId: z.string().min(1),
  }),
]);

export const ForecastSchema = z.object({
  level: z.number().min(0).max(100),
  masteryPercent: z.number().min(0).max(100),
  activeHours: z.number().nonnegative(),
  estimatedRemainingHours: z.object({ low: z.number().nonnegative(), high: z.number().nonnegative() }),
  estimatedCalendarWeeks: z.object({ low: z.number().nonnegative(), high: z.number().nonnegative() }),
  confidence: z.enum(["low", "medium", "high"]),
});

const EventBaseSchema = z.object({
  eventId: z.string().min(1),
  commandId: z.string().min(1),
  occurredAt: z.string().datetime(),
});

export const TutorEventSchema = z.discriminatedUnion("type", [
  EventBaseSchema.extend({ type: z.literal("session_started"), learner: LearnerSchema }),
  EventBaseSchema.extend({
    type: z.literal("tutor_message"),
    content: z.string(),
    suggestedActions: z.array(z.string()).default([]),
  }),
  EventBaseSchema.extend({
    type: z.literal("progress_snapshot"),
    forecast: ForecastSchema,
    currentCompetencyId: z.string().nullable(),
  }),
  EventBaseSchema.extend({
    type: z.literal("gate_updated"),
    competencyId: z.string(),
    status: z.enum(["locked", "available", "learning", "mastered"]),
  }),
  EventBaseSchema.extend({
    type: z.literal("assessment_result"),
    competencyId: z.string(),
    score: z.number().min(0).max(100),
    passingScore: z.number().min(0).max(100),
    passed: z.boolean(),
  }),
  EventBaseSchema.extend({
    type: z.literal("code_result"),
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number().int().nullable(),
    timedOut: z.boolean(),
    outputLimitExceeded: z.boolean(),
    durationMs: z.number().nonnegative(),
  }),
  EventBaseSchema.extend({ type: z.literal("session_closed"), learnerId: z.string() }),
  EventBaseSchema.extend({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
    recoverable: z.boolean(),
  }),
]);

export type TutorCommand = z.infer<typeof TutorCommandSchema>;
export type TutorEvent = z.infer<typeof TutorEventSchema>;
export type Forecast = z.infer<typeof ForecastSchema>;
