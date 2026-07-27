import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  generateCourseSyllabusAction: vi.fn(),
  createFinalizedSyllabusAction: vi.fn(),
  updateCourseHubAction: vi.fn(),
}));

import {
  listCourseHubAction,
  generateCourseSyllabusAction,
  createFinalizedSyllabusAction,
  updateCourseHubAction,
} from "@/app/actions";
import { getStepDefinition } from "./registry";
import type { StepRunHelpers } from "./registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import type { InstitutionField } from "@/lib/institution-fields";

const step = getStepDefinition("generate-syllabus")!;

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
    workflowId: "workflow-1",
    workflowName: "Test Workflow",
    workflowRunId: "run-1",
    ...overrides,
  };
}

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

function institutionFields(fields: Partial<InstitutionField>[]): InstitutionField[] {
  return fields.map((f) => ({
    id: f.id ?? "",
    label: f.label ?? "",
    type: f.type ?? "text",
    value: f.value ?? "",
    ...(f.lms !== undefined ? { lms: f.lms } : {}),
  }));
}

const generatedSyllabus = { base64: "dGVzdCBkYXRh", name: "Generated Syllabus" };
const savedSyllabusMeta = {
  id: "new-syllabus",
  name: "Generated Syllabus",
  fileName: "CS 101 - Syllabus.docx",
  courseCode: null,
  updatedAt: "2024-09-01T00:00:00Z",
};

