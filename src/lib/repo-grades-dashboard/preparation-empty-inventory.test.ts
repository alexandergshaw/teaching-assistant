import { describe, expect, it } from "vitest";
import type { RepoGradeProfile } from "./profile";
import { folderInventory } from "./preparation-runtime";

describe("folder instruction inventory", () => {
  it("omits only verified placeholder-only folders and preserves unknown work", () => {
    const sha = "a".repeat(40);
    const profile = { folder: "lab", sourceRef: null } as RepoGradeProfile;
    const discovery = { status: "scanned" as const, enumerationComplete: true, repos: [
      { status: "ready" as const, repo: "Org/Empty", sourceRef: "main", sourceCommit: sha, folders: ["lab"], emptyFolders: ["lab"] },
      { status: "ready" as const, repo: "Org/Work", sourceRef: "main", sourceCommit: sha, folders: ["lab"], emptyFolders: [] },
      { status: "ready" as const, repo: "Org/Unknown", sourceRef: "main", sourceCommit: sha, folders: ["lab"] },
    ] };
    expect(folderInventory(discovery, profile)).toEqual({ status: "complete", targets: [
      { owner: "Org", repo: "Work", sourceRef: "main", sourceCommit: sha },
      { owner: "Org", repo: "Unknown", sourceRef: "main", sourceCommit: sha },
    ] });
    expect(folderInventory({ ...discovery, repos: [...discovery.repos, { status: "blocked", repo: "Org/Denied", sourceRef: "main", reason: "access-denied" }] }, profile))
      .toEqual({ status: "incomplete" });
  });
});
