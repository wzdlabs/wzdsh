import type { z } from "zod";
import type {
  AuthSessionSchema,
  MetricsSchema,
  PhaseEnum,
  SessionCloseSchema,
  VentureSchema,
  VentureUpdateSchema,
} from "../state/schemas";

export type Phase = z.infer<typeof PhaseEnum>;
export type AgentName = "intake" | "idea" | "model" | "gtm" | "build" | "revenue" | "review";
export type Venture = z.infer<typeof VentureSchema>;
export type Metrics = z.infer<typeof MetricsSchema>;
export type SessionClose = z.infer<typeof SessionCloseSchema>;
export type AuthSession = z.infer<typeof AuthSessionSchema>;
export type VentureUpdate = z.infer<typeof VentureUpdateSchema>;
export type Message = {
  role: "user" | "assistant";
  content: string;
};
