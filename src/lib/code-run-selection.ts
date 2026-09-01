// Pure decision layer for running a student's submitted code in the sandbox.
// Everything here is synchronous and network-free, so it is directly
// unit-testable (code-run-selection.test.ts) without mocking fetch - unlike
// code-runner.ts, which owns the actual network calls and stays a thin
// wrapper around the decisions made here.
//
// This module exists to fix a defect that shipped live in commit fa57050:
// once repo grading started passing real `submittedFiles` into
// runSubmittedCode, the sandbox started receiving files named by their FULL
// REPO PATH (e.g. "week1/src/main.py" - see github-repos.ts's
// repoDigestToEmbeddedEntry, which sets `name: file.path`). The Canvas and
// zip upload paths have always passed bare basenames (parseSubmissionFileName
// already strips to a citation filename), so they never hit this - only the
// repo path did, and only once code execution was wired up for it. A sandbox
// that receives "week1/src/main.py" and "week1/src/helpers.py" cannot honor a
// student's `import helpers` or `open("data.txt")` the way it would if those
// files sat next to each other with their real names - the failure is ours,
// not the student's code's.

import { Buffer } from "buffer";

// ── Language / data-file recognition ────────────────────────────────────────
// Moved here (from code-runner.ts) so the pure selection logic below never
// has to import from the module that also does network I/O - code-runner.ts
// imports this instead, one direction only.

export const EXTENSION_MAP: Record<string, string> = {
  ts: "typescript",
  py: "python",
  java: "java",
  c: "c",
  cpp: "c++",
  cc: "c++",
  cxx: "c++",
  hpp: "c++",
  h: "c++",
  js: "javascript",
};

/**
 * Normalize an extension (strip leading dot, lowercase) and return the Piston
 * language, or null if not recognized.
 */
export function languageForExtension(extension: string): string | null {
  const normalized = extension.replace(/^\./, "").toLowerCase();
  return EXTENSION_MAP[normalized] ?? null;
}

// Plain-text data files that ride along with the code so programs that read
// them (open("story.txt")) find them in the sandbox working directory.
const DATA_EXTENSIONS = new Set([
  "txt",
  "csv",
  "tsv",
  "json",
  "dat",
  "md",
  "xml",
  "yaml",
  "yml",
  "in",
]);

// Oversized data files are skipped rather than truncated (a truncated input
// corrupts program behavior more confusingly than a missing one).
const MAX_DATA_FILE_CHARS = 200_000;

function extensionOfBasename(name: string): string {
  return name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
}

// ── Candidate shape ──────────────────────────────────────────────────────────

/**
 * One file as it arrives from a submission, before this module decides
 * whether/how it gets executed. Matches the fields code-runner.ts's
 * CodeFileInput already carries (that type is now defined in terms of this
 * one) plus `previewTruncated`, which repo digests set honestly
 * (RepoFile.truncated / SubmittedFileInfo.previewTruncated) and Canvas/zip
 * uploads never do (they attach whatever they have whole).
 */
export interface CodeRunCandidate {
  /** As given by the caller - a full repo path for a folder-scoped repo grade
   * ("week1/src/main.py"), or already a bare filename for Canvas/zip uploads. */
  name: string;
  /** File extension without a dot, lowercased (e.g. "py", "cpp"). */
  extension: string;
  /** Full file bytes, base64 (preferred source of truth - never truncated). */
  rawBase64?: string;
  /** Fallback text when rawBase64 is absent - may be a truncated slice. */
  previewContent?: string;
  /** True when `previewContent` is a cut slice of the real file, not the
   * whole thing (ingestRepo's perFileBytes/maxBytes budget). Absent/false for
   * Canvas and zip uploads, which never truncate what they attach. */
  previewTruncated?: boolean;
}

/** Why a candidate never reached the runner. */
export interface CodeRunSkip {
  /** The candidate's original `name` (full path, if it had one). */
  name: string;
  reason: "truncated" | "collision";
  /** reason === "collision" only: the basename two candidates both wanted. */
  basename?: string;
  /** reason === "collision" only: the original name of the candidate that
   * kept the basename instead of this one. */
  keptInstead?: string;
}

/** A short, human-readable explanation of one skip - for logs/UI, never for
 * the grading prompt (buildCodeExecutionNote in grade/utils.ts does not use
 * this; it only ever sees files that made it into the run). */
export function describeCodeRunSkip(skip: CodeRunSkip): string {
  if (skip.reason === "truncated") {
    return `${skip.name}: not run - only a truncated slice of this file was available, and running a cut-off file would blame the student for our truncation, not their code.`;
  }
  return `${skip.name}: not run - its filename "${skip.basename}" was already claimed by ${skip.keptInstead}; the sandbox cannot keep two files with the same name.`;
}

/** The last path segment, forward- or back-slash delimited. A name with no
 * separator (already a bare basename, as Canvas/zip uploads always are) is
 * returned unchanged. */
export function basenameOf(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? path;
}

interface MappedCandidate {
  name: string; // basename actually sent to the runner - unique within the batch
  extension: string;
  content: string; // decoded/resolved text
}

