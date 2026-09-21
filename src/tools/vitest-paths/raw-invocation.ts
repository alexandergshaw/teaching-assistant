// Detects raw multi-path vitest invocations in text (docs, agent definitions,
// package.json script values, YAML workflow files) and in source files that
// spawn a child process (via callCommands, over the string literals inside a
// spawn/exec call). This is the STATIC half of L14: it finds commands that
// COULD silently drop an argument (paths-gate.ts, decide) - it never runs
// anything.
//
// Ported from the measured prototype `arch-l14/detect2.mjs` (L14 revision 1,
// docs/l14-scope.md section 2.1), which reproduced every spelling that
// reaches `vitest run` (docs/l14-scope.md 1.7) and was proven against a
// 40-case canary table (raw-invocation.test.ts) before this port, including
// 16 cases proven able to fail by flipping their expectations.
//
// The scan is intentionally conservative in one direction only: it credits a
// "hit" (a command with two or more path-shaped arguments) rather than trying
// to prove a command is safe. A command this misses is a residual
// (docs/l14-scope.md R7); a command this over-reports is a false positive
// that a canary row exists to catch (the QUIET cases in raw-invocation.test.ts).

export type CommandFamily = "vitest" | "npm-vitest" | "wrapper";

export interface TestCommand {
  line: number;
  family: CommandFamily;
  paths: string[];
  norm: string;
}

const BACKSLASH = String.fromCharCode(92);
const BACKTICK = String.fromCharCode(96);
const FENCE = BACKTICK + BACKTICK + BACKTICK;

// Flags that consume the following token as their value, so that value is
// never mistaken for a path argument (and, for `-t`/`--testNamePattern`, so
// an unquoted multi-word filter does not leak later words into the scan -
// the scan already stops at the first non-flag, non-path token, but a
// value-flag must still skip exactly one token even when that token happens
// to be path-shaped, e.g. `--outputFile.json=a/b.json`).
const VALUE_FLAGS = new Set([
  "-t",
  "--testNamePattern",
  "--reporter",
  "--outputFile",
  "--project",
  "--dir",
  "--root",
  "-r",
  "--config",
  "-c",
  "--testTimeout",
  "--pool",
  "--shard",
  "--bail",
  "--exclude",
  "--workspace",
  "--environment",
  "--maxWorkers",
  "--minWorkers",
  "--retry",
  "--mode",
]);

const SUBCOMMANDS = new Set(["run", "watch", "dev", "related", "bench", "list"]);

// Fires on `vitest` (optionally after npx/pnpm/yarn), on `npm t|test|run|run-script`,
// or on a path ending `cli.ts` (the wrapper's direct-node form) - used only to
// decide whether a logical line needs continuation-joining before scanning.
const TRIGGER = /(?:^|[\s`'"(\[])(?:npx\s+|pnpm\s+|yarn\s+)?vitest\b|\bnpm\s+(?:t|test|run|run-script)\b|cli\.ts\b/;

function countBackticks(s: string): number {
  let n = 0;
  for (const c of s) if (c === BACKTICK) n++;
  return n;
}

function indentOf(s: string): number {
  return s.length - s.trimStart().length;
}

// A token counts as a path if it contains a forward slash (and is not just
// slashes), contains a backslash (other than a lone continuation backslash),
// or ends in `.test.ts`/`.test.tsx`.
function pathShaped(v: string): boolean {
  return (v.includes("/") && !/^\/+$/.test(v)) || (v.includes(BACKSLASH) && v !== BACKSLASH) || /\.test\.tsx?$/.test(v);
}

function onlyArgsLine(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  return t.split(/\s+/).every((w) => pathShaped(w.replace(/`$/, "")) || w.startsWith("-") || w === BACKSLASH);
}

interface LogicalLine {
  text: string;
  line: number;
}

