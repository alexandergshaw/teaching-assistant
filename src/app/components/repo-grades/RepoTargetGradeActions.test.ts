import { describe, expect, it } from "vitest";
import { activeTargetRequests, findTargetRequests, latestTargetRequest, multipleTargetRequestMenuItems, visibleTargetRequest } from "./RepoTargetGradeActions";
import type { TargetRequest } from "./useRepoGradeTargetRequests";

const base: TargetRequest = { id: 1, courseId: "course", folder: "Lab 1", repo: null,
  state: "queued", runId: null, inFlight: false, bulk: false, folders: null, repos: null };

describe("targeted grading request display", () => {
  it("shows overlapping requests and keeps selectors scoped to the course and cell", () => {
    const pair = { ...base, id: 2, bulk: true, folder: "*", pairs: [{ folder: "Lab 1", repo: "org/a" }] };
    const other = { ...base, id: 3, courseId: "other" };
    expect(findTargetRequests([base, pair, other], "course", "Lab 1", "ORG/A").map(({ id }) => id)).toEqual([1, 2]);
    expect(findTargetRequests([pair], "course", "Lab 1", "org/b")).toEqual([]);
    expect(findTargetRequests([pair], "course", "Lab 1", null)).toEqual([pair]);
  });
  it("keeps terminal outcomes visible but never presents them as active controls", () => {
    const complete: TargetRequest = { ...base, id: 2, state: "complete", counts: { succeeded: 2 } };
    const stopped: TargetRequest = { ...base, id: 3, state: "stopped", reason: "worker-interrupted" };
    expect(activeTargetRequests([base, complete, stopped])).toEqual([base]);
    expect(latestTargetRequest([complete, stopped])).toEqual(stopped);
    expect(activeTargetRequests([complete, stopped])).toEqual([]);
  });
  it("disables every queue action when status is stale", () => {
    const items = multipleTargetRequestMenuItems([base], false, true, false, () => {}, () => {}, () => {});
    expect(items.every((item) => item.props.disabled)).toBe(true);
    const start = multipleTargetRequestMenuItems([], false, true, false, () => {}, () => {}, () => {});
    expect(start[0].props.disabled).toBe(true);
  });
  it("hides only redundant completion next to a grade and retains non-success and active status", () => {
    const complete: TargetRequest = { ...base, id: 2, state: "complete" };
    const incomplete: TargetRequest = { ...base, id: 3, state: "incomplete" };
    expect(visibleTargetRequest([complete], true)).toBeUndefined();
    expect(visibleTargetRequest([complete], false)).toEqual(complete);
    expect(visibleTargetRequest([incomplete], true)).toEqual(incomplete);
    expect(visibleTargetRequest([base, complete], true)).toEqual(base);
  });
});
