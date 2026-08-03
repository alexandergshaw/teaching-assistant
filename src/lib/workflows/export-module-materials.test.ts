// Coverage for the course-export assignment-weighting behavior
// (selectAssignmentAnchor, echoesModuleLabel, isBetterAnchor,
// formatExportModuleMaterials - all in export-module-materials.ts, see that
// module's own header comment for why they live there), exercised end to end
// through gatherModuleMaterials exactly as before this split. These three
// describes used to live in registry-helpers.sources.test.ts and moved here
// when that file grew past the project's 1000-line cap (see AGENTS.md).
// Fixtures shared with that file (courseExport/testHelpers/baseCourse/
// noProgress) live in registry-helpers.sources.fixtures.ts instead of being
// duplicated. This file still imports gatherModuleMaterials from
// registry-helpers.sources.ts - these tests exercise the anchor/formatting
// logic through its public entry point, not export-module-materials.ts's
// exports directly, matching how they were written before the split.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseContentAction: vi.fn(),
  getPageAction: vi.fn(),
  previewFileAction: vi.fn(),
  fetchCanvasMetaAction: vi.fn(),
  ingestRepoAction: vi.fn(),
  extractZipMaterialsTextAction: vi.fn(),
  deriveTocFromSource: vi.fn(),
}));

import { gatherModuleMaterials } from "./registry-helpers.sources";
import type { SourcePolicy } from "./source-policy";
import { exportModuleValue } from "./module-value";
import { courseExport, testHelpers, baseCourse, noProgress } from "./registry-helpers.sources.fixtures";

