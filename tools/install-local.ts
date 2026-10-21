import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ROOT } from "./lib.ts";

// Sessions read the installed plugin cache, so a merged release does nothing until this runs.
function run(cmd: string[]) {
  const r = Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit" });
  if (r.exitCode !== 0) {
    console.error(`install-local: ${cmd.join(" ")} exited ${r.exitCode}`);
    process.exit(1);
  }
}

run(["git", "-C", ROOT, "fetch", "-q", "origin", "main"]);
const want = JSON.parse(Bun.spawnSync(["git", "-C", ROOT, "show", "origin/main:package.json"]).stdout.toString()).version;

run(["claude", "plugin", "marketplace", "update", "t3-pstack"]);
run(["claude", "plugin", "update", "pstack@t3-pstack"]);
run(["codex", "plugin", "marketplace", "upgrade", "t3-pstack"]);

const claude = JSON.parse(readFileSync(join(homedir(), ".claude/plugins/installed_plugins.json"), "utf8"))
  .plugins["pstack@t3-pstack"]?.[0]?.version;
const codex = existsSync(join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "plugins/cache/t3-pstack/pstack", want));
if (claude !== want || !codex) {
  console.error(`install-local: origin/main is ${want}, Claude has ${claude}, Codex cache ${codex ? "has" : "lacks"} it.`);
  process.exit(1);
}
console.log(`installed ${want} for Claude and Codex`);
