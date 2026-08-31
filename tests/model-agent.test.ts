import { expect, test } from "bun:test";
import {
  ModelProfileSchema,
  type Learner,
} from "../packages/tutor-core/src";
import {
  MemorySecretStore,
  OpenAICompatibleTutorAgent,
} from "../packages/tutor-runtime/src";
import { createTerminalTheme } from "../apps/cli/theme";

const learner: Learner = {
  schemaVersion: 1,
  id: "agent-test",
  displayName: "Agent Test",
  targetRole: "Junior Python backend developer",
  weeklyHours: 10,
  activeMinutes: 0,
  createdAt: "2026-08-30T12:00:00.000Z",
  lastSessionAt: "2026-08-30T12:00:00.000Z",
  competencies: [],
  evidence: [],
};

test("OpenRouter chat uses bearer auth, attribution, conversation history, and usage", async () => {
  const credential = { type: "keychain" as const, service: "test", account: "openrouter" };
  const profile = ModelProfileSchema.parse({
    id: "openrouter",
    displayName: "OpenRouter",
    source: "byok",
    transport: "openai-compatible",
    apiStyle: "chat-completions",
    model: "openrouter/free",
    baseUrl: "https://openrouter.ai/api/v1",
    credential,
  });
  const secrets = new MemorySecretStore();
  await secrets.save(credential, "test-secret");
  const requests: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
  const fakeFetch = async (request: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    requests.push({
      url: String(request),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return Response.json({
      choices: [{ message: { content: "Let’s inspect that together." } }],
      usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
    });
  };
  const agent = new OpenAICompatibleTutorAgent(profile, secrets, fakeFetch);

  const first = await agent.reply({ mode: "coach", learner, content: "Why did this fail?", competencyId: "computer-terminal" });
  await agent.reply({ mode: "coach", learner, content: "What should I try next?", competencyId: "computer-terminal" });

  expect(first.content).toBe("Let’s inspect that together.");
  expect(first.usage).toEqual({ inputTokens: 12, outputTokens: 6, totalTokens: 18 });
  expect(requests[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(requests[0]?.headers.get("Authorization")).toBe("Bearer test-secret");
  expect(requests[0]?.headers.get("HTTP-Referer")).toBe("https://wzd.sh");
  expect(requests[0]?.headers.get("X-OpenRouter-Title")).toBe("WZD Learn");
  const secondMessages = requests[1]?.body.messages as Array<{ role: string; content: string }>;
  expect(secondMessages.some((message) => message.role === "assistant" && message.content === "Let’s inspect that together.")).toBe(true);
});

test("OpenAI Responses requests are stateless and parse output text", async () => {
  const credential = { type: "keychain" as const, service: "test", account: "openai" };
  const profile = ModelProfileSchema.parse({
    id: "openai",
    displayName: "OpenAI",
    source: "byok",
    transport: "openai-compatible",
    apiStyle: "responses",
    model: "test-model",
    credential,
  });
  const secrets = new MemorySecretStore();
  await secrets.save(credential, "test-secret");
  let requestBody: Record<string, unknown> = {};
  const fakeFetch = async (_request: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      output: [{ type: "message", content: [{ type: "output_text", text: "One small hint." }] }],
      usage: { input_tokens: 9, output_tokens: 4, total_tokens: 13 },
    });
  };
  const agent = new OpenAICompatibleTutorAgent(profile, secrets, fakeFetch);

  const result = await agent.reply({ mode: "hint", learner, content: "I am stuck", competencyId: "python-core" });

  expect(result.content).toBe("One small hint.");
  expect(result.usage?.totalTokens).toBe(13);
  expect(requestBody.store).toBe(false);
  expect(requestBody.model).toBe("test-model");
});

test("model connection test checks the configured model without generating tokens", async () => {
  const profile = ModelProfileSchema.parse({
    id: "openrouter",
    displayName: "OpenRouter",
    source: "byok",
    transport: "openai-compatible",
    apiStyle: "chat-completions",
    model: "selected/model",
    baseUrl: "https://openrouter.ai/api/v1",
    credential: { type: "environment", variable: "OPENROUTER_API_KEY" },
  });
  const requests: string[] = [];
  const fakeFetch = async (request: RequestInfo | URL): Promise<Response> => {
    requests.push(String(request));
    return Response.json({ data: [{ id: "selected/model" }, { id: "other/model" }] });
  };
  const agent = new OpenAICompatibleTutorAgent(profile, { resolve: async () => "test-secret" }, fakeFetch);

  expect(await agent.testConnection()).toEqual({ modelAvailable: true, modelCount: 2 });
  expect(requests).toEqual(["https://openrouter.ai/api/v1/models"]);
});

test("terminal theme matches the website palette and respects NO_COLOR", () => {
  const colored = createTerminalTheme({ isTTY: false }, { FORCE_COLOR: "1" });
  const plain = createTerminalTheme({ isTTY: true }, { NO_COLOR: "1" });

  expect(colored.accent("you ›")).toBe("\u001b[38;2;111;143;232myou ›\u001b[0m");
  expect(colored.soft("tutor ›")).toBe("\u001b[38;2;163;163;163mtutor ›\u001b[0m");
  expect(plain.accent("you ›")).toBe("you ›");
});
