import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import {
  FileModelProfileRepository,
  ModelProfileSchema,
  removeModelProfile,
  selectModelProfile,
  upsertModelProfile,
  type CredentialReference,
  type ModelProfile,
} from "../../packages/tutor-core/src";
import { OpenAICompatibleTutorAgent, PlatformSecretStore } from "../../packages/tutor-runtime/src";
import type { TerminalTheme } from "./theme";

type ModelsCommandOptions = {
  args: string[];
  wzdRoot: string;
  input: NodeJS.ReadStream;
  output: NodeJS.WriteStream;
  errorOutput: NodeJS.WriteStream;
  theme: TerminalTheme;
};

const modelsHelp = `WZD model profiles\n\nUsage:\n  wzdsh models add [openrouter|openai|custom]\n  wzdsh models list\n  wzdsh models use <profile-id>\n  wzdsh models update [profile-id] --model <model>\n  wzdsh models key [profile-id]\n  wzdsh models test [profile-id]\n  wzdsh models remove <profile-id>\n\nOptions for add/update:\n  --id <id>              Profile identifier\n  --display-name <name>  Profile label\n  --model <model>        Provider model slug\n  --base-url <url>       Custom API base URL\n  --api-style <style>    responses or chat-completions\n  --key-env <variable>   Read the API key from an environment variable\n  --no-key               Connect without authentication\n  --skip-test            Save without testing the connection\n`;

export async function runModelsCommand(options: ModelsCommandOptions): Promise<void> {
  const repository = new FileModelProfileRepository(join(options.wzdRoot, "models.json"));
  const secrets = new PlatformSecretStore();
  const [subcommand] = options.args;

  if (!subcommand || subcommand === "list") {
    await listProfiles(repository, options);
    return;
  }
  if (subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    options.output.write(modelsHelp);
    return;
  }
  if (subcommand === "add") {
    await addProfile(repository, secrets, options);
    return;
  }
  if (subcommand === "use") {
    const profileId = options.args[1];
    if (!profileId) throw new Error("Usage: wzdsh models use <profile-id>");
    const current = await repository.load();
    if (!current.profiles.some((profile) => profile.id === profileId)) {
      throw new Error(`Model profile does not exist: ${profileId}`);
    }
    const config = selectModelProfile(current, profileId);
    await repository.save(config);
    options.output.write(`${options.theme.accent("selected")} ${profileId}\n`);
    return;
  }
  if (subcommand === "update") {
    const current = await repository.load();
    const requestedId = options.args[1] && !options.args[1]?.startsWith("--") ? options.args[1] : undefined;
    const profileId = requestedId ?? current.activeProfileId;
    const profile = current.profiles.find((item) => item.id === profileId);
    if (!profile) throw new Error(profileId ? `Model profile does not exist: ${profileId}` : "No active model profile.");
    const updated = ModelProfileSchema.parse({
      ...profile,
      displayName: flag(options.args, "--display-name") ?? profile.displayName,
      model: flag(options.args, "--model") ?? profile.model,
      baseUrl: flag(options.args, "--base-url") ?? profile.baseUrl,
      apiStyle: flag(options.args, "--api-style") ?? profile.apiStyle,
    });
    if (JSON.stringify(updated) === JSON.stringify(profile)) {
      throw new Error("Nothing to update. Pass --model, --display-name, --base-url, or --api-style.");
    }
    await repository.save(upsertModelProfile(current, updated));
    options.output.write(`${options.theme.accent("updated")} ${updated.id} · ${updated.model}\n`);
    options.output.write(`${options.theme.faint("Verify it with")} wzdsh models test ${updated.id}\n`);
    return;
  }
  if (subcommand === "key") {
    const current = await repository.load();
    const profileId = options.args[1] ?? current.activeProfileId;
    const profile = current.profiles.find((item) => item.id === profileId);
    if (!profile) throw new Error(profileId ? `Model profile does not exist: ${profileId}` : "No active model profile.");
    if (profile.credential.type === "environment") {
      throw new Error(`This profile reads ${profile.credential.variable}. Update that environment variable instead.`);
    }
    if (profile.credential.type !== "keychain") {
      throw new Error("This profile does not use an API key.");
    }
    const previousKey = await secrets.resolve(profile.credential);
    const key = await readSecret(options.input, options.output, `${profile.displayName} API key: `);
    await secrets.save(profile.credential, key);
    try {
      await testProfile(profile, secrets, options);
    } catch (error) {
      if (previousKey) await secrets.save(profile.credential, previousKey);
      else await secrets.remove(profile.credential);
      throw error;
    }
    options.output.write(`${options.theme.accent("updated")} ${profile.displayName} key\n`);
    return;
  }
  if (subcommand === "test") {
    const config = await repository.load();
    const profileId = options.args[1] ?? config.activeProfileId;
    const profile = config.profiles.find((item) => item.id === profileId);
    if (!profile) throw new Error(profileId ? `Model profile does not exist: ${profileId}` : "No active model profile. Run wzdsh models add.");
    await testProfile(profile, secrets, options);
    return;
  }
  if (subcommand === "remove") {
    const profileId = options.args[1];
    if (!profileId) throw new Error("Usage: wzdsh models remove <profile-id>");
    const current = await repository.load();
    const profile = current.profiles.find((item) => item.id === profileId);
    if (!profile) throw new Error(`Model profile does not exist: ${profileId}`);
    if (profile.credential.type === "keychain") await secrets.remove(profile.credential);
    await repository.save(removeModelProfile(current, profileId));
    options.output.write(`${options.theme.soft("removed")} ${profileId}\n`);
    return;
  }

  options.errorOutput.write(`Unknown models command: ${subcommand}\n\n${modelsHelp}`);
  process.exitCode = 1;
}

