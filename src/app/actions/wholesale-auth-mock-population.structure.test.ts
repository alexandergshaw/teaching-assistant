// RULING 138 (docs/r2-overtightening-audit.md, residual RES-E).
//
// THE DEFECT THIS FREEZES. A test file that does
// `vi.mock("@/lib/supabase/auth", ...)` replaces the guard module wholesale -
// so the REAL requireUser()/requireAppOwner()/requireOwner() never runs in
// that file. That is sometimes a legitimate choice (a test about business
// logic that does not want a guard in the way), but it is never a choice
// anyone is watching: RES-E measured the population growing from 81 files at
// `269e58d` to 82 at `587c210`, DURING the same R2 session that was adding
// executing-guard instruments elsewhere, and nothing in the repo noticed. The
// consequence was concrete, not hypothetical: every sub-wave of the R2
// migration had to hand-write a NEW `*.guard.test.ts` (canvas-inbox,
// canvas-modules, course-hub-integrations, github-content, github-repos,
// github-student-repos, grading, live-class, media-voice, repo-grades,
// submission-repo, visualizer, visualizer-coverage) rather than extend a
// sibling, because none of the wholesale-mocking files could see their own
// guard at all.
//
// THE FALSE-CLEAN INSTRUMENT TRAP (docs/ruling-138.md has the full account).
// `git grep -F -l -e 'vi.mock("@/lib/supabase/auth"' HEAD -- src/app/actions`
// reports 0 on this machine, while the working tree actually holds 82 matches.
// This is MSYS argument path conversion rewriting the `@/lib/...` token as a
// filesystem path before git ever sees it - a sibling of this repo's recorded
// `grep -P` trap, and the second instrument of this exact shape found here.
// `MSYS_NO_PATHCONV=1 git grep` and the plain working-tree `grep -rl` both
// report 82 and agree with each other. THIS FILE DOES NOT SHELL OUT TO GIT
// GREP AT ALL - it reads files directly with Node's `fs`, which has no MSYS
// argument-rewriting step in the path, so it is not exposed to that trap in
// the first place. It still cross-checks itself with a canary (below) so a
// future regression in ITS OWN read/match logic cannot report a false zero
// silently.
//
// EXACT SET, NOT A COUNT. A bare `FROZEN_COUNT` would pass unchanged if one
// file left the wholesale-mock population and a different file joined it in
// the same commit - exactly the kind of silent churn this ruling exists to
// stop, and exactly the weakness the audit called out for RES-E's own
// suggested count-pin shape. Freezing the SET (compared with array equality
// after sorting, not just `.length`) catches that: a swap changes the sorted
// array even though the size is unchanged. The cost is that a legitimate
// rename must touch this file - which is the point: a rename is exactly the
// moment a human should look at whether the file still deserves a wholesale
// mock, not a maintenance tax to route around.
//
// SHRINK-ONLY. Removing a file from FROZEN_WHOLESALE_AUTH_MOCK_FILES (because
// its test was rewritten to the `*.guard.test.ts` idiom, or deleted) is
// always allowed - the test only fails when the LIVE population contains a
// name that ISN'T in the frozen set, i.e. growth. It does not fail when the
// frozen set contains a name the live population no longer has, because that
// is the intended direction of travel this whole ruling wants to encourage.
//
// TO ADD A NEW ACTION TEST FILE WITHOUT TRIPPING THIS RATCHET: don't mock
// "@/lib/supabase/auth" wholesale. Follow the idiom already landed in
// canvas-inbox.guard.test.ts, grading.guard.test.ts and
// submission-repo.guard.test.ts - mock "@/lib/supabase/server" (the cookie
// client factory) and "@/lib/supabase/app-users" (the account-row lookup),
// and import the REAL requireUser/requireAppOwner/requireOwner from
// "@/lib/supabase/auth" unmocked, so the guard actually executes against a
// fake identity.
//
// WHAT THIS TEST CANNOT SEE, stated because this repo has shipped instruments
// that claimed more than they measured:
//   - A file that stubs the guard through an INDIRECTION - e.g. mocking a
//     local wrapper module that itself re-exports requireUser/requireAppOwner
//     from "@/lib/supabase/auth" - is invisible here. This is a literal
//     source-text scan for the string `vi.mock("@/lib/supabase/auth"` (any
//     quote character), nothing more.
//   - A file that mocks a DIFFERENT module which happens to re-export the
//     guard functions under new names is equally invisible.
//   - Whether any individual file's wholesale mock is JUSTIFIED (a pure
//     business-logic test with no guard-relevant branch) or is a gap that
//     needs its own `*.guard.test.ts` sibling. This file freezes the
//     population size and membership; it does not audit each entry.
//
// This is a source-text .structure.test.ts, following this repo's convention
// for tests that scan file contents rather than execute code
// (src/source-bytes.structure.test.ts, src/file-size-ceiling.structure.test.ts).

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ACTIONS_DIR = path.join(process.cwd(), "src", "app", "actions");

