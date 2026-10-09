# pstack under T3 Code

The pstack skills are Cursor's, kept as upstream wrote them. This file maps every Cursor mechanic they name to T3 Code, for the Claude and the Codex provider. Where a skill names a construct below, use the mapping. Everything else in the skills holds as written.

T3 Code's own injected instructions win over this file if they ever disagree. Report the conflict to the user.

## Paths

`<pstack-root>` is the installed plugin directory: the directory that holds `skills/`, `agents/`, and `docs/`. It is two levels above the base directory of any pstack skill you are running. On Claude, the session-start context names it.

The skills cite upstream paths such as `pstack/skills/<x>/...` or `git show origin/main:pstack/skills/<x>/...`. Read `<pstack-root>/skills/<x>/...` instead. A plan file keeps the upstream literal, because `scripts/check-plan.mjs` checks for it.

## Starting another skill

A skill that names another one ("the **how** skill", "run `/deslop`", "the **prove-it-works** principle skill", "the control skill") means: read `<pstack-root>/skills/<name>/SKILL.md` in full and follow it. Do not call the Skill tool for a pstack skill. Claude refuses it for every skill upstream marks typed-only.

- Principle skills live at `skills/principle-<name>/SKILL.md`.
- `deslop`, `control-ui`, and `control-cli` come from Cursor's team kit and ship in `skills/`.
- A user who types `/pstack:<name>` (Claude) or `$pstack:<name>` (Codex) starts the skill directly. That path is unchanged.
- A `create-skill` step uses the `skill-creator` skill when the session has it. Otherwise follow `playbooks/authoring-a-skill.md`.

## Subagents

Every subagent a skill spawns is one `delegate_task` call. Each lane is a T3 child thread with its own provider, model, and effort, so panels can mix Claude and Codex.

Omit `runtimeMode` on every `delegate_task`, so the child inherits yours. A narrower mode is not a sandbox. `approval-required` and `auto-accept-edits` make the user approve the child's tool calls by hand, which stalls an unattended run.

| Cursor construct | Under T3 |
|---|---|
| `Task`, "spawn N in one message" | N `delegate_task` calls in one turn, `mode: "async"`. The brief is self-contained: goal, file pointers, write scope, output path, report shape. A child does not see your conversation. |
| `subagent_type: "poteto-agent"` or `"Comment Sicko"` | The brief starts with "Read `<pstack-root>/agents/<file>.md` in full and act as it." (`poteto-agent.md`, `comment-sicko.md`), then the scope. |
| `subagent_type: generalPurpose`, agent mode | No agent file. Children load the provider's MCP servers, so `why` investigators and `reflect` reviewers keep their sources. |
| `readonly: true` | The brief says read-only, and the lane reads a frozen SHA (Worktrees section). |
| `run_in_background: true`, waiting on the result | Async is the default. Completion wakes you. End the turn. Do not poll. Call `task_status` only when you need a result mid-turn. "The Task response body" is the task `summary`. |
| Resume, message, or queue a follow-up | A new round is a new `delegate_task` with the full consolidated brief and a new `clientRequestId`. Never `t3_thread_send` a new round to `childThreadId`. Send to a live child (`mode: "queue"` or `"steer"`) only for upstream's narrow case: state that lives in that child. |
| Stop, hold, cancel nested subagents | `task_cancel` (it stops nested tasks and their PR watches). A hold is a `t3_thread_send` with `mode: "steer"` and the zero-writes order. |
| Liveness, the Cursor dashboard, `children.tsv` IDs | `task_status` on the recorded `taskId`. Record `taskId` where upstream records subagent IDs. |
| Eval blinding | Also blind the `title` and the worktree path, which the child can see. |

`task_status` only finds tasks your own thread delegated. A grandchild's task belongs to its parent.

## Model per role

Upstream reads per-role models from "the `/setup-pstack` rule" (`~/.cursor/rules/pstack-models.mdc`) and falls back to slugs written in the skills. Under T3:

1. Read the role's line in `~/.agents/pstack-models.md` (written by `/setup-pstack`). The line format is `<role>: <descriptor>[, <descriptor>]`, and a descriptor is `<provider>:<model>@<effort>`.
2. Resolve each descriptor against `orchestrator_capabilities` into `target: {providerInstanceId, model, options}`.
   - Provider is a `providerInstanceId` such as `claudeAgent` or `codex`. The short form `claude` means the instance whose `driverKind` is `claudeAgent`. Use an instance with `canRunChildTask: true`.
   - Model is a catalog model id. A short form such as `opus` means the newest catalog id that contains it.
   - Effort goes into the model option labeled "Reasoning" (`effort` on Claude, `reasoningEffort` on Codex). A model without a Reasoning option takes a descriptor with no `@<effort>`, and the target carries no effort option.
   - If the model is not in the catalog, use the closest model of the same provider and say so in the reply.
