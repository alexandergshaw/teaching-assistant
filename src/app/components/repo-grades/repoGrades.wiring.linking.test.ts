// Repo Grades view - wiring guards for the two NEWEST waves on this surface,
// split out of repoGrades.wiring.test.ts once that file crossed the 1000-line
// ceiling in src/file-size-ceiling.structure.test.ts (A5 added three describe
// blocks that took it from 946 to 1037 lines). vitest is node-env and
// collects only src/**/*.test.ts (AC6 item 37), so the components named below
// are never rendered by any test; this file reads them as TEXT instead, the
// same idiom repoGrades.wiring.test.ts (this file's sibling and the origin of
// everything below) already uses and explains at length in its own header.
//
// This file's seam is "linking": LinkUsernamesPanel wiring (linking GitHub
// usernames to roster students - the instructor-complaint fix that puts the
// mechanism on this page instead of sending the reader to a separate
// workflow step) and A5 (the owner's request to link the row's generated
// link to the branch and folder that were actually graded, rather than a
// bare repo URL). Every other guard - binding acceptance, grading/posting,
// the selection mount-time race, shared postability, and the activity log -
// stayed in repoGrades.wiring.test.ts.
//
// findMatchingBraceEnd below is DUPLICATED from repoGrades.wiring.test.ts
// (where it backs callSitesGatedByClick, which this file has no need of)
// rather than imported, per this directory's established duplicate-with-
// citation convention for a small helper with no third module to live in
// (repoGradesRows.ts:43-56, repoGradesFolderSelection.ts:73-84) and per this
// repo's rule against importing a helper from another *.test.ts file (doing
// so would re-run that file's own describe blocks as a side effect). If
// repoGrades.wiring.test.ts's copy ever changes, this one must change with
// it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const GRID_PATH = join(process.cwd(), "src/app/components/repo-grades/RepoGradesGrid.tsx");
const gridSource = readFileSync(GRID_PATH, "utf8");
const INDEX_PATH = join(process.cwd(), "src/app/components/repo-grades/index.tsx");
const indexSource = readFileSync(INDEX_PATH, "utf8");
// A5 - the disclosure sentence for the row link's branch approximation
// (Ruling A5-9) lives here, not in RepoGradesGrid.tsx or index.tsx.
const CONTROLS_PATH = join(process.cwd(), "src/app/components/repo-grades/RepoGradesControls.tsx");
const controlsSource = readFileSync(CONTROLS_PATH, "utf8");

/**
 * Starting at `openBraceIdx` (which must point at a `{`), walks forward
 * counting brace depth and returns the index of the `}` that brings depth
 * back to zero - i.e. the brace that actually closes this one. Returns -1 if
 * the text ends first.
 *
 * DUPLICATED from repoGrades.wiring.test.ts:67-77 - see this file's header.
 */