/**
 * Builds logical lines out of physical ones before any command scanning:
 * shell (` \`) and PowerShell (` ` `` `) continuations join; a YAML block
 * scalar (`key: >` / `key: |`, with optional chomping) joins its
 * more-indented body; an open inline code span (an odd number of backticks)
 * joins following lines, stripping a leading `//`, `*`, `#` or `>`; and a
 * command line followed by more-indented argument-only lines joins them (a
 * fenced command whose paths sit on the next lines).
 */
export function logicalLines(text: string): LogicalLine[] {
  const phys = text.split("\n").map((l) => l.replace(/\r$/, ""));

  // 1. shell / PowerShell continuations
  const joined: LogicalLine[] = [];
  let buf: string | null = null;
  let start = 0;
  phys.forEach((ln, i) => {
    const cont = ln.endsWith(` ${BACKSLASH}`) || ln.endsWith(` ${BACKTICK}`);
    const body = cont ? ln.slice(0, -1) : ln;
    if (buf === null) {
      buf = body;
      start = i + 1;
    } else {
      buf += ` ${body.trim()}`;
    }
    if (!cont) {
      joined.push({ text: buf, line: start });
      buf = null;
    }
  });
  if (buf !== null) joined.push({ text: buf, line: start });

  // 2. YAML block scalars join their more-indented body
  const withYaml: LogicalLine[] = [];
  for (let k = 0; k < joined.length; k++) {
    const t = joined[k].text;
    if (/:\s*[>|][-+]?\s*$/.test(t)) {
      const base = indentOf(t);
      const body: string[] = [];
      while (k + 1 < joined.length && (joined[k + 1].text.trim() === "" || indentOf(joined[k + 1].text) > base)) {
        k++;
        if (joined[k].text.trim()) body.push(joined[k].text.trim());
      }
      const lineNo = body.length > 0 && joined[k - body.length] ? joined[k - body.length].line : joined[k].line;
      withYaml.push({ text: `${t.replace(/[>|][-+]?\s*$/, "")} ${body.join(" ")}`, line: lineNo });
      continue;
    }
    withYaml.push(joined[k]);
  }

  // 3. an open inline code span joins following lines; 4. a command line
  // joins following more-indented argument-only lines.
  const result: LogicalLine[] = [];
  let inFence = false;
  for (let k = 0; k < withYaml.length; k++) {
    let t = withYaml[k].text;
    const line = withYaml[k].line;
    if (t.trimStart().startsWith(FENCE)) {
      inFence = !inFence;
      result.push(withYaml[k]);
      continue;
    }
    if (TRIGGER.test(t)) {
      let extra = 0;
      while (
        !inFence &&
        countBackticks(t) % 2 === 1 &&
        extra < 6 &&
        k + 1 < withYaml.length &&
        !withYaml[k + 1].text.trimStart().startsWith(FENCE)
      ) {
        k++;
        extra++;
        t += ` ${withYaml[k].text.trim().replace(/^(\/\/+|\*|#+|>)\s*/, "")}`;
      }
      while (k + 1 < withYaml.length && indentOf(withYaml[k + 1].text) > indentOf(t) && onlyArgsLine(withYaml[k + 1].text)) {
        k++;
        t += ` ${withYaml[k].text.trim()}`;
      }
    }
    result.push({ text: t, line });
  }
  return result;
}

function tokenize(s: string): string[] {
  const toks: string[] = [];
  const STOP = new Set([BACKTICK, "|", ";", "&", "<", ">", ")", "]", ","]);
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    if (STOP.has(ch)) break;
    if (ch === '"' || ch === "'") {
      const j = s.indexOf(ch, i + 1);
      if (j < 0) break;
      toks.push(s.slice(i + 1, j));
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < s.length && !STOP.has(s[j]) && s[j] !== " " && s[j] !== "\t" && s[j] !== '"' && s[j] !== "'") j++;
    toks.push(s.slice(i, j));
    i = j;
  }
  return toks;
}

