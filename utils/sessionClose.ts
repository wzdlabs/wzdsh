import { createInterface, type Interface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Venture } from "../types";
import { appendSessionClose, clearLock, saveVenture } from "../state/stateManager";
import { sessionCloseHeader } from "./format";

type Ask = (prompt: string) => Promise<string>;

export async function runSessionClose(venture: Venture, rlOrAsk?: Interface | Ask): Promise<never> {
  output.write("\n");
  output.write(`${sessionCloseHeader()}\n`);
  const own = rlOrAsk ? undefined : createInterface({ input, output });
  const ask = typeof rlOrAsk === "function" ? rlOrAsk : async (prompt: string) => (await (rlOrAsk ?? own)?.question(prompt)) ?? "";
  const changed = await requireAnswer(ask, "What changed this session? ");
  const built = await requireAnswer(ask, "What got built? ");
  const revenueNext = await requireAnswer(ask, "What moves revenue next? ");
  const close = {
    changed,
    built,
    revenue_next: revenueNext,
    timestamp: new Date().toISOString(),
  };
  await appendSessionClose(venture.slug, close);
  await saveVenture({ ...venture, last_session: close.timestamp });
  await clearLock(venture.slug);
  own?.close();
  output.write("Logged. See you next session.\n");
  process.exit(0);
}

async function requireAnswer(ask: Ask, prompt: string): Promise<string> {
  while (true) {
    const answer = (await ask(prompt)).trim();
    if (answer) return answer;
  }
}
