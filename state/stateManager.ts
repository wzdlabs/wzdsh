import { join } from "node:path";
import type { z } from "zod";
import {
  MetricsKeys,
  MetricsSchema,
  VentureSchema,
  VentureUpdateSchema,
} from "./schemas";
import type { Metrics, SessionClose, Venture } from "../types";
import { appendMarkdown, readJSON, readMarkdown, writeJSON, writeMarkdown } from "../utils/files";

const businessesRoot = join(import.meta.dir, "..", "businesses");
const phaseOrder = ["intake", "idea", "model", "gtm", "build", "revenue", "review"] as const;
const numericMetricKeys = MetricsKeys.filter((key) => key !== "last_updated") as Array<Exclude<(typeof MetricsKeys)[number], "last_updated">>;
let activeLockSlug: string | null = null;

export function businessPath(slug: string, file = ""): string {
  return join(businessesRoot, slug, file);
}

export function rootBusinessPath(file = ""): string {
  return join(businessesRoot, file);
}

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.map(String).join(".") || "root"}: ${issue.message}`).join("\n");
}

export function emptyVenture(name: string): Venture {
  const now = new Date().toISOString();
  const slug = slugify(name);
  return {
    name,
    slug,
    phase: "intake",
    created_at: now,
    last_session: now,
    days_since_start: 0,
    intake: {
      idea: "",
      skills: [],
      budget: 0,
      location: "",
      hours_per_week: 0,
      income_goal: 0,
      timeline_days: 0,
    },
    validated: false,
    demand_signal: "",
    revenue_model: "",
    unit_economics: {
      price_per_customer: 0,
      cost_per_customer: 0,
      margin: 0,
      breakeven_customers: 0,
    },
    customer_archetype: "",
    channel: "",
    first_10_targets: [],
    offer: {
      defined: false,
      name: "",
      price: 0,
      promise: "",
      package: "",
    },
    prospect_list: {
      count: 0,
      source: "",
    },
    open_questions: [],
    locked_decisions: [],
    gate_status: {
      intake: false,
      idea: false,
      model: false,
      gtm: false,
      build: false,
      revenue: false,
      review: false,
    },
    next_actions: [],
  };
}

export async function loadVenture(slug: string): Promise<Venture> {
  await acquireLock(slug);
  const raw = await readJSON<Venture>(businessPath(slug, "venture.json"));
  const result = VentureSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid venture.json\n${formatZodError(result.error)}`);
  }
  return recalculateDays(result.data);
}

export async function saveVenture(venture: Venture): Promise<void> {
  const withDays = recalculateDays(venture);
  const result = VentureSchema.safeParse(withDays);
  if (!result.success) {
    throw new Error(`Invalid venture update\n${formatZodError(result.error)}`);
  }
  const blocked = await missingGateFieldsForTarget(result.data, result.data.phase);
  if (blocked.length > 0) {
    throw new Error(`Cannot advance to ${result.data.phase}. Missing ${blocked.join(", ")}`);
  }
  result.data.gate_status = computeGateStatus(result.data);
  await writeJSON(businessPath(result.data.slug, "venture.json"), result.data);
}

export async function loadMetrics(slug: string): Promise<Metrics> {
  const text = await readMarkdown(businessPath(slug, "metrics.md"));
  const values: Record<string, number | string> = {};
  for (const key of numericMetricKeys) values[key] = 0;
  values.last_updated = new Date().toISOString();
  for (const line of text.split("\n")) {
    const [rawKey, ...rawValueParts] = line.split(":");
    if (!rawKey || rawValueParts.length === 0) continue;
    const key = rawKey.trim() as (typeof MetricsKeys)[number];
    if (!MetricsKeys.includes(key)) continue;
    const value = rawValueParts.join(":").trim();
    if (key === "last_updated") {
      values.last_updated = value || new Date().toISOString();
    } else {
      values[key] = Number(value) || 0;
    }
  }
  const result = MetricsSchema.safeParse(values);
  if (!result.success) {
    throw new Error(`Invalid metrics.md\n${formatZodError(result.error)}`);
  }
  return result.data;
}