// This ratchet's own file is excluded from the scan it runs: its header and
// its frozen-set comment BLOCK necessarily quote the literal pattern text
// (`vi.mock("@/lib/supabase/auth"`) as documentation, which would otherwise
// match itself and report a false "growth". No other file under
// src/app/actions is exempted.
const SELF_PATH = path.join(ACTIONS_DIR, "wholesale-auth-mock-population.structure.test.ts");

// Matches vi.mock("@/lib/supabase/auth" or vi.mock('@/lib/supabase/auth' -
// the module specifier string only, not asserting anything about the second
// argument (the mock factory), because every shape of factory replaces the
// module wholesale regardless of what it returns.
const WHOLESALE_AUTH_MOCK = /\bvi\.mock\(\s*["']@\/lib\/supabase\/auth["']/;

// A pattern known to exist widely in this same directory, used as a canary:
// if this ever returns 0, the scan mechanism itself is broken (wrong
// directory, wrong extension filter, fs permissions, etc.), not that the
// codebase suddenly has zero owner-only call sites.
const CANARY_PATTERN = /\brequireOwner\s*\(/;

function listTestFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listTestFiles(full));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.test\.tsx?$/.test(entry.name)) continue;
    if (full === SELF_PATH) continue;
    found.push(full);
  }
  return found;
}

function relPath(absPath: string): string {
  return path.relative(ACTIONS_DIR, absPath).replace(/\\/g, "/");
}

function findWholesaleAuthMockFiles(): string[] {
  const matches: string[] = [];
  for (const filePath of listTestFiles(ACTIONS_DIR)) {
    const text = fs.readFileSync(filePath, "utf8");
    if (WHOLESALE_AUTH_MOCK.test(text)) {
      matches.push(relPath(filePath));
    }
  }
  return matches.sort();
}

