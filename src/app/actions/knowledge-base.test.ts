import { describe, it, expect, vi, beforeEach } from "vitest";

// Every action here calls requireOwner() (auth) and the src/lib/knowledge-base
// data-access functions (Supabase I/O) - both mocked so each action's own
// wiring (owner gate, existence checks, institution normalization, error
// mapping) runs for real without a live Supabase session. The underlying pure
// logic (tree building, search, the cycle guard) is unit-tested directly in
// src/lib/knowledge-base.test.ts. Mirrors the pattern in
// src/app/actions/submission-repo.test.ts.
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/knowledge-base", async () => {
  const actual = await vi.importActual<typeof import("@/lib/knowledge-base")>("@/lib/knowledge-base");
  return {
    ...actual,
    listInstitutionPages: vi.fn(),
    getInstitutionPage: vi.fn(),
    createInstitutionPage: vi.fn(),
    updateInstitutionPage: vi.fn(),
    moveInstitutionPage: vi.fn(),
    deleteInstitutionPage: vi.fn(),
  };
});

import { requireOwner } from "@/lib/supabase/auth";
import {
  listInstitutionPages,
  getInstitutionPage,
  createInstitutionPage,
  updateInstitutionPage,
  moveInstitutionPage,
  deleteInstitutionPage,
  type InstitutionPage,
} from "@/lib/knowledge-base";
import {
  listInstitutionPagesAction,
  createInstitutionPageAction,
  updateInstitutionPageAction,
  moveInstitutionPageAction,
  deleteInstitutionPageAction,
} from "./knowledge-base";

const OWNER = { id: "owner-1", email: "owner@example.com" };

function page(overrides: Partial<InstitutionPage> = {}): InstitutionPage {
  return {
    id: "page-1",
    institution: "MCC",
    parentId: null,
    title: "Attendance Policy",
    body: "Students must attend 80% of sessions.",
    tags: [],
    position: 0,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER);
});

describe("listInstitutionPagesAction", () => {
  it("returns an error rather than throwing when requireOwner rejects", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized. Sign in with an approved account."));

    const result = await listInstitutionPagesAction("mcc");

    expect(result).toEqual({ error: "Not authorized. Sign in with an approved account." });
    expect(listInstitutionPages).not.toHaveBeenCalled();
  });

  it("normalizes institution casing before listing", async () => {
    vi.mocked(listInstitutionPages).mockResolvedValueOnce([page()]);

    await listInstitutionPagesAction("  mcc ");

    expect(listInstitutionPages).toHaveBeenCalledWith(expect.anything(), OWNER.id, "MCC");
  });

  it("returns the owner's pages on success", async () => {
    vi.mocked(listInstitutionPages).mockResolvedValueOnce([page(), page({ id: "page-2" })]);

    const result = await listInstitutionPagesAction("MCC");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.pages).toHaveLength(2);
  });

  it("maps a thrown data-layer error to {error} instead of throwing", async () => {
    vi.mocked(listInstitutionPages).mockRejectedValueOnce(new Error("db unreachable"));

    const result = await listInstitutionPagesAction("MCC");

    expect(result).toEqual({ error: "db unreachable" });
  });
});

describe("createInstitutionPageAction", () => {
  it("returns an error when requireOwner rejects, without touching the data layer", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized."));

    const result = await createInstitutionPageAction({ institution: "mcc", title: "New page" });

    expect(result).toEqual({ error: "Not authorized." });
    expect(createInstitutionPage).not.toHaveBeenCalled();
  });

  it("rejects a parentId that does not resolve to this owner's page", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(null);

    const result = await createInstitutionPageAction({ institution: "MCC", parentId: "not-mine", title: "Child" });

    expect(result).toEqual({ error: "The parent page was not found." });
    expect(createInstitutionPage).not.toHaveBeenCalled();
  });

  it("passes the normalized institution through to the data layer", async () => {
    vi.mocked(createInstitutionPage).mockResolvedValueOnce(page());

    await createInstitutionPageAction({ institution: " mpcc  ", title: "Deadlines" });

    expect(createInstitutionPage).toHaveBeenCalledWith(
      expect.anything(),
      OWNER.id,
      expect.objectContaining({ institution: "MPCC" })
    );
  });

  it("creates a page under a verified parent", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(page({ id: "parent-1" }));
    vi.mocked(createInstitutionPage).mockResolvedValueOnce(page({ id: "child-1", parentId: "parent-1" }));

    const result = await createInstitutionPageAction({ institution: "MCC", parentId: "parent-1", title: "Child" });

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.page.parentId).toBe("parent-1");
  });
});

