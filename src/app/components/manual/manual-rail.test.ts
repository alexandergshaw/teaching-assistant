import { describe, it, expect } from "vitest";
import {
  getDestinationById,
  getActiveDestinationId,
  resolveStateFromDestinationId,
  validateLmsViewsCompleteness,
  destinations,
  LMS_VIEWS,
  MANUAL_VIEW_ORDER,
  MANUAL_VIEW_LABELS,
  GRADING_VIEWS,
  ANNOUNCEMENTS_VIEWS,
  isAnnouncementsView,
  getInnerDestinations,
  getInnerNavAriaLabel,
  isManualViewType,
  isPresentationsView,
  PRESENTATIONS_VIEWS,
  AUTOMATE_VIEWS,
  isAutomateView,
} from "./manual-rail";

describe("manual-rail", () => {
  describe("getDestinationById", () => {
    it("should return the destination for a valid id", () => {
      const dest = getDestinationById("build-new");
      expect(dest).toBeDefined();
      expect(dest?.label).toBe("New Build");
    });

    it("should return undefined for an invalid id", () => {
      const dest = getDestinationById("invalid-id");
      expect(dest).toBeUndefined();
    });

    it("should find all LMS destinations", () => {
      expect(getDestinationById("lms-modules")).toBeDefined();
      expect(getDestinationById("lms-assignments")).toBeDefined();
      expect(getDestinationById("lms-quizzes")).toBeDefined();
      expect(getDestinationById("lms-pages")).toBeDefined();
      expect(getDestinationById("lms-files")).toBeDefined();
      // ANNOUNCEMENTS-TAB A-W2: moved out of LMS into the Announcements sub-tab.
      expect(getDestinationById("lms-announcements")).toBeUndefined();
      expect(getDestinationById("lms-inbox")).toBeDefined();
    });
  });

  describe("getActiveDestinationId", () => {
    it("should return build-new when manualView is course-planning and buildView is new", () => {
      const id = getActiveDestinationId("course-planning", "new", "modules", "run");
      expect(id).toBe("build-new");
    });

    it("should return build-prebuilt when manualView is course-planning and buildView is prebuilt", () => {
      const id = getActiveDestinationId("course-planning", "prebuilt", "modules", "run");
      expect(id).toBe("build-prebuilt");
    });

    it("should return lms-{view} when manualView is content", () => {
      expect(getActiveDestinationId("content", "new", "modules", "run")).toBe("lms-modules");
      expect(getActiveDestinationId("content", "new", "assignments", "run")).toBe("lms-assignments");
      expect(getActiveDestinationId("content", "new", "quizzes", "run")).toBe("lms-quizzes");
      expect(getActiveDestinationId("content", "new", "pages", "run")).toBe("lms-pages");
    });

    it("should return version-control when manualView is version-control", () => {
      const id = getActiveDestinationId("version-control", "new", "modules", "run");
      expect(id).toBe("version-control");
    });

    it("should return recording when manualView is recording", () => {
      const id = getActiveDestinationId("recording", "new", "modules", "run");
      expect(id).toBe("recording");
    });
  });

  describe("resolveStateFromDestinationId", () => {
    it("should resolve build-new to course-planning + new", () => {
      const state = resolveStateFromDestinationId("build-new", "content", "prebuilt", "modules", "run");
      expect(state.manualView).toBe("course-planning");
      expect(state.buildView).toBe("new");
    });

    it("should resolve build-prebuilt to course-planning + prebuilt", () => {
      const state = resolveStateFromDestinationId("build-prebuilt", "content", "new", "modules", "run");
      expect(state.manualView).toBe("course-planning");
      expect(state.buildView).toBe("prebuilt");
    });

    it("should resolve lms-{view} to content + view", () => {
      const state = resolveStateFromDestinationId("lms-pages", "recording", "new", "modules", "run");
      expect(state.manualView).toBe("content");
      expect(state.contentView).toBe("pages");
    });

    it("should resolve lms-assignments and lms-quizzes to content + their view", () => {
      const assignments = resolveStateFromDestinationId("lms-assignments", "recording", "new", "modules", "run");
      expect(assignments.manualView).toBe("content");
      expect(assignments.contentView).toBe("assignments");

      const quizzes = resolveStateFromDestinationId("lms-quizzes", "recording", "new", "modules", "run");
      expect(quizzes.manualView).toBe("content");
      expect(quizzes.contentView).toBe("quizzes");
    });

    it("should resolve version-control to version-control", () => {
      const state = resolveStateFromDestinationId("version-control", "content", "new", "modules", "run");
      expect(state.manualView).toBe("version-control");
    });

    it("should preserve current state for non-matching ids", () => {
      const state = resolveStateFromDestinationId("invalid", "recording", "new", "modules", "run");
      expect(state.manualView).toBe("recording");
      expect(state.buildView).toBe("new");
      expect(state.contentView).toBe("modules");
    });

    it("no longer resolves lms-announcements (moved to the Announcements sub-tab in A-W2)", () => {
      const state = resolveStateFromDestinationId("lms-announcements", "recording", "new", "modules", "run");
      // The id falls through: the current contentView is kept, never "announcements".
      expect(state.contentView).toBe("modules");
    });

    it("should resolve lms-inbox correctly", () => {
      const state = resolveStateFromDestinationId("lms-inbox", "course-planning", "new", "modules", "run");
      expect(state.manualView).toBe("content");
      expect(state.contentView).toBe("inbox");
    });

    it("should resolve grading-run and grading-repos to grading + their inner view", () => {
      const run = resolveStateFromDestinationId("grading-run", "content", "new", "modules", "repos");
      expect(run.manualView).toBe("grading");
      expect(run.gradingView).toBe("run");

      const repos = resolveStateFromDestinationId("grading-repos", "content", "new", "modules", "run");
      expect(repos.manualView).toBe("grading");
      expect(repos.gradingView).toBe("repos");
    });
  });

  describe("validateLmsViewsCompleteness", () => {
    it("should have no errors for a complete rail", () => {
      const errors = validateLmsViewsCompleteness();
      expect(errors).toHaveLength(0);
    });

    it("should list all LMS views", () => {
      expect(LMS_VIEWS).toEqual(["modules", "assignments", "quizzes", "pages", "files", "inbox"]);
    });

    it("should have all LMS views represented in rail", () => {
      for (const view of LMS_VIEWS) {
        const dest = getDestinationById(`lms-${view}`);
        expect(dest).toBeDefined();
      }
    });
  });

  describe("destinations structure", () => {
    it("should have groups defined", () => {
      expect(destinations.length).toBeGreaterThan(0);
    });

    it("should have Build and LMS groups", () => {
      const buildGroup = destinations.find((g) => g.name === "Build");
      const lmsGroup = destinations.find((g) => g.name === "LMS");
      expect(buildGroup).toBeDefined();
      expect(lmsGroup).toBeDefined();
    });

    it("should have all required destinations", () => {
      const allDests = destinations.flatMap((g) => g.destinations).map((d) => d.id);
      expect(allDests).toContain("build-new");
      expect(allDests).toContain("build-prebuilt");
      expect(allDests).toContain("version-control");
      expect(allDests).toContain("recording");
      expect(allDests).toContain("presentations-ppt-design");
    });

    it("should have descriptions for all destinations", () => {
      for (const group of destinations) {
        for (const dest of group.destinations) {
          expect(dest.description).toBeTruthy();
          expect(dest.label).toBeTruthy();
        }
      }
    });
  });

  describe("MANUAL_VIEW_ORDER / MANUAL_VIEW_LABELS (the Manual half of the Tools rail)", () => {
    it("should list the eight subtabs in display order", () => {
      // Nine: "announcements" (ANNOUNCEMENTS-TAB A-W1) sits at index 7
      // (TOOLS-IA-REORG W1 moved it down from index 2, to just before Grading). Before that, "presentations" (PRES-1 wave 3) is the newest
      // addition - an inner-nav subtab (a "Presentations" destination group
      // holding "Slide Deck Creation", extensible to more children later),
      // slotted between Artifact Templates and Grading. "course-intel" left
      // this rail entirely when it was promoted to a top-level tab (D24a).
      // See the removal block below. "grading" occupies the slot
      // "repo-grades" used to (GRAD-SUBTAB wave 1): it absorbed both the old
      // LMS Grading destination and the standalone Repo Grades subtab into
      // one container with its own inner nav.
      expect(MANUAL_VIEW_ORDER).toEqual([
        "course-planning",
        "content",
        "version-control",
        "recording",
        "artifact-design",
        "presentations",
        "announcements",
        "grading",
      ]);
    });

    it("should have a label for every entry in the order", () => {
      for (const view of MANUAL_VIEW_ORDER) {
        expect(MANUAL_VIEW_LABELS[view]).toBeTruthy();
      }
    });

    it("should label course-planning as Build Courses and content as LMS", () => {
      expect(MANUAL_VIEW_LABELS["course-planning"]).toBe("Build Courses");
      expect(MANUAL_VIEW_LABELS["content"]).toBe("LMS");
    });

    it("registers announcements as a Manual view with a non-empty label", () => {
      expect(isManualViewType("announcements")).toBe(true);
      expect(MANUAL_VIEW_LABELS["announcements"]).toBeTruthy();
    });
  });

  describe("getInnerDestinations (the level below a rail chip)", () => {
    it("should return the Build destinations for course-planning", () => {
      const inner = getInnerDestinations("course-planning");
      expect(inner?.map((d) => d.id)).toEqual(["build-new", "build-prebuilt"]);
    });

    it("should return the LMS destinations for content", () => {
      const inner = getInnerDestinations("content");
      expect(inner?.map((d) => d.id)).toEqual([
        "lms-modules",
        "lms-assignments",
        "lms-quizzes",
        "lms-pages",
        "lms-files",
        "lms-inbox",
      ]);
    });

    it("should return the Grading destinations for grading", () => {
      const inner = getInnerDestinations("grading");
      expect(inner?.map((d) => d.id)).toEqual([
        "grading-run",
        "grading-repos",
        "grading-recording",
        "grading-snapshots",
        "grading-drafts",
        "grading-chat",
      ]);
    });

    it("should return the Announcements destinations for announcements", () => {
      const inner = getInnerDestinations("announcements");
      expect(inner?.map((d) => d.id)).toEqual(["announcements-post", "announcements-recording", "announcements-walkthrough"]);
      expect(inner?.map((d) => d.label)).toEqual(["Post an announcement", "From a recording", "From a walkthrough"]);
    });

    it("should return null for single-view subtabs", () => {
      expect(getInnerDestinations("version-control")).toBeNull();
      expect(getInnerDestinations("recording")).toBeNull();
    });
  });

  // I1 (docs/tools-grading-subtab-architecture.md section 6.1): a view has
  // inner destinations if and only if it has an accessible name for them, and
  // no two inner navs share a name - both readers derive from the SAME
  // INNER_NAV table, so there is no second list either could fall out of sync
  // with. This is what stands in for "the Grading inner nav is announced
  // correctly" in an environment where no component is ever rendered.
  describe("getInnerDestinations / getInnerNavAriaLabel parity (I1)", () => {
    it("agree on which views have an inner nav, for every registered Manual view", () => {
      for (const view of MANUAL_VIEW_ORDER) {
        const hasDestinations = getInnerDestinations(view) !== null;
        const hasLabel = getInnerNavAriaLabel(view) !== null;
        expect(
          hasDestinations,
          `"${view}": getInnerDestinations() !== null was ${hasDestinations} but getInnerNavAriaLabel() !== null was ${hasLabel}`
        ).toBe(hasLabel);
      }
    });

    it("gives every inner nav a distinct accessible name", () => {
      const labels = MANUAL_VIEW_ORDER.map((view) => getInnerNavAriaLabel(view)).filter(
        (label): label is string => label !== null
      );
      expect(new Set(labels).size).toBe(labels.length);
    });

    it("labels the Grading inner nav distinctly from the LMS inner nav it used to sit inside", () => {
      expect(getInnerNavAriaLabel("grading")).toBe("Grading tools");
      expect(getInnerNavAriaLabel("content")).toBe("LMS views");
      expect(getInnerNavAriaLabel("grading")).not.toBe(getInnerNavAriaLabel("content"));
    });

    // TOOLS-IA-REORG W2: Announcements gained a third child (From a recording)
    // re-parented from Recording; its ARIA name must stay table-fed and correct.
    it("keeps the Announcements inner nav named after the re-parent", () => {
      expect(getInnerNavAriaLabel("announcements")).toBe("Announcements views");
      expect(getInnerNavAriaLabel("recording")).toBeNull();
      expect(getInnerDestinations("recording")).toBeNull();
    });
  });
});

