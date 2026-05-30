#!/usr/bin/env bun
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { AgentName, Message, Venture } from "./types";
import { run as runIntake } from "./agents/intake";
import { run as runIdea } from "./agents/idea";
import { run as runModel } from "./agents/model";
import { run as runGtm } from "./agents/gtm";
import { run as runBuild } from "./agents/build";
import { run as runRevenue } from "./agents/revenue";
import { run as runReview } from "./agents/review";
import { orchestrate } from "./orchestrator";
import {
  clearActiveLock,
  createBusiness,
  listBusinesses,
  loadMetrics,
  loadVenture,
  saveMetrics,
  saveVenture,
  writeTasks,
} from "./state/stateManager";
import { loadAuthSession, signIn, signOut } from "./utils/auth";
import { gateWarning, header, metricsBlock, phaseLabel, promptLabel } from "./utils/format";
import { readMarkdown } from "./utils/files";
import { runSessionClose } from "./utils/sessionClose";

const scriptedAnswers = process.stdin.isTTY ? [] : (await Bun.stdin.text()).split(/\r?\n/);
const rl = createInterface({ input, output });
const agents: Record<AgentName, (venture: Venture, userMessage: string, history: Message[]) => Promise<void>> = {
  intake: runIntake,
  idea: runIdea,
  model: runModel,
  gtm: runGtm,
  build: runBuild,
  revenue: runRevenue,
  review: runReview,
};

let active: Venture | null = null;
let history: Message[] = [];
let revenueStartLogged = false;
let closing = false;

process.on("SIGINT", () => {
  void (async () => {
    if (closing) return;
    closing = true;
    if (active) await runSessionClose(active, ask);
    await clearActiveLock();
    process.exit(0);
  })();
});

await main();

async function main(): Promise<void> {
  const auth = await loadAuthSession();
  output.write(`${header(undefined, auth.signed_in ? `Signed in ${auth.email}` : "Signed out")}\n`);
  active = await chooseInitialBusiness();
  await printStatus(active);
  await loop();
}

async function chooseInitialBusiness(): Promise<Venture> {
  const businesses = await listBusinesses();
  if (businesses.length === 0) {
    output.write("No businesses yet.\n");
    const name = await requireAnswer("Business name: ");
    const venture = await createBusiness(name);
    output.write(`Created ${venture.slug}. Tell WZD the idea to begin intake.\n`);
    return venture;
  }
  if (businesses.length === 1) return await loadVenture(businesses[0]);
  return await selectBusiness(businesses);
}

async function loop(): Promise<void> {
  while (active) {
    const line = (await ask(promptLabel())).trim();
    if (!line) continue;
    try {
      if (line.startsWith("/")) {
        await routeCommand(line);
      } else {
        await runActiveAgent(line);
      }
    } catch (error) {
      output.write(`${gateWarning(error instanceof Error ? error.message : String(error))}\n`);
    }
  }
}

async function routeCommand(line: string): Promise<void> {
  if (!active) return;
  const [command, ...restParts] = line.split(" ");
  const rest = restParts.join(" ").trim();
  if (command === "/help") return printHelp();
  if (command === "/close") return await runSessionClose(active, ask);
  if (command === "/signin") return await handleSignIn();
  if (command === "/signout") return await handleSignOut();
  if (command === "/whoami") return await handleWhoami();
  if (command === "/decisions") return await printFile("decisions.md");
  if (command === "/tasks") return await printFile("tasks.md");
  if (command === "/metrics") return await printMetrics();
  if (command === "/switch") {
    active = await selectBusiness(await listBusinesses());
    history = [];
    revenueStartLogged = false;
    return await printStatus(active);
  }
  if (command === "/new") {
    const name = rest || (await requireAnswer("Business name: "));
    active = await createBusiness(name);
    history = [];
    revenueStartLogged = false;
    output.write(`Created ${active.slug}\n`);
    return;
  }
  if (command === "/start") {
    active.phase = "intake";
    await saveVenture(active);
    return await runNamedAgent("intake", rest || "Start intake.");
  }
  if (command === "/validate") return await runNamedAgent("idea", rest || "Validate the idea.");
  if (command === "/offer") return await runNamedAgent("model", rest || "Build the offer model.");
  if (command === "/plan") return await runNamedAgent("build", rest || "Write the next task plan.");
  if (command === "/finance") return await runNamedAgent("model", rest || "Work the unit economics.");
  if (command === "/assets") return await runNamedAgent("build", rest || "Plan the revenue assets to build.");
  if (command === "/review") return await runNamedAgent("review", rest || "Review the venture and decide what changes.");
  if (command === "/revenue") {
    active.phase = "revenue";
    await saveVenture(active);
    return await runNamedAgent("revenue", rest || "Move revenue forward.");
  }
  if (command === "/leads") return await runNamedAgent("revenue", rest || "Build the prospect list.");
  if (command === "/outreach") return await runNamedAgent("revenue", rest || "Draft direct outreach.");
  output.write(gateWarning(`Unknown command ${command}. Try /help.\n`));
}

