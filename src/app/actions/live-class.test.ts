import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";
import { exportModuleValue } from "@/lib/workflows/module-value";
import type { Course } from "@/lib/supabase/courses";

// requireOwner (auth) and callLlm (network) are mocked so the action logic
// itself runs for real without needing a Supabase session or hitting Gemini -
// same pattern as current-events.test.ts.
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

// buildLiveSessionContextAction's own service-role client construction is
// stubbed out entirely - every test below controls the functions that
// actually DO something with "the client" (downloadCourseZipBlob,
// parseCartridgeBlob, listCourseHubAction), so the client object itself is
// never touched.
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({})),
}));

// Shared across BOTH mocks below: registry-helpers.sources.ts AND
// step-helpers-server.ts's buildServerMaterialLoaders each import
// listCourseHubAction from the "@/app/actions" barrel, while live-class.ts's
// own tile lookup imports it from "./course-hub-core" directly (see
// live-class.ts's import comment) - one shared mock keeps every call site
// seeing the same course list in a test. vi.mock calls are hoisted above
// everything else in the file, so these must be created via vi.hoisted() to
// be available when the factories below run.
const { mockListCourseHubAction, mockDownloadCourseZipBlob, mockParseCartridgeBlob } = vi.hoisted(() => ({
  mockListCourseHubAction: vi.fn(),
  mockDownloadCourseZipBlob: vi.fn(),
  mockParseCartridgeBlob: vi.fn(),
}));

// buildLiveSessionContextAction reuses gatherModuleMaterials
// (registry-helpers.sources.ts), which imports the "@/app/actions" barrel for
// its own Canvas/repo/zip gatherers, and buildServerMaterialLoaders
// (step-helpers-server.ts), which imports listCourseHubAction from the same
// barrel. Mocking the barrel down to the handful of functions actually used
// keeps these tests from touching real Supabase/Canvas clients - same
// pattern as registry-helpers.sources.test.ts.
vi.mock("@/app/actions", () => ({
  listCourseContentAction: vi.fn(),
  getPageAction: vi.fn(),
  previewFileAction: vi.fn(),
  fetchCanvasMetaAction: vi.fn(),
  ingestRepoAction: vi.fn(),
  extractZipMaterialsTextAction: vi.fn(),
  deriveTocFromSource: vi.fn(),
  listCourseHubAction: mockListCourseHubAction,
}));

// buildLiveSessionContextAction's own course-tile lookup goes straight to
// course-hub-core.ts (see live-class.ts's import comment), not the barrel -
// same shared mock so both lookups agree in a test.
vi.mock("./course-hub-core", () => ({
  listCourseHubAction: mockListCourseHubAction,
}));

// step-helpers-server.ts's buildServerMaterialLoaders reads course-export
// data through these two - mocked so the tests below control exactly what
// "export data" comes back without touching real Supabase Storage.
vi.mock("@/lib/course-files", () => ({
  downloadCourseZipBlob: mockDownloadCourseZipBlob,
}));
vi.mock("@/lib/cartridge-import", () => ({
  parseCartridgeBlob: mockParseCartridgeBlob,
}));

import { callLlm } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { listCourseHubAction } from "./course-hub-core";
import { transcribeLiveAudioAction, answerLiveQuestionAction, buildLiveSessionContextAction } from "./live-class";

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
    topics: "Recursion, base cases, stack frames",
    csvName: null,
    csvData: null,
    rubricName: null,
    rubricData: null,
    startDate: null,
    description: "Intro to recursion",
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

function cartridgeExport(moduleName: string, items: Array<{ type: string; title: string }>) {
  return {
    title: null,
    courseCode: null,
    startAt: null,
    syllabusHtml: null,
    modules: [{ name: moduleName, position: 1, items }],
    rubrics: [],
    hasCourseSettings: true,
  };
}

type LlmCallArgs = Parameters<typeof callLlm>[0];

