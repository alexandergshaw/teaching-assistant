import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { computeForbiddenReachability } from "@/lib/module-graph/runtime-import-graph";

// EXTRACTION (RULING 101, docs/r2-wave1-subwaves.md section 6): split off
// action-guard-coverage.test.ts, which was at 955 of the 1000-line ceiling
// (src/file-size-ceiling.structure.test.ts, LIMIT = 1000 at :41, compared as
// `lineCount > limit` at :140, and there is no ALLOWED_OVERAGE entry for that
// file). The seventeen queued R2 wave-1 sub-waves add up to 314 lines of
// GITHUB_NOT_OWNER_ONLY entries, which would have carried it to 1283. This
// file holds exactly the R2 wave 0 "GitHub-PAT cohort defaults to owner-only"
// block (docs/r2-scope.md, RULINGS 80/83/84) plus githubReachingActionFiles(),
// moved verbatim from the source file.
//
// vitest collects this file on its own (src/**/*.test.ts), so it needs its
// own copy of every helper the moved block calls. collectActionExports() and
// githubReachingActionFiles() are DUPLICATED below rather than imported from
// action-guard-coverage.test.ts, because importing a helper from another
// *.test.ts re-runs that file's describe blocks (a recorded hazard in this
// repo - see the "no cross-test-file imports" note). Both helpers also stay,
// unchanged, in action-guard-coverage.test.ts, because its own root-layout,
// ratchet, owner-only and media describes still call collectActionExports()
// directly and would otherwise lose it.

// Carried from the source file's own L15 note: this file walks a real
// directory tree / reads many real files (collectActionExports() and
// githubReachingActionFiles() both call collectCandidateFiles() over
// src/app). vitest's 5000ms default testTimeout treats that as slow-but-fine
// alone and as a false timeout under concurrent `npm test` load from sibling
// agents. Raised to the repo's existing slow-test convention of 30_000,
// already used by action-guard-coverage.test.ts and others.
vi.setConfig({ testTimeout: 30_000 });