export async function saveMetrics(slug: string, metrics: Metrics): Promise<void> {
  const next: Metrics = { ...metrics, last_updated: new Date().toISOString() };
  const result = MetricsSchema.safeParse(next);
  if (!result.success) {
    throw new Error(`Invalid metrics update\n${formatZodError(result.error)}`);
  }
  const lines = MetricsKeys.map((key) => `${key}: ${result.data[key]}`);
  await writeMarkdown(businessPath(slug, "metrics.md"), `${lines.join("\n")}\n`);
}

export async function appendDecision(slug: string, decision: string): Promise<void> {
  await appendMarkdown(businessPath(slug, "decisions.md"), `[${new Date().toISOString()}] DECISION: ${decision}\n`);
}

export async function appendSessionClose(slug: string, close: SessionClose): Promise<void> {
  await appendMarkdown(
    businessPath(slug, "decisions.md"),
    `\n[${close.timestamp}] SESSION CLOSE\nChanged: ${close.changed}\nBuilt: ${close.built}\nRevenue next: ${close.revenue_next}\n`,
  );
}

export async function writeTasks(slug: string, tasks: string[]): Promise<void> {
  const body = tasks.map((task) => `- [ ] ${task}`).join("\n");
  await writeMarkdown(businessPath(slug, "tasks.md"), body ? `${body}\n` : "");
}

export async function listBusinesses(): Promise<string[]> {
  await Bun.$`mkdir -p ${businessesRoot}`.quiet();
  const entries = await Array.fromAsync(new Bun.Glob("*").scan({ cwd: businessesRoot, onlyFiles: false }));
  const slugs: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    if (await Bun.file(join(businessesRoot, entry, "venture.json")).exists()) slugs.push(entry);
  }
  return slugs.sort();
}

export async function createBusiness(name: string): Promise<Venture> {
  const venture = emptyVenture(name);
  await Bun.$`mkdir -p ${businessPath(venture.slug, "artifacts")}`.quiet();
  await writeMarkdown(businessPath(venture.slug, "decisions.md"), "");
  await writeMarkdown(businessPath(venture.slug, "tasks.md"), "");
  await saveMetrics(venture.slug, {
    prospects_identified: 0,
    outreach_sent: 0,
    replies_received: 0,
    calls_booked: 0,
    offers_made: 0,
    sales_closed: 0,
    revenue_collected: 0,
    last_updated: new Date().toISOString(),
  });
  await saveVenture(venture);
  await acquireLock(venture.slug);
  return venture;
}

export async function processResponse(response: string, venture: Venture): Promise<{ display: string; venture: Venture }> {
  const match = [...response.matchAll(/```wzd-state\s*([\s\S]*?)```/g)].at(-1);
  if (!match) return { display: response, venture };
  const display = response.slice(0, match.index).trimEnd();
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1] ?? "{}");
  } catch (error) {
    throw new Error(`Malformed wzd-state JSON: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  const result = VentureUpdateSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid wzd-state\n${formatZodError(result.error)}`);
  }
  const merged = deepMerge(venture, result.data) as Venture;
  await saveVenture(merged);
  return { display, venture: merged };
}

export function missingGateFields(venture: Venture, targetPhase = nextPhase(venture.phase)): string[] {
  const targetIndex = phaseOrder.indexOf(targetPhase);
  const missing: string[] = [];
  for (let index = 0; index < targetIndex; index += 1) {
    missing.push(...missingForPhase(venture, phaseOrder[index]));
  }
  return [...new Set(missing)];
}

export async function missingGateFieldsForTarget(venture: Venture, targetPhase = nextPhase(venture.phase)): Promise<string[]> {
  const missing = missingGateFields(venture, targetPhase);
  if (phaseOrder.indexOf(targetPhase) > phaseOrder.indexOf("revenue")) {
    const metrics = await loadMetrics(venture.slug);
    if (metrics.outreach_sent <= 0) missing.push("metrics.outreach_sent");
  }
  return [...new Set(missing)];
}

