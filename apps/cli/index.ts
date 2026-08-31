#!/usr/bin/env bun

import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output, stderr } from "node:process";
import packageMetadata from "../../package.json" with { type: "json" };
import {
  FileLearnerRepository,
  FileModelProfileRepository,
  TutorEngine,
  type ModelProfile,
  type TutorEvent,
  type TutorEventSink,
} from "../../packages/tutor-core/src";
import {
  LocalPythonRunner,
  OpenAICompatibleTutorAgent,
  PlatformSecretStore,
} from "../../packages/tutor-runtime/src";
import { runModelsCommand } from "./model-commands";
import { createTerminalTheme, type TerminalTheme } from "./theme";

const wzdRoot = process.env.WZD_HOME?.trim() || join(homedir(), ".wzd");
const learnerRoot = join(wzdRoot, "learners");
const modelConfigPath = join(wzdRoot, "models.json");
const theme = createTerminalTheme(output);

const rootHelp = `WZD — tools for learning and building\n\nUsage:\n  wzdsh <command>\n\nCommands:\n  python    Start the guided Python tutor\n  models    Add, test, and select model APIs\n  help      Show this help\n  version   Show the installed version\n\nRun \"wzdsh python --help\" or \"wzdsh models --help\" for details.\n`;

const pythonHelp = `WZD Learn — Python Tutor\n\nUsage:\n  wzdsh python [options]\n\nOptions:\n  --name <name>          Learner display name\n  --hours <number>       Available study hours per week\n  --learner-id <id>      Resume a specific learner profile\n  --help                 Show this help\n\nSession commands:\n  /lesson                Show the current lesson\n  /progress              Show level and time forecast\n  /run [code]            Run Python; omit code for multiline mode\n  /hint                   Ask for one progressive hint\n  /model                  Show the active model profile\n  /usage                  Show this session's token usage\n  /study <minutes>        Record active study time\n  /assess <score>         Record a preview assessment score\n  /help                   Show session commands\n  /quit                   Save and exit\n\nLearner progress is saved under ${learnerRoot}.\n`;

class SessionUsage {
  inputTokens = 0;
  outputTokens = 0;
  totalTokens = 0;

  add(usage: { inputTokens: number; outputTokens: number; totalTokens: number }): void {
    this.inputTokens += usage.inputTokens;
    this.outputTokens += usage.outputTokens;
    this.totalTokens += usage.totalTokens;
  }
}

class TerminalEventSink implements TutorEventSink {
  constructor(
    private readonly terminalTheme: TerminalTheme,
    private readonly usage: SessionUsage,
  ) {}

