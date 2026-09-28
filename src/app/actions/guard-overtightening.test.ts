/**
 * OVER-TIGHTENING RATCHET: the R2 migration's missing direction.
 *
 * WHAT THIS FILE SCANS, STATED SO THE SENTENCE IS TRUE OF THE MECHANISM AND
 * NOT OF THE AMBITION. Every assertion in the first five describes below is a
 * regex over SOURCE TEXT: `collectActionExportsStrict()` reads each
 * `"use server"` file under src/app, slices each `export async function` body
 * out by line, strips comments, and matches guard IDENTIFIERS. It scans
 * exactly the 24 action exports named in REVIEWED_PERMISSIVE below, plus - for
 * the per-file exactness rule - every other `export async function` in the
 * eleven files those 24 live in. IT DOES NOT SCAN the rest of src/app, it does not
 * know which sites SHOULD be permissive, and no guard, action or authorization
 * decision executes in any of those five describes. The SIXTH describe is the
 * only executing one, and it drives the two guard functions themselves, not
 * any action.
 *
 * THE GAP THIS EXISTS FOR. R2 is moving ~254 call sites off `requireOwner()`,
 * a deprecated alias that delegates to `requireUser()`. Each becomes either
 * `requireAppOwner()` (owner-only) or `requireUser()` (any active account).
 * UNDER-tightening is well guarded: action-guard-coverage-github-cohort.test.ts
 * makes owner-only the DEFAULT for the GitHub-PAT cohort, so a bare
 * `requireUser()` in one of those 41 files fails unless a per-action review
 * lists it. OVER-tightening - converting a site that should have stayed
 * permissive - removes a capability from every non-owner account, and moves
 * TOWARD what that ratchet wants, so that ratchet will never complain.
 * `requireAppOwner()`'s own doc comment (src/lib/supabase/auth.ts:369-375)
 * says the owner-only list is deliberately SMALLER than "everything that used
 * to call requireOwner()", because containment for most capabilities lives at
 * the secret rather than at every call site. THAT sentence is the requirement
 * this file serves.
 *
 * WHAT ALREADY EXISTED, MEASURED, SO THIS FILE DOES NOT CLAIM ITS WORK:
 *   - The four R3 media files are HARD-pinned: action-guard-coverage.test.ts's
 *     "no media action outside MEDIA_OWNER_ONLY_ACTIONS calls requireAppOwner"
 *     asserts per-file exactness AND pins `MEDIA_OWNER_ONLY_ACTIONS.length` to
 *     14, so a name cannot be moved into the owner-only set to silence it.
 *     media.ts (17 permissive actions) and media-voice.ts (10) are therefore
 *     deliberately NOT listed below - adding them would duplicate a stronger
 *     pin and add 27 names of maintenance for no new signal.
 *   - action-guard-coverage-github-cohort.test.ts's R4/M4b check asserts every
 *     GITHUB_NOT_OWNER_ONLY entry "still calls requireUser() directly".
 *
 * THE THREE THINGS THAT CHECK LEAVES OPEN, WHICH IS WHY THIS FILE EXISTS:
 *   1. It asserts requireUser() is PRESENT. It never asserts requireAppOwner()
 *      is ABSENT. A body holding both passes it while being owner-only in
 *      effect.
 *   2. Its collector does not strip comments, so a leftover `// requireUser()`
 *      line satisfies it. Measured 2026-09-28 across all 496 action exports:
 *      0 bodies whose only guard token is inside a comment, and 0 holding both
 *      guard names - so this is LATENT, not live. It is one careless sweep
 *      away, and the sabotage log in docs/overtightening-instrument.md shows
 *      that file staying GREEN on exactly that mutation.
 *   3. It covers only the names inside GITHUB_NOT_OWNER_ONLY. Fourteen
 *      permissive actions outside both cohorts had NO over-tightening
 *      instrument of any kind before this file.
 *
 * WHAT THIS FILE CANNOT SEE. Stated because four instruments in this repo have
 * claimed more than they measured:
 *   - A RUNTIME BYPASS. A source scan proves a guard identifier is named in a
 *     body; it cannot prove the guard's rejection is honoured. An action that
 *     calls requireUser() inside a `try` and swallows the rejection, or behind
 *     a condition that is never true, reads as permissive here and is not.
 *   - A SITE THAT WAS NEVER REVIEWED. REVIEWED_PERMISSIVE is a frozen literal.
 *     It is GROW-ONLY by intent: a new permissive classification is protected
 *     only once its name is added here. The per-file exactness rule below
 *     narrows that hole to whole FILES - a permissive action added to any of
 *     the eleven listed files fails loudly - but a permissive action in a
 *     TWELFTH file is invisible to this file until someone lists it.
 *   - THE ~68 RANK-2b SITES THAT DO NOT EXIST YET. Those 19 files are all in
 *     the GitHub cohort's GITHUB_FILES, so each permissive review there must
 *     land in GITHUB_NOT_OWNER_ONLY or the cohort's own bare-requireUser check
 *     fires. Their over-tightening protection therefore comes from M4b, with
 *     weaknesses 1 and 2 above still attached, plus one this file cannot close
 *     from here: nothing pins GITHUB_NOT_OWNER_ONLY's SIZE, so an entry can be
 *     deleted in the same commit that flips its site. Closing that needs a
 *     count pin inside that file, which is outside this file's write set.
 *   - WHETHER A SITE IS CORRECTLY CLASSIFIED. The capability sentences below
 *     record what a non-owner can do TODAY and what disappears if the site
 *     flips. They are deliberately NOT safety classifications - that judgement
 *     belongs to each sub-wave's per-site review, and this file must not
 *     compete with it.
 *
 * Duplicates its collector helpers rather than importing them from
 * action-guard-coverage.test.ts: importing a helper from another *.test.ts
 * re-runs that file's describe blocks (a recorded hazard in this repo).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// This file walks a real directory tree and reads many real files, which
// vitest's 5000ms default treats as a false timeout under concurrent load.
// Same 30_000 convention as action-guard-coverage.test.ts.
vi.setConfig({ testTimeout: 30_000 });

// ---------------------------------------------------------------------------
// The executing describe at the bottom drives the REAL requireUser() and
// requireAppOwner(). It therefore mocks the layers BELOW them - the cookie-
// bound client factory and the account-row read - and never
// "@/lib/supabase/auth" itself. Mocking that module is the exact reason 88
// test files in this repo cannot see a guard change at all: it stubs the guard
// away, so the guard never runs.
// ---------------------------------------------------------------------------
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/app-users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/app-users")>();
  return {
    ...actual,
    getAppUser: vi.fn(),
    ensureAppUser: vi.fn(),
    ensureAppUserRowExists: vi.fn(),
  };
});

import { createClient } from "@/lib/supabase/server";
import { getAppUser, ensureAppUser, ensureAppUserRowExists, type AppUserRow } from "@/lib/supabase/app-users";
import { requireUser, requireAppOwner, OWNER_ONLY_MESSAGE } from "@/lib/supabase/auth";

const APP_DIR = path.join(process.cwd(), "src", "app");
const REQUIRE_USER_CALL = /\brequireUser\s*\(/;
const REQUIRE_APP_OWNER_CALL = /\brequireAppOwner\s*\(/;

// ---------------------------------------------------------------------------
// THE FROZEN ORACLE.
//
// CONSTRUCTION, so a reader can rebuild it rather than trust it. Take every
// `export async function` in every `"use server"` file under src/app whose
// comment-stripped body calls requireUser() and does not call
// requireAppOwner() - 51 of them on 2026-09-28 across 13 files. Remove the 27
// in media.ts / media-voice.ts, which a stronger, count-pinned instrument
// already owns (see the header). Remove the 1 in actions/visualizer.ts, which
// was in a live sub-wave write set while this file was being written and was
// added only once that sub-wave landed (bfbaece). The remaining 24 are below,
// and every one of them sits in a file whose own source states the permissive
// decision deliberately - the `file:line` citation on each group is that
// statement, not this file's opinion.
//
// THE VALUE IS THE CAPABILITY SENTENCE, NOT A SAFETY VERDICT. Each entry says
// what a non-owner account can do today and therefore what silently
// disappears if the site flips to requireAppOwner(). Deleting a line here is
// the deliberate act this instrument exists to force: it means writing down
// that instructors lose that capability.
//
// GROW-ONLY. Adding an entry records a review. Removing one is a declassifi-
// cation that must be argued in the commit that does it. Nothing here
// enforces grow-only-ness by construction - a frozen literal cannot - so the
// protection is that the edit is visible and says what it costs.
// ---------------------------------------------------------------------------
interface ReviewedPermissive {
  /** Keyed the same way ActionExport.file is: relative to src/app, forward slashes. */
  file: string;
  /** What a non-owner account can do today, and loses if this flips. */
  capability: string;
}

