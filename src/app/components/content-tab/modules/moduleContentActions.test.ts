// Coverage for the addContentToModule / addContentToModuleDetailed orphan
// fix: a create-then-link failure (content created in Canvas, then the
// module-link call fails) used to be swallowed to a bare `false`
// indistinguishable from "nothing was created at all". addContentToModule
// now delegates to addContentToModuleDetailed, which reports "orphaned"
// with enough identity for a human to find the leftover in Canvas, while
// addContentToModule itself keeps returning a plain boolean so its two
// existing callers (useBulkModuleActions.ts's `if (ok) added++ else
// failed++` tally and useAddModuleItem.ts's `if (!ok)` check) are unchanged.
//
// REPO TRAP (per this round's brief): vi.mock's module-factory only
// intercepts the EXACT specifier string the code under test imports,
// resolved relative to THIS file. moduleContentActions.ts imports
// "../../../actions" and "../utils" - since this test file lives in the
// same directory, mocking those same two relative specifiers here resolves
// to the identical absolute modules, so the mocks actually apply. Every
// test below also asserts a mock was called at least once, so a mock that
// silently failed to attach (wrong specifier) would fail loudly instead of
// quietly exercising real code.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../actions", () => ({
  createGradableAction: vi.fn(),
  createModuleItemAction: vi.fn(),
  createPageAction: vi.fn(),
  createQuizQuestionAction: vi.fn(),
  bulkAssociateRubricAction: vi.fn(),
}));

vi.mock("../utils", () => ({
  quizQuestionToInput: vi.fn(),
  textToSlides: vi.fn(),
  uploadFileToModule: vi.fn(),
}));

import {
  createGradableAction,
  createModuleItemAction,
  createPageAction,
} from "../../../actions";
import { addContentToModule, addContentToModuleDetailed } from "./moduleContentActions";
import { describeOrphans } from "./useBulkModuleActions";

