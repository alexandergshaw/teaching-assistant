import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  ingestRepoAction: vi.fn(),
}));

// gatherModuleMaterials drives the real live-LMS/export/tile-meta source
// ladder (network + parsing); this test cares about pull-current-materials's
// OWN module-targeting logic (name-first, position as a last resort, and the
// mismatch note), which sits entirely before that call, so the gatherer
// itself is mocked. Its own behavior is covered by
// registry-helpers.sources.test.ts.
vi.mock("@/lib/workflows/registry-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workflows/registry-helpers")>();
  return { ...actual, gatherModuleMaterials: vi.fn() };
});

import { listCourseHubAction, listCourseContentAction } from "@/app/actions";
import { getStepDefinition } from "./registry";
import { gatherModuleMaterials, type StepRunHelpers } from "./registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import { nameModuleValue, liveModuleValue } from "./module-value";

const step = getStepDefinition("pull-current-materials")!;

function testHelpers(): StepRunHelpers {
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
  };
}

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "MCC Principles of CS",
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

const noProgress = () => {};

// A Canvas module list carrying the reported bug's exact shape: a leading
// non-module "Course Information" entry before Module 01, so the array
// position for week 7 (index 6) is actually "Module 06" - never Module 07.
const modulesWithLeadingNonModuleEntry = [
  { id: 0, name: "Course Information", position: 0, published: true, itemsCount: 0, items: [] },
  { id: 1, name: "Module 01: Getting Started", position: 1, published: true, itemsCount: 0, items: [] },
  { id: 2, name: "Module 02", position: 2, published: true, itemsCount: 0, items: [] },
  { id: 3, name: "Module 03", position: 3, published: true, itemsCount: 0, items: [] },
  { id: 4, name: "Module 04", position: 4, published: true, itemsCount: 0, items: [] },
  { id: 5, name: "Module 05", position: 5, published: true, itemsCount: 0, items: [] },
  { id: 6, name: "Module 06: External Files and Loops", position: 6, published: true, itemsCount: 0, items: [] },
  {
    id: 7,
    name: "Module 07: Algorithms and Data Structures",
    position: 7,
    published: true,
    itemsCount: 0,
    items: [],
  },
];

