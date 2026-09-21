// Pure logic for the `test:paths` wrapper (docs/l14-scope.md section 4.1).
// No fs, no child_process - every function here takes what it needs as an
// argument or a callback, so cli.test.ts and paths-gate.test.ts can exercise
// every branch without touching disk or spawning a process.
//
// The core fix this module exists for (docs/l14-scope.md section 0, item 4):
// vitest's own multi-filter match is a UNION with no per-filter accounting
// (`filterFiles`'s `.some()`, node_modules/vitest/dist/chunks/cli-api.*.js) -
// a missing, misspelled, or merely-nonexistent-for-tests argument sitting
// next to one real match is silently dropped and the run still exits 0. That
// rule is used ONLY to decide what vitest RUNS (`vitestArgv` below, then
// vitest's own substring filter). Coverage - whether an argument's OWN tests
// ran and passed - is decided here, by equality/containment on the resolved
// path, never by vitest's substring rule. A file collected only because some
// OTHER argument's substring matched it (a "rider") credits nothing.

import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

export type PathKind = "file" | "dir";

export type PreCheck = { ok: true; kinds: ReadonlyMap<string, PathKind> } | { ok: false; problems: string[] };

/**
 * Refuses anything that is not a real, existing path before vitest ever
 * spawns: an argument starting with `-` (flags are not accepted - the
 * `--json` trap of docs/l14-scope.md 1.6 started with an optional-value flag
 * swallowing the next positional), a bare substring filter (it may not
 * resolve to anything on disk), and an empty argument list.
 */
export function preCheckArgs(args: readonly string[], probe: (p: string) => PathKind | null): PreCheck {
  const problems: string[] = [];
  const kinds = new Map<string, PathKind>();
  if (args.length === 0) problems.push("no paths given");
  for (const a of args) {
    if (a.startsWith("-")) {
      problems.push(`flag not accepted: ${a}`);
      continue;
    }
    const kind = probe(a);
    if (kind === null) {
      problems.push(`does not exist on disk: ${a}`);
      continue;
    }
    kinds.set(a, kind);
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, kinds };
}

export interface ExecutedFile {
  /** resolved, repo-relative, forward-slash-separated, lower-cased on win32 */
  relPath: string;
  passed: number;
}

function normalizeRelPath(root: string, p: string): string {
  const abs = resolve(root, p);
  let rel = relative(root, abs).split("\\").join("/");
  if (process.platform === "win32") rel = rel.toLowerCase();
  return rel;
}

/**
 * Reads vitest's `--reporter=json` report (docs/l14-scope.md 1.4: each
 * `testResults[i]` carries `name` - absolute, forward slashes - and
 * `assertionResults[]` with `status`; `numTotalTestSuites` is NOT a file
 * count and is never used here). Returns null - never throws - when the
 * report is missing or is not in that measured shape, so every caller fails
 * closed on a malformed report instead of crediting nothing as everything.
 */
export function executedFilesFromReport(report: unknown, root: string): ExecutedFile[] | null {
  if (typeof report !== "object" || report === null) return null;
  const testResults = (report as { testResults?: unknown }).testResults;
  if (!Array.isArray(testResults)) return null;
  const files: ExecutedFile[] = [];
  for (const entry of testResults) {
    if (typeof entry !== "object" || entry === null) return null;
    const name = (entry as { name?: unknown }).name;
    const assertionResults = (entry as { assertionResults?: unknown }).assertionResults;
    if (typeof name !== "string" || !Array.isArray(assertionResults)) return null;
    let passed = 0;
    for (const assertion of assertionResults) {
      if (typeof assertion !== "object" || assertion === null) return null;
      if ((assertion as { status?: unknown }).status === "passed") passed++;
    }
    files.push({ relPath: normalizeRelPath(root, name), passed });
  }
  return files;
}

/**
 * EQUAL for a file argument, INSIDE (a strict path-segment prefix, never a
 * bare string prefix - `src/tools/backlog-foo/x.test.ts` does NOT credit the
 * argument `src/tools/backlog`) for a directory argument. Never vitest's own
 * substring rule.
 */
