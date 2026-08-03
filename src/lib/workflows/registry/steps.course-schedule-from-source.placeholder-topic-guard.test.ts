// Split out of steps.course-schedule-from-source.test.ts (which had grown to
// 1304 lines, over this repo's 1000-line-per-file cap) - covers the
// cross-cutting placeholder-topic guard (real-run defect: invented subjects
// from bare LMS module names - course "INFO 1020 - Computer Science
// Principles", source tile-export; see steps.course-schedule-from-source.ts's
// own comment on guardScheduleAgainstPlaceholders for the full writeup).
// Exercised on the course-cartridge branch (rather than tile-export) because
// it needs no helpers.loadCourseExport plumbing to reach the SAME
// courseStructureToSchedule normalizer tile-export itself delegates to - the
// guard lives in finalize(), the one choke point every branch (including
// tile-export) funnels through. See
// steps.course-schedule-from-source.fixtures.ts for the shared
// step/testHelpers/scheduleSummary/cartridgeFile helpers - cartridgeFile in
// particular is shared with the source-course-cartridge split file, which
// exercises this SAME source.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  generateSchedulePlanAction: vi.fn(),
  generateSchedulePlanFromRepoAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  extractSyllabusTextAction: vi.fn(),
}));

vi.mock("@/lib/cartridge-import", () => ({
  parseCartridgeBlob: vi.fn(),
}));

import { parseCartridgeBlob } from "@/lib/cartridge-import";
import { step, testHelpers, scheduleSummary, cartridgeFile } from "./steps.course-schedule-from-source.fixtures";

