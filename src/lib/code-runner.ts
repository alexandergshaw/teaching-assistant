// Runs untrusted student code through an external sandbox and reports whether
// it ran cleanly. Piston (https://emkc.org/api/v2/piston) is tried first; its
// public /execute endpoint went whitelist-only on 2026-02-15, so auth and
// rate-limit failures fall back to the keyless Wandbox API
// (https://wandbox.org/api). Execution is always external—never in-process—and
// is network-dependent, so this module is not part of the deterministic
// grading engine.
//
// The decision logic (which files get sent, under what names, which one is
// the entry point, and what the overall time/output budget is) lives in the
// pure, unit-tested ./code-run-selection module. This file owns only the
// network calls: resolving a runtime version, calling Piston, and falling
// back to Wandbox.

import {
  selectCodeRunFiles,
  languageForExtension,
  describeCodeRunSkip,
  capOutput,
  isStdinEofFailure,
  sourceLooksLikeItReadsStdin,
  CODE_RUN_TIMEOUT_MS,
  CODE_RUN_OUTPUT_CAP_CHARS,
  type CodeRunCandidate,
  type CodeRunSkip,
  type CodeRunSelectionFile,
} from "./code-run-selection";

export { languageForExtension, CODE_RUN_TIMEOUT_MS, CODE_RUN_OUTPUT_CAP_CHARS };

/** One source file to execute. Shape is owned by ./code-run-selection - kept
 * as a named alias here so every existing caller/import of `CodeFileInput`
 * from this module keeps working unchanged. */
export type CodeFileInput = CodeRunCandidate;

/** The outcome of running one student's code. */
export interface CodeRunResult {
  /** Piston language that was run (e.g. "python", "c++"). */
  language: string;
  /** Names of the files sent to the runner. */
  files: string[];
  /** Basename of the file execution started from (see code-run-selection.ts's
   * chooseEntryPoint) - lets a caller display "ran main.py" rather than just
   * a file list. Undefined only when nothing was runnable (this function
   * returns null in that case, so callers never see it undefined otherwise). */
  entryPoint?: string;
  /** True when it compiled (if applicable) and exited 0. */
  ran: boolean;
  /** Process exit code, or null when unknown / not reached. */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Compiler stage output, when the language has a compile step. */
  compileOutput?: string;
  /** Set when execution could not be attempted (e.g. network error, or the
   * timeout below). Non-fatal. */
  error?: string;
  /** True when `ran` is false SOLELY because this run's hardcoded empty
   * stdin (see the module doc comment above) starved a required input read
   * - detected via isStdinEofFailure (code-run-selection.ts), which now
   * requires BOTH a stderr signature AND source-level proof the program
   * reads from stdin (not just a file/other stream that happens to raise
   * the same exception): Python's EOFError (input()) gated on `input(`/
   * `sys.stdin` in the source, Java's Scanner-sourced
   * NoSuchElementException gated on the source constructing a Scanner over
   * System.in, and Python's sys.stdin.read()/readline()/readlines() parsed
   * or indexed directly on the same source line (already self-proving from
   * stderr alone). Distinct from `error`: this run DID
   * execute (real stdout/stderr exist), it just failed for a reason that
   * has nothing to do with the student's code, so callers must treat it as
   * a third, NEUTRAL outcome - excluded from scoring, not zeroed - rather
   * than folding it into either `ran: true` or a genuine `ran: false`
   * failure. See gradeEntriesEmbedded (embedded-grader/index.ts) and
   * gradeSubmission (grade/engine.ts), which both gate on this exactly like
   * `error` already. */
  neededStdin?: boolean;
  /** True when `ran` is true, the language is one this repo has verified
   * fails SILENTLY at EOF (c/c++ - see sourceLooksLikeItReadsStdin's own doc
   * comment), and the submitted source appears to read from stdin. The
   * process really did exit 0, so this never changes whether the run counts
   * as clean - it only tells a grading-prompt builder that `stdout`/`stderr`
   * may reflect an unset/garbage variable rather than real program
   * behavior, since this sandbox never gave the program any input to read. */
  stdinReadSuspected?: boolean;
  /** True when `error` is set BECAUSE this run hit CODE_RUN_TIMEOUT_MS,
   * rather than failing on its own - a normal, expected outcome for a slow
   * or unreachable runner under the fixed budget Vercel Hobby's 60s ceiling
   * requires (see code-run-selection.ts), never a bug to fix by retrying. */
  timedOut?: boolean;
  /** Candidate files that were excluded before anything was sent to the
   * runner, and why (a truncated preview slice, or a basename collision with
   * another file already claimed for this run) - see
   * code-run-selection.ts's mapSubmittedFilesForExecution. Undefined when
   * nothing was excluded. */
  filesExcluded?: Array<{ name: string; reason: string }>;
}

