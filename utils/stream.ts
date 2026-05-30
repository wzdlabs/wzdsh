import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { AgentName, Message, Venture } from "../types";
import { readMarkdown } from "./files";
import { processResponse } from "../state/stateManager";
import { tokenLine } from "./format";

export type Provider = "openai" | "anthropic" | "openrouter";

const CONTEXT_WINDOWS: Record<string, number> = {
  "gpt-5.5": 128_000,
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "o3": 200_000,
  "o3-mini": 200_000,
  "claude-opus-4-5": 200_000,
  "claude-sonnet-4-5": 200_000,
  "claude-haiku-4-5": 200_000,
};

const active = { provider: "openai" as Provider, model: "gpt-5.5" };
const sessionTokens = { prompt: 0, completion: 0 };

export function setModel(spec: string): void {
  const sep = spec.indexOf(":");
  if (sep >= 0) {
    active.provider = spec.slice(0, sep) as Provider;
    active.model = spec.slice(sep + 1);
  } else {
    active.provider = spec.startsWith("claude") ? "anthropic" : "openai";
    active.model = spec;
  }
}

export function getModel(): string {
  return `${active.provider}:${active.model}`;
}

export function getSessionTokens(): { prompt: number; completion: number; total: number } {
  return { ...sessionTokens, total: sessionTokens.prompt + sessionTokens.completion };
}

export function getContextWindow(): number {
  return CONTEXT_WINDOWS[active.model] ?? 128_000;
}

export async function runAgent(agent: AgentName, venture: Venture, userMessage: string, history: Message[]): Promise<void> {
  const master = await readMarkdown(new URL("../prompts/WZD.md", import.meta.url).pathname);
  const prompt = await readMarkdown(new URL(`../prompts/${agent}.md`, import.meta.url).pathname);
  if (!master.trim() || !prompt.trim()) {
    throw new Error(`Missing prompt file for ${agent}. Complete Pass 3 prompts before calling agents.`);
  }
  const systemPrompt = `${master}\n\n${prompt}`;
  const contextBlock = `Current venture context:\n${JSON.stringify(venture, null, 2)}`;
  const cappedHistory = history.slice(-12);
  const fullUserMessage = `${contextBlock}\n\n${userMessage}`;

  const result =
    active.provider === "anthropic"
      ? await runAnthropic(systemPrompt, cappedHistory, fullUserMessage)
      : await runOpenAICompat(systemPrompt, cappedHistory, fullUserMessage);

  if (result.promptTokens > 0) {
    sessionTokens.prompt += result.promptTokens;
    sessionTokens.completion += result.completionTokens;
    process.stdout.write(`\n${tokenLine(result.promptTokens, result.completionTokens, sessionTokens.prompt + sessionTokens.completion, getContextWindow())}\n`);
  }

  await processResponse(result.response, venture);
}

async function runOpenAICompat(
  systemPrompt: string,
  history: Message[],
  userMessage: string,
): Promise<{ response: string; promptTokens: number; completionTokens: number }> {
  const isOpenRouter = active.provider === "openrouter";
  const envVar = isOpenRouter ? "OPENROUTER_API_KEY" : "OPENAI_API_KEY";
  const apiKey = Bun.env[envVar];
  if (!apiKey) throw new Error(`${envVar} is missing.`);

  const client = new OpenAI({
    apiKey,
    ...(isOpenRouter ? { baseURL: "https://openrouter.ai/api/v1" } : {}),
  });

  const stream = await client.chat.completions.create({
    model: active.model,
    stream: true,
    stream_options: { include_usage: true },
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userMessage },
    ],
  });

  let fullResponse = "";
  let pending = "";
  let hidingState = false;
  let promptTokens = 0;
  let completionTokens = 0;

  for await (const chunk of stream) {
    if (chunk.usage) {
      promptTokens = chunk.usage.prompt_tokens;
      completionTokens = chunk.usage.completion_tokens;
    }
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

  return { response: fullResponse, promptTokens, completionTokens };
}

async function runAnthropic(
  systemPrompt: string,
  history: Message[],
  userMessage: string,
): Promise<{ response: string; promptTokens: number; completionTokens: number }> {
  if (!Bun.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is missing.");

  const client = new Anthropic({ apiKey: Bun.env.ANTHROPIC_API_KEY });

  const stream = await client.messages.create({
    model: active.model,
    max_tokens: 8096,
    system: systemPrompt,
    messages: [...history, { role: "user", content: userMessage }],
    stream: true,
  });

  let fullResponse = "";
  let pending = "";
  let hidingState = false;
  let promptTokens = 0;
  let completionTokens = 0;

  for await (const event of stream) {
    if (event.type === "message_start") {
      promptTokens = event.message.usage.input_tokens;
    } else if (event.type === "message_delta" && event.usage) {
      completionTokens = event.usage.output_tokens;
    } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      const content = event.delta.text;
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
  }
  if (!hidingState && pending) process.stdout.write(pending);

  return { response: fullResponse, promptTokens, completionTokens };
}
