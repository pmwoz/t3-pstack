# pstack under T3 Code

The pstack skills are Cursor's, kept as upstream wrote them. This file maps every Cursor mechanic they name to T3 Code, for the Claude and the Codex provider. Where a skill names a construct below, use the mapping. Everything else in the skills holds as written.

T3 Code's own injected instructions win over this file if they ever disagree. Report the conflict to the user.

## Paths

`<pstack-root>` is the installed plugin directory: the directory that holds `skills/`, `agents/`, and `docs/`. It is two levels above the base directory of any pstack skill you are running. The session-start context names it. On Codex, that context arrives only after the user trusts the pstack hook.

A `poteto-agent` given no path looks for poteto-mode under `~/.claude/plugins/cache/t3-pstack/` (Claude) or `${CODEX_HOME:-$HOME/.codex}/plugins/cache/t3-pstack/` (Codex), not `~/.cursor/plugins/`. It compares the `version` in `.claude-plugin/plugin.json` or `.codex-plugin/plugin.json`. Do not search all of `plugins/`, because other pstack ports install there with higher versions.

The skills cite upstream paths such as `pstack/skills/<x>/...` or `git show origin/main:pstack/skills/<x>/...`. Read `<pstack-root>/skills/<x>/...` instead. A plan file keeps the upstream literal, because `scripts/check-plan.mjs` checks for it.

## Starting another skill

A skill that names another one ("the **how** skill", "run `/deslop`", "the **prove-it-works** principle skill", "the control skill") means: read `<pstack-root>/skills/<name>/SKILL.md` in full and follow it. Do not call the Skill tool for a pstack skill. Claude refuses it for every skill upstream marks typed-only. If a project or user skill folder (Locations section) holds a skill of that name, read that copy instead. `reflect` puts its edits to a pstack skill there.

- Principle skills live at `skills/principle-<name>/SKILL.md`.
- `deslop`, `control-ui`, and `control-cli` come from Cursor's team kit and ship in `skills/`.
- A user who types `/pstack:<name>` (Claude) or `$pstack:<name>` (Codex) starts the skill directly. That path is unchanged.
- A `create-skill` step uses the `skill-creator` skill when the session has it. Otherwise follow `playbooks/authoring-a-skill.md`.

## Subagents

Every subagent a skill spawns is one `delegate_task` call, also on your own provider. T3's advice to prefer native subagent tools does not cover pstack lanes, because a native subagent has no `taskId` for `task_status` or `task_cancel` and no `isolation`. Each lane is a T3 child thread with its own provider, model, and effort, so panels can mix Claude and Codex.

Omit `runtimeMode` on every `delegate_task`, so the child inherits yours. A narrower mode is not a sandbox. `approval-required` and `auto-accept-edits` make the user approve the child's tool calls by hand, which stalls an unattended run.

| Cursor construct | Under T3 |
|---|---|
| `Task`, "spawn N in one message" | N `delegate_task` calls in one turn, `mode: "async"`. The brief is self-contained: goal, file pointers, write scope, output path, report shape. A child does not see your conversation. |
| `subagent_type: "poteto-agent"` or `"comment-sicko"` | The brief starts with "Read `<pstack-root>/agents/<file>.md` in full and act as it." (`poteto-agent.md`, `comment-sicko.md`), then the scope. |
| `subagent_type: generalPurpose`, agent mode | No agent file. Children load the provider's MCP servers, so `why` investigators and `reflect` reviewers keep their sources. |
| `readonly: true` | The brief says read-only, and the lane reads a frozen SHA (Worktrees section). |
| `run_in_background: true`, waiting on the result | Async is the default. A running task's result carries `next`: its completion wakes you, so end the turn. Do not poll, and never call `task_status` on a running task before that wake. "The Task response body" is the task `summary`. |
| Resume, message, or queue a follow-up | A new round is a new `delegate_task` with the full consolidated brief and a new `clientRequestId`. Never `t3_thread_send` a new round to `childThreadId`. Send to the child only for upstream's narrow case: state that lives in that child. A live child takes `mode: "queue"` or `"steer"`. A child whose task finished can still take a send, for example when its worktree holds uncommitted changes. When the send returns a `taskId`, record it, and its completion wakes you. A queued or restarted follow-up gets its own task. A steer returns the task of the turn it joins, which you may already track, and none when that turn has no task. |
| Stop, hold, cancel nested subagents | `task_cancel` (it stops nested tasks and their PR watches). A hold is a `t3_thread_send` with `mode: "steer"` and the zero-writes order. |
| Liveness, the Cursor dashboard, recorded subagent IDs | Record `taskId` and `childThreadId` where upstream records subagent IDs, including each `taskId` a follow-up send returns. Probe a running child, such as on an audit tick, with `t3_thread_read` on its `childThreadId`: `status`, `updatedAt`, its latest activity, and `pendingRequestCount`. A pending request is a question (Questions section) or an approval, and neither wakes you. You cannot grant an approval. Ask the user to approve or deny it in the child's thread, named by the `link` the task returned. |
| Eval blinding | Also blind the `title` and the worktree path, which the child can see. |

