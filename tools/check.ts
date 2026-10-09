import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import {
  PLUGIN_DIR,
  ROOT,
  T3_DIR,
  UPSTREAM_DIR,
  expectedTree,
  frontmatterProblems,
  isExecutable,
  loadDrift,
  loadPins,
  mappedFiles,
  readTree,
  t3ToolNames,
  type Drift,
  type Tree,
} from "./lib.ts";

// Backticked snake_case words in our own prose that are not T3 tools: Cursor Task
// parameters the adapter maps, and Codex's own tool names.
const NOT_T3_TOOLS = new Set(["run_in_background", "cloud_base_branch", "request_user_input", "apply_patch", "update_plan"]);

export function driftProblems(expected: Tree, actual: Tree, drift: Drift): string[] {
  const problems: string[] = [];
  for (const [path, want] of expected) {
    const got = actual.get(path);
    if (!got) problems.push(`${path}: upstream file is missing. Restore it or add its upstream path to pins.json upstream.exclude.`);
    else if (!got.equals(want) && !drift[path]) problems.push(`${path}: differs from upstream with no reason in drift.json.`);
    else if (got.equals(want) && drift[path]) problems.push(`${path}: matches upstream. Remove its drift.json entry.`);
  }
  for (const path of actual.keys())
    if (!expected.has(path) && !drift[path]) problems.push(`${path}: exists only here with no reason in drift.json.`);
  for (const path of Object.keys(drift))
    if (!actual.has(path)) problems.push(`drift.json: ${path} is not in the plugin.`);
  return problems;
}

export function linkProblems(tree: Tree): string[] {
  const problems: string[] = [];
  for (const [path, content] of tree) {
    if (!path.endsWith(".md")) continue;
    const text = content.toString("utf8").replace(/```[\s\S]*?```/g, "");
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1]!.split("#")[0]!;
      // Skip URLs and bare placeholders such as `[text](url)` in prompt templates.
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || !/[./]/.test(target)) continue;
      const resolved = normalize(join(dirname(path), decodeURI(target))).replace(/\/$/, "");
      const isDir = [...tree.keys()].some((p) => p.startsWith(`${resolved}/`));
      if (!tree.has(resolved) && !isDir) problems.push(`${path}: broken link ${m[1]}`);
    }
  }
  return problems;
}

/** Checks only the lines this port wrote, since upstream text names Cursor identifiers. */
export function toolReferenceProblems(expected: Tree, tree: Tree, drift: Drift, tools: Set<string>): string[] {
  const problems: string[] = [];
  for (const path of Object.keys(drift)) {
    if (!path.endsWith(".md")) continue;
    const upstreamLines = new Set(expected.get(path)?.toString("utf8").split("\n"));
    const text = (tree.get(path)?.toString("utf8") ?? "").split("\n").filter((l) => !upstreamLines.has(l)).join("\n");
    for (const m of text.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g))
      if (!tools.has(m[1]!) && !NOT_T3_TOOLS.has(m[1]!))
        problems.push(`${path}: \`${m[1]}\` is not a tool in the pinned T3 contract.`);
  }
  return problems;
}

function modeProblems(pins: ReturnType<typeof loadPins>): string[] {
  return mappedFiles(pins, UPSTREAM_DIR).flatMap(({ dst, abs }) => {
    const plugin = join(PLUGIN_DIR, dst);
    return existsSync(plugin) && isExecutable(plugin) !== isExecutable(abs)
      ? [`${dst}: executable bit differs from upstream.`]
      : [];
  });
}

function manifestProblems(): string[] {
  const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
  const versions = {
    "package.json": read("package.json").version,
    "plugins/pstack/.claude-plugin/plugin.json": read("plugins/pstack/.claude-plugin/plugin.json").version,
    "plugins/pstack/.codex-plugin/plugin.json": read("plugins/pstack/.codex-plugin/plugin.json").version,
    ".claude-plugin/marketplace.json": read(".claude-plugin/marketplace.json").plugins[0].version,
  };
  const distinct = new Set(Object.values(versions));
  return distinct.size === 1 ? [] : [`manifest versions differ: ${JSON.stringify(versions)}`];
}

if (import.meta.main) {
  const pins = loadPins();
  const drift = loadDrift();
  const actual = readTree(PLUGIN_DIR);
  const expected = expectedTree(pins, UPSTREAM_DIR);
  const problems = [
    ...driftProblems(expected, actual, drift),
    ...[...actual].flatMap(([path, content]) => frontmatterProblems(path, content)),
    ...linkProblems(actual),
    ...toolReferenceProblems(expected, actual, drift, t3ToolNames(readTree(join(T3_DIR, "contract")))),
    ...modeProblems(pins),
    ...manifestProblems(),
  ];
  for (const p of problems) console.error(p);
  console.log(
    `${actual.size} plugin files, ${Object.keys(drift).length} drift entries, upstream ${pins.upstream.version} @ ${pins.upstream.commit.slice(0, 7)}, T3 @ ${pins.t3.commit.slice(0, 7)}`,
  );
  if (problems.length) {
    console.error(`${problems.length} problem(s).`);
    process.exit(1);
  }
}
