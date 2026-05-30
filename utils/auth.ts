import { AuthSessionSchema } from "../state/schemas";
import type { AuthSession } from "../types";
import { readJSON, writeJSON } from "./files";
import { rootBusinessPath, formatZodError } from "../state/stateManager";

const authPath = rootBusinessPath(".auth.json");

export async function loadAuthSession(): Promise<AuthSession> {
  const raw = await readJSON<AuthSession>(authPath);
  const fallback: AuthSession = { signed_in: false, email: "", name: "", signed_in_at: "" };
  const result = AuthSessionSchema.safeParse({ ...fallback, ...raw });
  if (!result.success) throw new Error(`Invalid auth session\n${formatZodError(result.error)}`);
  return result.data;
}

export async function signIn(email: string, name: string): Promise<AuthSession> {
  const session: AuthSession = {
    signed_in: true,
    email,
    name,
    signed_in_at: new Date().toISOString(),
  };
  const result = AuthSessionSchema.safeParse(session);
  if (!result.success) throw new Error(`Invalid sign in\n${formatZodError(result.error)}`);
  await writeJSON(authPath, result.data);
  return result.data;
}

export async function signOut(): Promise<void> {
  await writeJSON(authPath, { signed_in: false, email: "", name: "", signed_in_at: "" });
}