// Finding 4 (docs/assignments-quizzes-tabs-acceptance-criteria.md review):
// resolveStateFromDestinationId's `contentView` chain (manual-rail.ts,
// resolveStateFromDestinationId) and getActiveDestinationId's `lms-${view}`
// derivation are both HARDCODED per-id (well, per the latter's uniform
// template, but the former is a literal `if` ladder) with no compile-time or
// test-time guard - this is the eighth registration point, alongside D4r/D5r
// in ContentTab.tsx. The "lms-assignments"/"lms-quizzes" test above
// (added when those two ids were registered) is two hand-written literal
// cases, so the ladder itself stays underived: the NEXT view added to
// LMS_VIEWS can repeat the exact same silent-drop bug without this suite
// noticing, the same way D6r's useAppNavigation.ts restore list already did
// once in this file's history (see that test's own comment).
//
// This guard is DERIVED from LMS_VIEWS (manual-rail.ts's own single source
// of truth for the view id set) instead of restating a list, so a future
// view is covered automatically - no new hand-written case required.
describe("resolveStateFromDestinationId / getActiveDestinationId - derived guard over every LMS_VIEWS member", () => {
  it("resolves 'lms-<view>' to manualView 'content' and contentView <view>, for every member of LMS_VIEWS", () => {
    for (const view of LMS_VIEWS) {
      const state = resolveStateFromDestinationId(`lms-${view}`, "recording", "new", "modules", "run");
      expect(state.manualView).toBe("content");
      expect(state.contentView).toBe(view);
    }
  });

  it("round-trips every LMS_VIEWS member through getActiveDestinationId back to 'lms-<view>'", () => {
    for (const view of LMS_VIEWS) {
      expect(getActiveDestinationId("content", "new", view, "run")).toBe(`lms-${view}`);
    }
  });
});

