import { dirname } from "node:path";

export async function ensureDir(path: string): Promise<void> {
  await Bun.$`mkdir -p ${path}`.quiet();
}

export async function readMarkdown(path: string): Promise<string> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      await writeMarkdown(path, "");
      return "";
    }
    return await file.text();
  } catch {
    return "";
  }
}

export async function writeMarkdown(path: string, content: string): Promise<void> {
  await ensureParent(path);
  await Bun.write(path, content);
}

export async function appendMarkdown(path: string, content: string): Promise<void> {
  const current = await readMarkdown(path);
  await writeMarkdown(path, current + content);
}

export async function readJSON<T>(path: string): Promise<Partial<T>> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      await writeJSON(path, {});
      return {};
    }
    const text = await file.text();
    if (!text.trim()) return {};
    return JSON.parse(text) as Partial<T>;
  } catch {
    return {};
  }
}

export async function writeJSON(path: string, value: unknown): Promise<void> {
  await ensureParent(path);
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function ensureParent(path: string): Promise<void> {
  await Bun.$`mkdir -p ${dirname(path)}`.quiet();
}
