import OpenAI from "openai";
import type { AgentName, Message, Venture } from "../types";
import { readMarkdown } from "./files";
import { processResponse } from "../state/stateManager";

export async function runAgent(agent: AgentName, venture: Venture, userMessage: string, history: Message[]): Promise<void> {
  if (!Bun.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing. Sign in locally if needed, then export the key before calling an agent.");
  }
  const client = new OpenAI({ apiKey: Bun.env.OPENAI_API_KEY });
  const master = await readMarkdown(new URL("../prompts/WZD.md", import.meta.url).pathname);
  const prompt = await readMarkdown(new URL(`../prompts/${agent}.md`, import.meta.url).pathname);
  if (!master.trim() || !prompt.trim()) {
    throw new Error(`Missing prompt file for ${agent}. Complete Pass 3 prompts before calling agents.`);
  }
  const systemPrompt = `${master}\n\n${prompt}`;
  const contextBlock = `Current venture context:\n${JSON.stringify(venture, null, 2)}`;
  const cappedHistory = history.slice(-12);
  const stream = await client.chat.completions.create({
    model: "gpt-5.5",
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      ...cappedHistory,
      { role: "user", content: `${contextBlock}\n\n${userMessage}` },
    ],
  });
  let fullResponse = "";
  let pending = "";
  let hidingState = false;
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content ?? "";
    if (!content) continue;
    fullResponse += content;
    if (hidingState) continue;
    const combined = pending + content;
    const fenceIndex = combined.indexOf("```wzd-state");
    if (fenceIndex >= 0) {
      process.stdout.write(combined.slice(0, fenceIndex));
      hidingState = true;
      pending = "";
      continue;
    }
    const keep = 16;
    if (combined.length > keep) {
      process.stdout.write(combined.slice(0, -keep));
      pending = combined.slice(-keep);
    } else {
      pending = combined;
    }
  }
  if (!hidingState && pending) process.stdout.write(pending);
  await processResponse(fullResponse, venture);
}