3. `inherit-parent` or `auto` means: omit `target`. The lane runs on your own provider and model, and it still counts toward a panel's fan-out.
4. With no sheet line, translate the skill's default slug: `claude-opus-5-5-<effort>` is `claude:opus@<effort>`, `gpt-5.6-sol-<effort>` is `codex:gpt-6.1-sol@<effort>`, and `grok-4.7-<effort>-fast` is the `grok` provider when the catalog lists one that can run child tasks, else `codex:gpt-6.1-sol@<effort>`.
5. "A model family" is the provider. A cross-family judge or reviewer runs on a different provider than the work it judges.

## Worktrees and parallel writers

T3 has no cloud agents. Every lane is a local `delegate_task` child, and a child shares the parent's checkout.

- **A lane that writes or checks out a SHA gets its own worktree.** The parent creates it before delegating: `git worktree add [--detach] ${TMPDIR:-/tmp}/pstack/<repo>/<run>/<lane> <ref>`. The brief names the path, and the child works only there. Keep the worktree until the last step that reads it is done (arena judging and grafting, verification, merge). Then the parent removes it. This replaces "a cloud agent per worker", `environment: "cloud"`, `cloud_base_branch`, and "each worker its own worktree".
- **Read-only lanes review a frozen SHA.** Before a round of read-only lanes, such as interrogate reviewers, commit what is under review and run `git worktree add --detach ${TMPDIR:-/tmp}/pstack/<repo>/<run>/review-<sha> <sha>`. The brief names that path and the SHA, and the round's read-only lanes read only there, because your own worktree keeps changing while they work. Remove it after you synthesize the round.
- **Evidence outlives worktrees.** Write the decision log, verification output, review prompts, and child reports under `${PSTACK_STORE:-$HOME/.pstack/store}/<repo-name>/<run>/`, never inside a worktree. That directory is show-me-your-work's "work dir". `git worktree remove` deletes ignored files, and `gh pr merge --delete-branch` removes the worktree that holds the merged branch.
- **The user picks the root's workspace.** The user starts a thread in a worktree from the T3 UI. The root works in the checkout its thread is in and never moves it. If the root sits on `main` and the task writes, it creates a branch there with `git switch -c <branch>`.
- **Upstream's capacity numbers assume cloud VMs.** Cap in-flight writing lanes at what this machine runs. Give each live lane its own ports and data directories per the project's verification skill. If the app cannot run side by side, run those lanes in sequence.
- **Separate top-level threads** come only from an explicit user request for them. Then use `t3_thread_launch` with a `workspaceStrategy`. A launched thread is not a task: follow it with `t3_thread_read` or `t3_thread_wait`, never `task_status`, and it does not wake you when it ends.
- **Listing worktrees.** `t3_worktree_status` reports only your own thread. To audit every worktree, use `t3_worktree_list`, `t3_thread_list`, and `t3_thread_read` per thread for its `worktreePath`. Add `git worktree list` for detached worktrees, which `t3_worktree_list` omits.

## Pull requests, watching, and loops

**Only the root thread owns a PR in T3.** T3 refuses `watch_pull_request` for a delegated child's thread.

- **Opening a PR.** T3 has no PR-creation tool, so the skills' "no built-in PR tool" branch applies: create it with the resolved forge (`gh` or `origin`), ready for review, never draft. The root calls `link_pull_request` for every PR, each stack layer included. A child that opens a PR returns its URL and head SHA, and the root links it.
- **A PR owner (autopilot, orchestrate, multi-phase plans)** is a role, not a long-lived agent. Each owner round (build, fix, merge) is a fresh `delegate_task` in that PR's worktree. The round does its work, reports the PR URL, head SHA, and state, and returns. The root decides and delegates the next round.
- **Babysit inside a child.** A child told to babysit does one `check` pass, fixes what it can, and returns the PR state. It never arms a watch.
- **`/loop` around a PR.** This covers babysit drive and background, shipping, the orchestrate frontier, and autonomous-run events. The root calls `watch_pull_request` and ends the turn. T3 wakes it on checks, reviews, and conflicts. On each wake, take the verdict from `<pstack-root>/skills/poteto-mode/scripts/watch-pr/watch-pr --status-only --pr <number>`, run in the PR's checkout (or the playbook's `origin` or `gh pr view` read), act, and keep the watch armed across push waves. Call `unwatch_pull_request` before handing back to the user. `scripts/watch-pr` stays the verdict oracle.
- **`/loop` on a fixed cadence** (`/loop 1h`, audit ticks, heartbeats). The root calls `schedule_task` with `{type: "interval", everyMs: 3600000}` bound to its own thread, reports `nextRunAt`, and calls `delete_scheduled_task` when the run closes. Schedule from the root, because a child's schedule posts into the child's thread.
- **`/loop until X`** with no outside event: keep iterating within the run. Add a schedule only when the work must survive turn ends.
- **Events a PR watch cannot see.** T3 refuses to watch a PR that is already merged, and it cannot watch a ref, a branch without a PR, or a post-merge CI run. For these (the orchestrate retro watcher, an autonomous run waiting on a ref) and for a heartbeat fallback, the root calls `schedule_task` with an interval bound to its own thread. The prompt states the check and the exit condition. Call `delete_scheduled_task` once the condition holds.
- **Stacks.** `list_thread_pull_requests` reports linked PRs and their stack chains.

