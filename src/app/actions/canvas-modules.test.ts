// First test file for canvas-modules.ts (step-10 fixer round). Focused on
// createCourseAssignmentAction, the one export this round's fixes touch:
//
// C5: create and link used to share one try/catch, so a link failure after
// a successful create threw up to the outer catch and returned a bare
// `{ error }` - discarding the created assignment's real id. Canvas HAD
// accepted the assignment; only the module link failed. A caller matching
// its idempotency check against module ITEM titles (carry-module-pattern.ts)
// could never see that orphan on a re-run and created a duplicate every
// time. The fix splits create and link into two try/catch scopes so a link
// failure reports `addedToModule: false` plus `linkError`, WITH the real id
// intact.
//
// C3: `moduleItemPlacement` (a new, optional 5th argument) threads
// position/indent into the same module-item link call, so an Assignment
// created through this path can reproduce a template module's item order
// and nesting (docs/carry-module-pattern-forward-acceptance-criteria.md).
//
// A handful of the file's other simple wrapper actions are covered too, at
// the same requireOwner-guard/try-catch depth every other action test file
// in this directory uses (canvas-discussions.test.ts is the template).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn() }));
vi.mock("@/lib/canvas", () => ({ getCourseName: vi.fn() }));
vi.mock("@/lib/canvas-modules", () => ({
  listModules: vi.fn(),
  createModule: vi.fn(),
  updateModule: vi.fn(),
  deleteModule: vi.fn(),
  createModuleItem: vi.fn(),
  updateModuleItem: vi.fn(),
  deleteModuleItem: vi.fn(),
  listAssignmentGroups: vi.fn(),
  createAssignment: vi.fn(),
  uploadFileToModule: vi.fn(),
  listPages: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { createAssignment, createModuleItem, createModule, updateModule, deleteModule } from "@/lib/canvas-modules";
import type { NewAssignment } from "@/lib/canvas-modules";
import {
  createCourseAssignmentAction,
  createModuleAction,
  updateModuleAction,
  deleteModuleAction,
} from "./canvas-modules";

const FIELDS: NewAssignment = {
  name: "Week 3 Homework",
  description: "Do the thing.",
  pointsPossible: 10,
  dueAt: "",
  submissionType: "online_text_entry",
  published: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" } as never);
});

describe("createCourseAssignmentAction - C5: create/link are two failure domains, not one", () => {
  it("create succeeds, no moduleId given -> addedToModule false, no linkError, createModuleItem never called", async () => {
    vi.mocked(createAssignment).mockResolvedValue({ id: 1, name: "Week 3 Homework", htmlUrl: "https://x/1" });

    const result = await createCourseAssignmentAction("course", FIELDS, null, "acr");

    expect(result).toEqual({ id: 1, name: "Week 3 Homework", htmlUrl: "https://x/1", addedToModule: false });
    expect(createModuleItem).not.toHaveBeenCalled();
  });

  it("create succeeds, link succeeds -> addedToModule true, and no linkError field at all", async () => {
    vi.mocked(createAssignment).mockResolvedValue({ id: 2, name: "Week 3 Homework", htmlUrl: "https://x/2" });
    vi.mocked(createModuleItem).mockResolvedValue(undefined as never);

    const result = await createCourseAssignmentAction("course", FIELDS, 9, "acr");

    expect(result).toEqual({ id: 2, name: "Week 3 Homework", htmlUrl: "https://x/2", addedToModule: true });
    expect(result).not.toHaveProperty("linkError");
  });

  it("create itself throws -> returns { error }, and createModuleItem is never attempted", async () => {
    vi.mocked(createAssignment).mockRejectedValue(new Error("Canvas rejected the assignment."));

    const result = await createCourseAssignmentAction("course", FIELDS, 9, "acr");

    expect(result).toEqual({ error: "Canvas rejected the assignment." });
    expect(createModuleItem).not.toHaveBeenCalled();
  });

  // The core C5 fix. Sabotage-checkable: revert to a single try/catch around
  // both the create and the link call (so a link failure propagates to the
  // outer catch) and this goes red - `result` would be a bare
  // `{ error: "Module link rejected." }` with no `id` at all, so both
  // assertions below fail.
  it("create succeeds, module link throws -> the created assignment's id survives, reported as linkError, never a bare { error }", async () => {
    vi.mocked(createAssignment).mockResolvedValue({ id: 42, name: "Week 3 Homework", htmlUrl: "https://x/42" });
    vi.mocked(createModuleItem).mockRejectedValue(new Error("Module link rejected."));

    const result = await createCourseAssignmentAction("course", FIELDS, 5, "acr");

    expect(result).not.toHaveProperty("error");
    expect(result).toEqual({
      id: 42,
      name: "Week 3 Homework",
      htmlUrl: "https://x/42",
      addedToModule: false,
      linkError: "Module link rejected.",
    });
  });

  it("a non-Error thrown by the link call still reports a linkError string, not a crash", async () => {
    vi.mocked(createAssignment).mockResolvedValue({ id: 43, name: "x", htmlUrl: "" });
    vi.mocked(createModuleItem).mockRejectedValue("boom");

    const result = await createCourseAssignmentAction("course", FIELDS, 5, "acr");

    expect(result).toMatchObject({ id: 43, addedToModule: false });
    if (!("linkError" in result)) throw new Error("expected a linkError");
    expect(typeof result.linkError).toBe("string");
  });

  it("never calls createAssignment when requireOwner rejects", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new Error("Not signed in."));

    const result = await createCourseAssignmentAction("course", FIELDS, 5, "acr");

    expect(result).toEqual({ error: "Not signed in." });
    expect(createAssignment).not.toHaveBeenCalled();
  });
});

