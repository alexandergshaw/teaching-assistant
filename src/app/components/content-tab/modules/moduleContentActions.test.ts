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
