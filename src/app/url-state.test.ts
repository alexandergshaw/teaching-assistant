import { describe, it, expect } from "vitest";
import {
  isActiveTab,
  normalizeActiveTab,
  isWorkflowsView,
  normalizeWorkflowsView,
  normalizeManualView,
  parseUrlState,
  buildUrlSearch,
} from "./url-state";

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

  describe("parseUrlState", () => {
    it("parses a valid tab with no sub-view params", () => {
      expect(parseUrlState("?tab=courses")).toEqual({
        tab: "courses",
        manualView: "course-planning",
        workflowsView: "workflows",
      });
    });

    it("falls back safely for an unknown tab", () => {
      expect(parseUrlState("?tab=bogus")).toEqual({
        tab: "manual",
        manualView: "course-planning",
        workflowsView: "workflows",
      });
    });

    it("falls back safely for a missing tab", () => {
      expect(parseUrlState("")).toEqual({
        tab: "manual",
        manualView: "course-planning",
        workflowsView: "workflows",
      });
      expect(parseUrlState("?foo=bar")).toEqual({
        tab: "manual",
        manualView: "course-planning",
        workflowsView: "workflows",
      });
    });

    it("parses the manual sub-view alongside the manual tab", () => {
      expect(parseUrlState("?tab=manual&manualView=content")).toEqual({
        tab: "manual",
        manualView: "content",
        workflowsView: "workflows",
      });
    });

    it("parses the workflows sub-view alongside the workflows tab", () => {
      expect(parseUrlState("?tab=workflows&workflowsView=drafts")).toEqual({
        tab: "workflows",
        manualView: "course-planning",
        workflowsView: "drafts",
      });
    });

    it("still parses a valid sub-view even when it belongs to the wrong tab", () => {
      // parseUrlState is a per-field parser; it is the caller's job to decide
      // which sub-view field actually applies to the parsed tab. A manualView
      // param alongside tab=courses is still parsed as given here.
      expect(parseUrlState("?tab=courses&manualView=content")).toEqual({
        tab: "courses",
        manualView: "content",
        workflowsView: "workflows",
      });
      expect(parseUrlState("?tab=manual&workflowsView=drafts")).toEqual({
        tab: "manual",
        manualView: "course-planning",
        workflowsView: "drafts",
      });
    });
  });

  describe("buildUrlSearch", () => {
    it("builds a bare tab URL for tabs with no sub-view", () => {
      expect(
        buildUrlSearch({ tab: "courses", manualView: "course-planning", workflowsView: "workflows" })
      ).toBe("?tab=courses");
      expect(
        buildUrlSearch({ tab: "files", manualView: "course-planning", workflowsView: "workflows" })
      ).toBe("?tab=files");
      expect(
        buildUrlSearch({ tab: "knowledge", manualView: "course-planning", workflowsView: "workflows" })
      ).toBe("?tab=knowledge");
    });

    it("includes manualView only when the tab is manual", () => {
      expect(
        buildUrlSearch({ tab: "manual", manualView: "content", workflowsView: "workflows" })
      ).toBe("?tab=manual&manualView=content");
      expect(
        buildUrlSearch({ tab: "manual", manualView: "artifact-design", workflowsView: "drafts" })
      ).toBe("?tab=manual&manualView=artifact-design");
    });

    it("includes workflowsView only when the tab is workflows", () => {
      expect(
        buildUrlSearch({ tab: "workflows", manualView: "course-planning", workflowsView: "automations" })
      ).toBe("?tab=workflows&workflowsView=automations");
    });

    it("drops a sub-view value that belongs to a different tab", () => {
      // A manualView value left over from a previous tab must not leak into
      // a Courses/Files/Knowledge URL, and a workflowsView value must not
      // leak into a Manual URL.
      expect(
        buildUrlSearch({ tab: "courses", manualView: "content", workflowsView: "drafts" })
      ).toBe("?tab=courses");
      expect(
        buildUrlSearch({ tab: "manual", manualView: "content", workflowsView: "drafts" })
      ).toBe("?tab=manual&manualView=content");
    });
  });
});
