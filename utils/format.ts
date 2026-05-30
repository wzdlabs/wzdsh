import chalk from "chalk";
import type { Metrics, Phase, Venture } from "../types";

export function header(active?: Venture, authLabel?: string): string {
  const date = new Date().toLocaleDateString();
  const business = active ? ` ${active.name}` : "No active business";
  const auth = authLabel ? ` ${authLabel}` : "";
  return chalk.white.bold(`WZD ${date} ${business}${auth}`);
}

export function phaseLabel(phase: Phase): string {
  return chalk.cyan(phase.toUpperCase());
}

export function gateWarning(message: string): string {
  return chalk.yellow(message);
}

export function alert(message: string): string {
  return chalk.red.bold(message);
}

export function promptLabel(): string {
  return chalk.white("> ");
}

export function sessionCloseHeader(): string {
  return chalk.white.bold("SESSION CLOSE");
}

export function tokenLine(prompt: number, completion: number, sessionTotal: number, contextWindow = 128_000): string {
  const BAR_WIDTH = 10;
  const pct = Math.min((prompt / contextWindow) * 100, 100);
  const filled = Math.min(Math.round((pct / 100) * BAR_WIDTH), BAR_WIDTH);
  const bar = `[${"█".repeat(filled)}${"░".repeat(BAR_WIDTH - filled)}]`;
  const callTotal = prompt + completion;
  const usedLabel = `${pct.toFixed(1)}% ctx`;
  const leftLabel = `${(100 - pct).toFixed(1)}% left`;
  return chalk.dim(
    `↑${prompt.toLocaleString()} ↓${completion.toLocaleString()} = ${callTotal.toLocaleString()}  session ${sessionTotal.toLocaleString()} ${bar} ${usedLabel} · ${leftLabel}`,
  );
}

export function metricsBlock(metrics: Metrics): string {
  return chalk.white(
    [
      "METRICS",
      `Prospects:    ${metrics.prospects_identified}`,
      `Outreach:     ${metrics.outreach_sent}`,
      `Replies:      ${metrics.replies_received}`,
      `Calls:        ${metrics.calls_booked}`,
      `Offers:       ${metrics.offers_made}`,
      `Sales:        ${metrics.sales_closed}`,
      `Revenue:      $${metrics.revenue_collected}`,
      `Updated:      ${metrics.last_updated}`,
    ].join("\n"),
  );
}