function decodeContent(candidate: CodeRunCandidate): string | null {
  if (candidate.rawBase64) {
    try {
      return Buffer.from(candidate.rawBase64, "base64").toString("utf8");
    } catch {
      return null; // silently skipped, matching the pre-existing "undecodable" behavior
    }
  }
  if (candidate.previewContent) return candidate.previewContent;
  return null;
}

/**
 * Step 1 of selection: decode each candidate, flatten full repo paths down to
 * the runner's flat basenames, and decide the two ways a candidate can lose
 * its place before language detection ever runs:
 *
 *  - TRUNCATED: `previewTruncated` is true and there is no `rawBase64` to
 *    fall back on - i.e. all we have is a cut slice of the real file. See
 *    this module's "Also handle" note in the acceptance criteria: executing
 *    a truncated file and reporting the result as the student's program is
 *    dishonest. The choice made here is to NEVER execute it, rather than run
 *    the cut version and label it - a truncated file is often cut mid-syntax
 *    (an unclosed bracket, a half statement), which would produce a compile
 *    error that is entirely ours, and a truncation label in the output does
 *    not reliably stop a model from weighting a fabricated syntax error
 *    against the student anyway. The instructor still sees this decision -
 *    it comes back as a `CodeRunSkip` the caller can log/display, not a
 *    silent drop.
 *
 *  - COLLISION: two candidates flatten to the same basename (two files with
 *    the same name in different repo folders - real and not rare: a
 *    multi-week repo with "week1/helpers.py" and "week2/helpers.py" scoped
 *    together, or any student who names a per-folder "main.py" more than
 *    once). They cannot both be sent to a flat sandbox file list. The
 *    decision: FIRST OCCURRENCE WINS, in the order the caller supplied
 *    (README, then docs, then src, then the rest - see github.digest.ts's
 *    pathRank for repo digests, which is what determines this order in
 *    practice), and every later same-named candidate is dropped and
 *    reported, never silently merged, renamed, or namespaced into a
 *    directory the sandbox does not actually give us.
 *
 * Candidates that decode to empty/whitespace-only content, or that fail to
 * decode at all, are dropped without being reported - this matches
 * runSubmittedCode's pre-existing behavior for those two cases (there was
 * never anything here worth telling the instructor apart from "the file was
 * empty").
 */
function mapSubmittedFilesForExecution(candidates: readonly CodeRunCandidate[]): {
  files: MappedCandidate[];
  skipped: CodeRunSkip[];
} {
  const files: MappedCandidate[] = [];
  const skipped: CodeRunSkip[] = [];
  const claimedBasenames = new Map<string, string>(); // basename -> original name that claimed it

  for (const candidate of candidates) {
    if (candidate.previewTruncated && !candidate.rawBase64) {
      skipped.push({ name: candidate.name, reason: "truncated" });
      continue;
    }

    const content = decodeContent(candidate);
    if (!content || !content.trim()) continue;

    const base = basenameOf(candidate.name);
    const keptInstead = claimedBasenames.get(base);
    if (keptInstead) {
      skipped.push({ name: candidate.name, reason: "collision", basename: base, keptInstead });
      continue;
    }
    claimedBasenames.set(base, candidate.name);
    files.push({ name: base, extension: candidate.extension, content });
  }

  return { files, skipped };
}

// ── Entry-point selection ────────────────────────────────────────────────────

interface DecodedRunnableFile {
  name: string;
  content: string;
  language: string;
}

/**
 * Conventional entry-point filenames, checked in this priority order, across
 * languages (case-insensitive, extension-agnostic). Checked BEFORE any
 * content heuristic - a file actually named "main.py" should win even if
 * some other file also happens to contain a main guard.
 */
const ENTRY_NAME_PATTERNS: RegExp[] = [
  /^__main__\.[^.]+$/i,
  /^main\.[^.]+$/i,
  /^index\.[^.]+$/i,
  /^app\.[^.]+$/i,
];

/**
 * Per-language "this file is where execution starts" content signatures,
 * checked only when no file matched a conventional name above. Broad on
 * purpose (this is a heuristic, not a parser) - the fallback below (first
 * file, in the given order) is always available when nothing matches.
 */
