import type { AgentName, Phase, Venture } from "./types";
import { loadMetrics, missingGateFields } from "./state/stateManager";

export type OrchestratorResult = {
  currentPhase: Phase;
  nextAgent: AgentName;
  blockedGates: string[];
  nextActions: string[];
  recommendation: string;
};

const phaseAgent: Record<Phase, AgentName> = {
  intake: "intake",
  idea: "idea",
  model: "model",
  gtm: "gtm",
  build: "build",
  revenue: "revenue",
  review: "review",
};

export async function orchestrate(venture: Venture): Promise<OrchestratorResult> {
  const blockedGates = missingGateFields(venture, venture.phase);
  if (venture.phase === "review") {
    const metrics = await loadMetrics(venture.slug);
    if (metrics.outreach_sent <= 0) blockedGates.push("metrics.outreach_sent");
  }
  const nextAgent = phaseAgent[venture.phase];
  return {
    currentPhase: venture.phase,
    nextAgent,
    blockedGates,
    nextActions: venture.next_actions,
    recommendation: blockedGates.length > 0 ? `Clear ${blockedGates.join(", ")}` : `Run ${nextAgent}`,
  };
}