// AC2/hops 7-8 (docs/tools-grading-subtab-architecture.md section 8): the
// same derived-guard shape as the LMS_VIEWS loop above, over the Grading
// sub-tab's own two-member inner selection.
describe("resolveStateFromDestinationId / getActiveDestinationId - derived guard over every GRADING_VIEWS member", () => {
  it("resolves 'grading-<view>' to manualView 'grading' and gradingView <view>, for every member of GRADING_VIEWS", () => {
    for (const view of GRADING_VIEWS) {
      const state = resolveStateFromDestinationId(`grading-${view}`, "recording", "new", "modules", "run");
      expect(state.manualView).toBe("grading");
      expect(state.gradingView).toBe(view);
    }
  });

  it("round-trips every GRADING_VIEWS member through getActiveDestinationId back to 'grading-<view>'", () => {
    for (const view of GRADING_VIEWS) {
      expect(getActiveDestinationId("grading", "new", "modules", view)).toBe(`grading-${view}`);
    }
  });
});

// WORKFLOWS-COLLAPSE W2: artifact-design is now the "Automate" container. It
// keeps the manualView value (so a returning ?manualView=artifact-design user
// needs no migration) and grew an inner nav of Templates / Workflows /
// Automations, exactly the way presentations grew one at PRES-2 S6.7. The chip
// label is owner-settable copy (residual R-3).
describe("artifact-design subtab (the Automate container)", () => {
  it("is reachable from its destination id and reports itself as active (Templates is the default child)", () => {
    const resolved = resolveStateFromDestinationId("artifact-design", "content", "new", "modules", "run");
    expect(resolved.manualView).toBe("artifact-design");
    expect(resolved.automateView).toBe("templates");
    expect(getActiveDestinationId("artifact-design", "new", "modules", "run")).toBe("artifact-design");
  });

  it("has a Templates rail destination that keeps the recognisable Artifact Templates label", () => {
    const dest = getDestinationById("artifact-design");
    expect(dest).toBeDefined();
    expect(dest!.label).toBe("Artifact Templates");
    expect(dest!.description).toBeTruthy();
  });

  it("relabels the rail chip to Automate (the value is unchanged)", () => {
    expect(MANUAL_VIEW_LABELS["artifact-design"]).toBe("Automate");
    expect(isManualViewType("artifact-design")).toBe(true);
  });

  it("has exactly three inner destinations - Templates, Workflows, Automations - in that order (AC-W2-1)", () => {
    const inner = getInnerDestinations("artifact-design");
    expect(inner).not.toBeNull();
    expect(inner?.map((d) => d.id)).toEqual([
      "artifact-design",
      "artifact-design-workflows",
      "artifact-design-automations",
    ]);
    expect(inner?.map((d) => d.label)).toEqual(["Artifact Templates", "Workflows", "Automations"]);
  });

  it("names its inner nav distinctly (AC-W2-7)", () => {
    expect(getInnerNavAriaLabel("artifact-design")).toBe("Automate views");
    expect(getInnerNavAriaLabel("artifact-design")).not.toBe(getInnerNavAriaLabel("presentations"));
  });

  it("resolves each inner destination id to the container plus its automateView, and reports it active", () => {
    for (const [id, view] of [
      ["artifact-design", "templates"],
      ["artifact-design-workflows", "workflows"],
      ["artifact-design-automations", "automations"],
    ] as const) {
      const resolved = resolveStateFromDestinationId(id, "content", "new", "modules", "run");
      expect(resolved.manualView, id).toBe("artifact-design");
      expect(resolved.automateView, id).toBe(view);
      expect(getActiveDestinationId("artifact-design", "new", "modules", "run", "slide-deck", "post", view), id).toBe(id);
    }
  });

  it("leaves automateView alone when a destination of another view is picked", () => {
    const resolved = resolveStateFromDestinationId("grading-run", "content", "new", "modules", "run", "slide-deck", "post", "automations");
    expect(resolved.automateView).toBe("automations");
  });

  it("registers exactly the three automateView members", () => {
    expect([...AUTOMATE_VIEWS]).toEqual(["templates", "workflows", "automations"]);
    expect(isAutomateView("workflows")).toBe(true);
    expect(isAutomateView("drafts")).toBe(false);
  });
});

