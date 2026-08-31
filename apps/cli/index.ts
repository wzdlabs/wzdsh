import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  FileLearnerRepository,
  TutorEngine,
  type TutorEvent,
  type TutorEventSink,
} from "../../packages/tutor-core/src";

const learnerRoot = join(process.cwd(), ".wzd", "learners");

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

async function main(): Promise<void> {
  const readline = createInterface({ input, output });
  const events = new TerminalEventSink();
  const repository = new FileLearnerRepository(learnerRoot);
  const engine = new TutorEngine({ repository, events });
  const displayName = argument("--name") ?? ((await readline.question("What should I call you? ")) || "Learner");
  const weeklyHours = Number(argument("--hours") ?? ((await readline.question("How many hours can you study each week? [10] ")) || "10"));
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

await main();
