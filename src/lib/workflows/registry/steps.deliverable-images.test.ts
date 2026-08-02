// fetch-deliverable-images: adds one Unsplash photo (plus a companion
// credits file) to EVERY generated deliverable file, queried from that
// specific deliverable's own content. The pure query/attribution/mapping
// logic is exercised directly in src/lib/unsplash.test.ts; this file
// exercises the step's own orchestration (AC0 missing-key passthrough,
// AC4/AC6 "only fetch for deliverables that actually exist", the same-query
// cache, the per-run request cap, the rate-limit short-circuit, and the
// files-chain passthrough pattern) through mocked actions.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import type { ScheduleWeekPlan } from "@/app/actions";

vi.mock("@/app/actions", () => ({
  unsplashConfiguredAction: vi.fn(),
  fetchUnsplashImageAction: vi.fn(),
}));

import { unsplashConfiguredAction, fetchUnsplashImageAction } from "@/app/actions";
import { deliverableImageSteps, MAX_UNSPLASH_REQUESTS_PER_RUN } from "./steps.deliverable-images";

const step = deliverableImageSteps.find((s) => s.type === "fetch-deliverable-images")!;

const mockConfigured = vi.mocked(unsplashConfiguredAction);
const mockFetchImage = vi.mocked(fetchUnsplashImageAction);

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

function objectivesFile(weekNumber: number, pageText: string): GeneratedCourseFile {
  return {
    name: `Week ${weekNumber} Objectives.docx`,
    blob: new Blob(["x"]),
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    weekNumber,
    sortOrder: 0.5,
    role: "objectives",
    pageText,
  };
}

function openerFile(weekNumber: number, pageText: string): GeneratedCourseFile {
  return {
    name: `Week ${weekNumber} Opener.docx`,
    blob: new Blob(["x"]),
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    weekNumber,
    sortOrder: 3,
    role: "opener",
    pageText,
  };
}

function slidesFile(weekNumber: number): GeneratedCourseFile {
  return {
    name: `Week ${weekNumber} Slides.pptx`,
    blob: new Blob(["x"]),
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    weekNumber,
    sortOrder: 1,
    role: "slides",
  };
}

function courseWideFile(): GeneratedCourseFile {
  return {
    // Carries pageText, matching a REAL course-wide supplement (e.g. a
    // generate-course-guides document) - this is deliberate: a course-wide
    // fixture with no pageText would let a later "no derivable query" guard
    // mask a broken weekNumber-0 exclusion instead of the exclusion itself
    // catching it.
    name: "Grading Rubric.docx",
    blob: new Blob(["x"]),
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    weekNumber: 0,
    sortOrder: 0,
    role: "supplement",
    pageText: "This document is course-wide and not tied to any single week's topic.",
  };
}

function samplePhotoResult(id = "photo-1", photographerName = "Jane Doe") {
  return {
    photo: {
      id,
      description: "",
      imageUrl: `https://images.unsplash.com/${id}`,
      photographerName,
      photographerProfileUrl: "https://unsplash.com/@janedoe?utm_source=teaching_assistant&utm_medium=referral",
      photoPageUrl: `https://unsplash.com/photos/${id}?utm_source=teaching_assistant&utm_medium=referral`,
      downloadLocation: `https://api.unsplash.com/photos/${id}/download`,
    },
    base64: Buffer.from([1, 2, 3]).toString("base64"),
    mimeType: "image/jpeg",
  };
}

beforeEach(() => {
  mockConfigured.mockReset();
  mockFetchImage.mockReset();
});

