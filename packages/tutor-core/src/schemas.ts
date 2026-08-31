import { z } from "zod";

export const CompetencyStatusSchema = z.enum(["locked", "available", "learning", "mastered"]);

export const CompetencyProgressSchema = z.object({
  competencyId: z.string().min(1),
  status: CompetencyStatusSchema,
  mastery: z.number().min(0).max(1),
  attempts: z.number().int().nonnegative(),
  hintsUsed: z.number().int().nonnegative(),
  activeMinutes: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export const LearningEvidenceSchema = z.object({
  id: z.string().min(1),
  competencyId: z.string().min(1),
  kind: z.enum(["exercise", "assessment", "project", "review"]),
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  createdAt: z.string().datetime(),
});

export const LearnerSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  displayName: z.string().min(1),
  targetRole: z.string().min(1),
  weeklyHours: z.number().positive().max(80),
  activeMinutes: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  lastSessionAt: z.string().datetime(),
  competencies: z.array(CompetencyProgressSchema),
  evidence: z.array(LearningEvidenceSchema),
});

export type CompetencyStatus = z.infer<typeof CompetencyStatusSchema>;
export type CompetencyProgress = z.infer<typeof CompetencyProgressSchema>;
export type LearningEvidence = z.infer<typeof LearningEvidenceSchema>;
export type Learner = z.infer<typeof LearnerSchema>;