// Part 2/3 of the INFO 1020 Week 8 fix: the course-export gatherers now emit
// item BODIES (not just titles) and weight items by CourseItemKind - the
// assignment becomes a clearly-labeled anchor, administrative-shell items
// (Discussion, Status Update) never get their own "type: title" line, and
// instructional/quiz items keep the plain "type: title" shape the tests
// above already rely on.
describe("gatherModuleMaterials - course-export assignment weighting (Part 2/3 of the INFO 1020 Week 8 fix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Reproduces the reported run's exact item titles (see the run log quoted
  // in the fix's own tracking notes): a real content note, the objectives
  // page, the learning-materials page, a discussion forum, the graded
  // assignment (with its real resolved body), a quiz, and an optional
  // status-update item.
  const week8Module = {
    name: "Module 08",
    position: 8,
    items: [
      { type: "", title: "Module 08 Objectives & Tasks" },
      { type: "", title: "Module 08 Learning" },
      { type: "", title: "Module 08 Discussion" },
      {
        type: "Assignment",
        title: "Module 08 Assignment",
        body: "DIRECTIONS: Start with the starter code in mod10.zip. Go through each step of the Try It Out on Page 330 of the book (10.38 - 10.45). Submit a link to your GitHub repository.",
      },
      { type: "", title: "Module 8 Chapter 10 Quiz" },
      { type: "", title: "(Optional) Module 08 Status Update" },
    ],
  };

  it("a single targeted module puts the assignment's body first, unmistakably labeled as the anchor", async () => {
    const loadCourseExport = vi.fn(async () => courseExport({ modules: [week8Module] }));
    const tile = baseCourse();
    const moduleIdRaw = exportModuleValue("Module 08");
    const result = await gatherModuleMaterials(
      tile,
      moduleIdRaw,
      testHelpers({ loadCourseExport }),
      noProgress
    );

    expect(result.materialsText).toContain(
      "GRADED ASSIGNMENT (what students are evaluated on): Module 08 Assignment"
    );
    expect(result.materialsText).toContain("mod10.zip");
    expect(result.materialsText).toContain("Try It Out");
    expect(result.materialsText).toContain("GitHub");

    // The anchor line comes before every other item in the module.
    const anchorIndex = result.materialsText.indexOf("GRADED ASSIGNMENT");
    const objectivesIndex = result.materialsText.indexOf("Module 08 Objectives");
    expect(anchorIndex).toBeGreaterThanOrEqual(0);
    expect(objectivesIndex).toBeGreaterThan(anchorIndex);
  });

  it("administrative-shell items are named for context but never emitted as their own titled line", async () => {
    const loadCourseExport = vi.fn(async () => courseExport({ modules: [week8Module] }));
    const tile = baseCourse();
    const moduleIdRaw = exportModuleValue("Module 08");
    const result = await gatherModuleMaterials(
      tile,
      moduleIdRaw,
      testHelpers({ loadCourseExport }),
      noProgress
    );

    // The bug this fixes, named directly: "Module 08 Discussion Forum" (or
    // here, "Module 08 Discussion") must never appear as its own
    // "type: title"-shaped line the way a real section-topic candidate would.
    expect(result.materialsText).not.toContain(": Module 08 Discussion\n");
    expect(result.materialsText).not.toContain(": (Optional) Module 08 Status Update\n");
    // Still named for course-structure context, just not as a titled line.
    expect(result.materialsText).toContain("Module 08 Discussion");
    expect(result.materialsText).toContain("(Optional) Module 08 Status Update");
    expect(result.materialsText).toContain("course housekeeping");
  });

  it("instructional and quiz items keep the plain 'type: title' line", async () => {
    const loadCourseExport = vi.fn(async () => courseExport({ modules: [week8Module] }));
    const tile = baseCourse();
    const moduleIdRaw = exportModuleValue("Module 08");
    const result = await gatherModuleMaterials(
      tile,
      moduleIdRaw,
      testHelpers({ loadCourseExport }),
      noProgress
    );

    expect(result.materialsText).toContain(": Module 08 Learning\n");
    expect(result.materialsText).toContain(": Module 08 Objectives & Tasks\n");
    expect(result.materialsText).toContain("Module 8 Chapter 10 Quiz");
  });

  it("the course-level (no module selected) digest across every module also anchors each module's assignment", async () => {
    const loadCourseExport = vi.fn(async () =>
      courseExport({
        modules: [
          week8Module,
          {
            name: "Module 09",
            position: 9,
            items: [{ type: "Assignment", title: "Module 09 Assignment", body: "Write a sorting algorithm." }],
          },
        ],
      })
    );
    const tile = baseCourse();
    const policy: SourcePolicy = { order: ["course-export"], strategy: "first-success" };
    const result = await gatherModuleMaterials(
      tile,
      "",
      testHelpers({ loadCourseExport }),
      noProgress,
      policy
    );

    expect(result.materialsText).toContain(
      "GRADED ASSIGNMENT (what students are evaluated on): Module 08 Assignment"
    );
    expect(result.materialsText).toContain("mod10.zip");
    expect(result.materialsText).toContain(
      "GRADED ASSIGNMENT (what students are evaluated on): Module 09 Assignment"
    );
    expect(result.materialsText).toContain("Write a sorting algorithm.");
    expect(result.materialsText).not.toContain(": Module 08 Discussion\n");
  });

  it("caps the number of assignment bodies included in a course-level digest, with an omitted-count note", async () => {
    // DESCRIPTION_FETCH_LIMIT (registry-helpers.sources.ts) is 6 - build 8
    // modules each with one assignment carrying a body, so 2 must be omitted.
    const modules = Array.from({ length: 8 }, (_, i) => ({
      name: `Module ${i + 1}`,
      position: i + 1,
      items: [
        {
          type: "Assignment",
          title: `Module ${i + 1} Assignment`,
          body: `Assignment body text for module ${i + 1}.`,
        },
      ],
    }));
    const loadCourseExport = vi.fn(async () => courseExport({ modules }));
    const tile = baseCourse();
    const policy: SourcePolicy = { order: ["course-export"], strategy: "first-success" };
    const result = await gatherModuleMaterials(
      tile,
      "",
      testHelpers({ loadCourseExport }),
      noProgress,
      policy
    );

    // Every module's assignment TITLE still appears (nothing dropped from the
    // structure) ...
    for (let i = 1; i <= 8; i++) {
      expect(result.materialsText).toContain(`Module ${i} Assignment`);
    }
    // ... but only the first 6 bodies were included, and the shortfall is
    // reported as a note rather than silently dropped.
    expect(result.materialsText).toContain("Assignment body text for module 1.");
    expect(result.materialsText).toContain("Assignment body text for module 6.");
    expect(result.materialsText).not.toContain("Assignment body text for module 7.");
    expect(result.materialsText).not.toContain("Assignment body text for module 8.");
    expect(result.notes.some((n) => n.includes("further assignment descriptions omitted (2 more)"))).toBe(
      true
    );
  });
});

