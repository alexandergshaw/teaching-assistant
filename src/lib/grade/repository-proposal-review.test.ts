import { expect, it, vi } from "vitest";
import { reviewRepositoryProposal } from "./repository-proposal-review";
import type { RepositoryReviewRequest } from "./repository-evidence-types";
it("refuses a candidate from another revision before any GitHub/model invocation", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  try { await expect(reviewRepositoryProposal({ revision: { evidenceRevision: 1 }, proposal: { revision: { evidenceRevision: 2 } } } as RepositoryReviewRequest, Date.now() + 50_000)).rejects.toThrow("revision"); expect(fetcher).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); }
});