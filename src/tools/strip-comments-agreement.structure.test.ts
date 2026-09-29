import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

// L13: the repo has dozens of independently-defined `stripComments` test
// helpers (duplicated on purpose - a cross-test-file import re-runs the
// imported file's describe blocks, see docs/loop rules). Nothing checked
// that the copies actually agree on behaviour, so one of them silently went
// CRLF-blind (fixed at 830a456b) with no mechanism that would have caught
// it, or a future copy that drifts the same way.
//
// This file is a BEHAVIOURAL probe, not a syntax scan. The L13 row's own
// history records two wrong probes: the first counted a syntax marker
// (mentions a CR escape) and was wrong by a factor of 53; the second tested
// only the CRLF failure mode and generalised "CR-safe" to "safe", missing a
// second, independent failure mode (a trailing comment on a line that also
// has real code, which an anchored ^-per-line strip never reaches). This
// probe extracts each copy's actual function body, evaluates it in
// isolation, and runs it against fixtures that vary CRLF-vs-LF and
// whole-line-vs-trailing-comment independently, so the two modes cannot be
// confused with each other. It also checks a string-literal look-alike and
// a block comment, and proves by construction (not by mutating a real
// file) that the classifier actually discriminates blind behaviour rather
// than reading clean by accident.
//
// vi.setConfig: this file reads ~78 real source files at test time (an L15
// walker), which is slow-but-fine alone and can look like a timeout under
// concurrent `npm test` load from sibling agents - the same reasoning as
// snapshot-role-setrole-callsites.structure.test.ts.
vi.setConfig({ testTimeout: 30_000 });

const REPO_ROOT = process.cwd();
const SRC_DIR = path.resolve(REPO_ROOT, "src");
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

// ---------------------------------------------------------------------------
// Enumeration: walk src for every *.test.ts file, no shelling out (this repo
// blocks network in tests and other structure tests already do their own
// fs walk rather than depend on a shell's grep being present).
// ---------------------------------------------------------------------------

function walkTestFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkTestFiles(full));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".test.ts")) continue;
    found.push(full);
  }
  return found;
}

function toRepoRelative(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join("/");
}

// ---------------------------------------------------------------------------
// Extraction: a real TypeScript parse, not brace-matching. Brace-matching
// (the shape the row's first probe used) cannot see past a regex literal or
// a string containing `{`/`}`/`(`/`)`, which is exactly why the row's first
// probe found 8 files "unparseable". Transpiling first strips type
// annotations (a plain brace/paren scan cannot skip `(source: string):
// string` reliably either), then a real AST walk finds the declaration by
// name regardless of what its body contains.
// ---------------------------------------------------------------------------

interface Extracted {
  text: string;
}

function extractStripComments(fileText: string): Extracted | null {
  let transpiled: string;
  try {
    transpiled = ts.transpileModule(fileText, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    }).outputText;
  } catch {
    return null;
  }
  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile("extracted.js", transpiled, ts.ScriptTarget.ES2019, true);
  } catch {
    return null;
  }
  let found: string | null = null;
  function visit(node: ts.Node): void {
    if (found) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === "stripComments") {
      found = node.getText(sourceFile);
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "stripComments" &&
      node.initializer
    ) {
      found = node.initializer.getText(sourceFile);
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found ? { text: found } : null;
}

type StripFn = (source: string) => string;

function toCallable(text: string): StripFn | null {
  try {
    // Wrapping in parens turns a named function declaration into a named
    // function expression, and leaves an arrow/function expression as-is;
    // both evaluate to a callable via `new Function`, which runs the
    // extracted body with no import from any test file (importing a
    // sibling *.test.ts would re-run its describe blocks).
    const fn = new Function("return (" + text + ");")();
    return typeof fn === "function" ? (fn as StripFn) : null;
  } catch {
    return null;
  }
}

function loadCopy(repoRelativePath: string): StripFn {
  const abs = path.join(REPO_ROOT, repoRelativePath);
  const text = fs.readFileSync(abs, "utf8");
  const extracted = extractStripComments(text);
  if (!extracted) {
    throw new Error(`could not extract a stripComments definition from ${repoRelativePath}`);
  }
  const fn = toCallable(extracted.text);
  if (!fn) {
    throw new Error(`extracted stripComments from ${repoRelativePath} did not evaluate to a function`);
  }
  return fn;
}