// The bug report's own failure mode, reproduced end to end through
// gatherModuleMaterials: Canvas stores "(Optional) Module 08 Status Update"
// under an assignment-family type, so before the type-shadow fix
// (course-item-classifier.ts's classifyCourseItemKind) it landed in
// kinds.assignment and formatExportModuleMaterials labeled BOTH it and the
// real assignment "GRADED ASSIGNMENT (what students are evaluated on)" -
// two competing anchors, exactly the ambiguity the bug report named. These
// tests assert on the module text gatherModuleMaterials actually returns,
// not on the classifier in isolation, so a regression in either Part 1
// (course-item-classifier.ts) or Part 2 (selectAssignmentAnchor here) would
// show up here.
describe("gatherModuleMaterials - type-shadow anchor fix (Part 1/Part 2 of the '(Optional) Module 08 Status Update' fix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a Canvas-typed optional status update never becomes a second GRADED ASSIGNMENT anchor", async () => {
    const moduleWithTypedStatusUpdate = {
      name: "Module 08",
      position: 8,
      items: [
        {
          type: "Assignment",
          title: "Module 08 Assignment",
          body: "DIRECTIONS: Start with the starter code in mod10.zip. Submit a link to your GitHub repository.",
        },
        // Reproduces the real bug report exactly: Canvas stores this
        // ungraded participation checkpoint under the SAME assignment-family
        // type as the genuinely graded assignment above.
        { type: "Assignment", title: "(Optional) Module 08 Status Update" },
      ],
    };
    const loadCourseExport = vi.fn(async () => courseExport({ modules: [moduleWithTypedStatusUpdate] }));
    const tile = baseCourse();
    const moduleIdRaw = exportModuleValue("Module 08");
    const result = await gatherModuleMaterials(tile, moduleIdRaw, testHelpers({ loadCourseExport }), noProgress);

    // Exactly one anchor line - the status update never competes for it.
    const anchorMatches = result.materialsText.match(/GRADED ASSIGNMENT/g) ?? [];
    expect(anchorMatches.length).toBe(1);
    expect(result.materialsText).toContain(
      "GRADED ASSIGNMENT (what students are evaluated on): Module 08 Assignment"
    );
    expect(result.materialsText).not.toContain(": (Optional) Module 08 Status Update\n");
    // Still named for course-structure context, just not as a titled line or
    // a second anchor.
    expect(result.materialsText).toContain("(Optional) Module 08 Status Update");
    expect(result.materialsText).toContain("course housekeeping");
  });

  it("a module with two genuine assignments picks exactly one deterministic anchor by body length, and the other still appears (not as the anchor)", async () => {
    const moduleWithTwoAssignments = {
      name: "Module 12",
      position: 12,
      items: [
        { type: "Assignment", title: "Module 12 Reading Check", body: "Short body." },
        {
          type: "Assignment",
          title: "Module 12 Project",
          body: "A much longer, more substantive body describing the actual graded project deliverable in detail, step by step.",
        },
      ],
    };
    const loadCourseExport = vi.fn(async () => courseExport({ modules: [moduleWithTwoAssignments] }));
    const tile = baseCourse();
    const moduleIdRaw = exportModuleValue("Module 12");
    const result = await gatherModuleMaterials(tile, moduleIdRaw, testHelpers({ loadCourseExport }), noProgress);

    const anchorMatches = result.materialsText.match(/GRADED ASSIGNMENT/g) ?? [];
    expect(anchorMatches.length).toBe(1);
    // The longer-bodied item wins the anchor (rule 2: most substantive body).
    expect(result.materialsText).toContain(
      "GRADED ASSIGNMENT (what students are evaluated on): Module 12 Project"
    );
    // The other genuine assignment still appears, just not as the anchor.
    expect(result.materialsText).toContain("Assignment: Module 12 Reading Check");
    expect(result.materialsText).not.toContain(
      "GRADED ASSIGNMENT (what students are evaluated on): Module 12 Reading Check"
    );
  });

  it("a non-optional item is preferred as the anchor over an optional one, even when the optional one has a longer body", async () => {
    // Neither item's type matches TYPE_ASSIGNMENT_PATTERN (type ""), so both
    // reach kinds.assignment via the ordinary title fallback
    // (TITLE_ASSIGNMENT_PATTERN's "assignment"/"project" words) rather than
    // Part 1's type-shadow demotion - this isolates Part 2's own
    // optional-preference tiebreak from Part 1's classification fix.
    const moduleWithOptionalAndReal = {
      name: "Module 13",
      position: 13,
      items: [
        {
          type: "",
          title: "(Optional) Module 13 Extra Credit Project",
          body: "A very long optional extra-credit write-up that is much longer than the real assignment's body text, to prove body length alone does not win.",
        },
        { type: "", title: "Module 13 Assignment", body: "Short real body." },
      ],
    };
    const loadCourseExport = vi.fn(async () => courseExport({ modules: [moduleWithOptionalAndReal] }));
    const tile = baseCourse();
    const moduleIdRaw = exportModuleValue("Module 13");
    const result = await gatherModuleMaterials(tile, moduleIdRaw, testHelpers({ loadCourseExport }), noProgress);

    const anchorMatches = result.materialsText.match(/GRADED ASSIGNMENT/g) ?? [];
    expect(anchorMatches.length).toBe(1);
    expect(result.materialsText).toContain(
      "GRADED ASSIGNMENT (what students are evaluated on): Module 13 Assignment"
    );
    expect(result.materialsText).not.toContain(
      "GRADED ASSIGNMENT (what students are evaluated on): (Optional) Module 13 Extra Credit Project"
    );
  });

  it("a full tie on both optional-ness and body length falls back to first-in-module order", async () => {
    // Neither item is optional and both bodies are the same length, so
    // rules 1 and 2 cannot break the tie - only rule 3 (first-in-module
    // order, the array's own order) decides, and it must always keep the
    // EARLIER item rather than the later one.
    const moduleWithATie = {
      name: "Module 15",
      position: 15,
      items: [
        { type: "Assignment", title: "Module 15 First Assignment", body: "Identical length body." },
        { type: "Assignment", title: "Module 15 Second Assignment", body: "Identical length body." },
      ],
    };
    const loadCourseExport = vi.fn(async () => courseExport({ modules: [moduleWithATie] }));
    const tile = baseCourse();
    const moduleIdRaw = exportModuleValue("Module 15");
    const result = await gatherModuleMaterials(tile, moduleIdRaw, testHelpers({ loadCourseExport }), noProgress);

    const anchorMatches = result.materialsText.match(/GRADED ASSIGNMENT/g) ?? [];
    expect(anchorMatches.length).toBe(1);
    expect(result.materialsText).toContain(
      "GRADED ASSIGNMENT (what students are evaluated on): Module 15 First Assignment"
    );
    expect(result.materialsText).not.toContain(
      "GRADED ASSIGNMENT (what students are evaluated on): Module 15 Second Assignment"
    );
  });

  it("a module with no assignment-kind items produces no anchor line and does not throw", async () => {
    const moduleWithNoAssignments = {
      name: "Module 14",
      position: 14,
      items: [
        { type: "", title: "Module 14 Discussion" },
        { type: "", title: "Module 14 Learning" },
      ],
    };
    const loadCourseExport = vi.fn(async () => courseExport({ modules: [moduleWithNoAssignments] }));
    const tile = baseCourse();
    const moduleIdRaw = exportModuleValue("Module 14");
    const result = await gatherModuleMaterials(tile, moduleIdRaw, testHelpers({ loadCourseExport }), noProgress);

    expect(result.materialsText).not.toContain("GRADED ASSIGNMENT");
  });
});

