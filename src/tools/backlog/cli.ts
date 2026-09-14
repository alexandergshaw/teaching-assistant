// Command-line entry point. Every subcommand is USABLE BY HAND (Ruling BA-5:
// "the scripts are built and gated FIRST... nothing depends on the hook").
// Run via the npm scripts in package.json (backlog:render,
// backlog:check-generated, backlog:next, backlog:wave), or directly with:
//   node --experimental-strip-types --experimental-default-type=module \
//     --experimental-loader ./src/tools/backlog/resolve-ts-hook.ts \
//     src/tools/backlog/cli.ts <command>
// The --experimental-loader flag is what lets this file's extensionless
// `from "./yaml-codec"` imports resolve at all when run directly by node -
// see resolve-ts-hook.ts's own header for why that is a separate file
// instead of a tsconfig change.
//
// `dispatch` is the pure, testable core: it takes argv plus injected
// dependencies and returns a {exitCode, output} pair rather than touching
// process.exit/console directly, so cli.test.ts can exercise every branch
// without spawning a real subprocess for each one. `main` is the thin,
// untested (by design - it is I/O wiring, not logic) shell that calls it for
// real.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { BacklogItem } from "./types";
import { parseBacklogYaml } from "./yaml-codec";
import { renderBacklogMarkdown } from "./render";
import { checkGeneratedText } from "./check-generated";
import { decideStopGuard } from "./stop-guard";
import { selectNext } from "./next";
import { selectWave } from "./wave";
import { findDuplicateIds } from "./ids";

export interface Dispatched {
  exitCode: number;
  output: string;
}

export interface CliDeps {
  readYaml: () => string;
  readMarkdown: () => string;
}

function requireDuplicateFree(items: BacklogItem[]): string | null {
  const dupes = findDuplicateIds(items);
  if (dupes.length === 0) return null;
  return (
    "docs/backlog.yml has duplicate ids, which breaks every downstream selector (Ruling BA-4): " +
    dupes.map((d) => `${d.id} appears ${String(d.count)} times`).join(", ")
  );
}

export function dispatch(argv: string[], deps: CliDeps): Dispatched {
  const command = argv[0];

  if (command === "render") {
    const items = parseBacklogYaml(deps.readYaml());
    const dupError = requireDuplicateFree(items);
    if (dupError) return { exitCode: 1, output: dupError };
    return { exitCode: 0, output: renderBacklogMarkdown(items) };
  }

  if (command === "check-generated") {
    const result = checkGeneratedText(deps.readYaml(), deps.readMarkdown());
    return { exitCode: result.ok ? 0 : 1, output: result.message };
  }

  // The Stop guard (src/tools/backlog/stop-guard.ts). Exit 2 with the reason
  // on stderr is the shape a blocking hook uses; exit 0 allows the stop.
  //
  // UNVERIFIED AS A GATE: nothing here has observed a real hook invocation
  // consuming this exit code. Until the owner confirms a block is actually
  // taken, treat a passing stop-guard run as "the DECISION is right", never as
  // "the session was stopped from ending". `backlog-automation.md` B1 is the
  // reason for that caution: a hook that silently never fires is worse than
  // its absence, because its presence is taken as proof.
  if (command === "stop-guard") {
    const items = parseBacklogYaml(deps.readYaml());
    const dupError = requireDuplicateFree(items);
    if (dupError) return { exitCode: 1, output: dupError };
    const decision = decideStopGuard({
      items,
      stopHookActive: argv.includes("--stop-hook-active"),
      overrideRequested: argv.includes("--override"),
    });
    if (decision.decision === "block") {
      return { exitCode: 2, output: decision.reason };
    }
    return { exitCode: 0, output: `stop allowed: ${decision.reason}` };
  }

  if (command === "next") {
    const items = parseBacklogYaml(deps.readYaml());
    const dupError = requireDuplicateFree(items);
    if (dupError) return { exitCode: 1, output: dupError };
    const result = selectNext(items);
    if (result.type === "actionable") {
      return {
        exitCode: 0,
        output: `${result.item.id}: ${result.item.title}\nowns: ${result.item.owns.join(", ")}\nverify: ${result.item.verify ?? ""}`,
      };
    }
    if (result.type === "unscoped") {
      return {
        exitCode: 2,
        output: `unscoped: ${String(result.count)} item(s) lack owns/verify and cannot be selected. Scope one before running next again.`,
      };
    }
    return { exitCode: 3, output: `empty: ${result.reason}` };
  }

  if (command === "wave") {
    const items = parseBacklogYaml(deps.readYaml());
    const dupError = requireDuplicateFree(items);
    if (dupError) return { exitCode: 1, output: dupError };
    const result = selectWave(items);
    if (result.type === "wave") {
      return {
        exitCode: 0,
        output: result.items.map((i) => `${i.id}: ${i.title} (owns: ${i.owns.join(", ")})`).join("\n"),
      };
    }
    return { exitCode: 3, output: `insufficient: ${result.reason}` };
  }

  return {
    exitCode: 64,
    output: `unknown command "${command ?? ""}". Expected one of: render, check-generated, next, wave, stop-guard.`,
  };
}

function realDeps(): CliDeps {
  const root = process.cwd();
  return {
    readYaml: () => readFileSync(resolve(root, "docs/backlog.yml"), "utf-8"),
    readMarkdown: () => readFileSync(resolve(root, "docs/BACKLOG.md"), "utf-8"),
  };
}

/**
 * A Stop hook receives its payload as JSON on STDIN, and `stop_hook_active`
 * is the flag that stops a blocking hook from looping forever. Reading it
 * from argv only (as an earlier draft of this file did) would leave the
 * loop-prevention permanently off while LOOKING wired - which is
 * backlog-automation.md B1 exactly. Best-effort and defensive: no stdin, bad
 * JSON, or a missing field all mean "not active", which is the safe default
 * (it blocks once, then the flag arrives on the retry).
 */
function stopHookActiveFromStdin(): boolean {
  try {
    // If stdin is a TTY there is no piped payload and readFileSync(0) would
    // BLOCK FOREVER waiting for input - which would hang every session at
    // the stop, the worst possible failure for a guard meant to be
    // invisible when it allows. Measured: running the command by hand
    // without a pipe hung until it was killed.
    if (process.stdin.isTTY) return false;
    const raw = readFileSync(0, "utf-8").trim();
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return false;
    return (parsed as { stop_hook_active?: unknown }).stop_hook_active === true;
  } catch {
    return false;
  }
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv[0] === "stop-guard" && stopHookActiveFromStdin()) {
    argv.push("--stop-hook-active");
  }
  const result = dispatch(argv, realDeps());
  // `render`'s output is a full file (renderBacklogMarkdown already ends it
  // with exactly one newline) meant to be redirected straight into
  // docs/BACKLOG.md; every other command's output is a short human-readable
  // line. Only pad the latter, so `npm run backlog:render > docs/BACKLOG.md`
  // reproduces check-generated's expected bytes exactly.
  const text = result.output.endsWith("\n") ? result.output : `${result.output}\n`;
  // A blocking stop-guard decision goes to STDERR, because that is where a
  // hook surfaces its reason back to the agent; everything else stays on
  // stdout so `render` can still be redirected into the generated file.
  if (result.exitCode === 2 && process.argv[2] === "stop-guard") {
    process.stderr.write(text);
  } else {
    process.stdout.write(text);
  }
  process.exitCode = result.exitCode;
}

// Only run as a side-effecting CLI when this file is the process entry point
// - importing it (from cli.test.ts, or from another module) must never run
// main() or touch the real filesystem.
const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  main();
}
