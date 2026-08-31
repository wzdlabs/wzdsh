import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalPythonRunner } from "../packages/tutor-runtime/src";
import {
  CollectingEventSink,
  FileLearnerRepository,
  EnvironmentSecretResolver,
  ModelProfileSchema,
  MemoryLearnerRepository,
  TutorEngine,
  calculateForecast,
  pythonBackendPath,
  emptyModelProfileConfig,
  selectModelProfile,
  upsertModelProfile,
  type Learner,
} from "../packages/tutor-core/src";

const fixedClock = { now: () => new Date("2026-08-30T12:00:00.000Z") };
let id = 0;
const ids = { next: () => `test-${++id}` };
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test("starts a new learner at the first unlocked gate", async () => {
  const repository = new MemoryLearnerRepository();
  const events = new CollectingEventSink();
  const engine = new TutorEngine({ repository, events, clock: fixedClock, ids });

  await engine.dispatch({
    type: "start_session",
    commandId: "start-1",
    learnerId: "first-user",
    displayName: "First User",
    weeklyHours: 10,
  });

  expect(events.events.map((event) => event.type)).toEqual(["session_started", "progress_snapshot"]);
  const learner = await repository.load("first-user");
  expect(learner?.competencies[0]?.status).toBe("available");
  expect(learner?.competencies[1]?.status).toBe("locked");
  const progress = events.events[1];
  expect(progress?.type === "progress_snapshot" && progress.currentCompetencyId).toBe("computer-terminal");
});

test("a passing assessment masters one gate and unlocks the next", async () => {
  const repository = new MemoryLearnerRepository();
  const events = new CollectingEventSink();
  const engine = new TutorEngine({ repository, events, clock: fixedClock, ids });
  await engine.dispatch({
    type: "start_session",
    commandId: "start-2",
    learnerId: "learner-2",
    displayName: "Learner Two",
  });
  events.events.length = 0;

  await engine.dispatch({
    type: "submit_assessment",
    commandId: "assessment-1",
    learnerId: "learner-2",
    competencyId: "computer-terminal",
    score: 86,
  });

  const learner = await repository.load("learner-2");
  expect(learner?.competencies[0]?.status).toBe("mastered");
  expect(learner?.competencies[1]?.status).toBe("available");
  expect(learner?.evidence[0]?.passed).toBe(true);
  expect(events.events.some((event) => event.type === "gate_updated" && event.competencyId === "python-core")).toBe(true);
});

test("a learner cannot skip a locked assessment gate", async () => {
  const repository = new MemoryLearnerRepository();
  const events = new CollectingEventSink();
  const engine = new TutorEngine({ repository, events, clock: fixedClock, ids });
  await engine.dispatch({
    type: "start_session",
    commandId: "start-locked",
    learnerId: "learner-locked",
    displayName: "Locked Learner",
  });
  events.events.length = 0;

  await engine.dispatch({
    type: "submit_assessment",
    commandId: "skip-ahead",
    learnerId: "learner-locked",
    competencyId: "python-core",
    score: 100,
  });

  expect(events.events).toHaveLength(1);
  expect(events.events[0]?.type === "error" && events.events[0].code).toBe("gate_locked");
  const learner = await repository.load("learner-locked");
  expect(learner?.competencies[1]?.status).toBe("locked");
  expect(learner?.evidence).toHaveLength(0);
});

test("weekly pace changes calendar time without granting mastery", () => {
  const learner: Learner = {
    schemaVersion: 1,
    id: "pace-test",
    displayName: "Pace Test",
    targetRole: "Junior Python backend developer",
    weeklyHours: 5,
    activeMinutes: 0,
    createdAt: "2026-08-30T12:00:00.000Z",
    lastSessionAt: "2026-08-30T12:00:00.000Z",
    competencies: pythonBackendPath.map((definition, index) => ({
      competencyId: definition.id,
      status: index === 0 ? "available" : "locked",
      mastery: 0,
      attempts: 0,
      hintsUsed: 0,
      activeMinutes: 0,
      updatedAt: "2026-08-30T12:00:00.000Z",
    })),
    evidence: [],
  };

  const slow = calculateForecast(learner, pythonBackendPath);
  const fast = calculateForecast({ ...learner, weeklyHours: 10 }, pythonBackendPath);
  expect(slow.level).toBe(0);
  expect(slow.estimatedRemainingHours).toEqual(fast.estimatedRemainingHours);
  expect(slow.estimatedCalendarWeeks.low).toBe(fast.estimatedCalendarWeeks.low * 2);
});

test("file learner repository persists validated state without using learner ids as paths", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wzd-tutor-test-"));
  temporaryDirectories.push(directory);
  const repository = new FileLearnerRepository(directory);
  const events = new CollectingEventSink();
  const engine = new TutorEngine({ repository, events, clock: fixedClock, ids });

  await engine.dispatch({
    type: "start_session",
    commandId: "persist-start",
    learnerId: "../first/user",
    displayName: "Persistent Learner",
    weeklyHours: 8,
  });

  const reloadedRepository = new FileLearnerRepository(directory);
  const learner = await reloadedRepository.load("../first/user");
  expect(learner?.displayName).toBe("Persistent Learner");
  expect(learner?.weeklyHours).toBe(8);
});

test("model profiles support local and BYOK models without storing raw secrets", async () => {
  const local = ModelProfileSchema.parse({
    id: "local-ollama",
    displayName: "Local Ollama",
    source: "local",
    transport: "openai-compatible",
    model: "learner-selected-model",
    baseUrl: "http://localhost:11434/v1",
    credential: { type: "none" },
  });
  const byok = ModelProfileSchema.parse({
    id: "my-provider",
    displayName: "My API provider",
    source: "byok",
    transport: "openai-compatible",
    model: "provider-model",
    credential: { type: "environment", variable: "PYTHON_TUTOR_API_KEY" },
  });
  let config = upsertModelProfile(emptyModelProfileConfig(), local);
  config = upsertModelProfile(config, byok);
  config = selectModelProfile(config, "my-provider");

  expect(config.activeProfileId).toBe("my-provider");
  expect(JSON.stringify(config)).not.toContain("secret-value");
  const resolver = new EnvironmentSecretResolver({ PYTHON_TUTOR_API_KEY: "secret-value" });
  expect(await resolver.resolve(byok.credential)).toBe("secret-value");
  expect(ModelProfileSchema.safeParse({ ...byok, apiKey: "secret-value" }).success).toBe(false);
});

test("local Python runner captures output and enforces a timeout", async () => {
  const runner = new LocalPythonRunner();
  const success = await runner.run({ code: 'print("hello learner")', timeoutMs: 1_000 });
  expect(success.stdout).toBe("hello learner\n");
  expect(success.exitCode).toBe(0);
  expect(success.timedOut).toBe(false);

  const timeout = await runner.run({ code: "while True:\n    pass", timeoutMs: 100 });
  expect(timeout.timedOut).toBe(true);
  expect(timeout.exitCode).not.toBe(0);
});
