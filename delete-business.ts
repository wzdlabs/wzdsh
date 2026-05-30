#!/usr/bin/env bun
// Non-interactive business deletion — called by wzd-desktop
// Usage: bun delete-business.ts <slug>
import { join } from "node:path";

const slug = process.argv[2]?.trim();
if (!slug) {
  process.stderr.write("Usage: bun delete-business.ts <slug>\n");
  process.exit(1);
}

const businessesRoot = join(import.meta.dir, "businesses");
const path = join(businessesRoot, slug);

const exists = await Bun.file(join(path, "venture.json")).exists();
if (!exists) {
  process.stderr.write(`Business "${slug}" not found.\n`);
  process.exit(1);
}

await Bun.$`rm -rf ${path}`.quiet();
process.stdout.write(`deleted:${slug}\n`);