function findMatchingBraceEnd(text: string, openBraceIdx: number): number {
  let depth = 0;
  for (let i = openBraceIdx; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}


// ---------------------------------------------------------------------------
// LinkUsernamesPanel wiring - the fix for the instructor complaint this wave
// addresses: the grid's own empty state used to be a dead end that named a
// workflow step living on a different screen and told the instructor to go
// run it there. This wave puts the mechanism (LinkUsernamesPanel.tsx) on this
// page instead. Three separate risks, each checked below: (1) the panel is
// actually rendered and wired to the view's ONE aria-live region rather than
// growing a second one (LinkUsernamesPanel.tsx's own header comment names
// this exact hazard); (2) the banner that used to send the reader elsewhere
// no longer does, while staying findable by the workflow step's exact label;
// (3) the log entry a link produces is recorded only when the link actually
// persisted something, mirroring the same rule this file already proves for
// handleAcceptBinding via its own "ok" in result guard.

describe("index.tsx renders LinkUsernamesPanel above the grid, wired to the view's single aria-live region", () => {
  it("renders <LinkUsernamesPanel and routes its outcomes through onAnnounce={setPostSummary} - never a second live region", () => {
    expect(indexSource).toContain("<LinkUsernamesPanel");
    expect(indexSource).toContain("onAnnounce={setPostSummary}");
  });

  it("gates the panel on `course` alone, matching how RepoGradesLogPanel below it is gated - never on `model && noConfirmedRows`, which would hide it exactly when an instructor has the least other way to bind repos (a failed scan or an unset org)", () => {
    const panelIdx = indexSource.indexOf("<LinkUsernamesPanel");
    expect(panelIdx).toBeGreaterThan(-1);
    // Structural bound, not a fixed character window: a fixed 60-character
    // backward slice measured only ~38 characters of headroom against the
    // real file at the time of this fix, and the JSX comment immediately
    // above this gate (explaining exactly why it is gated on `course` alone)
    // is itself long enough that growing it by a sentence would push the
    // gate out of a fixed-size window and fail this test for a reason
    // unrelated to the wiring it checks - precisely the risk another agent
    // editing index.tsx's surrounding comments right now would trip.
    // lastIndexOf has no such limit; requiring that ONLY whitespace sits
    // between the gate's closing "(" and the tag (rather than requiring the
    // gate to fall within an arbitrary N characters of it) is what actually
    // proves this gate - not some other, unrelated "{course && (" earlier in
    // the file - is the one immediately wrapping <LinkUsernamesPanel.
    const gateMarker = "{course && (";
    const gateIdx = indexSource.lastIndexOf(gateMarker, panelIdx);
    expect(gateIdx).toBeGreaterThan(-1);
    const between = indexSource.slice(gateIdx + gateMarker.length, panelIdx);
    expect(between.trim()).toBe("");
  });
});

describe("the no-confirmed-rows banner points at the on-page panel instead of instructing the reader to run a separate workflow step (instructor complaint fix)", () => {
  it("still contains the workflow step's exact UI label, so a support-doc or screenshot search for the step's real name still finds this text", () => {
    expect(indexSource).toContain("Link GitHub usernames to roster");
  });

  it("no longer tells the reader to go RUN the step - the old \"Running the ... workflow step is the reliable way to populate bindings\" sentence is gone", () => {
    expect(indexSource).not.toContain("Running the &quot;{LINK_GITHUB_USERNAMES_STEP_LABEL}&quot;");
    expect(indexSource).not.toContain("workflow step is the reliable way to populate bindings");
  });

  it("does not print LinkUsernamesPanel.tsx's own literal empty-state sentence a second time", () => {
    // LinkUsernamesPanel.tsx (read in the block below) already renders this
    // exact sentence when noConfirmedRows is true - the banner deliberately
    // owns a DIFFERENT sentence instead of repeating it, per this file's own
    // "surface-ownership decision" comment at the banner's call site.
    expect(indexSource).not.toContain("No repos are confirmed-bound to a roster student yet.");
  });
});

const LINK_PANEL_PATH = join(process.cwd(), "src/app/components/repo-grades/LinkUsernamesPanel.tsx");
const linkPanelSource = readFileSync(LINK_PANEL_PATH, "utf8");

describe("canary: LinkUsernamesPanel.tsx actually owns the empty-state sentence the banner test above assumes it owns", () => {
  it("LinkUsernamesPanel.tsx contains the exact sentence, proving the banner's non-duplication above is not vacuously true against a file that never had that sentence to begin with", () => {
    expect(linkPanelSource).toContain("No repos are confirmed-bound to a roster student yet.");
  });
});

/**
 * True when, searching `text` from the start, the first occurrence of
 * `ifConditionMarker` opens an `if (...) { ... }` block (found by a brace-
 * depth count starting at that `if`'s own opening `{`) whose body contains
 * `calleeMarker`. Generalizes callSitesGatedByClick's "is this call site
 * actually nested inside a specific guard, not merely somewhere later in the
 * same function" question from an onClick handler to an arbitrary `if` guard
 * - the same class of "is this dangerous call actually gated" check this
 * file already applies to click handlers, applied here to a success-only
 * branch instead. A narrow text heuristic (this file's established posture),
 * proven against the canary fixtures below before being trusted against the
 * real file, per REGRESSION entry 239 check 10's "a structural assertion
 * without a canary is worthless".
 */
function isCallSiteWithinIfBlock(text: string, ifConditionMarker: string, calleeMarker: string): boolean {
  const ifIdx = text.indexOf(ifConditionMarker);
  if (ifIdx === -1) return false;
  const braceStart = text.indexOf("{", ifIdx);
  if (braceStart === -1) return false;
  let depth = 0;
  for (let i = braceStart; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        const blockBody = text.slice(braceStart, i);
        return blockBody.includes(calleeMarker);
      }
    }
  }
  return false;
}

