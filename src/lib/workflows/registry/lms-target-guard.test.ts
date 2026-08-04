import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
}));

import { listCourseHubAction } from "@/app/actions";
import {
  resolveLmsFromTile,
  resolveTileLms,
  isCanvasLms,
  lmsDisplayLabel,
  canvasOnlySkipText,
  HUB_COURSE_LMS_INPUT,
} from "./lms-target-guard";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import { emptyCourseProject } from "@/lib/course-project";

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "CS 101",
    courseCode: null,
    term: null,
    canvasUrl: null,
    repos: [],
    githubOrg: null,
    textbook: null,
    syllabusId: null,
    institution: null,
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
    endDate: null,
    breaks: null,
    assignmentDueRule: null,
    email: null,
    emailClient: null,
    classLengthMinutes: null,
    courseProject: emptyCourseProject(),
    materialsFiles: [],
    castletopFiles: [],
    miscFiles: [],
    exportFiles: [],
    materialsZipName: null,
    materialsZipPath: null,
    materialsZipSize: null,
    customTiles: [],
    hiddenTiles: [],
    studentRepos: [],
    updatedAt: "2024-09-01T00:00:00Z",
    ...overrides,
  };
}

function testHelpers(overrides: Partial<StepRunHelpers> = {}): StepRunHelpers {
  return {
    activeInstitution: null,
    provider: "gemini",
    author: "Test Author",
    saveBundle: null,
    saveCourseMaterialFile: null,
    saveCourseCastletopFile: null,
    saveCourseExportFile: null,
    loadCommonResources: null,
    getLibraryFile: null,
    getInstitutionFields: null,
    loadCourseExport: null,
    loadCourseMaterials: null,
    ...overrides,
  };
}

describe("isCanvasLms", () => {
  it("treats an unset LMS as Canvas-compatible", () => {
    expect(isCanvasLms("")).toBe(true);
  });

  it("treats explicit canvas as Canvas-compatible", () => {
    expect(isCanvasLms("canvas")).toBe(true);
    expect(isCanvasLms("Canvas")).toBe(true);
    expect(isCanvasLms("  CANVAS  ")).toBe(true);
  });

  it("rejects blackboard and brightspace", () => {
    expect(isCanvasLms("blackboard")).toBe(false);
    expect(isCanvasLms("brightspace")).toBe(false);
    expect(isCanvasLms("moodle")).toBe(false);
  });
});

describe("lmsDisplayLabel / canvasOnlySkipText", () => {
  it("labels a known LMS from course-lms-options.ts", () => {
    expect(lmsDisplayLabel("blackboard")).toBe("Blackboard");
    expect(lmsDisplayLabel("brightspace")).toBe("Brightspace");
  });

  it("falls back to the raw value for an unknown LMS", () => {
    expect(lmsDisplayLabel("moodle")).toBe("moodle");
  });

  it("builds an explanatory, non-vague skip summary", () => {
    expect(canvasOnlySkipText("blackboard")).toBe(
      "Skipped - this course is on Blackboard; this step targets Canvas."
    );
  });
});

describe("resolveLmsFromTile", () => {
  it("reads the tile's own lms field", async () => {
    const tile = baseCourse({ lms: "blackboard" });
    const lms = await resolveLmsFromTile(tile, testHelpers());
    expect(lms).toBe("blackboard");
  });

  it("normalizes case/whitespace", async () => {
    const tile = baseCourse({ lms: "  Blackboard  " });
    const lms = await resolveLmsFromTile(tile, testHelpers());
    expect(lms).toBe("blackboard");
  });

  it("falls back to the institution's LMS field when the tile has none of its own", async () => {
    const tile = baseCourse({ lms: null, institution: "MCC" });
    const getInstitutionFields = vi.fn().mockResolvedValue([
      { id: "lmsUrl", label: "LMS", type: "lms", value: "", lms: "blackboard" },
    ]);
    const lms = await resolveLmsFromTile(tile, testHelpers({ getInstitutionFields }));
    expect(lms).toBe("blackboard");
    expect(getInstitutionFields).toHaveBeenCalledWith("MCC");
  });

  it("returns empty when neither the tile nor the institution has an LMS set", async () => {
    const tile = baseCourse({ lms: null, institution: null });
    const lms = await resolveLmsFromTile(tile, testHelpers());
    expect(lms).toBe("");
  });

  it("returns empty for an undefined tile", async () => {
    const lms = await resolveLmsFromTile(undefined, testHelpers());
    expect(lms).toBe("");
  });
});

describe("resolveTileLms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty without calling listCourseHubAction when no hubCourseId is given", async () => {
    const lms = await resolveTileLms("", testHelpers());
    expect(lms).toBe("");
    expect(listCourseHubAction).not.toHaveBeenCalled();
  });

  it("looks up the tile by id and resolves its lms", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "course-1", lms: "blackboard" }), baseCourse({ id: "course-2", lms: "canvas" })],
    });
    expect(await resolveTileLms("course-1", testHelpers())).toBe("blackboard");
    expect(await resolveTileLms("course-2", testHelpers())).toBe("canvas");
  });

  it("fails open (empty) when the tile id is not found", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse({ id: "other-course" })] });
    expect(await resolveTileLms("course-1", testHelpers())).toBe("");
  });

  it("fails open (empty) when listCourseHubAction returns an error", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ error: "boom" });
    expect(await resolveTileLms("course-1", testHelpers())).toBe("");
  });

  it("fails open (empty) when listCourseHubAction rejects", async () => {
    vi.mocked(listCourseHubAction).mockRejectedValue(new Error("network down"));
    expect(await resolveTileLms("course-1", testHelpers())).toBe("");
  });
});

describe("HUB_COURSE_LMS_INPUT", () => {
  it("is optional, so adding it to a step never blocks a run whose preset does not bind it", () => {
    expect(HUB_COURSE_LMS_INPUT.key).toBe("hubCourse");
    expect(HUB_COURSE_LMS_INPUT.type).toBe("hubCourse");
    expect(HUB_COURSE_LMS_INPUT.required).toBe(false);
  });
});