export function computeGateStatus(venture: Venture): Venture["gate_status"] {
  return {
    intake: missingForPhase(venture, "intake").length === 0,
    idea: missingForPhase(venture, "idea").length === 0,
    model: missingForPhase(venture, "model").length === 0,
    gtm: missingForPhase(venture, "gtm").length === 0,
    build: missingForPhase(venture, "build").length === 0,
    revenue: missingForPhase(venture, "revenue").length === 0,
    review: missingForPhase(venture, "review").length === 0,
  };
}

export function missingForPhase(venture: Venture, phase: Venture["phase"]): string[] {
  if (phase === "intake") {
    return [
      !venture.intake.idea.trim() ? "intake.idea" : "",
      venture.intake.skills.length === 0 ? "intake.skills" : "",
      venture.intake.location.trim() ? "" : "intake.location",
      venture.intake.hours_per_week > 0 ? "" : "intake.hours_per_week",
      venture.intake.income_goal > 0 ? "" : "intake.income_goal",
      venture.intake.timeline_days > 0 ? "" : "intake.timeline_days",
    ].filter(Boolean);
  }
  if (phase === "idea") return [venture.validated ? "" : "validated", venture.demand_signal.trim() ? "" : "demand_signal"].filter(Boolean);
  if (phase === "model") {
    return [
      venture.revenue_model.trim() ? "" : "revenue_model",
      venture.unit_economics.margin > 0 ? "" : "unit_economics.margin",
      venture.unit_economics.price_per_customer > 0 ? "" : "unit_economics.price_per_customer",
    ].filter(Boolean);
  }
  if (phase === "gtm") {
    return [
      venture.customer_archetype.trim() ? "" : "customer_archetype",
      venture.channel.trim() ? "" : "channel",
      venture.first_10_targets.length >= 3 ? "" : "first_10_targets",
    ].filter(Boolean);
  }
  if (phase === "build") {
    return [
      venture.offer.defined ? "" : "offer.defined",
      venture.offer.price > 0 ? "" : "offer.price",
      venture.prospect_list.count > 0 ? "" : "prospect_list.count",
    ].filter(Boolean);
  }
  if (phase === "revenue") return [];
  return [];
}

export async function clearLock(slug: string): Promise<void> {
  try {
    await Bun.$`rm -f ${businessPath(slug, ".lock")}`.quiet();
  } catch {
  }
  if (activeLockSlug === slug) activeLockSlug = null;
}

export async function clearActiveLock(): Promise<void> {
  if (activeLockSlug) await clearLock(activeLockSlug);
}

function nextPhase(phase: Venture["phase"]): Venture["phase"] {
  const index = phaseOrder.indexOf(phase);
  return phaseOrder[Math.min(index + 1, phaseOrder.length - 1)];
}

async function acquireLock(slug: string): Promise<void> {
  await Bun.$`mkdir -p ${businessPath(slug)}`.quiet();
  const path = businessPath(slug, ".lock");
  const existing = await readJSON<{ pid: number; created_at: string }>(path);
  const age = Date.now() - Date.parse(String(existing.created_at ?? 0));
  if (existing.pid && existing.pid !== process.pid && age < 12 * 60 * 60 * 1000) {
    throw new Error(`Another WZD session is open for ${slug}. Clear ${path} if that session is gone.`);
  }
  await writeJSON(path, { pid: process.pid, created_at: new Date().toISOString() });
  activeLockSlug = slug;
}

function recalculateDays(venture: Venture): Venture {
  const created = Date.parse(venture.created_at);
  const days = Number.isNaN(created) ? 0 : Math.max(0, Math.floor((Date.now() - created) / 86400000));
  return { ...venture, days_since_start: days };
}

function deepMerge(base: unknown, update: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(update)) return update;
  const output: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(update)) {
    output[key] = isPlainObject(value) && isPlainObject(output[key]) ? deepMerge(output[key], value) : value;
  }
  return output;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function slugify(name: string): string {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "untitled";
}
