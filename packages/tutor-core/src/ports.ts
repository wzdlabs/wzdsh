import type { TutorEvent } from "./protocol";
import type { Learner } from "./schemas";

export interface LearnerRepository {
  load(learnerId: string): Promise<Learner | null>;
  save(learner: Learner): Promise<void>;
}

export interface TutorEventSink {
  emit(event: TutorEvent): Promise<void> | void;
}

export interface TutorAgent {
  reply(input: {
    mode: "coach" | "hint";
    learner: Learner;
    content: string;
    competencyId: string | null;
  }): Promise<{ content: string; suggestedActions?: string[] }>;
}

export interface PythonRunner {
  run(input: { code: string; timeoutMs: number }): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
    outputLimitExceeded: boolean;
    durationMs: number;
  }>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}
