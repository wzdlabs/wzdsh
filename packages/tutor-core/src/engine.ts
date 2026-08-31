import { randomUUID } from "node:crypto";
import { pythonBackendPath, type CompetencyDefinition } from "./catalog";
import { calculateForecast } from "./forecast";
import type { Clock, IdGenerator, LearnerRepository, PythonRunner, TutorAgent, TutorEventSink } from "./ports";
import { TutorCommandSchema, TutorEventSchema, type TutorCommand, type TutorEvent } from "./protocol";
import { LearnerSchema, type Learner } from "./schemas";

type TutorEngineOptions = {
  repository: LearnerRepository;
  events: TutorEventSink;
  curriculum?: readonly CompetencyDefinition[];
  tutorAgent?: TutorAgent;
  pythonRunner?: PythonRunner;
  clock?: Clock;
  ids?: IdGenerator;
};

type DistributiveOmit<T, Keys extends PropertyKey> = T extends unknown ? Omit<T, Keys> : never;
type TutorEventPayload = DistributiveOmit<TutorEvent, "eventId" | "commandId" | "occurredAt">;

class TutorEngineError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const systemClock: Clock = { now: () => new Date() };
const uuidGenerator: IdGenerator = { next: () => randomUUID() };

export class TutorEngine {
  private readonly repository: LearnerRepository;
  private readonly events: TutorEventSink;
  private readonly curriculum: readonly CompetencyDefinition[];
  private readonly tutorAgent?: TutorAgent;
  private readonly pythonRunner?: PythonRunner;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  constructor(options: TutorEngineOptions) {
    this.repository = options.repository;
    this.events = options.events;
    this.curriculum = options.curriculum ?? pythonBackendPath;
    this.tutorAgent = options.tutorAgent;
    this.pythonRunner = options.pythonRunner;
    this.clock = options.clock ?? systemClock;
    this.ids = options.ids ?? uuidGenerator;
  }

  async dispatch(input: unknown): Promise<void> {
    const parsed = TutorCommandSchema.safeParse(input);
    if (!parsed.success) {
      await this.emitError("unknown", "invalid_command", parsed.error.issues.map((issue) => issue.message).join("; "), true);
      return;
    }

    const command = parsed.data;
    try {
      await this.handle(command);
    } catch (error) {
      await this.emitError(
        command.commandId,
        error instanceof TutorEngineError ? error.code : "engine_error",
        error instanceof Error ? error.message : "Unknown tutor engine error",
        true,
      );
    }
  }

  private async handle(command: TutorCommand): Promise<void> {
    if (command.type === "start_session") {
      const existing = await this.repository.load(command.learnerId);
      const learner = existing
        ? {
            ...existing,
            displayName: command.displayName,
            weeklyHours: command.weeklyHours ?? existing.weeklyHours,
            targetRole: command.targetRole ?? existing.targetRole,
            lastSessionAt: this.now(),
          }
        : this.createLearner(command);
      await this.save(learner);
      await this.emit(command.commandId, { type: "session_started", learner });
      await this.emitProgress(command.commandId, learner);
      return;
    }

    const learner = await this.requireLearner(command.learnerId);
    learner.lastSessionAt = this.now();

    if (command.type === "show_progress") {
      await this.save(learner);
      await this.emitProgress(command.commandId, learner);
      return;
    }

    if (command.type === "record_activity") {
      const progress = this.requireAccessibleCompetency(learner, command.competencyId);
      progress.activeMinutes += command.minutes;
      progress.status = progress.status === "available" ? "learning" : progress.status;
      progress.updatedAt = this.now();
      learner.activeMinutes += command.minutes;
      await this.save(learner);
      await this.emitProgress(command.commandId, learner);
      return;
    }

    if (command.type === "submit_assessment") {
      await this.submitAssessment(command, learner);
      return;
    }

    if (command.type === "learner_message") {
      if (!this.tutorAgent) {
        await this.emitError(command.commandId, "tutor_unavailable", "No tutor model is configured.", true);
        return;
      }
      const current = this.currentCompetency(learner);
      const reply = await this.tutorAgent.reply({
        mode: "coach",
        learner,
        content: command.content,
        competencyId: current?.competencyId ?? null,
      });
      await this.save(learner);
      await this.emit(command.commandId, {
        type: "tutor_message",
        content: reply.content,
        suggestedActions: reply.suggestedActions ?? [],
      });
      return;
    }

    if (command.type === "request_hint") {
      const progress = this.requireAccessibleCompetency(learner, command.competencyId);
      progress.hintsUsed += 1;
      progress.status = progress.status === "available" ? "learning" : progress.status;
      progress.updatedAt = this.now();
      await this.save(learner);
      if (!this.tutorAgent) {
        await this.emitError(command.commandId, "tutor_unavailable", "No tutor model is configured.", true);
        return;
      }
      const reply = await this.tutorAgent.reply({
        mode: "hint",
        learner,
        content: command.context ?? "Give one progressive hint without revealing the full solution.",
        competencyId: command.competencyId,
      });
      await this.emit(command.commandId, {
        type: "tutor_message",
        content: reply.content,
        suggestedActions: reply.suggestedActions ?? [],
      });
      return;
    }

    if (command.type === "run_code") {
      if (!this.pythonRunner) {
        await this.emitError(command.commandId, "runner_unavailable", "No Python runner is configured.", true);
        return;
      }
      const result = await this.pythonRunner.run({ code: command.code, timeoutMs: command.timeoutMs ?? 5_000 });
      await this.save(learner);
      await this.emit(command.commandId, { type: "code_result", ...result });
      return;
    }

    await this.save(learner);
    await this.emit(command.commandId, { type: "session_closed", learnerId: learner.id });
  }

