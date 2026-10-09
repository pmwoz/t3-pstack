import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  PLUGIN_DIR,
  ROOT,
  UPSTREAM_DIR,
  expectedTree,
  isExecutable,
  loadPins,
  mappedFiles,
  readTree,
  run,
  savePins,
  snapshotSources,
} from "./lib.ts";

export type Outcome =
  | { kind: "unchanged" }
  | { kind: "take-upstream"; content: Buffer | undefined }
  | { kind: "merged"; content: Buffer }
  | { kind: "conflict"; content: Buffer | undefined; why: string };

type Merge3 = (ours: Buffer, base: Buffer, theirs: Buffer) => { clean: boolean; content: Buffer };

const same = (a?: Buffer, b?: Buffer) => (a === undefined ? b === undefined : b !== undefined && a.equals(b));

/** Three-way decision for one plugin path: base is the old upstream, theirs the new one. */
export function decide(base: Buffer | undefined, ours: Buffer | undefined, theirs: Buffer | undefined, merge3: Merge3): Outcome {
  if (same(base, theirs) || same(ours, theirs)) return { kind: "unchanged" };
  if (same(ours, base)) return { kind: "take-upstream", content: theirs };
  if (theirs === undefined) return { kind: "conflict", content: ours, why: "upstream deleted a file we changed" };
  if (ours === undefined) return { kind: "conflict", content: theirs, why: "upstream changed a file we removed" };
  const merged = merge3(ours, base ?? Buffer.alloc(0), theirs);
  return merged.clean
    ? { kind: "merged", content: merged.content }
    : { kind: "conflict", content: merged.content, why: base ? "overlapping edits" : "both sides added this file" };
}

export function gitMerge3(ours: Buffer, base: Buffer, theirs: Buffer) {
  const dir = mkdtempSync(join(tmpdir(), "t3p-merge-"));
  const files = { ours: join(dir, "ours"), base: join(dir, "base"), theirs: join(dir, "theirs") };
  writeFileSync(files.ours, ours);
  writeFileSync(files.base, base);
  writeFileSync(files.theirs, theirs);
  const r = run(["git", "merge-file", "-p", "-L", "t3-pstack", "-L", "upstream-old", "-L", "upstream-new", files.ours, files.base, files.theirs], { allowFail: true });
  rmSync(dir, { recursive: true });
  if (r.code < 0 || r.code > 127) throw new Error(`git merge-file failed: ${r.stderr}`);
  return { clean: r.code === 0, content: r.stdout };
}

function fetchUpstream(repo: string, ref: string) {
  const cache = join(ROOT, ".cache", repo.replace("/", "__"));
  if (!existsSync(cache)) run(["git", "clone", "--quiet", "--filter=blob:none", "--no-checkout", `https://github.com/${repo}.git`, cache]);
  run(["git", "fetch", "--quiet", "origin", ref], { cwd: cache });
  const sha = run(["git", "rev-parse", "FETCH_HEAD"], { cwd: cache }).stdout.toString().trim();
  return { cache, sha };
}

if (import.meta.main) {
  const ref = process.argv[2] ?? "main";
  const pins = loadPins();
  const { cache, sha } = fetchUpstream(pins.upstream.repo, ref);
  if (sha === pins.upstream.commit) {
    console.log(JSON.stringify({ status: "current", commit: sha }, null, 2));
    process.exit(0);
  }

  const sources = snapshotSources(pins);
  const present = sources.filter((s) => run(["git", "cat-file", "-e", `${sha}:${s}`], { cwd: cache, allowFail: true }).code === 0);
  const fresh = mkdtempSync(join(tmpdir(), "t3p-upstream-"));
  run(["tar", "-x", "-C", fresh], { input: run(["git", "archive", sha, ...present], { cwd: cache }).stdout });

  const base = expectedTree(pins, UPSTREAM_DIR);
  const theirs = expectedTree(pins, fresh);
  const ours = readTree(PLUGIN_DIR);
  const freshFiles = new Map(mappedFiles(pins, fresh).map(({ dst, abs }) => [dst, abs]));
  const report = { from: pins.upstream.commit, to: sha, updated: [] as string[], merged: [] as string[], conflicts: [] as string[] };
  for (const path of new Set([...base.keys(), ...theirs.keys()])) {
    const outcome = decide(base.get(path), ours.get(path), theirs.get(path), gitMerge3);
    if (outcome.kind === "unchanged") continue;
    const abs = join(PLUGIN_DIR, path);
    if (outcome.content === undefined) rmSync(abs, { force: true });
    else {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, outcome.content);
      const src = freshFiles.get(path);
      if (src) chmodSync(abs, isExecutable(src) ? 0o755 : 0o644);
    }
    if (outcome.kind === "take-upstream") report.updated.push(path);
    else if (outcome.kind === "merged") report.merged.push(path);
    else report.conflicts.push(`${path}: ${outcome.why}`);
  }

  rmSync(UPSTREAM_DIR, { recursive: true, force: true });
  run(["cp", "-R", fresh, UPSTREAM_DIR]);
  rmSync(fresh, { recursive: true });
  const commits = run(["git", "log", "--format=%h %as %s", `${pins.upstream.commit}..${sha}`, "--", ...sources], { cwd: cache })
    .stdout.toString().trim().split("\n").filter(Boolean);
  pins.upstream.commit = sha;
  pins.upstream.version = JSON.parse(readFileSync(join(UPSTREAM_DIR, "pstack/.cursor-plugin/plugin.json"), "utf8")).version;
  savePins(pins);

  console.log(JSON.stringify({ ...report, version: pins.upstream.version, missingSources: sources.filter((s) => !present.includes(s)), commits }, null, 2));
  if (report.conflicts.length) process.exit(2);
}