// ---------------------------------------------------------------------------
// Fixtures. Each varies exactly one axis so a mode-1-blind and a mode-2-blind
// copy cannot hide behind each other, per the row's own rule: "vary the
// input along every axis the helper claims to cover."
// ---------------------------------------------------------------------------

// Axis 1 (mode 1: CRLF-blind): a comment that is the WHOLE of its own line,
// on a CRLF-terminated source. A copy that splits on a bare "\n" and then
// strips with an unanchored `//.*$` (no /m) leaves a trailing \r on the
// line, `.` cannot consume a line terminator, and unanchored `$` without
// /m requires true end-of-string - so the comment survives untouched.
const FIXTURE_WHOLELINE_CRLF =
  "codeMarkerA1;" + CR + LF + "// ALPHA_MARKER standalone comment" + CR + LF + "codeMarkerA2;" + CR + LF;

// Axis 2 (mode 2: trailing-comment-blind), CRLF variant: real code followed
// by a comment on the SAME line. An anchored multiline form (^, optional
// space/tab, the comment pattern, /m) is CR-safe but never matches here
// because the comment does not begin its own line.
const FIXTURE_TRAILING_CRLF =
  "codeMarkerB1; // BETA_MARKER trailing comment" + CR + LF + "codeMarkerB2;" + CR + LF;

// Axis 2 repeated on LF-only input, so a mode-1-blind copy (whose bug is
// specifically about a surviving \r) is NOT flagged here - this fixture
// isolates trailing-comment-blindness from CRLF-blindness.
const FIXTURE_TRAILING_LF = "codeMarkerC1; // GAMMA_MARKER trailing comment" + LF + "codeMarkerC2;" + LF;

// Axis 3: a block comment spanning multiple lines.
const FIXTURE_BLOCK_MULTILINE =
  "codeMarkerD1;" + LF + "/* DELTA_MARKER" + LF + "spans" + LF + "lines */" + LF + "codeMarkerD2;" + LF;

// Axis 4: comment-look-alikes inside string literals - a URL containing
// "//" and a string whose entire content looks like a block comment.
const FIXTURE_STRING_LOOKALIKE =
  'const u = "http://example.com//zzz"; const s2 = "/* ECHO_MARKER not real */"; codeMarkerE1;';

// Axis 5 (optional per the row, included because it is cheap and it is the
// exact case the row's note says tripped a bracket-counting throw
// elsewhere): a line comment containing an unmatched open paren. A safe
// copy must not throw and must still remove the comment.
const FIXTURE_UNMATCHED_PAREN = "codeMarkerF1; // ZETA_MARKER (unbalanced" + LF + "codeMarkerF2;";

// Dialect probe (not one of the classification axes above): a whole-line
// `//` comment on a plain LF-terminated source, with no CRLF and no
// trailing-code complication at all. Every copy that actually strips JS
// `//` comments - safe, mode1-blind (CRLF only) or mode2-blind (trailing
// only) - removes this one, because neither of those two bugs is
// triggered by a pure-LF whole-line case (see isJsSlashSlashDialect below
// for why). A copy that leaves it untouched is not stripping JS `//`
// syntax at all - it is a different comment dialect (e.g. a SQL stripper
// that only recognises `--`) sharing the `stripComments` name, and does
// not belong in the JS-// classification buckets (safe / mode1 / mode2 /
// string-aware / block) below. That copy is excluded-by-dialect instead,
// with the reason recorded in EXCLUSIONS.
const FIXTURE_DIALECT_PROBE_LF =
  "codeMarkerG1;" + LF + "// OMEGA_MARKER standalone comment" + LF + "codeMarkerG2;" + LF;

// True for a copy that strips JS `//` comments at all (regardless of how
// well it handles CRLF or trailing-comment placement - those are the
// classify() axes, checked separately, only for copies that pass this
// gate). False for a copy of a different comment dialect, or one that
// throws on this trivial input.
function isJsSlashSlashDialect(fn: StripFn): boolean {
  try {
    const out = fn(FIXTURE_DIALECT_PROBE_LF);
    return (
      !out.includes("OMEGA_MARKER") && out.includes("codeMarkerG1") && out.includes("codeMarkerG2")
    );
  } catch {
    return false;
  }
}