function textOf(part: LlmCallArgs["contents"][number]["parts"][number]): string {
  return "text" in part ? part.text : "";
}

function promptOf(req: LlmCallArgs): string {
  return textOf(req.contents[0].parts[0]);
}

const okResponse = (text: string) => ({ ok: true as const, text });
const failResponse = { ok: false as const, status: 500, body: "server error" };

describe("transcribeLiveAudioAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  });

  it("returns an error for an empty payload without calling the LLM", async () => {
    const result = await transcribeLiveAudioAction("");
    expect(result).toEqual({ error: expect.any(String) });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("returns an error for a whitespace-only payload without calling the LLM", async () => {
    const result = await transcribeLiveAudioAction("   ");
    expect("error" in result).toBe(true);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("returns an error naming the size limit for an oversized payload, without calling the LLM", async () => {
    // ~9.81M base64 chars decodes to just over 7MB - comfortably past the cap.
    const oversized = "A".repeat(10_000_000);
    const result = await transcribeLiveAudioAction(oversized);
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toContain("7");
    expect(result.error.toLowerCase()).toContain("large");
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("sends both a text part and an inlineData audio/wav part", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("Hello class."));
    const wavBase64 = "ZmFrZS13YXYtZGF0YQ==";

    await transcribeLiveAudioAction(wavBase64);

    expect(callLlm).toHaveBeenCalledTimes(1);
    const req = vi.mocked(callLlm).mock.calls[0][0];
    const parts = req.contents[0].parts;
    expect(parts).toHaveLength(2);
    expect("text" in parts[0]).toBe(true);
    expect(parts[1]).toEqual({ inlineData: { mimeType: "audio/wav", data: wavBase64 } });
    expect(req.generationConfig?.temperature).toBe(0);
  });

  it("trims the returned text", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("  Hello class, welcome back.  \n"));
    const result = await transcribeLiveAudioAction("ZmFrZQ==");
    expect(result).toEqual({ text: "Hello class, welcome back." });
  });

  it("normalizes a no-speech style response to an empty string", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("There is no intelligible speech in this audio."));
    const result = await transcribeLiveAudioAction("ZmFrZQ==");
    expect(result).toEqual({ text: "" });
  });

  it("includes hintTerms in the prompt when supplied, and leaves the base prompt unchanged when not", async () => {
    vi.mocked(callLlm).mockResolvedValue(okResponse("text"));

    await transcribeLiveAudioAction("ZmFrZQ==");
    const promptWithout = promptOf(vi.mocked(callLlm).mock.calls[0][0]);

    await transcribeLiveAudioAction("ZmFrZQ==", { hintTerms: "photosynthesis, mitochondria" });
    const promptWith = promptOf(vi.mocked(callLlm).mock.calls[1][0]);

    expect(promptWithout).not.toContain("photosynthesis");
    expect(promptWithout.toLowerCase()).not.toContain("spelling guidance");
    expect(promptWith).toContain("photosynthesis, mitochondria");
    expect(promptWith.toLowerCase()).toContain("spelling guidance");
    // The base instruction text is unchanged - the hint is purely additive.
    expect(promptWith.startsWith(promptWithout)).toBe(true);
  });

  it("returns an error instead of throwing when callLlm fails", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(failResponse);
    const result = await transcribeLiveAudioAction("ZmFrZQ==");
    expect("error" in result).toBe(true);
  });

  it("returns an error when requireOwner rejects", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized."));
    const result = await transcribeLiveAudioAction("ZmFrZQ==");
    expect(result).toEqual({ error: "Not authorized." });
    expect(callLlm).not.toHaveBeenCalled();
  });
});

