import { expect, it, vi } from "vitest";
import { collectRepositoryEvidence } from "./repository-evidence-collector";
import type { RepositoryCollectRequest } from "./repository-evidence-types";
it("refuses malformed unconfirmed work before creating a fetch", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  try { await expect(collectRepositoryEvidence({ operation: "collect" } as RepositoryCollectRequest)).rejects.toThrow("Invalid confirmed"); expect(fetcher).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); }
});