const APP_DIR = path.join(process.cwd(), "src", "app");
// srcRoot for the walkRuntimeGraph closure check below - the tool's own
// WalkOptions shape, not this file's APP_DIR (which is one level deeper,
// src/app).
const SRC_ROOT = path.join(process.cwd(), "src");
const GUARD_CALL = /\brequire(Owner|User|AppOwner)\s*\(/;
const BARE_REQUIRE_USER_CALL = /\brequireUser\s*\(/;
const REQUIRE_APP_OWNER_CALL = /\brequireAppOwner\s*\(/;

/**
 * RULING 124, closing two proven holes in the M4b check below (both
 * demonstrated by execution, docs/ruling-124.md):
 *
 *   W1: the check asserted requireUser() was PRESENT and never that
 *   requireAppOwner() was ABSENT, so a body calling both passed while being
 *   owner-only in effect.
 *   W2: the collector never stripped comments, so a flip to
 *   requireAppOwner() that left the old call behind as `// requireUser()`
 *   still satisfied the presence check.
 *
 * Duplicated, not imported, from guard-overtightening.test.ts's own
 * `stripComments` (which that file's own header says is itself duplicated
 * from this file's collector, for the same "no cross-test-file imports"
 * reason) - importing a helper from another `*.test.ts` file re-runs that
 * file's describe blocks (a recorded hazard in this repo). Block comments
 * first (an inner JSDoc on a parameter sits inside the body slice), then line
 * comments with the UNANCHORED `/\/\/.*$/` form - the anchored
 * `/^[ \t]*\/\/.*$/` variant is blind to a trailing comment, which is exactly
 * the bypass shape this ruling closes. No `/s` flag anywhere: it passes
 * vitest and fails tsc with TS1501.
 *
 * WHAT THIS STRIPPER STILL CANNOT SEE, stated once so this file does not
 * claim more than it measures: it strips `//` and `/* *\/` lexically, with no
 * awareness of string or template-literal boundaries, so a `//` or `/*`
 * embedded inside a STRING that itself contains a real guard call on the
 * same or a following text region could in principle be misread. The
 * positive control below proves the one shape that actually occurs in this
 * codebase - a URL literal on its own line followed by a real call on a LATER
 * line - is not eaten; it does not prove every conceivable string shape is
 * safe.
 */
function stripComments(body: string): string {
  const withoutBlocks = body.replace(/\/\*[\s\S]*?\*\//g, "");
  return withoutBlocks
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

interface ActionExport {
  file: string;
  name: string;
  line: number;
  guarded: boolean;
  // Full source of the export, from its signature line up to (excluding)
  // the closing brace - kept so a caller can check WHICH guard was used.
  body: string;
}

function isUseServerModule(text: string): boolean {
  return /^\s*["']use server["']/m.test(text);
}

/**
 * Recursively list every non-test .ts/.tsx file under `dir`. Duplicated from
 * action-guard-coverage.test.ts - see the header comment above for why.
 */
function collectCandidateFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      found.push(...collectCandidateFiles(path.join(dir, entry.name)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (entry.name.includes(".test.")) continue;
    found.push(path.join(dir, entry.name));
  }
  return found;
}

/**
 * Collect every `export async function` in every "use server" module
 * anywhere under src/app, and whether its body calls a guard. Duplicated
 * from action-guard-coverage.test.ts - see the header comment above for why.
 */
function collectActionExports(): ActionExport[] {
  const found: ActionExport[] = [];

  for (const filePath of collectCandidateFiles(APP_DIR)) {
    const text = fs.readFileSync(filePath, "utf8");
    if (!isUseServerModule(text)) continue;

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const match = /^export async function (\w+)/.exec(lines[i]);
      if (!match) continue;
      let end = i + 1;
      while (end < lines.length && lines[end] !== "}") end++;
      const body = lines.slice(i, end).join("\n");
      found.push({
        file: path.relative(APP_DIR, filePath).replace(/\\/g, "/"),
        name: match[1],
        line: i + 1,
        guarded: GUARD_CALL.test(body),
        body,
      });
    }
  }

  return found;
}

/**
 * R2 wave 0 (docs/r2-scope.md section 3, RULING 80): recomputes the
 * GitHub-PAT cohort by walking the REAL import graph from every "use server"
 * module under src/app, instead of trusting a static file list. A specifier-
 * string filter is exactly what missed the exposure this row exists to
 * close - `src/lib/grade/repo-content.ts`'s RELATIVE import of `../github`
 * was invisible to a filter that only matched `@/lib/github`-prefixed or
 * canvas-named specifiers. `walkRuntimeGraph`
 * (src/lib/module-graph/runtime-import-graph.ts) already does a real,
 * TypeScript-compiler-parsed closure walk - built for a different wall
 * (client-bundle vs server-only, docs/a23-architecture.md) but the walk
 * itself is exactly "can file X reach module Y transitively," which is this
 * question with a different forbidden target.
 *
 * Uses `computeForbiddenReachability`, not `walkRuntimeGraph` directly: this
 * function calls the walk once per "use server" root (currently 100 of
 * them), and a fresh per-root `walkRuntimeGraph` call re-reads and re-parses
 * every shared file in the closure from scratch for every root that reaches
 * it - measured at 12,781 total file visits across 100 separate walks
 * against only 530 actually-unique files, an ~24x redundancy that was the
 * dominant cost of this test under `npm test` (RULING 119). No new walker is
 * written here, per Ruling 80's own instruction to look for one before
 * writing one - `computeForbiddenReachability` lives beside `walkRuntimeGraph`
 * in runtime-import-graph.ts and answers the identical reachability question
 * for many roots at the read/parse cost of one shared graph, by memoizing
 * "does this file's own closure reach the forbidden module" per file rather
 * than per (root, file) pair - see that function's own doc comment for why
 * this does not repeat the shared-visited-set hazard in
 * docs/loop/traps-spec.md (a memoized per-node ANSWER, finalized only after
 * all of that node's own edges are examined, is order-independent in a way a
 * shared mutable `visited` set that returns early is not).
 *
 * `treatUseServerAsWall: false` is deliberate, not a default left alone: the
 * tool's "use server" wall exists to stop a walk from a CLIENT entry point at
 * the RPC boundary; here the walk starts FROM a server action file and must
 * be allowed to follow that very file's own edges, or it would find nothing
 * for any root.
 *
 * This is what makes GITHUB_FILES a FLOOR rather than a trusted final list
 * (R2-r9's own rule, restated in docs/r2-scope.md section 7): a file added
 * later whose own module graph starts reaching `lib/github.repos.ts` is
 * caught here the moment it exists, before anyone remembers to add it to the
 * enumeration by hand - see "GITHUB_FILES tracks the live closure" below.
 *
 * Duplicated from action-guard-coverage.test.ts - see the header comment
 * above for why.
 */
function githubReachingActionFiles(): Set<string> {
  const roots = collectCandidateFiles(APP_DIR).filter((filePath) => isUseServerModule(fs.readFileSync(filePath, "utf8")));
  const reachingAbs = computeForbiddenReachability(roots, {
    srcRoot: SRC_ROOT,
    forbiddenPathPrefixes: ["lib/github.repos.ts"],
    browserSafeModules: [],
    treatUseServerAsWall: false,
  });
  const reaching = new Set<string>();
  for (const abs of reachingAbs) {
    reaching.add(path.relative(APP_DIR, abs).replace(/\\/g, "/"));
  }
  return reaching;
}

/**
 * R2 wave 0 (docs/r2-scope.md, RULINGS 80/83/84): the instrument that will
 * police the requireOwner() call-site reclassification, landed BEFORE any
 * of the 255 GitHub-cohort call sites moves off the deprecated alias
 * (docs/r2-scope.md section 7, "lands red-then-green so the instrument is
 * proven before it is trusted" - restored from the prior draft after the
 * check (docs/r2-check.md, B5.1) found a version of this document that
 * dropped it).
 *
 * THE POLARITY (RULING 83), stated once so nobody re-derives it wrong: the
 * media block in action-guard-coverage.test.ts (MEDIA_OWNER_ONLY_ACTIONS)
 * defaults its cohort to PERMISSIVE and lists the RESTRICTIVE exceptions,
 * because media's resource is shared and non-owner-private - permissive is
 * safe there. The owner's GitHub personal access token is the opposite kind
 * of resource: a single-owner secret, where permissive IS the harm. A block
 * modelled line-for-line on the media block (defaulting the cohort to
 * requireUser(), listing restrictive exceptions) would therefore PIN THE
 * EXPOSURE GREEN - exactly the defect docs/r2-check.md's Ruling 83 finding is
 * about. This block is the CONVERSE: the cohort defaults to
 * requireAppOwner(), and GITHUB_NOT_OWNER_ONLY lists the PERMISSIVE
 * exceptions - each one an action a per-action review has already proven
 * safe on requireUser(). It starts empty, because no per-action review has
 * run yet; that is wave 1-3's job, not this wave's.
 *
 * WHAT THIS INSTRUMENT IS, STATED HONESTLY (RULING 81, correcting a checked
 * draft's own "EXECUTES the guard-name check" - that was a verb dressing up
 * a grep): every assertion below is a regex over source text
 * (BARE_REQUIRE_USER_CALL / REQUIRE_APP_OWNER_CALL against `action.body`,
 * itself a text slice from `collectActionExports()`), except the closure
 * membership check, which is a real TypeScript-parsed import-graph walk
 * (`githubReachingActionFiles()`) but still never RUNS anything - no guard
 * executes, no Supabase client is mocked, no authorization decision is
 * exercised. That is a legitimate COVERAGE NET - cheap, and it is exactly
 * what would have caught the media cohort's four leftover alias sites - but
 * it cannot see a correctly-NAMED guard sitting on the WRONG resource, only
 * a wrongly-named one. The instrument that catches THAT is the repo's real
 * executing idiom, `src/lib/supabase/auth.test.ts:432-493`
 * (`requireAppOwner()` mocked and actually invoked against an `active`
 * non-owner, asserted to reject) - a per-action test in that shape belongs
 * to wave 1-3, written the same day each call site's guard actually changes,
 * which is out of this wave's write set (no guard call site moves here).
 *
 * WHAT A MECHANICAL RENAME DOES NOT SATISFY: a global find-replace of every
 * `requireOwner(` call in the 41 GITHUB_FILES to `requireUser(` is textually
 * different and behaviourally IDENTICAL (both admit any active account, not
 * just the owner) - it would satisfy a check that only asserts "no
 * `requireOwner` remains in src", and would satisfy nothing else this file
 * already had (BUG 2(b)'s GUARD_CALL treats all three names as equivalent
 * "some guard" evidence). It does NOT satisfy "no action in a GITHUB_FILES
 * module calls requireUser() directly unless reviewed safe" below, because
 * that check does not care what a call USED to say, only what it calls NOW -
 * see the "mechanical rename" sabotage in the wave-0 report for the verbatim
 * red this produces.
 */

// R2 wave 0: the 41 production files whose module graph closure-reaches
// `lib/github.repos.ts` (docs/r2-scope.md section 3 - 255 requireOwner()
// call sites today, reproduced in this checkout: `grep -c "await
// requireOwner()" <these 41 files> | awk -F: '{s+=$2} END {print s}'` -> 255).
// Keyed the same way ActionExport.file is - relative to APP_DIR (src/app),
// forward slashes. This is a FLOOR, not the trusted final set - see
// githubReachingActionFiles() and the "tracks the live closure" test below,
// which recomputes membership from the real import graph on every run and
// fails the moment a file this list does not know about starts reaching the
// same target (R2-r9's rule: an enumeration is a floor, never the set).
const GITHUB_FILES = new Set([
  "actions/accommodations.ts",
  "actions/automation-runs.ts",
  "actions/canvas-inbox.ts",
  "actions/canvas-modules.ts",
  "actions/carry-module-pattern.ts",
  "actions/castletop.ts",
  "actions/command-interface.ts",
  "actions/course-calendar.ts",
  "actions/course-hub-core.ts",
  "actions/course-hub-integrations.ts",
  "actions/course-intel.ts",
  "actions/course-project.ts",
  "actions/current-events-assignments.ts",
  // R4 (docs/r4-scope.md): moved in from GITHUB_FILES_PENDING_ENUMERATION
  // once each action was per-action reviewed against both owner-private
  // targets (lib/github.repos.ts, lib/canvas-credentials.ts).
  "actions/deck-source.ts",
  "actions/github-content.ts",
  "actions/github-repos.ts",
  "actions/github-student-repos.ts",
  "actions/github.ts",
  "actions/grading-inbox.ts",
  // RULING 108: prepareGradingRunAction reaches lib/github via
  // extractCanvasEntries -> lib/grade/extraction.ts -> repo-content.ts's
  // fetchGradableRepoContent, the same GitHub-PAT path as this file's
  // precedent (grading.ts). Was requireUser() as shipped by A39 wave 4;
  // moved to requireAppOwner() rather than left in GITHUB_NOT_OWNER_ONLY,
  // since it does the identical ingestion work grading.ts's owner-only
  // actions do.
  "actions/grading-incremental.ts",
  "actions/grading.ts",
  "actions/institutions.ts",
  "actions/live-class.ts",
  "actions/llm-tools.ts",
  "actions/lms-generation-refine.ts",
  "actions/lms-generation.ts",
  "actions/lms-syllabus-buttons.ts",
  "actions/media-likeness.ts",
  "actions/messaging-outlook.ts",
  "actions/messaging.ts",
  "actions/repo-grades.ts",
  "actions/selection-chat-context.ts",
  "actions/submission-repo.ts",
  "actions/syllabus-templates.ts",
  "actions/syllabus-upload.ts",
  "actions/visualizer-coverage.ts",
  "actions/visualizer-selection.ts",
  "actions/visualizer.ts",
  "actions/walkthrough-announcement.ts",
  "actions/weekly-announcement-drafting.ts",
  "api/automations/run-now/route.ts",
  "api/lms-export/selection/route.ts",
  "api/lms-generation/deck-from-capture/route.ts",
  "api/lms-generation/deck/route.ts",
  "api/visualizer/create/route.ts",
]);

// R2 wave 0 (RULING 83): the PERMISSIVE exceptions inside an otherwise
// owner-only cohort - the mirror image of MEDIA_OWNER_ONLY_ACTIONS in
// action-guard-coverage.test.ts, which lists the RESTRICTIVE exceptions
// inside an otherwise-permissive cohort. Populated by R4's per-action review
// (docs/r4-scope.md section 2), each entry carrying a one-line stated
// reason. Traced against BOTH owner-private targets (lib/github.repos.ts,
// lib/canvas-credentials.ts - RULING 90): none of these nine reaches the
// GitHub PAT, and the one that reaches the Canvas credential resolver
// (postWalkthroughAnnouncementAction) is contained at
// resolveCanvasCredential, which only reaches the owner's env pair when the
// CALLING identity's own role is "owner" - see docs/r4-scope.md section 2.4.
const GITHUB_NOT_OWNER_ONLY: Record<string, string> = {
  extractDeckSourceFileAction:
    "reads only the caller's own uploaded bytes via extractTextFromBuffer/checkWireBudget - never touches the ./github edge its sibling extractDeckSourceRepoAction does",
  getMostRecentAnnouncementExemplarAction:
    "reads only the caller's own Supabase row (announcement-exemplars.ts, scoped on user.id) - no GitHub or Canvas import",
  listAnnouncementExemplarsAction:
    "reads only the caller's own Supabase row (announcement-exemplars.ts, scoped on user.id) - no GitHub or Canvas import",
  saveAnnouncementExemplarAction:
    "writes only the caller's own Supabase row (announcement-exemplars.ts, scoped on user.id) - no GitHub or Canvas import",
  deleteAnnouncementExemplarAction:
    "deletes only the caller's own Supabase row (announcement-exemplars.ts, scoped on user.id) - no GitHub or Canvas import",
  gatherWalkthroughResourcesAction:
    "calls deriveResourceConcepts (./learning-resources-generator) and findResourceLinksForConceptsAction (./learning-resource-links) - both walk to zero violations against either target",
  draftWalkthroughAnnouncementAction:
    "calls only callLlm/prompt builders - never calls createAnnouncementFromMarkdown, the file's one Canvas call site",
  draftWalkthroughVideoScriptAction:
    "calls only callLlm/prompt builders - never calls createAnnouncementFromMarkdown, the file's one Canvas call site",
  postWalkthroughAnnouncementAction:
    "its one call to createAnnouncementFromMarkdown reaches resolveCanvasCredential, which only touches the owner's env pair when the CALLING identity's own role is 'owner' - a non-owner caller gets CANVAS_CREDENTIAL_REQUIRED_MESSAGE, never the owner's Canvas token",
  // R2 wave 1, sub-wave 5 (docs/r2-wave1-subwaves.md section 4, row SW5):
  // extractDeckConceptsAction (actions/visualizer.ts) calls only callLlm and
  // the pure helpers clampDeckConcepts/parseDeckConcepts/conceptsFromSlideTitles
  // - never getFileText or putFile, the two names this file imports from
  // "@/lib/github" and the only calls its sibling actions
  // (findVisualizerConceptAction, createVisualizerConceptAction) make. Those
  // two moved to requireAppOwner(); this one stays requireUser().
  extractDeckConceptsAction:
    "calls only callLlm and the pure deck-concepts helpers - never getFileText/putFile, the file's only GitHub PAT calls, which its sibling actions make instead",
  // R2 wave 1, sub-wave 6 (docs/r2-wave1-subwaves.md section 4, row SW6):
  // live-class.ts's transcribeLiveAudioAction and answerLiveQuestionAction
  // call only callLlm plus pure/local helpers (buildAnswerPrompt,
  // parseAnswerResponse, resolveDocsLinks, resolveVisualizerLinks against an
  // already-loaded index) - neither reaches getFileText, this file's only
  // GitHub PAT call, which loadVisualizerIndexAction alone makes.
  transcribeLiveAudioAction:
    "calls only callLlm and pure transcript helpers - never getFileText, this file's only GitHub PAT call, which loadVisualizerIndexAction alone makes",
  answerLiveQuestionAction:
    "calls only callLlm plus pure/local link helpers (resolveDocsLinks, resolveVisualizerLinks against an already-loaded index) - never getFileText, this file's only GitHub PAT call, which loadVisualizerIndexAction alone makes",
  // buildLiveSessionContextAction reaches Canvas (via gatherModuleMaterials's
  // "live-lms" source) and Supabase Storage (buildServerMaterialLoaders's
  // course-export path) but never GitHub: it does not import getFileText/
  // putFile, and every Canvas read it triggers funnels through
  // resolveCanvasCredential (src/lib/canvas-credentials.ts:189), which reads a
  // non-owner CALLER's own stored credential first and only falls through to
  // the owner's env pair when the calling identity's own role is "owner" -
  // the same containment RULING 83's postWalkthroughAnnouncementAction entry
  // above relies on for Canvas.
  buildLiveSessionContextAction:
    "reaches Canvas only through resolveCanvasCredential, which touches the owner's env pair solely when the CALLING identity's own role is 'owner' - never getFileText/putFile, this file's only GitHub PAT calls",
  // repo-grades.ts's listCourseAssignmentsAction reaches Canvas via
  // listAssignments -> resolveInstitutionByCode -> resolveCanvasCredential -
  // the same contained path as buildLiveSessionContextAction above. It never
  // imports listOrgRepos/getRepoTree, this file's only GitHub PAT calls,
  // which loadOrgRepoTreesAction alone makes.
  listCourseAssignmentsAction:
    "reaches Canvas only through resolveCanvasCredential, which touches the owner's env pair solely when the CALLING identity's own role is 'owner' - never listOrgRepos/getRepoTree, this file's only GitHub PAT calls",
  // R2 wave 1, sub-wave 7 (docs/r2-wave1-subwaves.md section 4, row SW7):
  // actions/grading.ts's 20 requireOwner() call sites, re-derived rather than
  // inherited - the plan predicted ~2 restrictive / ~18 permissive; this file
  // is 3 restrictive (gradeAction, gradeOneSubmissionAction -
  // canvasWorkToEntry's fetchGradableRepoContent reaches lib/github.repos.ts
  // uncontained, the same GitHub-PAT path RULING 108's grading-incremental.ts
  // precedent traces; runSubmissionCodeAction - relays code execution through
  // the server's own PISTON_API_KEY/WANDBOX_API_URL, a shared server secret
  // read directly from process.env in src/lib/code-runner.ts with no
  // per-caller containment, the same shape as the GitHub PAT) and 16
  // permissive (17 call sites - draftZerosForMissingAction alone has two).
  // Every Canvas reach below is contained the same way SW5/SW6 established:
  // resolveInstitution/resolveInstitutionByCode -> resolveCanvasCredential
  // (src/lib/canvas-credentials.ts:189) reads the CALLING identity's own
  // stored credential first and only falls through to the owner's env pair
  // when that identity's own role is "owner".
  findPendingGradingDraftForWorkflowAction:
    "looks up the caller's own pending grading draft for a workflow+source via findPendingGradingDraftForWorkflow (grading-drafts.ts, scoped on user.id) - Supabase only, no GitHub or Canvas import",
  fetchCanvasMetaAction:
    "fetches one assignment/discussion's description+rubric via fetchCanvasMeta, contained by resolveInstitution -> resolveCanvasCredential (reads the CALLING identity's own stored Canvas credential first) - never reaches the GitHub PAT",
  postCanvasGradesAction:
    "posts grades/comments to Canvas via postCanvasGrades, contained the same way as fetchCanvasMetaAction - never reaches the GitHub PAT",
  saveGradingDraftAction:
    "creates a new grading draft row scoped to the caller's own user.id via createGradingDraft (grading-drafts.ts) - Supabase only, no GitHub or Canvas import",
  listMissingSubmissionsAction:
    "lists non-submitters for a Canvas course/assignment via the same contained resolveInstitution path plus listAssignmentBriefsWithDue/listAssignmentNonSubmitters - never reaches the GitHub PAT",
  draftZerosForMissingAction:
    "drafts zero grades for Canvas non-submitters via the same contained resolveInstitution path, then saves the draft under the caller's own user.id - never reaches the GitHub PAT",
  listPendingGradingDraftsAction:
    "lists only the caller's own pending drafts via listPendingGradingDrafts (grading-drafts.ts, scoped on user.id) - Supabase only",
  getGradingDraftAction:
    "reads one of the caller's own drafts via getGradingDraft (grading-drafts.ts, scoped on user.id) - Supabase only",
  markGradingDraftReviewedAction:
    "marks one of the caller's own drafts reviewed via markGradingDraftReviewed (grading-drafts.ts, scoped on user.id) - Supabase only",
  deleteGradingDraftAction:
    "deletes one of the caller's own drafts via deleteGradingDraft (grading-drafts.ts, scoped on user.id) - Supabase only",
  updateGradingDraftPayloadAction:
    "edits one of the caller's own drafts' payload via updateGradingDraft (grading-drafts.ts, scoped on user.id) - Supabase only",
  deriveAssignmentChecklistAction:
    "derives a full-credit checklist from instructions/rubric text via deriveFullCreditChecklist - calls only the LLM, no GitHub or Canvas import",
  postGradingDraftAction:
    "posts one of the caller's own drafts' gradable results to Canvas via postCanvasGradesAction, the same contained Canvas path - never reaches the GitHub PAT",
  pullSubmissionAction:
    "pulls one submission's detail via fetchSubmissionDetail, contained by resolveInstitutionByCode -> resolveCanvasCredential - never reaches the GitHub PAT",
  generateModelAnswerAction:
    "generates a sample model answer from instructions/rubric via generateSampleAnswer - calls only the LLM, no GitHub or Canvas import",
  generateFullCreditChecklistAction:
    "synthesizes a full-credit checklist from instructions/rubric via synthesizeFullCreditChecklist - calls only the LLM, no GitHub or Canvas import",
};

// WAVE-0 FINDING, not an R2-scoped classification (see the "tracks the live
// closure" test below for the full account): docs/r2-scope.md derived its
// 81-file/41-file/255-call cohort from `grep -rlE "await requireOwner\(\)"`,
// which is blind to a file that already stopped calling the alias. Walking
// EVERY "use server" file's own closure (not just those 81) originally found
// 4 files ALSO reaching lib/github.repos.ts, entirely outside R2's stated
// universe. R4 (docs/r4-scope.md) per-action reviewed three of them against
// both owner-private targets (lib/github.repos.ts, lib/canvas-credentials.ts)
// and folded them into GITHUB_FILES/GITHUB_NOT_OWNER_ONLY above:
//   - actions/deck-source.ts: 1 of 2 actions (extractDeckSourceRepoAction)
//     genuinely reaches the GitHub PAT via ingestRepoAction and moved to
//     requireAppOwner(); the other (extractDeckSourceFileAction) stays
//     requireUser(), reviewed safe.
//   - actions/walkthrough-announcement.ts: 8 actions, all reviewed safe on
//     requireUser() - its own header comment ("every action below calls
//     requireUser() explicitly, never requireOwner()") shows the migration
//     happened without the GitHub-reachability question having been asked
//     before R4.
//   - actions/media-likeness.ts: already requireAppOwner() on every action
//     (the R3 media wave) - safe today, now folded into GITHUB_FILES.
// Still pending: actions/llm-content.ts - no guard call at all on any
// export, a PINNED_UNGUARDED matter (already tracked by name in
// action-guard-coverage.test.ts), not a wrong-guard matter; still
// closure-reaches GitHub, so still named here rather than left for a reader
// to rediscover (R4-r2, docs/r4-scope.md section 7).
// SHRINK-ONLY: this is not a safety classification (unlike
// GITHUB_NOT_OWNER_ONLY) - it is a record of "known, not yet folded into a
// per-action review." A name leaves this list only when GITHUB_FILES or
// GITHUB_NOT_OWNER_ONLY takes it over for real; nothing may be added without
// deliberately widening this comment to say why.
const GITHUB_FILES_PENDING_ENUMERATION = new Set([
  "actions/llm-content.ts",
]);

describe("R2 wave 0: GitHub-PAT cohort defaults to owner-only (RULING 83)", () => {
  // RES-1 / W4, closed 2026-09-28. Nothing pinned this set's SIZE, so an entry
  // could be deleted in the SAME commit that flips its site to owner-only: the
  // loop below would then have nothing to check for it, the cohort's own
  // owner-only default would accept the tightened site, and no instrument would
  // record that a capability was removed. The media cohort has pinned its own
  // count since it was written; this one did not.
  //
  // Bump this number in the SAME commit that adds or removes an entry, and only
  // ever deliberately - never to make a red go away.
  it(
    "GITHUB_NOT_OWNER_ONLY has exactly the reviewed-permissive entries we expect - a deletion must be deliberate",
    () => {
      expect(Object.keys(GITHUB_NOT_OWNER_ONLY).length).toBe(30);
    }
  );

  it("every GITHUB_NOT_OWNER_ONLY entry names a real action export with a stated reason", () => {
    const byName = new Map(collectActionExports().map((a) => [a.name, a]));
    for (const [name, reason] of Object.entries(GITHUB_NOT_OWNER_ONLY)) {
      expect(byName.has(name), `${name} is listed in GITHUB_NOT_OWNER_ONLY but is not an action export`).toBe(true);
      expect(reason.trim().length, `${name} needs a stated reason`).toBeGreaterThan(10);
    }
  });

  it("no action in a GITHUB_FILES module calls requireUser() directly unless reviewed safe", () => {
    const notOwnerOnly = new Set(Object.keys(GITHUB_NOT_OWNER_ONLY));
    const violations = collectActionExports()
      .filter((a) => GITHUB_FILES.has(a.file))
      .filter((a) => BARE_REQUIRE_USER_CALL.test(a.body) && !notOwnerOnly.has(a.name))
      .map((a) => `${a.file}:${a.line} ${a.name}`);
    expect(
      violations,
      "these GitHub-cohort actions call requireUser() directly without a per-action review listing them in " +
        "GITHUB_NOT_OWNER_ONLY - default posture for this cohort is requireAppOwner() (RULING 83); either switch " +
        "to requireAppOwner() or add a reviewed GITHUB_NOT_OWNER_ONLY entry with a stated reason"
    ).toEqual([]);
  });

  // R4 (docs/r4-scope.md M4b), modelled on the media cohort's own converse
  // check in action-guard-coverage.test.ts: the check just above catches only
  // silent OVER-PERMISSIVENESS (an action that should be reviewed but is not
  // listed). This check catches silent OVER-TIGHTENING - a later sweep
  // flipping one of these reviewed-safe actions to requireAppOwner() while
  // its "reviewed safe, stays permissive" reason keeps reading as current,
  // with every other gate here still green.
  //
  // RULING 124 CLOSED TWO PROVEN HOLES HERE, both demonstrated by execution
  // (docs/ruling-124.md has the verbatim red/green): a body could hold BOTH
  // guard names and still pass a presence-only check (W1), and a flip that
  // left the old call behind as a comment still satisfied a check that never
  // stripped comments (W2). Combined, appending four words to a tightened
  // call site defeated the old version of this check while its
  // GITHUB_NOT_OWNER_ONLY reason stayed present and false. This version
  // strips comments before classifying, and fails on requireAppOwner() being
  // PRESENT as well as on requireUser() being ABSENT.
  //
  // WHAT THIS CANNOT SEE, stated so it is not claimed as more than it is: a
  // source scan proves which guard IDENTIFIER a body calls, never that the
  // guard's rejection is honoured at runtime (a call inside a swallowed `try`
  // or behind a condition that is never true would still read as permissive
  // here), and it cannot see the two guard FUNCTIONS themselves being made to
  // agree - that is `src/app/actions/guard-overtightening.test.ts`'s
  // executing describe, a separate instrument, not duplicated here.
  it("every GITHUB_NOT_OWNER_ONLY action still calls requireUser() and never requireAppOwner(), once comments are stripped - a silent over-tightening, even one with a stale comment, would leave the reviewed-safe reason false", () => {
    const byName = new Map(collectActionExports().map((a) => [a.name, a]));
    const overTightened: string[] = [];
    for (const name of Object.keys(GITHUB_NOT_OWNER_ONLY)) {
      const action = byName.get(name);
      expect(action, `${name} is listed in GITHUB_NOT_OWNER_ONLY but is not an action export`).toBeTruthy();
      const codeBody = stripComments(action!.body);
      const callsUser = BARE_REQUIRE_USER_CALL.test(codeBody);
      const callsOwner = REQUIRE_APP_OWNER_CALL.test(codeBody);
      if (!callsUser || callsOwner) {
        const posture = callsOwner && callsUser ? "both guards - owner-only in effect" : callsOwner ? "owner-only" : "neither guard";
        overTightened.push(
          `${action!.file}:${action!.line} ${name} reads as "${posture}" once comments are stripped, but was reviewed as safe to stay permissive on requireUser() alone`
        );
      }
    }
    expect(
      overTightened,
      "these GITHUB_NOT_OWNER_ONLY actions no longer read as permissive-only once comments are stripped from " +
        "their bodies. Either they were tightened to requireAppOwner() (possibly leaving a stale comment behind, " +
        "which a presence-only check cannot see), or a body now calls both guards, which is owner-only in effect. " +
        "If the reclassification is deliberate, remove the entry from GITHUB_NOT_OWNER_ONLY, lower the count pin " +
        "above in the same commit, and say which capability was withdrawn - do not make this pass by widening it"
    ).toEqual([]);
  });

  // Positive control (RULING 124): proves the comment stripper above still
  // sees a REAL guard call, on the two shapes most likely to defeat a naive
  // stripper - a guard call that follows a comment line, and a guard call
  // that follows a line holding a URL in a string (a bare `//` inside a
  // string must not be read as a line-comment opener by anything upstream of
  // this regex, and the line-splitting form here never sees inside the
  // string in the first place, so the real risk is the NEXT line's call
  // being swallowed by an unanchored strip - it is not).
  it("the comment stripper still sees a real guard call after a comment line and after a URL-bearing line", () => {
    const afterLineComment = stripComments("  // reviewed safe, stays permissive\n  await requireUser();");
    expect(BARE_REQUIRE_USER_CALL.test(afterLineComment)).toBe(true);

    const afterBlockComment = stripComments("  /** reviewed safe, stays permissive */\n  await requireUser();");
    expect(BARE_REQUIRE_USER_CALL.test(afterBlockComment)).toBe(true);

    const afterUrlLine = stripComments('  const u = "https://x.test/a";\n  await requireUser();');
    expect(BARE_REQUIRE_USER_CALL.test(afterUrlLine)).toBe(true);

    // And the negative shape this whole check exists for: a guard call that
    // is ONLY inside a comment must not read as present.
    const onlyInComment = stripComments("  await requireAppOwner(); // was requireUser()");
    expect(BARE_REQUIRE_USER_CALL.test(onlyInComment)).toBe(false);
    expect(REQUIRE_APP_OWNER_CALL.test(onlyInComment)).toBe(true);
  });

  it("GITHUB_FILES tracks the live import-graph closure - a floor, not a trusted final list (RULING 80/84)", () => {
    // WAVE-0 FINDING (reported alongside this instrument, not fixed by it -
    // out of this wave's write set): running the live closure over EVERY
    // "use server" file under src/app, not just the 81 that still call
    // `requireOwner()`, finds 4 files docs/r2-scope.md's own census could
    // not see, because that census was `grep -rlE "await requireOwner\(\)"`
    // - a filter that is blind to a file that ALREADY moved off the alias.
    // Two of the four (deck-source.ts, walkthrough-announcement.ts) call
    // requireUser() directly today and closure-reach lib/github.repos.ts -
    // under RULING 83's own rule, applied consistently, that is an
    // UNREVIEWED, PERMISSIVE guard on a GitHub-PAT-reaching action, the same
    // shape of exposure R2 exists to close, just outside R2's own stated
    // 81-file/408-call universe. This is named here, exactly, rather than
    // silently folded into GITHUB_FILES (which would claim it was reviewed
    // under R2's wave 1-3 plan, and it was not) or silently dropped (which
    // would hide it). GITHUB_FILES_PENDING_ENUMERATION below is a SHRINK-ONLY
    // list of exactly these names - not a safety classification like
    // GITHUB_NOT_OWNER_ONLY, a record of "known, not yet reviewed."  A fifth
    // file joining this set, or any of DECK_SOURCE_AND_WALKTHROUGH's actions
    // changing shape, still fails loud below; only removing a name (once it
    // is properly folded into GITHUB_FILES or GITHUB_NOT_OWNER_ONLY by a
    // real per-action review) shrinks it.
    const detected = githubReachingActionFiles();
    const missingFromEnumeration = [...detected].filter((f) => !GITHUB_FILES.has(f)).sort();
    expect(
      missingFromEnumeration,
      "the live closure found a DIFFERENT set of not-yet-enumerated files than GITHUB_FILES_PENDING_ENUMERATION " +
        "expects - update the pending list deliberately (it must only shrink) rather than pins failing silently"
    ).toEqual([...GITHUB_FILES_PENDING_ENUMERATION].sort());
  });
});