// The Presentations sub-tab (PRES-1 wave 3, AC-2 /
// docs/pres-1-architecture.md section "the extensible-child decision"): unlike
// version-control/recording/artifact-design (each a single
// destination with getInnerDestinations returning null), presentations is
// wired as an INNER-NAV view with a "Presentations" destinations group so a
// child-tab strip renders under the "Presentations" chip and a second child
// can be added later as one more array entry, with no restructuring. Before
// this fix, presentations was a standalone name:null single-destination group
// holding "slide-deck-creation" and getInnerDestinations("presentations")
// returned null - this block would have failed RED against that shape
// (getInnerDestinations returned null, not a list containing "Slide Deck
// Creation").
describe("presentations subtab", () => {
  it("is reachable from its destination id and reports itself as active", () => {
    const resolved = resolveStateFromDestinationId("presentations-slide-deck", "content", "new", "modules", "run");
    expect(resolved.manualView).toBe("presentations");
    expect(getActiveDestinationId("presentations", "new", "modules", "run")).toBe("presentations-slide-deck");
  });

  it("has a rail destination with a label and description", () => {
    const dest = getDestinationById("presentations-slide-deck");
    expect(dest).toBeDefined();
    expect(dest!.label).toBe("Slide Deck Creation");
    expect(dest!.description).toBeTruthy();
  });

  it("has a non-null inner-nav destinations list containing Slide Deck Creation and, since PRES-2 S6.7, Slide Deck Pipeline (AC-2 / RES-S6-A)", () => {
    const inner = getInnerDestinations("presentations");
    expect(inner).not.toBeNull();
    expect(inner?.map((d) => d.id)).toEqual(["presentations-slide-deck", "presentations-pipeline", "presentations-ppt-design"]);
    expect(inner?.map((d) => d.label)).toEqual(["Slide Deck Creation", "Slide Deck Pipeline", "PowerPoint Design"]);
  });

  it("PRES-2 S6.7: the pipeline child is reachable from its destination id and reports itself as active via presentationsView", () => {
    const resolved = resolveStateFromDestinationId(
      "presentations-pipeline",
      "content",
      "new",
      "modules",
      "run",
      "slide-deck"
    );
    expect(resolved.manualView).toBe("presentations");
    expect(resolved.presentationsView).toBe("pipeline");
    expect(getActiveDestinationId("presentations", "new", "modules", "run", "pipeline")).toBe(
      "presentations-pipeline"
    );
    // The shipped thin child stays the default when presentationsView is
    // omitted/at its default - RES-S6-A kept it, not renamed/replaced it.
    expect(getActiveDestinationId("presentations", "new", "modules", "run")).toBe("presentations-slide-deck");
  });

  it("is in MANUAL_VIEW_ORDER with a matching label", () => {
    expect(MANUAL_VIEW_ORDER).toContain("presentations");
    expect(MANUAL_VIEW_LABELS["presentations"]).toBe("Presentations");
  });

  it("is accepted by isManualViewType", () => {
    expect(isManualViewType("presentations")).toBe(true);
  });
});