describe("createCourseAssignmentAction - C3: position/indent are threaded into the module-item link call", () => {
  it("forwards position/indent to createModuleItem when moduleItemPlacement is given", async () => {
    vi.mocked(createAssignment).mockResolvedValue({ id: 3, name: "HW", htmlUrl: "" });
    vi.mocked(createModuleItem).mockResolvedValue(undefined as never);

    await createCourseAssignmentAction("course", FIELDS, 9, "acr", { position: 4, indent: 1 });

    expect(createModuleItem).toHaveBeenCalledWith(
      "course",
      9,
      expect.objectContaining({ type: "Assignment", contentId: 3, title: "HW", position: 4, indent: 1 }),
      "acr"
    );
  });

  // Backward-compatibility guarantee: every pre-existing caller of this
  // action (there are more than a dozen) never passes a 5th argument at
  // all, and must keep landing at Canvas's own default position exactly as
  // before. Sabotage-checkable: default `position`/`indent` to 0 instead of
  // leaving them undefined, and this goes red.
  it("omits position/indent entirely (undefined, not 0) when moduleItemPlacement is absent - the existing-caller compatibility guarantee", async () => {
    vi.mocked(createAssignment).mockResolvedValue({ id: 4, name: "HW", htmlUrl: "" });
    vi.mocked(createModuleItem).mockResolvedValue(undefined as never);

    await createCourseAssignmentAction("course", FIELDS, 9, "acr");

    const item = vi.mocked(createModuleItem).mock.calls[0][2];
    expect(item.position).toBeUndefined();
    expect(item.indent).toBeUndefined();
  });

  it("omits position/indent when moduleItemPlacement is given but empty", async () => {
    vi.mocked(createAssignment).mockResolvedValue({ id: 5, name: "HW", htmlUrl: "" });
    vi.mocked(createModuleItem).mockResolvedValue(undefined as never);

    await createCourseAssignmentAction("course", FIELDS, 9, "acr", {});

    const item = vi.mocked(createModuleItem).mock.calls[0][2];
    expect(item.position).toBeUndefined();
    expect(item.indent).toBeUndefined();
  });
});

describe("createModuleAction / updateModuleAction / deleteModuleAction - requireOwner guard and error shape", () => {
  it("createModuleAction returns the created module on success", async () => {
    vi.mocked(createModule).mockResolvedValue({ id: 1, name: "Week 1", position: 1, published: false, itemsCount: 0, items: [] });

    const result = await createModuleAction("course", "Week 1", 1, "acr");

    expect(result).toEqual({ module: { id: 1, name: "Week 1", position: 1, published: false, itemsCount: 0, items: [] } });
  });

  it("createModuleAction converts a thrown Error into { error }", async () => {
    vi.mocked(createModule).mockRejectedValue(new Error("boom"));

    const result = await createModuleAction("course", "Week 1");

    expect(result).toEqual({ error: "boom" });
  });

  it("updateModuleAction returns { ok: true } on success", async () => {
    vi.mocked(updateModule).mockResolvedValue(undefined as never);

    const result = await updateModuleAction("course", 1, { published: true });

    expect(result).toEqual({ ok: true });
    expect(updateModule).toHaveBeenCalledWith("course", 1, { published: true }, undefined);
  });

  it("deleteModuleAction converts a thrown Error into { error }", async () => {
    vi.mocked(deleteModule).mockRejectedValue(new Error("Canvas rejected the delete."));

    const result = await deleteModuleAction("course", 1);

    expect(result).toEqual({ error: "Canvas rejected the delete." });
  });
});
