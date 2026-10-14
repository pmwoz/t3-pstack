import { afterAll, describe, expect, test } from "bun:test";
import { appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conflictProblems, driftProblems } from "./check.ts";
import { ROOT, loadPins, run, t3ToolNames, transform, type Tree } from "./lib.ts";
import { decide, gitMerge3 } from "./sync.ts";

const b = (s: string) => Buffer.from(s);

const temps: string[] = [];
afterAll(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "t3p-test-"));
  temps.push(dir);
  return dir;
};

const git = (cwd: string, ...args: string[]) =>
  run(["git", "-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd }).stdout.toString().trimEnd();
const commitAll = (cwd: string, message: string) => {
  git(cwd, "add", "-A");
  git(cwd, "commit", "-qm", message);
};

function repoCopy(): string {
  const dir = tempDir();
  const skip = new Set([".git", "node_modules", ".cache"].map((name) => join(ROOT, name)));
  cpSync(ROOT, dir, { recursive: true, filter: (src) => !skip.has(src) });
  git(dir, "init", "-q");
  commitAll(dir, "before");
  return dir;
}

function runTool(cwd: string, script: string, env: Record<string, string> = {}) {
  const proc = Bun.spawnSync(["bun", `tools/${script}`], { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

describe("transform", () => {
  const upstream = "---\nname: Poteto Mode\ndescription: x\ndisable-model-invocation: true\nmode: true\n---\n\n# Body\nname: stays\n";

  test("names the skill after its directory and keeps everything else", () => {
    expect(transform("skills/poteto-mode/SKILL.md", b(upstream)).toString()).toBe(upstream.replace("Poteto Mode", "poteto-mode"));
  });

  test("leaves files other than SKILL.md alone", () => {
    expect(transform("skills/poteto-mode/playbooks/feature.md", b(upstream)).toString()).toBe(upstream);
  });
});

describe("decide", () => {
  const lines = (...xs: string[]) => b(`${xs.join("\n")}\n`);
  const base = lines("a", "b", "c", "d", "e", "f");

  test("takes an upstream change to a file we never touched", () => {
    const theirs = lines("a", "B", "c", "d", "e", "f");
    expect(decide(base, base, theirs, gitMerge3)).toEqual({ kind: "take-upstream", content: theirs });
  });

  test("keeps our change when upstream did not move", () => {
    expect(decide(base, lines("x"), base, gitMerge3)).toEqual({ kind: "unchanged" });
  });

  test("merges edits that do not overlap", () => {
    const outcome = decide(base, lines("A", "b", "c", "d", "e", "f"), lines("a", "b", "c", "d", "e", "F"), gitMerge3);
    expect(outcome).toEqual({ kind: "merged", content: lines("A", "b", "c", "d", "e", "F") });
  });

  test("reports overlapping edits as a conflict with markers", () => {
    const outcome = decide(base, lines("a", "ours", "c", "d", "e", "f"), lines("a", "theirs", "c", "d", "e", "f"), gitMerge3);
    expect(outcome.kind).toBe("conflict");
    expect(outcome.kind === "conflict" && outcome.content?.toString()).toContain("<<<<<<< t3-pstack");
  });

  test("adds a new upstream file and deletes one upstream dropped", () => {
    expect(decide(undefined, undefined, base, gitMerge3)).toEqual({ kind: "take-upstream", content: base });
    expect(decide(base, base, undefined, gitMerge3)).toEqual({ kind: "take-upstream", content: undefined });
  });

  test("refuses to drop a file we changed when upstream deletes it", () => {
    const ours = lines("ours");
    expect(decide(base, ours, undefined, gitMerge3)).toEqual({ kind: "conflict", content: ours, why: "upstream deleted a file we changed" });
  });
});

describe("driftProblems", () => {
  const expected: Tree = new Map([["skills/a/SKILL.md", b("up")], ["skills/b/SKILL.md", b("up")]]);

  test("accepts declared drift", () => {
    const actual: Tree = new Map([["skills/a/SKILL.md", b("ours")], ["skills/b/SKILL.md", b("up")], ["extra.md", b("x")]]);
    expect(driftProblems(expected, actual, { "skills/a/SKILL.md": "why", "extra.md": "why" })).toEqual([]);
  });

  test("flags undeclared edits, stale reasons, and missing upstream files", () => {
    const actual: Tree = new Map([["skills/a/SKILL.md", b("ours")], ["extra.md", b("x")]]);
    expect(driftProblems(expected, actual, { "skills/b/SKILL.md": "stale" })).toEqual([
      "skills/a/SKILL.md: differs from upstream with no reason in drift.json.",
      "skills/b/SKILL.md: upstream file is missing. Restore it or add its upstream path to pins.json upstream.exclude.",
      "extra.md: exists only here with no reason in drift.json.",
      "drift.json: skills/b/SKILL.md is not in the plugin.",
    ]);
  });
});

describe("conflictProblems", () => {
  test("flags the conflict git produces from CRLF text", () => {
    const conflict = gitMerge3(b("ours\r\n"), b("base\r\n"), b("theirs\r\n"));
    expect(conflict.clean).toBe(false);
    expect(conflictProblems(new Map(), new Map([["skills/a/SKILL.md", conflict.content]]))).toEqual([
      "skills/a/SKILL.md:1: unresolved merge conflict.",
    ]);
  });

  test("flags an unresolved block at the line it starts", () => {
    const tree: Tree = new Map([
      ["skills/a/SKILL.md", b("intro\n<<<<<<< t3-pstack\nours\n||||||| upstream-old\nbase\n=======\ntheirs\n>>>>>>> upstream-new\n")],
    ]);
    expect(conflictProblems(new Map(), tree)).toEqual(["skills/a/SKILL.md:2: unresolved merge conflict."]);
  });

  test("accepts separators, inline markers, and a conflict example upstream quotes", () => {
    const example = "```\n<<<<<<< HEAD\nmine\n=======\nyours\n>>>>>>> topic\n```\n";
    const expected: Tree = new Map([["skills/a/SKILL.md", b(example)]]);
    const ours = `Title\n=======\n\n<<<<<<<<<<\nWrite \`<<<<<<< ours\` and \`>>>>>>> theirs\` around a conflict.\n${example}Our line.\n`;
    expect(conflictProblems(expected, new Map([["skills/a/SKILL.md", b(ours)]]))).toEqual([]);
  });

  test("flags a block that only shares its start line with upstream's example, and a conflict around that example", () => {
    const example = "<<<<<<< HEAD\nmine\n=======\nyours\n>>>>>>> topic\n";
    const expected: Tree = new Map([["skills/a/SKILL.md", b(example)]]);
    const changed = "<<<<<<< HEAD\nactual ours\n=======\nactual theirs\n>>>>>>> topic\n";
    const around = `intro\n<<<<<<< t3-pstack\n${example}=======\ntheirs\n>>>>>>> upstream-new\n`;
    expect(conflictProblems(expected, new Map([["skills/a/SKILL.md", b(changed)]]))).toEqual(["skills/a/SKILL.md:1: unresolved merge conflict."]);
    expect(conflictProblems(expected, new Map([["skills/a/SKILL.md", b(around)]]))).toEqual(["skills/a/SKILL.md:2: unresolved merge conflict."]);
  });
});

test("check rejects a T3 contract that lacks a pinned file", () => {
  const dir = repoCopy();
  const path = "packages/provider-core/src/server/runtimeInstructions.ts";
  rmSync(join(dir, "t3/contract", path));
  const r = runTool(dir, "check.ts");
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`t3/contract/${path}: missing. Restore it with bun run t3:pin ${loadPins().t3.commit}.\n`);
});

const head = "b".repeat(40);
const device = "apps/server/src/mcp/toolkits/device/tools.ts";
const ghDir = tempDir();
writeFileSync(
  join(ghDir, "gh"),
  [
    "#!/usr/bin/env bun",
    'const { readdirSync, readFileSync } = require("node:fs");',
    'const api = process.argv.slice(2).find((a) => a.startsWith("repos/")) ?? "";',
    'const file = api.split("/contents/")[1]?.split("?ref=")[0];',
    `if (api.endsWith("/commits/main")) console.log('{"sha":"${head}"}');`,
    'else if (api.includes("/commits/")) console.log(\'{"commit":{"committer":{"date":"2026-10-14T00:00:00Z"}}}\');',
    'else if (api.includes("/commits?")) console.log("[]");',
    'else if (file === "apps/server/src/mcp/toolkits")',
    '  console.log(JSON.stringify(readdirSync(`${process.env.CONTRACT}/${file}`).map((name) => ({ name, type: "dir" }))));',
    'else if (file === process.env.FAIL_502) { console.error("gh: HTTP 502: Bad Gateway"); process.exit(1); }',
    'else if (file === process.env.ABSENT) { console.error("gh: Not Found (HTTP 404)"); process.exit(1); }',
    'else process.stdout.write(readFileSync(`${process.env.CONTRACT}/${file}`));',
  ].join("\n"),
);
chmodSync(join(ghDir, "gh"), 0o755);
const fakeGh = (dir: string, script: string, env: Record<string, string>) =>
  runTool(dir, script, { PATH: `${ghDir}:${process.env.PATH}`, CONTRACT: join(ROOT, "t3/contract"), ...env });

describe("t3:pin", () => {
  const pin = (dir: string, env: Record<string, string>) => fakeGh(dir, "t3.ts", env);

  test("keeps the contract and the pin when a download fails", () => {
    const dir = repoCopy();
    const r = pin(dir, { FAIL_502: "packages/provider-core/src/server/orchestrationInstructions.ts" });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(
      "cannot fetch packages/provider-core/src/server/orchestrationInstructions.ts at bbbbbbbbbb: gh: HTTP 502: Bad Gateway",
    );
    expect(git(dir, "status", "--porcelain")).toBe("");
  });

  test("keeps the contract and the pin when T3 no longer has a pinned file", () => {
    const dir = repoCopy();
    const r = pin(dir, { ABSENT: device });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`T3 bbbbbbbbbb has no ${device}. Point each at its new path in pins.json t3.paths, or remove it there.`);
    expect(git(dir, "status", "--porcelain")).toBe("");
  });

  test("moves the pin and keeps every pinned path", () => {
    const dir = repoCopy();
    const r = pin(dir, {});
    expect(r.code).toBe(0);
    expect(git(dir, "status", "--porcelain")).toBe(" M pins.json");
    expect(JSON.parse(readFileSync(join(dir, "pins.json"), "utf8")).t3).toEqual({ ...loadPins().t3, commit: head });
  });
});

describe("watch", () => {
  const schema = "packages/contracts/src/orchestratorMcp.ts";
  const pinned = loadPins().t3.commit.slice(0, 10);
  function remote() {
    const contract = tempDir();
    cpSync(join(ROOT, "t3/contract"), contract, { recursive: true });
    return contract;
  }
  function watch(dir: string, env: Record<string, string>) {
    const r = fakeGh(dir, "watch.ts", env);
    expect(r.stderr).toBe("");
    expect(git(dir, "status", "--porcelain")).toBe("");
    return JSON.parse(r.stdout).t3;
  }

  test("reports a schema change that no commit listing shows", () => {
    const contract = remote();
    appendFileSync(join(contract, schema), "\nexport const SchemaOnlyChange = true;\n");
    expect(watch(repoCopy(), { CONTRACT: contract })).toEqual({
      pinned,
      head: "bbbbbbbbbb",
      commits: [],
      newContractFiles: [],
      changedContractFiles: [schema],
      toolsAdded: [],
      toolsRemoved: [],
    });
  });

  test("reports no change when T3 moved without touching the contract", () => {
    expect(watch(repoCopy(), {}).changedContractFiles).toEqual([]);
  });

  test("reports a deleted toolkit and its tools", () => {
    const t3 = watch(repoCopy(), { ABSENT: device });
    expect({ changed: t3.changedContractFiles, removed: t3.toolsRemoved.sort() }).toEqual({
      changed: [device],
      removed: ["device_close", "device_list", "device_open", "device_screenshot"],
    });
  });

  test("reports a new toolkit as new, not changed", () => {
    const contract = remote();
    mkdirSync(join(contract, "apps/server/src/mcp/toolkits/fresh"));
    writeFileSync(join(contract, "apps/server/src/mcp/toolkits/fresh/tools.ts"), 'Tool.make("fresh_tool", {});\n');
    const t3 = watch(repoCopy(), { CONTRACT: contract });
    expect({ new: t3.newContractFiles, changed: t3.changedContractFiles, added: t3.toolsAdded }).toEqual({
      new: ["apps/server/src/mcp/toolkits/fresh/tools.ts"],
      changed: [],
      added: ["fresh_tool"],
    });
  });

  test("fails without writing when a download fails", () => {
    const dir = repoCopy();
    const r = fakeGh(dir, "watch.ts", { FAIL_502: schema });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`cannot fetch ${schema} at bbbbbbbbbb: gh: HTTP 502: Bad Gateway`);
    expect(git(dir, "status", "--porcelain")).toBe("");
  });
});

describe("sync", () => {
  function syncFixture() {
    const upstream = tempDir();
    cpSync(join(ROOT, "upstream"), upstream, { recursive: true });
    git(upstream, "init", "-q", "-b", "main");
    commitAll(upstream, "A");
    const dir = repoCopy();
    const pins = loadPins();
    pins.upstream.commit = git(upstream, "rev-parse", "HEAD");
    writeFileSync(join(dir, "pins.json"), `${JSON.stringify(pins, null, 2)}\n`);
    git(dir, "clone", "-q", "--no-checkout", upstream, ".cache/cursor__plugins");
    commitAll(dir, "pin the local upstream");
    return { dir, upstream };
  }

  test("merges upstream additions, deletions, and edits, and check flags the conflict left behind", () => {
    const { dir, upstream } = syncFixture();
    writeFileSync(join(upstream, "pstack/skills/how/references/new.md"), "New upstream file.\n");
    rmSync(join(upstream, "pstack/skills/how/references/explorer-prompt.md"));
    writeFileSync(join(upstream, "pstack/skills/poteto-help/SKILL.md"), "Rewritten upstream.\n");
    writeFileSync(join(upstream, "pstack/.cursor-plugin/plugin.json"), '{"name":"pstack","version":"9.9.9"}\n');
    commitAll(upstream, "B");

    const r = runTool(dir, "sync.ts");
    expect(r.code).toBe(2);
    const { updated, merged, conflicts, version } = JSON.parse(r.stdout);
    expect({ updated, merged, conflicts, version }).toEqual({
      updated: ["skills/how/references/explorer-prompt.md", "skills/how/references/new.md"],
      merged: [],
      conflicts: ["skills/poteto-help/SKILL.md: overlapping edits"],
      version: "9.9.9",
    });
    expect(readFileSync(join(dir, "plugins/pstack/skills/how/references/new.md"), "utf8")).toBe("New upstream file.\n");
    expect(existsSync(join(dir, "plugins/pstack/skills/how/references/explorer-prompt.md"))).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, "pins.json"), "utf8")).upstream.commit).toBe(git(upstream, "rev-parse", "HEAD"));

    const help = readFileSync(join(dir, "plugins/pstack/skills/poteto-help/SKILL.md"), "utf8").split("\n");
    expect(runTool(dir, "check.ts").stderr).toContain(
      `skills/poteto-help/SKILL.md:${help.indexOf("<<<<<<< t3-pstack") + 1}: unresolved merge conflict.`,
    );
  });

  test("refuses an upstream that moved a mapped source and changes nothing", () => {
    const { dir, upstream } = syncFixture();
    git(upstream, "mv", "cursor-team-kit/skills/deslop", "cursor-team-kit/deslop");
    commitAll(upstream, "Move deslop");
    const r = runTool(dir, "sync.ts");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("has no cursor-team-kit/skills/deslop. Point each at its new upstream path in pins.json, or remove it there.");
    expect(git(dir, "status", "--porcelain")).toBe("");
  });

  test("refuses upstream metadata without a version and changes nothing", () => {
    const { dir, upstream } = syncFixture();
    appendFileSync(join(upstream, "pstack/skills/how/SKILL.md"), "\nUpstream edit.\n");
    writeFileSync(join(upstream, "pstack/.cursor-plugin/plugin.json"), '{"name":"pstack"}\n');
    commitAll(upstream, "Drop the version");
    const r = runTool(dir, "sync.ts");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("upstream pstack/.cursor-plugin/plugin.json at");
    expect(r.stderr).toContain("has no version.");
    expect(git(dir, "status", "--porcelain")).toBe("");
  });
});

test("t3ToolNames resolves tool names held in constants", () => {
  const contract: Tree = new Map([
    ["apps/server/src/mcp/toolkits/html/tools.ts", b('Tool.make(HTML_RENDER_TOOL_NAME, {\nbrowserTool(\n  Tool.make("preview_open", {')],
    ["packages/shared/src/htmlRender.ts", b('export const HTML_RENDER_TOOL_NAME = "html_render";')],
  ]);
  expect([...t3ToolNames(contract)].sort()).toEqual(["html_render", "preview_open"]);
});