// The Grading sub-tab (GRAD-SUBTAB wave 1,
// docs/tools-grading-subtab-architecture.md): a container with its own inner
// navigation, absorbing the old LMS Grading destination and the standalone
// Repo Grades subtab (docs/repo-grades-view-acceptance-criteria.md) into one
// Manual-family chip.
describe("grading subtab", () => {
  it("is reachable from its destination id and reports itself as active", () => {
    const resolved = resolveStateFromDestinationId("grading-run", "content", "new", "modules", "run");
    expect(resolved.manualView).toBe("grading");
    expect(getActiveDestinationId("grading", "new", "modules", "run")).toBe("grading-run");
  });

  it("has a rail destination with a label and description", () => {
    const dest = getDestinationById("grading-run");
    expect(dest).toBeDefined();
    expect(dest!.label).toBe("Submissions");
    expect(dest!.description).toBeTruthy();
  });

  it("has six inner destinations: Submissions, Repo Grades, From a recording, From screenshots, Drafted Grades, and Chat (GRAD-SUBTAB waves 2-3, GRADING-CHAT wave 1)", () => {
    expect(getInnerDestinations("grading")?.map((d) => d.id)).toEqual([
      "grading-run",
      "grading-repos",
      "grading-recording",
      "grading-snapshots",
      "grading-drafts",
      "grading-chat",
    ]);
    expect(getInnerDestinations("grading")?.map((d) => d.label)).toEqual([
      "Submissions",
      "Repo Grades",
      "From a recording",
      "From screenshots",
      "Drafted Grades",
      "Chat",
    ]);
  });

  it("is in MANUAL_VIEW_ORDER with a matching label", () => {
    expect(MANUAL_VIEW_ORDER).toContain("grading");
    expect(MANUAL_VIEW_LABELS["grading"]).toBe("Grading");
  });

  it("is accepted by isManualViewType", () => {
    expect(isManualViewType("grading")).toBe(true);
  });
});