const REVIEWED_PERMISSIVE: Record<string, ReviewedPermissive> = {
  // account/integrations/lms-actions.ts:18-22 - "requireUser() (any active
  // account), not requireAppOwner(): a Canvas credential is per-user,
  // per-institution data the caller owns outright (E1)".
  listLmsCredentialRowsAction: {
    file: "account/integrations/lms-actions.ts",
    capability: "an instructor sees their own saved Canvas credential rows on /account/integrations",
  },
  saveLmsCredentialAction: {
    file: "account/integrations/lms-actions.ts",
    capability: "an instructor saves their own Canvas token for an institution, so Canvas features work for their account at all",
  },
  checkLmsCredentialConnectionAction: {
    file: "account/integrations/lms-actions.ts",
    capability: "an instructor tests their own saved Canvas token before relying on it",
  },
  deleteLmsCredentialAction: {
    file: "account/integrations/lms-actions.ts",
    capability: "an instructor deletes their own stored Canvas token",
  },

  // actions/deck-template-files.ts:16-19 - "requireUser, not the deprecated
  // requireOwner alias ... an uploaded deck template is a per-user resource,
  // not an owner-only one".
  listDeckTemplateFilesAction: {
    file: "actions/deck-template-files.ts",
    capability: "an instructor lists the .pptx deck templates they uploaded themselves",
  },
  uploadDeckTemplateFileAction: {
    file: "actions/deck-template-files.ts",
    capability: "an instructor uploads their own .pptx deck template",
  },
  deleteDeckTemplateFileAction: {
    file: "actions/deck-template-files.ts",
    capability: "an instructor deletes a deck template they uploaded",
  },
  fillDeckTemplateFileAction: {
    file: "actions/deck-template-files.ts",
    capability: "an instructor renders a generated deck onto their own uploaded template, which is the whole point of having uploaded it",
  },

  // actions/prompt-announcement-draft.ts:1-20 - the A21 drafting endpoint,
  // deliberately alone in its file so its import closure can be walled off
  // from every Canvas capability; requireUser() at :57.
  draftPromptAnnouncementAction: {
    file: "actions/prompt-announcement-draft.ts",
    capability: "an instructor drafts an announcement from a typed prompt",
  },
  // actions/prompt-announcement-post.ts:1-12 - the posting half, split out
  // for that same wall; requireUser() at :26. Reaches Canvas through
  // createAnnouncementFromMarkdown, which resolves the CALLING identity's own
  // credential - the same containment postWalkthroughAnnouncementAction is
  // reviewed under in GITHUB_NOT_OWNER_ONLY.
  postPromptAnnouncementAction: {
    file: "actions/prompt-announcement-post.ts",
    capability: "an instructor posts their drafted announcement to their own Canvas course",
  },

  // The snapshot-grading feature's four passes. Three state the posture in
  // their own headers: snapshot-read.ts:9-14 ("the gate here is requireUser(),
  // not requireOwner() - there is no owner-private data in this action"),
  // snapshot-grade.ts:16 ("Section 6: requireUser(), not requireOwner() - no
  // owner-private data here"), snapshot-transcribe-rubric.ts:13 ("same" as
  // those). snapshot-parse-rubric.ts's own header discusses only WHERE the
  // call sits relative to its try block, not the posture - it is listed here
  // on its three siblings' stated reasoning, and that is a weaker citation
  // than the other nine groups have.
  snapshotReadBatchAction: {
    file: "actions/snapshot-read.ts",
    capability: "an instructor runs the snapshot-grading read pass over their own captured shots",
  },
  snapshotTranscribeRubricAction: {
    file: "actions/snapshot-transcribe-rubric.ts",
    capability: "an instructor transcribes a captured rubric image in snapshot grading",
  },
  snapshotParseRubricAction: {
    file: "actions/snapshot-parse-rubric.ts",
    capability: "an instructor parses a transcribed rubric into gradable areas",
  },
  snapshotGradeAction: {
    file: "actions/snapshot-grade.ts",
    capability: "an instructor runs the snapshot-grading grade pass, the output the whole feature exists to produce",
  },

  // actions/deck-source.ts:16-26 - states the split explicitly: this export
  // reads only the caller's own uploaded bytes, while its sibling
  // extractDeckSourceRepoAction reaches the GitHub PAT and is
  // requireAppOwner(). Also reviewed in GITHUB_NOT_OWNER_ONLY.
  extractDeckSourceFileAction: {
    file: "actions/deck-source.ts",
    capability: "an instructor extracts deck source text from a file they uploaded themselves",
  },

  // actions/walkthrough-announcement.ts - all eight exports, each already
  // carrying a per-action safety reason in GITHUB_NOT_OWNER_ONLY. Frozen here
  // INDEPENDENTLY rather than read from that map: a derived set forgets an
  // entry at exactly the moment the entry is deleted, which is the edit this
  // instrument exists to catch, and this repo has already shipped one
  // comparison that a consolidation turned into a tautology.
  getMostRecentAnnouncementExemplarAction: {
    file: "actions/walkthrough-announcement.ts",
    capability: "an instructor's announcement editor pre-fills from their own most recent saved exemplar",
  },
  listAnnouncementExemplarsAction: {
    file: "actions/walkthrough-announcement.ts",
    capability: "an instructor lists their own saved announcement exemplars",
  },
  saveAnnouncementExemplarAction: {
    file: "actions/walkthrough-announcement.ts",
    capability: "an instructor saves an announcement exemplar to their own row",
  },
  deleteAnnouncementExemplarAction: {
    file: "actions/walkthrough-announcement.ts",
    capability: "an instructor deletes one of their own saved exemplars",
  },
  gatherWalkthroughResourcesAction: {
    file: "actions/walkthrough-announcement.ts",
    capability: "an instructor gathers learning-resource links for a walkthrough announcement",
  },
  draftWalkthroughAnnouncementAction: {
    file: "actions/walkthrough-announcement.ts",
    capability: "an instructor drafts a walkthrough announcement",
  },
  draftWalkthroughVideoScriptAction: {
    file: "actions/walkthrough-announcement.ts",
    capability: "an instructor drafts the video script for a walkthrough announcement",
  },
  postWalkthroughAnnouncementAction: {
    file: "actions/walkthrough-announcement.ts",
    capability: "an instructor posts a walkthrough announcement to their own Canvas course",
  },

  // actions/visualizer.ts:269-275, landed by R2 wave 1 sub-wave 5 (bfbaece) -
  // the FIRST permissive classification R2 itself produced, and therefore the
  // first member of the class this file exists for. Its two siblings in the
  // same file (findVisualizerConceptAction, createVisualizerConceptAction)
  // reach the GitHub PAT and moved to requireAppOwner() in that same commit;
  // this one calls only callLlm and pure helpers. Also reviewed in
  // GITHUB_NOT_OWNER_ONLY, and frozen independently here for the same reason
  // the walkthrough eight are.
  extractDeckConceptsAction: {
    file: "actions/visualizer.ts",
    capability: "an instructor extracts concepts from a deck to drive the visualizer, without owning the GitHub PAT",
  },
};