type Classification = "safe" | "mode1-blind" | "mode2-blind" | "throws";

function classify(fn: StripFn): Classification {
  let wholeline: string;
  let trailingCRLF: string;
  let trailingLF: string;
  try {
    wholeline = fn(FIXTURE_WHOLELINE_CRLF);
    trailingCRLF = fn(FIXTURE_TRAILING_CRLF);
    trailingLF = fn(FIXTURE_TRAILING_LF);
    // Run the remaining fixtures too so a copy that throws on any of them
    // is caught here rather than surfacing as a confusing failure in a
    // later, unrelated assertion.
    fn(FIXTURE_BLOCK_MULTILINE);
    fn(FIXTURE_STRING_LOOKALIKE);
    fn(FIXTURE_UNMATCHED_PAREN);
  } catch {
    return "throws";
  }

  const wholelineOk =
    !wholeline.includes("ALPHA_MARKER") &&
    wholeline.includes("codeMarkerA1") &&
    wholeline.includes("codeMarkerA2");
  const trailingCRLFOk =
    !trailingCRLF.includes("BETA_MARKER") &&
    trailingCRLF.includes("codeMarkerB1") &&
    trailingCRLF.includes("codeMarkerB2");
  const trailingLFOk =
    !trailingLF.includes("GAMMA_MARKER") &&
    trailingLF.includes("codeMarkerC1") &&
    trailingLF.includes("codeMarkerC2");

  if (!wholelineOk) return "mode1-blind";
  if (!trailingCRLFOk || !trailingLFOk) return "mode2-blind";
  return "safe";
}

// Separate axis from CRLF-vs-trailing: does the copy strip comments without
// touching a "//" or "/* */" that lives inside a string literal?
function isStringAware(fn: StripFn): boolean {
  const out = fn(FIXTURE_STRING_LOOKALIKE);
  return out.includes("http://example.com//zzz") && out.includes("ECHO_MARKER");
}

// Separate axis again: does the copy strip a block comment at all? (Two
// real copies never call a `/* */` strip and only strip line comments -
// this is neither mode 1 nor mode 2, it is a third, independent gap the
// fixture set happens to also catch.)
function supportsBlockComments(fn: StripFn): boolean {
  const out = fn(FIXTURE_BLOCK_MULTILINE);
  return !out.includes("DELTA_MARKER") && out.includes("codeMarkerD1") && out.includes("codeMarkerD2");
}

// ---------------------------------------------------------------------------
// Frozen reality, measured 2026-09-28 by running this exact probe. This is
// what the committed assertions lock in - a NEW duplicated copy, or an
// existing one whose behaviour changes, moves a file out of the bucket it
// is pinned to below and turns this test red. Enumeration command named:
// `grep -rlE "function stripComments\(|const stripComments\s*=" --include=*.test.ts src`
// (word-boundary form - a plain `grep -rl "function stripComments"` also
// matches `stripCommentsForScan`, `stripCommentsTopLevel` and
// `stripCommentsAndDollarQuotes`, which are different helpers with a
// shared prefix, not copies of this one).
// ---------------------------------------------------------------------------