describe("fetch-deliverable-images", () => {
  it("AC0: passes files through UNCHANGED and never calls Unsplash when the key is not configured", async () => {
    mockConfigured.mockResolvedValue({ configured: false });
    const incoming = [objectivesFile(1, "Week 1 covers loops.")];

    const result = await step.run({ files: incoming, schedule: [] }, testHelpers(), () => {});

    expect(result.outputs.files).toBe(incoming); // same reference - untouched passthrough
    expect(result.outputs.imageCount).toBe(0);
    expect(result.summary).toEqual({
      kind: "text",
      text: "Skipped - Unsplash is not configured (set UNSPLASH_ACCESS_KEY) - the run continues without images.",
    });
    expect(mockFetchImage).not.toHaveBeenCalled();
  });

  it("skips cleanly with no per-week deliverables (only course-wide files present)", async () => {
    mockConfigured.mockResolvedValue({ configured: true });
    const incoming = [courseWideFile()];

    const result = await step.run({ files: incoming, schedule: [] }, testHelpers(), () => {});

    expect(result.outputs.files).toBe(incoming);
    expect(result.outputs.imageCount).toBe(0);
    expect(mockFetchImage).not.toHaveBeenCalled();
  });

  it("AC1/AC4/AC5: adds an image + companion credits file for a deliverable, in its own week, sorted immediately before it, queried from its OWN content", async () => {
    mockConfigured.mockResolvedValue({ configured: true });
    mockFetchImage.mockResolvedValue(samplePhotoResult("photo-1"));

    const incoming = [objectivesFile(1, "Recursion and stack frames explained simply.")];
    const schedule: ScheduleWeekPlan[] = [
      { week: 1, topic: "Recursion", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    ];

    const result = await step.run({ files: incoming, schedule }, testHelpers(), () => {});

    // The deliverable's OWN content wins over the week's shared topic (AC1)
    // - proven here by the query being the pageText sentence, not "Recursion".
    expect(mockFetchImage).toHaveBeenCalledWith("Recursion and stack frames explained simply.");
    const files = result.outputs.files as GeneratedCourseFile[];
    expect(files).toHaveLength(3); // 1 incoming + image + credit
    const image = files.find((f) => f.role === "image" && f.mimeType === "image/jpeg")!;
    expect(image.weekNumber).toBe(1);
    expect(image.sortOrder).toBeCloseTo(incoming[0].sortOrder - 0.02);
    expect(image.name).toContain("Objectives"); // named after its OWN deliverable
    const credit = files.find((f) => f.role === "image" && f.mimeType === "text/plain")!;
    expect(credit.weekNumber).toBe(1);
    expect(credit.sortOrder).toBeCloseTo(incoming[0].sortOrder - 0.01);
    const creditText = await credit.blob.text();
    expect(creditText).toContain("Jane Doe");
    expect(creditText).toContain("utm_source=teaching_assistant");
    expect(result.outputs.imageCount).toBe(1);
  });

  it("AC1: two deliverables in the SAME week derive DIFFERENT queries from their own content, not the shared week topic", async () => {
    mockConfigured.mockResolvedValue({ configured: true });
    mockFetchImage.mockResolvedValue(samplePhotoResult());

    // objectivesFile carries its own pageText; slidesFile carries none, so it
    // falls back to its own file name - still distinct from the objectives
    // text, and from the shared week topic either way.
    const incoming = [objectivesFile(1, "This week covers recursion and stack frames in depth."), slidesFile(1)];
    const schedule: ScheduleWeekPlan[] = [
      { week: 1, topic: "Recursion", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    ];

    await step.run({ files: incoming, schedule }, testHelpers(), () => {});

    expect(mockFetchImage).toHaveBeenCalledTimes(2);
    const calledQueries = mockFetchImage.mock.calls.map((c) => c[0]);
    expect(calledQueries).toContain("This week covers recursion and stack frames in depth.");
    expect(calledQueries).toContain("Week 1 Slides");
    expect(new Set(calledQueries).size).toBe(2); // genuinely different - neither call used the shared topic
  });

  it("AC2: two deliverables that derive the SAME query fetch once and BOTH receive the resulting image", async () => {
    mockConfigured.mockResolvedValue({ configured: true });
    mockFetchImage.mockResolvedValue(samplePhotoResult("photo-shared"));

    const sharedText = "Recursion is a technique where a function calls itself.";
    const incoming = [objectivesFile(1, sharedText), openerFile(1, sharedText)];

    const result = await step.run({ files: incoming, schedule: [] }, testHelpers(), () => {});

    // ONE network call for the shared query, not two - AC2's "do not waste
    // requests on identical queries" and its terms-correct reading that the
    // download_location trigger (inside fetchUnsplashImageAction) therefore
    // fires once per photo actually used, not once per deliverable.
    expect(mockFetchImage).toHaveBeenCalledTimes(1);
    expect(mockFetchImage).toHaveBeenCalledWith(sharedText);
    const files = result.outputs.files as GeneratedCourseFile[];
    const images = files.filter((f) => f.role === "image" && f.mimeType === "image/jpeg");
    expect(images).toHaveLength(2); // both deliverables still got their OWN image file
    expect(images[0].weekNumber).toBe(1);
    expect(images[1].weekNumber).toBe(1);
    expect(result.outputs.imageCount).toBe(2);
  });

  it("AC4/AC6: only fetches images for deliverables that actually exist (course-wide files are excluded, a deselected family produces none)", async () => {
    mockConfigured.mockResolvedValue({ configured: true });
    mockFetchImage.mockResolvedValue(samplePhotoResult());

    // Only week 2 has a deliverable - as if every OTHER output family was
    // deselected for week 1, and week 3 was never reached. A course-wide
    // (weekNumber 0) file is also present, proving that one is excluded too.
    const incoming = [courseWideFile(), objectivesFile(2, "Week 2 covers hashing.")];
    const schedule: ScheduleWeekPlan[] = [
      { week: 1, topic: "Arrays", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
      { week: 2, topic: "Hashing", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
      { week: 3, topic: "Graphs", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    ];

    await step.run({ files: incoming, schedule }, testHelpers(), () => {});

    expect(mockFetchImage).toHaveBeenCalledTimes(1);
    expect(mockFetchImage).toHaveBeenCalledWith("Week 2 covers hashing.");
  });

  it("falls back to the week's topic when a deliverable's own file name cleans to nothing usable and it carries no pageText", async () => {
    mockConfigured.mockResolvedValue({ configured: true });
    mockFetchImage.mockResolvedValue(samplePhotoResult());

    // A pathological name (only characters cleanQueryText strips) with no
    // pageText - the only realistic way to make the deliverable's own tier
    // resolve to "" and force the fallback to the week topic.
    const incoming: GeneratedCourseFile[] = [
      {
        name: "***.pptx",
        blob: new Blob(["x"]),
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        weekNumber: 1,
        sortOrder: 1,
        role: "slides",
      },
    ];
    const schedule: ScheduleWeekPlan[] = [
      { week: 1, topic: "Recursion", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    ];

    await step.run({ files: incoming, schedule }, testHelpers(), () => {});

    expect(mockFetchImage).toHaveBeenCalledWith("Recursion");
  });

  it("AC3: a defensive per-run request cap stops NEW queries once reached, without touching earlier results", async () => {
    mockConfigured.mockResolvedValue({ configured: true });
    mockFetchImage.mockResolvedValue(samplePhotoResult());

    // One deliverable per week, each with distinct pageText (so each derives
    // a distinct query) - one more than the cap, so exactly the LAST one
    // must be skipped for having exceeded it, never attempted.
    const incoming: GeneratedCourseFile[] = [];
    for (let week = 1; week <= MAX_UNSPLASH_REQUESTS_PER_RUN + 1; week++) {
      incoming.push(objectivesFile(week, `This week's own unique subject number ${week} content.`));
    }

    const result = await step.run({ files: incoming, schedule: [] }, testHelpers(), () => {});

    expect(mockFetchImage).toHaveBeenCalledTimes(MAX_UNSPLASH_REQUESTS_PER_RUN);
    expect(result.outputs.imageCount).toBe(MAX_UNSPLASH_REQUESTS_PER_RUN);
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(
        result.summary.items.some(
          (line) => line.includes("1 deliverable(s) got no image") && line.includes("request cap reached")
        )
      ).toBe(true);
    }
  });

  it("AC3: stops calling Unsplash for the rest of the run after a rate-limited response, and reports it once (not once per deliverable)", async () => {
    mockConfigured.mockResolvedValue({ configured: true });
    mockFetchImage.mockResolvedValue({ error: "Unsplash search failed (HTTP 403).", rateLimited: true });

    const incoming = [objectivesFile(1, "Topic one text."), objectivesFile(2, "Topic two text.")];
    const schedule: ScheduleWeekPlan[] = [
      { week: 1, topic: "Topic One", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
      { week: 2, topic: "Topic Two", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    ];

    const result = await step.run({ files: incoming, schedule }, testHelpers(), () => {});

    // Only ONE call was made even though two deliverables needed an image -
    // the second, rate-limited skip never issues a second request.
    expect(mockFetchImage).toHaveBeenCalledTimes(1);
    expect(result.outputs.imageCount).toBe(0);
    expect(result.summary.kind).toBe("text");
    if (result.summary.kind === "text") {
      // One aggregate line mentioning both, not two separate lines.
      expect(result.summary.text).toContain("2 deliverable(s) got no image");
      expect(result.summary.text).toContain("rate limited");
    }
  });

  it("AC3: a cached (already-fetched) query still resolves normally even after rate-limiting has kicked in", async () => {
    mockConfigured.mockResolvedValue({ configured: true });
    const sharedText = "Recursion is a technique where a function calls itself.";
    mockFetchImage
      .mockResolvedValueOnce(samplePhotoResult("photo-shared")) // week 1's opener: succeeds, populates the cache
      .mockResolvedValueOnce({ error: "Unsplash search failed (HTTP 429).", rateLimited: true }); // week 2's distinct query: rate-limited

    const incoming = [
      openerFile(1, sharedText),
      objectivesFile(2, "A completely different week 2 subject."),
      // Week 3's deliverable derives the SAME query as week 1's - a cache
      // hit, so it must still succeed even though rate-limiting is now on.
      openerFile(3, sharedText),
    ];

    const result = await step.run({ files: incoming, schedule: [] }, testHelpers(), () => {});

    expect(mockFetchImage).toHaveBeenCalledTimes(2); // never a third call for the cache hit
    const files = result.outputs.files as GeneratedCourseFile[];
    expect(files.some((f) => f.weekNumber === 1 && f.role === "image")).toBe(true);
    expect(files.some((f) => f.weekNumber === 2 && f.role === "image")).toBe(false);
    expect(files.some((f) => f.weekNumber === 3 && f.role === "image")).toBe(true);
    expect(result.outputs.imageCount).toBe(2);
  });

  it("AC3: a deliverable with no usable result (empty search / malformed / network error) gets no image and the run continues to the next deliverable", async () => {
    mockConfigured.mockResolvedValue({ configured: true });
    mockFetchImage
      .mockResolvedValueOnce({ skipped: true, reason: "no_results" })
      .mockResolvedValueOnce(samplePhotoResult("photo-2"));

    const incoming = [objectivesFile(1, "Topic one text."), objectivesFile(2, "Topic two text.")];

    const result = await step.run({ files: incoming, schedule: [] }, testHelpers(), () => {});

    expect(mockFetchImage).toHaveBeenCalledTimes(2);
    expect(result.outputs.imageCount).toBe(1);
    const files = result.outputs.files as GeneratedCourseFile[];
    expect(files.some((f) => f.weekNumber === 1 && f.role === "image")).toBe(false);
    expect(files.some((f) => f.weekNumber === 2 && f.role === "image")).toBe(true);
  });

  it("AC5: each image's credit file names ITS OWN photographer - N images never collapse into crediting only the first photographer", async () => {
    mockConfigured.mockResolvedValue({ configured: true });
    mockFetchImage
      .mockResolvedValueOnce(samplePhotoResult("photo-1", "Jane Doe"))
      .mockResolvedValueOnce(samplePhotoResult("photo-2", "John Smith"));

    const incoming = [
      objectivesFile(1, "Recursion and stack frames explained simply."),
      objectivesFile(2, "Hashing and collision resolution explained simply."),
    ];

    const result = await step.run({ files: incoming, schedule: [] }, testHelpers(), () => {});

    const files = result.outputs.files as GeneratedCourseFile[];
    const credits = files.filter((f) => f.role === "image" && f.mimeType === "text/plain");
    expect(credits).toHaveLength(2);
    const texts = await Promise.all(credits.map((c) => c.blob.text()));
    expect(texts.some((t) => t.includes("Jane Doe"))).toBe(true);
    expect(texts.some((t) => t.includes("John Smith"))).toBe(true);
  });
});
