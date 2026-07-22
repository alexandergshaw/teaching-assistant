import { describe, it, expect } from "vitest";
import {
  getDestinationById,
  getActiveDestinationId,
  resolveStateFromDestinationId,
  validateLmsViewsCompleteness,
  destinations,
  LMS_VIEWS,
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
});