async function runActiveAgent(userMessage: string): Promise<void> {
  if (!active) return;
  const result = await orchestrate(active);
  if (result.blockedGates.length > 0) {
    output.write(`${gateWarning(`Blocked gates: ${result.blockedGates.join(", ")}`)}\n`);
  }
  await runNamedAgent(result.nextAgent, userMessage);
}

async function runNamedAgent(agent: AgentName, userMessage: string): Promise<void> {
  if (!active) return;
  if (agent === "revenue") await handleRevenueStart();
  const message = agent === "revenue" ? await withRevenueAlert(userMessage) : userMessage;
  history.push({ role: "user", content: message });
  history = history.slice(-12);
  await agents[agent](active, message, history);
  output.write("\n");
  active = await loadVenture(active.slug);
  await writeTasks(active.slug, active.next_actions);
  if (agent === "revenue") await printMetrics();
}

async function withRevenueAlert(userMessage: string): Promise<string> {
  if (!active || active.days_since_start <= 14) return userMessage;
  const metrics = await loadMetrics(active.slug);
  if (metrics.revenue_collected > 0) return userMessage;
  return `ALERT: 14 days with no revenue. Diagnose offer or channel before anything else.\n\n${userMessage}`;
}

async function handleRevenueStart(): Promise<void> {
  if (!active || revenueStartLogged) return;
  revenueStartLogged = true;
  output.write("Before we start: did anyone pay you since last session? Any replies, calls, or sales to log?\n");
  const answer = (await ask(promptLabel())).trim();
  if (!answer || /^no\b/i.test(answer)) return;
  const metrics = await loadMetrics(active.slug);
  await saveMetrics(active.slug, applyMetricLog(metrics, answer));
}

function applyMetricLog(metrics: Awaited<ReturnType<typeof loadMetrics>>, answer: string): Awaited<ReturnType<typeof loadMetrics>> {
  const next = { ...metrics };
  next.prospects_identified += findNumber(answer, /prospects?\s+(\d+)/i);
  next.outreach_sent += findNumber(answer, /outreach\s+(\d+)/i);
  next.replies_received += findNumber(answer, /repl(?:y|ies)\s+(\d+)/i);
  next.calls_booked += findNumber(answer, /calls?\s+(\d+)/i);
  next.offers_made += findNumber(answer, /offers?\s+(\d+)/i);
  next.sales_closed += findNumber(answer, /sales?\s+(\d+)/i);
  next.revenue_collected += findNumber(answer, /(?:revenue|paid|collected)\s+\$?(\d+(?:\.\d+)?)/i);
  return next;
}

function findNumber(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  return match?.[1] ? Number(match[1]) || 0 : 0;
}

async function selectBusiness(slugs: string[]): Promise<Venture> {
  if (slugs.length === 0) return await chooseInitialBusiness();
  slugs.forEach((slug, index) => output.write(`${index + 1}. ${slug}\n`));
  while (true) {
    const raw = await requireAnswer("Select business: ");
    const index = Number(raw) - 1;
    if (slugs[index]) return await loadVenture(slugs[index]);
  }
}

async function printStatus(venture: Venture): Promise<void> {
  const result = await orchestrate(venture);
  output.write(`${header(venture)}\n`);
  output.write(`Phase ${phaseLabel(result.currentPhase)}\n`);
  if (result.blockedGates.length > 0) output.write(`${gateWarning(`Blocked gates: ${result.blockedGates.join(", ")}`)}\n`);
  venture.next_actions.slice(0, 3).forEach((action) => output.write(`Next: ${action}\n`));
}

async function printFile(file: "decisions.md" | "tasks.md"): Promise<void> {
  if (!active) return;
  output.write((await readMarkdown(`businesses/${active.slug}/${file}`)) || "\n");
}

async function printMetrics(): Promise<void> {
  if (!active) return;
  output.write(`${metricsBlock(await loadMetrics(active.slug))}\n`);
}

async function handleSignIn(): Promise<void> {
  const email = await requireAnswer("Email: ");
  const name = await requireAnswer("Name: ");
  const session = await signIn(email, name);
  output.write(`Signed in as ${session.email}\n`);
}

async function handleSignOut(): Promise<void> {
  await signOut();
  output.write("Signed out\n");
}

async function handleWhoami(): Promise<void> {
  const session = await loadAuthSession();
  output.write(session.signed_in ? `Signed in as ${session.name} <${session.email}>\n` : "Signed out\n");
}

function printHelp(): void {
  output.write(
    [
      "/start",
      "/validate",
      "/offer",
      "/plan",
      "/revenue",
      "/leads",
      "/outreach",
      "/finance",
      "/assets",
      "/review",
      "/decisions",
      "/tasks",
      "/metrics",
      "/switch",
      "/new",
      "/signin",
      "/signout",
      "/whoami",
      "/close",
      "/help",
    ].join("\n") + "\n",
  );
}

async function requireAnswer(prompt: string): Promise<string> {
  while (true) {
    const answer = (await ask(prompt)).trim();
    if (answer) return answer;
  }
}

async function ask(prompt: string): Promise<string> {
  if (scriptedAnswers.length > 0) {
    output.write(prompt);
    return scriptedAnswers.shift() ?? "";
  }
  return await rl.question(prompt);
}