`task_status` only finds tasks your own thread delegated. A grandchild's task belongs to its parent.

## Model per role

Upstream reads per-role models from "the `/setup-pstack` rule" (`~/.cursor/rules/pstack-models.mdc`) and falls back to slugs written in the skills. Under T3:

1. Read the role's line in `~/.agents/pstack-models.md` (written by `/setup-pstack`). The line format is `<role>: <descriptor>[, <descriptor>]`, and a descriptor is `<provider>:<model>@<effort>`. Comment Sicko, which `no-comments` spawns, is a judgment lane, so it reads the `judgment and prose` line.
2. Resolve each descriptor against `orchestrator_capabilities` into `target: {providerInstanceId, model, options}`. Call it once, before your first `delegate_task`, and again only after `delegate_task` rejects a target.
   - Provider is a `providerInstanceId` such as `claudeAgent` or `codex`. The short form `claude` means the instance whose `driverKind` is `claudeAgent`. Use an instance with `canRunChildTask: true`.
   - Model is a catalog model id. A short form such as `opus` means the newest catalog id that contains it.
   - Effort goes into the model's effort option (`effort` on Claude, `reasoningEffort` on Codex), and must be one of its `values`. A model without an effort option takes a descriptor with no `@<effort>`, and the target carries no effort option.
   - `orchestrator_capabilities` lists a short set of models per provider and leaves out legacy ones, but `delegate_task` accepts any catalog model id. Send a full model id the list lacks as it is. Call `orchestrator_capabilities` again with `search` set to the model only for a short form the list lacks or after `delegate_task` rejects the model.
   - A project can turn a provider off. `orchestrator_capabilities` still lists it, but `delegate_task` refuses it as "disabled for project".
   - When the search finds nothing or the provider is off, never switch the lane to another model or provider on your own. Name what is missing and ask the user which to use (Questions section).
   - Compare the `providerInstanceId`, `model`, and `options` that `delegate_task` returns with the target. If they differ, say so in the reply.
3. `inherit-parent` or `auto` means: omit `target`. The lane runs on your own provider and model, and it still counts toward a panel's fan-out.
4. With no sheet line, translate the skill's default slug: `claude-opus-5-5-<effort>` is `claude:opus@<effort>`, `gpt-5.6-sol-<effort>` is `codex:gpt-6.1-sol@<effort>`, and `grok-4.7-<effort>-fast` or `grok-4.7-<effort>` is the `grok` provider when the catalog lists one that can run child tasks, else `codex:gpt-6.1-sol@<effort>`.
5. "A model family" is the provider. A cross-family judge or reviewer runs on a different provider than the work it judges.
6. "Match the model to the job" moves only the target's effort and speed. Effort steps along `low`, `medium`, `high`, `xhigh`, `max` and stops at `max`. Fast mode is `fastMode: true` on Claude or `serviceTier: "priority"` on Codex. A lane on your own provider instance and model keeps every option of yours that its target does not name, so standard speed there sets `fastMode: false` or `serviceTier: "default"`. A lane on another model inherits none of your options. Send it only options its catalog entry lists. A model with no speed option, such as `claude-sonnet-5-5`, runs at standard speed and rejects `fastMode`. When `delegate_task` rejects an option, drop it from that call and from every remaining lane of the fan-out before you retry. A descriptor names no speed, so verification on a sheet line runs at standard speed, and on a translated `-fast` default it runs in fast mode.

## Worktrees and parallel writers