describe("answerLiveQuestionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  });

  it("returns an error for an empty question without calling the LLM", async () => {
    const result = await answerLiveQuestionAction("   ", {});
    expect("error" in result).toBe(true);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("makes exactly one callLlm call per invocation", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("An answer.\nSOURCES: none"));
    await answerLiveQuestionAction("What is a hash map?", { materialsText: "hash maps are..." });
    expect(callLlm).toHaveBeenCalledTimes(1);
  });

  it("bounds maxOutputTokens for the default and for an oversized maxWords request", async () => {
    vi.mocked(callLlm).mockResolvedValue(okResponse("An answer.\nSOURCES: none"));

    await answerLiveQuestionAction("What is a hash map?", {});
    const defaultTokens = vi.mocked(callLlm).mock.calls[0][0].generationConfig?.maxOutputTokens ?? 0;
    expect(defaultTokens).toBeGreaterThanOrEqual(150);
    expect(defaultTokens).toBeLessThanOrEqual(700);

    await answerLiveQuestionAction("What is a hash map?", {}, { maxWords: 10_000 });
    const clampedTokens = vi.mocked(callLlm).mock.calls[1][0].generationConfig?.maxOutputTokens ?? 0;
    expect(clampedTokens).toBeLessThanOrEqual(700);
  });

  it("truncates materialsText (head) and deckText (head) to their caps", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("An answer.\nSOURCES: none"));

    await answerLiveQuestionAction("Explain recursion.", {
      materialsText: "M".repeat(20_000),
      deckText: "D".repeat(20_000),
    });

    const prompt = promptOf(vi.mocked(callLlm).mock.calls[0][0]);
    expect(prompt).toContain("M".repeat(6000));
    expect(prompt).not.toContain("M".repeat(6001));
    expect(prompt).toContain("D".repeat(4000));
    expect(prompt).not.toContain("D".repeat(4001));
  });

  it("truncates recentTranscript to its LAST 2000 characters", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("An answer.\nSOURCES: none"));

    const recentTranscript = "HEAD_MARKER_SHOULD_BE_DROPPED" + "T".repeat(3000);
    await answerLiveQuestionAction("Explain recursion.", { recentTranscript });

    const prompt = promptOf(vi.mocked(callLlm).mock.calls[0][0]);
    expect(prompt).not.toContain("HEAD_MARKER_SHOULD_BE_DROPPED");
    expect(prompt).toContain("T".repeat(2000));
  });

  it("the NOT_IN_MATERIAL sentinel sets grounded false and is stripped from the answer", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      okResponse(
        "NOT_IN_MATERIAL\nThe course material doesn't cover this. In general, caching speeds up repeated reads.\nSOURCES: none"
      )
    );

    const result = await answerLiveQuestionAction("What is memcached?", { materialsText: "unrelated material" });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.grounded).toBe(false);
    expect(result.answer).not.toContain("NOT_IN_MATERIAL");
    expect(result.answer).toContain("caching speeds up repeated reads");
  });

  it("absent context yields grounded false even with no sentinel", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("A normal answer.\nSOURCES: none"));
    const result = await answerLiveQuestionAction("What is a hash map?", {});
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.grounded).toBe(false);
  });

  it("grounded is true when context was supplied and no sentinel is present", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("A grounded answer.\nSOURCES: none"));
    const result = await answerLiveQuestionAction("What is a hash map?", { materialsText: "hash maps are..." });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.grounded).toBe(true);
  });

  it("parses a trailing sources line into the array and strips it from the answer", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      okResponse("Here is the answer.\nSOURCES: Slide 3: Recursion, Lecture Notes Week 2")
    );
    const result = await answerLiveQuestionAction("Explain recursion.", { materialsText: "recursion notes" });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.sources).toEqual(["Slide 3: Recursion", "Lecture Notes Week 2"]);
    expect(result.answer).toBe("Here is the answer.");
  });

  it("a malformed/missing sources line yields [] without failing the call", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("Here is an answer with no sources line at all."));
    const result = await answerLiveQuestionAction("Explain recursion.", { materialsText: "recursion notes" });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.sources).toEqual([]);
    expect(result.answer).toBe("Here is an answer with no sources line at all.");
  });

  it("returns an error instead of throwing when callLlm fails", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(failResponse);
    const result = await answerLiveQuestionAction("What is a hash map?", {});
    expect("error" in result).toBe(true);
  });

  it("returns an error when requireOwner rejects", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized."));
    const result = await answerLiveQuestionAction("What is a hash map?", {});
    expect(result).toEqual({ error: "Not authorized." });
    expect(callLlm).not.toHaveBeenCalled();
  });
});