// Three more real defects the regression gate found by running this code
// against the instructor's ACTUAL Canvas export (26ss-info-1020-2a export),
// not a hand-built fixture. Body text below is SYNTHETIC filler of the same
// LENGTH the real export's resolved bodies actually were (dumped via a
// throwaway parseCartridgeBlob probe, then deleted) - only the length, not
// the instructor's actual page content, drives selectAssignmentAnchor or
// formatExportModuleMaterials, so reproducing the length is what matters.
describe("gatherModuleMaterials - real regression-gate defects against the instructor's actual Canvas export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Definition of Done #3: proves the anchor picks "Module 05 Assignment"
  // over the longer-bodied "Code Walk 1 of 2", using the real export's own
  // body lengths (1191 vs 1122) - the OLD body-length-only rule anchored
  // "Code Walk 1 of 2" here, on the very export this feature was built from.
  it("Module 05's anchor is the module's OWN assignment, not the longer-bodied supplementary 'Code Walk 1 of 2'", async () => {
    const module05 = {
      name: "Module 05",
      position: 5,
      items: [
        { type: "Assignment", title: "Code Walk 1 of 2", body: "x".repeat(1191) },
        { type: "Assignment", title: "Module 05 Assignment", body: "x".repeat(1122) },
      ],
    };
    const loadCourseExport = vi.fn(async () => courseExport({ modules: [module05] }));
    const tile = baseCourse();
    const moduleIdRaw = exportModuleValue("Module 05");
    const result = await gatherModuleMaterials(tile, moduleIdRaw, testHelpers({ loadCourseExport }), noProgress);

    const anchorMatches = result.materialsText.match(/GRADED ASSIGNMENT/g) ?? [];
    expect(anchorMatches.length).toBe(1);
    expect(result.materialsText).toContain(
      "GRADED ASSIGNMENT (what students are evaluated on): Module 05 Assignment"
    );
    expect(result.materialsText).not.toContain(
      "GRADED ASSIGNMENT (what students are evaluated on): Code Walk 1 of 2"
    );
    expect(result.materialsText).toContain("Assignment: Code Walk 1 of 2");
  });

  // The same defect, reproduced in Module 10 ("Code Walk 2 of 2" body 1164
  // vs "Module 10 Assignment" body 612) - the task's own report named BOTH
  // modules as anchored wrong; this proves the fix is not narrowly patched
  // to Module 05's exact numbers.
  it("Module 10's anchor is likewise the module's OWN assignment, not the longer-bodied 'Code Walk 2 of 2'", async () => {
    const module10 = {
      name: "Module 10 - Game Design",
      position: 10,
      items: [
        { type: "Assignment", title: "Module 10 Assignment", body: "x".repeat(612) },
        { type: "Assignment", title: "Code Walk 2 of 2", body: "x".repeat(1164) },
      ],
    };
    const loadCourseExport = vi.fn(async () => courseExport({ modules: [module10] }));
    const tile = baseCourse();
    const moduleIdRaw = exportModuleValue("Module 10 - Game Design");
    const result = await gatherModuleMaterials(tile, moduleIdRaw, testHelpers({ loadCourseExport }), noProgress);

    expect(result.materialsText).toContain(
      "GRADED ASSIGNMENT (what students are evaluated on): Module 10 Assignment"
    );
    expect(result.materialsText).not.toContain(
      "GRADED ASSIGNMENT (what students are evaluated on): Code Walk 2 of 2"
    );
  });

  // The full real Module 05 item set (all 8 items, real titles/types/body
  // lengths from the export), proving the anchor fix and the sign-up
  // demotion fix (course-item-classifier.ts's TITLE_ACTION_PATTERN) work
  // together correctly: "GitHub Sign Up" is itself assignment-family typed
  // AND its own title now demotes it to administrative, so it competes for
  // neither the anchor nor a plain "Assignment: ..." line - it surfaces only
  // in the housekeeping parenthetical, alongside the discussion and the
  // optional status update.
  it("the full real Module 05 item set anchors correctly and demotes 'GitHub Sign Up' out of the assignment bucket entirely", async () => {
    const module05Full = {
      name: "Module 05 - Big Data and File I/O",
      position: 5,
      items: [
        { type: "WikiPage", title: "Module 05 Objectives & Tasks", body: "x".repeat(757) },
        { type: "WikiPage", title: "Module 05 Learning", body: "x".repeat(410) },
        { type: "Attachment", title: "Module 05 Slides.pptx" },
        { type: "DiscussionTopic", title: "Module 05 Discussion" },
        { type: "Quizzes::Quiz", title: "Module 5 Chapter 5 Quiz" },
        { type: "Assignment", title: "(Optional) Module 05 Status Update", body: "x".repeat(233) },
        { type: "Assignment", title: "Code Walk 1 of 2", body: "x".repeat(1191) },
        { type: "ContextModuleSubHeader", title: "GitHub" },
        { type: "Assignment", title: "GitHub Sign Up", body: "x".repeat(267) },
        { type: "Assignment", title: "Module 05 Assignment", body: "x".repeat(1122) },
      ],
    };
    const loadCourseExport = vi.fn(async () => courseExport({ modules: [module05Full] }));
    const tile = baseCourse();
    const moduleIdRaw = exportModuleValue("Module 05 - Big Data and File I/O");
    const result = await gatherModuleMaterials(tile, moduleIdRaw, testHelpers({ loadCourseExport }), noProgress);

    const anchorMatches = result.materialsText.match(/GRADED ASSIGNMENT/g) ?? [];
    expect(anchorMatches.length).toBe(1);
    expect(result.materialsText).toContain(
      "GRADED ASSIGNMENT (what students are evaluated on): Module 05 Assignment"
    );
    // Neither "Code Walk 1 of 2" nor "GitHub Sign Up" is the anchor.
    expect(result.materialsText).not.toContain(
      "GRADED ASSIGNMENT (what students are evaluated on): Code Walk 1 of 2"
    );
    expect(result.materialsText).not.toContain(
      "GRADED ASSIGNMENT (what students are evaluated on): GitHub Sign Up"
    );
    // "Code Walk 1 of 2" is still a genuine assignment-kind item - it appears
    // as a plain line, just not the anchor.
    expect(result.materialsText).toContain("Assignment: Code Walk 1 of 2");
    // "GitHub Sign Up" is administrative now (sign-up title demotion) - it
    // never gets a titled "Assignment: ..." line of its own, only the
    // housekeeping parenthetical.
    expect(result.materialsText).not.toContain(": GitHub Sign Up\n");
    expect(result.materialsText).toContain("course housekeeping");
    expect(result.materialsText).toContain("GitHub Sign Up");
  });

  // Definition of Done, defect 3 (paired with course-item-classifier.ts's own
  // "Getting Started" classification fix): the real "Start Here" module,
  // where "Getting Started" (a WikiPage with a 1398-character resolved body)
  // was being classified "administrative" and its body discarded outright.
  it("'Getting Started' now surfaces as instructional with its full resolved body, not collapsed into the housekeeping parenthetical", async () => {
    const startHere = {
      name: "Start Here",
      position: 0,
      items: [
        { type: "WikiPage", title: "Course Objectives & Tasks", body: "x".repeat(777) },
        { type: "WikiPage", title: "Getting Started", body: "x".repeat(1398) },
        {
          type: "WikiPage",
          title: "How to Access Tutoring and Academic Support on AccuCampus (Video)",
          body: "x".repeat(2323),
        },
      ],
    };
    const loadCourseExport = vi.fn(async () => courseExport({ modules: [startHere] }));
    const tile = baseCourse();
    const moduleIdRaw = exportModuleValue("Start Here");
    const result = await gatherModuleMaterials(tile, moduleIdRaw, testHelpers({ loadCourseExport }), noProgress);

    // The title line - unchanged shape, same as any other instructional item.
    expect(result.materialsText).toContain("WikiPage: Getting Started\n");
    // The body itself - the actual fix. All 1398 characters, not truncated
    // or discarded, and not swept into the one-line housekeeping list.
    expect(result.materialsText).toContain("x".repeat(1398));
    expect(result.materialsText).not.toContain("course housekeeping");
  });
});