async function listProfiles(
  repository: FileModelProfileRepository,
  options: ModelsCommandOptions,
): Promise<void> {
  const config = await repository.load();
  options.output.write(`${options.theme.faint("MODEL PROFILES")}\n\n`);
  if (config.profiles.length === 0) {
    options.output.write(`No model profiles configured.\nRun ${options.theme.primary("bunx wzdsh models add")} to connect one.\n`);
    return;
  }
  for (const profile of config.profiles) {
    const marker = profile.id === config.activeProfileId ? options.theme.accent("●") : options.theme.faint("○");
    options.output.write(`${marker} ${options.theme.primary(profile.id)} · ${profile.displayName}\n`);
    options.output.write(`  ${options.theme.faint(`${profile.model} · ${profile.baseUrl ?? "https://api.openai.com/v1"}`)}\n`);
  }
}

async function addProfile(
  repository: FileModelProfileRepository,
  secrets: PlatformSecretStore,
  options: ModelsCommandOptions,
): Promise<void> {
  const readline = createInterface({ input: options.input, output: options.output });
  let provider = options.args[1]?.toLowerCase();
  if (!provider) {
    options.output.write(`${options.theme.faint("CONNECT A MODEL")}\n\n1  OpenRouter\n2  OpenAI\n3  Custom OpenAI-compatible endpoint\n\n`);
    const choice = (await readline.question("Choose a provider [1]: ")).trim() || "1";
    provider = ({ "1": "openrouter", "2": "openai", "3": "custom" } as Record<string, string>)[choice] ?? choice;
  }
  if (!new Set(["openrouter", "openai", "custom"]).has(provider)) {
    readline.close();
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const defaults = providerDefaults(provider);
  const id = flag(options.args, "--id") ?? await ask(readline, `Profile id [${defaults.id}]: `, defaults.id);
  const displayName = flag(options.args, "--display-name") ?? await ask(readline, `Display name [${defaults.displayName}]: `, defaults.displayName);
  const model = flag(options.args, "--model") ?? await ask(readline, `Model [${defaults.model}]: `, defaults.model);
  const baseUrl = flag(options.args, "--base-url") ?? (provider === "custom"
    ? await ask(readline, "API base URL: ")
    : defaults.baseUrl);
  const apiStyle = flag(options.args, "--api-style") ?? (provider === "openai" ? "responses" : "chat-completions");
  const keyEnvironment = flag(options.args, "--key-env");
  const noKey = options.args.includes("--no-key");
  const useKeychain = !noKey && !keyEnvironment && process.platform === "darwin";
  const credential: CredentialReference = noKey
    ? { type: "none" }
    : useKeychain
    ? { type: "keychain", service: "sh.wzd.models", account: id }
    : { type: "environment", variable: keyEnvironment ?? (provider === "openrouter" ? "OPENROUTER_API_KEY" : "OPENAI_API_KEY") };

  readline.close();
  const profile = ModelProfileSchema.parse({
    id,
    displayName,
    source: provider === "custom" ? "custom" : "byok",
    transport: "openai-compatible",
    apiStyle,
    model,
    baseUrl,
    credential,
  });

  const currentConfig = await repository.load();
  let keySaved = false;
  let previousKey: string | null = null;
  if (credential.type === "keychain") {
    previousKey = await secrets.resolve(credential);
    const providerLabel = provider === "openrouter" ? "OpenRouter" : provider === "openai" ? "OpenAI" : "Custom provider";
    const key = await readSecret(options.input, options.output, `${providerLabel} API key: `);
    await secrets.save(credential, key);
    keySaved = true;
  }

  try {
    if (!options.args.includes("--skip-test")) await testProfile(profile, secrets, options);
    const config = selectModelProfile(upsertModelProfile(currentConfig, profile), profile.id);
    await repository.save(config);
  } catch (error) {
    if (keySaved && credential.type === "keychain") {
      if (previousKey) await secrets.save(credential, previousKey);
      else await secrets.remove(credential);
    }
    throw error;
  }

  options.output.write(`\n${options.theme.accent("selected")} ${profile.displayName} · ${profile.model}\n`);
  options.output.write(`Start learning with ${options.theme.primary("bunx wzdsh python")}\n`);
}

async function testProfile(
  profile: ModelProfile,
  secrets: PlatformSecretStore,
  options: ModelsCommandOptions,
): Promise<void> {
  options.output.write(`${options.theme.faint("testing")} ${profile.displayName}...\n`);
  const agent = new OpenAICompatibleTutorAgent(profile, secrets);
  const result = await agent.testConnection();
  const modelState = result.modelAvailable ? "model found" : "endpoint reachable; model alias not listed";
  options.output.write(`${options.theme.accent("connected")} · ${modelState} · ${result.modelCount} models visible\n`);
}

function providerDefaults(provider: string) {
  if (provider === "openrouter") {
    return {
      id: "openrouter",
      displayName: "OpenRouter",
      model: "openrouter/free",
      baseUrl: "https://openrouter.ai/api/v1",
    };
  }
  if (provider === "openai") {
    return {
      id: "openai",
      displayName: "OpenAI",
      model: "gpt-5.6-terra",
      baseUrl: "https://api.openai.com/v1",
    };
  }
  return { id: "custom", displayName: "Custom endpoint", model: "", baseUrl: "" };
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function ask(readline: ReturnType<typeof createInterface>, prompt: string, fallback = ""): Promise<string> {
  const answer = (await readline.question(prompt)).trim();
  const value = answer || fallback;
  if (!value) throw new Error(`${prompt.replace(/[: ]+$/, "")} is required.`);
  return value;
}

async function readSecret(input: NodeJS.ReadStream, output: NodeJS.WriteStream, prompt: string): Promise<string> {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("A TTY is required for secure API-key entry. Use --key-env VARIABLE in non-interactive environments.");
  }
  output.write(prompt);
  const previousRawMode = input.isRaw;
  input.setRawMode(true);
  input.resume();

  return await new Promise<string>((resolve, reject) => {
    let value = "";
    const onData = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      for (const character of text) {
        if (character === "\u0003") {
          cleanup();
          output.write("\n");
          reject(new Error("API-key entry cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          output.write("\n");
          if (!value.trim()) reject(new Error("API key cannot be empty."));
          else resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            output.write("\b \b");
          }
          continue;
        }
        value += character;
        output.write("•");
      }
    };
    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(Boolean(previousRawMode));
      input.pause();
    };
    input.on("data", onData);
  });
}

export { modelsHelp };