describe("generate-syllabus step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC1: blank hubCourse throws 'Choose a course tile.'", async () => {
    await expect(
      step.run({ hubCourse: "" }, testHelpers(), () => {})
    ).rejects.toThrow("Choose a course tile.");
    expect(listCourseHubAction).not.toHaveBeenCalled();
  });

  it("AC2: listCourseHubAction returning error throws that error", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ error: "List failed" });

    await expect(
      step.run({ hubCourse: "course-1" }, testHelpers(), () => {})
    ).rejects.toThrow("List failed");
  });

  it("AC3: tile id not present throws 'Course tile not found.'", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [baseCourse({ id: "different-course" })],
    });

    await expect(
      step.run({ hubCourse: "course-1" }, testHelpers(), () => {})
    ).rejects.toThrow("Course tile not found.");
  });

  it("AC4: tile has a syllabusId and regenerate is falsy - returns the existing id, generateCourseSyllabusAction is not called", async () => {
    const tile = baseCourse({ id: "course-1", syllabusId: "existing-syllabus" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });

    const result = await step.run(
      { hubCourse: "course-1" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.syllabusId).toBe("existing-syllabus");
    expect(generateCourseSyllabusAction).not.toHaveBeenCalled();
  });

  it("AC4b: regenerate explicitly '0' also leaves an existing syllabus alone", async () => {
    const tile = baseCourse({ id: "course-1", syllabusId: "existing-syllabus" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });

    const result = await step.run(
      { hubCourse: "course-1", regenerate: "0" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.syllabusId).toBe("existing-syllabus");
    expect(generateCourseSyllabusAction).not.toHaveBeenCalled();
  });

  it("AC5: tile has a syllabusId and regenerate is true - generation runs", async () => {
    const tile = baseCourse({
      id: "course-1",
      syllabusId: "existing-syllabus",
      syllabusTemplateId: "course-tpl",
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateCourseSyllabusAction).mockResolvedValue(generatedSyllabus);
    vi.mocked(createFinalizedSyllabusAction).mockResolvedValue({
      syllabus: savedSyllabusMeta,
    });
    vi.mocked(updateCourseHubAction).mockResolvedValue({ course: tile });

    const result = await step.run(
      { hubCourse: "course-1", regenerate: "1" },
      testHelpers(),
      () => {}
    );

    expect(generateCourseSyllabusAction).toHaveBeenCalledTimes(1);
    expect(result.outputs.syllabusId).toBe("new-syllabus");
  });

  it("AC6: no template on the course and none on the institution throws", async () => {
    const tile = baseCourse({ id: "course-1" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });

    await expect(
      step.run({ hubCourse: "course-1" }, testHelpers(), () => {})
    ).rejects.toThrow(
      "Set a syllabus template on the course (or its institution) first."
    );
    expect(generateCourseSyllabusAction).not.toHaveBeenCalled();
  });

  it("AC7 (regression - AC1's whole point): the per-course syllabusTemplateId column wins over the institution field", async () => {
    const tile = baseCourse({
      id: "course-1",
      syllabusTemplateId: "course-tpl",
      institution: "MCC",
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    const getInstitutionFields = vi.fn(async () =>
      institutionFields([{ id: "syllabusTemplate", value: "inst-tpl" }])
    );
    vi.mocked(generateCourseSyllabusAction).mockResolvedValue(generatedSyllabus);
    vi.mocked(createFinalizedSyllabusAction).mockResolvedValue({
      syllabus: savedSyllabusMeta,
    });
    vi.mocked(updateCourseHubAction).mockResolvedValue({ course: tile });

    await step.run(
      { hubCourse: "course-1" },
      testHelpers({ getInstitutionFields }),
      () => {}
    );

    expect(generateCourseSyllabusAction).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateCourseSyllabusAction).mock.calls[0];
    expect(callArgs[0]).toBe("course-tpl");
  });

  it("AC8: the institution field is used when the per-course column is blank", async () => {
    const tile = baseCourse({
      id: "course-1",
      syllabusTemplateId: null,
      institution: "MCC",
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    const getInstitutionFields = vi.fn(async () =>
      institutionFields([{ id: "syllabusTemplate", value: "inst-tpl" }])
    );
    vi.mocked(generateCourseSyllabusAction).mockResolvedValue(generatedSyllabus);
    vi.mocked(createFinalizedSyllabusAction).mockResolvedValue({
      syllabus: savedSyllabusMeta,
    });
    vi.mocked(updateCourseHubAction).mockResolvedValue({ course: tile });

    await step.run(
      { hubCourse: "course-1" },
      testHelpers({ getInstitutionFields }),
      () => {}
    );

    expect(generateCourseSyllabusAction).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateCourseSyllabusAction).mock.calls[0];
    expect(callArgs[0]).toBe("inst-tpl");
  });

  it("AC9: blank institution email/lmsUrl produce a note and the step still succeeds", async () => {
    const tile = baseCourse({
      id: "course-1",
      syllabusTemplateId: "course-tpl",
      institution: "MCC",
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    const getInstitutionFields = vi.fn(async () => institutionFields([]));
    vi.mocked(generateCourseSyllabusAction).mockResolvedValue(generatedSyllabus);
    vi.mocked(createFinalizedSyllabusAction).mockResolvedValue({
      syllabus: savedSyllabusMeta,
    });
    vi.mocked(updateCourseHubAction).mockResolvedValue({ course: tile });

    const result = await step.run(
      { hubCourse: "course-1" },
      testHelpers({ getInstitutionFields }),
      () => {}
    );

    expect(result.outputs.syllabusId).toBe("new-syllabus");
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.toLowerCase().includes("email"))).toBe(true);
      expect(result.summary.items.some((i) => i.toLowerCase().includes("lms url"))).toBe(true);
    }
  });

  it("AC9b: whitespace-only institution email still produces the email warning note, and the step still succeeds", async () => {
    const tile = baseCourse({
      id: "course-1",
      syllabusTemplateId: "course-tpl",
      institution: "MCC",
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    const getInstitutionFields = vi.fn(async () =>
      institutionFields([
        { id: "email", value: "   " },
        { id: "lmsUrl", value: "https://mcc.instructure.com" },
      ])
    );
    vi.mocked(generateCourseSyllabusAction).mockResolvedValue(generatedSyllabus);
    vi.mocked(createFinalizedSyllabusAction).mockResolvedValue({
      syllabus: savedSyllabusMeta,
    });
    vi.mocked(updateCourseHubAction).mockResolvedValue({ course: tile });

    const result = await step.run(
      { hubCourse: "course-1" },
      testHelpers({ getInstitutionFields }),
      () => {}
    );

    expect(result.outputs.syllabusId).toBe("new-syllabus");
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.toLowerCase().includes("email"))).toBe(true);
      expect(result.summary.items.some((i) => i.toLowerCase().includes("lms url"))).toBe(false);
    }
  });

  it("AC9c: whitespace-only institution lmsUrl still produces the LMS URL warning note, and the step still succeeds", async () => {
    const tile = baseCourse({
      id: "course-1",
      syllabusTemplateId: "course-tpl",
      institution: "MCC",
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    const getInstitutionFields = vi.fn(async () =>
      institutionFields([
        { id: "email", value: "admissions@mcc.edu" },
        { id: "lmsUrl", value: "\n" },
      ])
    );
    vi.mocked(generateCourseSyllabusAction).mockResolvedValue(generatedSyllabus);
    vi.mocked(createFinalizedSyllabusAction).mockResolvedValue({
      syllabus: savedSyllabusMeta,
    });
    vi.mocked(updateCourseHubAction).mockResolvedValue({ course: tile });

    const result = await step.run(
      { hubCourse: "course-1" },
      testHelpers({ getInstitutionFields }),
      () => {}
    );

    expect(result.outputs.syllabusId).toBe("new-syllabus");
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.toLowerCase().includes("email"))).toBe(false);
      expect(result.summary.items.some((i) => i.toLowerCase().includes("lms url"))).toBe(true);
    }
  });

  it("AC10: a failure from updateCourseHubAction yields a note, not a throw", async () => {
    const tile = baseCourse({
      id: "course-1",
      syllabusTemplateId: "course-tpl",
    });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateCourseSyllabusAction).mockResolvedValue(generatedSyllabus);
    vi.mocked(createFinalizedSyllabusAction).mockResolvedValue({
      syllabus: savedSyllabusMeta,
    });
    vi.mocked(updateCourseHubAction).mockResolvedValue({ error: "Update failed" });

    const result = await step.run(
      { hubCourse: "course-1" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.syllabusId).toBe("new-syllabus");
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(
        result.summary.items.some((i) => i.includes("linking the generated syllabus to the tile failed"))
      ).toBe(true);
    }
  });

  it("generateCourseSyllabusAction returning an error is thrown", async () => {
    const tile = baseCourse({ id: "course-1", syllabusTemplateId: "course-tpl" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateCourseSyllabusAction).mockResolvedValue({ error: "Generation failed" });

    await expect(
      step.run({ hubCourse: "course-1" }, testHelpers(), () => {})
    ).rejects.toThrow("Generation failed");
    expect(createFinalizedSyllabusAction).not.toHaveBeenCalled();
  });

  it("createFinalizedSyllabusAction returning an error is thrown", async () => {
    const tile = baseCourse({ id: "course-1", syllabusTemplateId: "course-tpl" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateCourseSyllabusAction).mockResolvedValue(generatedSyllabus);
    vi.mocked(createFinalizedSyllabusAction).mockResolvedValue({ error: "Save failed" });

    await expect(
      step.run({ hubCourse: "course-1" }, testHelpers(), () => {})
    ).rejects.toThrow("Save failed");
    expect(updateCourseHubAction).not.toHaveBeenCalled();
  });

  it("happy path returns the generated syllabus id/name and calls updateCourseHubAction to link it", async () => {
    const tile = baseCourse({ id: "course-1", syllabusTemplateId: "course-tpl" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(generateCourseSyllabusAction).mockResolvedValue(generatedSyllabus);
    vi.mocked(createFinalizedSyllabusAction).mockResolvedValue({
      syllabus: savedSyllabusMeta,
    });
    vi.mocked(updateCourseHubAction).mockResolvedValue({ course: tile });

    const result = await step.run(
      { hubCourse: "course-1" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.syllabusId).toBe("new-syllabus");
    expect(result.outputs.syllabusName).toBe("Generated Syllabus");
    expect(updateCourseHubAction).toHaveBeenCalledTimes(1);
    const linkArgs = vi.mocked(updateCourseHubAction).mock.calls[0];
    expect(linkArgs[0]).toBe("course-1");
    expect((linkArgs[1] as { syllabusId?: string }).syllabusId).toBe("new-syllabus");
  });
});
