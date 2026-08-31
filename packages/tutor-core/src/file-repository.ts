import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LearnerRepository } from "./ports";
import { LearnerSchema, type Learner } from "./schemas";

export class FileLearnerRepository implements LearnerRepository {
  constructor(private readonly rootDirectory: string) {}

  async load(learnerId: string): Promise<Learner | null> {
    try {
      const raw = await readFile(this.pathFor(learnerId), "utf8");
      return LearnerSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async save(learner: Learner): Promise<void> {
    const validated = LearnerSchema.parse(learner);
    await mkdir(this.rootDirectory, { recursive: true });
    const destination = this.pathFor(validated.id);
    const temporary = join(this.rootDirectory, `.${this.fileName(validated.id)}.${randomUUID()}.tmp`);
    await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, destination);
  }

  private pathFor(learnerId: string): string {
    return join(this.rootDirectory, `${this.fileName(learnerId)}.json`);
  }

  private fileName(learnerId: string): string {
    return Buffer.from(learnerId, "utf8").toString("base64url");
  }
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
