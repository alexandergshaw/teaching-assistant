// vitest is node-env and collects only src/**/*.test.ts, so no component is
// ever rendered here - this test proves the pure wording/classification
// logic in course-picker-availability.ts and nothing about markup or
// keyboard behaviour. Mirrors
// src/app/components/content-tab/contentSourceGating.test.ts's own header
// and shape.

import { describe, expect, it } from "vitest";
import {
  describeExportFallbackAfterLiveFailure,
  describeExportSectionState,
  describeLiveSelectionNeedsInstitution,
  describeNoInstitutionSelected,
} from "./course-picker-availability";
import type { Course, CourseMaterialFile } from "./supabase/courses";

function file(overrides: Partial<CourseMaterialFile> = {}): CourseMaterialFile {
  return {
    name: "export.imscc",
    path: "course-1/export.imscc",
    size: 1024,
    addedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "Intro to Testing",
    courseCode: null,
    term: null,
    canvasUrl: "",
    repos: [],
    githubOrg: null,
    textbook: null,
    syllabusId: null,
    institution: "",
    integrations: [],
    roster: null,
    notes: null,
    topics: null,
    csvName: null,
    csvData: null,
    rubricName: null,
    rubricData: null,
    startDate: null,
    description: null,
    weeks: null,
    tests: null,
    lms: null,
    dayTime: null,
    modality: null,
    topicOutline: null,
    syllabusTemplateId: null,
    exportFiles: [],
    ...overrides,
  } as unknown as Course;
}

describe("describeNoInstitutionSelected", () => {
  it("names the missing precondition (an institution) and where to fix it (Settings)", () => {
    const message = describeNoInstitutionSelected();
    expect(message.toLowerCase()).toContain("settings");
    expect(message.toLowerCase()).toMatch(/school|institution/);
  });

  it("is non-empty and stable across calls (pure)", () => {
    expect(describeNoInstitutionSelected()).toBe(describeNoInstitutionSelected());
    expect(describeNoInstitutionSelected().length).toBeGreaterThan(0);
  });
});

describe("describeLiveSelectionNeedsInstitution", () => {
  it("names the missing precondition (a school/institution) and where to fix it (Settings)", () => {
    const message = describeLiveSelectionNeedsInstitution();
    expect(message.toLowerCase()).toContain("settings");
    expect(message.toLowerCase()).toMatch(/school|institution/);
  });

  it("names live Canvas as the reason, and that an export-sourced course does not share it", () => {
    const message = describeLiveSelectionNeedsInstitution();
    expect(message.toLowerCase()).toContain("canvas");
    expect(message.toLowerCase()).toMatch(/export/);
  });

  it("is non-empty and stable across calls (pure)", () => {
    expect(describeLiveSelectionNeedsInstitution()).toBe(describeLiveSelectionNeedsInstitution());
    expect(describeLiveSelectionNeedsInstitution().length).toBeGreaterThan(0);
  });

  it("is a distinct string from describeNoInstitutionSelected - they explain different states", () => {
    expect(describeLiveSelectionNeedsInstitution()).not.toBe(describeNoInstitutionSelected());
  });
});

describe("describeExportFallbackAfterLiveFailure", () => {
  it("carries the underlying live error verbatim, not summarized or dropped", () => {
    const message = describeExportFallbackAfterLiveFailure(
      "Canvas base URL is not configured for WNCC. Set WNCC_CANVAS_URL in the environment."
    );
    expect(message).toContain("Canvas base URL is not configured for WNCC. Set WNCC_CANVAS_URL in the environment.");
  });

  it("names both that the export was used and that live Canvas was the reason", () => {
    const message = describeExportFallbackAfterLiveFailure("boom").toLowerCase();
    expect(message).toMatch(/export/);
    expect(message).toMatch(/canvas/);
  });

  it("is distinct from every other message in this module", () => {
    const message = describeExportFallbackAfterLiveFailure("boom");
    expect(message).not.toBe(describeNoInstitutionSelected());
    expect(message).not.toBe(describeLiveSelectionNeedsInstitution());
  });

  it("reflects a change in the underlying error (not a stable/cached string)", () => {
    expect(describeExportFallbackAfterLiveFailure("error A")).not.toBe(
      describeExportFallbackAfterLiveFailure("error B")
    );
  });
});