/**
 * The files under this instrument, DERIVED from the frozen map rather than
 * written out a second time. A second hand-written list is a second thing to
 * forget, and two lists that disagree is a failure mode this repo has shipped.
 */
const PERMISSIVE_FILES: ReadonlySet<string> = new Set(
  Object.values(REVIEWED_PERMISSIVE).map((entry) => entry.file)
);

// ---------------------------------------------------------------------------
// The collector. Duplicated from action-guard-coverage.test.ts and then made
// strict in three ways that file is not, each closing a defect class this repo
// has on record.
// ---------------------------------------------------------------------------
interface StrictActionExport {
  file: string;
  name: string;
  line: number;
  /** Body as written, comments included. */
  rawBody: string;
  /** Body with block and line comments removed. */
  codeBody: string;
  /**
   * False when the body slice ran off the end of the file because no line was
   * exactly `}`. The sibling collector does not check this, and
   * `slice(start, end)` with an unresolved end silently widens to the rest of
   * the file - the defect class that once turned a slice instrument into a
   * whole-file scan here.
   */
  anchorResolved: boolean;
  /**
   * True when the slice swallowed a LATER `export async function`, which means
   * this "body" contains another action's guard call and any guard assertion
   * over it is reading the wrong object.
   */
  absorbsLaterExport: boolean;
}

