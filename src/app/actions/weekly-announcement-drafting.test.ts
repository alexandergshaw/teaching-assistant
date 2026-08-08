// Unit coverage for draftModuleAnnouncementsAction - the ONE server action
// that gathers each week's Canvas module content and drafts an announcement
// from it (docs/weekly-announcement-module-content-acceptance-criteria.md
// AC2 items 7/10/11/11a, AC3 item 12, AC7 item 30).
//
// Both I/O boundaries are mocked (the content gatherer and the LLM drafting
// action); the REAL draftWeeklyAnnouncements orchestration runs, so this file
// exercises the true wiring between gathering, drafting and the per-week
// WeeklyAnnouncementDraft the scheduling action consumes.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/canvas-modules/module-content", () => ({
  fetchModuleContentForWeeks: vi.fn(),
}));

vi.mock("./messaging", () => ({
  draftAnnouncementAction: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { fetchModuleContentForWeeks, type WeekModuleContent } from "@/lib/canvas-modules/module-content";
import { draftAnnouncementAction } from "./messaging";
import { draftModuleAnnouncementsAction } from "./weekly-announcement-drafting";

const OWNER = { id: "owner-1", email: "owner@example.com" };
const COURSE_URL = "https://canvas.example.edu/courses/123";

function weekContent(overrides: Partial<WeekModuleContent> & { week: number }): WeekModuleContent {
  return {
    moduleName: `Module 0${overrides.week}`,
    materials: `Page: Week ${overrides.week} notes`,
    matchedBy: "name",
    truncated: false,
    notes: [],
    ...overrides,
  };
}

const contentFor = (...weeks: WeekModuleContent[]) => new Map(weeks.map((w) => [w.week, w]));

beforeEach(() => {
  vi.mocked(requireOwner).mockReset().mockResolvedValue(OWNER as never);
  vi.mocked(fetchModuleContentForWeeks)
    .mockReset()
    .mockResolvedValue(contentFor(weekContent({ week: 1 }), weekContent({ week: 2 })));
  vi.mocked(draftAnnouncementAction)
    .mockReset()
    .mockImplementation(async (instruction: string) => ({
      title: "A drafted title",
      message: `Drafted from: ${instruction.slice(0, 24)}`,
    }));
});

describe("draftModuleAnnouncementsAction (AC2 item 7)", () => {
  it("returns exactly one entry per requested week, in the order asked for", async () => {
    const r = await draftModuleAnnouncementsAction(COURSE_URL, [1, 2], 15, "MCC");
    if ("error" in r) throw new Error(r.error);

    expect(r.drafts.map((d) => d.week)).toEqual([1, 2]);
    expect(r.drafts[0].message).toContain("Drafted from:");
    expect(r.drafts[0].note).toContain("Module 01");
  });

  it("grounds each week's instruction in THAT week's materials, and folds in the extra notes", async () => {
    await draftModuleAnnouncementsAction(COURSE_URL, [1, 2], 15, "MCC", {
      courseName: "CS 101",
      extraNotes: "Advising week.",
    });

    const instructions = vi.mocked(draftAnnouncementAction).mock.calls.map((c) => String(c[0]));
    const week2 = instructions.find((i) => i.includes("Week 2"))!;
    expect(week2).toContain("Page: Week 2 notes");
    expect(week2).toContain("CS 101");
    expect(week2).toContain("Advising week.");
    expect(week2).not.toContain("Page: Week 1 notes");
  });

  it("is owner-gated, and gathers nothing when the gate rejects", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new Error("Not signed in."));

    const r = await draftModuleAnnouncementsAction(COURSE_URL, [1], 15, "MCC");

    expect("error" in r).toBe(true);
    expect(fetchModuleContentForWeeks).not.toHaveBeenCalled();
  });
});

describe("what each week falls back to (AC3 item 12, AC7 item 30)", () => {
  it("asks for no draft at all for a week with no module content, and says so", async () => {
    vi.mocked(fetchModuleContentForWeeks).mockResolvedValue(
      contentFor(weekContent({ week: 1, moduleName: null, materials: "", matchedBy: "none" }))
    );

    const r = await draftModuleAnnouncementsAction(COURSE_URL, [1], 15, "MCC");
    if ("error" in r) throw new Error(r.error);

    expect(draftAnnouncementAction).not.toHaveBeenCalled();
    expect(r.drafts[0]).toMatchObject({ week: 1, message: "" });
    expect(r.drafts[0].note).toMatch(/no module content/i);
  });

  it("carries the real GATHERING error into the note, instead of calling it 'no module content'", async () => {
    // fetchModuleContentForWeeks records why a week came back empty - a stale
    // token, an unreachable Canvas, an unreadable page. If that never reaches
    // the report, a broken connection is indistinguishable from an empty
    // module, and the instructor is told the wrong thing to go and fix.
    vi.mocked(fetchModuleContentForWeeks).mockResolvedValue(
      contentFor(
        weekContent({
          week: 1,
          moduleName: null,
          materials: "",
          matchedBy: "none",
          notes: ["Canvas rejected the request: invalid access token"],
        })
      )
    );

    const r = await draftModuleAnnouncementsAction(COURSE_URL, [1], 15, "MCC");
    if ("error" in r) throw new Error(r.error);

    expect(r.drafts[0].note).toContain("invalid access token");
  });

  it("carries the real drafting error into the note when a draft fails", async () => {
    vi.mocked(draftAnnouncementAction).mockResolvedValue({ error: "Draft failed: HTTP 500" } as never);

    const r = await draftModuleAnnouncementsAction(COURSE_URL, [1], 15, "MCC");
    if ("error" in r) throw new Error(r.error);

    expect(r.drafts[0].message).toBe("");
    expect(r.drafts[0].note).toContain("HTTP 500");
  });

  it("does NOT claim a week was drafted when the model returned an empty announcement", async () => {
    // A successful call that yields an empty body still ends up posting the
    // message template downstream, so a note reading "drafted from module X"
    // would state the opposite of what actually got published.
    vi.mocked(draftAnnouncementAction).mockResolvedValue({ title: "A title", message: "   " } as never);

    const r = await draftModuleAnnouncementsAction(COURSE_URL, [1], 15, "MCC");
    if ("error" in r) throw new Error(r.error);

    expect(r.drafts[0].message?.trim()).toBe("");
    expect(r.drafts[0].note).not.toMatch(/^drafted from module/i);
    expect(r.drafts[0].note).toMatch(/empty|used the message template/i);
  });

  it("records a positional match and a truncation in the note, so the report can surface both", async () => {
    vi.mocked(fetchModuleContentForWeeks).mockResolvedValue(
      contentFor(weekContent({ week: 1, matchedBy: "position", truncated: true }))
    );

    const r = await draftModuleAnnouncementsAction(COURSE_URL, [1], 15, "MCC");
    if ("error" in r) throw new Error(r.error);

    expect(r.drafts[0].note).toContain("position");
    expect(r.drafts[0].note).toMatch(/truncat/i);
  });

  it("marks the weeks it could not reach inside its budget as deferred, not failed (AC2 item 11a)", async () => {
    vi.mocked(fetchModuleContentForWeeks).mockResolvedValue(
      contentFor(weekContent({ week: 1 }), weekContent({ week: 2 }))
    );
    // A budget of zero is spent before the first target is claimed.
    const r = await draftModuleAnnouncementsAction(COURSE_URL, [1, 2], 15, "MCC", { budgetMs: 0 });
    if ("error" in r) throw new Error(r.error);

    expect(draftAnnouncementAction).not.toHaveBeenCalled();
    expect(r.drafts.every((d) => d.defer === true)).toBe(true);
    expect(r.drafts[0].message).toBeUndefined();
  });

  it("degrades every week to the template when gathering itself throws", async () => {
    vi.mocked(fetchModuleContentForWeeks).mockRejectedValue(new Error("Canvas is down"));

    const r = await draftModuleAnnouncementsAction(COURSE_URL, [1, 2], 15, "MCC");

    expect("error" in r).toBe(true);
  });
});