const MAIN_GUARD_PATTERNS: RegExp[] = [
  /if\s+__name__\s*==\s*["']__main__["']/, // Python
  /\bpublic\s+static\s+void\s+main\s*\(/, // Java
  /\bint\s+main\s*\(/, // C / C++
  /\bfunction\s+main\s*\(/, // JavaScript / TypeScript
];

/**
 * Pick which of the dominant language's files execution should start from.
 * Fixes two live defects (docs for this feature): both Piston and Wandbox
 * ran `files[0]` unconditionally (code-runner.ts:427-429 before this
 * change), and the digest that produced that order sorts README, docs, src,
 * then everything else, ALPHABETICALLY within each tier - so "helpers.py"
 * beat "main.py" whenever both lived directly under the scoped folder (both
 * rank as "src"-tier or "rest"-tier, and "helpers" < "main"). Java already
 * searched its files for a `public static void main` method - but only
 * inside the Wandbox fallback path (runViaWandbox), never on the primary
 * Piston path, and never for any other language.
 *
 * Order of preference: a conventional entry filename, then a language's main
 * guard/function signature, then - unchanged from today - whichever file
 * came first in the given order.
 */
export function chooseEntryPoint(files: readonly DecodedRunnableFile[]): string | null {
  if (files.length === 0) return null;

  for (const pattern of ENTRY_NAME_PATTERNS) {
    const match = files.find((f) => pattern.test(f.name));
    if (match) return match.name;
  }
  for (const pattern of MAIN_GUARD_PATTERNS) {
    const match = files.find((f) => pattern.test(f.content));
    if (match) return match.name;
  }
  return files[0].name;
}

function withEntryFirst<T extends { name: string }>(files: readonly T[], entryPoint: string | null): T[] {
  if (!entryPoint) return [...files];
  const index = files.findIndex((f) => f.name === entryPoint);
  if (index <= 0) return [...files];
  const copy = [...files];
  const [entry] = copy.splice(index, 1);
  copy.unshift(entry);
  return copy;
}

// ── Instructor-chosen entry point (per-row Run button) ──────────────────────
//
// The automatic chooseEntryPoint heuristic above is what every grading call
// still uses by default - this section only exists for the on-demand Run
// control (docs for this feature, request 2), where an instructor may name a
// SPECIFIC file to run instead of trusting the heuristic. That is
// straightforward for a single-file Python/JS submission and often
// meaningless for a compiled or import-heavy project: running an arbitrary
// header, a data file, a file this module already excluded as truncated, or
// a basename collision's loser either fails to compile or exercises nothing.
// describeEntryPointIneligibility is the ONE place that decides "can this
// file even be an entry point" and, when not, WHY - so the caller shows that
// reason instead of forwarding an ineligible file to Piston/Wandbox and
// letting it produce a confusing compiler error the instructor has to
// puzzle out. Checked ONLY when an instructor explicitly names a file
// (selectCodeRunFiles's second argument) - the automatic path above is
// completely unaffected and unchecked.

/** Header-only source extensions - technically mapped to a language by
 * EXTENSION_MAP (so a header can still ride along as a sibling file and be
 * decoded normally), but never eligible to be the file execution STARTS
 * FROM: a standalone header almost never has a main, and even one that
 * happens to compile alone is not what a student would call "the program".
 * The automatic chooseEntryPoint heuristic already never picks one on its
 * own (ENTRY_NAME_PATTERNS/MAIN_GUARD_PATTERNS never match a bare header),
 * so this only matters for an explicit instructor pick. */
const HEADER_EXTENSIONS = new Set(["h", "hpp"]);

/**
 * Why `requestedEntryPoint` (the caller's raw candidate name - a full repo
 * path or an already-bare basename, matched the same way basenames are
 * matched everywhere else in this module) cannot be run as this selection's
 * entry point, or `null` when it is a perfectly good choice.
 *
 * Checks EXACT name first against `skipped` (never a basename-only match
 * there): two different candidates can share a basename where one survived
 * and one did not (e.g. "week1/helpers.py" kept, "week2/helpers.py" dropped
 * as a collision) - matching by basename alone would wrongly blame the
 * SURVIVING file for the other one's exclusion. Only once the exact name is
 * cleared of a skip does this fall back to a basename lookup against
 * `mapped` (which only ever stores the flattened basename a survivor was
 * kept under) to classify what kind of file it actually is.
 */
function describeEntryPointIneligibility(
  requestedEntryPoint: string,
  candidates: readonly CodeRunCandidate[],
  skipped: readonly CodeRunSkip[],
  mapped: readonly MappedCandidate[]
): string | null {
  const exactSkip = skipped.find((s) => s.name === requestedEntryPoint);
  if (exactSkip) return describeCodeRunSkip(exactSkip);

  const requestedBasename = basenameOf(requestedEntryPoint);
  const survivor = mapped.find((f) => f.name === requestedBasename);
  if (survivor) {
    const ext = extensionOfBasename(survivor.name);
    if (HEADER_EXTENSIONS.has(ext)) {
      return `${requestedBasename}: not run - this is a header file, not a program on its own. Pick the source file that includes it instead.`;
    }
    if (DATA_EXTENSIONS.has(ext)) {
      return `${requestedBasename}: not run - this is a data file a program may read, not something that can run on its own.`;
    }
    if (!languageForExtension(ext)) {
      return `${requestedBasename}: not run - "${ext || "no extension"}" is not a language this sandbox recognizes.`;
    }
    return null;
  }

  const original = candidates.find((c) => c.name === requestedEntryPoint || basenameOf(c.name) === requestedBasename);
  if (original) {
    return `${requestedBasename}: not run - this file was empty or could not be read as text.`;
  }
  return `${requestedBasename}: not run - no file with this name was found in this submission.`;
}

// ── Full selection ───────────────────────────────────────────────────────────

export interface CodeRunSelectionFile {
  name: string;
  content: string;
}

export interface CodeRunSelection {
  /** Piston language name, or "" when nothing runnable was found. */
  language: string;
  /** The exact file list the runner should receive - entry point first, the
   * rest of the dominant language's files after it, then data files.
   * Empty when nothing runnable was found (mirrors runSubmittedCode's
   * pre-existing `return null` case), or when a requested entry point was
   * ineligible (see `requestedEntryPointError` below). */
  runFiles: CodeRunSelectionFile[];
  /** Basename of the file execution starts from - null only when `runFiles`
   * is empty. */
  entryPoint: string | null;
  /** Every candidate that did not make it into `runFiles` because of THIS
   * module's own decisions (truncation, basename collision) - never includes
   * files silently dropped for being empty/undecodable/unrecognized, which
   * carry no information worth surfacing (see mapSubmittedFilesForExecution's
   * own doc comment). */
  skipped: CodeRunSkip[];
  /** Set only when the caller passed a `requestedEntryPoint` that
   * describeEntryPointIneligibility rejected - explains why in one line, for
   * display in place of a confusing compiler error. `runFiles` is empty and
   * `entryPoint` is null whenever this is set. Never set on the automatic
   * (no `requestedEntryPoint`) path. */
  requestedEntryPointError?: string;
}

/**
 * Decide what a sandbox run of `candidates` should look like: which files
 * get sent, under what names, and which one is the entry point. Pure and
 * network-free - code-runner.ts calls this once, then does nothing but
 * resolve a runtime version and make the actual HTTP calls with the result.
 *
 * `requestedEntryPoint`, when given, is an instructor's explicit override
 * (the per-row Run control) - the candidate's own `name` exactly as it
 * appears in the submission (a full repo path or an already-bare basename).
 * When it names an eligible file, that file's language becomes the run's
 * dominant language and every other decoded file of that SAME language rides
 * along as a sibling, exactly like the automatic path's own dominant-language
 * grouping. When it does not, nothing is run - see `requestedEntryPointError`.
 */
export function selectCodeRunFiles(
  candidates: readonly CodeRunCandidate[],
  requestedEntryPoint?: string
): CodeRunSelection {
  const { files: mapped, skipped } = mapSubmittedFilesForExecution(candidates);

  if (requestedEntryPoint) {
    const ineligible = describeEntryPointIneligibility(requestedEntryPoint, candidates, skipped, mapped);
    if (ineligible) {
      return { language: "", runFiles: [], entryPoint: null, skipped, requestedEntryPointError: ineligible };
    }
  }

  const decoded: DecodedRunnableFile[] = [];
  const dataFiles: CodeRunSelectionFile[] = [];

  for (const file of mapped) {
    const language = languageForExtension(file.extension);
    if (language) {
      decoded.push({ name: file.name, content: file.content, language });
      continue;
    }
    const ext = extensionOfBasename(file.name);
    if (DATA_EXTENSIONS.has(ext) && file.content.length <= MAX_DATA_FILE_CHARS) {
      dataFiles.push({ name: file.name, content: file.content });
    }
    // Anything else (unrecognized language, oversized data file) is dropped
    // silently - matches runSubmittedCode's pre-existing behavior.
  }

  if (decoded.length === 0) {
    return { language: "", runFiles: [], entryPoint: null, skipped };
  }

  let dominantLanguage = "";
  let dominantFiles: DecodedRunnableFile[] = [];

  if (requestedEntryPoint) {
    // Already proven eligible above (describeEntryPointIneligibility would
    // have returned early otherwise), so this basename is guaranteed to be
    // present among `decoded` - never among headers/data files/unrecognized
    // extensions, which all returned an ineligibility reason above.
    const requestedBasename = basenameOf(requestedEntryPoint);
    const requestedFile = decoded.find((f) => f.name === requestedBasename)!;
    dominantLanguage = requestedFile.language;
    dominantFiles = decoded.filter((f) => f.language === dominantLanguage);
  } else {
    // Dominant language: most files, ties broken by total content length -
    // unchanged from the pre-existing runSubmittedCode logic.
    const byLanguage = new Map<string, DecodedRunnableFile[]>();
    for (const file of decoded) {
      const group = byLanguage.get(file.language);
      if (group) group.push(file);
      else byLanguage.set(file.language, [file]);
    }

    let maxFiles = 0;
    let maxLength = 0;
    for (const [lang, group] of byLanguage) {
      const totalLength = group.reduce((sum, f) => sum + f.content.length, 0);
      if (group.length > maxFiles || (group.length === maxFiles && totalLength > maxLength)) {
        dominantLanguage = lang;
        dominantFiles = group;
        maxFiles = group.length;
        maxLength = totalLength;
      }
    }
  }

  const entryPoint = requestedEntryPoint ? basenameOf(requestedEntryPoint) : chooseEntryPoint(dominantFiles);
  const orderedDominant = withEntryFirst(dominantFiles, entryPoint);

  const runFiles: CodeRunSelectionFile[] = [
    ...orderedDominant.map((f) => ({ name: f.name, content: f.content })),
    ...dataFiles,
  ];

  return { language: dominantLanguage, runFiles, entryPoint, skipped };
}

// ── Bulk-safety constants (Item 4) ──────────────────────────────────────────
//
// Production is Vercel Hobby: a hard 60-second ceiling on the ENTIRE
// gradeRepoAction call that a single "Grade" click (or one worker of a
// "Grade all" run - each is its own server-action invocation with its own
// budget) makes. That one call does three network-bound things in sequence:
// ingestRepo (GitHub tree + per-file fetches - typically a few seconds, but
// grows with a scoped folder's file count), runSubmittedCode (this module's
// caller - the sandbox round trip(s)), and the grading LLM call itself (the
// slowest and most variable of the three, especially at a high
// maxOutputTokens). The LLM call must keep the lion's share of the budget, so
// code execution gets a firm, small slice:
//
//   CODE_RUN_TIMEOUT_MS = 12s. Piston's worst case is up to four sequential
//   fetches (its own /runtimes lookup, /execute, then - only on a 401/403/429
//   - Wandbox's /list.json and /compile.json). 12s is enough for all four to
//   complete against a healthy runner, while leaving at least ~40s of the 60s
//   ceiling for ingestRepo (~5-8s typical) and the grading call itself, even
//   assuming a few seconds of framework/cold-start overhead on top.
//
//   CODE_RUN_OUTPUT_CAP_CHARS = 20,000 (per stdout/stderr/compileOutput
//   stream). This is independent of - and larger than - the 4,000-character
//   cap buildCodeExecutionNote (grade/utils.ts) already applies when building
//   the grading prompt; that cap protects the prompt's token budget. This one
//   protects the CodeRunResult object itself (and the cell state it gets
//   copied into) from an unbounded payload - a student's infinite loop
//   printing megabytes of output must not blow up memory or the response
//   sent back to the browser.
export const CODE_RUN_TIMEOUT_MS = 12_000;
export const CODE_RUN_OUTPUT_CAP_CHARS = 20_000;

/** Cut `text` to `maxChars` and say so, in the text itself - never a silent
 * cut. Distinct wording from buildCodeExecutionNote's own truncation note
 * (grade/utils.ts) so the two are never confused for the same cap. */
export function capOutput(text: string, maxChars: number = CODE_RUN_OUTPUT_CAP_CHARS): string {
  if (text.length <= maxChars) return text;
  const omitted = text.length - maxChars;
  return `${text.slice(0, maxChars)}\n[Output truncated: ${omitted} additional characters were cut to keep the response within size limits.]`;
}

// ── Stdin-EOF detection ──────────────────────────────────────────────────────
//
// This sandbox always sends stdin as "" (code-runner.ts's Piston/Wandbox
// request bodies) - there is no per-submission stdin anywhere in this repo,
// and fabricating one would show the grading model output produced by
// numbers the student never chose, which is a worse correctness problem than
// the one this section fixes. An assignment that requires reading from
// stdin therefore fails for reasons that have nothing to do with the
// student's code - but HOW it fails is wildly language-dependent:
//
//   Python's input() raises `EOFError: EOF when reading a line` when the
//   stream is exhausted, uncaught by student code that never expected to run
//   without a terminal attached, so the process exits non-zero with that
//   exact text as (effectively) the last line of stderr. The bare string
//   "EOFError" is NOT a reliable signal on its own, though - a claim this
//   comment used to make and which a review disproved: `pickle.load`/
//   `Unpickler.load` raise the exact same `EOFError` (no message) when asked
//   to unpickle an empty or truncated stream, and `gzip`/`bz2` readers raise
//   it too on a truncated compressed stream - none of that has anything to
//   do with stdin, and a student whose file-parsing genuinely over-reads
//   must not be silently excluded from scoring because of it. A student
//   writing `raise EOFError(...)` themselves, for an unrelated reason, is a
//   third source of the same bare string. What actually ties an EOFError to
//   stdin is the source, not the exception name: see
//   pythonSourceReadsStdinForInput below, required in addition to the
//   stderr text, not instead of it - the exception proves input ran out,
//   the source proves the input in question was stdin.
//
//   C/C++'s `cin >> x` / `scanf` do NOT fail this way at all: reading past
//   EOF sets a stream failure flag and leaves the target variable
//   UNTOUCHED, and the process can still exit 0. There is no stderr text or
//   exit code this module (or any purely post-hoc signal) could key off -
//   the failure is invisible from here, which is why it is scored as a
//   clean run today. sourceLooksLikeItReadsStdin below is the best
//   available mitigation: a static source scan, checked only for c/c++ (the
//   languages this repo has verified silently swallow the EOF this way).
//   It cannot turn a C++ run's `ran` back to false (the process really did
//   exit 0; that would be lying in the other direction), so a caller that
//   wants to warn a grading model uses it to caveat the output shown, not
//   to reclassify the run.

// ── Java: Scanner at EOF ("NoSuchElementException") ─────────────────────────
//
// java.util.Scanner's next()/nextLine()/nextInt()/etc. throw
// java.util.NoSuchElementException (nextLine(): "No line found") when the
// underlying stream has nothing left to read - Java's analogue of Python's
// EOFError above. The exception class name alone ("java.util.
// NoSuchElementException") is NOT a safe signal on its own: the same class is
// thrown by plenty of unrelated student bugs (an empty ArrayList's iterator,
// an exhausted Deque/Queue, a custom collection) that have nothing to do with
// stdin, and flagging those as "not scored" would hide a real defect. What
// makes Scanner's case identifiable is the stack trace: Scanner.throwFor (the
// method every one of Scanner's read methods delegates to for this exact
// exception) or the read method itself (Scanner.nextLine/.nextInt/etc.) has
// to be ON the trace, because that is the only call site in the whole JDK
// that constructs this exception for "stream exhausted". An iterator's own
// NoSuchElementException is thrown from iterator code (e.g. ArrayList$Itr.
// next) with no Scanner frame anywhere in its trace - by the time a student's
// loop gets to that line, any earlier Scanner call has already returned and
// is off the call stack entirely. Requiring BOTH the exact exception name AND
// a Scanner frame - never either alone - is what rules the iterator case out.
//
// java.util.InputMismatchException (malformed input, e.g. nextInt() on a
// non-numeric token) also extends NoSuchElementException and is also thrown
// via Scanner.throwFor, but it prints its OWN distinct class name in the
// stack trace ("java.util.InputMismatchException"), which never contains the
// substring "java.util.NoSuchElementException" - so it is never matched here.
// That is correct, not just incidental: this sandbox's stdin is always
// exactly empty, never present-but-malformed, so InputMismatchException
// cannot fire from stdin exhaustion in the first place - when it fires, it is
// reporting a genuine defect (the student parsed a token as the wrong type)
// and must keep failing the run.
//
// The stack trace alone is STILL not enough, though - a review caught this:
// `new Scanner(new File("data.txt"))` over a file that runs out of lines
// produces a BYTE-IDENTICAL trace (same exception class, same Scanner.
// throwFor/nextX frames) to `new Scanner(System.in)` at EOF, because the
// trace only ever names the Scanner class, never which stream backs it. A
// student whose file-parsing loop genuinely over-reads was, before this
// fix, silently excluded from scoring instead of penalised for a real bug.
// The stack trace cannot distinguish the two streams - only the source can:
// javaSourceConstructsScannerOverStdin below requires the submitted source
// to actually construct a Scanner over System.in (directly, or via
// InputStreamReader/BufferedReader wrapping it), in addition to this
// stderr signature, not instead of it.
const JAVA_NO_SUCH_ELEMENT_EXCEPTION = /\bjava\.util\.NoSuchElementException\b/;
const JAVA_SCANNER_STACK_FRAME =
  /\bat\s+(?:java\.base\/)?java\.util\.Scanner\.(?:throwFor|nextBigDecimal|nextBigInteger|nextBoolean|nextByte|nextShort|nextInt|nextLong|nextFloat|nextDouble|nextLine|next)\b/;

/** True when `stderr` carries Java's Scanner-at-EOF signature: the exact
 * java.util.NoSuchElementException class name AND a java.util.Scanner read
 * method somewhere on the same stack trace. See the section comment above
 * for why the combination - never either check alone - is what keeps this
 * from misclassifying an unrelated NoSuchElementException (e.g. an empty
 * collection's iterator) as a stdin problem. This is NECESSARY but not
 * SUFFICIENT for a stdin-EOF classification - see
 * javaSourceConstructsScannerOverStdin below, and isStdinEofFailure, which
 * requires both. */
function isJavaScannerEofFailure(stderr: string): boolean {
  return JAVA_NO_SUCH_ELEMENT_EXCEPTION.test(stderr) && JAVA_SCANNER_STACK_FRAME.test(stderr);
}

// Matches a Scanner constructed directly over System.in, or over an
// InputStreamReader/BufferedReader chain that itself bottoms out at
// System.in, e.g.:
//   new Scanner(System.in)
//   new Scanner(new InputStreamReader(System.in))
//   new Scanner(new BufferedReader(new InputStreamReader(System.in)))
// Deliberately narrow: `System.in` must appear as the (optionally wrapped)
// argument of the SAME `new Scanner(...)` call, so `new Scanner(new
// File(...))` and `new Scanner(someString)` never match, no matter what else
// the file mentions - a Scanner over a file or a string is not a Scanner
// over stdin, and must keep being scored as a genuine failure rather than
// excused. Deliberately left uncovered, per this module's "precision beats
// coverage" standard (see the sys.stdin same-line rule below for the
// original precedent): a Scanner built from a reader/stream variable
// declared on an earlier, separate statement (e.g. `InputStreamReader isr =
// new InputStreamReader(System.in); Scanner sc = new Scanner(isr);`) - a
// regex has no reliable way to trace that variable back to its declaration,
// and guessing would risk exactly the kind of invisible-wrong-answer this
// module exists to avoid. That submission keeps today's behavior: scored as
// a genuine failure, not excluded.
const JAVA_SCANNER_STDIN_SOURCE =
  /\bnew\s+Scanner\s*\(\s*(?:new\s+BufferedReader\s*\(\s*)?(?:new\s+InputStreamReader\s*\(\s*)?System\s*\.\s*in\b/;

/** True when at least one submitted file's source constructs a Scanner over
 * System.in (see JAVA_SCANNER_STDIN_SOURCE above for exactly what qualifies
 * and what deliberately does not). Paired with isJavaScannerEofFailure -
 * both must hold - to tell a Scanner-over-stdin EOF apart from a
 * byte-identical Scanner-over-File EOF. */
function javaSourceConstructsScannerOverStdin(files: readonly CodeRunSelectionFile[]): boolean {
  return files.some((f) => JAVA_SCANNER_STDIN_SOURCE.test(f.content));
}

// ── Python: sys.stdin's own empty return, parsed/indexed on the same line ──
//
// input() raises EOFError itself (handled above) - but sys.stdin.readline(),
// .read(), and .readlines() do NOT raise anything at EOF: they simply return
// "" (or, for readlines(), []). A program that hands that empty result
// straight to int()/float(), or unpacks/indexes it, fails one statement later
// with an exception (ValueError, IndexError) that reads exactly like a real
// bug UNLESS the traceback itself proves the failing value came from stdin
// and nowhere else. Python's traceback always echoes the failing source
// line, so that is checked, not assumed: this only matches when
// `sys.stdin.read(...)`/`readline(...)`/`readlines(...)` appears on the SAME
// source line the traceback shows (an optional PEP 657 caret-annotation line
// is allowed in between, for 3.11+), immediately followed by the specific
// exception text that an EMPTY result - never a malformed one - produces.
// That "same line" requirement is what makes this safe: the value being
// parsed/indexed can only be that call's own return, never some other
// variable that happens to be blank for an unrelated, genuine reason.
//
// Deliberately left uncovered (do not guess, per this module's own standard
// for isStdinEofFailure above):
//   - The equally common TWO-STATEMENT form
//     (`line = sys.stdin.readline()` ... `int(line)` on a later line) - the
//     failing line no longer mentions `sys.stdin` at all, so there is nothing
//     in stderr text alone to tell that case apart from a value that was
//     blank for a genuine reason.
//   - A bare ValueError/IndexError/unpack failure with no stdin call on the
//     failing line - could be anything; scoring it neutrally would risk
//     hiding a real defect, so it is left as a normal (scored) failure today,
//     same as before this change.
const PYTHON_STDIN_DIRECT_PARSE_FAILURE =
  /sys\.stdin\.(?:readlines|readline|read)\s*\([^\n]*\n(?:[^\n]*[\^~][^\n]*\n)?[^\n]*(?:invalid literal for int\(\) with base \d+: ''|could not convert string to float: ''|IndexError: list index out of range|not enough values to unpack \(expected \d+, got 0\))/;

/** True when `stderr` carries the "sys.stdin's own empty return, parsed or
 * indexed on the same source line" signature - see the section comment above
 * for exactly what this covers and what it deliberately leaves uncovered. */
function isPythonStdinDirectParseFailure(stderr: string): boolean {
  return PYTHON_STDIN_DIRECT_PARSE_FAILURE.test(stderr);
}

// Bare "EOFError" (Python's input() signature) is checked against source
// evidence, not trusted on its own - see this section's corrected comment
// above for why (pickle/gzip/bz2 raise the identical bare EOFError on a
// truncated or empty stream, with nothing to do with stdin). `input(` is the
// direct proof; `sys.stdin` is included too since a program can legitimately
// mix `input()` for some prompts with `sys.stdin` reads for others, and
// either one appearing anywhere in the source is evidence the program reads
// standard input at all (not proof THIS particular EOFError came from it -
// see the false-positive analysis in this module's PR notes/report for the
// residual risk that accepts). Broad on purpose within that scope, matching
// this module's existing MAIN_GUARD_PATTERNS/STDIN_READ_PATTERNS precedent -
// not comment/string aware.
const PYTHON_STDIN_SOURCE_EVIDENCE = /\binput\s*\(|\bsys\.stdin\b/;

/** True when at least one submitted file's source contains a Python stdin
 * read (`input(` or `sys.stdin`) - see PYTHON_STDIN_SOURCE_EVIDENCE above. */
function pythonSourceReadsStdinForInput(files: readonly CodeRunSelectionFile[]): boolean {
  return files.some((f) => PYTHON_STDIN_SOURCE_EVIDENCE.test(f.content));
}

/** True when `stderr` carries one of this repo's verified stdin-exhaustion
 * signatures AND `files` (the exact source sent to the runner for this run)
 * proves the program actually reads from standard input - both are
 * required, matching this module's "precision beats coverage" standard,
 * because two of the three stderr signatures below are byte-identical to a
 * genuine, unrelated student defect (see the section comments above for
 * each one's specific defeat):
 *
 *  - Python's bare EOFError (input()) is byte-identical to pickle.load/
 *    gzip/bz2 raising EOFError on a truncated or empty stream they were
 *    asked to read - gated on `input(`/`sys.stdin` appearing in the source
 *    (pythonSourceReadsStdinForInput).
 *  - Java's Scanner-sourced NoSuchElementException is byte-identical
 *    whether the Scanner wraps System.in or a File - gated on the source
 *    actually constructing a Scanner over System.in
 *    (javaSourceConstructsScannerOverStdin).
 *  - Python's sys.stdin.read()/readline()/readlines() parsed or indexed
 *    directly on the same source line (isPythonStdinDirectParseFailure) is
 *    NOT re-gated here - it already demands its own textual proof, read
 *    straight out of the traceback's echoed source line, which is at least
 *    as strong as a separate source scan. Weakening it to require the same
 *    `files` check would add nothing and risks missing a case the existing
 *    rule already proves correctly (e.g. a submitted-files list assembled
 *    differently than what actually ran).
 *
 * Where none of the three signatures fire, or fires without matching source
 * evidence, this returns false and the run is scored as a genuine failure -
 * the same, known, visible behavior as before this change, not a new guess. */
export function isStdinEofFailure(
  stderr: string,
  files: readonly CodeRunSelectionFile[] = []
): boolean {
  if (isPythonStdinDirectParseFailure(stderr)) return true;
  if (isJavaScannerEofFailure(stderr)) return javaSourceConstructsScannerOverStdin(files);
  if (/EOFError/.test(stderr)) return pythonSourceReadsStdinForInput(files);
  return false;
}

// Calls that read from stdin in the languages this repo has verified fail
// SILENTLY at EOF (see section comment above) - c/c++ only. Broad on purpose
// (this is a heuristic, not a parser, matching this module's existing
// MAIN_GUARD_PATTERNS precedent), so a commented-out call or a shadowed
// identifier can still false-positive. The real cost of a false positive
// here is NOT "never a score change" - a prior version of this comment
// claimed that, and it was wrong: the caveat this drives
// (buildCodeExecutionNote, grade/utils.ts) is injected straight into the
// LLM grading prompt, telling the model the output shown may reflect an
// unset/garbage variable rather than real program behavior. A model reading
// that caveat can, and reasonably does, weigh the input-handling portion of
// the submission more skeptically - which can lower the grade for a student
// whose program never actually touched stdin at all. Accepted anyway
// because the alternative (dropping the caveat language-wide) reintroduces
// the exact silent-EOF blind spot this function exists to mitigate for the
// language(s) where a clean exit provides no other signal.
const STDIN_READ_PATTERNS: RegExp[] = [
  /\bscanf\s*\(/, // scanf("%d", &x);
  /\bgets\s*\(/, // gets(buf); (C, deprecated but still seen in student code)
  /\bfgets\s*\([^)]*\bstdin\b/, // fgets(buf, n, stdin);
  /\bgetline\s*\(\s*(?:std::)?cin\b/, // getline(cin, line);
];

// cin >> is checked separately from STDIN_READ_PATTERNS above, against a
// version of the source with single-line `//` comments stripped first - a
// review found the un-stripped pattern matches a `cin >>` a student
// commented out (e.g. `// cin >> x; // read manually later`), which is not
// a stdin read at all. Only `//` comments are stripped, deliberately: a
// `/* ... */` block comment needs its own open/close tracking to strip
// safely (getting that wrong risks eating real code after a stray `*/`),
// and a string literal containing "cin >>" needs actual tokenizing to tell
// apart from real code - both are judged unreliable to hand-roll here, so
// they are left alone rather than half-fixed; a `cin >>` inside a print
// string is a known, pre-existing false-positive risk this change does not
// close. The naive `//`-strip has its own known failure mode in the other
// direction (a false NEGATIVE): a line like `s = "http://x"; cin >> n;`
// strips from the FIRST `//` found, which falls inside the URL string and
// before the genuine `cin >> n;` later on the same line - so that real read
// would go undetected. Accepted as rare (a URL literal sharing a line with
// a stdin read) against the much more common commented-out case this fixes.
const CIN_READ_PATTERN = /\bcin\s*>>/;

function stripSingleLineComments(content: string): string {
  return content
    .split("\n")
    .map((line) => {
      const index = line.indexOf("//");
      return index === -1 ? line : line.slice(0, index);
    })
    .join("\n");
}

/** True when `language` is one of the silent-EOF languages (c/c++) and at
 * least one of `files`' source appears to read from stdin. Used only to
 * caveat a grading prompt's presentation of a successful (`ran: true`) run's
 * output - never to flip whether that run's `ran` boolean is true, since the
 * process genuinely did exit 0 and this module has no reliable way to know
 * whether the value it read was ever actually used. That does NOT make a
 * false positive free, though - see STDIN_READ_PATTERNS' comment above for
 * the real cost (the caveat text this drives can move the grade the model
 * assigns, even though `ran` itself never changes). See the section comment
 * above this function's neighbors for why no stronger post-hoc signal
 * exists for c/c++. */
export function sourceLooksLikeItReadsStdin(
  language: string,
  files: readonly CodeRunSelectionFile[]
): boolean {
  if (language !== "c" && language !== "c++") return false;
  return files.some((f) => {
    if (CIN_READ_PATTERN.test(stripSingleLineComments(f.content))) return true;
    return STDIN_READ_PATTERNS.some((pattern) => pattern.test(f.content));
  });
}
