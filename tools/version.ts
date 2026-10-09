import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib.ts";

type Json = Record<string, any>;

// Claude Code and Codex cache an installed plugin by version, so every release bumps all four.
const MANIFESTS: Array<[string, (json: Json, version: string) => void]> = [
  ["package.json", (j, v) => (j.version = v)],
  ["plugins/pstack/.claude-plugin/plugin.json", (j, v) => (j.version = v)],
  ["plugins/pstack/.codex-plugin/plugin.json", (j, v) => (j.version = v)],
  [".claude-plugin/marketplace.json", (j, v) => (j.plugins[0].version = v)],
];

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("usage: bun run version <major.minor.patch>");
  process.exit(1);
}
for (const [path, set] of MANIFESTS) {
  const abs = join(ROOT, path);
  const json = JSON.parse(readFileSync(abs, "utf8"));
  set(json, version);
  writeFileSync(abs, `${JSON.stringify(json, null, 2)}\n`);
}
console.log(`version ${version}`);