describe("buildLiveSessionContextAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  });

  it("returns an error when requireOwner rejects", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized."));
    const result = await buildLiveSessionContextAction("course-1", "");
    expect(result).toEqual({ error: "Not authorized." });
    expect(listCourseHubAction).not.toHaveBeenCalled();
  });

  it("returns an error for a blank course id without calling listCourseHubAction", async () => {
    const result = await buildLiveSessionContextAction("   ", "");
    expect("error" in result).toBe(true);
    expect(listCourseHubAction).not.toHaveBeenCalled();
  });

  it("returns an error for an unknown course id rather than throwing", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValueOnce({ courses: [] });
    const result = await buildLiveSessionContextAction("does-not-exist", "");
    expect("error" in result).toBe(true);
  });

  it("invokes the export loader when the tile has export files, and surfaces materialsSource", async () => {
    const course = baseCourse({
      id: "course-1",
      canvasUrl: null,
      exportFiles: [{ name: "export.zip", path: "course-1/export.zip", size: 100, addedAt: "2024-01-01T00:00:00Z" }],
    });
    mockListCourseHubAction.mockResolvedValue({ courses: [course] });
    mockDownloadCourseZipBlob.mockResolvedValue(new Blob(["zip-bytes"]));
    mockParseCartridgeBlob.mockResolvedValue(
      cartridgeExport("Module 1", [{ type: "Page", title: "Intro to Recursion" }])
    );

    // exportModuleValue("Module 1") forces gatherModuleMaterials down the
    // course-export path regardless of canvasUrl - see gatherModuleMaterials's
    // picked.fromExport branch (registry-helpers.sources.ts).
    const result = await buildLiveSessionContextAction("course-1", exportModuleValue("Module 1"));

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(mockDownloadCourseZipBlob).toHaveBeenCalledTimes(1);
    expect(mockParseCartridgeBlob).toHaveBeenCalledTimes(1);
    expect(result.materialsSource).toContain("course export");
    expect(result.materialsText).toContain("Intro to Recursion");
  });

  it("a course with no export files still returns a usable context via the remaining sources", async () => {
    const course = baseCourse({ id: "course-1", canvasUrl: null, exportFiles: [] });
    mockListCourseHubAction.mockResolvedValue({ courses: [course] });

    const result = await buildLiveSessionContextAction("course-1", exportModuleValue("Module 1"));

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    // loadCourseExport returns null before ever touching storage (no export
    // files) - the source fails forward and the default policy degrades to
    // the tile's topics/description instead.
    expect(mockDownloadCourseZipBlob).not.toHaveBeenCalled();
    expect(result.materialsSource).toContain("topics/description");
    expect(result.materialsText).toContain("Recursion");
  });

  it("a loader that throws is caught and degrades rather than failing the action", async () => {
    const course = baseCourse({
      id: "course-1",
      canvasUrl: null,
      exportFiles: [{ name: "export.zip", path: "course-1/export.zip", size: 100, addedAt: "2024-01-01T00:00:00Z" }],
    });
    mockListCourseHubAction.mockResolvedValue({ courses: [course] });
    mockDownloadCourseZipBlob.mockRejectedValue(new Error("storage is down"));

    const result = await buildLiveSessionContextAction("course-1", exportModuleValue("Module 1"));

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.materialsSource).toContain("topics/description");
    expect(result.materialsText).toContain("Recursion");
  });
});
