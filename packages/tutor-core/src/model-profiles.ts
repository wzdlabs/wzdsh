import { z } from "zod";

export const CredentialReferenceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }).strict(),
  z.object({
    type: z.literal("environment"),
    variable: z.string().regex(/^[A-Z_][A-Z0-9_]*$/, "Use an uppercase environment variable name"),
  }).strict(),
  z.object({
    type: z.literal("keychain"),
    service: z.string().min(1),
    account: z.string().min(1),
  }).strict(),
  z.object({ type: z.literal("managed") }).strict(),
]);

export const ModelProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  source: z.enum(["local", "byok", "custom", "managed"]),
  transport: z.enum(["openai-compatible", "anthropic"]),
  apiStyle: z.enum(["responses", "chat-completions"]).default("chat-completions"),
  model: z.string().min(1),
  baseUrl: z.string().url().optional(),
  credential: CredentialReferenceSchema,
}).strict().superRefine((profile, context) => {
  if ((profile.source === "local" || profile.source === "custom") && !profile.baseUrl) {
    context.addIssue({ code: "custom", message: `${profile.source} profiles require a baseUrl`, path: ["baseUrl"] });
  }
  if (profile.source === "local" && profile.credential.type !== "none") {
    context.addIssue({ code: "custom", message: "Local profiles must not require a stored API key", path: ["credential"] });
  }
  if (profile.source === "managed" && profile.credential.type !== "managed") {
    context.addIssue({ code: "custom", message: "Managed profiles must use managed credentials", path: ["credential"] });
  }
  if ((profile.source === "byok" || profile.source === "custom") && profile.credential.type === "managed") {
    context.addIssue({ code: "custom", message: `${profile.source} profiles cannot use managed credentials`, path: ["credential"] });
  }
});

export const ModelProfileConfigSchema = z.object({
  schemaVersion: z.literal(1),
  activeProfileId: z.string().min(1).nullable(),
  profiles: z.array(ModelProfileSchema),
}).strict().superRefine((config, context) => {
  const ids = new Set<string>();
  for (const [index, profile] of config.profiles.entries()) {
    if (ids.has(profile.id)) {
      context.addIssue({ code: "custom", message: `Duplicate model profile id: ${profile.id}`, path: ["profiles", index, "id"] });
    }
    ids.add(profile.id);
  }
  if (config.activeProfileId && !ids.has(config.activeProfileId)) {
    context.addIssue({ code: "custom", message: "Active model profile does not exist", path: ["activeProfileId"] });
  }
});

export type CredentialReference = z.infer<typeof CredentialReferenceSchema>;
export type ModelProfile = z.infer<typeof ModelProfileSchema>;
export type ModelProfileConfig = z.infer<typeof ModelProfileConfigSchema>;

export function emptyModelProfileConfig(): ModelProfileConfig {
  return { schemaVersion: 1, activeProfileId: null, profiles: [] };
}

export function upsertModelProfile(config: ModelProfileConfig, input: ModelProfile): ModelProfileConfig {
  const current = ModelProfileConfigSchema.parse(config);
  const profile = ModelProfileSchema.parse(input);
  const existingIndex = current.profiles.findIndex((item) => item.id === profile.id);
  const profiles = [...current.profiles];
  if (existingIndex >= 0) profiles[existingIndex] = profile;
  else profiles.push(profile);
  return ModelProfileConfigSchema.parse({
    ...current,
    activeProfileId: current.activeProfileId ?? profile.id,
    profiles,
  });
}

export function selectModelProfile(config: ModelProfileConfig, profileId: string): ModelProfileConfig {
  return ModelProfileConfigSchema.parse({ ...config, activeProfileId: profileId });
}

export function removeModelProfile(config: ModelProfileConfig, profileId: string): ModelProfileConfig {
  const current = ModelProfileConfigSchema.parse(config);
  const profiles = current.profiles.filter((profile) => profile.id !== profileId);
  if (profiles.length === current.profiles.length) {
    throw new Error(`Model profile does not exist: ${profileId}`);
  }
  return ModelProfileConfigSchema.parse({
    ...current,
    activeProfileId: current.activeProfileId === profileId ? profiles[0]?.id ?? null : current.activeProfileId,
    profiles,
  });
}

export interface SecretResolver {
  resolve(reference: CredentialReference): Promise<string | null>;
}

export class EnvironmentSecretResolver implements SecretResolver {
  constructor(private readonly environment: Readonly<Record<string, string | undefined>> = process.env) {}

  async resolve(reference: CredentialReference): Promise<string | null> {
    if (reference.type === "none" || reference.type === "managed") return null;
    if (reference.type === "keychain") {
      throw new Error("Keychain credentials require a desktop keychain adapter.");
    }
    return this.environment[reference.variable] ?? null;
  }
}
