import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PythonRunner } from "../../tutor-core/src/ports";

type LocalPythonRunnerOptions = {
  pythonCommand?: string;
  maximumOutputBytes?: number;
  workspaceRoot?: string;
};

/**
 * Runs learner code in a short-lived process and workspace with time and output
 * limits. This is process isolation, not a security sandbox: Python still has the
 * permissions of the user running WZD. Hosted execution must use a stronger
 * container or microVM boundary.
 */
export class LocalPythonRunner implements PythonRunner {
  private readonly pythonCommand: string;
  private readonly maximumOutputBytes: number;
  private readonly workspaceRoot: string;

  constructor(options: LocalPythonRunnerOptions = {}) {
    this.pythonCommand = options.pythonCommand ?? "python3";
    this.maximumOutputBytes = options.maximumOutputBytes ?? 128 * 1024;
    this.workspaceRoot = options.workspaceRoot ?? tmpdir();
  }

  async run(input: { code: string; timeoutMs: number }) {
    const workspace = await mkdtemp(join(this.workspaceRoot, "wzd-python-"));
    const script = join(workspace, "main.py");
    await writeFile(script, input.code, { encoding: "utf8", mode: 0o600 });
    const startedAt = performance.now();

    try {
      return await new Promise<{
        stdout: string;
        stderr: string;
        exitCode: number | null;
        timedOut: boolean;
        outputLimitExceeded: boolean;
        durationMs: number;
      }>((resolve) => {
        const child = spawn(this.pythonCommand, ["-I", "-B", script], {
          cwd: workspace,
          detached: process.platform !== "win32",
          env: {
            PATH: process.env.PATH,
            LANG: process.env.LANG ?? "C.UTF-8",
            PYTHONNOUSERSITE: "1",
            PYTHONDONTWRITEBYTECODE: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        const stdout = new BoundedOutput(this.maximumOutputBytes);
        const stderr = new BoundedOutput(this.maximumOutputBytes);
        let timedOut = false;
        let outputLimitExceeded = false;
        let settled = false;

        const stopForOutputLimit = () => {
          outputLimitExceeded = true;
          killProcess(child);
        };
        child.stdout.on("data", (chunk: Buffer) => {
          if (!stdout.append(chunk)) stopForOutputLimit();
        });
        child.stderr.on("data", (chunk: Buffer) => {
          if (!stderr.append(chunk)) stopForOutputLimit();
        });

        const timer = setTimeout(() => {
          timedOut = true;
          killProcess(child);
        }, input.timeoutMs);

        const finish = (exitCode: number | null, spawnError?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (spawnError) stderr.append(Buffer.from(`${spawnError.message}\n`));
          resolve({
            stdout: stdout.text(),
            stderr: stderr.text(),
            exitCode,
            timedOut,
            outputLimitExceeded,
            durationMs: Math.round(performance.now() - startedAt),
          });
        };

        child.once("error", (error) => finish(null, error));
        child.once("close", (exitCode) => finish(exitCode));
      });
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }
}

class BoundedOutput {
  private readonly chunks: Buffer[] = [];
  private bytes = 0;

  constructor(private readonly limit: number) {}

  append(chunk: Buffer): boolean {
    const remaining = this.limit - this.bytes;
    if (remaining <= 0) return false;
    const accepted = chunk.length <= remaining ? chunk : chunk.subarray(0, remaining);
    this.chunks.push(accepted);
    this.bytes += accepted.length;
    return accepted.length === chunk.length;
  }

  text(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

function killProcess(child: ChildProcess): void {
  if (child.pid && process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // Fall through if the process group has already exited.
    }
  }
  child.kill("SIGKILL");
}