// AC7/M10 (docs/tools-grading-subtab-architecture.md section 5.5): every
// pointer at a grading surface this consolidation retired must redirect to
// the new container rather than silently bouncing. Modeled directly on the
// course-intel/live-class removal blocks below - this project has removed a
// subtab before, and that shape is what caught the leftovers last time.
describe("retired grading pointers (AC7/M10)", () => {
  it("is gone from the rail destinations under its old ids", () => {
    expect(getDestinationById("lms-grading")).toBeUndefined();
    expect(getDestinationById("repo-grades")).toBeUndefined();
    const allDests = destinations.flatMap((g) => g.destinations).map((d) => d.id);
    expect(allDests).not.toContain("lms-grading");
    expect(allDests).not.toContain("repo-grades");
  });

  it("is gone from LMS_VIEWS, MANUAL_VIEW_ORDER and MANUAL_VIEW_LABELS", () => {
    expect(LMS_VIEWS).not.toContain("grading");
    expect(MANUAL_VIEW_ORDER).not.toContain("repo-grades");
    expect(Object.keys(MANUAL_VIEW_LABELS)).not.toContain("repo-grades");
  });

  it("is rejected by isManualViewType, so a persisted 'repo-grades' manualView cannot restore into it directly", () => {
    expect(isManualViewType("repo-grades")).toBe(false);
  });

  it("a persisted/legacy 'lms-grading' destination id resolves to the Grading sub-tab's Submissions surface, not a dead view", () => {
    const state = resolveStateFromDestinationId("lms-grading", "recording", "new", "modules", "repos");
    expect(state.manualView).toBe("grading");
    expect(state.gradingView).toBe("run");
  });

  it("a persisted/legacy 'repo-grades' destination id resolves to the Grading sub-tab's Repo Grades surface, not a dead view", () => {
    const state = resolveStateFromDestinationId("repo-grades", "recording", "new", "modules", "run");
    expect(state.manualView).toBe("grading");
    expect(state.gradingView).toBe("repos");
  });
});