describe("updateInstitutionPageAction", () => {
  it("returns 'Page not found.' for a missing id, never reaching the update call", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(null);

    const result = await updateInstitutionPageAction("does-not-exist", { title: "New title" });

    expect(result).toEqual({ error: "Page not found." });
    expect(updateInstitutionPage).not.toHaveBeenCalled();
  });

  it("returns 'Page not found.' for another owner's id (getInstitutionPage is owner-scoped)", async () => {
    // getInstitutionPage is owner-scoped in the data layer (unit-tested there);
    // from the action's point of view a foreign id looks identical to a
    // missing one, and must produce the same generic error - never leak
    // whether the id belongs to someone else.
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(null);

    const result = await updateInstitutionPageAction("someone-elses-page", { title: "Hijacked" });

    expect(result).toEqual({ error: "Page not found." });
    expect(updateInstitutionPage).not.toHaveBeenCalled();
  });

  it("updates an existing owned page", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(page());
    vi.mocked(updateInstitutionPage).mockResolvedValueOnce(page({ title: "Updated title" }));

    const result = await updateInstitutionPageAction("page-1", { title: "Updated title" });

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.page.title).toBe("Updated title");
  });

  it("maps a thrown data-layer error to {error} instead of throwing", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(page());
    vi.mocked(updateInstitutionPage).mockRejectedValueOnce(new Error("write failed"));

    const result = await updateInstitutionPageAction("page-1", { title: "x" });

    expect(result).toEqual({ error: "write failed" });
  });
});

describe("moveInstitutionPageAction", () => {
  it("returns 'Page not found.' for a missing id, never reaching the move call", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(null);

    const result = await moveInstitutionPageAction("does-not-exist", { parentId: null });

    expect(result).toEqual({ error: "Page not found." });
    expect(moveInstitutionPage).not.toHaveBeenCalled();
  });

  it("surfaces the self-ancestor cycle rejection from the data layer", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(page({ id: "page-1" }));
    vi.mocked(moveInstitutionPage).mockRejectedValueOnce(
      new Error("Cannot move a page under itself or one of its own subpages.")
    );

    const result = await moveInstitutionPageAction("page-1", { parentId: "page-1" });

    expect(result).toEqual({ error: "Cannot move a page under itself or one of its own subpages." });
  });

  it("moves an existing owned page", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(page());
    vi.mocked(moveInstitutionPage).mockResolvedValueOnce(page({ parentId: "new-parent", position: 3 }));

    const result = await moveInstitutionPageAction("page-1", { parentId: "new-parent", position: 3 });

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.page.parentId).toBe("new-parent");
    expect(result.page.position).toBe(3);
  });
});

describe("deleteInstitutionPageAction", () => {
  it("returns 'Page not found.' for a missing id, never reaching the delete call", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(null);

    const result = await deleteInstitutionPageAction("does-not-exist");

    expect(result).toEqual({ error: "Page not found." });
    expect(deleteInstitutionPage).not.toHaveBeenCalled();
  });

  it("deletes an existing owned page", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(page());
    vi.mocked(deleteInstitutionPage).mockResolvedValueOnce(undefined);

    const result = await deleteInstitutionPageAction("page-1");

    expect(result).toEqual({ ok: true });
    expect(deleteInstitutionPage).toHaveBeenCalledWith(expect.anything(), OWNER.id, "page-1");
  });

  it("maps a thrown data-layer error to {error} instead of throwing", async () => {
    vi.mocked(getInstitutionPage).mockResolvedValueOnce(page());
    vi.mocked(deleteInstitutionPage).mockRejectedValueOnce(new Error("cascade failed"));

    const result = await deleteInstitutionPageAction("page-1");

    expect(result).toEqual({ error: "cascade failed" });
  });
});
