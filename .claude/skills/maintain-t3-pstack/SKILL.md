---
name: maintain-t3-pstack
description: Bring t3-pstack up to date with Cursor's upstream pstack and with the T3 Code orchestration contract, and list new T3 features worth adopting. Use for "maintain t3-pstack", "sync upstream pstack", "check T3 for changes", and the scheduled maintenance run.
---

# Maintain t3-pstack

Work in a worktree off `main`. Under T3 Code, call `t3_worktree_handoff` first if this thread sits at the project root. Open one PR per concern and never merge it. The maintainer merges. If a concern already has an open PR (`gh pr list --state open`), update that PR instead of opening another: `git fetch origin <branch> && git switch --detach FETCH_HEAD`, do that section's steps, `git push origin HEAD:<branch>`, and rewrite its title and body. Its pins already cover its commits, so the tools report only newer ones. Set the version relative to `main`. Never edit `upstream/` or `t3/contract/` by hand. The tools rewrite them.

## 1. See what moved

Run `bun install` once, then `bun run watch`. It prints JSON with the upstream commits and the T3 contract commits since the pins in `pins.json`, plus T3 tools added or removed.

If both commit lists are empty and no tool changed, reply with both pins and "nothing new", and stop.

## 2. Sync upstream

Run this when `upstream.commits` is not empty.

1. Run `bun run sync`. It three-way merges the new upstream commit into `plugins/pstack`, replaces `upstream/`, and moves the pin. Exit code 2 means conflicts, and the JSON lists them.
2. Resolve every conflict marker in `plugins/pstack`. Keep the upstream change and reapply this port's drift on top. Keep the drift's reason in `drift.json` true.
3. Read each upstream commit in the report with `git -C .cache/cursor__plugins show <sha>`. Decide whether it adds a Cursor mechanic that `plugins/pstack/skills/poteto-mode/references/t3-adapter.md` does not map: a new Task parameter, a cloud feature, a new model slug, a Cursor built-in, or a new skill that spawns subagents. Extend the adapter when it does. A new skill needs nothing else.
4. If upstream now does what a drift entry did, take upstream's file and delete the entry.
5. Run `bun run check`, `bun test tools`, and `bun run typecheck`. All must pass.
6. Run `bun run version <next>`. Bump the minor version when the upstream version changed, else the patch version.
7. Open a PR titled `Sync upstream pstack <old> to <new>`. In the body, list each upstream commit with its effect on the port: none, adapter updated, or drift updated.

## 3. Update the T3 contract

Run this when `t3.commits`, `toolsAdded`, `toolsRemoved`, or `newContractFiles` is not empty.

1. Run `bun run t3:pin` and read `git diff t3/contract`.
2. Sort every change into one of three groups:
   - **Breaks a mapping.** A tool was renamed or removed, an access rule changed, or T3's injected instructions now say something else. Fix the adapter in this PR. `bun run check` fails on a tool name the adapter uses that no longer exists.
   - **New capability.** A new tool, option, or behavior that a skill could use. Do not adopt it in this PR. List it under "Opportunities" in the PR body, one line each, naming the skill or adapter section that would use it.
   - **Irrelevant to the skills.** Give only the count.
3. Run the checks from step 2.5. Bump the patch version if the plugin changed.
4. Open a PR titled `Update T3 contract to <short sha>`.

## 4. Report

Reply with the upstream move (old and new version, commit count), the T3 move (old and new short sha), each PR as `https://github.com/pmwoz/t3-pstack/pull/<number>`, the opportunities, and anything left for the maintainer. Link each PR to this thread with `link_pull_request`.