function isUseServerModule(text: string): boolean {
  return /^\s*["']use server["']/m.test(text);
}

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
 * Remove comments so a guard IDENTIFIER inside one cannot stand in for a guard
 * CALL. Block comments first (an inner JSDoc on a parameter is inside the body
 * slice), then line comments with the UNANCHORED form - the anchored
 * `/^[ \t]*\/\/.*$/` variant is blind to a trailing comment and has an
 * executed defeat on record in this repo. No `/s` flag anywhere: it passes
 * vitest and fails tsc with TS1501.
 */
function stripComments(body: string): string {
  const withoutBlocks = body.replace(/\/\*[\s\S]*?\*\//g, "");
  return withoutBlocks
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

type Posture = "permissive" | "owner-only" | "both" | "neither";

/** Classify one body by which guard identifiers it CALLS. */
function classifyPosture(body: string): Posture {
  const user = REQUIRE_USER_CALL.test(body);
  const appOwner = REQUIRE_APP_OWNER_CALL.test(body);
  if (user && appOwner) return "both";
  if (user) return "permissive";
  if (appOwner) return "owner-only";
  return "neither";
}

function collectActionExportsStrict(): StrictActionExport[] {
  const found: StrictActionExport[] = [];

  for (const filePath of collectCandidateFiles(APP_DIR)) {
    const text = fs.readFileSync(filePath, "utf8");
    if (!isUseServerModule(text)) continue;

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const match = /^export async function (\w+)/.exec(lines[i]);
      if (!match) continue;
      let end = i + 1;
      while (end < lines.length && lines[end] !== "}") end++;
      const anchorResolved = end < lines.length;
      const bodyLines = lines.slice(i, end);
      const rawBody = bodyLines.join("\n");
      found.push({
        file: path.relative(APP_DIR, filePath).replace(new RegExp(String.fromCharCode(92, 92), "g"), "/"),
        name: match[1],
        line: i + 1,
        rawBody,
        codeBody: stripComments(rawBody),
        anchorResolved,
        absorbsLaterExport: bodyLines.slice(1).some((line) => /^export async function /.test(line)),
      });
    }
  }

  return found;
}

// ---------------------------------------------------------------------------

describe("over-tightening ratchet: the instrument is not vacuous", () => {
  it("the frozen reviewed-permissive set is not empty, and holds at least the 23 it was built from", () => {
    const names = Object.keys(REVIEWED_PERMISSIVE);
    expect(
      names.length,
      "REVIEWED_PERMISSIVE IS EMPTY. Every assertion in this file iterates it, so an empty map makes all of " +
        "them pass over nothing. This file must not be counted as coverage in that state - restore the entries " +
        "or delete the file, do not leave it green"
    ).toBeGreaterThan(0);
    expect(
      names.length,
      "the frozen set has SHRUNK below the 24 names it was constructed from (docs/overtightening-instrument.md). " +
        "Removing a name declassifies a capability - do it deliberately, in a commit that says which capability " +
        "non-owner accounts lose, and lower this floor in the same commit"
    ).toBeGreaterThanOrEqual(24);
  });

  it("the scan finds permissive guards in real source, not just in fixtures - the positive control", () => {
    // If the collector, the comment stripper or the identifier regexes break,
    // every "still permissive" assertion below would pass by finding nothing.
    // This is the only assertion here that fails when the MECHANISM dies
    // rather than when the TREE changes.
    const all = collectActionExportsStrict();
    expect(all.length, "the collector found no action exports at all - the walk or the signature regex is broken").toBeGreaterThan(100);
    const permissive = all.filter((a) => classifyPosture(a.codeBody) === "permissive");
    expect(
      permissive.length,
      "the scan can no longer see a single permissive guard anywhere in src/app. Either every action became " +
        "owner-only (report it) or this file's mechanism is broken (fix it) - it is never a reason to relax this"
    ).toBeGreaterThanOrEqual(24);
    const ownerOnly = all.filter((a) => classifyPosture(a.codeBody) === "owner-only");
    expect(
      ownerOnly.length,
      "the scan can no longer see a single owner-only guard either, so it is not discriminating between the two " +
        "postures - a scan that reports one posture for everything proves nothing"
    ).toBeGreaterThan(0);
  });

  it("the classifier discriminates all four postures, and a commented-out guard is not a guard", () => {
    // The mechanism, exercised against synthetic bodies. `both` is the posture
    // the sibling cohort check cannot express: it asserts requireUser() is
    // present and never that requireAppOwner() is absent.
    expect(classifyPosture(stripComments("  await requireUser();"))).toBe("permissive");
    expect(classifyPosture(stripComments("  await requireAppOwner();"))).toBe("owner-only");
    expect(classifyPosture(stripComments("  await requireAppOwner();\n  await requireUser();"))).toBe("both");
    expect(classifyPosture(stripComments("  return 1;"))).toBe("neither");
    // The measured bypass: a flip that leaves the old call as a line comment.
    expect(classifyPosture(stripComments("  await requireAppOwner(); // was requireUser()"))).toBe("owner-only");
    expect(classifyPosture(stripComments("  await requireAppOwner();\n  // await requireUser();"))).toBe("owner-only");
    // And the block-comment form, since an inner JSDoc sits inside the slice.
    expect(classifyPosture(stripComments("  /** used to call requireUser() */\n  await requireAppOwner();"))).toBe("owner-only");
    // Stripping must not eat a real call that merely follows a URL-bearing line.
    expect(classifyPosture(stripComments('  const u = "https://x.test/a";\n  await requireUser();'))).toBe("permissive");
  });
});

describe("over-tightening ratchet: every reviewed-permissive site is still permissive", () => {
  it("every frozen name is a real action export, in its declared file, with a capability sentence", () => {
    const byName = new Map(collectActionExportsStrict().map((a) => [a.name, a]));
    for (const [name, entry] of Object.entries(REVIEWED_PERMISSIVE)) {
      const action = byName.get(name);
      expect(action, `${name} is frozen here but is not an action export under src/app any more`).toBeTruthy();
      expect(
        action!.file,
        `${name} moved from ${entry.file} to ${action!.file} - update the frozen file so the per-file exactness rule below still covers it`
      ).toBe(entry.file);
      expect(entry.capability.trim().length, `${name} needs a capability sentence, not a placeholder`).toBeGreaterThan(20);
    }
  });

  it("the body slice resolved a real closing brace and swallowed no later export", () => {
    // Both halves of the anchor. Without the first, an unresolved end widens
    // the slice to the rest of the file; without the second, the slice can
    // carry a DIFFERENT action's guard call, and every assertion below would
    // be reading the wrong object while looking correct.
    const byName = new Map(collectActionExportsStrict().map((a) => [a.name, a]));
    for (const name of Object.keys(REVIEWED_PERMISSIVE)) {
      const action = byName.get(name);
      if (!action) continue; // the test above owns that failure
      expect(
        action.anchorResolved,
        `${action.file}:${action.line} ${name}: the body slice never found a line that is exactly "}", so it ran ` +
          "to end of file and every guard assertion over it is reading the whole rest of the module"
      ).toBe(true);
      expect(
        action.absorbsLaterExport,
        `${action.file}:${action.line} ${name}: the body slice swallowed a later "export async function", so a ` +
          "guard token found in it may belong to a different action"
      ).toBe(false);
    }
  });

  it("THE CORE: each one still calls requireUser() and does NOT call requireAppOwner()", () => {
    const byName = new Map(collectActionExportsStrict().map((a) => [a.name, a]));
    const overTightened: string[] = [];
    for (const [name, entry] of Object.entries(REVIEWED_PERMISSIVE)) {
      const action = byName.get(name);
      if (!action) continue;
      const posture = classifyPosture(action.codeBody);
      if (posture !== "permissive") {
        overTightened.push(`${action.file}:${action.line} ${name} is now "${posture}" - LOST CAPABILITY: ${entry.capability}`);
      }
    }
    expect(
      overTightened,
      "these actions were reviewed as safe to stay permissive and no longer call requireUser() alone. Each line " +
        "names the capability every non-owner account silently loses. If the reclassification is deliberate, " +
        'remove the entry from REVIEWED_PERMISSIVE in the same commit and say in the message which capability was ' +
        "withdrawn; do not make this test pass by widening it"
    ).toEqual([]);
  });

  it("the comment-stripped and as-written classifications agree - a guard token that exists only in a comment is the bypass", () => {
    // This is the clause the sibling cohort check cannot make, because its
    // collector never strips comments: a flip to requireAppOwner() that leaves
    // "requireUser()" behind in a comment satisfies a presence-only check
    // while the action is owner-only in effect.
    const byName = new Map(collectActionExportsStrict().map((a) => [a.name, a]));
    const disagreements: string[] = [];
    for (const name of Object.keys(REVIEWED_PERMISSIVE)) {
      const action = byName.get(name);
      if (!action) continue;
      const asWritten = classifyPosture(action.rawBody);
      const asCode = classifyPosture(action.codeBody);
      if (asWritten !== asCode) {
        disagreements.push(`${action.file}:${action.line} ${name}: reads "${asWritten}" with comments, "${asCode}" without`);
      }
    }
    expect(
      disagreements,
      "a guard identifier in these bodies appears only inside a comment, or only outside one. A presence-only " +
        "source check would report the commented name as a live guard - resolve it by deleting the stale comment " +
        "or by fixing the call, never by reading the commented form as the answer"
    ).toEqual([]);
  });
});

describe("over-tightening ratchet: nothing is added to a covered file without being recorded", () => {
  it("each covered file's permissive population matches the frozen names for that file exactly", () => {
    // Per-FILE exactness, the strongest construction available without
    // enumerating the whole tree. It narrows the frozen set's blind spot from
    // "any site not listed" to "any site in a file not listed": a new
    // permissive action in one of these eleven files fails here until its review
    // is recorded, and a disappearing one fails here too.
    const all = collectActionExportsStrict();
    for (const file of [...PERMISSIVE_FILES].sort()) {
      const frozen = Object.entries(REVIEWED_PERMISSIVE)
        .filter(([, entry]) => entry.file === file)
        .map(([name]) => name)
        .sort();
      const computed = all
        .filter((a) => a.file === file && classifyPosture(a.codeBody) === "permissive")
        .map((a) => a.name)
        .sort();
      expect(
        computed,
        `${file}: its permissive actions no longer match the names frozen for it. A name present in the tree but ` +
          "not frozen is an unrecorded permissive review - add it with its capability sentence. A name frozen " +
          "but absent from the tree is an over-tightening or a rename - see the CORE test above"
      ).toEqual(frozen);
    }
  });

  it("covers eleven files, and every frozen entry lands in one of them", () => {
    // Guards the derivation itself: if PERMISSIVE_FILES were ever written out
    // by hand instead of derived, the two could drift.
    expect(PERMISSIVE_FILES.size).toBe(11);
    for (const [name, entry] of Object.entries(REVIEWED_PERMISSIVE)) {
      expect(PERMISSIVE_FILES.has(entry.file), `${name}'s file is not in the derived set`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The one executing describe.
//
// WHAT IT IS AND IS NOT. Every assertion above is a source scan, and a source
// scan only proves which IDENTIFIER a site names. It is worthless unless the
// two identifiers mean different things for a non-owner. That is not a
// hypothetical dependency: requireOwner() is in this tree precisely because a
// guard whose NAME says ownership was changed to delegate to requireUser(),
// and every source-shape ratchet in this repo stayed green through it. The
// mirror case is the one this file is about - if requireUser() were ever made
// to reject an active non-owner, all 24 capabilities above would become
// owner-only with NO source change at any call site, and nothing above could
// see it.
//
// NOT NEW COVERAGE, and this file does not claim it is. Each half is already
// asserted separately in src/lib/supabase/auth.test.ts - requireUser()
// authorizing an active instructor at :213, requireAppOwner() rejecting one at
// :432. What is not asserted anywhere is the PAIR against ONE identity: that
// the two guards DISAGREE on the cookie path. auth.test.ts:589 asserts they
// AGREE on every impersonated role/status combination, so the disagreement
// this file's whole premise rests on is stated nowhere else.
//
// It drives the guards, not any action. Executing all 24 actions would mean
// mocking 24 dependency trees, and each action would run on past its guard
// into work this environment blocks - a per-action executing test belongs
// beside each action, written the day its guard changes.
// ---------------------------------------------------------------------------
function fakeActiveInstructorRow(): AppUserRow {
  return {
    id: "u1",
    email: "instructor@example.test",
    displayName: "An Instructor",
    status: "active",
    role: "instructor",
    approvedAt: "2026-01-01T00:00:00.000Z",
    approvedBy: "owner-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    statusChangedAt: null,
    statusChangedBy: null,
    roleGrantedBy: null,
  };
}

/** Minimal cookie-bound client double. Duplicated, never imported from another test file. */
function fakeAuthClient(email: string | null) {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: email === null ? null : { id: "u1", email } }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: () =>
          Promise.resolve({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }),
      },
    },
  };
}

const ORIGINAL_OWNER_EMAILS = process.env.OWNER_EMAILS;

describe("over-tightening at the guard rather than the call site", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(getAppUser).mockReset();
    vi.mocked(ensureAppUser).mockReset();
    vi.mocked(ensureAppUserRowExists).mockReset();
    vi.mocked(ensureAppUser).mockResolvedValue(fakeActiveInstructorRow());
    vi.mocked(ensureAppUserRowExists).mockResolvedValue(undefined);
    // An allowlisted email would be promoted to owner by the break-glass
    // path, which would make requireAppOwner() resolve and hide the very
    // difference this test measures.
    delete process.env.OWNER_EMAILS;
  });

  afterEach(() => {
    if (ORIGINAL_OWNER_EMAILS === undefined) delete process.env.OWNER_EMAILS;
    else process.env.OWNER_EMAILS = ORIGINAL_OWNER_EMAILS;
  });

  it("ONE active non-owner identity: requireUser() admits it and requireAppOwner() rejects it - the fact every assertion above rests on", async () => {
    vi.mocked(createClient).mockResolvedValue(fakeAuthClient("instructor@example.test") as never);
    vi.mocked(getAppUser).mockResolvedValue(fakeActiveInstructorRow());

    // The permissive half. If this ever throws, every requireUser() call site
    // in this repo became owner-only without one line of their source changing.
    const admitted = await requireUser();
    expect(admitted.role).toBe("instructor");
    expect(admitted.status).toBe("active");

    // The restrictive half, same identity, same mocks. If this ever resolves,
    // requireAppOwner() stopped being an owner gate and every source-shape
    // owner-only ratchet in this repo is pinning a name with no meaning.
    await expect(requireAppOwner()).rejects.toThrow(OWNER_ONLY_MESSAGE);
  });
});