export function creditsArg(file: ExecutedFile, arg: string, kind: PathKind, root: string): boolean {
  const argRel = normalizeRelPath(root, arg);
  if (kind === "file") return file.relPath === argRel;
  return file.relPath === argRel || file.relPath.startsWith(`${argRel}/`);
}

export interface PathCoverage {
  arg: string;
  files: number;
  passed: number;
  covered: boolean;
}

/**
 * An argument is COVERED only if it is credited at least one executed file
 * AND those credited files report at least one passed assertion between them
 * (the B4 rule of `src/tools/backlog/closure-runner.ts:37-43` - "all
 * skipped" is not a pass - applied per argument rather than to a whole run).
 */
export function coverageOf(
  args: readonly string[],
  kinds: ReadonlyMap<string, PathKind>,
  files: readonly ExecutedFile[],
  root: string
): PathCoverage[] {
  return args.map((arg) => {
    const kind = kinds.get(arg);
    if (kind === undefined) return { arg, files: 0, passed: 0, covered: false };
    const credited = files.filter((f) => creditsArg(f, arg, kind, root));
    const passed = credited.reduce((sum, f) => sum + f.passed, 0);
    return { arg, files: credited.length, passed, covered: credited.length > 0 && passed > 0 };
  });
}

export interface GateDecision {
  exitCode: number;
  lines: string[];
}

/**
 * `vitestExit` is `null` when vitest's own process was killed by a signal
 * rather than exiting - treated as exit 1, never 0, so a killed child cannot
 * read as a pass. A non-zero exit is propagated as-is without reading the
 * report at all (a report from a run that itself exited non-zero is not
 * trustworthy evidence of coverage either way).
 */
export function decide(
  args: readonly string[],
  kinds: ReadonlyMap<string, PathKind>,
  vitestExit: number | null,
  report: unknown,
  root: string
): GateDecision {
  if (vitestExit === null) {
    return { exitCode: 1, lines: ["vitest was killed by a signal (null exit code)"] };
  }
  if (vitestExit !== 0) {
    return { exitCode: vitestExit, lines: [`vitest exited ${String(vitestExit)}`] };
  }
  const files = executedFilesFromReport(report, root);
  if (files === null) {
    return { exitCode: 1, lines: ["FAIL CLOSED: no report, or the report is not in the measured shape"] };
  }
  const coverage = coverageOf(args, kinds, files, root);
  const lines = coverage.map(
    (c) => `${c.covered ? "COVERED" : "NOT COVERED"} ${c.arg} files=${String(c.files)} passed=${String(c.passed)}`
  );
  const anyUncovered = coverage.some((c) => !c.covered);
  return { exitCode: anyUncovered ? 1 : 0, lines };
}

/**
 * vitest's own argv. Every flag element (starting with `-`) is in joined
 * `--flag=value` form - never a bare flag followed by a separate value token
 * - because `--json`'s value is OPTIONAL and a following positional (a test
 * file) is silently consumed as the output path and overwritten
 * (docs/l14-scope.md 1.6; it happened to `src/lib/no-emojis.test.ts` during
 * this scope's own measurement). The report path must be built from outside
 * the repository (`os.tmpdir()`, at the call site) for the same reason. The
 * paths are appended last, in the given order, so vitest's own filter
 * behaviour over them is exactly what section 1 measured.
 */
export function vitestArgv(args: readonly string[], reportPath: string): string[] {
  return ["run", "--reporter=default", "--reporter=json", `--outputFile.json=${reportPath}`, ...args];
}

/**
 * The report path production actually uses (`cli.ts`'s `realDeps`): under
 * `os.tmpdir()`, unique per call, and NEVER under `root` (docs/l14-scope.md
 * 1.6 - the trap that overwrote a real test file used a path the caller
 * controlled; putting the report outside the repo removes that entire class
 * regardless of what flag form triggers it). `pid`/`uid` make it unique per
 * concurrent call without needing to inspect the filesystem first.
 */
export function defaultReportPath(pid: number, uid: string): string {
  return join(tmpdir(), `l14-test-paths-${String(pid)}-${uid}.json`);
}
