import { join } from "node:path";

const ENV_PATH = join(import.meta.dir, "../.env");
const CONFIG_PATH = join(import.meta.dir, "../.wzdconfig.json");

async function readEnvFile(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const text = await Bun.file(ENV_PATH).text().catch(() => "");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return map;
}

export async function saveApiKey(key: string, value: string): Promise<void> {
  const map = await readEnvFile();
  map.set(key, value);
  const lines = [...map.entries()].map(([k, v]) => `${k}=${v}`);
  await Bun.write(ENV_PATH, lines.join("\n") + "\n");
  process.env[key] = value;
}

export function getApiKey(key: string): string | undefined {
  return Bun.env[key] || process.env[key];
}

export async function loadModelConfig(): Promise<string | null> {
  try {
    const raw = await Bun.file(CONFIG_PATH).json() as { model?: string };
    return raw.model ?? null;
  } catch {
    return null;
  }
}

export async function saveModelConfig(spec: string): Promise<void> {
  let existing: Record<string, unknown> = {};
  try { existing = await Bun.file(CONFIG_PATH).json() as Record<string, unknown>; } catch { /* new file */ }
  await Bun.write(CONFIG_PATH, JSON.stringify({ ...existing, model: spec }, null, 2) + "\n");
}