T3 has no cloud agents. Every lane is a local `delegate_task` child. A child shares the parent's checkout unless the call sets `isolation: "worktree"`.

- **A lane that writes gets its own worktree.** Commit what the lane builds on, then delegate with `isolation: "worktree"`. T3 creates the worktree from your current local commit, runs project setup, and starts the child there. It does not copy uncommitted edits. The child commits its work and reports its branch and head SHA, so the parent reads the result by ref from its own checkout. The worktree belongs to the child's thread, so do not remove it. This replaces "a cloud agent per worker", `environment: "cloud"`, `cloud_base_branch`, and "each worker its own worktree".
- **A lane on another ref gets a worktree from the parent.** Isolation always starts from your current commit. For a lane on a PR branch, such as a PR owner's fix round, or on another SHA, run `git worktree add [--detach] ${TMPDIR:-/tmp}/pstack/<repo>/<run>/<lane> <ref>` and delegate without `isolation`. The brief names the path, and the child works only there. Keep the worktree until the last step that reads it is done (verification, merge). Then the parent removes it.
- **A before run gets its own worktree too.** Reproduce the old behavior in `git worktree add --detach ${TMPDIR:-/tmp}/pstack/<repo>/<run>/before origin/<default-branch>`, whether the root or a lane runs it. Never copy the default branch's files into the working checkout, because the next commit picks them up.
- **Read-only lanes review a frozen SHA.** Before a round of read-only lanes, such as interrogate reviewers, commit what is under review and run `git worktree add --detach ${TMPDIR:-/tmp}/pstack/<repo>/<run>/review-<sha> <sha>`. The brief names that path and the SHA, and the round's read-only lanes read only there, because your own worktree keeps changing while they work. Remove it after you synthesize the round. A read-only lane reads code, diffs, and the evidence a writing lane produced. It does not build or run the app unless its brief asks for that.
- **A Shipping verifier checks the final head.** Start it only after every lane that can move the PR head has returned: a no-comments lane that commits, a fix round, and a trail review whose flags you will act on. A verifier that starts earlier gets cancelled or superseded when the head moves.
- **Evidence outlives worktrees.** Write the decision log, verification output, review prompts, and child reports under `${PSTACK_STORE:-$HOME/.pstack/store}/<repo-name>/<run>/`, never inside a worktree. That directory is show-me-your-work's "work dir". `git worktree remove` deletes ignored files, and `gh pr merge --delete-branch` removes the worktree that holds the merged branch. A project verification skill that writes evidence inside the checkout (`build/`, `work/`) still applies. Copy this run's evidence from it into the work dir before the reply or the trail cites it. Never copy build outputs such as `DerivedData`, `target/`, or `node_modules/`, or evidence from other runs.
- **Cleanup removes only what the root made.** When the user asks to clean up, remove the worktrees the root added with `git worktree add` and its scratch files outside the work dir. Keep each child's worktree, which belongs to the child's thread, and keep the work dir, which holds the evidence the trail and the PR cite.
- **The user picks the root's workspace.** The user starts a thread in a worktree from the T3 UI. The root works in the checkout its thread is in and never moves it. If the root sits on `main` and the task writes, it creates a branch there with `git switch -c <branch>`. Never call `t3_worktree_handoff`. It detaches the provider session, and the queued continuation can wait for minutes or never start.
- **Upstream's capacity numbers assume cloud VMs.** Cap in-flight writing lanes at what this machine runs. Give each live lane its own ports and data directories per the project's verification skill. If the app cannot run side by side, run those lanes in sequence. A push that runs a pre-push gate waits while a lane drives the shared VM, simulator, or app.
- **Separate top-level threads** come only from an explicit user request for them. Then use `t3_thread_launch` with a `workspaceStrategy`. A launched thread is not a task: follow it with `t3_thread_read` or `t3_thread_wait`, never `task_status`, and it does not wake you when it ends.
- **Listing worktrees.** `t3_worktree_status` reports only your own thread. To audit every worktree, use `t3_worktree_list`, `t3_thread_list`, and `t3_thread_read` per thread for its `worktreePath`. `t3_thread_list` also returns each thread's linked PRs and their state in `pullRequests`, so the audit needs no `list_thread_pull_requests` call per thread. Add `git worktree list` for detached worktrees, which `t3_worktree_list` omits.

## Pull requests, watching, and loops

