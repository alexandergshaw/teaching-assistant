import { describe, it, expect } from "vitest";
import {
  isActiveTab,
  normalizeActiveTab,
  isWorkflowsView,
  normalizeWorkflowsView,
  normalizeManualView,
  isBuildView,
  normalizeBuildView,
  isContentView,
  normalizeContentView,
  isDraftsView,
  normalizeDraftsView,
  parseUrlState,
  buildUrlSearch,
  type UrlNavState,
} from "./url-state";

// Baseline "everything at its default" state, spread with overrides below so
// each test only names the fields it cares about.
const DEFAULT_STATE: UrlNavState = {
  tab: "manual",
  manualView: "course-planning",
  workflowsView: "workflows",
  buildView: "prebuilt",
  contentView: "modules",
  draftsView: "grades",
};

describe("url-state", () => {
  describe("normalizeActiveTab", () => {
    it("accepts a valid tab", () => {
      expect(normalizeActiveTab("courses")).toBe("courses");
      expect(normalizeActiveTab("workflows")).toBe("workflows");
      expect(normalizeActiveTab("files")).toBe("files");
      expect(normalizeActiveTab("knowledge")).toBe("knowledge");
      expect(normalizeActiveTab("manual")).toBe("manual");
    });

    it("falls back to manual for an unknown tab", () => {
      expect(normalizeActiveTab("bogus")).toBe("manual");
      expect(normalizeActiveTab("")).toBe("manual");
    });

    it("falls back to manual for a missing tab", () => {
      expect(normalizeActiveTab(null)).toBe("manual");
    });

    it("migrates legacy grade-drafts/drafts values to workflows", () => {
      expect(normalizeActiveTab("grade-drafts")).toBe("workflows");
      expect(normalizeActiveTab("drafts")).toBe("workflows");
    });

    it("migrates the legacy ppt-design value to manual", () => {
      expect(normalizeActiveTab("ppt-design")).toBe("manual");
    });
  });

  describe("isActiveTab", () => {
    it("narrows only known tab strings", () => {
      expect(isActiveTab("courses")).toBe(true);
      expect(isActiveTab("nope")).toBe(false);
      expect(isActiveTab(null)).toBe(false);
      expect(isActiveTab(42)).toBe(false);
    });
  });

  describe("normalizeWorkflowsView / isWorkflowsView", () => {
    it("accepts valid sub-views", () => {
      expect(normalizeWorkflowsView("workflows")).toBe("workflows");
      expect(normalizeWorkflowsView("automations")).toBe("automations");
      expect(normalizeWorkflowsView("drafts")).toBe("drafts");
      expect(isWorkflowsView("automations")).toBe(true);
    });

    it("falls back to workflows for an unknown or missing value", () => {
      expect(normalizeWorkflowsView("bogus")).toBe("workflows");
      expect(normalizeWorkflowsView(null)).toBe("workflows");
      expect(isWorkflowsView("bogus")).toBe(false);
    });
  });

  describe("normalizeManualView", () => {
    it("accepts a valid Manual subtab", () => {
      expect(normalizeManualView("content")).toBe("content");
      expect(normalizeManualView("artifact-design")).toBe("artifact-design");
    });

    it("falls back to course-planning for an unknown or missing value", () => {
      expect(normalizeManualView("bogus")).toBe("course-planning");
      expect(normalizeManualView(null)).toBe("course-planning");
    });
  });

  describe("normalizeBuildView / isBuildView", () => {
    it("accepts valid build views", () => {
      expect(normalizeBuildView("new")).toBe("new");
      expect(normalizeBuildView("prebuilt")).toBe("prebuilt");
      expect(isBuildView("new")).toBe(true);
    });

    it("falls back to prebuilt for an unknown or missing value", () => {
      expect(normalizeBuildView("bogus")).toBe("prebuilt");
      expect(normalizeBuildView(null)).toBe("prebuilt");
      expect(isBuildView("bogus")).toBe(false);
    });
  });

  describe("normalizeContentView / isContentView", () => {
    it("accepts every navigable LMS subview", () => {
      expect(normalizeContentView("modules")).toBe("modules");
      expect(normalizeContentView("pages")).toBe("pages");
      expect(normalizeContentView("files")).toBe("files");
      expect(normalizeContentView("grading")).toBe("grading");
      expect(normalizeContentView("announcements")).toBe("announcements");
      expect(normalizeContentView("inbox")).toBe("inbox");
    });

    it("falls back to modules for an unknown or missing value", () => {
      expect(normalizeContentView("bogus")).toBe("modules");
      expect(normalizeContentView(null)).toBe("modules");
      expect(isContentView("bogus")).toBe(false);
    });

    it("rejects version-control - it is a legacy migration target, not a navigable URL value", () => {
      expect(isContentView("version-control")).toBe(false);
      expect(normalizeContentView("version-control")).toBe("modules");
    });
  });

  describe("normalizeDraftsView / isDraftsView", () => {
    it("accepts valid drafts views", () => {
      expect(normalizeDraftsView("grades")).toBe("grades");
      expect(normalizeDraftsView("messages")).toBe("messages");
      expect(isDraftsView("messages")).toBe(true);
    });

    it("falls back to grades for an unknown or missing value", () => {
      expect(normalizeDraftsView("bogus")).toBe("grades");
      expect(normalizeDraftsView(null)).toBe("grades");
      expect(isDraftsView("bogus")).toBe(false);
    });
  });

  describe("parseUrlState", () => {
    it("parses a valid tab with no sub-view params", () => {
      expect(parseUrlState("?tab=courses")).toEqual({
        ...DEFAULT_STATE,
        tab: "courses",
      });
    });

    it("falls back safely for an unknown tab", () => {
      expect(parseUrlState("?tab=bogus")).toEqual(DEFAULT_STATE);
    });

    it("falls back safely for a missing tab", () => {
      expect(parseUrlState("")).toEqual(DEFAULT_STATE);
      expect(parseUrlState("?foo=bar")).toEqual(DEFAULT_STATE);
    });

    it("parses the manual sub-view alongside the manual tab", () => {
      expect(parseUrlState("?tab=manual&manualView=content")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        manualView: "content",
      });
    });

    it("parses the workflows sub-view alongside the workflows tab", () => {
      expect(parseUrlState("?tab=workflows&workflowsView=drafts")).toEqual({
        ...DEFAULT_STATE,
        tab: "workflows",
        workflowsView: "drafts",
      });
    });

    it("parses buildView nested under manual + course-planning", () => {
      expect(parseUrlState("?tab=manual&buildView=new")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        buildView: "new",
      });
    });

    it("parses contentView nested under manual + content", () => {
      expect(parseUrlState("?tab=manual&manualView=content&contentView=grading")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        manualView: "content",
        contentView: "grading",
      });
    });

    it("parses draftsView nested under workflows + drafts", () => {
      expect(parseUrlState("?tab=workflows&workflowsView=drafts&draftsView=messages")).toEqual({
        ...DEFAULT_STATE,
        tab: "workflows",
        workflowsView: "drafts",
        draftsView: "messages",
      });
    });

    it("falls back safely for unknown buildView/contentView/draftsView values", () => {
      expect(
        parseUrlState("?tab=manual&manualView=content&buildView=bogus&contentView=bogus&draftsView=bogus")
      ).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        manualView: "content",
      });
    });

    it("still parses a valid sub-view even when it belongs to the wrong tab/parent", () => {
      // parseUrlState is a per-field parser; it is the caller's job to decide
      // which sub-view field actually applies to the parsed tab/parent. A
      // manualView param alongside tab=courses, or a buildView/contentView/
      // draftsView param whose parent doesn't match, is still parsed as
      // given here - not collapsed to a default.
      expect(parseUrlState("?tab=courses&manualView=content")).toEqual({
        ...DEFAULT_STATE,
        tab: "courses",
        manualView: "content",
      });
      expect(parseUrlState("?tab=manual&workflowsView=drafts")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        workflowsView: "drafts",
      });
      // buildView present but manualView is "content", not "course-planning".
      expect(parseUrlState("?tab=manual&manualView=content&buildView=new")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        manualView: "content",
        buildView: "new",
      });
      // contentView present but manualView is "course-planning", not "content".
      expect(parseUrlState("?tab=manual&contentView=grading")).toEqual({
        ...DEFAULT_STATE,
        tab: "manual",
        contentView: "grading",
      });
      // draftsView present but workflowsView is "automations", not "drafts".
      expect(parseUrlState("?tab=workflows&workflowsView=automations&draftsView=messages")).toEqual({
        ...DEFAULT_STATE,
        tab: "workflows",
        workflowsView: "automations",
        draftsView: "messages",
      });
    });
  });

  describe("buildUrlSearch", () => {
    it("builds a bare tab URL for tabs with no sub-view", () => {
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "courses" })).toBe("?tab=courses");
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "files" })).toBe("?tab=files");
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "knowledge" })).toBe("?tab=knowledge");
    });

    it("omits every sub-view param when the whole branch is at its default", () => {
      // tab=manual with manualView/buildView/contentView all at their
      // defaults should carry no extra params - the common case (AC4).
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "manual" })).toBe("?tab=manual");
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "workflows" })).toBe("?tab=workflows");
    });

    it("includes manualView only when the tab is manual, and only when non-default", () => {
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "content" })).toBe(
        "?tab=manual&manualView=content"
      );
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "artifact-design", workflowsView: "drafts" })
      ).toBe("?tab=manual&manualView=artifact-design");
    });

    it("includes workflowsView only when the tab is workflows, and only when non-default", () => {
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "workflows", workflowsView: "automations" })).toBe(
        "?tab=workflows&workflowsView=automations"
      );
    });

    it("drops a sub-view value that belongs to a different tab", () => {
      // A manualView value left over from a previous tab must not leak into
      // a Courses/Files/Knowledge URL, and a workflowsView value must not
      // leak into a Manual URL.
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "courses", manualView: "content", workflowsView: "drafts" })
      ).toBe("?tab=courses");
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "content", workflowsView: "drafts" })).toBe(
        "?tab=manual&manualView=content"
      );
    });

    it("includes buildView only when manual + course-planning, and only when non-default", () => {
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", buildView: "new" })).toBe(
        "?tab=manual&buildView=new"
      );
      // manualView stays omitted (it's at its default) even though buildView
      // is present - the default-fallback on parse reconstructs
      // "course-planning" regardless.
      expect(buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "course-planning", buildView: "prebuilt" })).toBe(
        "?tab=manual"
      );
    });

    it("drops buildView when manualView is not course-planning", () => {
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "content", buildView: "new" })
      ).toBe("?tab=manual&manualView=content");
    });

    it("includes contentView only when manual + content, and only when non-default", () => {
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "content", contentView: "grading" })
      ).toBe("?tab=manual&manualView=content&contentView=grading");
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "content", contentView: "modules" })
      ).toBe("?tab=manual&manualView=content");
    });

    it("drops contentView when manualView is not content", () => {
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "manual", manualView: "course-planning", contentView: "grading" })
      ).toBe("?tab=manual");
    });

    it("includes draftsView only when workflows + drafts, and only when non-default", () => {
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "workflows", workflowsView: "drafts", draftsView: "messages" })
      ).toBe("?tab=workflows&workflowsView=drafts&draftsView=messages");
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "workflows", workflowsView: "drafts", draftsView: "grades" })
      ).toBe("?tab=workflows&workflowsView=drafts");
    });

    it("drops draftsView when workflowsView is not drafts", () => {
      expect(
        buildUrlSearch({ ...DEFAULT_STATE, tab: "workflows", workflowsView: "automations", draftsView: "messages" })
      ).toBe("?tab=workflows&workflowsView=automations");
    });

    it("builds a representative deep combination for each branch", () => {
      expect(
        buildUrlSearch({
          ...DEFAULT_STATE,
          tab: "manual",
          manualView: "content",
          contentView: "grading",
        })
      ).toBe("?tab=manual&manualView=content&contentView=grading");

      expect(
        buildUrlSearch({
          ...DEFAULT_STATE,
          tab: "workflows",
          workflowsView: "drafts",
          draftsView: "messages",
        })
      ).toBe("?tab=workflows&workflowsView=drafts&draftsView=messages");

      expect(
        buildUrlSearch({
          ...DEFAULT_STATE,
          tab: "manual",
          manualView: "course-planning",
          buildView: "new",
        })
      ).toBe("?tab=manual&buildView=new");
    });
  });
});
