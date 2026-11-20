---
name: setup-pstack
description: Configure which models pstack uses per role and at what reasoning budget. Detects your available models and writes an always-applied rule that overrides the skill defaults. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack

Write `~/.agents/pstack-models.md`, the sheet that sets pstack's model per role. Agents read it each time a pstack skill starts a subagent, per the [T3 adapter](../poteto-mode/references/t3-adapter.md). Both Claude and Codex read the same file.

## Steps

### 1. Detect available models

Call `orchestrator_capabilities`. Its providers with `canRunChildTask: true` and their models are the dependable source: these are the targets `delegate_task` accepts. It lists a short set of models per provider and leaves out legacy ones. For a model on the current sheet (step 2) that is not listed, call it again with `search` set to that model. A real value is a descriptor `<providerInstanceId>:<model id>@<effort>`, such as `claudeAgent:claude-opus-5-5@xhigh` or `codex:gpt-6.1-sol@xhigh`, where the effort is one of the `values` of the model's effort option (`effort` on Claude, `reasoningEffort` on Codex). A model with no effort option takes `<providerInstanceId>:<model id>` with no effort. Never write a descriptor whose provider, model, or effort the catalog does not list. The aliases `inherit-parent` and `auto` are always valid even though they are not detected descriptors.

### 2. Load current state

The default role-to-model mapping is the sheet shape shown in step 5 below. It is upstream's default mapping translated per the adapter's Model per role section for a catalog without Gemini. When the catalog has an `antigravity` instance that can run child tasks and lists a Gemini model, use its Gemini 4 Neon model, else its newest Gemini model, wherever step 5 shows `codex:gpt-6.1-sol`. If `~/.agents/pstack-models.md` already exists, read it and treat its `# budget` line and its role values as the current choices. If only `~/.claude/pstack-models.md` exists, from an earlier pstack port, read that one and resolve its short forms (`claude:opus@high`) to exact descriptors. Otherwise start from those defaults. A line whose role is not in step 5, such as `hardest tasks`, `architect runners`, `reflect tooling`, or `why investigators`, is from a retired role. Drop it.

Older defaults put another Gemini model, then Gemini 4 Neon at `high`, in the panel seat, and a catalog without Gemini put `codex:gpt-6.1-sol@high` there. So in a panel role (`arena runners`, `arena cross-judge pool`, `interrogate reviewers`), an `antigravity` Gemini 4 Neon entry at `high` and a `codex:gpt-6.1-sol@high` entry are old defaults, and each becomes the same model at `xhigh`. An `antigravity` entry whose model is a `gemini-4-*` id other than a Gemini 4 Neon id is an old default too. When the catalog lists a Gemini 4 Neon model on that instance, it becomes that model at `xhigh`. A Gemini 4 Neon or `codex:gpt-6.1-sol` entry at any other level is the user's choice and stays. Tell the user which entries you replaced.

A sheet without the `# defaults: 3` line comes from an older setup. That setup wrote a line for every role, so some of its values are old defaults, not choices. Before step 3, replace these values:

- An `arena cross-judge pool` list of exactly one `claudeAgent:claude-fable-*` entry, one `claudeAgent:claude-opus-*` entry, and one `codex:gpt-6.1-sol` or Gemini entry, in any order, takes the role's step 5 list. Fable and Opus are one vendor, so the Fable entry could judge only where the Opus entry also could.
- A `# budget: unlimited` line becomes `large`, because no role runs above `xhigh`.
- If the sheet has no `# defaults: 2` line either, an old value is a `codex:gpt-6.1-sol` descriptor or a descriptor on a `grok` instance, at any effort. An old value in `feature, refactoring`, `bug-fix`, `perf-issue`, `hillclimb`, or `swarm workers` takes the role's step 5 default. In a panel role (`arena runners`, `arena cross-judge pool`, `interrogate reviewers`), a list of exactly one `claudeAgent:claude-opus-*` entry and one old value, in either order, takes the role's step 5 list. In any other list, each `grok` entry becomes `claudeAgent:claude-opus-5-5@high`, and a `codex:gpt-6.1-sol` entry stays, because the step 5 panels still hold it.

Every other value is the user's choice and stays, including an old value in any other role and every `inherit-parent` or `auto` value. Tell the user which values you replaced.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Prefer a structured question (the adapter's Questions section) over free text. Offer these three options with these exact labels, and name the current budget when the rule records one. With no rule, say that `large` matches the skill defaults.

- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