**Only the root thread owns a PR in T3.** T3 hides `watch_pull_request` and `unwatch_pull_request` from a delegated child.

- **Opening a PR.** T3 has no PR-creation tool, so the skills' "no built-in PR tool" branch applies: create it with the resolved forge (`gh` or `origin`), ready for review, never draft. The root calls `link_pull_request` for every PR, each stack layer included. A child that opens a PR returns its URL and head SHA, and the root links it.
- **A merged dependency PR can end the run.** T3 settles a thread at a turn end once every PR linked to it has merged. Settling ends the session and kills its background commands, such as a push through a pre-push gate. A run that merges a dependency PR in another repo before it opens its own PR is exposed. Open and link the run's own PR before the dependency PR merges. If the dependency merged first, call `unlink_pull_request` on it before you end a turn that still waits on work, and link it again after the run's own PR is linked.
- **Review guides.** When the root hands PRs to the user for review or merge, it reads each with `read_pull_request_guide`. Then it calls `write_pull_request_guides` once for every PR whose guide is missing or `stale`. A run takes minutes, so do not wait for it. The user reads the guide in the PR's Guide tab. Pass each PR as `repository` and `number`, because the `url` form can fail to find the project's checkout. A PR whose outcome is `failed`, for example because guides are off in T3's Source Control settings, gets no guide. Give its `detail` in the reply and go on.
- **A PR owner (autopilot, orchestrate, multi-phase plans)** is a role, not a long-lived agent. Each owner round (build, fix, merge) is a fresh `delegate_task` in that PR's worktree. The round does its work, reports the PR URL, head SHA, and state, and returns. The root decides and delegates the next round.
- **Babysit inside a child.** A child told to babysit does one `check` pass, fixes what it can, and returns the PR state. It never arms a watch.
- **`/loop` around a PR.** This covers babysit drive and background, shipping, the orchestrate frontier, and autonomous-run events. The root calls `watch_pull_request` and ends the turn. T3 wakes it on checks, reviews, and conflicts. On each wake, take the verdict from `<pstack-root>/skills/poteto-mode/scripts/watch-pr/watch-pr --status-only --pr <number>`, run in the PR's checkout (or the playbook's `origin` or `gh pr view` read), act, and keep the watch armed across push waves. Call `unwatch_pull_request` before handing back to the user. `scripts/watch-pr` stays the verdict oracle.
- **`/loop` on a fixed cadence** (`/loop 1h`, audit ticks, heartbeats). The root calls `schedule_task` with `{type: "interval", everyMs: 3600000}` bound to its own thread, reports `nextRunAt`, and calls `delete_scheduled_task` when the run closes. Schedule from the root, because a child's schedule posts into the child's thread.
- **`/loop until X`** with no outside event: keep iterating within the run. Add a schedule only when the work must survive turn ends.
- **Events a PR watch cannot see.** T3 refuses to watch a PR that is already merged, and it cannot watch a ref, a branch without a PR, or a post-merge CI run. For these (the orchestrate retro watcher, an autonomous run waiting on a ref) and for a heartbeat fallback, the root calls `schedule_task` with an interval bound to its own thread. The prompt states the check and the exit condition. Call `delete_scheduled_task` once the condition holds.
- **Long shell commands on Claude.** Run a long command, such as a gate, a test suite, or a build, with `run_in_background` and end the turn. Its exit wakes you, and so does each delegated task that finishes. Before you end the turn, pass the task ID that Claude Code shows when the command starts to `t3_background_wait`. The thread then stays in the user's Working list instead of their inbox, T3 does not settle it while the command runs, and a T3 restart that kills the command wakes you with a note. Mark only a command whose result you will act on, never a dev server or a watcher you leave running. Do not wait in a foreground loop while children run, because a child's completion can stay queued until your turn ends. A command you start with `run_in_background` already wakes you when it exits, so do not add a waiter loop for it. Use an `until [ -s x.exit ]` loop, itself run with `run_in_background`, only for an exit file that a process you did not start that way writes. A foreground call stops at 600000 ms whatever its `timeout`. The pstack hook blocks a foreground `until` or `while` loop that sleeps.
- **Long shell commands on Codex.** Never end a turn that waits only on a background shell command. It dies when the user settles the thread or the session ends, and then nothing wakes you. Write the reply first. Report what is still pending as a next step.
- **Stacks.** `list_thread_pull_requests` reports linked PRs and their stack chains.