const FALLBACK_VERSIONS: Record<string, string> = {
  python: "3.10.0",
  typescript: "5.0.3",
  java: "15.0.2",
  c: "10.2.0",
  "c++": "10.2.0",
  javascript: "18.15.0",
};

const PISTON_URL =
  process.env.PISTON_API_URL?.trim().replace(/\/+$/, "") || "https://emkc.org/api/v2/piston";

// Optional API key sent as the Authorization header. emkc.org issues keys; self-hosted
// Piston instances may also require one. No "Bearer" prefix—send the bare token.
const PISTON_KEY = process.env.PISTON_API_KEY?.trim() || "";

const WANDBOX_URL =
  process.env.WANDBOX_API_URL?.trim().replace(/\/+$/, "") || "https://wandbox.org/api";

// Wandbox language names (list.json) per Piston language.
const WANDBOX_LANGUAGES: Record<string, string> = {
  python: "Python",
  typescript: "TypeScript",
  javascript: "JavaScript",
  java: "Java",
  c: "C",
  "c++": "C++",
};

// Known-good Wandbox compiler ids used when list.json is unreachable.
const WANDBOX_FALLBACK_COMPILERS: Record<string, string> = {
  python: "cpython-3.13.8",
  typescript: "typescript-5.6.2",
  javascript: "nodejs-20.17.0",
  java: "openjdk-jdk-22+36",
  c: "gcc-13.2.0-c",
  "c++": "gcc-13.2.0",
};

// Module-level cache for runtimes lookup.
let runtimesCache: Array<{ language: string; version: string; aliases?: string[] }> | null = null;

// Module-level cache for the Wandbox compiler list.
let wandboxCompilersCache: Array<{ name: string; language: string; version?: string }> | null =
  null;

/**
 * Compare two semantic versions by splitting on dots and comparing numeric
 * segments. Returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
function compareVersions(a: string, b: string): number {
  const aParts = a.split(".").map((x) => parseInt(x, 10) || 0);
  const bParts = b.split(".").map((x) => parseInt(x, 10) || 0);
  const len = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const aPart = aParts[i] || 0;
    const bPart = bParts[i] || 0;
    if (aPart < bPart) return -1;
    if (aPart > bPart) return 1;
  }
  return 0;
}

/** True for the DOMException AbortSignal.timeout() raises once its budget
 * elapses (name "TimeoutError"), or a plain abort (name "AbortError") -
 * checked by `.name` rather than `instanceof Error` because DOMException does
 * not extend Error in every runtime this code can run under. */