// Course Intel MOVED OUT of this rail and became a top-level tab (D24a of
// docs/course-student-intelligence-acceptance-criteria.md). Registering it
// took six points here; removing it has to be just as complete, and each
// leftover fails differently and silently: a leftover MANUAL_VIEW_ORDER entry
// or destinations entry leaves a dead chip in the rail that resolves to a
// view page.tsx no longer renders (a blank pane); a leftover
// getActiveDestinationId branch highlights a chip that is not there; a
// leftover resolveStateFromDestinationId branch lets a stale persisted
// destination id put manualView into a value nothing can display.
//
// Modeled deliberately on the live-class removal block below - this project
// has removed a subtab before, and that block is the shape that caught the
// leftovers last time. The reachability half (that the new top-level tab
// actually renders) lives in
// src/app/components/tabs/topLevelTabs.wiring.test.ts.
describe("course-intel subtab removal (promoted to a top-level tab)", () => {
  it("is gone from the rail destinations", () => {
    expect(getDestinationById("course-intel")).toBeUndefined();
    const allDests = destinations.flatMap((g) => g.destinations).map((d) => d.id);
    expect(allDests).not.toContain("course-intel");
  });

  it("is gone from MANUAL_VIEW_ORDER and MANUAL_VIEW_LABELS", () => {
    expect(MANUAL_VIEW_ORDER).not.toContain("course-intel");
    expect(Object.keys(MANUAL_VIEW_LABELS)).not.toContain("course-intel");
  });

  it("is rejected by isManualViewType, so a persisted 'course-intel' manualView cannot restore into it", () => {
    expect(isManualViewType("course-intel")).toBe(false);
  });

  it("is gone from getActiveDestinationId's resolvable ids", () => {
    // "course-intel" is no longer a member of ManualViewType, so every
    // remaining subtab must resolve to an id other than "course-intel".
    for (const view of MANUAL_VIEW_ORDER) {
      expect(getActiveDestinationId(view, "new", "modules", "run")).not.toBe("course-intel");
    }
  });

  it("a persisted/legacy 'course-intel' destination id falls back to the current subtab rather than resolving to a dead view", () => {
    const state = resolveStateFromDestinationId("course-intel", "recording", "new", "modules", "run");
    expect(state.manualView).toBe("recording");
    expect(state.manualView).not.toBe("course-intel");
  });
});

// Live Class moved out of the Manual rail and into the app-wide FAB
// (AiChatFab.tsx / LiveClassWindow.tsx) - it must leave no trace behind here.
describe("live-class subtab removal", () => {
  it("is gone from the rail destinations", () => {
    expect(getDestinationById("live-class")).toBeUndefined();
    const allDests = destinations.flatMap((g) => g.destinations).map((d) => d.id);
    expect(allDests).not.toContain("live-class");
  });

  it("is gone from MANUAL_VIEW_ORDER and MANUAL_VIEW_LABELS", () => {
    expect(MANUAL_VIEW_ORDER).not.toContain("live-class");
    expect(Object.keys(MANUAL_VIEW_LABELS)).not.toContain("live-class");
  });

  it("is gone from getActiveDestinationId's resolvable ids", () => {
    // "live-class" is no longer a member of ManualViewType, so every
    // remaining subtab must resolve to an id other than "live-class".
    for (const view of MANUAL_VIEW_ORDER) {
      expect(getActiveDestinationId(view, "new", "modules", "run")).not.toBe("live-class");
    }
  });

  it("a persisted/legacy 'live-class' destination id falls back to the current subtab rather than resolving to a dead view", () => {
    // Mirrors the migration guard in page.tsx's manualView restore: an id
    // resolveStateFromDestinationId no longer recognizes must leave the
    // current view untouched, never resolve to the removed subtab.
    const state = resolveStateFromDestinationId("live-class", "recording", "new", "modules", "run");
    expect(state.manualView).toBe("recording");
    expect(state.manualView).not.toBe("live-class");
  });
});

// isManualViewType is the single source of truth page.tsx's saved-view
// restore guard validates against (MANUAL_VIEW_KEY in localStorage). It must
// be derived FROM MANUAL_VIEW_ORDER, not a hand-restated list of literals -
// that hand-restated list is exactly how "artifact-design" went missing from
// the restore guard after being added to ManualViewType (regression: a user
// working in Artifact Templates who reloaded the page was silently bounced
// to Build Courses even though the value had been saved correctly).
describe("isManualViewType", () => {
  it("accepts every value in the authoritative MANUAL_VIEW_ORDER list", () => {
    // Deliberately loops over MANUAL_VIEW_ORDER instead of listing literals,
    // so a subtab added to that order in the future is covered by this
    // assertion automatically - no new test case required. That property is
    // the actual fix: no second hand-maintained list to fall out of sync.
    for (const view of MANUAL_VIEW_ORDER) {
      expect(isManualViewType(view)).toBe(true);
    }
  });

  it("accepts 'artifact-design' (the regression case)", () => {
    expect(isManualViewType("artifact-design")).toBe(true);
  });

  it("rejects an unknown value, an empty string, null and undefined", () => {
    expect(isManualViewType("not-a-real-subtab")).toBe(false);
    expect(isManualViewType("")).toBe(false);
    expect(isManualViewType(null)).toBe(false);
    expect(isManualViewType(undefined)).toBe(false);
  });

  it("rejects 'live-class' (a legacy persisted value now that the subtab is gone)", () => {
    expect(isManualViewType("live-class")).toBe(false);
  });

  it("preserves the existing legacy-value fallback: a value isManualViewType rejects still resolves safely through resolveStateFromDestinationId rather than onto a dead view", () => {
    expect(isManualViewType("live-class")).toBe(false);
    const state = resolveStateFromDestinationId("live-class", "recording", "new", "modules", "run");
    expect(state.manualView).toBe("recording");
    expect(state.manualView).not.toBe("live-class");
  });
});