## History and transcripts

- **Current chat.** `t3_thread_read` with your thread id (`view: "activity"` lists tool calls and files read). This replaces `agent-transcripts/` paths and "the chat UUID". `currentThreadId` in a `t3_thread_list` result is your thread id. A child that reads this run's transcript, such as show-me-your-work's cross-model reviewer, gets that thread id and reads it with `t3_thread_read`. Never pass it a JSONL path.
- **Earlier chats** (recall, reflect, session pickup, show-me-your-work audits). Use `t3_thread_search` and `t3_thread_list` in this project only. `t3_thread_search` returns title, branch, and PR matches first. A message match needs every query word of three or more characters and carries `source` (`user` or `assistant`), a `snippet`, and `messageCreatedAt`, so pick threads from the snippets before you read them. Message matches fill at most a fifth of `limit`, so pass `limit: 50`, the maximum, when you look for message content. Search skips subagent threads. Pass thread ids to children, not file paths. Read a long thread in pages of `limit: 20` with `maxCharsPerItem: 2000`, and recover a long item with `itemId` and `textOffset`. Larger pages overflow the tool output. On Codex, such a page still prints about 60,000 characters and the exec output keeps about 40,000, so never print a raw `t3_thread_read` result. Keep it in a variable and print what you need, such as each item's `position`, `type`, and first 300 characters. Cite a thread by the `link` a thread tool returned, verbatim. Without one, write `[title](t3-thread://v1/<threadId>)`.
- **Messages from other threads.** A `t3_thread_read` item with `senderThreadId` is a message that thread sent with `t3_thread_send`, such as a parent's follow-up. The user did not type it, so do not read it as the user's words.
- **Shell fallback.** `~/.claude/projects/<encoded-cwd>/*.jsonl` (Claude) and `~/.codex/sessions/**/*.jsonl` (Codex).
- **Pinned and active chats** ("from the user or the sidebar") are threads with `t3_thread_list` status not settled.

## Locations

- **Project skill** (a generated verification skill or `.cursor/skills/<name>/`, for example). Write `.claude/skills/<name>/` and symlink `.agents/skills/<name>` to it. Claude reads only `.claude/skills`, and Codex reads `.agents/skills`.
- **User skill** (`~/.cursor/skills/<name>/`). Write to `~/.claude/skills/` and `~/.agents/skills/`.
- **`.cursor/rules`.** Read `CLAUDE.md` and `AGENTS.md`, plus any `.cursor/rules` the repo still has.
- **"The current agent's store", "the root agent's store", "the agent store"** (orchestrate, autopilot-full, and multi-phase plans). Use `${PSTACK_STORE:-$HOME/.pstack/store}/<repo-name>/`. No system prompt names it, so each brief that writes there names the full path. Export `ORCH_STORE` to it for `scripts/orch`. Never write it inside the checkout.
- **"MCPs from the Cursor environment" and `mcps/`.** Group your tools by MCP server name.

## Questions and the user