## History and transcripts

- **Current chat.** `t3_thread_read` with your thread id (`view: "activity"` lists tool calls and files read). This replaces `agent-transcripts/` paths and "the chat UUID".
- **Earlier chats** (recall, reflect, session pickup, show-me-your-work audits). Use `t3_thread_search` and `t3_thread_list` in this project only. Pass thread ids to children, not file paths. Cite a thread as `[title](t3-thread://v1/<threadId>)`.
- **Shell fallback.** `~/.claude/projects/<encoded-cwd>/*.jsonl` (Claude) and `~/.codex/sessions/**/*.jsonl` (Codex).
- **Pinned and active chats** ("from the user or the sidebar") are threads with `t3_thread_list` status not settled.

## Locations

- **Project skill** (a generated verification skill, for example). Write `.claude/skills/<name>/` and symlink `.agents/skills/<name>` to it. Claude reads only `.claude/skills`, and Codex reads `.agents/skills`.
- **User skill.** Write to `~/.claude/skills/` and `~/.agents/skills/`.
- **`.cursor/rules`.** Read `CLAUDE.md` and `AGENTS.md`, plus any `.cursor/rules` the repo still has.
- **"The current agent's store"** (orchestrate and multi-phase plans). Use `${PSTACK_STORE:-$HOME/.pstack/store}/<repo-name>/`. Export `ORCH_STORE` to it for `scripts/orch`. Never write it inside the checkout.
- **"MCPs from the Cursor environment" and `mcps/`.** Group your tools by MCP server name.

## Questions and the user

- **`AskQuestion`.** On Claude, use `AskUserQuestion`. On Codex, use `request_user_input` only when the session exposes it and allows it in the current mode (Codex limits it to plan mode). Otherwise ask one plain-text question with labeled options.
- **A delegated child never asks the user.** It returns `BLOCKED` with the question, and the root asks.
- **Visuals** (charts, tables, mockups). Build a self-contained page, check it with `html_preview`, then publish it with `html_render` from the root. A child's render lands in the child's thread.

## Cursor products with no counterpart

- **Custom Mode, `reminder`, Option+Enter.** None. Start a task with `/pstack:poteto-mode` (Claude) or `$pstack:poteto-mode` (Codex).
- **Cursor's built-in `/babysit`.** Not present. The Babysit playbook is the only babysit.
- **Plan Mode.** T3 interaction mode `plan`.
- **Automations** (`automations/benny`). A webhook or fixed-time `schedule_task`. Get webhook signing secrets with `request_secret`.
- **Grok Bot** (`/make-bot-ui`). None. The skill ships unchanged but has nothing to wake under T3.
- **A Cursor restart.** T3 keeps threads, delegated tasks, and queues across restarts. Re-read `task_status` for recorded ids and `t3_thread_list`, then reattach by PR and branch.

## Tool names on Codex

The skills name Claude tools. On Codex, `Read`, `Grep`, and `Glob` are shell commands (`cat`, `rg`, `find`). Edits use `apply_patch`, and the todolist is `update_plan`.

## Local shell

Upstream's commands assume a Linux cloud VM. Under T3 they run on the user's machine, often macOS with zsh, so check `uname` and `$SHELL` before you write shell.

- macOS has no `timeout`. Bound a command with `perl -e 'alarm shift; exec @ARGV' <seconds> <command>`, which exits 142 on expiry.
- zsh does not split an unquoted `$var` into words. Use `${=var}` or an array.

## A broken mapping

If a mapping here is wrong or missing, say so in the reply and fix this file in its own PR to the t3-pstack repository. Do not edit an upstream skill to work around it.