function isTimeoutError(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

/**
 * Fetch the Piston runtimes list and cache it. Return the version of the
 * runtime matching the language (or highest alias match). Fall back to
 * FALLBACK_VERSIONS if lookup fails (including this call's own share of
 * `signal`'s timeout - a slow/unreachable runtimes endpoint must still let
 * the run proceed against a reasonable guess, per this module's "degrade,
 * never abort" contract).
 */
async function resolveVersion(language: string, signal: AbortSignal): Promise<string> {
  if (!runtimesCache) {
    try {
      const headers: Record<string, string> = {};
      if (PISTON_KEY) {
        headers.Authorization = PISTON_KEY;
      }
      const res = await fetch(`${PISTON_URL}/runtimes`, { headers, signal });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Piston rejected the request (401 unauthorized). Set PISTON_API_KEY (for the public emkc.org API) or point PISTON_API_URL at a self-hosted Piston instance.");
        }
        throw new Error(`Runtimes lookup returned ${res.status}`);
      }
      runtimesCache = (await res.json()) as Array<{
        language: string;
        version: string;
        aliases?: string[];
      }>;
    } catch {
      // Fall through to FALLBACK_VERSIONS
      const fallback = FALLBACK_VERSIONS[language];
      if (!fallback) {
        throw new Error(`No runtime found for language "${language}" and no fallback available`);
      }
      return fallback;
    }
  }

  // Find the best match: exact language match, or highest alias match.
  let best: { language: string; version: string; aliases?: string[] } | null = null;
  let bestIsAlias = false;

  for (const runtime of runtimesCache) {
    if (runtime.language === language) {
      best = runtime;
      bestIsAlias = false;
      break; // Exact match wins immediately
    }
    if (!bestIsAlias && runtime.aliases?.includes(language)) {
      if (!best || compareVersions(runtime.version, best.version) > 0) {
        best = runtime;
        bestIsAlias = true;
      }
    }
  }

  if (best) {
    return best.version;
  }

  // Fall back to hardcoded version.
  const fallback = FALLBACK_VERSIONS[language];
  if (!fallback) {
    throw new Error(`No runtime found for language "${language}" and no fallback available`);
  }
  return fallback;
}

/**
 * Pick a Wandbox compiler for the language: newest stable (non-head) entry in
 * list.json, falling back to a known-good pinned id when the list is
 * unreachable. Throws when the language has no Wandbox mapping at all.
 */
async function resolveWandboxCompiler(language: string, signal: AbortSignal): Promise<string> {
  const wandboxLanguage = WANDBOX_LANGUAGES[language];
  if (!wandboxLanguage) {
    throw new Error(`No fallback runner available for language "${language}".`);
  }
  if (!wandboxCompilersCache) {
    try {
      const res = await fetch(`${WANDBOX_URL}/list.json`, { signal });
      if (res.ok) {
        wandboxCompilersCache = (await res.json()) as Array<{
          name: string;
          language: string;
          version?: string;
        }>;
      }
    } catch {
      // Fall through to the pinned compiler id.
    }
  }
  // Newest stable release by version (not list order), skipping -head builds.
  const stable = (wandboxCompilersCache ?? [])
    .filter((c) => c.language === wandboxLanguage && !c.name.includes("head"))
    .sort((a, b) => compareVersions(b.version ?? "0", a.version ?? "0"))[0];
  return stable?.name || WANDBOX_FALLBACK_COMPILERS[language];
}

interface WandboxResponse {
  status?: string;
  signal?: string;
  compiler_output?: string;
  compiler_error?: string;
  program_output?: string;
  program_error?: string;
}

/**
 * Run files via the Wandbox compile API. Wandbox names its main source file
 * "prog.<ext>", so extra files ride along in codes[] under their real names;
 * Java (where the public class name must match the file name) puts every real
 * file in codes[] and delegates from a tiny shim main class instead.
 */
