import { describe, it, expect, vi, beforeEach } from "vitest";

// getInstitutionDeletionImpactAction is a thin owner-scoped wrapper over two
// read-only counting functions (src/lib/knowledge-base.ts's
// countInstitutionPages and src/lib/supabase/courses.ts's
// countCoursesByInstitution) - both mocked so this action's own wiring (owner
// gate, institution normalization, error mapping) runs for real without a
// live Supabase session. Mirrors the pattern in
// src/app/actions/knowledge-base.test.ts.
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
    countInstitutionPages: vi.fn(),
  };
});

vi.mock("@/lib/supabase/courses", () => ({
  countCoursesByInstitution: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { countInstitutionPages } from "@/lib/knowledge-base";
import { countCoursesByInstitution } from "@/lib/supabase/courses";
import { getInstitutionDeletionImpactAction } from "./institutions";

const OWNER = { id: "owner-1", email: "owner@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER);
});

describe("getInstitutionDeletionImpactAction", () => {
  it("returns an error rather than throwing when requireOwner rejects, without counting anything", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized. Sign in with an approved account."));

    const result = await getInstitutionDeletionImpactAction("MCC");

    expect(result).toEqual({ error: "Not authorized. Sign in with an approved account." });
    expect(countInstitutionPages).not.toHaveBeenCalled();
    expect(countCoursesByInstitution).not.toHaveBeenCalled();
  });

  it("normalizes institution casing before counting either table", async () => {
    vi.mocked(countInstitutionPages).mockResolvedValueOnce(0);
    vi.mocked(countCoursesByInstitution).mockResolvedValueOnce(0);

    await getInstitutionDeletionImpactAction("  mcc ");

    expect(countInstitutionPages).toHaveBeenCalledWith(expect.anything(), OWNER.id, "MCC");
    expect(countCoursesByInstitution).toHaveBeenCalledWith(OWNER.id, "MCC");
  });

  it("combines both real counts into the impact result", async () => {
    vi.mocked(countInstitutionPages).mockResolvedValueOnce(3);
    vi.mocked(countCoursesByInstitution).mockResolvedValueOnce(5);

    const result = await getInstitutionDeletionImpactAction("MCC");

    expect(result).toEqual({ impact: { pageCount: 3, tileCount: 5 } });
  });

  it("returns zero counts as real zeros, not falsy-omitted", async () => {
    vi.mocked(countInstitutionPages).mockResolvedValueOnce(0);
    vi.mocked(countCoursesByInstitution).mockResolvedValueOnce(0);

    const result = await getInstitutionDeletionImpactAction("MCC");

    expect(result).toEqual({ impact: { pageCount: 0, tileCount: 0 } });
  });

  it("maps a thrown page-count error to {error} instead of throwing", async () => {
    vi.mocked(countInstitutionPages).mockRejectedValueOnce(new Error("db unreachable"));
    vi.mocked(countCoursesByInstitution).mockResolvedValueOnce(0);

    const result = await getInstitutionDeletionImpactAction("MCC");

    expect(result).toEqual({ error: "db unreachable" });
  });

  it("maps a thrown tile-count error to {error} instead of throwing", async () => {
    vi.mocked(countInstitutionPages).mockResolvedValueOnce(0);
    vi.mocked(countCoursesByInstitution).mockRejectedValueOnce(new Error("db unreachable"));

    const result = await getInstitutionDeletionImpactAction("MCC");

    expect(result).toEqual({ error: "db unreachable" });
  });
});