describe("pull-current-materials step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("declares an optional moduleRef (lmsModule) input", () => {
    const input = step.inputs.find((i) => i.key === "moduleRef");
    expect(input, "moduleRef input exists").toBeTruthy();
    expect(input!.type).toBe("lmsModule");
    expect(input!.required).toBe(false);
    expect(input!.help).toContain("Find the current week and module");
  });

  it("F2: moduleRef bound - passes it straight to gatherModuleMaterials, no positional lookup", async () => {
    // A URL unique to this test: loadTileWeekTopic (an earlier, unrelated
    // step in this run - topic derivation) also calls listCourseContentAction
    // when canvasUrl is set, and registry-helpers.ts caches its result at
    // module scope keyed by canvasUrl. A distinct URL per test keeps that
    // cache from bleeding call counts between tests; it is mocked below so
    // that call resolves harmlessly regardless.
    const tile = baseCourse({ id: "course-1", canvasUrl: "https://canvas.example.com/courses/f2" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "x", pages: [], modules: [] });
    vi.mocked(gatherModuleMaterials).mockResolvedValue({
      moduleName: "Module 07: Algorithms and Data Structures",
      materialsText: "algorithms content",
      notes: [],
      materialsSource: "test",
    });

    const moduleRef = nameModuleValue("Module 07: Algorithms and Data Structures");
    const result = await step.run(
      { hubCourse: "course-1", week: 7, moduleRef },
      testHelpers(),
      noProgress
    );

    // The decisive proof of F2: gatherModuleMaterials receives the BOUND
    // reference verbatim - never a liveModuleValue(id, name) built from a
    // positional array lookup.
    expect(gatherModuleMaterials).toHaveBeenCalledTimes(1);
    expect(vi.mocked(gatherModuleMaterials).mock.calls[0][1]).toBe(moduleRef);
    expect(result.outputs.moduleName).toBe("Module 07: Algorithms and Data Structures");
    expect(result.outputs.materials).toContain("algorithms content");
    // The bound reference agrees with the targeted week - no mismatch note.
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).not.toContain("mismatch");
    }
  });

  it("F3: moduleRef unbound, leading non-module entry present - NAME match wins over the positional entry (the reported bug)", async () => {
    const tile = baseCourse({ id: "course-1", canvasUrl: "https://canvas.example.com/courses/f3-name-match" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "MCC Principles of CS",
      pages: [],
      modules: modulesWithLeadingNonModuleEntry,
    });
    vi.mocked(gatherModuleMaterials).mockImplementation(async (_tile, moduleIdRaw) => {
      const name = String(moduleIdRaw).split("|").slice(1).join("|");
      return { moduleName: name, materialsText: `${name} content`, notes: [], materialsSource: "test" };
    });

    const result = await step.run({ hubCourse: "course-1", week: 7 }, testHelpers(), noProgress);

    expect(gatherModuleMaterials).toHaveBeenCalledTimes(1);
    const calledWith = vi.mocked(gatherModuleMaterials).mock.calls[0][1];
    // The positional entry (content.modules[7 - 1]) is "Module 06: External
    // Files and Loops" - proof this is NOT what got passed through.
    expect(calledWith).toBe(liveModuleValue(7, "Module 07: Algorithms and Data Structures"));
    expect(calledWith).not.toBe(liveModuleValue(6, "Module 06: External Files and Loops"));
    expect(result.outputs.moduleName).toBe("Module 07: Algorithms and Data Structures");
    expect(result.outputs.materials).toContain("Algorithms and Data Structures");
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).not.toContain("mismatch");
      expect(result.summary.text).not.toContain("positional fallback");
    }
  });

  it("F3: moduleRef unbound, no name match anywhere - falls back to position AND records an explicit fallback note", async () => {
    const tile = baseCourse({ id: "course-1", canvasUrl: "https://canvas.example.com/courses/f3-fallback" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    // No module name anywhere contains a "module"/"week" token, so no name
    // match is possible for any target number.
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "Odd Course",
      pages: [],
      modules: Array.from({ length: 7 }, (_, i) => ({
        id: i + 1,
        name: `Unit ${i + 1}`,
        position: i + 1,
        published: true,
        itemsCount: 0,
        items: [],
      })),
    });
    vi.mocked(gatherModuleMaterials).mockResolvedValue({
      moduleName: "Unit 7",
      materialsText: "unit 7 content",
      notes: [],
      materialsSource: "test",
    });

    const result = await step.run({ hubCourse: "course-1", week: 7 }, testHelpers(), noProgress);

    expect(gatherModuleMaterials).toHaveBeenCalledTimes(1);
    const calledWith = vi.mocked(gatherModuleMaterials).mock.calls[0][1];
    expect(calledWith).toBe(liveModuleValue(7, "Unit 7"));
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toMatch(/positional fallback/i);
    }
  });

  it("F4: the gathered module's name disagrees with the targeted week - pushes an explicit mismatch note naming both", async () => {
    const tile = baseCourse({ id: "course-1", canvasUrl: "https://canvas.example.com/courses/f4-mismatch" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    // No "Module 07" name exists, so the positional fallback lands on
    // position 7 (index 6), "Module 06: Loops" - the exact reported bug,
    // now surfaced instead of silent.
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "MCC Principles of CS",
      pages: [],
      modules: [
        { id: 1, name: "Course Information", position: 0, published: true, itemsCount: 0, items: [] },
        { id: 2, name: "Module 01", position: 1, published: true, itemsCount: 0, items: [] },
        { id: 3, name: "Module 02", position: 2, published: true, itemsCount: 0, items: [] },
        { id: 4, name: "Module 03", position: 3, published: true, itemsCount: 0, items: [] },
        { id: 5, name: "Module 04", position: 4, published: true, itemsCount: 0, items: [] },
        { id: 6, name: "Module 05", position: 5, published: true, itemsCount: 0, items: [] },
        { id: 7, name: "Module 06: Loops", position: 6, published: true, itemsCount: 0, items: [] },
      ],
    });
    vi.mocked(gatherModuleMaterials).mockResolvedValue({
      moduleName: "Module 06: Loops",
      materialsText: "loops content",
      notes: [],
      materialsSource: "test",
    });

    const result = await step.run({ hubCourse: "course-1", week: 7 }, testHelpers(), noProgress);

    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toContain("week 7");
      expect(result.summary.text).toContain("Module 06: Loops");
      expect(result.summary.text.toLowerCase()).toContain("mismatch");
    }
  });

  it("F4: an explicitly bound moduleRef that disagrees with the targeted week is also flagged (mismatch check is not limited to the positional-fallback path)", async () => {
    const tile = baseCourse({ id: "course-1", canvasUrl: "https://canvas.example.com/courses/f4-explicit-mismatch" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "x", pages: [], modules: [] });
    vi.mocked(gatherModuleMaterials).mockResolvedValue({
      moduleName: "Module 03: Conditionals",
      materialsText: "conditionals content",
      notes: [],
      materialsSource: "test",
    });

    const result = await step.run(
      { hubCourse: "course-1", week: 7, moduleRef: nameModuleValue("Module 03: Conditionals") },
      testHelpers(),
      noProgress
    );

    // gatherModuleMaterials received the bound reference verbatim (same
    // proof as the F2 test) even though this scenario also exercises F4.
    expect(gatherModuleMaterials).toHaveBeenCalledTimes(1);
    expect(vi.mocked(gatherModuleMaterials).mock.calls[0][1]).toBe(nameModuleValue("Module 03: Conditionals"));
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      expect(result.summary.text).toContain("week 7");
      expect(result.summary.text).toContain("Module 03: Conditionals");
      expect(result.summary.text.toLowerCase()).toContain("mismatch");
    }
  });
});