// ANNOUNCEMENTS-TAB A-W1: the same derived-guard shape as the LMS_VIEWS and
// GRADING_VIEWS loops above, over the Announcements sub-tab's own inner
// selection - looped over ANNOUNCEMENTS_VIEWS, not two hand-written cases.
describe("resolveStateFromDestinationId / getActiveDestinationId - derived guard over every ANNOUNCEMENTS_VIEWS member", () => {
  it("resolves 'announcements-<view>' to manualView 'announcements' and announcementsView <view>", () => {
    for (const view of ANNOUNCEMENTS_VIEWS) {
      const state = resolveStateFromDestinationId(`announcements-${view}`, "recording", "new", "modules", "run");
      expect(state.manualView).toBe("announcements");
      expect(state.announcementsView).toBe(view);
      expect(isAnnouncementsView(state.announcementsView)).toBe(true);
    }
  });

  it("round-trips every ANNOUNCEMENTS_VIEWS member through getActiveDestinationId back to 'announcements-<view>'", () => {
    for (const view of ANNOUNCEMENTS_VIEWS) {
      expect(getActiveDestinationId("announcements", "new", "modules", "run", "slide-deck", view)).toBe(
        `announcements-${view}`
      );
    }
  });

  it("keeps the current announcementsView when the destination id names a different view", () => {
    expect(resolveStateFromDestinationId("grading-run", "grading", "new", "modules", "run", "slide-deck", "walkthrough").announcementsView).toBe(
      "walkthrough"
    );
  });
});

// PPT-DESIGN-INTO-PRESENTATIONS: PowerPoint Design MOVED (it was not deleted) -
// from a top-level Tools chip to the third Presentations tab. Modelled on the
// course-intel removal block, with the re-parent twist: the legacy id resolves
// to the new place instead of falling back to the current view.
describe("ppt-design re-parented under Presentations", () => {
  it("is a presentationsView member derived from the presence record (I-UNION)", () => {
    expect(PRESENTATIONS_VIEWS).toContain("ppt-design");
    expect(isPresentationsView("ppt-design")).toBe(true);
    expect(isPresentationsView("bogus")).toBe(false);
  });

  it("is gone as a top-level chip (I-RAILGONE)", () => {
    expect(MANUAL_VIEW_ORDER).not.toContain("ppt-design");
    expect(Object.keys(MANUAL_VIEW_LABELS)).not.toContain("ppt-design");
    expect(isManualViewType("ppt-design")).toBe(false);
    expect(getDestinationById("ppt-design")).toBeUndefined();
  });

  it("the new destination is reachable and reports itself as active (I-DESTID)", () => {
    const resolved = resolveStateFromDestinationId("presentations-ppt-design", "content", "new", "modules", "run");
    expect(resolved.manualView).toBe("presentations");
    expect(resolved.presentationsView).toBe("ppt-design");
    expect(getActiveDestinationId("presentations", "new", "modules", "run", "ppt-design")).toBe("presentations-ppt-design");
    expect(getDestinationById("presentations-ppt-design")?.label).toBe("PowerPoint Design");
  });

  it("the legacy 'ppt-design' id resolves to Presentations > PowerPoint Design, not the current view (I-DESTID)", () => {
    const resolved = resolveStateFromDestinationId("ppt-design", "recording", "new", "modules", "run");
    expect(resolved.manualView).toBe("presentations");
    expect(resolved.presentationsView).toBe("ppt-design");
  });
});
