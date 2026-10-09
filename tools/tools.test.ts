import { describe, expect, test } from "bun:test";
import { driftProblems } from "./check.ts";
import { t3ToolNames, transform, type Tree } from "./lib.ts";
import { decide, gitMerge3 } from "./sync.ts";

const b = (s: string) => Buffer.from(s);

describe("transform", () => {
  const upstream = "---\nname: Poteto Mode\ndescription: x\ndisable-model-invocation: true\nmode: true\n---\n\n# Body\nname: stays\n";

  test("names the skill after its directory and lets the model load it", () => {
    expect(transform("skills/poteto-mode/SKILL.md", b(upstream)).toString()).toBe(
      "---\nname: poteto-mode\ndescription: x\nmode: true\n---\n\n# Body\nname: stays\n",
    );
  });

  test("keeps the user-only flag on poteto-help", () => {
    const help = "---\nname: poteto-help\ndescription: x\ndisable-model-invocation: true\n---\nbody\n";
    expect(transform("skills/poteto-help/SKILL.md", b(help)).toString()).toBe(help);
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

test("t3ToolNames resolves tool names held in constants", () => {
  const contract: Tree = new Map([
    ["apps/server/src/mcp/toolkits/html/tools.ts", b('Tool.make(HTML_RENDER_TOOL_NAME, {\nbrowserTool(\n  Tool.make("preview_open", {')],
    ["packages/shared/src/htmlRender.ts", b('export const HTML_RENDER_TOOL_NAME = "html_render";')],
  ]);
  expect([...t3ToolNames(contract)].sort()).toEqual(["html_render", "preview_open"]);
});
