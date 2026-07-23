import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseContentAction: vi.fn(),
  getPageAction: vi.fn(),
  previewFileAction: vi.fn(),
  fetchCanvasMetaAction: vi.fn(),
  ingestRepoAction: vi.fn(),
  extractZipMaterialsTextAction: vi.fn(),
}));

import { listCourseContentAction, ingestRepoAction } from "@/app/actions";
import { gatherModuleMaterials } from "./registry-helpers.sources";
import type { StepRunHelpers } from "./registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import type { CartridgeCourseData } from "@/lib/cartridge-import";
import { DEFAULT_SOURCE_POLICY, type SourcePolicy } from "./source-policy";
import { liveModuleValue, exportModuleValue } from "./module-value";

function courseExport(overrides: Partial<CartridgeCourseData> = {}): CartridgeCourseData {
  return {
    title: null,
    courseCode: null,
    startAt: null,
    syllabusHtml: null,
    modules: [],
    rubrics: [],
    hasCourseSettings: true,
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
    saveCourseExportFile: null,
    loadCommonResources: null,
    getLibraryFile: null,
    getInstitutionFields: null,
    loadCourseExport: null,
    loadCourseMaterials: null,
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
    topics: "Topic list",
    csvName: null,
    csvData: null,
    rubricName: null,
    rubricData: null,
    startDate: null,
    description: "A course description",
    weeks: null,
    tests: null,
    lms: null,
    dayTime: null,
    materialsFiles: [],
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

describe("gatherModuleMaterials - default policy byte-identical behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to tile topics/description when no module is picked and no canvasUrl is set", async () => {
    const tile = baseCourse();
    const result = await gatherModuleMaterials(tile, "", testHelpers(), noProgress);
    expect(result.materialsText).toBe("Topic list\n\nA course description");
    expect(result.notes).toEqual(["no live LMS module or export module - using tile topics/description"]);
    expect(result.materialsSource).toBe("Materials from the tile's topics/description");
    expect(result.moduleName).toBe("Upcoming module");
  });

  it("reads a live LMS module successfully", async () => {
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "CS 101",
      pages: [],
      modules: [
        {
          id: 42,
          name: "Week 1",
          position: 1,
          published: true,
          itemsCount: 1,
          items: [
            {
              id: 1,
              moduleId: 42,
              type: "Quiz",
              title: "HW1",
              position: 1,
              indent: 0,
              published: true,
              contentId: 1,
              htmlUrl: null,
              pageUrl: null,
              dueAt: null,
              pointsPossible: null,
              externalUrl: null,
            },
          ],
        },
      ],
    });

    const tile = baseCourse({ canvasUrl: "https://canvas.example.com/courses/1" });
    const moduleIdRaw = liveModuleValue(42, "Week 1");
    const result = await gatherModuleMaterials(tile, moduleIdRaw, testHelpers(), noProgress);
    expect(result.moduleName).toBe("Week 1");
    expect(result.materialsSource).toBe('Materials read from LMS module "Week 1"');
    expect(result.materialsText).toContain("Quiz: HW1");
    expect(result.notes).toEqual([]);
  });

  it("falls back from a failed live LMS lookup to the course export, with the coupled note", async () => {
    vi.mocked(listCourseContentAction).mockResolvedValue({ error: "network down" });
    const loadCourseExport = vi.fn(async () =>
      courseExport({ modules: [{ name: "Week 1", position: 1, items: [{ type: "Page", title: "Intro" }] }] })
    );

    const tile = baseCourse({ canvasUrl: "https://canvas.example.com/courses/1" });
    const moduleIdRaw = liveModuleValue(42, "Week 1");
    const result = await gatherModuleMaterials(
      tile,
      moduleIdRaw,
      testHelpers({ loadCourseExport }),
      noProgress
    );
    expect(result.moduleName).toBe("Week 1");
    expect(result.materialsSource).toContain("course export module");
    expect(result.notes).toEqual(['live LMS failed (network down) - used the course export instead']);
  });

  it("an explicit export-sourced module pick reads directly from the course export", async () => {
    const loadCourseExport = vi.fn(async () =>
      courseExport({
        modules: [{ name: "Week 2", position: 2, items: [{ type: "File", title: "Slides" }] }],
        syllabusHtml: "<p>Syllabus text</p>",
      })
    );
    const tile = baseCourse();
    const moduleIdRaw = exportModuleValue("Week 2");
    const result = await gatherModuleMaterials(
      tile,
      moduleIdRaw,
      testHelpers({ loadCourseExport }),
      noProgress
    );
    expect(result.moduleName).toBe("Week 2");
    expect(result.materialsText).toContain("File: Slides");
    expect(result.materialsText).toContain("Syllabus text");
    expect(result.notes).toEqual([]);
    expect(listCourseContentAction).not.toHaveBeenCalled();
  });

  it("passing no policy argument is byte-identical to passing DEFAULT_SOURCE_POLICY explicitly", async () => {
    const tile = baseCourse();
    const a = await gatherModuleMaterials(tile, "", testHelpers(), noProgress);
    const b = await gatherModuleMaterials(tile, "", testHelpers(), noProgress, DEFAULT_SOURCE_POLICY);
    expect(a).toEqual(b);
  });
});