- **`AskQuestion`.** On Claude, use `AskUserQuestion`. On Codex, use `request_user_input` only when the session exposes it and allows it in the current mode (Codex limits it to plan mode). Otherwise ask one plain-text question with labeled options.
- **A delegated child never asks the user.** It returns `BLOCKED` with the question, and the root asks. A child that asks anyway waits, and `t3_thread_read` on its `childThreadId` shows a nonzero `pendingRequestCount`. Find the question with `t3_pending_request_list` and answer it with `t3_pending_request_respond`, both with `threadId` set to the child's `childThreadId`. Answer it yourself when the brief or the run settles it. Otherwise ask the user and pass on the answer.
- **Visuals** (charts, tables, mockups, Cursor's `/visualize`). Build a self-contained page, check it with `html_preview`, then publish it with `html_render` from the root. A child's render lands in the child's thread. Show verification screenshots the same way, for example a before and after grid, before the reply that cites them. A reader who clicks an image outside a link or button opens it full size in T3's image viewer, so a grid can show screenshots small. Write each image as one complete absolute path, in `src` or as a JavaScript string. T3 does not inline a path the page builds from parts. T3 inlines local images into the page, so the thread keeps them after the worktree is gone. To embed a screenshot or a video in the reply itself, as `/ketchup` asks, write it as a Markdown image whose target is the file's absolute path. T3 renders both. Keep that file in the work dir (Worktrees section), so it outlives the worktree. A Mermaid fence in the reply renders as a diagram. A generated image needs an image tool from your provider. T3 has none, so without one draw a diagram or chart instead.

## Cursor products with no counterpart

- **Custom Mode, Option+Enter.** None. Start a task with `/pstack:poteto-mode` (Claude) or `$pstack:poteto-mode` (Codex). On Claude, T3's composer also offers pstack's skills in its `$` picker when the plugin is enabled in Claude Code, and sends the pick as `/pstack:<name>`.
- **Cursor's built-in `/babysit` and `/autopilot` PR watchers.** Not present. The Babysit playbook is the only PR watcher. The Autopilot playbooks are pstack's own, not this built-in.
- **Plan Mode.** T3 interaction mode `plan`.
- **Automations** (`automations/benny`). A webhook or fixed-time `schedule_task`. Get webhook signing secrets with `request_secret`. Put the trigger's conditions in the webhook schedule's `filters`, so other requests never start a run. For benny, `body.event.channel` equals the source channel. A path segment ending in `[]` checks each element of an array. `{path: "body.issue.labels[].name", op: "equals", value: "<label>"}` matches a GitHub issue that has that label, and `notEquals` matches only when no element has the value. Set `dedupe.replayKey` to the sender's delivery id, `{{body.event_id}}` for Slack or `{{headers.x-github-delivery}}` for GitHub, so a retried delivery does not run twice. When a sender fires bursts about one subject, such as pushes to one PR, set `dedupe.coalesceKey` to that subject. Deliveries with the same key within `coalesceWindowSeconds` (default 120, counted from the first) become one run on the latest payload. Never key it on something distinct events share, such as the channel.
- **Grok Bot** (`/make-bot-ui`). None. The skill ships unchanged but has nothing to wake under T3.
- **A Cursor restart.** T3 keeps threads, delegated tasks, and queues across restarts. Re-read each recorded child with `t3_thread_read`. Read `t3_thread_list`, whose `pullRequests` lists each thread's PRs, then reattach by PR and branch.

## The todolist

On Claude, T3 exposes no todo tool. Keep poteto-mode's todolist as `todo.md` in the work dir (Worktrees section). Copy the playbook's steps in as poteto-mode says, mark each one done or `skip: <reason>`, and update the file as you work. Read it again after a context compaction and before the final reply.

## Tool names on Codex

The skills name Claude tools. On Codex, `Read`, `Grep`, and `Glob` are shell commands (`cat`, `rg`, `find`). T3 tools are `tools.mcp__t3_code__<name>` inside exec. Call them without probing first. A check for a tool prints `ALL_TOOLS.map(t => t.name)`, never the tool objects, which print 15,000 to 40,000 characters. Edits use `apply_patch`, and the todolist is `update_plan`.

## Local shell

Upstream's commands assume a Linux cloud VM. Under T3 they run on the user's machine, often macOS with zsh, so check `uname` and `$SHELL` before you write shell.

- macOS has no `timeout`. Bound a command with `perl -e 'alarm shift; exec @ARGV' <seconds> <command>`, which exits 142 on expiry.
- zsh does not split an unquoted `$var` into words. Use `${=var}` or an array.
- zsh expands a word that starts with `=` to a command path. `echo =====` fails with `==== not found` and drops the rest of the line. Quote separators (`echo '====='`), or read each file with its own Read call.
- zsh fails a statement with `no matches found` when an unquoted glob in it matches nothing, such as `grep --include=*.rs` or `cat dir/*.exit`. A `&&` chain stops there. The call can still exit 0, so an empty result may hide the error. Quote the glob (`--include='*.rs'`) or use `rg -g '*.rs'`. On Claude in `bypassPermissions` mode, the pstack hook runs a command that holds an unquoted glob or `=` word with `setopt nonomatch; unsetopt equals` in front, so both behave as in bash. In other modes Claude Code refuses `setopt`, so the hook blocks an unquoted `--option=*glob` and an unquoted run of `=` instead.

## A broken mapping

If a mapping here is wrong or missing, say so in the reply and fix this file in its own PR to the t3-pstack repository. Do not edit an upstream skill to work around it.
