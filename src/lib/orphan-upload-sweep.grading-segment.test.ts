// BULK-ZIP BW1, I-sweep-lists-segment (docs/bulk-zip-grading-scope.md
// section 8): the orphan sweep is the backstop for a grading zip the server
// never deleted, so it must actually LIST the grading segment. Drives the real
// sweep with a recording fake lister (not a membership check on the shared
// array, which would be tautological).
import { describe, it, expect, vi } from "vitest";
import { sweepOrphanUploads, type OrphanSweepLister, type OrphanSweepRemover } from "./orphan-upload-sweep";

describe("sweepOrphanUploads lists the grading-uploads segment", () => {
  it("passes ${userId}/grading-uploads to listPage and deletes a stale grading zip", async () => {
    const listedPaths: string[] = [];
    const lister: OrphanSweepLister = {
      listPage: async (path) => {
        listedPaths.push(path);
        if (path === "") return { entries: [{ name: "u1", updatedAt: null }], error: null };
        if (path === "u1/grading-uploads") {
          return { entries: [{ name: "old.zip", updatedAt: "2020-01-01T00:00:00.000Z" }], error: null };
        }
        return { entries: [], error: null };
      },
    };
    const remover: OrphanSweepRemover = {
      remove: vi.fn(async (paths: string[]) => ({
        removedNames: paths.map((p) => p.split("/").pop() as string),
        error: null,
      })),
    };
    const now = new Date("2026-10-08T00:00:00.000Z");
    const result = await sweepOrphanUploads(lister, remover, { pick: () => 0 }, now, {
      thresholdMs: 60 * 60 * 1000,
      softDeadlineAt: new Date(Date.now() + 60_000),
      phase1BudgetMs: 60_000,
      maxUserPrefixesThisTick: 10,
      pageSize: 100,
    });
    expect(listedPaths).toContain("u1/grading-uploads");
    expect(remover.remove).toHaveBeenCalledWith(["u1/grading-uploads/old.zip"]);
    expect(result.deleted).toEqual([{ userId: "u1", segment: "grading-uploads", uploadId: "old.zip" }]);
  });
});
