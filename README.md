# t3-pstack

[pstack](https://github.com/cursor/plugins/tree/main/pstack) is Lauren Tan's skill pack for rigorous agent work: `poteto-mode`, its playbooks, the principles, and workflow skills such as `architect`, `arena`, and `interrogate`. It is written for Cursor. t3-pstack ships it for [T3 Code](https://github.com/pingdotgg/t3code), for both the Claude and the Codex provider, and tracks upstream closely.

- The skills stay as upstream wrote them. Nine files differ, and each one has its reason in [`drift.json`](drift.json).
- One file, [`t3-adapter.md`](plugins/pstack/skills/poteto-mode/references/t3-adapter.md), maps Cursor mechanics to T3. Subagents become `delegate_task` lanes, so a panel can mix Claude and Codex models. `/loop` becomes a PR watch or a scheduled task. Cloud agents become local worktrees.
- Tooling checks the drift, merges new upstream commits, and reports changes to T3's orchestration contract.

## Install

Install for each provider you use in T3 Code, then start a new thread.

```sh
# Claude
claude plugin marketplace add pmwoz/t3-pstack
claude plugin install pstack@t3-pstack

# Codex
codex plugin marketplace add pmwoz/t3-pstack
codex plugin add pstack@t3-pstack
```

Then run `/pstack:setup-pstack` (Claude) or `$pstack:setup-pstack` (Codex). It reads the models T3 offers, asks for a reasoning budget, and writes `~/.agents/pstack-models.md`, one model per role.

Start a task with `/pstack:poteto-mode` (Claude) or `$pstack:poteto-mode` (Codex), a goal, and a check that can pass or fail. `/pstack:poteto-help` answers questions about pstack.

If you use another pstack port, disable it first. Both register `pstack:*` skills.

```sh
claude plugin disable pstack@<other-marketplace>
```

## Update

```sh
claude plugin marketplace update t3-pstack && claude plugin update pstack@t3-pstack
codex plugin marketplace upgrade t3-pstack
```

## How it stays close to upstream

The plugin in `plugins/pstack` is a function of three inputs:

1. `upstream/` holds a verbatim snapshot of the upstream files the plugin ships, at the commit pinned in [`pins.json`](pins.json).
2. A mechanical transform in [`tools/lib.ts`](tools/lib.ts) rewrites each skill's frontmatter `name` to its directory name. Codex names a skill by that field, and upstream's `poteto-mode` says `Poteto Mode`.
3. Drift: every other difference, declared with a reason in `drift.json`.

`bun run check` rebuilds the expected tree from the first two and fails on any difference that `drift.json` does not declare. It also fails on a stale drift entry, a broken relative link, a lost executable bit, mismatched manifest versions, and a T3 tool name in this port's text that the pinned T3 contract does not define.

Upstream marks every skill but `setup-pstack` with `disable-model-invocation: true`, so they start only when typed. The port keeps that flag. Claude refuses a Skill tool call to such a skill, so pstack skills start each other by reading `SKILL.md` by path, as they do in Cursor. A Claude session-start hook gives the agent the plugin path. In a test with the flag and that rule, Claude loaded the `how` skill by path in 3 of 3 runs.

## Maintain

| Command | What it does |
|---|---|
| `bun run watch` | Lists upstream commits and T3 contract commits since the pins, and T3 tools added or removed. Read-only. |
| `bun run sync [ref]` | Three-way merges upstream at `ref` (default `main`) into `plugins/pstack`, then replaces `upstream/` and moves the pin. Exits 2 on conflicts. |
| `bun run t3:pin [ref]` | Snapshots the T3 contract files at `ref` into `t3/contract/` and moves the pin. |
| `bun run check` | The drift gate described above. CI runs it. |
| `bun run version <x.y.z>` | Sets the version in all four manifests. Claude and Codex cache plugins by version, so bump it on every release. |
| `bun test tools` | Tests for the transform, the merge decisions, the drift check, and tool-name extraction. |

The [`maintain-t3-pstack`](.claude/skills/maintain-t3-pstack/SKILL.md) project skill runs the whole loop: watch, sync, adapter review, T3 contract update, and a PR per concern. The PR body lists new T3 features worth adopting. A T3 scheduled task runs it twice a week.

To change a skill, edit it under `plugins/pstack`, add its reason to `drift.json`, and run `bun run check`. Prefer a change to the adapter over a change to an upstream file, because every drifted file can conflict on the next sync.

## Layout

| Path | Contents |
|---|---|
| `plugins/pstack/` | The plugin both marketplaces install. |
| `upstream/` | Verbatim upstream snapshot. Written only by `bun run sync`. |
| `t3/contract/` | T3 tool definitions and injected agent instructions at the T3 pin. Written only by `bun run t3:pin`. |
| `pins.json` | The upstream and T3 pins, and the upstream-to-plugin path map. |
| `drift.json` | Each plugin file that differs from upstream, with the reason. |
| `tools/` | The check, sync, watch, pin, and version tools. |
| `.claude-plugin/`, `.agents/plugins/` | The Claude and Codex marketplace manifests. |

## Credits

pstack is by Lauren Tan, MIT licensed. `deslop`, `control-cli`, and `control-ui` come from Cursor's `cursor-team-kit`, MIT licensed. See [NOTICE.md](NOTICE.md). The port's own files are MIT licensed, see [LICENSE](LICENSE).
