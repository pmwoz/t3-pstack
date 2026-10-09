import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dir, "..");
export const PLUGIN_DIR = join(ROOT, "plugins/pstack");
export const UPSTREAM_DIR = join(ROOT, "upstream");
export const T3_DIR = join(ROOT, "t3");

export type Pins = {
  upstream: {
    repo: string;
    commit: string;
    version: string;
    /** Upstream path (file or directory) to its path inside the plugin. */
    map: Record<string, string>;
    /** Upstream paths left out of the plugin, matched as path prefixes. */
    exclude: string[];
    /** Upstream files kept in the snapshot for reference but not shipped. */
    meta: string[];
  };
  t3: {
    repo: string;
    commit: string;
    /** Files that make up the T3 contract, snapshotted under t3/. */
    paths: string[];
  };
};

/** Plugin path to the reason it differs from upstream or exists only here. */
export type Drift = Record<string, string>;

/** Relative POSIX path to file bytes. */
export type Tree = Map<string, Buffer>;

export const loadPins = (): Pins => JSON.parse(readFileSync(join(ROOT, "pins.json"), "utf8"));
export const savePins = (pins: Pins) => writeFileSync(join(ROOT, "pins.json"), `${JSON.stringify(pins, null, 2)}\n`);
export const loadDrift = (): Drift => JSON.parse(readFileSync(join(ROOT, "drift.json"), "utf8"));

export function readTree(dir: string, prefix = ""): Tree {
  const tree: Tree = new Map();
  if (!existsSync(dir)) return tree;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) for (const [p, c] of readTree(abs, rel)) tree.set(p, c);
    else tree.set(rel, readFileSync(abs));
  }
  return tree;
}

// Cursor treats every pstack skill as typed-only. Claude refuses Skill tool calls to a skill with
// this flag, which breaks poteto-mode routing, so the flag stays only where upstream means "the user
// types it" for a reason that also holds here.
const USER_ONLY = new Set(["poteto-help"]);

/** The mechanical rewrite applied to every upstream file before drift. */
export function transform(path: string, content: Buffer): Buffer {
  const skill = /^skills\/([^/]+)\/SKILL\.md$/.exec(path)?.[1];
  if (!skill) return content;
  const text = content.toString("utf8");
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) return content;
  const lines = fm[1]!.split("\n").flatMap((line) => {
    // Codex names a skill by this field, Claude by its directory. Upstream poteto-mode says "Poteto Mode".
    if (line.startsWith("name:")) return [`name: ${skill}`];
    if (line.startsWith("disable-model-invocation:") && !USER_ONLY.has(skill)) return [];
    return [line];
  });
  return Buffer.from(`---\n${lines.join("\n")}\n---\n${text.slice(fm[0].length)}`);
}

export function frontmatterProblems(path: string, content: Buffer): string[] {
  const skill = /^skills\/([^/]+)\/SKILL\.md$/.exec(path)?.[1];
  if (!skill) return [];
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(content.toString("utf8"))?.[1];
  if (fm === undefined) return [`${path}: no frontmatter.`];
  const problems: string[] = [];
  const name = /^name:\s*(.+)$/m.exec(fm)?.[1]?.trim();
  if (name !== skill) problems.push(`${path}: name is "${name}", expected "${skill}" (Codex names skills by this field).`);
  if (/^disable-model-invocation:\s*true/m.test(fm) && !USER_ONLY.has(skill))
    problems.push(`${path}: disable-model-invocation blocks Claude from loading this skill through the Skill tool.`);
  if (!/^description:/m.test(fm)) problems.push(`${path}: no description.`);
  return problems;
}

const isExcluded = (pins: Pins, src: string) =>
  pins.upstream.exclude.some((e) => src === e || src.startsWith(`${e}/`));

/** Every upstream file the plugin ships, with its plugin path. */
export function mappedFiles(pins: Pins, upstreamRoot: string): Array<{ dst: string; abs: string }> {
  const files: Array<{ dst: string; abs: string }> = [];
  for (const [from, to] of Object.entries(pins.upstream.map)) {
    const abs = join(upstreamRoot, from);
    if (!existsSync(abs)) continue;
    const rels = statSync(abs).isDirectory() ? [...readTree(abs).keys()].map((r) => `/${r}`) : [""];
    for (const rel of rels) if (!isExcluded(pins, from + rel)) files.push({ dst: to + rel, abs: abs + rel });
  }
  return files;
}

/** What the plugin tree would be with zero drift, built from an upstream snapshot. */
export const expectedTree = (pins: Pins, upstreamRoot: string): Tree =>
  new Map(mappedFiles(pins, upstreamRoot).map(({ dst, abs }) => [dst, transform(dst, readFileSync(abs))]));

export const isExecutable = (abs: string) => (statSync(abs).mode & 0o111) !== 0;

/** Every upstream path the snapshot holds. */
export const snapshotSources = (pins: Pins) => [...Object.keys(pins.upstream.map), ...pins.upstream.meta];

export function run(cmd: string[], opts: { cwd?: string; input?: Buffer; allowFail?: boolean } = {}) {
  const proc = Bun.spawnSync(cmd, { cwd: opts.cwd, stdin: opts.input ?? "ignore", stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0 && !opts.allowFail)
    throw new Error(`${cmd.join(" ")} failed (${proc.exitCode}): ${proc.stderr.toString().trim()}`);
  return { code: proc.exitCode, stdout: proc.stdout, stderr: proc.stderr.toString() };
}

/** Tool names defined in the snapshotted T3 toolkits, constants resolved across the snapshot. */
export function t3ToolNames(contract: Tree): Set<string> {
  const constants = new Map<string, string>();
  for (const content of contract.values())
    for (const m of content.toString("utf8").matchAll(/export const ([A-Z0-9_]+) = "([a-z0-9_]+)"/g))
      constants.set(m[1]!, m[2]!);
  const names = new Set<string>();
  for (const [path, content] of contract) {
    if (!/\/toolkits\/[^/]+\/tools\.ts$/.test(path)) continue;
    for (const m of content.toString("utf8").matchAll(/Tool\.make\(\s*(?:"([a-z0-9_]+)"|([A-Z0-9_]+))/g)) {
      const name = m[1] ?? constants.get(m[2]!);
      if (!name) throw new Error(`${path}: cannot resolve tool name constant ${m[2]}`);
      names.add(name);
    }
  }
  return names;
}