async function runViaWandbox(
  language: string,
  files: CodeRunSelectionFile[],
  signal: AbortSignal
): Promise<CodeRunResult> {
  const compiler = await resolveWandboxCompiler(language, signal);

  let mainCode: string;
  let extraFiles: CodeRunSelectionFile[];
  if (language === "java") {
    // Only source files can host the entry point (data files ride along too).
    const mainFile =
      files.find(
        (f) => f.name.toLowerCase().endsWith(".java") && /public\s+static\s+void\s+main/.test(f.content)
      ) ?? files[0];
    // Pick the type that owns main(): the type named after the file (the Java
    // convention, and mandatory for public classes), else the first public
    // type, else the first declared type. Interfaces/enums/records can carry a
    // static main too, and nested types must not win over the outer one.
    const fileBase = mainFile.name.replace(/^.*[\\/]/, "").replace(/\.java$/i, "");
    const typeNames = [...mainFile.content.matchAll(/\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    const publicType = mainFile.content.match(/\bpublic\s+(?:final\s+|abstract\s+)?(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/);
    const mainClass = typeNames.includes(fileBase) ? fileBase : publicType?.[1] ?? typeNames[0] ?? null;
    if (!mainClass) {
      throw new Error("Could not find a Java class to run.");
    }
    if (mainClass === "prog") {
      // The student's own entry class already has Wandbox's main-file name.
      mainCode = mainFile.content;
      extraFiles = files.filter((f) => f !== mainFile);
    } else {
      mainCode = `class prog { public static void main(String[] args) throws Exception { ${mainClass}.main(args); } }`;
      extraFiles = files;
    }
  } else {
    mainCode = files[0].content;
    extraFiles = files.slice(1);
  }

  // Wandbox only compiles its main file; extra C/C++ sources in codes[] land on
  // disk but must be named on the compile line or cross-file calls fail to link.
  const extraSources =
    language === "c" || language === "c++"
      ? extraFiles.filter((f) => /\.(c|cc|cpp|cxx)$/i.test(f.name)).map((f) => f.name)
      : [];

  const res = await fetch(`${WANDBOX_URL}/compile.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      compiler,
      code: mainCode,
      codes: extraFiles.map((f) => ({ file: f.name, code: f.content })),
      ...(extraSources.length > 0 ? { "compiler-option-raw": extraSources.join("\n") } : {}),
      stdin: "",
    }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Wandbox returned ${res.status}`);
  }
  const result = (await res.json()) as WandboxResponse;

  const parsedStatus =
    result.status !== undefined && result.status !== "" ? parseInt(result.status, 10) : NaN;
  const exitCode = Number.isFinite(parsedStatus) ? parsedStatus : null;
  const compileOutput = result.compiler_error || result.compiler_output || undefined;
  const stderr = result.program_error ?? "";
  const ran = exitCode === 0 && !result.signal;

  return {
    language,
    files: files.map((f) => f.name),
    ran,
    exitCode,
    stdout: result.program_output ?? "",
    stderr,
    compileOutput,
    neededStdin: !ran && isStdinEofFailure(stderr, files),
    stdinReadSuspected: ran && sourceLooksLikeItReadsStdin(language, files),
  };
}

interface PistonFile {
  name: string;
  content: string;
}

interface PistonResponse {
  language: string;
  version: string;
  run: {
    stdout: string;
    stderr: string;
    code: number | null;
    signal: string | null;
    output: string;
  };
  compile?: {
    stdout: string;
    stderr: string;
    code: number | null;
    output: string;
  };
}

/**
 * Resolve a runtime version and execute `runFiles` (already the runner's
 * exact file list, per code-run-selection.ts) via Piston, falling back to
 * Wandbox on a whitelist/rate-limit rejection. Always returns a
 * CodeRunResult - a timeout or any other network failure is reported through
 * `error`/`timedOut`, never thrown, matching this module's "degrade, never
 * abort" contract.
 */
async function executeRunFiles(
  dominantLanguage: string,
  runFiles: CodeRunSelectionFile[],
  signal: AbortSignal
): Promise<CodeRunResult> {
  let version: string;
  try {
    version = await resolveVersion(dominantLanguage, signal);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      language: dominantLanguage,
      files: runFiles.map((f) => f.name),
      ran: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      error: message,
    };
  }

  const pistonFiles: PistonFile[] = runFiles.map((f) => ({
    name: f.name,
    content: f.content,
  }));

  let result: PistonResponse;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (PISTON_KEY) {
      headers.Authorization = PISTON_KEY;
    }
    const res = await fetch(`${PISTON_URL}/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        language: dominantLanguage,
        version,
        files: pistonFiles,
        stdin: "",
      }),
      signal,
    });

    if (!res.ok) {
      // Auth (the public API is whitelist-only since 2026-02-15) and
      // rate-limit failures get a second chance on the keyless Wandbox API.
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        const pistonMessage =
          res.status === 429
            ? "Piston rate-limited the request (429)."
            : `Piston rejected the request (${res.status}): the public emkc.org API is whitelist-only. Set PISTON_API_KEY if whitelisted, or point PISTON_API_URL at a self-hosted Piston instance.`;
        try {
          return await runViaWandbox(dominantLanguage, runFiles, signal);
        } catch (fallbackErr) {
          // Reported directly here, not re-thrown to the outer catch below -
          // re-throwing would wrap this in a fresh plain Error, and the
          // outer catch's own isTimeoutError check would then always read
          // false even when THIS is exactly what timed out (the shared
          // `signal` budget covers this fallback call too).
          const fallbackTimedOut = isTimeoutError(fallbackErr);
          const fallbackMessage = fallbackTimedOut
            ? `timed out after ${CODE_RUN_TIMEOUT_MS / 1000}s`
            : fallbackErr instanceof Error
              ? fallbackErr.message
              : String(fallbackErr);
          return {
            language: dominantLanguage,
            files: runFiles.map((f) => f.name),
            ran: false,
            exitCode: null,
            stdout: "",
            stderr: "",
            error: `${pistonMessage} Wandbox fallback also failed: ${fallbackMessage}`,
            timedOut: fallbackTimedOut,
          };
        }
      }
      throw new Error(`Piston returned ${res.status}`);
    }

    result = (await res.json()) as PistonResponse;
  } catch (err) {
    const timedOut = isTimeoutError(err);
    const message = timedOut
      ? `Code execution timed out after ${CODE_RUN_TIMEOUT_MS / 1000}s (a fixed budget so grading can still finish within the platform's request limit) - the result was not available in time.`
      : err instanceof Error
        ? err.message
        : String(err);
    return {
      language: dominantLanguage,
      files: runFiles.map((f) => f.name),
      ran: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      error: message,
      timedOut,
    };
  }

  // Step 5: Parse response into CodeRunResult.
  const compileOutput = result.compile?.output || result.compile?.stderr;
  const exitCode = result.run.code ?? null;
  const stdout = result.run.stdout ?? "";
  const stderr = result.run.stderr ?? "";

  const compiledSuccessfully = !result.compile || result.compile.code === 0;
  const ranSuccessfully = result.run.code === 0 && !result.run.signal;
  const ran = compiledSuccessfully && ranSuccessfully;

  return {
    language: dominantLanguage,
    files: runFiles.map((f) => f.name),
    ran,
    exitCode,
    stdout,
    stderr,
    compileOutput,
    neededStdin: !ran && isStdinEofFailure(stderr, runFiles),
    stdinReadSuspected: ran && sourceLooksLikeItReadsStdin(dominantLanguage, runFiles),
  };
}

/** Attach the selection-level facts (entry point, excluded files) and apply
 * the output cap to whichever result executeRunFiles produced - one place so
 * neither the Piston nor the Wandbox branch has to remember to do either. */
function finalizeCodeRunResult(
  raw: CodeRunResult,
  entryPoint: string | null,
  skipped: readonly CodeRunSkip[]
): CodeRunResult {
  return {
    ...raw,
    entryPoint: entryPoint ?? undefined,
    filesExcluded:
      skipped.length > 0
        ? skipped.map((s) => ({ name: s.name, reason: describeCodeRunSkip(s) }))
        : undefined,
    stdout: capOutput(raw.stdout),
    stderr: capOutput(raw.stderr),
    compileOutput: raw.compileOutput !== undefined ? capOutput(raw.compileOutput) : raw.compileOutput,
  };
}

/**
 * Run the dominant language's files via Piston (falling back to Wandbox).
 * Return null if no valid code files are present. Always returns a result on
 * error - including a timeout - never throws.
 *
 * `requestedEntryPoint`, when given, is the per-row Run control's instructor
 * override (docs for this feature, request 2) - passed straight through to
 * selectCodeRunFiles. When it names a file that cannot run meaningfully (a
 * header, a data file, a file this module already excludes as truncated, or
 * a basename collision's loser), this returns a CodeRunResult carrying that
 * reason in `error` - never `null` - so the caller's EXISTING "could not
 * execute" display (FilePreviewModal.tsx / GradingResults.tsx's own
 * `runResult.error` branch) shows it without a second error-rendering path.
 */
export async function runSubmittedCode(
  files: CodeFileInput[],
  requestedEntryPoint?: string
): Promise<CodeRunResult | null> {
  const selection = selectCodeRunFiles(files, requestedEntryPoint);
  if (selection.requestedEntryPointError) {
    return {
      language: "",
      files: [],
      ran: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      error: selection.requestedEntryPointError,
    };
  }
  if (selection.runFiles.length === 0) {
    return null;
  }

  // One wall-clock budget for every network call this run makes (the
  // runtimes lookup, Piston's /execute, and - only on a 401/403/429 - both of
  // Wandbox's fallback calls). Shared across all of them via the SAME signal
  // rather than a fresh timeout per call, so the TOTAL time this function can
  // spend waiting on the network is capped, matching the "fits inside the
  // 60s Vercel Hobby ceiling with room for the grading call itself"
  // reasoning documented on CODE_RUN_TIMEOUT_MS in code-run-selection.ts.
  const signal = AbortSignal.timeout(CODE_RUN_TIMEOUT_MS);

  const raw = await executeRunFiles(selection.language, selection.runFiles, signal);
  return finalizeCodeRunResult(raw, selection.entryPoint, selection.skipped);
}

// Bounded so a large batch of entries cannot open dozens of simultaneous
// sandbox requests at once (Piston/Wandbox rate limits), while still
// finishing well inside Vercel Hobby's 60s ceiling for whichever single
// server-action call is doing the attaching - each entry's own run already
// carries its own internal CODE_RUN_TIMEOUT_MS budget, so a fully sequential
// loop over N entries could take up to N times that budget in the worst
// case, past a small handful of entries. Shared by every "run every entry's
// code before the deterministic engine scores it" caller (grading.ts's
// Canvas/zip embedded paths, github-repos.ts's/github.ts's repo embedded
// paths) - one constant, one concurrency bound, not a copy per caller.
export const CODE_RUN_CONCURRENCY = 4;

/** One student/repo entry the deterministic engine is about to score -
 * generic over the caller's own entry shape (StudentSubmissionEntry from
 * @/lib/grade/types.ts satisfies this structurally) so this module never has
 * to import that type and risk a circular import back into grade/types.ts,
 * which already imports CodeRunResult from here. */
export interface CodeRunnableEntry {
  submittedFiles: CodeFileInput[];
  codeRun?: CodeRunResult | null;
}

/**
 * Run every entry's code in the sandbox (bounded concurrency - see
 * CODE_RUN_CONCURRENCY above) and stash the result on the entry so the
 * embedded deterministic engine (gradeEntriesEmbedded, src/lib/embedded-
 * grader/index.ts) can score it without doing any network itself. Entries
 * with no runnable code get `codeRun: null`. One entry's failure never blocks
 * another - runSubmittedCode never throws (it returns a `{ error }`-carrying
 * result, including on a timeout), so there is nothing here to catch.
 *
 * Moved here from grading.ts (a private, unexported helper there) so
 * github-repos.ts's and github.ts's embedded repo-grading branches can call
 * the SAME function grading.ts's Canvas/zip embedded paths already used,
 * rather than each hand-rolling their own copy of this worker-pool loop.
 */
export async function attachCodeRuns<T extends CodeRunnableEntry>(entries: T[]): Promise<void> {
  let cursor = 0;
  const runWorker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= entries.length) return;
      entries[index].codeRun = await runSubmittedCode(entries[index].submittedFiles);
    }
  };
  const workerCount = Math.min(CODE_RUN_CONCURRENCY, entries.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
}

/**
 * Reset the runtimes and Wandbox compiler caches. Test-only helper.
 */
export function __resetRuntimeCacheForTests(): void {
  runtimesCache = null;
  wandboxCompilersCache = null;
}
