// Unit coverage for draftPackageAnnouncementsAction - the package-source twin
// of draftModuleAnnouncementsAction
// (docs/weekly-announcement-package-io-acceptance-criteria.md AC1 items 7/8,
// AC6 item 39).
//
// draftModuleAnnouncementsAction's own test file (weekly-announcement-
// drafting.test.ts) mocks the CONTENT gatherer because that layer does real
// network I/O. packageModuleContentForWeeks (announcement-package-content.ts)
// does not - it is pure and synchronous - so it is deliberately left
// UNMOCKED here and exercised for real, with plain CartridgeModule fixtures.
// Only the two genuine I/O boundaries (the owner gate and the LLM drafting
// call) are mocked, matching the sibling file's approach of running the REAL
// draftWeeklyAnnouncements orchestration underneath.
//
// @/lib/canvas-modules/module-content is mocked purely defensively: this
// action never calls it, but weekly-announcement-drafting.ts imports it at
// module scope for draftModuleAnnouncementsAction's sake, and mocking it
// keeps this file from ever touching a real (stubbed-or-not) `fetch`.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CartridgeModule, CartridgeModuleItem } from "@/lib/cartridge-import";

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
import { draftAnnouncementAction } from "./messaging";
import { draftPackageAnnouncementsAction } from "./weekly-announcement-drafting";

const OWNER = { id: "owner-1", email: "owner@example.com" };

function cmItem(overrides: Partial<CartridgeModuleItem> & { title: string; type: string }): CartridgeModuleItem {
  return { ...overrides };
}

function cmModule(name: string, position: number, items: CartridgeModuleItem[] = []): CartridgeModule {
  return { name, position, items };
}

const TWO_WEEK_MODULES: CartridgeModule[] = [
  cmModule("Module 01: Intro", 1, [cmItem({ title: "Syllabus", type: "Page", body: "Course overview text." })]),
  cmModule("Module 02: Loops", 2, [cmItem({ title: "Lab 2", type: "Assignment", body: "Write three loops." })]),
];

beforeEach(() => {
  vi.mocked(requireOwner).mockReset().mockResolvedValue(OWNER as never);
  vi.mocked(draftAnnouncementAction)
    .mockReset()
    .mockImplementation(async (instruction: string) => ({
      title: "A drafted title",
      message: `Drafted from: ${instruction.slice(0, 24)}`,
    }));
});

