import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cliPath = join(import.meta.dir, "..", "apps", "cli", "index.ts");

async function runCliWithEnvironment(
  environment: Record<string, string>,
  ...args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const child = Bun.spawn([process.execPath, cliPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...environment },
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
}

async function runCli(...args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return runCliWithEnvironment({}, ...args);
}

describe("WZD command router", () => {
  test("shows the product commands at the root", async () => {
    const result = await runCli("--help");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("wzdsh <command>");
    expect(result.stdout).toContain("python    Start the guided Python tutor");
    expect(result.stdout).toContain("models    Add, test, and select model APIs");
  });

  test("shows Python tutor options without starting a session", async () => {
    const result = await runCli("python", "--help");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("wzdsh python [options]");
    expect(result.stdout).toContain("--learner-id <id>");
  });

  test("rejects unknown product commands", async () => {
    const result = await runCli("javascript");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown command: javascript");
  });

  test("adds an OpenRouter profile without putting a raw secret in config", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wzd-cli-models-"));
    try {
      const result = await runCliWithEnvironment(
        { WZD_HOME: directory, NO_COLOR: "1" },
        "models",
        "add",
        "openrouter",
        "--id",
        "router",
        "--display-name",
        "OpenRouter",
        "--model",
        "openrouter/free",
        "--key-env",
        "OPENROUTER_API_KEY",
        "--skip-test",
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("selected OpenRouter · openrouter/free");
      const update = await runCliWithEnvironment(
        { WZD_HOME: directory, NO_COLOR: "1" },
        "models",
        "update",
        "router",
        "--model",
        "openai/example-model",
      );
      expect(update.exitCode).toBe(0);
      expect(update.stdout).toContain("updated router · openai/example-model");
      const config = await readFile(join(directory, "models.json"), "utf8");
      expect(config).toContain('"activeProfileId": "router"');
      expect(config).toContain('"variable": "OPENROUTER_API_KEY"');
      expect(config).toContain('"model": "openai/example-model"');
      expect(config).not.toContain("sk-or-");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
