import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CredentialReference, SecretResolver } from "../../tutor-core/src";

const executeFile = promisify(execFile);

export interface WritableSecretStore extends SecretResolver {
  save(reference: Extract<CredentialReference, { type: "keychain" }>, secret: string): Promise<void>;
  remove(reference: Extract<CredentialReference, { type: "keychain" }>): Promise<void>;
}

export class PlatformSecretStore implements WritableSecretStore {
  constructor(private readonly environment: Readonly<Record<string, string | undefined>> = process.env) {}

  async resolve(reference: CredentialReference): Promise<string | null> {
    if (reference.type === "none") return null;
    if (reference.type === "environment") return this.environment[reference.variable] ?? null;
    if (reference.type === "managed") throw new Error("Managed WZD credentials are not available yet.");
    this.requireMacOS();
    try {
      const result = await executeFile("security", [
        "find-generic-password",
        "-s",
        reference.service,
        "-a",
        reference.account,
        "-w",
      ]);
      return result.stdout.trim() || null;
    } catch {
      return null;
    }
  }

  async save(reference: Extract<CredentialReference, { type: "keychain" }>, secret: string): Promise<void> {
    this.requireMacOS();
    if (!secret.trim()) throw new Error("API key cannot be empty.");
    await executeFile("security", [
      "add-generic-password",
      "-U",
      "-s",
      reference.service,
      "-a",
      reference.account,
      "-w",
      secret.trim(),
    ]);
  }

  async remove(reference: Extract<CredentialReference, { type: "keychain" }>): Promise<void> {
    this.requireMacOS();
    try {
      await executeFile("security", [
        "delete-generic-password",
        "-s",
        reference.service,
        "-a",
        reference.account,
      ]);
    } catch {
      // Removing an already-missing credential is idempotent.
    }
  }

  private requireMacOS(): void {
    if (process.platform !== "darwin") {
      throw new Error("OS keychain storage currently requires macOS. Use an environment-variable credential instead.");
    }
  }
}

export class MemorySecretStore implements WritableSecretStore {
  private readonly values = new Map<string, string>();

  async resolve(reference: CredentialReference): Promise<string | null> {
    if (reference.type === "none") return null;
    if (reference.type === "environment") return null;
    if (reference.type === "managed") return null;
    return this.values.get(this.key(reference)) ?? null;
  }

  async save(reference: Extract<CredentialReference, { type: "keychain" }>, secret: string): Promise<void> {
    this.values.set(this.key(reference), secret);
  }

  async remove(reference: Extract<CredentialReference, { type: "keychain" }>): Promise<void> {
    this.values.delete(this.key(reference));
  }

  private key(reference: Extract<CredentialReference, { type: "keychain" }>): string {
    return `${reference.service}:${reference.account}`;
  }
}