describe("draftPackageAnnouncementsAction: one call, one draft per requested week (AC1 item 7)", () => {
  it("returns exactly one draft per requested week, in REQUEST order - not module order", async () => {
    const r = await draftPackageAnnouncementsAction(TWO_WEEK_MODULES, [2, 1], 2);
    if ("error" in r) throw new Error(r.error);

    expect(r.drafts.map((d) => d.week)).toEqual([2, 1]);
    expect(r.drafts[0].message).toContain("Drafted from:");
    expect(r.drafts[0].note).toContain('Module 02: Loops');
  });

  it("adapts the success note to name the uploaded package, not a Canvas source (AC1 item 8)", async () => {
    const r = await draftPackageAnnouncementsAction(TWO_WEEK_MODULES, [1], 2);
    if ("error" in r) throw new Error(r.error);

    expect(r.drafts[0].note).toContain("uploaded package");
    expect(r.drafts[0].note).toContain('Module 01: Intro');
  });

  it("DEFECT 4 fix: a SUCCESSFUL week's note carries the AC1 item 8 literal AND names the matched module - frozen literal, distinguishable at a glance from a failure note", async () => {
    // Module 01: Intro matches week 1 by NAME (numbered course), so no
    // "matched by position" suffix; the mocked draft response is short, so
    // no "materials truncated" suffix either - the note is exactly the base
    // provenance phrase.
    const r = await draftPackageAnnouncementsAction(TWO_WEEK_MODULES, [1], 2);
    if ("error" in r) throw new Error(r.error);

    expect(r.drafts[0].note).toBe('drafted from the uploaded package - module "Module 01: Intro"');
  });

  it("falls back to the message template - never a guess - for a week with no matching module, carrying the real reason", async () => {
    // Only one module, numbered, so week 2 has nothing to match.
    const oneModule = [cmModule("Module 01: Intro", 1, [cmItem({ title: "Syllabus", type: "Page", body: "text" })])];

    const r = await draftPackageAnnouncementsAction(oneModule, [1, 2], 15);
    if ("error" in r) throw new Error(r.error);

    const week2 = r.drafts.find((d) => d.week === 2)!;
    expect(week2.message).toBe("");
    expect(week2.note).toContain("no module content for week 2");
    expect(week2.note).toContain("No module matched week 2");
    // Only week 1 (which matched) should have reached the drafting call.
    expect(vi.mocked(draftAnnouncementAction)).toHaveBeenCalledTimes(1);
  });

  it("DEFECT 3/4 fix: a no-match week's note still states the real reason - frozen literal, no provenance phrase", async () => {
    // Only one module, numbered "Module 01: Intro" - week 9 has nothing to
    // match at all (matchedBy: "none"), which is the ONE case where
    // packageModuleContentForWeeks still populates `notes` (the live path's
    // own no-match wording).
    const oneModule = [cmModule("Module 01: Intro", 1, [cmItem({ title: "Syllabus", type: "Page", body: "text" })])];

    const r = await draftPackageAnnouncementsAction(oneModule, [9], 15);
    if ("error" in r) throw new Error(r.error);

    expect(r.drafts[0].note).toBe(
      "no module content for week 9 - used the message template (No module matched week 9 - reported no content rather than guessing one.)"
    );
    expect(r.drafts[0].note).not.toContain("uploaded package");
  });

  it("DEFECT 3 fix: a matched-but-EMPTY module (items: []) produces a note stating only the real reason, with no provenance phrase spliced in - frozen literal", async () => {
    // This is the exact repro from the adversarial verification pass: a
    // module matches week 3 by name, but has zero items, so there is
    // nothing to draft from. Before the fix, packageModuleContentForWeeks
    // unconditionally stamped notes: ["drafted from the uploaded package"]
    // on every matched week, and this action spliced that into the
    // "nothing was drafted" message - claiming in one breath that nothing
    // was drafted and that it WAS drafted from the package. After the fix,
    // notes is empty for a clean-but-empty match (nothing actually went
    // wrong), so the note states only the fallback itself.
    const modules = [cmModule("Module 03: Review", 1, [])];

    const r = await draftPackageAnnouncementsAction(modules, [3], 15);
    if ("error" in r) throw new Error(r.error);

    expect(r.drafts[0]).toEqual({
      week: 3,
      message: "",
      note: "no module content for week 3 - used the message template",
    });
    expect(r.drafts[0].note).not.toContain("uploaded package");
    expect(r.drafts[0].note).not.toContain("drafted from");
    expect(vi.mocked(draftAnnouncementAction)).not.toHaveBeenCalled();
  });

  it("is owner-gated, and drafts nothing when the gate rejects", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new Error("Not signed in."));

    const r = await draftPackageAnnouncementsAction(TWO_WEEK_MODULES, [1], 2);

    expect("error" in r).toBe(true);
    expect(draftAnnouncementAction).not.toHaveBeenCalled();
  });
});

