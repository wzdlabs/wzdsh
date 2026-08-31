#!/usr/bin/env bun

import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output, stderr } from "node:process";
import packageMetadata from "../../package.json" with { type: "json" };
import {
  FileLearnerRepository,
  TutorEngine,
  type TutorEvent,
  type TutorEventSink,
} from "../../packages/tutor-core/src";

const wzdRoot = process.env.WZD_HOME?.trim() || join(homedir(), ".wzd");
const learnerRoot = join(wzdRoot, "learners");

const rootHelp = `WZD — tools for learning and building\n\nUsage:\n  wzdsh <command>\n\nCommands:\n  python    Start the guided Python tutor\n  help      Show this help\n  version   Show the installed version\n\nRun \"wzdsh python --help\" for Python tutor options.\n`;

const pythonHelp = `WZD Learn — Python Tutor\n\nUsage:\n  wzdsh python [options]\n\nOptions:\n  --name <name>          Learner display name\n  --hours <number>       Available study hours per week\n  --learner-id <id>      Resume a specific learner profile\n  --help                 Show this help\n\nLearner progress is saved under ${learnerRoot}.\n`;

class TerminalEventSink implements TutorEventSink {
  emit(event: TutorEvent): void {
    if (event.type === "session_started") {
      output.write(`\nWelcome, ${event.learner.displayName}. Your first gate is ready.\n`);
      return;
    }
    if (event.type === "progress_snapshot") {
      const next = event.currentCompetencyId ?? "all gates complete";
      const { forecast } = event;
      output.write(
        `Level ${forecast.level}/100 · ${forecast.activeHours} active hours · next: ${next}\n` +
          `Estimated remaining: ${forecast.estimatedRemainingHours.low}–${forecast.estimatedRemainingHours.high} hours ` +
          `(${forecast.estimatedCalendarWeeks.low}–${forecast.estimatedCalendarWeeks.high} weeks at your pace)\n`,
      );
      return;
    }
    if (event.type === "assessment_result") {
      output.write(
        event.passed
          ? `Passed ${event.competencyId} at ${event.score}%. The next gate is unlocked.\n`
          : `Not yet: ${event.competencyId} scored ${event.score}%. Passing score is ${event.passingScore}%.\n`,
      );
      return;
    }
    if (event.type === "gate_updated") {
      output.write(`Gate ${event.competencyId}: ${event.status}\n`);
      return;
    }
    if (event.type === "tutor_message") {
      output.write(`Tutor › ${event.content}\n`);
      return;
    }
    if (event.type === "session_closed") {
      output.write("Session saved. See you next time.\n");
      return;
    }
    if (event.type === "error") {
      output.write(`Error (${event.code}): ${event.message}\n`);
    }
  }
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function learnerIdFor(displayName: string): string {
  const slug = displayName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "learner";
}

function activeCompetencyId(learner: Awaited<ReturnType<FileLearnerRepository["load"]>>): string | undefined {
  return learner?.competencies.find((item) => item.status === "learning" || item.status === "available")?.competencyId;
}

async function runPythonTutor(): Promise<void> {
  const readline = createInterface({ input, output });
  const events = new TerminalEventSink();
  const repository = new FileLearnerRepository(learnerRoot);
  const engine = new TutorEngine({ repository, events });
  const displayName = argument("--name") ?? ((await readline.question("What should I call you? ")) || "Learner");
  const weeklyHours = Number(argument("--hours") ?? ((await readline.question("How many hours can you study each week? [10] ")) || "10"));
  if (!Number.isFinite(weeklyHours) || weeklyHours <= 0 || weeklyHours > 168) {
    readline.close();
    throw new Error("Study hours must be a number between 0 and 168.");
  }
  const learnerId = argument("--learner-id") ?? learnerIdFor(displayName);
  const commandId = () => `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await engine.dispatch({ type: "start_session", commandId: commandId(), learnerId, displayName, weeklyHours });
  output.write("\nCommands: /progress · /study <minutes> · /assess <score> · /hint · /quit\n");

  for (;;) {
    let line: string;
    try {
      line = (await readline.question("\nyou › ")).trim();
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ERR_USE_AFTER_CLOSE") break;
      throw error;
    }
    if (line === "/quit" || line === "/exit") {
      break;
    }
    if (line === "/progress") {
      await engine.dispatch({ type: "show_progress", commandId: commandId(), learnerId });
      continue;
    }

    const learner = await repository.load(learnerId);
    const competencyId = activeCompetencyId(learner);
    const study = line.match(/^\/study\s+(\d+)$/);
    if (study && competencyId) {
      await engine.dispatch({ type: "record_activity", commandId: commandId(), learnerId, competencyId, minutes: Number(study[1]) });
      continue;
    }

    const assessment = line.match(/^\/assess\s+(\d+(?:\.\d+)?)$/);
    if (assessment && competencyId) {
      await engine.dispatch({ type: "submit_assessment", commandId: commandId(), learnerId, competencyId, score: Number(assessment[1]) });
      continue;
    }

    if (line === "/hint" && competencyId) {
      await engine.dispatch({ type: "request_hint", commandId: commandId(), learnerId, competencyId });
      continue;
    }

    output.write("Try /progress, /study <minutes>, /assess <score>, /hint, or /quit.\n");
  }
  await engine.dispatch({ type: "close_session", commandId: commandId(), learnerId });
  readline.close();
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    output.write(rootHelp);
    return;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    output.write(`${packageMetadata.version}\n`);
    return;
  }

  if (command === "python") {
    if (process.argv.includes("--help") || process.argv.includes("-h")) {
      output.write(pythonHelp);
      return;
    }
    await runPythonTutor();
    return;
  }

  stderr.write(`Unknown command: ${command}\n\n${rootHelp}`);
  process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  stderr.write(`WZD could not start: ${message}\n`);
  process.exitCode = 1;
}
