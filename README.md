# t3-pstack

[pstack](https://github.com/cursor/plugins/tree/main/pstack) is Lauren Tan's set of agent skills for Cursor: `poteto-mode` for everyday work, plus skills for design, review, parallel work, and explaining code.

t3-pstack is the same skill pack as a plugin for [T3 Code](https://github.com/pingdotgg/t3code). It works with both the Claude and the Codex provider, and this repo merges each new upstream version.

## Install

If you already use another pstack port, disable it first. Both register `pstack:*` skills.

```sh
claude plugin disable pstack@<other-marketplace>
```

Then install the plugin for each provider you use in T3 Code.

1. Add the marketplace and install the plugin.

   ```sh
   # Claude
   claude plugin marketplace add pmwoz/t3-pstack
   claude plugin install pstack@t3-pstack

   # Codex
   codex plugin marketplace add pmwoz/t3-pstack
   codex plugin add pstack@t3-pstack
   ```

2. On Codex, run `codex` once in a terminal and trust the pstack hook at the startup prompt, or later with `/hooks`. Codex runs the hook only after you trust it. Until then, the line that step 4 adds to your Codex `AGENTS.md` still points the agent at the T3 adapter.
3. Start a new thread in T3 Code.
4. Pick your models. Type `/pstack:setup-pstack` (Claude) or `$pstack:setup-pstack` (Codex). It reads the models T3 offers, asks for a reasoning budget, and writes `~/.agents/pstack-models.md` with one model per role. Both providers read that file. Run it again to change your models.

## Start a task

Type `/pstack:poteto-mode` (Claude) or `$pstack:poteto-mode` (Codex), then the goal and a check that can pass or fail. The check tells the agent when the work is done.

```text
/pstack:poteto-mode Fix the timezone bug in the date parser. Done when bun test passes.
```

Every skill starts the same way, with `/pstack:<name>` on Claude or `$pstack:<name>` on Codex. Most skills start only when you type them. The agent can start `setup-pstack`, `deslop`, `control-cli`, and `control-ui` on its own, and skills start other skills during a task.

For questions about pstack, such as which skill fits a task, type `/pstack:poteto-help` (Claude) or `$pstack:poteto-help` (Codex) followed by the question.

## Skills to try first

| Skill | What it does |
|---|---|
| `poteto-mode` | Short answers, subagents where they help, simple code, and verified results. Start each new task with it. |
| `architect` | Sketches types, signatures, and module layout before writing code. |
| `arena` | Runs several attempts at one task in parallel, picks the best, and merges in the strongest parts of the others. |
| `interrogate` | Has reviewers on different models challenge a change and look for blind spots. |
| `how` | Explains how a piece of code works and where new code belongs. |
| `why` | Explains why code is the way it is, from source control, issues, docs, and anything else your MCP servers reach. |
| `swarm` | Splits work across parallel workers and returns one report. |
| `recall` | Rebuilds what you were working on from your chat history, your PRs and branches, and past bug reports and fixes. |

The full list is in [`plugins/pstack/skills`](plugins/pstack/skills). The `principle-*` skills hold the principles that `poteto-mode` applies.

## What changes under T3 Code

The skills are written for Cursor. One file, [`t3-adapter.md`](plugins/pstack/skills/poteto-mode/references/t3-adapter.md), tells the agent how each Cursor feature maps to T3 Code.

- A subagent runs as a T3 child task (`delegate_task`). Each child picks its own provider and model, so one review panel can mix Claude and Codex.
- `/loop` around a pull request becomes a T3 PR watch. `/loop` on a fixed interval becomes a T3 scheduled task.
- Cursor cloud agents become local child tasks. A child that writes code gets its own git worktree.

Everything else stays as upstream wrote it. [`drift.json`](drift.json) lists every file that differs from upstream, with the reason.

## Update

```sh
# Claude
claude plugin marketplace update t3-pstack && claude plugin update pstack@t3-pstack

# Codex
codex plugin marketplace upgrade t3-pstack
```

## Develop

This section is for work on the port itself.

### How the port stays close to upstream

`upstream/` holds an exact copy of the upstream files at the commit pinned in [`pins.json`](pins.json). The plugin in `plugins/pstack/` is that copy plus two kinds of change.

1. A mechanical transform in [`tools/lib.ts`](tools/lib.ts). It sets each skill's frontmatter `name` to its directory name, because Codex names a skill by that field and upstream's `poteto-mode` says `Poteto Mode`. It also adds `agents/openai.yaml` with `allow_implicit_invocation: false` next to each skill that upstream marks `disable-model-invocation: true`. Codex ignores the upstream flag and reads this file instead.
2. Drift, meaning every other difference. Each drifted file has its reason in `drift.json`.

Claude refuses a Skill tool call to a skill marked `disable-model-invocation: true`. So pstack skills start each other by reading `SKILL.md` by path, as they do in Cursor. A session-start hook gives the agent the plugin path.

`bun run check` rebuilds the expected plugin from `upstream/` and the transform, then fails on any difference that `drift.json` does not list. It also fails on a stale drift entry, a broken relative link, a lost executable bit, mismatched manifest versions, and a T3 tool name in the port's own text that the pinned T3 contract does not define. CI runs it.

### Commands

| Command | What it does |
|---|---|
| `bun run watch` | Lists upstream commits and T3 contract commits since the pins, changed or added T3 contract files, and added or removed T3 tools. Read-only. |
| `bun run sync [ref]` | Three-way merges upstream at `ref` (default `main`) into `plugins/pstack`, then replaces `upstream/` and moves the pin. Exits with code 2 on conflicts. |
| `bun run t3:pin [ref]` | Copies the T3 contract files at `ref` into `t3/contract/` and moves the pin. |
| `bun run check` | Runs the drift check described above. |
| `bun run version <x.y.z>` | Sets the version in all four manifests. Claude and Codex cache plugins by version, so bump it on every release. |
| `bun test tools` | Tests the transform, the merge decisions, the drift check, and tool-name extraction. |

### Change a skill

1. Edit the file under `plugins/pstack/`.
2. Add the reason to `drift.json`.
3. Run `bun run check`, `bun test tools`, and `bun run typecheck`.

Prefer a change to `t3-adapter.md` over a change to an upstream file. Every drifted file can conflict on the next sync.

### Maintenance

The [`maintain-t3-pstack`](.claude/skills/maintain-t3-pstack/SKILL.md) project skill runs the whole loop: watch, sync, adapter review, T3 contract update, and one PR per concern. The PR body lists new T3 features worth adopting. A T3 scheduled task runs it daily.

### Layout

| Path | Contents |
|---|---|
| `plugins/pstack/` | The plugin both marketplaces install. |
| `upstream/` | Exact copy of upstream. Only `bun run sync` writes it. |
| `t3/contract/` | T3 tool definitions and injected agent instructions at the T3 pin. Only `bun run t3:pin` writes it. |
| `pins.json` | The upstream and T3 pins, and the map from upstream paths to plugin paths. |
| `drift.json` | Each plugin file that differs from upstream, with the reason. |
| `tools/` | The check, sync, watch, pin, and version tools. |
| `.claude-plugin/`, `.agents/plugins/` | The Claude and Codex marketplace manifests. |

## Credits

pstack is by Lauren Tan, MIT licensed. `deslop`, `control-cli`, and `control-ui` come from Cursor's `cursor-team-kit`, MIT licensed. See [NOTICE.md](NOTICE.md). The port's own files are MIT licensed, see [LICENSE](LICENSE).
