import { z } from "zod";

export const PhaseEnum = z.enum(["intake", "idea", "model", "gtm", "build", "revenue", "review"]);

export const ISOStringSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Expected an ISO date string",
});

export const IntakeSchema = z.object({
  idea: z.string(),
  skills: z.array(z.string()),
  budget: z.number(),
  location: z.string(),
  hours_per_week: z.number(),
  income_goal: z.number(),
  timeline_days: z.number(),
});

export const UnitEconomicsSchema = z.object({
  price_per_customer: z.number(),
  cost_per_customer: z.number(),
  margin: z.number(),
  breakeven_customers: z.number(),
});

export const OfferSchema = z.object({
  defined: z.boolean(),
  name: z.string(),
  price: z.number(),
  promise: z.string(),
  package: z.string(),
});

export const ProspectListSchema = z.object({
  count: z.number(),
  source: z.string(),
});

export const GateStatusSchema = z.object({
  intake: z.boolean(),
  idea: z.boolean(),
  model: z.boolean(),
  gtm: z.boolean(),
  build: z.boolean(),
  revenue: z.boolean(),
  review: z.boolean(),
});

export const VentureSchema = z.object({
  name: z.string(),
  slug: z.string(),
  phase: PhaseEnum,
  created_at: ISOStringSchema,
  last_session: ISOStringSchema,
  days_since_start: z.number(),
  intake: IntakeSchema,
  validated: z.boolean(),
  demand_signal: z.string(),
  revenue_model: z.string(),
  unit_economics: UnitEconomicsSchema,
  customer_archetype: z.string(),
  channel: z.string(),
  first_10_targets: z.array(z.string()),
  offer: OfferSchema,
  prospect_list: ProspectListSchema,
  open_questions: z.array(z.string()),
  locked_decisions: z.array(z.string()),
  gate_status: GateStatusSchema,
  next_actions: z.array(z.string()),
});

export const MetricsKeys = [
  "prospects_identified",
  "outreach_sent",
  "replies_received",
  "calls_booked",
  "offers_made",
  "sales_closed",
  "revenue_collected",
  "last_updated",
] as const;

export const MetricsSchema = z.object({
  prospects_identified: z.number(),
  outreach_sent: z.number(),
  replies_received: z.number(),
  calls_booked: z.number(),
  offers_made: z.number(),
  sales_closed: z.number(),
  revenue_collected: z.number(),
  last_updated: ISOStringSchema,
});

export const AuthSessionSchema = z.object({
  signed_in: z.boolean(),
  email: z.string().email().or(z.literal("")),
  name: z.string(),
  signed_in_at: ISOStringSchema.or(z.literal("")),
});

export const SessionCloseSchema = z.object({
  changed: z.string(),
  built: z.string(),
  revenue_next: z.string(),
  timestamp: ISOStringSchema,
});

export const VentureUpdateSchema = z.object({
  name: z.string().optional(),
  slug: z.string().optional(),
  phase: PhaseEnum.optional(),
  created_at: ISOStringSchema.optional(),
  last_session: ISOStringSchema.optional(),
  days_since_start: z.number().optional(),
  intake: IntakeSchema.partial().optional(),
  validated: z.boolean().optional(),
  demand_signal: z.string().optional(),
  revenue_model: z.string().optional(),
  unit_economics: UnitEconomicsSchema.partial().optional(),
  customer_archetype: z.string().optional(),
  channel: z.string().optional(),
  first_10_targets: z.array(z.string()).optional(),
  offer: OfferSchema.partial().optional(),
  prospect_list: ProspectListSchema.partial().optional(),
  open_questions: z.array(z.string()).optional(),
  locked_decisions: z.array(z.string()).optional(),
  gate_status: GateStatusSchema.partial().optional(),
  next_actions: z.array(z.string()).optional(),
});
