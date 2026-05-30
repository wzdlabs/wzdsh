#!/usr/bin/env bun
// Headless agent runner — called by wzd-desktop
// Usage: bun run-agent.ts <agent> <slug> <message> [history-json]
import type { AgentName, Message } from "./types";
import { loadVenture, clearActiveLock } from "./state/stateManager";
import { runAgent } from "./utils/stream";

const [, , agent, slug, message, historyJson] = process.argv;

if (!agent || !slug || !message) {
  process.stderr.write("Usage: bun run-agent.ts <agent> <slug> <message> [history-json]\n");
  process.exit(1);
}

const history: Message[] = historyJson ? (JSON.parse(historyJson) as Message[]) : [];
const venture = await loadVenture(slug);
try {
  await runAgent(agent as AgentName, venture, message, history);
} finally {
  await clearActiveLock();
}