function countCanaryHits(): number {
  let count = 0;
  for (const filePath of listTestFiles(ACTIONS_DIR)) {
    const text = fs.readFileSync(filePath, "utf8");
    if (CANARY_PATTERN.test(text)) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// THE FROZEN SET. Derived 2026-09-28 with two independent commands that
// agree (see docs/ruling-138.md for the verbatim transcript):
//   MSYS_NO_PATHCONV=1 git grep -F -l -e 'vi.mock("@/lib/supabase/auth"' HEAD -- src/app/actions   -> 82
//   grep -rlF 'vi.mock("@/lib/supabase/auth"' src/app/actions                                       -> 82
// (the naive `git grep` without MSYS_NO_PATHCONV=1 reports 0 - the false-clean
// trap this ruling documents, and the reason this test never shells out to
// git at all).
//
// SHRINK-ONLY: a name may be REMOVED from this list at any time (that is
// progress - see the header). A name may be ADDED only in a commit that also
// updates this list, which is the deliberate act this ratchet exists to
// force.
// ---------------------------------------------------------------------------
const FROZEN_WHOLESALE_AUTH_MOCK_FILES: readonly string[] = [
  "announcement-image.test.ts",
  "automation-runs.test.ts",
  "build-assignment-plan.embedded-opener.test.ts",
  "canvas-discussions.test.ts",
  "canvas-inbox.announcement-image.test.ts",
  "canvas-inbox.message-replies.test.ts",
  "canvas-inbox.weekly-announcement-module-content.test.ts",
  "canvas-inbox.weekly-announcement-schedule.sequential-fetch.test.ts",
  "canvas-inbox.weekly-announcement-schedule.test.ts",
  "canvas-migrations.test.ts",
  "canvas-modules.test.ts",
  "carry-module-pattern.test.ts",
  "case-study-plan.test.ts",
  "case-study-research.test.ts",
  "castletop.test.ts",
  "chat-style.test.ts",
  "course-calendar.test.ts",
  "course-hub-core.storage-path.test.ts",
  "course-hub-integrations.test.ts",
  "course-planning-grounding.test.ts",
  "course-planning.case-study-plan.test.ts",
  "course-planning.test.ts",
  "course-project.test.ts",
  "current-events-assignments.test.ts",
  "current-events.test.ts",
  "discussion-replies-bulk-redaction.test.ts",
  "discussion-replies-draft.test.ts",
  "discussion-replies-extract.test.ts",
  "discussion-replies-resources.test.ts",
  "github-repos.grading.test.ts",
  "github-repos.grading.unmerged-branch.test.ts",
  "github-student-repos.test.ts",
  "github.grading.test.ts",
  "grading-chat-intake.test.ts",
  "grading-checklist.test.ts",
  "grading-incremental.test.ts",
  "grading-picture-transcribe.test.ts",
  "grading-submission-extract.test.ts",
  "grading-submission-grade.test.ts",
  "grading.budget.test.ts",
  "grading.collisionRefusal.test.ts",
  "institution-page-attachments.test.ts",
  "institutions.test.ts",
  "knowledge-base.test.ts",
  "learning-resource-links.test.ts",
  "learning-resource-links.yield.test.ts",
  "legibility-probe.test.ts",
  "live-class.test.ts",
  "lms-generation-refine.subject.test.ts",
  "lms-generation-refine.test.ts",
  "lms-generation.intro-discussion.test.ts",
  "lms-generation.post-and-list.test.ts",
  "lms-generation.test.ts",
  "lms-syllabus-buttons.test.ts",
  "media-likeness.test.ts",
  "media-voice.budget.test.ts",
  "media.budget.test.ts",
  "media.intro-script-diag.test.ts",
  "media.script-length.test.ts",
  "message-replies.test.ts",
  "module-content-extract.test.ts",
  "module-template.test.ts",
  "prompt-announcement-draft.test.ts",
  "prompt-announcement-post.test.ts",
  "research.test.ts",
  "rubric-bulk.test.ts",
  "schedule-week-plan.ensure-project.test.ts",
  "schedule-week-plan.opener-phase.test.ts",
  "schedule-week-plan.test.ts",
  "selection-chat-context.test.ts",
  "snapshot-grade.test.ts",
  "snapshot-parse-rubric.test.ts",
  "submission-repo.test.ts",
  "syllabus-templates.test.ts",
  "syllabus-upload.preserves-columns.test.ts",
  "syllabus-upload.rubric-reuse.test.ts",
  "textbook-research.upload-budget.test.ts",
  "visualization-concepts-generator.test.ts",
  "visualizer-coverage.test.ts",
  "visualizer-selection.test.ts",
  "visualizer.test.ts",
  "walkthrough-announcement.test.ts",
  "weekly-announcement-drafting.package.test.ts",
  "weekly-announcement-drafting.test.ts",
];

describe("wholesale @/lib/supabase/auth mock population (RULING 138, RES-E): shrink-only", () => {
  it("non-vacuity: the frozen set is not empty and the scan finds test files at all", () => {
    expect(
      FROZEN_WHOLESALE_AUTH_MOCK_FILES.length,
      "the frozen set is empty - every comparison below would pass over nothing, which is the exact vacuous-guard " +
        "failure mode this repo has shipped before. Restore the frozen list, do not leave this test counted as coverage"
    ).toBeGreaterThan(0);

    const allTestFiles = listTestFiles(ACTIONS_DIR);
    expect(
      allTestFiles.length,
      "found zero test files under src/app/actions - the directory walk is broken (wrong path, wrong extension " +
        "filter), not that the directory is actually empty"
    ).toBeGreaterThan(100);
  });

  it("canary: a pattern known to exist widely (requireOwner calls) is actually found - a broken scan cannot report a silent zero", () => {
    const canaryHits = countCanaryHits();
    expect(
      canaryHits,
      "the canary pattern (requireOwner() calls in src/app/actions test files) found nothing. This does not mean " +
        "the codebase changed - it means the file walk or regex mechanism in THIS test is broken, and every " +
        "'found 0 wholesale mocks' result below would be equally worthless until this is fixed"
    ).toBeGreaterThan(0);
  });

  it("the live population of wholesale-auth-mocking files has not grown beyond the frozen set", () => {
    const live = findWholesaleAuthMockFiles();
    const frozen = new Set(FROZEN_WHOLESALE_AUTH_MOCK_FILES);
    const added = live.filter((f) => !frozen.has(f));

    expect(
      added,
      "these test files now do `vi.mock(\"@/lib/supabase/auth\", ...)` and are NOT in the frozen list at the top " +
        "of this file (RULING 138). That wholesale-mocks the guard module, so the real requireUser/requireAppOwner/" +
        "requireOwner never runs in these files. Instead, mock \"@/lib/supabase/server\" and " +
        "\"@/lib/supabase/app-users\" and let the real guard execute - the idiom in canvas-inbox.guard.test.ts, " +
        "grading.guard.test.ts and submission-repo.guard.test.ts. If a wholesale mock is genuinely unavoidable " +
        "here (a pure business-logic test with no guard-relevant branch), add the name to " +
        "FROZEN_WHOLESALE_AUTH_MOCK_FILES in this file as a deliberate, reviewed act - do not add it silently"
    ).toEqual([]);
  });

  it("the frozen set contains no entry outside src/app/actions and no duplicates", () => {
    const seen = new Set<string>();
    for (const name of FROZEN_WHOLESALE_AUTH_MOCK_FILES) {
      expect(seen.has(name), `${name} is listed twice in FROZEN_WHOLESALE_AUTH_MOCK_FILES`).toBe(false);
      seen.add(name);
      expect(name.startsWith("..") || path.isAbsolute(name), `${name} escapes src/app/actions`).toBe(false);
    }
  });
});
