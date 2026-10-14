import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { T3_DIR, loadPins, run, savePins, type Pins, type Tree } from "./lib.ts";

const TOOLKITS = "apps/server/src/mcp/toolkits";

export const gh = (path: string) => JSON.parse(run(["gh", "api", path]).stdout.toString());

export const resolveRef = (repo: string, ref: string): string => gh(`repos/${repo}/commits/${ref}`).sha;

/** A file at a commit, or undefined when GitHub answers 404. Any other failure throws. */
export const fileAt = (repo: string, path: string, sha: string): Buffer | undefined => {
  const r = run(["gh", "api", "-H", "Accept: application/vnd.github.raw", `repos/${repo}/contents/${path}?ref=${sha}`], { allowFail: true });
  if (r.code === 0) return r.stdout;
  if (r.stderr.includes("(HTTP 404)")) return undefined;
  throw new Error(`cannot fetch ${path} at ${sha.slice(0, 10)}: ${r.stderr.trim()}`);
};

/** Contract paths at a commit: the pinned list plus any toolkit that appeared since. */
export function contractPaths(pins: Pins, sha: string): string[] {
  const toolkits = (gh(`repos/${pins.t3.repo}/contents/${TOOLKITS}?ref=${sha}`) as Array<{ name: string; type: string }>)
    .filter((e) => e.type === "dir")
    .map((e) => `${TOOLKITS}/${e.name}/tools.ts`);
  return [...new Set([...pins.t3.paths, ...toolkits])].sort();
}

/** Re-snapshot the T3 contract at a ref and move the pin there. */
if (import.meta.main) {
  const pins = loadPins();
  const sha = resolveRef(pins.t3.repo, process.argv[2] ?? "main");
  const paths = contractPaths(pins, sha);
  const contract: Tree = new Map();
  for (const path of paths) {
    const content = fileAt(pins.t3.repo, path, sha);
    if (content) contract.set(path, content);
  }
  rmSync(join(T3_DIR, "contract"), { recursive: true, force: true });
  for (const [path, content] of contract) {
    const abs = join(T3_DIR, "contract", path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  pins.t3.commit = sha;
  pins.t3.paths = [...contract.keys()];
  savePins(pins);
  console.log(JSON.stringify({ commit: sha, files: contract.size, missing: paths.filter((p) => !contract.has(p)) }, null, 2));
}
