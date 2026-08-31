import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const cliPath = join(import.meta.dir, "..", "apps", "cli", "index.ts");

async function runCli(...args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const child = Bun.spawn([process.execPath, cliPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
}

describe("WZD command router", () => {
  test("shows the product commands at the root", async () => {
    const result = await runCli("--help");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("wzdsh <command>");
    expect(result.stdout).toContain("python    Start the guided Python tutor");
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
});
