import type { Provider } from "./stream";
import { setModel, getModel } from "./stream";
import { saveApiKey, saveModelConfig, getApiKey } from "./config";

type AskFn = (prompt: string) => Promise<string>;
type WriteFn = (s: string) => void;

const PROVIDERS: { label: string; value: Provider }[] = [
  { label: "OpenAI", value: "openai" },
  { label: "Anthropic", value: "anthropic" },
  { label: "OpenRouter", value: "openrouter" },
];

const MODELS: Record<Provider, string[]> = {
  openai: ["gpt-5.5", "gpt-4o", "gpt-4o-mini", "o3", "o3-mini"],
  anthropic: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"],
  openrouter: [
    "anthropic/claude-opus-4-5",
    "anthropic/claude-sonnet-4-5",
    "openai/gpt-4o",
    "meta-llama/llama-3.3-70b-instruct",
    "google/gemini-2.0-flash-001",
  ],
};

const API_KEY_VAR: Record<Provider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export async function interactiveModelSelect(ask: AskFn, write: WriteFn): Promise<void> {
  const provider = await pickProvider(ask, write);
  if (!provider) return;

  const model = await pickModel(provider, ask, write);
  if (!model) return;

  await ensureApiKey(provider, ask, write);

  setModel(`${provider}:${model}`);
  await saveModelConfig(getModel());
  write(`Model set to ${getModel()}\n`);
}

async function pickProvider(ask: AskFn, write: WriteFn): Promise<Provider | null> {
  write("\nSelect provider:\n");
  PROVIDERS.forEach(({ label }, i) => write(`  ${i + 1}. ${label}\n`));
  while (true) {
    const raw = (await ask("> ")).trim();
    if (!raw) return null;
    const index = Number(raw) - 1;
    if (PROVIDERS[index]) return PROVIDERS[index].value;
    write("Enter a number from the list.\n");
  }
}

async function pickModel(provider: Provider, ask: AskFn, write: WriteFn): Promise<string | null> {
  const list = MODELS[provider];
  write("\nSelect model:\n");
  list.forEach((m, i) => write(`  ${i + 1}. ${m}\n`));
  write(`  ${list.length + 1}. Enter custom\n`);
  while (true) {
    const raw = (await ask("> ")).trim();
    if (!raw) return null;
    const index = Number(raw) - 1;
    if (index === list.length) {
      const custom = (await ask("Model name: ")).trim();
      return custom || null;
    }
    if (list[index]) return list[index];
    write("Enter a number from the list.\n");
  }
}

async function ensureApiKey(provider: Provider, ask: AskFn, write: WriteFn): Promise<void> {
  const varName = API_KEY_VAR[provider];
  if (getApiKey(varName)) return;
  write(`\n${varName} not set.\n`);
  const key = (await ask(`Enter API key (blank to skip): `)).trim();
  if (!key) return;
  await saveApiKey(varName, key);
  write(`Saved to .env\n`);
}
