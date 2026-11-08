import { describe, expect, it } from "vitest";
import { appendChatSetupVersion } from "./chatVersionedSetup";
import { planVersionedRegrade } from "./chatVersionedRegrade";
import type { GradeRunItemRequestBody } from "../grading/incrementalRunPlan";

const first = { assignmentInstructions: "Original", rubric: "Old rubric", provider: "gemini" as const, pointsPossible: 10 };
const history1 = appendChatSetupVersion({ current: 0, versions: [] }, 0, first)!;
const history2 = appendChatSetupVersion(history1, 1, { ...first, rubric: "New rubric" })!;
const request = (sourceIndex: number): GradeRunItemRequestBody => ({ ...first, sourceIndex, entry: { student: `Student ${sourceIndex}`, content: "Work", submittedFiles: [], mergedFileCount: 0 } });

describe("versioned regrade planning", () => {
  it("prepares only explicitly selected rows with their retained source and selected setup", () => {
    const rows = [{ sourceIndex: 0, sourceRevision: 3, retainedRequest: request(0), pending: false }, { sourceIndex: 1, sourceRevision: 4, retainedRequest: request(1), pending: true }];
    const original = structuredClone(rows);
    const plan = planVersionedRegrade(history2, 2, rows, [0]);
    expect(plan).toHaveLength(1);
    expect(plan![0]).toMatchObject({ sourceIndex: 0, sourceRevision: 3, setupVersion: 2, request: { rubric: "New rubric", entry: { content: "Work" } } });
    expect(rows).toEqual(original);
    expect(rows[0].retainedRequest.rubric).toBe("Old rubric");
  });

  it("refuses pending, missing, duplicate or inconsistent rows and invalid versions", () => {
    const rows = [{ sourceIndex: 0, sourceRevision: 3, retainedRequest: request(0), pending: true }];
    expect(planVersionedRegrade(history2, 2, rows, [0])).toBeNull();
    expect(planVersionedRegrade(history2, 2, rows, [1])).toBeNull();
    expect(planVersionedRegrade(history2, 2, [{ ...rows[0], pending: false }], [0, 0])).toBeNull();
    expect(planVersionedRegrade(history2, 3, rows, [0])).toBeNull();
    expect(planVersionedRegrade(history2, 2, [{ ...rows[0], retainedRequest: request(1), pending: false }], [0])).toBeNull();
  });
});
