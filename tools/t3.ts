import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { T3_DIR, loadPins, run, savePins, type Pins } from "./lib.ts";

const TOOLKITS = "apps/server/src/mcp/toolkits";

export const gh = (path: string) => JSON.parse(run(["gh", "api", path]).stdout.toString());

export const resolveRef = (repo: string, ref: string): string => gh(`repos/${repo}/commits/${ref}`).sha;

export const fileAt = (repo: string, path: string, sha: string): Buffer | undefined => {
  const r = run(["gh", "api", "-H", "Accept: application/vnd.github.raw", `repos/${repo}/contents/${path}?ref=${sha}`], { allowFail: true });
  return r.code === 0 ? r.stdout : undefined;
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
  rmSync(join(T3_DIR, "contract"), { recursive: true, force: true });
  const missing: string[] = [];
  for (const path of paths) {
    const content = fileAt(pins.t3.repo, path, sha);
    if (!content) {
      missing.push(path);
      continue;
    }
    const abs = join(T3_DIR, "contract", path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  pins.t3.commit = sha;
  pins.t3.paths = paths;
  savePins(pins);
  console.log(JSON.stringify({ commit: sha, files: pins.t3.paths.length, missing }, null, 2));
}