const mockedCreateGradableAction = vi.mocked(createGradableAction);
const mockedCreateModuleItemAction = vi.mocked(createModuleItemAction);
const mockedCreatePageAction = vi.mocked(createPageAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("addContentToModuleDetailed - Assignment/Quiz/Discussion (createGradableAction then createModuleItemAction)", () => {
  it("create succeeds + link succeeds -> success, and the caller-visible boolean is true", async () => {
    mockedCreateGradableAction.mockResolvedValue({ id: 101 });
    mockedCreateModuleItemAction.mockResolvedValue({ ok: true });

    const detailed = await addContentToModuleDetailed("course", "acr", "Assignment", 5, "HW 1", {});
    expect(detailed).toEqual({ status: "success" });
    // Proves the mocks actually attached (REPO TRAP guard).
    expect(mockedCreateGradableAction).toHaveBeenCalledTimes(1);
    expect(mockedCreateModuleItemAction).toHaveBeenCalledTimes(1);

    mockedCreateGradableAction.mockResolvedValue({ id: 101 });
    mockedCreateModuleItemAction.mockResolvedValue({ ok: true });
    const ok = await addContentToModule("course", "acr", "Assignment", 5, "HW 1", {});
    expect(ok).toBe(true);
  });

  it("create fails -> failed, nothing to clean up, link is never attempted, and the caller-visible boolean is false", async () => {
    mockedCreateGradableAction.mockResolvedValue({ error: "Canvas rejected the assignment." });

    const detailed = await addContentToModuleDetailed("course", "acr", "Assignment", 5, "HW 1", {});
    expect(detailed).toEqual({ status: "failed" });
    expect(mockedCreateGradableAction).toHaveBeenCalledTimes(1);
    // Nothing was created, so linking must never be attempted.
    expect(mockedCreateModuleItemAction).not.toHaveBeenCalled();

    mockedCreateGradableAction.mockResolvedValue({ error: "Canvas rejected the assignment." });
    const ok = await addContentToModule("course", "acr", "Assignment", 5, "HW 1", {});
    expect(ok).toBe(false);
  });

  it("create succeeds + link fails -> orphaned, identifying the leftover Canvas object, and the caller-visible boolean stays false (not miscounted as success)", async () => {
    mockedCreateGradableAction.mockResolvedValue({ id: 202 });
    mockedCreateModuleItemAction.mockResolvedValue({ error: "Module link rejected." });

    const detailed = await addContentToModuleDetailed("course", "acr", "Quiz", 5, "Quiz 1", {});
    expect(detailed).toEqual({ status: "orphaned", kind: "Quiz", title: "Quiz 1", contentId: 202 });
    expect(mockedCreateGradableAction).toHaveBeenCalledTimes(1);
    expect(mockedCreateModuleItemAction).toHaveBeenCalledTimes(1);

    mockedCreateGradableAction.mockResolvedValue({ id: 202 });
    mockedCreateModuleItemAction.mockResolvedValue({ error: "Module link rejected." });
    // The orphan case must NOT be truthy to the legacy caller: the item is
    // not visible in the module, so bulkAddToModules's `if (ok)` tally must
    // still count it as failed, exactly as it does today.
    const ok = await addContentToModule("course", "acr", "Quiz", 5, "Quiz 1", {});
    expect(ok).toBe(false);
  });
});

describe("addContentToModuleDetailed - Page (createPageAction then createModuleItemAction) has the identical seam", () => {
  it("create succeeds + link fails -> orphaned, carrying the created page's id", async () => {
    mockedCreatePageAction.mockResolvedValue({
      page: { pageId: 303, url: "syllabus-page", title: "Syllabus", body: "", published: false, updatedAt: null },
    });
    mockedCreateModuleItemAction.mockResolvedValue({ error: "Module link rejected." });

    const detailed = await addContentToModuleDetailed("course", "acr", "Page", 5, "Syllabus", {});
    expect(detailed).toEqual({ status: "orphaned", kind: "Page", title: "Syllabus", contentId: 303 });
    expect(mockedCreatePageAction).toHaveBeenCalledTimes(1);
    expect(mockedCreateModuleItemAction).toHaveBeenCalledTimes(1);

    mockedCreatePageAction.mockResolvedValue({
      page: { pageId: 303, url: "syllabus-page", title: "Syllabus", body: "", published: false, updatedAt: null },
    });
    mockedCreateModuleItemAction.mockResolvedValue({ error: "Module link rejected." });
    const ok = await addContentToModule("course", "acr", "Page", 5, "Syllabus", {});
    expect(ok).toBe(false);
  });
});

describe("addContentToModuleDetailed - SubHeader has no create-then-link seam (nothing to orphan)", () => {
  it("a link failure is plain 'failed', never 'orphaned' - there is no separate created object", async () => {
    mockedCreateModuleItemAction.mockResolvedValue({ error: "Module item rejected." });

    const detailed = await addContentToModuleDetailed("course", "acr", "SubHeader", 5, "Week 1", {});
    expect(detailed).toEqual({ status: "failed" });
    expect(mockedCreateGradableAction).not.toHaveBeenCalled();
    expect(mockedCreatePageAction).not.toHaveBeenCalled();
  });
});

// D10 (carry-module-pattern-forward-acceptance-criteria.md, section 5): a
// template module's item ORDER (position) and NESTING (indent) are part of
// "the pattern" and used to be silently dropped by every one of the four
// createModuleItemAction call sites in moduleContentActions.ts (SubHeader,
// File-link, Page, Assignment/Quiz/Discussion). AddContentOpts now carries
// both as optional fields, threaded through unfiltered. The backward-
// compatibility guarantee is that an omitted opts.position/opts.indent must
// reach createModuleItemAction as `undefined`, never as a coerced 0 or 1 -
// module-items.ts's createModuleItem only appends the Canvas
// module_item[position]/module_item[indent] params when
// `typeof x === "number"`, so `undefined` here means the HTTP param is never
// sent at all and Canvas keeps appending to the end of the module exactly as
// every pre-existing caller already relies on. That guard lives in
// module-items.ts, outside this file's ownership, so it is read-verified
// rather than re-tested here; what this suite pins is the boundary this file
// owns - the shape of the object handed to createModuleItemAction.
describe("addContentToModuleDetailed - position/indent pass-through (D10)", () => {
  it("SubHeader: position/indent are forwarded to createModuleItemAction when present", async () => {
    mockedCreateModuleItemAction.mockResolvedValue({ ok: true });

    await addContentToModuleDetailed("course", "acr", "SubHeader", 5, "Week 1", { position: 3, indent: 1 });

    expect(mockedCreateModuleItemAction).toHaveBeenCalledWith(
      "course",
      5,
      expect.objectContaining({ type: "SubHeader", title: "Week 1", position: 3, indent: 1 }),
      "acr"
    );
  });

  it("SubHeader: absent opts -> position/indent reach createModuleItemAction as undefined, not 0", async () => {
    mockedCreateModuleItemAction.mockResolvedValue({ ok: true });

    await addContentToModuleDetailed("course", "acr", "SubHeader", 5, "Week 1", {});

    const item = mockedCreateModuleItemAction.mock.calls[0][2];
    expect(item.position).toBeUndefined();
    expect(item.indent).toBeUndefined();
  });

  it("File (link existing): position/indent are forwarded when present", async () => {
    mockedCreateModuleItemAction.mockResolvedValue({ ok: true });

    await addContentToModuleDetailed("course", "acr", "File", 5, "Handout", {
      fileId: 77,
      position: 2,
      indent: 0,
    });

    expect(mockedCreateModuleItemAction).toHaveBeenCalledWith(
      "course",
      5,
      expect.objectContaining({ type: "File", contentId: 77, position: 2, indent: 0 }),
      "acr"
    );
  });

  it("File (link existing): absent opts -> position/indent are undefined, no accidental default", async () => {
    mockedCreateModuleItemAction.mockResolvedValue({ ok: true });

    await addContentToModuleDetailed("course", "acr", "File", 5, "Handout", { fileId: 77 });

    const item = mockedCreateModuleItemAction.mock.calls[0][2];
    expect(item.position).toBeUndefined();
    expect(item.indent).toBeUndefined();
  });

  // C4 (step-10 fixer round): linking an EXISTING file used to omit `title`
  // entirely, so Canvas named the module item after the FILE, not after the
  // resolved title this call was given. AC8's idempotency key is the module
  // ITEM title, so a re-run's skip check never matched and the same file was
  // linked into the module again on every apply - Canvas has no undo for
  // that. Sabotage-checkable: delete `title: name` from the File-link branch
  // and this goes red, because `item.title` becomes `undefined` instead of
  // the resolved title.
  it("File (link existing): the resolved title is sent as the module item's own title, not left to Canvas's file-name default", async () => {
    mockedCreateModuleItemAction.mockResolvedValue({ ok: true });

    await addContentToModuleDetailed("course", "acr", "File", 5, "Week 3 Handout", { fileId: 77 });

    expect(mockedCreateModuleItemAction).toHaveBeenCalledWith(
      "course",
      5,
      expect.objectContaining({ type: "File", contentId: 77, title: "Week 3 Handout" }),
      "acr"
    );
  });

  it("Page: position/indent are forwarded when present", async () => {
    mockedCreatePageAction.mockResolvedValue({
      page: { pageId: 404, url: "week-1", title: "Week 1", body: "", published: false, updatedAt: null },
    });
    mockedCreateModuleItemAction.mockResolvedValue({ ok: true });

    await addContentToModuleDetailed("course", "acr", "Page", 5, "Week 1", { position: 1, indent: 2 });

    expect(mockedCreateModuleItemAction).toHaveBeenCalledWith(
      "course",
      5,
      expect.objectContaining({ type: "Page", pageUrl: "week-1", position: 1, indent: 2 }),
      "acr"
    );
  });

  it("Page: absent opts -> position/indent are undefined", async () => {
    mockedCreatePageAction.mockResolvedValue({
      page: { pageId: 404, url: "week-1", title: "Week 1", body: "", published: false, updatedAt: null },
    });
    mockedCreateModuleItemAction.mockResolvedValue({ ok: true });

    await addContentToModuleDetailed("course", "acr", "Page", 5, "Week 1", {});

    const item = mockedCreateModuleItemAction.mock.calls[0][2];
    expect(item.position).toBeUndefined();
    expect(item.indent).toBeUndefined();
  });

  it("Assignment/Quiz/Discussion: position/indent are forwarded when present", async () => {
    mockedCreateGradableAction.mockResolvedValue({ id: 909 });
    mockedCreateModuleItemAction.mockResolvedValue({ ok: true });

    await addContentToModuleDetailed("course", "acr", "Assignment", 5, "HW 1", { position: 4, indent: 0 });

    expect(mockedCreateModuleItemAction).toHaveBeenCalledWith(
      "course",
      5,
      expect.objectContaining({ type: "Assignment", contentId: 909, position: 4, indent: 0 }),
      "acr"
    );
  });

  it("Assignment/Quiz/Discussion: absent opts -> position/indent reach createModuleItemAction as undefined - " +
    "the backward-compatibility guarantee that a bulk add never reorders an existing module", async () => {
    mockedCreateGradableAction.mockResolvedValue({ id: 909 });
    mockedCreateModuleItemAction.mockResolvedValue({ ok: true });

    await addContentToModuleDetailed("course", "acr", "Assignment", 5, "HW 1", {});

    const item = mockedCreateModuleItemAction.mock.calls[0][2];
    expect(item.position).toBeUndefined();
    expect(item.indent).toBeUndefined();
    // Also confirm no opts argument at all (the plain two-arg legacy call
    // shape) behaves identically - opts itself is optional.
    mockedCreateModuleItemAction.mockClear();
    mockedCreateGradableAction.mockResolvedValue({ id: 910 });
    await addContentToModuleDetailed("course", "acr", "Assignment", 5, "HW 2");
    const item2 = mockedCreateModuleItemAction.mock.calls[0][2];
    expect(item2.position).toBeUndefined();
    expect(item2.indent).toBeUndefined();
  });
});

// describeOrphans (useBulkModuleActions.ts) is the pure helper that turns the
// "orphaned" outcomes collected from a bulkAddToModules run into the note
// clause an instructor actually reads. It has no React/DOM dependency, so
// unlike the two hooks it lives in, it can be exercised directly here.
describe("describeOrphans", () => {
  it("no orphans -> empty string, so callers can append it with no extra separator logic", () => {
    expect(describeOrphans([])).toBe("");
  });

  it("one orphan -> singular wording, naming kind, title, and id", () => {
    expect(describeOrphans([{ kind: "Quiz", title: "Quiz 1", contentId: 202 }])).toBe(
      ' 1 created but not linked - find it in Canvas: Quiz "Quiz 1" (id 202).'
    );
  });

  it("several orphans -> plural wording, all items listed and readable", () => {
    expect(
      describeOrphans([
        { kind: "Quiz", title: "Quiz 1", contentId: 202 },
        { kind: "Assignment", title: "HW 1", contentId: 303 },
      ])
    ).toBe(
      ' 2 created but not linked - find them in Canvas: Quiz "Quiz 1" (id 202); Assignment "HW 1" (id 303).'
    );
  });

  it("an orphan with no contentId still names kind and title, without a dangling id clause", () => {
    expect(describeOrphans([{ kind: "Page", title: "Syllabus" }])).toBe(
      ' 1 created but not linked - find it in Canvas: Page "Syllabus".'
    );
  });

  it("appended onto the base 'N done, M failed' clause reproduces the documented note text verbatim", () => {
    const base = "Added to modules: 3 done, 1 failed.";
    const full = `${base}${describeOrphans([{ kind: "Quiz", title: "Quiz 1", contentId: 202 }])}`;
    expect(full).toBe('Added to modules: 3 done, 1 failed. 1 created but not linked - find it in Canvas: Quiz "Quiz 1" (id 202).');
  });
});