// 67 copies that are safe on the two named failure modes (mode 1 and mode
// 2) - the original 28, plus 39 mode-2-blind copies converted to the safe
// form (L13 SECOND CORRECTION: split on a CR-tolerant line-feed pattern,
// then strip an unanchored line-comment pattern per line) on 2026-09-29.
// All 67 are still string-unaware (see below) and 2 of the 67 never strip
// block comments (see BLOCK_COMMENT_UNSUPPORTED).
const SAFE_FILES: readonly string[] = [
  "src/app/actions/action-guard-coverage-github-cohort.test.ts",
  "src/app/actions/carry-module-pattern.test.ts",
  "src/app/actions/current-events-assignments.test.ts",
  "src/app/actions/guard-overtightening.test.ts",
  "src/app/components/autoGradeTransition.wiring.test.ts",
  "src/app/components/canvas-tab/announcements-panel.wiring.test.ts",
  "src/app/components/chat/institutionTriggerWiring.test.ts",
  "src/app/components/content-tab/CourseItemRow.wiring.test.ts",
  "src/app/components/content-tab/courseItemsView.wiring.test.ts",
  "src/app/components/content-tab/modules/CarryModulePatternReviewModal.wiring.test.ts",
  "src/app/components/content-tab/modules/GenerateFromSelectionSection.checkpoints.test.ts",
  "src/app/components/content-tab/modules/askAiSelection.wiring.test.ts",
  "src/app/components/content-tab/modules/bulkBar.wiring.test.ts",
  "src/app/components/content-tab/modules/bulkItemsSection.groups.test.ts",
  "src/app/components/content-tab/modules/bulkItemsSection.rubricSource.wiring.test.ts",
  "src/app/components/content-tab/modules/bulkModulesSection.wiring.test.ts",
  "src/app/components/content-tab/modules/currentEventsAssignments.wiring.test.ts",
  "src/app/components/content-tab/modules/generatedPreviewModal.wiring.test.ts",
  "src/app/components/content-tab/modules/moduleCard.selection.wiring.test.ts",
  "src/app/components/content-tab/modules/teleprompter.wiring.test.ts",
  "src/app/components/content-tab/modules/useLmsGeneration.postSeed.test.ts",
  "src/app/components/content-tab/modules/useRubrics.test.ts",
  "src/app/components/content-tab/modules/visualizerCoverage.wiring.test.ts",
  "src/app/components/courses/FilesCell.wiring.test.ts",
  "src/app/components/courses/lmsConnectionPill.wiring.test.ts",
  "src/app/components/courses/syllabusTemplateUpload.wiring.test.ts",
  "src/app/components/courses/useCourseImportActions.test.ts",
  "src/app/components/courses/useStudentRepoInvitations.test.ts",
  "src/app/components/drafted-grades/classTrends.wiring.test.ts",
  "src/app/components/drafted-grades/classTrendsDraft.wiring.test.ts",
  "src/app/components/grading-recording/GradingCaptureSettings.wiring.test.ts",
  "src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts",
  "src/app/components/grading-recording/copy-feedback.test.ts",
  "src/app/components/grading-recording/grading-rows.test.ts",
  "src/app/components/grading-recording/submission-kind-callsites.structure.test.ts",
  "src/app/components/grading-results/ungradedDisclosure.test.ts",
  "src/app/components/grading-results/ungradedRowLabel.test.ts",
  "src/app/components/knowledge/knowledgeBulkBar.wiring.test.ts",
  "src/app/components/message-replies/MessageCaptureSettings.wiring.test.ts",
  "src/app/components/message-replies/MessageRepliesPanel.wiring.test.ts",
  "src/app/components/message-replies/MessageReplyToolbar.wiring.test.ts",
  "src/app/components/message-replies/MessageThreadRow.wiring.test.ts",
  "src/app/components/message-replies/MessageThreadRowActions.wiring.test.ts",
  "src/app/components/recording/AddKnowledgePages.test.ts",
  "src/app/components/recording/DiscussionCaptureSettings.wiring.test.ts",
  "src/app/components/recording/captureLiveRegion.test.ts",
  "src/app/components/recording/runLogRow.test.ts",
  "src/app/components/repo-grades/repoGrades.wiring.test.ts",
  "src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts",
  "src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts",
  "src/app/components/snapshot-grading/snapshot-grading.structure.test.ts",
  "src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts",
  "src/app/components/snapshot-grading/useSnapshotAutoGrade.wiring.test.ts",
  "src/app/components/snapshot-grading/useSnapshotGrade.wiring.test.ts",
  "src/app/components/tasks/taskInstructionIndicator.wiring.test.ts",
  "src/app/components/ui/buttonVariant.test.ts",
  "src/app/components/ui/confirmArmButtons.test.ts",
  "src/app/components/ui/segmentedToggle.test.ts",
  "src/app/components/workflows/RunFormFields.required-resolution.test.ts",
  "src/app/components/workflows/runtime-field-accessible-labels.test.ts",
  "src/lib/grade/postable.test.ts",
  "src/lib/lms-generation/selection-archive.test.ts",
  "src/lib/module-pattern-transpose.test.ts",
  "src/lib/prompt-announcement-types.test.ts",
  "src/lib/recording-files.kinds.test.ts",
  "src/lib/supabase/courses.structure.test.ts",
  "src/lib/workflow-schedule-blocking-fields.test.ts",
];

