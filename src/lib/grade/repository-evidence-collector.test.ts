import { expect, it, vi } from "vitest";
import { collectRepositoryEvidence } from "./repository-evidence-collector";
import type { RepositoryCollectRequest } from "./repository-evidence-types";
it("refuses malformed unconfirmed work before creating a fetch", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  try { await expect(collectRepositoryEvidence({ operation: "collect" } as RepositoryCollectRequest)).rejects.toThrow("Invalid confirmed"); expect(fetcher).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); }
});
it("rejects a contradictory fixed-commit pin in the collector before creating any request", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const key = { sessionEpoch: "session", sourceIndex: 0 }; const commit = "a".repeat(40);
  const request: RepositoryCollectRequest = { operation: "collect", attemptId: "attempt", studentKey: key, mappings: [{ originalUrl: `https://github.com/owner/repo/commit/${commit}`, stagedItemId: "item", studentKey: key, mappingRevision: 0, basis: "instructor-confirmed", scope: { owner: "owner", repo: "repo", kind: "commit", requestedRef: commit, requestedPath: null } }] };
  try { await expect(collectRepositoryEvidence(request, Date.now() + 50_000, [{ commitSha: "b".repeat(40) }])).rejects.toThrow("must match"); expect(fetcher).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); }
});