describe("isCallSiteWithinIfBlock (canary: proves the guard-membership check actually discriminates)", () => {
  it("finds a call INSIDE the if block's own body", () => {
    const fixture = `if (!("error" in result)) {\n  recordLog([buildLogEntry("x")]);\n}`;
    expect(isCallSiteWithinIfBlock(fixture, 'if (!("error" in result))', 'buildLogEntry("x"')).toBe(true);
  });

  it("does NOT find a call placed AFTER the if block has already closed (an unconditional call, the exact bug this guard exists to catch)", () => {
    const fixture = `if (!("error" in result)) {\n  doSomethingElse();\n}\nrecordLog([buildLogEntry("x")]);`;
    expect(isCallSiteWithinIfBlock(fixture, 'if (!("error" in result))', 'buildLogEntry("x"')).toBe(false);
  });

  it("does NOT false-positive on a call inside a DIFFERENT, unrelated if block that happens to appear first", () => {
    const fixture = `if (someOtherCondition) {\n  buildLogEntry("x");\n}\nif (!("error" in result)) {\n  doNothing();\n}`;
    expect(isCallSiteWithinIfBlock(fixture, 'if (!("error" in result))', 'buildLogEntry("x"')).toBe(false);
  });
});

describe("handleLinkUsernames records a log entry only when linkGithubUsernames succeeds - the log must never claim a link that did not persist", () => {
  it("the buildLogEntry(\"usernames-linked\" call site sits inside handleLinkUsernames's own non-error guard, the same shape handleAcceptBinding's \"ok\" in result guard already uses above", () => {
    const defIdx = indexSource.indexOf("const handleLinkUsernames = async");
    expect(defIdx).toBeGreaterThan(-1);
    const nextFnIdx = indexSource.indexOf("const handleConfirmAllSuggested", defIdx);
    expect(nextFnIdx).toBeGreaterThan(defIdx);
    const body = indexSource.slice(defIdx, nextFnIdx);
    expect(body).toContain('buildLogEntry("usernames-linked"');
    expect(isCallSiteWithinIfBlock(body, 'if (!("error" in result))', 'buildLogEntry("usernames-linked"')).toBe(true);
  });
});

