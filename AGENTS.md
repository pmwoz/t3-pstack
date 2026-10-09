# t3-pstack

Cursor's pstack skill pack, shipped for T3 Code (Claude and Codex). Read README.md for the design.

## Rules

- Never edit `upstream/` or `t3/contract/` by hand. `bun run sync` and `bun run t3:pin` write them.
- Change the plugin under `plugins/pstack/`, then record the reason in `drift.json`. Prefer a change to `skills/poteto-mode/references/t3-adapter.md` over a change to an upstream file. Every drifted upstream file can conflict on the next sync.
- A backticked T3 tool name in this port's text must exist in `t3/contract/`. `bun run check` enforces it.
- Before every commit, run `bun run check`, `bun test tools`, and `bun run typecheck`.
- A release bumps the version with `bun run version <x.y.z>`. Claude Code and Codex cache plugins by version.
- Maintenance (upstream sync, T3 contract updates) follows `.claude/skills/maintain-t3-pstack/SKILL.md`.
- Everything written to a file, commit, or GitHub is in English.
