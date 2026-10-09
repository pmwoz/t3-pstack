---
name: setup-pstack
description: Configure which models pstack uses per role and at what reasoning budget. Detects your available models and writes an always-applied rule that overrides the skill defaults. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack

Write `~/.agents/pstack-models.md`, the sheet that sets pstack's model per role. Agents read it each time a pstack skill starts a subagent, per the [T3 adapter](../poteto-mode/references/t3-adapter.md). Both Claude and Codex read the same file.

## Steps

### 1. Detect available models

Call `orchestrator_capabilities`. Its providers with `canRunChildTask: true` and their models are the dependable source: these are the targets `delegate_task` accepts. A real value is a descriptor `<providerInstanceId>:<model id>@<effort>`, such as `claudeAgent:claude-opus-5-5@xhigh` or `codex:gpt-6.1-sol@xhigh`, where the effort is one of the model's "Reasoning" option ids. Never write a descriptor whose provider, model, or effort the catalog does not list. The aliases `inherit-parent` and `auto` are always valid even though they are not detected descriptors.

### 2. Load current state

The default role-to-model mapping is the sheet shape shown in step 5 below. It is upstream's default mapping translated per the adapter's Model per role section for a catalog without Grok. When the catalog has a `grok` instance that can run child tasks, use it wherever step 5 shows `codex:gpt-6.1-sol`. If `~/.agents/pstack-models.md` already exists, read it and treat its `# budget` line and its role values as the current choices. If only `~/.claude/pstack-models.md` exists, from an earlier pstack port, read that one and resolve its short forms (`claude:opus@high`) to exact descriptors. Otherwise start from those defaults. A line whose role is not in step 5, such as `how critics`, is from a retired role. Drop it.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Prefer a structured question (the adapter's Questions section) over free text. Offer these four options with these exact labels, and name the current budget when the rule records one. With no rule, say that `large` matches the skill defaults.

- `unlimited — max reasoning`
- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

**(b) Apply it.** Build the working table from the skill defaults, and on a re-run keep any role you changed by family, list, or alias (`inherit-parent`, `auto`). `unlimited`, `large`, `medium`, and `small` set the effort of every real descriptor, panel entries included, to `max`, `xhigh`, `high`, or `medium`. The effort is the part after `@`, on the ladder `max` > `xhigh` > `high` > `medium` > `low`. Effort ids above `max` in the catalog, such as `ultra`, `ultracode`, or `ultrathink`, are never picked by a budget. If the model does not offer the target effort, use its highest offered effort at or below the target, else mark the role as needing a choice. `inherit-parent` and `auto` do not change. So `unlimited` turns `claudeAgent:claude-opus-5-5@xhigh` into `claudeAgent:claude-opus-5-5@max`. `large` keeps the defaults. `small` turns them into `@medium`.

**(c) Show the roles and confirm.** Show every role with its model, marking any real descriptor not in the detected set as needing a choice. Also list each line step 2 dropped. Ask whether to accept as-is or change specific roles, offering the detected models plus `inherit-parent` and `auto` (both mean: this role runs on the parent chat model) as the options. Prefer a structured question over free text. For panel roles (arena runners, architect runners, interrogate reviewers) the value is a list, and one subagent runs per entry, alias entries included, so the list length sets the count. `arena cross-judge pool` is also a list, but Arena selects one value from it whose provider differs from the parent's when possible. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.

### 4. Validate

Every real descriptor written must be in the detected set: its provider can run child tasks, its model is listed under that provider, and its effort is one of that model's Reasoning option ids. `inherit-parent` and `auto` always pass. If a chosen descriptor is not available, stop and ask again.

### 5. Write the sheet

Write `~/.agents/pstack-models.md` with a `# budget` line with the chosen label and its target effort, and one line per role, using the same labels poteto-mode uses. Overwrite the whole file so re-runs stay idempotent. Shape, with the upstream defaults translated for a catalog without Grok:

```
# pstack model configuration. One line per role. Delete a line to fall back to the skill default.
# A value is <providerInstanceId>:<model id>@<effort>, resolved against orchestrator_capabilities.
# `inherit-parent` or `auto` as a value: the role runs on the parent chat model (omit the delegate_task target). Alias entries in a panel list still count toward its fan-out.
# budget: large (xhigh)
feature, refactoring: codex:gpt-6.1-sol@xhigh
bug-fix: codex:gpt-6.1-sol@xhigh
perf-issue: codex:gpt-6.1-sol@xhigh
hillclimb: codex:gpt-6.1-sol@xhigh
judgment and prose: claudeAgent:claude-opus-5-5@xhigh
hardest tasks: claudeAgent:claude-opus-5-5@xhigh
how explorer: codex:gpt-6.1-sol@xhigh
how explainer: claudeAgent:claude-opus-5-5@xhigh
why investigators: codex:gpt-6.1-sol@xhigh
why synthesizer: claudeAgent:claude-opus-5-5@xhigh
reflect tooling: codex:gpt-6.1-sol@xhigh
reflect judgment, divergent, synthesizer: claudeAgent:claude-opus-5-5@xhigh
arena runners: claudeAgent:claude-opus-5-5@xhigh, codex:gpt-6.1-sol@xhigh
arena cross-judge pool: claudeAgent:claude-opus-5-5@xhigh, codex:gpt-6.1-sol@xhigh
swarm workers: codex:gpt-6.1-sol@xhigh
architect runners: claudeAgent:claude-opus-5-5@xhigh, codex:gpt-6.1-sol@xhigh
interrogate reviewers: claudeAgent:claude-opus-5-5@xhigh, codex:gpt-6.1-sol@xhigh
```

Codex has no plugin hooks, so point Codex at the adapter once. If `${CODEX_HOME:-$HOME/.codex}/AGENTS.md` has no line naming `t3-adapter.md`, append this line to it: "pstack under T3 Code: before a pstack skill starts a subagent or another skill, read `references/t3-adapter.md` in the installed pstack plugin's `poteto-mode` skill." Claude needs no edit, because the plugin's session-start hook names the adapter.

### 6. Confirm

Tell the user the sheet was written and that the next subagent a pstack skill starts reads it. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, invoke `/create-verification-skill` (resolves wherever pstack is installed: workspace, user, or plugin). On no, move on without pushing.