  private createLearner(command: Extract<TutorCommand, { type: "start_session" }>): Learner {
    const now = this.now();
    return {
      schemaVersion: 1,
      id: command.learnerId,
      displayName: command.displayName,
      targetRole: command.targetRole ?? "Junior Python backend developer",
      weeklyHours: command.weeklyHours ?? 10,
      activeMinutes: 0,
      createdAt: now,
      lastSessionAt: now,
      competencies: this.curriculum.map((definition) => ({
        competencyId: definition.id,
        status: definition.prerequisites.length === 0 ? "available" : "locked",
        mastery: 0,
        attempts: 0,
        hintsUsed: 0,
        activeMinutes: 0,
        updatedAt: now,
      })),
      evidence: [],
    };
  }

  private async submitAssessment(command: Extract<TutorCommand, { type: "submit_assessment" }>, learner: Learner): Promise<void> {
    const progress = this.requireAccessibleCompetency(learner, command.competencyId);
    const definition = this.requireDefinition(command.competencyId);
    const passed = command.score >= definition.passingScore;
    progress.attempts += 1;
    progress.mastery = passed ? 1 : Math.max(progress.mastery, command.score / 100);
    progress.status = passed ? "mastered" : "learning";
    progress.updatedAt = this.now();
    learner.evidence.push({
      id: command.evidenceId ?? this.ids.next(),
      competencyId: command.competencyId,
      kind: "assessment",
      score: command.score,
      passed,
      createdAt: this.now(),
    });

    const unlocked = passed ? this.unlockEligibleCompetencies(learner) : [];
    await this.save(learner);
    await this.emit(command.commandId, {
      type: "assessment_result",
      competencyId: command.competencyId,
      score: command.score,
      passingScore: definition.passingScore,
      passed,
    });
    await this.emit(command.commandId, {
      type: "gate_updated",
      competencyId: command.competencyId,
      status: progress.status,
    });
    for (const competencyId of unlocked) {
      await this.emit(command.commandId, { type: "gate_updated", competencyId, status: "available" });
    }
    await this.emitProgress(command.commandId, learner);
  }

  private unlockEligibleCompetencies(learner: Learner): string[] {
    const progressById = new Map(learner.competencies.map((item) => [item.competencyId, item]));
    const unlocked: string[] = [];
    for (const definition of this.curriculum) {
      const progress = progressById.get(definition.id);
      if (!progress || progress.status !== "locked") continue;
      const ready = definition.prerequisites.every((id) => progressById.get(id)?.status === "mastered");
      if (ready) {
        progress.status = "available";
        progress.updatedAt = this.now();
        unlocked.push(definition.id);
      }
    }
    return unlocked;
  }

  private currentCompetency(learner: Learner) {
    return learner.competencies.find((item) => item.status === "learning")
      ?? learner.competencies.find((item) => item.status === "available")
      ?? null;
  }

  private requireAccessibleCompetency(learner: Learner, competencyId: string) {
    const progress = learner.competencies.find((item) => item.competencyId === competencyId);
    if (!progress) throw new TutorEngineError("unknown_competency", `Unknown competency: ${competencyId}`);
    if (progress.status === "locked") throw new TutorEngineError("gate_locked", `Competency is locked: ${competencyId}`);
    return progress;
  }

  private requireDefinition(competencyId: string): CompetencyDefinition {
    const definition = this.curriculum.find((item) => item.id === competencyId);
    if (!definition) throw new TutorEngineError("unknown_competency", `Unknown competency definition: ${competencyId}`);
    return definition;
  }

  private async requireLearner(learnerId: string): Promise<Learner> {
    const learner = await this.repository.load(learnerId);
    if (!learner) throw new TutorEngineError("learner_not_found", `Learner not found: ${learnerId}`);
    return learner;
  }

  private async save(learner: Learner): Promise<void> {
    await this.repository.save(LearnerSchema.parse(learner));
  }

  private async emitProgress(commandId: string, learner: Learner): Promise<void> {
    await this.emit(commandId, {
      type: "progress_snapshot",
      forecast: calculateForecast(learner, this.curriculum),
      currentCompetencyId: this.currentCompetency(learner)?.competencyId ?? null,
    });
  }

  private async emit(
    commandId: string,
    event: TutorEventPayload,
  ): Promise<void> {
    const completeEvent = TutorEventSchema.parse({
      ...event,
      eventId: this.ids.next(),
      commandId,
      occurredAt: this.now(),
    });
    await this.events.emit(completeEvent);
  }

  private async emitError(commandId: string, code: string, message: string, recoverable: boolean): Promise<void> {
    await this.emit(commandId, { type: "error", code, message, recoverable });
  }

  private now(): string {
    return this.clock.now().toISOString();
  }
}