describe("describeExportSectionState", () => {
  it("reports loading distinctly", () => {
    const result = describeExportSectionState("loading", []);
    expect(result.kind).toBe("loading");
  });

  it("reports error distinctly, with a message", () => {
    const result = describeExportSectionState("error", []);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("no courses at all -> empty-no-exports", () => {
    const result = describeExportSectionState("idle", []);
    expect(result.kind).toBe("empty-no-exports");
  });

  it("courses exist but none has any export file -> empty-no-exports", () => {
    const result = describeExportSectionState("idle", [
      course({ exportFiles: [] }),
      course({ id: "course-2", exportFiles: [] }),
    ]);
    expect(result.kind).toBe("empty-no-exports");
  });

  it("every course's exports are all app-generated -> empty-only-generated", () => {
    const result = describeExportSectionState("idle", [
      course({ exportFiles: [file({ generated: true })] }),
    ]);
    expect(result.kind).toBe("empty-only-generated");
  });

  it("a mix of generated and source exports across courses -> ready with only the qualifying course", () => {
    const generatedOnly = course({ id: "generated-only", exportFiles: [file({ generated: true })] });
    const sourced = course({
      id: "sourced",
      name: "Sourced Course",
      exportFiles: [file({ generated: false })],
    });
    const result = describeExportSectionState("idle", [generatedOnly, sourced]);
    expect(result.kind).toBe("ready");
    if (result.kind === "ready") {
      expect(result.courses.map((c) => c.id)).toEqual(["sourced"]);
    }
  });

  it("a single qualifying course -> ready, carrying its id and name", () => {
    const result = describeExportSectionState("idle", [
      course({ id: "abc", name: "Only Course", exportFiles: [file({ generated: false })] }),
    ]);
    expect(result.kind).toBe("ready");
    if (result.kind === "ready") {
      expect(result.courses).toEqual([{ id: "abc", name: "Only Course" }]);
    }
  });

  it("multiple qualifying courses are sorted by name", () => {
    const result = describeExportSectionState("idle", [
      course({ id: "b", name: "Zebra", exportFiles: [file({ generated: false })] }),
      course({ id: "a", name: "Alpha", exportFiles: [file({ generated: false })] }),
    ]);
    expect(result.kind).toBe("ready");
    if (result.kind === "ready") {
      expect(result.courses.map((c) => c.name)).toEqual(["Alpha", "Zebra"]);
    }
  });

  it("the only-generated message mentions generated cartridges, and never the no-exports wording", () => {
    const result = describeExportSectionState("idle", [
      course({ exportFiles: [file({ generated: true })] }),
    ]);
    expect(result.kind).toBe("empty-only-generated");
    if (result.kind === "empty-only-generated") {
      expect(result.message.toLowerCase()).toMatch(/generat/);
    }
  });

  it("a mix of one only-generated course and several no-export courses -> empty-only-generated with a claim that stays true for the mix", () => {
    const onlyGeneratedCourse = course({ id: "generated-only", exportFiles: [file({ generated: true })] });
    const noExportCourses = [
      course({ id: "no-export-1", exportFiles: [] }),
      course({ id: "no-export-2", exportFiles: [] }),
      course({ id: "no-export-3", exportFiles: [] }),
    ];
    const result = describeExportSectionState("idle", [onlyGeneratedCourse, ...noExportCourses]);
    expect(result.kind).toBe("empty-only-generated");
    if (result.kind === "empty-only-generated") {
      // Must not claim EVERY attached export (or every course) is
      // generated-only - most of these courses have no export at all. The
      // wording is scoped to "at least one course", which stays true here.
      expect(result.message).not.toMatch(/^The exports attached here/);
      expect(result.message.toLowerCase()).toMatch(/at least one/);
    }
  });

  it("the no-exports message names where to attach one (Courses tab, LMS Exports, Manage, Upload export)", () => {
    const result = describeExportSectionState("idle", []);
    expect(result.kind).toBe("empty-no-exports");
    if (result.kind === "empty-no-exports") {
      expect(result.message).toMatch(/Courses/);
      expect(result.message).toMatch(/LMS Exports/);
      expect(result.message).toMatch(/Manage/);
      expect(result.message).toMatch(/Upload export/);
    }
  });

  it("the only-generated and no-exports wordings are distinct - never one blanket empty message", () => {
    const noExports = describeExportSectionState("idle", []);
    const onlyGenerated = describeExportSectionState("idle", [
      course({ exportFiles: [file({ generated: true })] }),
    ]);
    expect(noExports.kind).not.toBe(onlyGenerated.kind);
    const noExportsMsg = noExports.kind === "empty-no-exports" ? noExports.message : "";
    const onlyGeneratedMsg = onlyGenerated.kind === "empty-only-generated" ? onlyGenerated.message : "";
    expect(noExportsMsg).not.toBe(onlyGeneratedMsg);
    expect(onlyGeneratedMsg.toLowerCase()).not.toMatch(/no course has a saved export/i);
  });

  it("the error and empty wordings stay distinct", () => {
    const error = describeExportSectionState("error", []);
    const empty = describeExportSectionState("idle", []);
    expect(error.kind).not.toBe(empty.kind);
    const errorMsg = error.kind === "error" ? error.message : "";
    const emptyMsg = empty.kind === "empty-no-exports" ? empty.message : "";
    expect(errorMsg).not.toBe(emptyMsg);
  });
});