/**
 * Scans arguments after a command keyword, stopping at the first token that
 * is neither a flag, a flag's consumed value, nor path-shaped. That stop
 * rule is deliberate: it is what keeps prose written after a real command
 * (`... and then src/b.test.ts was read by hand`), and an unquoted
 * multi-word `-t` filter name, from being scanned as further arguments.
 */
function scanArgs(toks: readonly string[]): string[] {
  const paths: string[] = [];
  for (let k = 0; k < toks.length; k++) {
    const v = toks[k];
    if (v === "--") continue;
    if (v.startsWith("-")) {
      if (VALUE_FLAGS.has(v)) k++;
      continue;
    }
    if (pathShaped(v)) {
      paths.push(v.replace(/\.$/, ""));
      continue;
    }
    break;
  }
  return paths;
}

/**
 * Finds every command in `text` that reaches `vitest run` (directly, via
 * `npx`/`pnpm`/`yarn`, or via an `npm` script whose value starts with
 * `vitest`), plus the wrapper (`npm run test:paths`, or a path ending
 * `vitest-paths/cli.ts`). `vitestScripts` is the set of npm script names
 * whose value starts with `vitest` (read from `package.json`, not
 * hard-coded, so a new script is covered without editing this file).
 */
export function findTestCommands(text: string, vitestScripts: readonly string[]): TestCommand[] {
  const hits: { line: number; family: CommandFamily; paths: string[] }[] = [];
  for (const { text: ln, line } of logicalLines(text)) {
    let m: RegExpExecArray | null;
    const vre = /(?:^|[\s`'"(\[])(?:npx\s+|pnpm\s+|yarn\s+)?vitest\b/g;
    while ((m = vre.exec(ln))) {
      let toks = tokenize(ln.slice(m.index + m[0].length));
      if (toks.length && SUBCOMMANDS.has(toks[0])) toks = toks.slice(1);
      else if (toks.length && !toks[0].startsWith("-") && !pathShaped(toks[0])) continue; // prose: "vitest runs ..."
      hits.push({ line, family: "vitest", paths: scanArgs(toks) });
    }
    const npmScriptRe = /\bnpm\s+(t|test|run|run-script)\b/g;
    while ((m = npmScriptRe.exec(ln))) {
      const toks = tokenize(ln.slice(m.index + m[0].length));
      let script = "test";
      if (m[1] === "run" || m[1] === "run-script") {
        script = toks.shift() ?? "";
      }
      if (script === "test:paths") hits.push({ line, family: "wrapper", paths: scanArgs(toks) });
      else if (vitestScripts.includes(script)) hits.push({ line, family: "npm-vitest", paths: scanArgs(toks) });
    }
    const cre = /vitest-paths\/cli\.ts\b/g;
    while ((m = cre.exec(ln))) hits.push({ line, family: "wrapper", paths: scanArgs(tokenize(ln.slice(m.index + m[0].length))) });
  }
  return hits.map((h) => ({ ...h, norm: `${h.family}: ${h.paths.join(" ")}` }));
}

/**
 * For source files: takes every `spawn`, `spawnSync`, `exec`, `execSync`,
 * `execFile`, `execFileSync` and `fork` call, collects the string literals
 * inside its parentheses in order, joins them with spaces, and scans the
 * result - so `spawnSync("npx", ["vitest", "run", "a", "b"])` is seen as the
 * command it is. `line` is the 1-based line of the call itself, not of any
 * joined logical line inside the reconstructed command text.
 */
export function callCommands(source: string, vitestScripts: readonly string[]): TestCommand[] {
  const out: TestCommand[] = [];
  const re = /\b(spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < source.length && depth > 0) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")") depth--;
      i++;
    }
    const body = source.slice(re.lastIndex, i - 1);
    const lits = [...body.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g)].map((x) => x[1] ?? x[2] ?? x[3] ?? "");
    const line = source.slice(0, m.index).split("\n").length;
    for (const h of findTestCommands(lits.join(" "), vitestScripts)) out.push({ ...h, line });
  }
  return out;
}