  emit(event: TutorEvent): void {
    if (event.type === "session_started") {
      output.write(`\n${this.terminalTheme.primary(`Welcome, ${event.learner.displayName}.`)} Your first gate is ready.\n`);
      return;
    }
    if (event.type === "progress_snapshot") {
      const next = event.currentCompetencyId ?? "all gates complete";
      const { forecast } = event;
      output.write(
        `${this.terminalTheme.primary(`Level ${forecast.level}/100`)} ${this.terminalTheme.faint(`· ${forecast.activeHours} active hours · next: ${next}`)}\n` +
          `${this.terminalTheme.faint("Estimated remaining:")} ${forecast.estimatedRemainingHours.low}–${forecast.estimatedRemainingHours.high} hours ` +
          `${this.terminalTheme.faint(`(${forecast.estimatedCalendarWeeks.low}–${forecast.estimatedCalendarWeeks.high} weeks at your pace)`)}\n`,
      );
      return;
    }
    if (event.type === "assessment_result") {
      output.write(event.passed
        ? `${this.terminalTheme.accent("passed")} ${event.competencyId} at ${event.score}%. The next gate is unlocked.\n`
        : `${this.terminalTheme.soft("not yet")} ${event.competencyId} scored ${event.score}%. Passing score is ${event.passingScore}%.\n`);
      return;
    }
    if (event.type === "gate_updated") {
      output.write(`${this.terminalTheme.faint("gate")} ${event.competencyId} · ${event.status}\n`);
      return;
    }
    if (event.type === "tutor_message") {
      if (event.usage) this.usage.add(event.usage);
      output.write(`${this.terminalTheme.soft("tutor ›")} ${this.terminalTheme.soft(event.content)}\n`);
      for (const action of event.suggestedActions) {
        output.write(`        ${this.terminalTheme.faint(action)}\n`);
      }
      return;
    }
    if (event.type === "code_result") {
      if (event.stdout) output.write(`${event.stdout}${event.stdout.endsWith("\n") ? "" : "\n"}`);
      if (event.stderr) output.write(this.terminalTheme.error(`${event.stderr}${event.stderr.endsWith("\n") ? "" : "\n"}`));
      const state = event.timedOut ? "timed out" : event.outputLimitExceeded ? "output limit reached" : `exit ${event.exitCode}`;
      output.write(`${this.terminalTheme.faint(`python · ${state} · ${event.durationMs}ms`)}\n`);
      return;
    }
    if (event.type === "session_closed") {
      output.write(`${this.terminalTheme.faint("Session saved. See you next time.")}\n`);
      return;
    }
    if (event.type === "error") {
      output.write(`${this.terminalTheme.error(`error · ${event.code}`)} ${event.message}\n`);
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

function activeProfile(config: Awaited<ReturnType<FileModelProfileRepository["load"]>>): ModelProfile | undefined {
  return config.profiles.find((profile) => profile.id === config.activeProfileId);
}

function lesson(profile: ModelProfile | undefined): string {
  const modelState = profile ? `${profile.displayName} · ${profile.model}` : "no model connected";
  return [
    `${theme.faint("WZD · LESSON 01")}    ${profile ? theme.accent("●") : theme.faint("○")} ${theme.faint(modelState)}`,
    "",
    theme.primary("Meet your Python workspace"),
    theme.soft("Goal: understand the prompt, run a small Python statement, and use an error as evidence."),
    "",
    `${theme.faint("try")} ${theme.primary('/run print("Hello, Python!")')}`,
    `${theme.faint("then")} Ask the tutor what each part of that statement means.`,
  ].join("\n");
}

async function runPythonTutor(): Promise<void> {
  const readline = createInterface({ input, output });
  const usage = new SessionUsage();
  const events = new TerminalEventSink(theme, usage);
  const repository = new FileLearnerRepository(learnerRoot);
  const modelRepository = new FileModelProfileRepository(modelConfigPath);
  const modelConfig = await modelRepository.load();
  const profile = activeProfile(modelConfig);
  const tutorAgent = profile ? new OpenAICompatibleTutorAgent(profile, new PlatformSecretStore()) : undefined;
  const engine = new TutorEngine({
    repository,
    events,
    tutorAgent,
    pythonRunner: new LocalPythonRunner(),
  });
  const displayName = argument("--name") ?? ((await readline.question("What should I call you? ")) || "Learner");
  const weeklyHours = Number(argument("--hours") ?? ((await readline.question("How many hours can you study each week? [10] ")) || "10"));
  if (!Number.isFinite(weeklyHours) || weeklyHours <= 0 || weeklyHours > 80) {
    readline.close();
    throw new Error("Study hours must be a number between 0 and 80.");
  }
  const learnerId = argument("--learner-id") ?? learnerIdFor(displayName);
  const commandId = () => `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await engine.dispatch({ type: "start_session", commandId: commandId(), learnerId, displayName, weeklyHours });
  output.write(`\n${lesson(profile)}\n`);
  if (!profile) output.write(`\n${theme.faint("Connect an agent with")} ${theme.primary("bunx wzdsh models add")}\n`);
  output.write(`\n${theme.faint("Type /help for commands. Normal text goes to your tutor.")}\n`);

  for (;;) {
    let line: string;
    try {
      line = (await readline.question(`\n${theme.accent("you ›")} `)).trim();
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ERR_USE_AFTER_CLOSE") break;
      throw error;
    }
    if (!line) continue;
    if (line === "/quit" || line === "/exit") break;
    if (line === "/help") {
      output.write(`\n${pythonHelp}`);
      continue;
    }
    if (line === "/lesson") {
      output.write(`\n${lesson(profile)}\n`);
      continue;
    }
    if (line === "/progress") {
      await engine.dispatch({ type: "show_progress", commandId: commandId(), learnerId });
      continue;
    }
    if (line === "/model") {
      output.write(profile
        ? `${theme.accent("●")} ${profile.displayName} · ${profile.model}\n${theme.faint("Change it with bunx wzdsh models use <profile-id>, then restart this session.")}\n`
        : `${theme.faint("No model connected.")} Run ${theme.primary("bunx wzdsh models add")} in another terminal.\n`);
      continue;
    }
    if (line === "/usage") {
      output.write(`${theme.faint("SESSION USAGE")}\n${usage.inputTokens} input · ${usage.outputTokens} output · ${usage.totalTokens} total tokens\n`);
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
    if (line === "/run" || line.startsWith("/run ")) {
      const inlineCode = line.slice(4).trim();
      const code = inlineCode || await readMultilineCode(readline);
      await engine.dispatch({ type: "run_code", commandId: commandId(), learnerId, code });
      continue;
    }
    if (line.startsWith("/")) {
      output.write(`${theme.faint("Unknown command. Type /help to see the available commands.")}\n`);
      continue;
    }
    await engine.dispatch({ type: "learner_message", commandId: commandId(), learnerId, content: line });
  }
  await engine.dispatch({ type: "close_session", commandId: commandId(), learnerId });
  readline.close();
}

async function readMultilineCode(readline: ReturnType<typeof createInterface>): Promise<string> {
  output.write(`${theme.faint("Enter Python code. Type /end on its own line to run it.")}\n`);
  const lines: string[] = [];
  for (;;) {
    const line = await readline.question(theme.faint("... "));
    if (line.trim() === "/end") return lines.join("\n");
    lines.push(line);
  }
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
  if (command === "models") {
    await runModelsCommand({ args: process.argv.slice(3), wzdRoot, input, output, errorOutput: stderr, theme });
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
  stderr.write(`${theme.error("WZD could not continue:")} ${message}\n`);
  process.exitCode = 1;
}
