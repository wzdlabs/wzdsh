import type { LearnerRepository, TutorEventSink } from "./ports";
import type { TutorEvent } from "./protocol";
import type { Learner } from "./schemas";

export class MemoryLearnerRepository implements LearnerRepository {
  private readonly learners = new Map<string, Learner>();

  async load(learnerId: string): Promise<Learner | null> {
    const learner = this.learners.get(learnerId);
    return learner ? structuredClone(learner) : null;
  }

  async save(learner: Learner): Promise<void> {
    this.learners.set(learner.id, structuredClone(learner));
  }
}
export class CollectingEventSink implements TutorEventSink {
  readonly events: TutorEvent[] = [];

  emit(event: TutorEvent): void {
    this.events.push(structuredClone(event));
  }
}