describe("draftPackageAnnouncementsAction: DEFECT 7 fix - duplicate requested weeks do not double-draft", () => {
  it("calls the injected draft function exactly ONCE for weeks = [1, 1], and still returns two entries for week 1, in request order", async () => {
    const r = await draftPackageAnnouncementsAction(TWO_WEEK_MODULES, [1, 1], 2);
    if ("error" in r) throw new Error(r.error);

    expect(vi.mocked(draftAnnouncementAction)).toHaveBeenCalledTimes(1);
    expect(r.drafts.map((d) => d.week)).toEqual([1, 1]);
    expect(r.drafts).toHaveLength(2);
    // Both entries are the SAME already-computed draft, fanned back out -
    // not two independently-drafted (and therefore possibly divergent)
    // announcements for the same week.
    expect(r.drafts[0]).toEqual(r.drafts[1]);
    expect(r.drafts[0].note).toBe('drafted from the uploaded package - module "Module 01: Intro"');
  });

  it("still drafts every DISTINCT requested week once each when duplicates are mixed with new weeks", async () => {
    const r = await draftPackageAnnouncementsAction(TWO_WEEK_MODULES, [1, 2, 1], 2);
    if ("error" in r) throw new Error(r.error);

    expect(vi.mocked(draftAnnouncementAction)).toHaveBeenCalledTimes(2);
    expect(r.drafts.map((d) => d.week)).toEqual([1, 2, 1]);
    expect(r.drafts[0]).toEqual(r.drafts[2]);
  });
});

describe("draftPackageAnnouncementsAction: budget deferral (AC6 item 39)", () => {
  it("marks every week deferred - not failed - and drops the message key entirely, once the budget is already spent", async () => {
    const r = await draftPackageAnnouncementsAction(TWO_WEEK_MODULES, [1, 2], 2, { budgetMs: 0 });
    if ("error" in r) throw new Error(r.error);

    expect(draftAnnouncementAction).not.toHaveBeenCalled();
    expect(r.drafts.every((d) => d.defer === true)).toBe(true);
    // A deferred week must not carry a `message` key at all (not even an
    // empty string) - the caller distinguishes "nothing drafted this run,
    // retry later" from "drafted, but blank" by the key's PRESENCE.
    expect(Object.prototype.hasOwnProperty.call(r.drafts[0], "message")).toBe(false);
    expect(r.drafts[0].note).toMatch(/budget/i);
  });
});

describe("draftPackageAnnouncementsAction: drafting failures never throw", () => {
  it("degrades a THROWN drafting error to a note, rather than rejecting the whole action", async () => {
    vi.mocked(draftAnnouncementAction).mockRejectedValue(new Error("network unreachable"));

    const r = await draftPackageAnnouncementsAction(TWO_WEEK_MODULES, [1], 2);
    if ("error" in r) throw new Error(r.error);

    expect(r.drafts[0].message).toBe("");
    expect(r.drafts[0].note).toContain("network unreachable");
  });

  it("short-circuits weeks not yet claimed once a non-transient quota refusal is seen, without ever calling draft for them", async () => {
    // Five weeks, default concurrency 4: the four earliest-claimed targets
    // (weeks 1-4) start immediately; week 5 is only claimed once one of those
    // four workers loops back. Week 1's mock resolves in the fewest
    // microtask ticks (no internal await), so its worker is the one that
    // loops back and claims week 5 - by which point quotaRefusalText is
    // already set, so week 5 is skipped without ever reaching `draft`.
    const fiveModules: CartridgeModule[] = Array.from({ length: 5 }, (_, i) =>
      cmModule(`Unit ${i + 1}`, i + 1, [cmItem({ title: `Item ${i + 1}`, type: "Page", body: "text" })])
    );

    vi.mocked(draftAnnouncementAction).mockImplementation(async (instruction: string) => {
      if (instruction.includes("Unit 1")) {
        return { error: "HTTP 429: exceeded your monthly quota" };
      }
      // Extra microtask hops so weeks 2-4 resolve strictly AFTER week 1,
      // guaranteeing week 1's worker is first back at claimNext().
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      return { title: "A drafted title", message: `Drafted from: ${instruction.slice(0, 24)}` };
    });

    const r = await draftPackageAnnouncementsAction(fiveModules, [1, 2, 3, 4, 5], 5);
    if ("error" in r) throw new Error(r.error);

    expect(vi.mocked(draftAnnouncementAction)).toHaveBeenCalledTimes(4);
    const week5 = r.drafts.find((d) => d.week === 5)!;
    expect(week5.message).toBe("");
    expect(week5.note).toContain("HTTP 429");
  });
});