describe("handleConfirmAllSuggested records a log entry only when confirmSuggestedBindings succeeds - same rule, same shape", () => {
  it("the buildLogEntry(\"binding-confirmed\" call site sits inside handleConfirmAllSuggested's own non-error guard", () => {
    const defIdx = indexSource.indexOf("const handleConfirmAllSuggested = async");
    expect(defIdx).toBeGreaterThan(-1);
    // Bounded by the next function actually declared in index.tsx
    // (handleLinkFromCourseRoster) rather than by handleGradeCell, which
    // used to follow it here but has since moved into
    // useRepoGradesGradingActions.ts along with the rest of the grading/
    // posting handlers - see that hook's own header comment.
    const nextFnIdx = indexSource.indexOf("const handleLinkFromCourseRoster = async", defIdx);
    expect(nextFnIdx).toBeGreaterThan(defIdx);
    const body = indexSource.slice(defIdx, nextFnIdx);
    expect(body).toContain('buildLogEntry("binding-confirmed"');
    expect(isCallSiteWithinIfBlock(body, 'if (!("error" in result))', 'buildLogEntry("binding-confirmed"')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A5 (the owner's request: "for the links that are generated on the repo
// grading screen, link them out to the branch and folder specified that were
// just graded" - Ruling A5-5: repoint the existing row link, no per-cell
// links). Three risks a node-env test of repoGradeTreeLink.ts's pure
// functions cannot see on its own: (1) the row-link call site might import
// and call both builders (satisfying a naive "is it called" check) while
// leaving the anchor's actual `href` still bound to the old `row.htmlUrl` -
// the shipped-dead shape this repo has recorded before; (2) the branch
// argument might be a literal like "main" instead of the row's own recorded
// value, which every leaf/row-shape fixture using "main" would never catch
// (Ruling A5-7); (3) RepoGradesGridProps might gain `selectedFolder` as an
// OPTIONAL prop, which would compile against every existing call site
// unchanged and ship the whole feature dead with tsc, lint and every listed
// vitest command green (Ruling A5-7's "the wiring" section, fixing the
// check's M2 finding).

describe("the row-link call site (RepoGradesGrid.tsx) never leaves href bound to the bare row.htmlUrl", () => {
  const startAnchor =
    "const nameParts = deriveRepoGradeStudentName(row.binding.student, row.binding.studentSortable);";
  const endAnchor = '{row.folderError && <div className={pageStyles.error}>{row.folderError}</div>}';

  function linkWindow(): string {
    const startIdx = gridSource.indexOf(startAnchor);
    expect(startIdx).toBeGreaterThan(-1);
    const endIdx = gridSource.indexOf(endAnchor, startIdx);
    expect(endIdx).toBeGreaterThan(startIdx);
    return gridSource.slice(startIdx, endIdx);
  }

  it("canary: both anchors exist in the real file, in the expected order", () => {
    expect(() => linkWindow()).not.toThrow();
  });

  it("calls buildRepoGradeRowLinkHref with the row's OWN recorded branch (row.defaultBranch) - never a literal like \"main\", which every leaf/row-shape fixture using \"main\" would otherwise fail to catch (Ruling A5-7)", () => {
    const window = linkWindow();
    expect(window).toContain("buildRepoGradeRowLinkHref(");
    // The exact call shape, not merely "contains row.defaultBranch somewhere
    // in this window" - this is what a hardcoded-branch sabotage
    // (buildRepoGradeRowLinkHref(row.htmlUrl, "main", selectedFolder)) fails.
    expect(window).toContain("buildRepoGradeRowLinkHref(row.htmlUrl, row.defaultBranch, selectedFolder)");
  });

  it("calls buildRepoGradeRowLinkText at least once in the same window", () => {
    expect(linkWindow()).toContain("buildRepoGradeRowLinkText(");
  });

  it("the literal href={row.htmlUrl} does not appear anywhere in this file - the sabotage-catching assertion for an implementation that imports/calls both builders but leaves the anchor's actual href unchanged", () => {
    expect(gridSource).not.toContain("href={row.htmlUrl}");
  });
});

describe("RepoGradesGridProps.selectedFolder is REQUIRED, and index.tsx actually passes it (Ruling A5-7's M2 fix)", () => {
  it("RepoGradesGridProps declares `selectedFolder: string;` and never `selectedFolder?: string` - an optional prop would compile against every existing call site unchanged and ship this feature dead with every gate green", () => {
    const propsIdx = gridSource.indexOf("export interface RepoGradesGridProps {");
    expect(propsIdx).toBeGreaterThan(-1);
    const braceStart = gridSource.indexOf("{", propsIdx);
    const braceEnd = findMatchingBraceEnd(gridSource, braceStart);
    expect(braceEnd).toBeGreaterThan(braceStart);
    const body = gridSource.slice(braceStart, braceEnd);
    expect(body).toContain("selectedFolder: string;");
    expect(body).not.toContain("selectedFolder?: string");
  });

  it("index.tsx passes selectedFolder={currentSelectedFolder} to <RepoGradesGrid>, never inferred from columns.length", () => {
    const tagIdx = indexSource.indexOf("<RepoGradesGrid");
    expect(tagIdx).toBeGreaterThan(-1);
    const closeIdx = indexSource.indexOf("/>", tagIdx);
    expect(closeIdx).toBeGreaterThan(tagIdx);
    const propsBlock = indexSource.slice(tagIdx, closeIdx);
    expect(propsBlock).toContain("selectedFolder={currentSelectedFolder}");
  });
});

describe("RepoGradesControls.tsx states the branch approximation, only while a specific folder is selected (Ruling A5-9)", () => {
  it("contains the exact disclosure sentence", () => {
    expect(controlsSource).toContain("Links open the branch recorded when the repos were scanned.");
  });

  it("the sentence is gated on selectedFolder !== ALL_FOLDERS - in the ALL_FOLDERS view the href pins no branch, so stating one would be false", () => {
    const sentenceIdx = controlsSource.indexOf("Links open the branch recorded when the repos were scanned.");
    expect(sentenceIdx).toBeGreaterThan(-1);
    const before = controlsSource.slice(Math.max(0, sentenceIdx - 300), sentenceIdx);
    expect(before).toContain("selectedFolder !== ALL_FOLDERS");
  });
});
