import type { Message, Venture } from "../types";
import { runAgent } from "../utils/stream";

export async function run(venture: Venture, userMessage: string, history: Message[]): Promise<void> {
  await runAgent("review", venture, userMessage, history);
}
