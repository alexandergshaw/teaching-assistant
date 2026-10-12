// Unit tests for tab-link.ts (tabs-ctrl-click scope, AC1/AC2 guard truth table
// and AC4 href round trip). Pure logic, no render.

import { describe, expect, it } from "vitest";
import { buildTabHref, isPlainLeftClick, type ClickLike } from "./tab-link";
import { buildUrlSearch, parseUrlState, type UrlNavState } from "../../url-state";
import { COURSES_SECTION_ORDER, LIBRARY_SECTION_ORDER, TAB_ORDER, TASKS_VIEW_ORDER } from "./tab-sections";
import {
  AUTOMATE_VIEWS,
  ANNOUNCEMENTS_VIEWS,
  GRADING_VIEWS,
  LMS_VIEWS,
  MANUAL_VIEW_ORDER,
  PRESENTATIONS_VIEWS,
} from "../manual/manual-rail";

function click(over: Partial<ClickLike> = {}): ClickLike {
  return {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    ...over,
  };
}

function baseState(): UrlNavState {
  return parseUrlState("?tab=manual");
}

describe("isPlainLeftClick", () => {
  it("is true for an unmodified primary click", () => {
    expect(isPlainLeftClick(click())).toBe(true);
  });

  it("is false for every non-empty combination of the four modifier keys", () => {
    for (let mask = 1; mask < 16; mask++) {
      const e = click({
        metaKey: (mask & 1) !== 0,
        ctrlKey: (mask & 2) !== 0,
        shiftKey: (mask & 4) !== 0,
        altKey: (mask & 8) !== 0,
      });
      expect(isPlainLeftClick(e), `mask ${mask}`).toBe(false);
    }
  });

  it("is false for a middle or right button", () => {
    expect(isPlainLeftClick(click({ button: 1 }))).toBe(false);
    expect(isPlainLeftClick(click({ button: 2 }))).toBe(false);
  });

  it("is false for an event something already handled", () => {
    expect(isPlainLeftClick(click({ defaultPrevented: true }))).toBe(false);
  });
});

describe("buildTabHref (AC4): the patched field survives the round trip", () => {
  it("returns an absolute-path deep link carrying tab=", () => {
    const href = buildTabHref(baseState(), { tab: "files" });
    expect(href.startsWith("/?tab=files")).toBe(true);
  });

  it("does not mutate the nav state it is given", () => {
    const state = baseState();
    const before = JSON.stringify(state);
    buildTabHref(state, { tab: "courses", coursesSection: "oneoff" });
    expect(JSON.stringify(state)).toBe(before);
  });

  function roundTrip(patch: Partial<UrlNavState>, base: UrlNavState = baseState()): UrlNavState {
    const href = buildTabHref(base, patch);
    return parseUrlState(href.slice(1));
  }

  it("tab: every top-level tab", () => {
    for (const tab of TAB_ORDER) expect(roundTrip({ tab }).tab).toBe(tab);
  });

  it("coursesSection: every section", () => {
    for (const coursesSection of COURSES_SECTION_ORDER) {
      expect(roundTrip({ tab: "courses", coursesSection }).coursesSection).toBe(coursesSection);
    }
  });

  it("tasksView: every Tasks view", () => {
    for (const tasksView of TASKS_VIEW_ORDER) {
      const parsed = roundTrip({ tab: "courses", coursesSection: "tasks", tasksView });
      expect(parsed.coursesSection).toBe("tasks");
      expect(parsed.tasksView).toBe(tasksView);
    }
  });

  it("librarySection: every section", () => {
    for (const librarySection of LIBRARY_SECTION_ORDER) {
      expect(roundTrip({ tab: "files", librarySection }).librarySection).toBe(librarySection);
    }
  });

  it("manualView: every Tools view", () => {
    for (const manualView of MANUAL_VIEW_ORDER) {
      const parsed = roundTrip({ tab: "manual", toolsSection: "manual", manualView });
      expect(parsed.manualView).toBe(manualView);
    }
  });

  it("buildView: both Build Courses modes", () => {
    for (const buildView of ["prebuilt", "new"] as const) {
      const parsed = roundTrip({ tab: "manual", manualView: "course-planning", buildView });
      expect(parsed.buildView).toBe(buildView);
    }
  });

  it("contentView: every LMS view", () => {
    for (const contentView of LMS_VIEWS) {
      const parsed = roundTrip({ tab: "manual", manualView: "content", contentView });
      expect(parsed.manualView).toBe("content");
      expect(parsed.contentView).toBe(contentView);
    }
  });

  it("gradingView: every Grading view", () => {
    for (const gradingView of GRADING_VIEWS) {
      const parsed = roundTrip({ tab: "manual", manualView: "grading", gradingView });
      expect(parsed.manualView).toBe("grading");
      expect(parsed.gradingView).toBe(gradingView);
    }
  });

  it("presentationsView: every Presentations view", () => {
    for (const presentationsView of PRESENTATIONS_VIEWS) {
      const parsed = roundTrip({ tab: "manual", manualView: "presentations", presentationsView });
      expect(parsed.manualView).toBe("presentations");
      expect(parsed.presentationsView).toBe(presentationsView);
    }
  });

  it("announcementsView: every Announcements view", () => {
    for (const announcementsView of ANNOUNCEMENTS_VIEWS) {
      const parsed = roundTrip({ tab: "manual", manualView: "announcements", announcementsView });
      expect(parsed.manualView).toBe("announcements");
      expect(parsed.announcementsView).toBe(announcementsView);
    }
  });

  it("automateView: every Automate view", () => {
    for (const automateView of AUTOMATE_VIEWS) {
      const parsed = roundTrip({ tab: "manual", manualView: "artifact-design", automateView });
      expect(parsed.manualView).toBe("artifact-design");
      expect(parsed.automateView).toBe(automateView);
    }
  });

  it("matches buildUrlSearch exactly, prefixed with a slash", () => {
    const state = { ...baseState(), tab: "files" as const, librarySection: "knowledge" as const };
    expect(buildTabHref(baseState(), { tab: "files", librarySection: "knowledge" })).toBe(
      "/" + buildUrlSearch(state)
    );
  });
});
