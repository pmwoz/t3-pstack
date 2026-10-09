import { join } from "node:path";
import { T3_DIR, loadPins, readTree, snapshotSources, t3ToolNames, type Tree } from "./lib.ts";
import { contractPaths, fileAt, gh, resolveRef } from "./t3.ts";

type Commit = { sha: string; date: string; title: string };

/** Commits on `head` after `pin` that touch any of `paths`, newest first. */
function commitsTouching(repo: string, pin: string, head: string, paths: string[]): Commit[] {
  const since = gh(`repos/${repo}/commits/${pin}`).commit.committer.date;
  const seen = new Map<string, Commit>();
  for (const path of paths) {
    const page = gh(`repos/${repo}/commits?sha=${head}&path=${encodeURIComponent(path)}&since=${since}&per_page=100`) as Array<{
      sha: string;
      commit: { committer: { date: string }; message: string };
    }>;
    for (const c of page)
      if (c.sha !== pin) seen.set(c.sha, { sha: c.sha.slice(0, 10), date: c.commit.committer.date.slice(0, 10), title: c.commit.message.split("\n")[0]! });
  }
  return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date));
}

if (import.meta.main) {
  const pins = loadPins();

  const upstreamHead = resolveRef(pins.upstream.repo, "main");
  const upstreamCommits = upstreamHead === pins.upstream.commit ? [] : commitsTouching(pins.upstream.repo, pins.upstream.commit, upstreamHead, snapshotSources(pins));

  const t3Head = resolveRef(pins.t3.repo, "main");
  const t3Commits = t3Head === pins.t3.commit ? [] : commitsTouching(pins.t3.repo, pins.t3.commit, t3Head, pins.t3.paths);
  const pinnedTools = t3ToolNames(readTree(join(T3_DIR, "contract")));
  const headPaths = contractPaths(pins, t3Head);
  const headContract: Tree = new Map();
  if (t3Commits.length || headPaths.length !== pins.t3.paths.length)
    for (const path of headPaths) {
      const content = fileAt(pins.t3.repo, path, t3Head);
      if (content) headContract.set(path, content);
    }
  const headTools = headContract.size ? t3ToolNames(headContract) : pinnedTools;

  console.log(
    JSON.stringify(
      {
        upstream: { pinned: pins.upstream.commit.slice(0, 10), head: upstreamHead.slice(0, 10), commits: upstreamCommits },
        t3: {
          pinned: pins.t3.commit.slice(0, 10),
          head: t3Head.slice(0, 10),
          commits: t3Commits,
          newContractFiles: headPaths.filter((p) => !pins.t3.paths.includes(p)),
          toolsAdded: [...headTools].filter((t) => !pinnedTools.has(t)),
          toolsRemoved: [...pinnedTools].filter((t) => !headTools.has(t)),
        },
      },
      null,
      2,
    ),
  );
}
