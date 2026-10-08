import { describe, it, expect } from "vitest";
import { buildUrlSearch, normalizePresentationsView, parseUrlState, type UrlNavState } from "./url-state";

// PPT-DESIGN-INTO-PRESENTATIONS: PowerPoint Design is the third Presentations
// tab. Lives in its own file because url-state.test.ts sits AT the 1000-line
// ceiling. DEFAULT_STATE is a deliberate duplicate: importing across
// *.test.ts files re-runs the other file's blocks.
const DEFAULT_STATE: UrlNavState = {
  tab: "manual",
  coursesSection: "courses",
  toolsSection: "manual",
  librarySection: "files",
  manualView: "course-planning",
  automateView: "templates",
  buildView: "prebuilt",
  contentView: "modules",
  gradingView: "run",
  presentationsView: "slide-deck",
  announcementsView: "post",
  tasksView: "term",
  kbInstitution: null,
  kbPageId: null,
};

const CANONICAL = "?tab=manual&manualView=presentations&presentationsView=ppt-design";

describe("presentationsView ppt-design (PPT-DESIGN-INTO-PRESENTATIONS)", () => {
  it("accepts ppt-design through the normaliser", () => {
    expect(normalizePresentationsView("ppt-design")).toBe("ppt-design");
    expect(normalizePresentationsView("bogus")).toBe("slide-deck");
  });

  it("round-trips under Presentations and is dropped elsewhere", () => {
    const state: UrlNavState = { ...DEFAULT_STATE, manualView: "presentations", presentationsView: "ppt-design" };
    expect(buildUrlSearch(state)).toBe(CANONICAL);
    const parsed = parseUrlState(CANONICAL);
    expect(parsed.manualView).toBe("presentations");
    expect(parsed.presentationsView).toBe("ppt-design");
    expect(buildUrlSearch({ ...DEFAULT_STATE, manualView: "content", presentationsView: "ppt-design" })).toBe(
      "?tab=manual&manualView=content"
    );
  });
});

describe("legacy ?manualView=ppt-design (I-URL-MIGRATE)", () => {
  it("resolves to presentations + ppt-design and rewrites to the canonical form", () => {
    const parsed = parseUrlState("?tab=manual&manualView=ppt-design");
    expect(parsed.manualView).toBe("presentations");
    expect(parsed.presentationsView).toBe("ppt-design");
    expect(parsed.toolsSection).toBe("manual");
    expect(buildUrlSearch(parsed)).toBe(CANONICAL);
  });

  it("does not leak onto a non-manual tab", () => {
    expect(parseUrlState("?tab=courses&manualView=ppt-design").tab).toBe("courses");
  });
});
