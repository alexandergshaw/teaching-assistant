import { describe, expect, it } from "vitest";
import { stageRepositoryBatch, emptyRepositoryEvidence } from "./chatRepositoryBatch";
import { collectionRequest, confirmRepositoryMapping, studentKeyId, freezeCollection } from "./chatRepositoryProposals";

const student = { key: { sessionEpoch: "session-1", sourceIndex: 7 }, label: "Sam (2)", sourceCue: "original.txt", retainedBytes: 300 };
describe("confirmed repository source identity", () => {
  it("normalizes supported schemeless sources to HTTPS and refuses HTTP before confirmation", () => {
    const state = stageRepositoryBatch("github.com/acme/work\nhttp://github.com/acme/work", emptyRepositoryEvidence());
    expect(state.lines.map((line) => line.status)).toEqual(["accepted", "rejected"]);
    expect(state.lines[0].original).toBe("github.com/acme/work");
    expect(confirmRepositoryMapping(state.lines[0], student, 1)?.originalUrl).toBe("https://github.com/acme/work");
    expect(confirmRepositoryMapping(state.lines[1], student, 1)).toBeNull();
  });
  it("preserves the full commit and exact existing session index through staging and confirmation", () => {
    const sha = "a".repeat(40), second = "b".repeat(40);
    const state = stageRepositoryBatch([`https://github.com/acme/work/commit/${sha}`, `https://github.com/acme/work/commit/${second}`, `https://github.com/acme/work/commit/${sha}`, "https://github.com/acme/work/commit/abcdef", `https://github.com/acme/work/commit/${sha}/file.ts`].join("\n"), emptyRepositoryEvidence());
    expect(state.lines.map((line) => line.status)).toEqual(["accepted", "accepted", "duplicate", "rejected", "rejected"]);
    const mapping = confirmRepositoryMapping(state.lines[0], student, 1)!;
    expect(mapping.studentKey).toEqual({ sessionEpoch: "session-1", sourceIndex: 7 });
    expect(mapping.scope).toEqual({ owner: "acme", repo: "work", kind: "commit", requestedRef: sha, requestedPath: null });
    expect(collectionRequest("attempt-1", [mapping])?.mappings[0].scope.requestedRef).toBe(sha);
    expect(collectionRequest("attempt-1", [mapping, mapping])).toBeNull();
    expect(collectionRequest("attempt-1", [mapping, { ...mapping, stagedItemId: "other", studentKey: { ...student.key, sourceIndex: 8 } }])).toBeNull();
  });
  it("requires an explicit consistent split for slash refs and does not infer equal-name identity", () => {
    const line = stageRepositoryBatch("https://github.com/acme/work/blob/feature/topic/src/main.ts", emptyRepositoryEvidence()).lines[0];
    expect(confirmRepositoryMapping(line, student, 1, "feature/topic", "src/main.ts")?.scope.requestedRef).toBe("feature/topic");
    expect(confirmRepositoryMapping(line, student, 1, "other", "src/main.ts")).toBeNull();
    expect(studentKeyId(student.key)).not.toBe(studentKeyId({ ...student.key, sourceIndex: 8 }));
  });
  it("preserves encoded-space blob filenames without broadening their scope", () => {
    const url = "https://github.com/acme/work/blob/main/Act%203/file.py";
    const line = stageRepositoryBatch(url, emptyRepositoryEvidence()).lines[0];
    const mapping = confirmRepositoryMapping(line, student, 1, "main", "Act 3/file.py")!;
    expect(mapping.originalUrl).toBe(url);
    expect(mapping.scope).toEqual({ owner: "acme", repo: "work", kind: "blob", requestedRef: "main", requestedPath: "Act 3/file.py" });
  });
  it("deep freezes copied successful server snapshots", () => {
    const response = { operation: "collect" as const, attemptId: "one", studentKey: student.key, mappings: [], evidence: [] };
    const frozen = freezeCollection(response);
    response.studentKey.sourceIndex = 9;
    expect(frozen.studentKey.sourceIndex).toBe(7);
    expect(Object.isFrozen(frozen.studentKey)).toBe(true);
  });
});
