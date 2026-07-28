import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";

// The step's RUN BODY calls six actions through the "@/app/actions" barrel
// (listCourseHubAction, saveLibraryFileAction, findVisualizerConceptAction,
// createVisualizerConceptAction, extractPptxSlidesAction,
// extractDeckConceptsAction) - all six are mocked here (even the ones a given
// scenario never calls) so every import in steps.visualizer.ts binds to a
// real vi.fn() instead of undefined, following the same pattern as
// registry.generate-syllabus.test.ts / steps.course-setup.materials.test.ts.
// This only replaces "@/app/actions" for THIS test file - getStepDefinition
// still pulls in every other step module's imports from the same barrel, but
// none of those call their imports at module scope, so an incomplete mock
// object is safe (established by the existing generate-syllabus test).
vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  saveLibraryFileAction: vi.fn(),
  findVisualizerConceptAction: vi.fn(),
  createVisualizerConceptAction: vi.fn(),
  extractPptxSlidesAction: vi.fn(),
  extractDeckConceptsAction: vi.fn(),
}));

import {
  listCourseHubAction,
  saveLibraryFileAction,
  findVisualizerConceptAction,
  createVisualizerConceptAction,
  extractDeckConceptsAction,
} from "@/app/actions";
import { getStepDefinition } from "./registry";
import { outputFeedsInput } from "./types";
import type { StepRunHelpers } from "./registry-helpers";
import type { Course } from "@/lib/supabase/courses";

