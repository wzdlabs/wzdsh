import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  ModelProfileConfigSchema,
  emptyModelProfileConfig,
  type ModelProfileConfig,
} from "./model-profiles";

export class FileModelProfileRepository {
  constructor(private readonly filePath: string) {}

  async load(): Promise<ModelProfileConfig> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return ModelProfileConfigSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return emptyModelProfileConfig();
      }
      throw error;
    }
  }

  async save(config: ModelProfileConfig): Promise<void> {
    const validated = ModelProfileConfigSchema.parse(config);
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}