describe("gatherModuleMaterials - custom policies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("repo-only policy digests the tile's first linked repository", async () => {
    vi.mocked(ingestRepoAction).mockResolvedValue({
      digest: { fullName: "org/repo", description: "", fileCount: 3, text: "# Repository: org/repo\nsome code", truncated: false, files: [] },
    });
    const tile = baseCourse({ repos: [{ repo: "org/repo", branch: null }] });
    const policy: SourcePolicy = { order: ["repo"], strategy: "first-success" };
    const result = await gatherModuleMaterials(tile, "", testHelpers(), noProgress, policy);
    expect(result.materialsText).toContain("some code");
    expect(result.notes[0]).toContain('repo "org/repo"');
  });

  it("repo-only policy with no linked repo yields empty text and an explanatory note", async () => {
    const tile = baseCourse({ repos: [] });
    const policy: SourcePolicy = { order: ["repo"], strategy: "first-success" };
    const result = await gatherModuleMaterials(tile, "", testHelpers(), noProgress, policy);
    expect(result.materialsText).toBe("");
    expect(result.notes).toEqual(["repo: no repository linked to this course tile"]);
  });

  it("materials-zip policy with no helper wired yields an explanatory note", async () => {
    const tile = baseCourse();
    const policy: SourcePolicy = { order: ["materials-zip"], strategy: "first-success" };
    const result = await gatherModuleMaterials(tile, "", testHelpers(), noProgress, policy);
    expect(result.materialsText).toBe("");
    expect(result.notes).toEqual(["materials zip: not available in this run context"]);
  });

  it("materials-zip policy with no file on the tile yields an explanatory note", async () => {
    const tile = baseCourse();
    const policy: SourcePolicy = { order: ["materials-zip"], strategy: "first-success" };
    const result = await gatherModuleMaterials(
      tile,
      "",
      testHelpers({ loadCourseMaterials: vi.fn(async () => null) }),
      noProgress,
      policy
    );
    expect(result.materialsText).toBe("");
    expect(result.notes).toEqual(["materials zip: none uploaded on this course tile"]);
  });

  it("merge-all combines repo and tile-meta text", async () => {
    vi.mocked(ingestRepoAction).mockResolvedValue({
      digest: { fullName: "org/repo", description: "", fileCount: 1, text: "repo digest text", truncated: false, files: [] },
    });
    const tile = baseCourse({ repos: [{ repo: "org/repo", branch: null }], topics: "tile topics" });
    const policy: SourcePolicy = { order: ["repo", "tile-meta"], strategy: "merge-all" };
    const result = await gatherModuleMaterials(tile, "", testHelpers(), noProgress, policy);
    expect(result.materialsText).toContain("repo digest text");
    expect(result.materialsText).toContain("tile topics");
  });

  it("an empty policy order yields nothing and no notes", async () => {
    const tile = baseCourse();
    const policy: SourcePolicy = { order: [], strategy: "first-success" };
    const result = await gatherModuleMaterials(tile, "", testHelpers(), noProgress, policy);
    expect(result.materialsText).toBe("");
    expect(result.notes).toEqual([]);
  });

  it("standalone course-export policy (live-lms excluded) attempts export by picked name", async () => {
    const loadCourseExport = vi.fn(async () =>
      courseExport({ modules: [{ name: "Week 3", position: 3, items: [{ type: "Page", title: "Notes" }] }] })
    );
    const tile = baseCourse({ canvasUrl: "https://canvas.example.com/courses/1" });
    const moduleIdRaw = liveModuleValue(99, "Week 3");
    const policy: SourcePolicy = { order: ["course-export"], strategy: "first-success" };
    const result = await gatherModuleMaterials(
      tile,
      moduleIdRaw,
      testHelpers({ loadCourseExport }),
      noProgress,
      policy
    );
    expect(result.materialsText).toContain("Page: Notes");
    expect(listCourseContentAction).not.toHaveBeenCalled();
  });
});