**(b) Apply it.** Build the working table from the skill defaults, and on a re-run keep any role you changed by family, list, or alias (`inherit-parent`, `auto`). Families are the ones Phase A of the **arena** skill defines, so Fable is its own family. Each role has a target effort, which is its default's effort moved by the budget. `large` keeps it, `medium` lowers it one step, and `small` lowers it two steps, on the ladder `xhigh` > `high` > `medium` > `low`. No role runs above `xhigh`, and a target at the bottom of the ladder stays there. Most defaults are at `xhigh`, and each budget label names where those land. Set the effort of every real descriptor in the role, panel entries included, to the role's target. The effort is the part after `@`. Catalog efforts above `xhigh`, such as `max`, `ultra`, or `ultrathink`, are never picked. If the model does not offer the target effort, use its highest offered effort at or below the target, else mark the role as needing a choice. A descriptor with no effort stays as it is. `inherit-parent` and `auto` do not change. So `medium` turns `claudeAgent:claude-opus-5-5@xhigh` into `claudeAgent:claude-opus-5-5@high` and `claudeAgent:claude-opus-5-5@high` into `claudeAgent:claude-opus-5-5@medium`, and `small` turns them into `@medium` and `@low`. A Gemini 4 Neon entry in a panel role, or the `codex:gpt-6.1-sol` entry that holds the Gemini seat without Gemini, takes its own target, `xhigh` moved by the budget, so `large` keeps `@xhigh`, `medium` writes `@high`, and `small` writes `@medium`. A descriptor names no speed. The adapter's Model per role section sets it.

**(c) Show the roles and confirm.** Show every role with its model, marking any real descriptor not in the detected set as needing a choice. Also list each line step 2 dropped. Ask whether to accept as-is or change specific roles, offering the detected models at `xhigh` or below plus `inherit-parent` and `auto` (both mean: this role runs on the parent chat model) as the options. Prefer a structured question over free text. For panel roles (arena runners, interrogate reviewers) the value is a list, and one subagent runs per entry, alias entries included, so the list length sets the count. `arena cross-judge pool` is also a list, but Arena runs one judge. It tries only values from a vendor other than the parent's, in list order, so order it by preference. Fable and the other Claude models are one vendor. An `inherit-parent` or `auto` value never judges. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.

### 4. Validate

Every real descriptor written must be in the detected set: its provider can run child tasks, its model is listed under that provider or found with `search`, and its effort is one of the `values` of that model's effort option and at `xhigh` or below, or absent when the model has no effort option. `inherit-parent` and `auto` always pass. If a chosen descriptor is not available, stop and ask again.

### 5. Write the sheet

Write `~/.agents/pstack-models.md` with the `# defaults: 3` line, a `# budget` line with the chosen label and the effort that label names, and one line per role, using the same labels poteto-mode uses. Overwrite the whole file so re-runs stay idempotent. Shape, with the upstream defaults translated for a catalog without Gemini:

```
# pstack model configuration. One line per role. Delete a line to fall back to the skill default.
# A value is <providerInstanceId>:<model id>@<effort>, resolved against orchestrator_capabilities.
# `inherit-parent` or `auto` as a value: the role runs on the parent chat model (omit the delegate_task target). Alias entries in a panel list still count toward its fan-out.
# defaults: 3
# budget: large (xhigh)
feature, refactoring: claudeAgent:claude-opus-5-5@xhigh
bug-fix: claudeAgent:claude-opus-5-5@xhigh
perf-issue: claudeAgent:claude-opus-5-5@xhigh
hillclimb: claudeAgent:claude-opus-5-5@xhigh
judgment and prose: claudeAgent:claude-opus-5-5@xhigh
arena runners: claudeAgent:claude-fable-5-2@high, claudeAgent:claude-opus-5-5@high, codex:gpt-6.1-sol@xhigh
arena cross-judge pool: claudeAgent:claude-opus-5-5@high, codex:gpt-6.1-sol@xhigh
swarm workers: claudeAgent:claude-opus-5-5@high
interrogate reviewers: claudeAgent:claude-fable-5-2@high, claudeAgent:claude-opus-5-5@high, codex:gpt-6.1-sol@xhigh
```

Codex runs the plugin's session-start hook only after the user trusts it, so point Codex at the adapter once anyway. If `${CODEX_HOME:-$HOME/.codex}/AGENTS.md` has no line naming `t3-adapter.md`, append this line to it: "pstack under T3 Code: before a pstack skill starts a subagent or another skill, read `references/t3-adapter.md` in the installed pstack plugin's `poteto-mode` skill." Tell a Codex user to trust the pstack hook once, by running `codex` in a terminal and approving it at the startup prompt or with `/hooks`. Claude needs no edit, because the plugin's session-start hook names the adapter.

### 6. Confirm

Tell the user the sheet was written and that the next subagent a pstack skill starts reads it. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, invoke `/create-verification-skill` (resolves wherever pstack is installed: workspace, user, or plugin). On no, move on without pushing.

### 8. Offer a formal verification skill (optional)

Check whether the project already has a formal verification skill (a project skill that runs a model checker, a proof, or another verifier against the code). If not, offer once: "want a formal verification skill, so agents can prove a key property of your code holds in every case in scope, not only the cases tests reach? I can generate one with /create-formal-verification-skill." On yes, invoke `/create-formal-verification-skill` (resolves wherever pstack is installed: workspace, user, or plugin). On no, move on without pushing.
