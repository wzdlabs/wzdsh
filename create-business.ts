#!/usr/bin/env bun
// Non-interactive business creator — called by wzd-desktop
// Usage: bun create-business.ts <name>
import { createBusiness, clearActiveLock } from "./state/stateManager";

const name = process.argv.slice(2).join(" ").trim();
if (!name) {
  process.stderr.write("Usage: bun create-business.ts <name>\n");
  process.exit(1);
}

const venture = await createBusiness(name);
await clearActiveLock();
process.stdout.write(venture.slug + "\n");
