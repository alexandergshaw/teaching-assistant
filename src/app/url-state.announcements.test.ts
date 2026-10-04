import { describe, it, expect } from "vitest";
import { buildUrlSearch, normalizeAnnouncementsView, parseUrlState, type UrlNavState } from "./url-state";

// ANNOUNCEMENTS-TAB A-W1: announcementsView round-trips exactly like
// presentationsView (url-state.test.ts) - a non-default value survives through
// Announcements and is dropped elsewhere, and normalizeAnnouncementsView falls
// back to "post". Lives in its own file because url-state.test.ts sits within
// a few lines of the 1000-line ceiling. DEFAULT_STATE is a deliberate
// duplicate: importing across *.test.ts files re-runs the other file's blocks.
const DEFAULT_STATE: UrlNavState = {
  tab: "manual",
  coursesSection: "courses",
  toolsSection: "manual",
  librarySection: "files",
  manualView: "course-planning",
  workflowsView: "workflows",
  buildView: "prebuilt",
  contentView: "modules",
  gradingView: "run",
  presentationsView: "slide-deck",
  announcementsView: "post",
  tasksView: "term",
  kbInstitution: null,
  kbPageId: null,
};

describe("announcementsView (ANNOUNCEMENTS-TAB A-W1)", () => {
  it("normalizes an unknown/missing value to post", () => {
    expect(normalizeAnnouncementsView(null)).toBe("post");
    expect(normalizeAnnouncementsView("bogus")).toBe("post");
    expect(normalizeAnnouncementsView("walkthrough")).toBe("walkthrough");
  });

  it("preserves a non-default announcementsView through Announcements, and drops it elsewhere", () => {
    const state: UrlNavState = { ...DEFAULT_STATE, manualView: "announcements", announcementsView: "walkthrough" };
    expect(buildUrlSearch(state)).toBe("?tab=manual&manualView=announcements&announcementsView=walkthrough");
    const parsed = parseUrlState(buildUrlSearch(state));
    expect(parsed.manualView).toBe("announcements");
    expect(parsed.announcementsView).toBe("walkthrough");
    expect(buildUrlSearch({ ...DEFAULT_STATE, manualView: "content", announcementsView: "walkthrough" })).toBe(
      "?tab=manual&manualView=content"
    );
  });

  it("omits the default announcementsView value", () => {
    expect(buildUrlSearch({ ...DEFAULT_STATE, manualView: "announcements" })).toBe(
      "?tab=manual&manualView=announcements"
    );
  });
});
