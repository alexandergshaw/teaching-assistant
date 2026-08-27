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
