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
  getInnerDestinations,
  isManualViewType,
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
      expect(getDestinationById("lms-pages")).toBeDefined();
      expect(getDestinationById("lms-files")).toBeDefined();
      expect(getDestinationById("lms-grading")).toBeDefined();
      expect(getDestinationById("lms-announcements")).toBeDefined();
      expect(getDestinationById("lms-inbox")).toBeDefined();
    });
  });

  describe("getActiveDestinationId", () => {
    it("should return build-new when manualView is course-planning and buildView is new", () => {
      const id = getActiveDestinationId("course-planning", "new", "modules");
      expect(id).toBe("build-new");
    });

    it("should return build-prebuilt when manualView is course-planning and buildView is prebuilt", () => {
      const id = getActiveDestinationId("course-planning", "prebuilt", "modules");
      expect(id).toBe("build-prebuilt");
    });

    it("should return lms-{view} when manualView is content", () => {
      expect(getActiveDestinationId("content", "new", "modules")).toBe("lms-modules");
      expect(getActiveDestinationId("content", "new", "pages")).toBe("lms-pages");
      expect(getActiveDestinationId("content", "new", "grading")).toBe("lms-grading");
    });

    it("should return version-control when manualView is version-control", () => {
      const id = getActiveDestinationId("version-control", "new", "modules");
      expect(id).toBe("version-control");
    });

    it("should return recording when manualView is recording", () => {
      const id = getActiveDestinationId("recording", "new", "modules");
      expect(id).toBe("recording");
    });

    it("should return ppt-design when manualView is ppt-design", () => {
      const id = getActiveDestinationId("ppt-design", "new", "modules");
      expect(id).toBe("ppt-design");
    });
  });

  describe("resolveStateFromDestinationId", () => {
    it("should resolve build-new to course-planning + new", () => {
      const state = resolveStateFromDestinationId("build-new", "content", "prebuilt", "modules");
      expect(state.manualView).toBe("course-planning");
      expect(state.buildView).toBe("new");
    });

    it("should resolve build-prebuilt to course-planning + prebuilt", () => {
      const state = resolveStateFromDestinationId("build-prebuilt", "content", "new", "modules");
      expect(state.manualView).toBe("course-planning");
      expect(state.buildView).toBe("prebuilt");
    });

    it("should resolve lms-{view} to content + view", () => {
      const state = resolveStateFromDestinationId("lms-pages", "recording", "new", "modules");
      expect(state.manualView).toBe("content");
      expect(state.contentView).toBe("pages");
    });

    it("should resolve version-control to version-control", () => {
      const state = resolveStateFromDestinationId("version-control", "content", "new", "modules");
      expect(state.manualView).toBe("version-control");
    });

    it("should preserve current state for non-matching ids", () => {
      const state = resolveStateFromDestinationId("invalid", "recording", "new", "modules");
      expect(state.manualView).toBe("recording");
      expect(state.buildView).toBe("new");
      expect(state.contentView).toBe("modules");
    });

    it("should resolve lms-grading correctly", () => {
      const state = resolveStateFromDestinationId("lms-grading", "course-planning", "new", "modules");
      expect(state.manualView).toBe("content");
      expect(state.contentView).toBe("grading");
    });

    it("should resolve lms-announcements correctly", () => {
      const state = resolveStateFromDestinationId("lms-announcements", "course-planning", "new", "modules");
      expect(state.manualView).toBe("content");
      expect(state.contentView).toBe("announcements");
    });

    it("should resolve lms-inbox correctly", () => {
      const state = resolveStateFromDestinationId("lms-inbox", "course-planning", "new", "modules");
      expect(state.manualView).toBe("content");
      expect(state.contentView).toBe("inbox");
    });
  });

  describe("validateLmsViewsCompleteness", () => {
    it("should have no errors for a complete rail", () => {
      const errors = validateLmsViewsCompleteness();
      expect(errors).toHaveLength(0);
    });

    it("should list all LMS views", () => {
      expect(LMS_VIEWS).toEqual(["modules", "pages", "files", "grading", "announcements", "inbox"]);
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
      expect(allDests).toContain("ppt-design");
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

  describe("MANUAL_VIEW_ORDER / MANUAL_VIEW_LABELS (row 1)", () => {
    it("should list the six subtabs in display order", () => {
      expect(MANUAL_VIEW_ORDER).toEqual([
        "course-planning",
        "content",
        "version-control",
        "recording",
        "ppt-design",
        "artifact-design",
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
  });

  describe("getInnerDestinations (row 2)", () => {
    it("should return the Build destinations for course-planning", () => {
      const inner = getInnerDestinations("course-planning");
      expect(inner?.map((d) => d.id)).toEqual(["build-new", "build-prebuilt"]);
    });

    it("should return the LMS destinations for content", () => {
      const inner = getInnerDestinations("content");
      expect(inner?.map((d) => d.id)).toEqual([
        "lms-modules",
        "lms-pages",
        "lms-files",
        "lms-grading",
        "lms-announcements",
        "lms-inbox",
      ]);
    });

    it("should return null for single-view subtabs", () => {
      expect(getInnerDestinations("version-control")).toBeNull();
      expect(getInnerDestinations("recording")).toBeNull();
      expect(getInnerDestinations("ppt-design")).toBeNull();
    });
  });
});

describe("artifact-design subtab", () => {
  it("is reachable from its destination id and reports itself as active", () => {
    const resolved = resolveStateFromDestinationId("artifact-design", "content", "new", "modules");
    expect(resolved.manualView).toBe("artifact-design");
    expect(getActiveDestinationId("artifact-design", "new", "modules")).toBe("artifact-design");
  });

  it("has a rail destination with a label and description", () => {
    const dest = getDestinationById("artifact-design");
    expect(dest).toBeDefined();
    expect(dest!.label).toBe("Artifact Templates");
    expect(dest!.description).toBeTruthy();
  });

  it("has no inner destinations (it is a single-destination subtab)", () => {
    expect(getInnerDestinations("artifact-design")).toBeNull();
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
      expect(getActiveDestinationId(view, "new", "modules")).not.toBe("live-class");
    }
  });

  it("a persisted/legacy 'live-class' destination id falls back to the current subtab rather than resolving to a dead view", () => {
    // Mirrors the migration guard in page.tsx's manualView restore: an id
    // resolveStateFromDestinationId no longer recognizes must leave the
    // current view untouched, never resolve to the removed subtab.
    const state = resolveStateFromDestinationId("live-class", "recording", "new", "modules");
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
    const state = resolveStateFromDestinationId("live-class", "recording", "new", "modules");
    expect(state.manualView).toBe("recording");
    expect(state.manualView).not.toBe("live-class");
  });
});
