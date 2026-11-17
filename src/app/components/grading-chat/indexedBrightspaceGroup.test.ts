import { expect, it } from "vitest";
import type { RecoverableGroup } from "@/lib/grade/large-zip-subset";
import { includeAllReviewedFiles, indexedBrightspaceGroup } from "./indexedBrightspaceGroup";

it("holds multiple files without complete indexed attempt evidence", () => {
  const group = { label: "1-2", sourceIdentifier: "1-2", members: [{ path: "1-2 - one.txt" }, { path: "1-2 - two.txt" }] } as unknown as RecoverableGroup;
  expect(indexedBrightspaceGroup(group, false).reason).toBe("held for review");
  expect(indexedBrightspaceGroup(group, true, [{ stem: "1-2 - one", submitted: "Nov 5, 2026 735 PM" }]).reason).toBe("held for review");
});

it("holds different file upload times without discarding the project", () => {
  const project = "1-2 - Student-Nov 12, 2026 703 PM", document = "1-2 - Student-Nov 12, 2026 707 PM";
  const group = { label: "1-2", sourceIdentifier: "1-2", reason: "nested archive", members: [{ path: `${project}.zip`, nestedArchive: true }, { path: `${document}.docx`, nestedArchive: false }] } as unknown as RecoverableGroup;
  const result = indexedBrightspaceGroup(group, true, [{ stem: project, submitted: "Nov 12, 2026 703 PM" }, { stem: document, submitted: "Nov 12, 2026 707 PM" }]);
  expect(result.reason).toBe("held for review"); expect(result.members).toEqual(group.members); expect(result.historicalPaths).toBeUndefined();
  const reviewed = includeAllReviewedFiles(result, group);
  expect(reviewed).toMatchObject({ reason: "nested archive", allFilesReviewed: true }); expect(reviewed?.members).toEqual(group.members);
  expect(includeAllReviewedFiles(result, { ...group, members: group.members.slice(1) })).toBeNull();
});