// Genuinely trailing-comment-blind (mode 2) copies: none remain. The 39
// that were here were converted to the safe form on 2026-09-29 (L13
// SECOND CORRECTION idiom: `.split(/\r?\n/).map((line) =>
// line.replace(/\/\/.*$/, "")).join("\n")`, matching the in-tree safe form
// at snapshot-grading.structure.test.ts:14-20) and moved to SAFE_FILES
// above. This array is now empty by construction - the goal state for
// L13's mode-2 slice - and the assertion below still holds it to that
// shape rather than deleting the check, so a future mode-2-blind copy
// fails loudly instead of having nowhere to land.
const MODE2_BLIND_FILES: readonly string[] = [];

// Genuinely CRLF-blind (mode 1) copies: none remain. The two that were here
// - src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts
// and src/app/components/grading-recording/submission-kind-callsites.
// structure.test.ts - were converted to the CR-tolerant split
// (`.split(/\r?\n/)`, the same idiom already used by
// action-guard-coverage-github-cohort.test.ts:78 and the in-tree safe form
// at snapshot-grading.structure.test.ts:14-20 /
// useSnapshotGrade.wiring.test.ts:44-51) and moved to SAFE_FILES above. This
// array is now empty by construction - the goal state for L13's mode-1
// slice - and the assertion below still holds it to that shape rather than
// deleting the check, so a future mode-1-blind copy fails loudly instead of
// having nowhere to land.
//
// `src/supabase-migrations.rls-coverage.structure.test.ts` used to be
// listed here too, on the strength of it leaving the probe's JS `//`
// fixtures untouched. It is a SQL comment stripper (removes `--` and
// `/* */`, never `//`) - fed a JS `//` fixture it correctly does nothing,
// because `//` is not a comment in its dialect. That is a dialect
// mismatch, not CRLF-blindness: on its own dialect it strips `--` even on
// CRLF input (indexOf/slice finds `--` and drops the trailing \r with
// it). It is excluded-by-dialect below instead, same as the SQL helper in
// src/supabase-migrations.structure.test.ts already was.
const MODE1_BLIND_FILES: readonly string[] = [];

// Of the 28 SAFE_FILES, these 2 never strip a `/* */` block comment at all
// (their body only ever does a line-comment replace) - a third, independent
// gap from mode 1 and mode 2, caught by the block-comment fixture.
const BLOCK_COMMENT_UNSUPPORTED = new Set<string>([
  "src/app/components/grading-results/ungradedDisclosure.test.ts",
  "src/app/components/grading-results/ungradedRowLabel.test.ts",
]);

const ALL_DEFINED: readonly string[] = [...SAFE_FILES, ...MODE2_BLIND_FILES, ...MODE1_BLIND_FILES];

// Files that mention "stripComments" but are NOT a duplicated definition of
// this helper, with the reason each is not a copy. A file only belongs here
// if it is either (a) importing the helper from a real, non-test module
// (not a duplicate - it is the one shared implementation), (b) a bare prose
// mention with no code use, or (c) a differently-named helper that merely
// shares the "stripComments" prefix. Anything else that mentions
// "stripComments" and is not in ALL_DEFINED must fail the enumeration test
// below rather than vanish silently.
const EXCLUSIONS: Readonly<Record<string, string>> = {
  "src/app/actions/announcement-image.wiring.test.ts":
    "imports stripComments from the shared module @/app/components/ui/modalAdoptionSourceScan - not a duplicated definition",
  "src/app/api/visualizer/create/route.test.ts":
    "prose comment referencing another file's stripComments helper - no code use",
  "src/app/components/message-replies/useMessageReplies.wiring.test.ts":
    "imports stripComments from the shared module @/app/components/ui/modalAdoptionScan - not a duplicated definition",
  "src/app/components/recording/announcementImagePipeline.wiring.test.ts":
    "imports stripComments from the shared module @/app/components/ui/modalAdoptionSourceScan - not a duplicated definition",
  "src/app/components/recording/avatar-script.test.ts":
    "prose comment referencing a stripComments helper elsewhere - no code use",
  "src/app/components/ui/modalAdoption.wiring.test.ts":
    "imports stripComments from the shared module ./modalAdoptionScan - not a duplicated definition",
  "src/app/components/ui/modalAdoptionWiring.attributes.test.ts":
    "imports stripComments from the shared module ./modalAdoptionScan - not a duplicated definition",
  "src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts":
    "imports stripComments from the shared module @/app/components/ui/modalAdoptionScan - not a duplicated definition",
  "src/lib/grade/rubric-provenance-producers.structure.test.ts":
    "imports stripComments from the shared module @/app/components/ui/modalAdoptionSourceScan - not a duplicated definition",
  "src/supabase-migrations.structure.test.ts":
    "defines stripCommentsAndDollarQuotes, a SQL-specific helper with a shared name prefix, not this helper",
  "src/supabase-migrations.rls-coverage.structure.test.ts":
    "SQL-dialect stripper: removes -- and /* */, never // - fails the dialect probe (does not touch a plain-LF // comment at all), so it is not comparable to the JS-// copies and is excluded rather than classified mode1-blind",
  "src/tools/backlog/backlog-file.structure.test.ts":
    "prose comment mentioning the stripComments backlog item - no code use",
};

