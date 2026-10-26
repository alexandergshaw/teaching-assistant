import { expect, it } from "vitest";
import type { RepositoryCollectRequest } from "./repository-evidence-types";
import { validateRepositoryCollectRequest } from "./repository-evidence-policy";
it("keeps the serializable shared request contract client-safe and closed", () => {
  const key = { sessionEpoch: "session", sourceIndex: 0 };
  const request: RepositoryCollectRequest = { operation: "collect", attemptId: "attempt", studentKey: key, mappings: [{ originalUrl: "https://github.com/a/b", stagedItemId: "item", studentKey: key, mappingRevision: 0, basis: "instructor-confirmed", scope: { owner: "a", repo: "b", kind: "repository", requestedRef: null, requestedPath: null } }] };
  expect(validateRepositoryCollectRequest(JSON.parse(JSON.stringify(request)))).toBe(true);
  expect(validateRepositoryCollectRequest({ ...request, executionPolicy: "run" })).toBe(false);
});