describe("ensure-visualizer-pages-for-deck step", () => {
  const def = getStepDefinition("ensure-visualizer-pages-for-deck");
  expect(def, "ensure-visualizer-pages-for-deck step exists").toBeTruthy();

  it("has the correct name and type", () => {
    expect(def!.name).toBe("Ensure visualizer pages for a deck");
    expect(def!.type).toBe("ensure-visualizer-pages-for-deck");
  });

  it("mentions the visualizer and a deck in its description", () => {
    const desc = def!.description;
    expect(desc).toContain("programming-concept-visualizer.vercel.app");
    expect(desc.toLowerCase()).toContain("deck");
  });

  it("has the exact input keys", () => {
    const inputKeys = def!.inputs.map((i) => i.key).sort();
    expect(inputKeys).toEqual(
      ["create", "hubCourse", "maxConcepts", "slides", "slidesText"].sort()
    );
  });

  it("has correct input types", () => {
    const byKey = new Map(def!.inputs.map((i) => [i.key, i]));
    expect(byKey.get("slides")!.type).toBe("uploads");
    expect(byKey.get("slides")!.accept).toBe(".pptx");
    expect(byKey.get("slidesText")!.type).toBe("longtext");
    expect(byKey.get("hubCourse")!.type).toBe("hubCourse");
    expect(byKey.get("maxConcepts")!.type).toBe("number");
    expect(byKey.get("create")!.type).toBe("boolean");
  });

  it("every input is optional", () => {
    for (const input of def!.inputs) {
      expect(input.required, `${input.key} should be optional`).toBe(false);
    }
  });

  it("has the exact output keys", () => {
    const outputKeys = def!.outputs.map((o) => o.key).sort();
    expect(outputKeys).toEqual(["created", "hasCreated", "links", "missing", "report"].sort());
  });

  it("has correct output types", () => {
    const byKey = new Map(def!.outputs.map((o) => [o.key, o]));
    expect(byKey.get("report")!.type).toBe("longtext");
    expect(byKey.get("links")!.type).toBe("longtext");
    expect(byKey.get("created")!.type).toBe("number");
    expect(byKey.get("missing")!.type).toBe("number");
    expect(byKey.get("hasCreated")!.type).toBe("boolean");
  });

  it("run method exists", () => {
    expect(typeof def!.run).toBe("function");
  });

  it("slidesText input can accept output from generate-presentation-from-template's deck", () => {
    const presentationDef = getStepDefinition("generate-presentation-from-template");
    expect(presentationDef, "generate-presentation-from-template step exists").toBeTruthy();

    const deckOutput = presentationDef!.outputs.find((o) => o.key === "deck");
    expect(deckOutput, "deck output exists").toBeTruthy();

    const slidesTextInput = def!.inputs.find((i) => i.key === "slidesText");
    expect(slidesTextInput, "slidesText input exists").toBeTruthy();

    expect(
      outputFeedsInput(deckOutput!.type, slidesTextInput!.type),
      "deck output can feed slidesText input"
    ).toBe(true);
  });

  it("slidesText input can accept output from generate-presentation-from-template's slidesJson", () => {
    const presentationDef = getStepDefinition("generate-presentation-from-template");
    expect(presentationDef, "generate-presentation-from-template step exists").toBeTruthy();

    const slidesJsonOutput = presentationDef!.outputs.find((o) => o.key === "slidesJson");
    expect(slidesJsonOutput, "slidesJson output exists").toBeTruthy();

    const slidesTextInput = def!.inputs.find((i) => i.key === "slidesText");
    expect(slidesTextInput, "slidesText input exists").toBeTruthy();

    expect(
      outputFeedsInput(slidesJsonOutput!.type, slidesTextInput!.type),
      "slidesJson output can feed slidesText input"
    ).toBe(true);
  });

  it("rejects when both slides and slidesText are empty, with the exact message", async () => {
    const helpers = {
      activeInstitution: null,
      provider: "embedded" as const,
      author: "",
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

    await expect(
      def!.run({ slides: [], slidesText: "" }, helpers, () => {})
    ).rejects.toThrow("Provide a slide deck - upload a .pptx or bind a deck from an earlier step.");
  });
});

// The run body's own logic (deckText assembly is covered above by the
// rejection test) - concept extraction -> per-concept find/create -> report
// building -> library-file persistence. extractDeckConceptsAction,
// findVisualizerConceptAction, createVisualizerConceptAction,
// saveLibraryFileAction and listCourseHubAction are all mocked (see the
// module-level vi.mock above); blobToBase64 and buildWorkflowFileName run for
// real (both are pure/Node-safe, no need to mock them).
describe("ensure-visualizer-pages-for-deck step - run body", () => {
  const def = getStepDefinition("ensure-visualizer-pages-for-deck")!;

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

  // resetAllMocks (not clearAllMocks): clearAllMocks only clears call
  // history, not queued mockResolvedValueOnce/mockRejectedValueOnce
  // implementations - a test whose code throws (or returns) before
  // consuming every value it queued would otherwise leak the leftover
  // queued value into whichever test runs next, misattributing that test's
  // failure. resetAllMocks clears the queue too, so every test starts from
  // a clean slate regardless of how the previous test ended.
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(saveLibraryFileAction).mockResolvedValue({ id: "lib-1" });
  });

  it("slidesText alone drives the run: two concepts, both found, nothing missing or created", async () => {
    vi.mocked(extractDeckConceptsAction).mockResolvedValue({
      concepts: [
        { concept: "for loops", evidence: "e1" },
        { concept: "recursion", evidence: "e2" },
      ],
    });
    vi.mocked(findVisualizerConceptAction)
      .mockResolvedValueOnce({ found: true, url: "https://pcv.test/loops", topic: "pythonNavItems", slug: "for-loops", label: "For Loops" })
      .mockResolvedValueOnce({ found: true, url: "https://pcv.test/recursion", topic: "pythonNavItems", slug: "recursion", label: "Recursion" });

    const result = await def.run({ slides: [], slidesText: "deck text" }, testHelpers(), () => {});

    expect(result.outputs.created).toBe(0);
    expect(result.outputs.missing).toBe(0);
    expect(result.outputs.hasCreated).toBe("");
    expect(result.outputs.links).toContain("[for loops](https://pcv.test/loops)");
    expect(result.outputs.links).toContain("[recursion](https://pcv.test/recursion)");
    expect(result.outputs.report).toContain("for loops: found at https://pcv.test/loops");
    expect(result.outputs.report).toContain("recursion: found at https://pcv.test/recursion");
    expect(createVisualizerConceptAction).not.toHaveBeenCalled();
  });

  it("not found + create enabled and succeeding: created 1, missing 1, hasCreated truthy, link carries (new)", async () => {
    vi.mocked(extractDeckConceptsAction).mockResolvedValue({
      concepts: [{ concept: "closures", evidence: "e1" }],
    });
    vi.mocked(findVisualizerConceptAction).mockResolvedValueOnce({ found: false });
    vi.mocked(createVisualizerConceptAction).mockResolvedValueOnce({
      url: "https://pcv.test/closures",
      slug: "closures",
      topic: "javascript",
    });

    const result = await def.run(
      { slides: [], slidesText: "deck text", create: "1" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.created).toBe(1);
    expect(result.outputs.missing).toBe(1);
    expect(result.outputs.hasCreated).toBe("1");
    expect(result.outputs.links).toContain("[closures](https://pcv.test/closures) (new)");
    expect(result.outputs.report).toContain("closures: created at https://pcv.test/closures");
  });

  it("not found + create disabled: the creator is never called, exact 'MISSING (creation disabled)' report line", async () => {
    vi.mocked(extractDeckConceptsAction).mockResolvedValue({
      concepts: [{ concept: "closures", evidence: "e1" }],
    });
    vi.mocked(findVisualizerConceptAction).mockResolvedValueOnce({ found: false });

    const result = await def.run(
      { slides: [], slidesText: "deck text", create: "0" },
      testHelpers(),
      () => {}
    );

    expect(createVisualizerConceptAction).not.toHaveBeenCalled();
    expect(result.outputs.report).toBe("closures: MISSING (creation disabled)");
    expect(result.outputs.missing).toBe(1);
    expect(result.outputs.created).toBe(0);
  });

  // The documented default ("On by default") - both an unbound input (no
  // "create" key at all) and a bound-but-blank value must mean ON. Only an
  // explicit value other than "1" turns creation off.
  it("create unset and create blank both mean ON - the creator is called in both cases", async () => {
    vi.mocked(extractDeckConceptsAction).mockResolvedValue({
      concepts: [{ concept: "closures", evidence: "e1" }],
    });
    vi.mocked(findVisualizerConceptAction).mockResolvedValue({ found: false });
    vi.mocked(createVisualizerConceptAction).mockResolvedValue({
      url: "https://pcv.test/closures",
      slug: "closures",
      topic: "javascript",
    });

    await def.run({ slides: [], slidesText: "deck text" }, testHelpers(), () => {}); // create unset
    expect(createVisualizerConceptAction).toHaveBeenCalledTimes(1);

    vi.mocked(createVisualizerConceptAction).mockClear();
    await def.run({ slides: [], slidesText: "deck text", create: "" }, testHelpers(), () => {}); // create blank
    expect(createVisualizerConceptAction).toHaveBeenCalledTimes(1);
  });

  it("creation failure: the report line is verbatim 'creation failed - <error>', created 0, missing 1", async () => {
    vi.mocked(extractDeckConceptsAction).mockResolvedValue({
      concepts: [{ concept: "closures", evidence: "e1" }],
    });
    vi.mocked(findVisualizerConceptAction).mockResolvedValueOnce({ found: false });
    vi.mocked(createVisualizerConceptAction).mockResolvedValueOnce({ error: "Could not generate the component." });

    const result = await def.run(
      { slides: [], slidesText: "deck text", create: "1" },
      testHelpers(),
      () => {}
    );

    expect(result.outputs.report).toBe("closures: creation failed - Could not generate the component.");
    expect(result.outputs.created).toBe(0);
    expect(result.outputs.missing).toBe(1);
  });

  it("a finder error on the middle concept does not abort the rest", async () => {
    vi.mocked(extractDeckConceptsAction).mockResolvedValue({
      concepts: [
        { concept: "first", evidence: "e1" },
        { concept: "second", evidence: "e2" },
        { concept: "third", evidence: "e3" },
      ],
    });
    vi.mocked(findVisualizerConceptAction)
      .mockResolvedValueOnce({ found: true, url: "https://pcv.test/first", topic: "t", slug: "first", label: "First" })
      .mockResolvedValueOnce({ error: "network error" })
      .mockResolvedValueOnce({ found: true, url: "https://pcv.test/third", topic: "t", slug: "third", label: "Third" });

    const result = await def.run({ slides: [], slidesText: "deck text" }, testHelpers(), () => {});

    expect(result.outputs.report).toContain("first: found at https://pcv.test/first");
    expect(result.outputs.report).toContain("second: network error");
    expect(result.outputs.report).toContain("third: found at https://pcv.test/third");
  });

  it("a thrown exception on the middle concept is caught and does not abort the loop", async () => {
    vi.mocked(extractDeckConceptsAction).mockResolvedValue({
      concepts: [
        { concept: "first", evidence: "e1" },
        { concept: "second", evidence: "e2" },
        { concept: "third", evidence: "e3" },
      ],
    });
    vi.mocked(findVisualizerConceptAction)
      .mockResolvedValueOnce({ found: true, url: "https://pcv.test/first", topic: "t", slug: "first", label: "First" })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ found: true, url: "https://pcv.test/third", topic: "t", slug: "third", label: "Third" });

    const result = await def.run({ slides: [], slidesText: "deck text" }, testHelpers(), () => {});

    expect(result.outputs.report).toContain("first: found at https://pcv.test/first");
    expect(result.outputs.report).toContain("second: boom");
    expect(result.outputs.report).toContain("third: found at https://pcv.test/third");
  });

  it("the creator's context carries the concept's evidence and the course name when a tile is selected", async () => {
    const tile = baseCourse({ id: "course-1", name: "Intro to Python", courseCode: "CS-101" });
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [tile] });
    vi.mocked(extractDeckConceptsAction).mockResolvedValue({
      concepts: [{ concept: "closures", evidence: "Slide 4: Closures" }],
    });
    vi.mocked(findVisualizerConceptAction).mockResolvedValueOnce({ found: false });
    vi.mocked(createVisualizerConceptAction).mockResolvedValueOnce({
      url: "https://pcv.test/closures",
      slug: "closures",
      topic: "javascript",
    });

    await def.run(
      { slides: [], slidesText: "deck text", create: "1", hubCourse: "course-1" },
      testHelpers(),
      () => {}
    );

    expect(createVisualizerConceptAction).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(createVisualizerConceptAction).mock.calls[0];
    expect(callArgs[0]).toBe("closures");
    expect(callArgs[1]).toBe("Slide 4: Closures - Course: Intro to Python");
  });

  it("saves the coverage report to the library with a .md name including 'Visualizer Coverage'", async () => {
    vi.mocked(extractDeckConceptsAction).mockResolvedValue({
      concepts: [{ concept: "closures", evidence: "e1" }],
    });
    vi.mocked(findVisualizerConceptAction).mockResolvedValueOnce({
      found: true,
      url: "https://pcv.test/closures",
      topic: "t",
      slug: "closures",
      label: "Closures",
    });

    await def.run({ slides: [], slidesText: "deck text" }, testHelpers(), () => {});

    expect(saveLibraryFileAction).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(saveLibraryFileAction).mock.calls[0][0];
    expect(arg.name.endsWith(".md")).toBe(true);
    expect(arg.name).toContain("Visualizer Coverage");
    expect(arg.fileExt).toBe("md");
  });

  it("a failing library save degrades to a note instead of throwing the step", async () => {
    vi.mocked(extractDeckConceptsAction).mockResolvedValue({
      concepts: [{ concept: "closures", evidence: "e1" }],
    });
    vi.mocked(findVisualizerConceptAction).mockResolvedValueOnce({
      found: true,
      url: "https://pcv.test/closures",
      topic: "t",
      slug: "closures",
      label: "Closures",
    });
    vi.mocked(saveLibraryFileAction).mockResolvedValueOnce({ error: "quota exceeded" });

    const result = await def.run({ slides: [], slidesText: "deck text" }, testHelpers(), () => {});

    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("library save skipped: quota exceeded"))).toBe(true);
    }
  });

  it("summary is a list summarizing the per-concept report lines", async () => {
    vi.mocked(extractDeckConceptsAction).mockResolvedValue({
      concepts: [
        { concept: "first", evidence: "e1" },
        { concept: "second", evidence: "e2" },
      ],
    });
    vi.mocked(findVisualizerConceptAction)
      .mockResolvedValueOnce({ found: true, url: "https://pcv.test/first", topic: "t", slug: "first", label: "First" })
      .mockResolvedValueOnce({ found: false });

    const result = await def.run(
      { slides: [], slidesText: "deck text", create: "0" },
      testHelpers(),
      () => {}
    );

    expect(result.summary.kind).toBe("list");
    if (result.summary.kind !== "list") return;
    expect(result.summary.items).toContain("first: found at https://pcv.test/first");
    expect(result.summary.items).toContain("second: MISSING (creation disabled)");
  });
});