// Files excluded above specifically because they fail the JS-// dialect
// probe (as opposed to importing a shared module, or being a bare prose
// mention). Kept separate from EXCLUSIONS' keys so the "classifies every
// pinned copy by dialect" check below can assert dialect-detection found
// exactly these and no others, without re-deriving EXCLUSIONS' full set
// (which also holds non-dialect reasons).
const DIALECT_EXCLUDED_FILES: readonly string[] = ["src/supabase-migrations.rls-coverage.structure.test.ts"];

// This probe file itself mentions "stripComments" dozens of times in its
// own prose and fixture strings - it is the instrument, not a copy, and is
// excluded from its own enumeration by path rather than by classifying
// itself as a definition or an exclusion.
const PROBE_FILE_REL = "src/tools/strip-comments-agreement.structure.test.ts";

describe("stripComments test-helper agreement (L13 behavioural probe)", () => {
  it("accounts for every stripComments mention in src/**/*.test.ts - none silently skipped", () => {
    const mentioning = walkTestFiles(SRC_DIR)
      .filter((f) => fs.readFileSync(f, "utf8").includes("stripComments"))
      .map(toRepoRelative)
      .filter((f) => f !== PROBE_FILE_REL);

    const definedSet = new Set(ALL_DEFINED);
    const excludedSet = new Set(Object.keys(EXCLUSIONS));

    // Nothing found today is unaccounted for. A new file that mentions
    // stripComments - a new duplicated copy, or a new import, or a new
    // prose reference - fails here until it is added to ALL_DEFINED (with
    // a classification below) or to EXCLUSIONS (with a reason).
    const unaccounted = mentioning.filter((f) => !definedSet.has(f) && !excludedSet.has(f));
    expect(unaccounted, "unaccounted-for stripComments mention(s): add to a classification bucket or to EXCLUSIONS with a reason").toEqual([]);

    // Nothing pinned below has silently disappeared (a file renamed or
    // rewritten to no longer mention stripComments would go undetected
    // otherwise, and the frozen buckets would drift from reality).
    const found = new Set(mentioning);
    const missing = [...definedSet, ...excludedSet].filter((f) => !found.has(f));
    expect(missing, "file(s) pinned in this probe no longer mention stripComments - remove or update").toEqual([]);

    // No file is double-counted as both a definition and an exclusion.
    const doubleCounted = ALL_DEFINED.filter((f) => excludedSet.has(f));
    expect(doubleCounted).toEqual([]);

    // The core invariant the brief asks for: parsed + excluded == total
    // found, so a new unparseable copy fails loudly instead of vanishing.
    expect(ALL_DEFINED.length + Object.keys(EXCLUSIONS).length).toBe(mentioning.length);
  });

  it("every defined copy still parses and evaluates in isolation", () => {
    for (const file of ALL_DEFINED) {
      expect(() => loadCopy(file), `${file} failed to extract/evaluate`).not.toThrow();
    }
  });

  it("dialect probe: every JS-// classification bucket member actually strips JS // comments, and every dialect-excluded file actually does not", () => {
    // This is what keeps a differently-dialected helper (a SQL `--`
    // stripper, or any future non-JS-// copy) out of the JS-// buckets by
    // construction rather than by a hardcoded filename: ALL_DEFINED must
    // pass the dialect probe, and DIALECT_EXCLUDED_FILES must fail it. If
    // either side flips, the classification buckets below would be
    // comparing incompatible things again.
    for (const file of ALL_DEFINED) {
      expect(isJsSlashSlashDialect(loadCopy(file)), `${file} should strip JS // comments`).toBe(true);
    }
    for (const file of DIALECT_EXCLUDED_FILES) {
      expect(isJsSlashSlashDialect(loadCopy(file)), `${file} should NOT strip JS // comments`).toBe(false);
    }
  });

  it("classifies every safe copy as safe on both the CRLF and trailing-comment axes", () => {
    for (const file of SAFE_FILES) {
      expect(classify(loadCopy(file)), file).toBe("safe");
    }
  });

  it("classifies every pinned mode-2 copy as trailing-comment-blind", () => {
    for (const file of MODE2_BLIND_FILES) {
      expect(classify(loadCopy(file)), file).toBe("mode2-blind");
    }
  });

  it("classifies every pinned mode-1 copy as CRLF-blind", () => {
    for (const file of MODE1_BLIND_FILES) {
      expect(classify(loadCopy(file)), file).toBe("mode1-blind");
    }
  });

  it("no duplicated copy is string-literal-aware (documented finding, not a pass)", () => {
    // Measured: every one of the 68 copies strips "//" and "/* */" wherever
    // they appear, including inside a string literal. This is a uniform,
    // real gap - not this probe failing to discriminate. It is asserted as
    // "all unaware" (a stronger claim than "some unaware") because that is
    // what was measured; a copy that becomes string-aware would be a
    // genuine improvement and this assertion is meant to surface it rather
    // than hide it.
    for (const file of ALL_DEFINED) {
      expect(isStringAware(loadCopy(file)), file).toBe(false);
    }
  });

  it("block-comment support matches the pinned exception set", () => {
    for (const file of ALL_DEFINED) {
      const supports = supportsBlockComments(loadCopy(file));
      expect(supports, file).toBe(!BLOCK_COMMENT_UNSUPPORTED.has(file));
    }
  });

  describe("the classifier discriminates behaviour, not syntax (self-check, no real file mutated)", () => {
    it("classifies a hand-written CRLF-blind (mode 1) helper as mode1-blind", () => {
      const fn = toCallable(
        'function stripComments(source) { return source.split("\\n").map(function (line) { return line.replace(/\\/\\/.*$/, ""); }).join("\\n"); }'
      );
      expect(fn).not.toBeNull();
      expect(classify(fn as StripFn)).toBe("mode1-blind");
    });

    it("classifies a hand-written trailing-comment-blind (mode 2) helper as mode2-blind", () => {
      const fn = toCallable('function stripComments(source) { return source.replace(/^[ \\t]*\\/\\/.*$/gm, ""); }');
      expect(fn).not.toBeNull();
      expect(classify(fn as StripFn)).toBe("mode2-blind");
    });

    it("classifies the safe in-tree form as safe", () => {
      const fn = toCallable(
        'function stripComments(source) { return source.replace(/\\/\\*[\\s\\S]*?\\*\\//g, "").split(/\\r?\\n/).map(function (line) { return line.replace(/\\/\\/.*$/, ""); }).join("\\n"); }'
      );
      expect(fn).not.toBeNull();
      expect(classify(fn as StripFn)).toBe("safe");
    });

    it("extraction survives a regex literal containing braces and parens in the body", () => {
      // The row's first probe brace-matched and lost 8 files to this - a
      // regex like [\s\S] or a literal paren inside a string would desync
      // a naive scanner's depth count. The TS-parser extraction above does
      // not have this failure mode; this pins that with a synthetic body
      // that would defeat brace-matching (an unbalanced-looking regex/paren
      // inside a string) but must not defeat a real parse.
      const text =
        'function stripComments(source) { var weird = "(unbalanced { paren"; return source.replace(/\\/\\*[\\s\\S]*?\\*\\//g, "").split(/\\r?\\n/).map(function (line) { return line.replace(/\\/\\/.*$/, ""); }).join("\\n"); }';
      const fn = toCallable(text);
      expect(fn).not.toBeNull();
      expect(classify(fn as StripFn)).toBe("safe");
    });
  });
});