describe("placeholder-topic guard (real-run defect: invented subjects from bare LMS module names)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blanks a placeholder-topic week whose summary is only a file manifest naming this run's own files - the exact real-run week 8 shape - and logs a note, without failing the run", async () => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: "INFO 1020 - Computer Science Principles",
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [
        {
          name: "Module 08: Module 08",
          position: 8,
          items: [
            { title: "INFO 1020 - Significance of the Material - Module 08.docx", type: "" },
            { title: "INFO 1020 - Lecture Slides - Week 8.pptx", type: "" },
            { title: "Week 8 Announcement - Module 08.docx", type: "" },
            { title: "Week 08 Deliverable", type: "" },
          ],
        },
      ],
      rubrics: [],
      hasCourseSettings: true,
    });

    const result = await step.run(
      { source: "course-cartridge", cartridge: [cartridgeFile()] },
      testHelpers(),
      () => {}
    );

    const summary = scheduleSummary(result);
    expect(summary.schedule).toHaveLength(1);
    // Never removed from the schedule and never aborts the run - only the
    // topic/summary are cleared, the same "no topic" shape steps.content-
    // lectures.ts and schedule-resolution.ts's withTopicOnly already treat
    // as "skip this week," not "fail the run."
    expect(summary.schedule[0]).toMatchObject({ week: 1, topic: "", summary: "" });
    expect(summary.notes).toMatch(/Week 1/);
    expect(summary.notes).toMatch(/Module 08: Module 08/);
    expect(summary.notes).toMatch(/Lecture Slides/);
  });

  it("blanks a placeholder-topic week whose summary is only a deliverable manifest - the exact real-run week 2 shape", async () => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: "INFO 1020 - Computer Science Principles",
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [{ name: "Module 02: Module 02", position: 2, items: [{ title: "Week 02 Deliverable", type: "" }] }],
      rubrics: [],
      hasCourseSettings: true,
    });

    const result = await step.run(
      { source: "course-cartridge", cartridge: [cartridgeFile()] },
      testHelpers(),
      () => {}
    );

    const summary = scheduleSummary(result);
    expect(summary.schedule[0]).toMatchObject({ topic: "", summary: "" });
    expect(summary.notes).toMatch(/Week 1/);
  });

  it("does NOT touch a placeholder-topic week whose own summary carries real content - the design's 'placeholder topic WITH material' recoverable case", async () => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: "INFO 1020",
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [
        {
          name: "Module 08: Module 08",
          position: 8,
          items: [{ title: "Reading: Chapter 8 - Inheritance and Polymorphism", type: "" }],
        },
      ],
      rubrics: [],
      hasCourseSettings: true,
    });

    const result = await step.run(
      { source: "course-cartridge", cartridge: [cartridgeFile()] },
      testHelpers(),
      () => {}
    );

    const summary = scheduleSummary(result);
    expect(summary.schedule[0]).toMatchObject({
      topic: "Module 08: Module 08",
      summary: "Covers: Reading: Chapter 8 - Inheritance and Polymorphism",
    });
    expect(summary.notes).toBeUndefined();
  });

  it("does NOT touch a placeholder-topic week when the shared sourceMaterial field is non-blank - recoverable via the global field", async () => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: "INFO 1020",
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [{ name: "Module 08: Module 08", position: 8, items: [{ title: "Week 08 Deliverable", type: "" }] }],
      rubrics: [],
      hasCourseSettings: true,
    });

    const result = await step.run(
      {
        source: "course-cartridge",
        cartridge: [cartridgeFile()],
        sourceMaterial: "Textbook: Introduction to Computer Science, Ch. 1-16",
      },
      testHelpers(),
      () => {}
    );

    const summary = scheduleSummary(result);
    expect(summary.schedule[0]).toMatchObject({ topic: "Module 08: Module 08" });
    expect(summary.notes).toBeUndefined();
  });

  it("does NOT touch a genuine topic even when its summary happens to be a pure file manifest - the guard only fires on a placeholder TOPIC", async () => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: "INFO 1020",
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [
        {
          name: "Inheritance and Polymorphism",
          position: 8,
          items: [{ title: "Week 08 Deliverable", type: "" }],
        },
      ],
      rubrics: [],
      hasCourseSettings: true,
    });

    const result = await step.run(
      { source: "course-cartridge", cartridge: [cartridgeFile()] },
      testHelpers(),
      () => {}
    );

    const summary = scheduleSummary(result);
    expect(summary.schedule[0]).toMatchObject({
      topic: "Inheritance and Polymorphism",
      summary: "Covers: Week 08 Deliverable",
    });
    expect(summary.notes).toBeUndefined();
  });

  it("refuses only the unusable week(s) - a fail-forward run with one bad module and one good module still returns both weeks, and never aborts", async () => {
    vi.mocked(parseCartridgeBlob).mockResolvedValue({
      title: "INFO 1020",
      courseCode: null,
      startAt: null,
      syllabusHtml: null,
      modules: [
        { name: "Module 07: Module 07", position: 7, items: [{ title: "Week 07 Deliverable", type: "" }] },
        {
          name: "Module 08: Inheritance and Polymorphism",
          position: 8,
          items: [{ title: "Lab: implement a subclass", type: "" }],
        },
      ],
      rubrics: [],
      hasCourseSettings: true,
    });

    const result = await step.run(
      { source: "course-cartridge", cartridge: [cartridgeFile()] },
      testHelpers(),
      () => {}
    );

    const summary = scheduleSummary(result);
    expect(summary.schedule).toHaveLength(2);
    expect(summary.schedule[0]).toMatchObject({ week: 1, topic: "", summary: "" });
    expect(summary.schedule[1]).toMatchObject({
      week: 2,
      topic: "Module 08: Inheritance and Polymorphism",
      summary: "Covers: Lab: implement a subclass",
    });
    // Exactly one week named in the note - the good week is never mentioned.
    expect(summary.notes).toMatch(/Week 1/);
    expect(summary.notes).not.toMatch(/Week 2/);
    // outputs.weeks still reports both weeks - a refused week is skipped
    // downstream by its blank topic, not removed from the schedule.
    expect(result.outputs.weeks).toBe(2);
  });
});
