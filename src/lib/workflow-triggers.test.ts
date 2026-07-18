import { describe, it, expect } from "vitest";
import {
  decideCountRise,
  decideThresholdEdge,
  decideRepoPush,
  decideNewMessages,
  decideRepoInactive,
  decideBrokenLinks,
  decideRosterChanged,
  decideDeadlinePassed,
  decideCourseStart,
  decideWorkflowCompleted,
  isTriggerDueForCheck,
  mapTrigger,
  describeTrigger,
  getEventSource,
  EVENT_SOURCES,
  generateWebhookToken,
  lifecycleCooldownElapsed,
  isLifecycleEventType,
  LIFECYCLE_EVENT_TYPES,
  parseInstitutionsConfig,
  ALL_INSTITUTIONS,
  matchRepoPushTriggers,
  advanceRepoPushCursor,
  type WorkflowTrigger,
} from "@/lib/workflow-triggers";
import type { Database, Json } from "./supabase/types";

type TriggerRow = Database["public"]["Tables"]["workflow_triggers"]["Row"];

function makeRow(overrides: Partial<TriggerRow> = {}): TriggerRow {
  return {
    id: "t1",
    user_id: "u1",
    workflow_id: "wf1",
    workflow_name: "My Workflow",
    field_values: { a: "1", b: 2, c: null } as unknown as Json,
    event_type: "submission-received",
    event_config: { institution: "example.edu", threshold: 5 } as unknown as Json,
    cursor: null,
    check_version: 0,
    enabled: true,
    unattended: false,
    provider: null,
    disabled_steps: [] as unknown as Json,
    course_id: null,
    institution: null,
    webhook_token: null,
    last_checked_at: null,
    last_fired_at: null,
    created_at: "2026-07-13T00:00:00.000Z",
    updated_at: "2026-07-13T00:00:00.000Z",
    ...overrides,
  };
}

function makeTrigger(overrides: Partial<WorkflowTrigger> = {}): WorkflowTrigger {
  return {
    id: "t1",
    userId: "u1",
    workflowId: "wf1",
    workflowName: "My Workflow",
    fieldValues: {},
    eventType: "submission-received",
    eventConfig: {},
    cursor: null,
    checkVersion: 0,
    enabled: true,
    unattended: false,
    provider: null,
    disabledSteps: [],
    courseId: null,
    institution: null,
    webhookToken: null,
    lastCheckedAt: null,
    lastFiredAt: null,
    ...overrides,
  };
}

describe("decideCountRise", () => {
  it("first eval sets the baseline and does not fire", () => {
    const d = decideCountRise(null, 5);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ count: 5 });
  });

  it("fires when the current count is higher than last seen", () => {
    const d = decideCountRise({ count: 5 } as unknown as Json, 8);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ count: 8 });
  });

  it("does not fire when the count is equal", () => {
    const d = decideCountRise({ count: 5 } as unknown as Json, 5);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ count: 5 });
  });

  it("does not fire when the count is lower", () => {
    const d = decideCountRise({ count: 5 } as unknown as Json, 3);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ count: 3 });
  });

  it("fires again after a drop and then a rise", () => {
    const dropped = decideCountRise({ count: 5 } as unknown as Json, 2);
    expect(dropped.fired).toBe(false);
    const risen = decideCountRise(dropped.cursor, 4);
    expect(risen.fired).toBe(true);
    expect(risen.cursor).toEqual({ count: 4 });
  });
});

describe("decideThresholdEdge", () => {
  it("first eval never fires and records the above flag", () => {
    const d = decideThresholdEdge(null, 3, 5);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ above: false });
  });

  it("fires on the rising edge across the threshold", () => {
    const base = decideThresholdEdge(null, 3, 5);
    const d = decideThresholdEdge(base.cursor, 6, 5);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ above: true });
  });

  it("does not fire again while staying above", () => {
    const d = decideThresholdEdge({ above: true } as unknown as Json, 9, 5);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ above: true });
  });

  it("fires again after dropping below and rising again", () => {
    const droppedBelow = decideThresholdEdge({ above: true } as unknown as Json, 2, 5);
    expect(droppedBelow.fired).toBe(false);
    expect(droppedBelow.cursor).toEqual({ above: false });
    const risen = decideThresholdEdge(droppedBelow.cursor, 7, 5);
    expect(risen.fired).toBe(true);
    expect(risen.cursor).toEqual({ above: true });
  });

  it("treats an exactly-equal value as at-or-above", () => {
    const d = decideThresholdEdge({ above: false } as unknown as Json, 5, 5);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ above: true });
  });
});

describe("decideRepoPush", () => {
  it("first eval records a baseline and does not fire", () => {
    const d = decideRepoPush(null, [{ repo: "a", lastCommit: "2026-01-01T00:00:00.000Z" }]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ repos: { a: "2026-01-01T00:00:00.000Z" } });
  });

  it("fires when a repo's lastCommit advances to a lexicographically greater ISO string", () => {
    const base = decideRepoPush(null, [{ repo: "a", lastCommit: "2026-01-01T00:00:00.000Z" }]);
    const d = decideRepoPush(base.cursor, [{ repo: "a", lastCommit: "2026-01-05T00:00:00.000Z" }]);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ repos: { a: "2026-01-05T00:00:00.000Z" } });
  });

  it("does not fire when the lastCommit is unchanged", () => {
    const base = decideRepoPush(null, [{ repo: "a", lastCommit: "2026-01-01T00:00:00.000Z" }]);
    const d = decideRepoPush(base.cursor, [{ repo: "a", lastCommit: "2026-01-01T00:00:00.000Z" }]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ repos: { a: "2026-01-01T00:00:00.000Z" } });
  });

  it("fires for a brand-new repo appearing with a commit on a non-first eval", () => {
    const base = decideRepoPush(null, [{ repo: "a", lastCommit: "2026-01-01T00:00:00.000Z" }]);
    const d = decideRepoPush(base.cursor, [
      { repo: "a", lastCommit: "2026-01-01T00:00:00.000Z" },
      { repo: "b", lastCommit: "2026-01-02T00:00:00.000Z" },
    ]);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({
      repos: { a: "2026-01-01T00:00:00.000Z", b: "2026-01-02T00:00:00.000Z" },
    });
  });

  it("a repo with a null lastCommit never triggers a fire by itself", () => {
    const base = decideRepoPush(null, [{ repo: "c", lastCommit: null }]);
    expect(base.fired).toBe(false);
    expect(base.cursor).toEqual({ repos: { c: "" } });
    const d = decideRepoPush(base.cursor, [{ repo: "c", lastCommit: null }]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ repos: { c: "" } });
  });
});

describe("decideNewMessages", () => {
  it("first eval records a baseline and does not fire", () => {
    const d = decideNewMessages(null, [
      { institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" },
    ]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ convs: { "MCC:1": "2026-07-13T10:00:00Z" } });
    expect(d.advanced).toEqual([]);
  });

  it("fires when a conversation's lastMessageAt advances to a lexicographically greater ISO string", () => {
    const base = decideNewMessages(null, [{ institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" }]);
    const d = decideNewMessages(base.cursor, [{ institution: "MCC", id: 1, lastMessageAt: "2026-07-13T15:00:00Z" }]);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ convs: { "MCC:1": "2026-07-13T15:00:00Z" } });
    expect(d.advanced).toEqual(["1"]);
  });

  it("does not fire when the lastMessageAt is unchanged", () => {
    const base = decideNewMessages(null, [{ institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" }]);
    const d = decideNewMessages(base.cursor, [{ institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" }]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ convs: { "MCC:1": "2026-07-13T10:00:00Z" } });
    expect(d.advanced).toEqual([]);
  });

  it("fires for a brand-new conversation appearing with a non-empty lastMessageAt on a non-first eval", () => {
    const base = decideNewMessages(null, [{ institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" }]);
    const d = decideNewMessages(base.cursor, [
      { institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" },
      { institution: "MCC", id: 2, lastMessageAt: "2026-07-13T12:00:00Z" },
    ]);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({
      convs: { "MCC:1": "2026-07-13T10:00:00Z", "MCC:2": "2026-07-13T12:00:00Z" },
    });
    expect(d.advanced).toEqual(["2"]);
  });

  it("a conversation with a null lastMessageAt is stored as empty string and never triggers by itself", () => {
    const base = decideNewMessages(null, [{ institution: "MCC", id: 1, lastMessageAt: null }]);
    expect(base.fired).toBe(false);
    expect(base.cursor).toEqual({ convs: { "MCC:1": "" } });
    expect(base.advanced).toEqual([]);
    const d = decideNewMessages(base.cursor, [{ institution: "MCC", id: 1, lastMessageAt: null }]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ convs: { "MCC:1": "" } });
    expect(d.advanced).toEqual([]);
  });

  it("does not fire when conversations are steady with no changes", () => {
    const base = decideNewMessages(null, [
      { institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" },
      { institution: "MCC", id: 2, lastMessageAt: "2026-07-13T11:00:00Z" },
    ]);
    const d = decideNewMessages(base.cursor, [
      { institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" },
      { institution: "MCC", id: 2, lastMessageAt: "2026-07-13T11:00:00Z" },
    ]);
    expect(d.fired).toBe(false);
    expect(d.advanced).toEqual([]);
  });

  it("legacy cursor { count: 3 } re-baselines silently without firing", () => {
    const d = decideNewMessages({ count: 3 } as unknown as Json, [
      { institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" },
      { institution: "MCC", id: 2, lastMessageAt: "2026-07-13T11:00:00Z" },
    ]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ convs: { "MCC:1": "2026-07-13T10:00:00Z", "MCC:2": "2026-07-13T11:00:00Z" } });
    expect(d.advanced).toEqual([]);
    // The next tick should work normally
    const d2 = decideNewMessages(d.cursor, [
      { institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" },
      { institution: "MCC", id: 2, lastMessageAt: "2026-07-13T12:00:00Z" },
    ]);
    expect(d2.fired).toBe(true);
    expect(d2.advanced).toEqual(["2"]);
  });

  it("cursor round-trip: output from one call feeds into the next", () => {
    const d1 = decideNewMessages(null, [{ institution: "UT", id: 10, lastMessageAt: "2026-07-13T10:00:00Z" }]);
    const d2 = decideNewMessages(d1.cursor, [
      { institution: "UT", id: 10, lastMessageAt: "2026-07-13T15:00:00Z" },
      { institution: "MPCC", id: 20, lastMessageAt: "2026-07-13T11:00:00Z" },
    ]);
    expect(d2.fired).toBe(true);
    expect(d2.cursor).toEqual({
      convs: { "UT:10": "2026-07-13T15:00:00Z", "MPCC:20": "2026-07-13T11:00:00Z" },
    });
    expect(d2.advanced).toEqual(["10", "20"]);
  });

  it("handles multiple institutions keyed correctly", () => {
    const d = decideNewMessages(null, [
      { institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" },
      { institution: "UT", id: 1, lastMessageAt: "2026-07-13T11:00:00Z" },
    ]);
    expect(d.cursor).toEqual({ convs: { "MCC:1": "2026-07-13T10:00:00Z", "UT:1": "2026-07-13T11:00:00Z" } });
  });

  it("advanced field contains ids as strings", () => {
    const base = decideNewMessages(null, [{ institution: "MCC", id: 1, lastMessageAt: "2026-07-13T10:00:00Z" }]);
    const d = decideNewMessages(base.cursor, [
      { institution: "MCC", id: 1, lastMessageAt: "2026-07-13T15:00:00Z" },
      { institution: "MCC", id: 2, lastMessageAt: "2026-07-13T12:00:00Z" },
    ]);
    expect(d.advanced).toEqual(["1", "2"]);
  });
});

describe("decideRepoInactive", () => {
  const now = Date.parse("2026-07-14T00:00:00Z");

  it("first eval records a baseline and does not fire", () => {
    const d = decideRepoInactive(null, [{ repo: "a", lastCommit: "2026-07-13T00:00:00Z" }], 7, now);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ stale: [] });
  });

  it("fires for a repo that becomes newly stale since the last check", () => {
    const base = decideRepoInactive(null, [{ repo: "a", lastCommit: "2026-07-13T00:00:00Z" }], 7, now);
    expect(base.cursor).toEqual({ stale: [] });
    const d = decideRepoInactive(base.cursor, [{ repo: "a", lastCommit: "2026-06-01T00:00:00Z" }], 7, now);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ stale: ["a"] });
  });

  it("does not re-fire for a repo that was already stale last check", () => {
    const base = decideRepoInactive(null, [{ repo: "a", lastCommit: "2026-06-01T00:00:00Z" }], 7, now);
    expect(base.fired).toBe(false);
    expect(base.cursor).toEqual({ stale: ["a"] });
    const d = decideRepoInactive(base.cursor, [{ repo: "a", lastCommit: "2026-06-01T00:00:00Z" }], 7, now);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ stale: ["a"] });
  });

  it("treats a repo with a null lastCommit as stale", () => {
    const base = decideRepoInactive(null, [{ repo: "b", lastCommit: "2026-07-13T00:00:00Z" }], 7, now);
    expect(base.cursor).toEqual({ stale: [] });
    const d = decideRepoInactive(base.cursor, [{ repo: "b", lastCommit: null }], 7, now);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ stale: ["b"] });
  });
});

describe("decideBrokenLinks", () => {
  it("first eval records a baseline and does not fire", () => {
    const d = decideBrokenLinks(null, 3);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ broken: 3 });
  });

  it("fires when the broken count rises", () => {
    const d = decideBrokenLinks({ broken: 3 } as unknown as Json, 5);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ broken: 5 });
  });

  it("does not fire when the count is equal or lower", () => {
    const equal = decideBrokenLinks({ broken: 5 } as unknown as Json, 5);
    expect(equal.fired).toBe(false);
    const lower = decideBrokenLinks({ broken: 5 } as unknown as Json, 2);
    expect(lower.fired).toBe(false);
  });
});

describe("decideRosterChanged", () => {
  it("first eval records a baseline (sig + count) and does not fire", () => {
    const d = decideRosterChanged(null, ["a", "b"]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ sig: "a\nb", count: 2 });
  });

  it("is order-independent - the same ids in a different order do not fire", () => {
    const base = decideRosterChanged(null, ["a", "b", "c"]);
    const d = decideRosterChanged(base.cursor, ["c", "a", "b"]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ sig: "a\nb\nc", count: 3 });
  });

  it("fires when an id is added", () => {
    const base = decideRosterChanged(null, ["a", "b"]);
    const d = decideRosterChanged(base.cursor, ["a", "b", "c"]);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ sig: "a\nb\nc", count: 3 });
  });

  it("fires when an id is removed", () => {
    const base = decideRosterChanged(null, ["a", "b", "c"]);
    const d = decideRosterChanged(base.cursor, ["a", "c"]);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ sig: "a\nc", count: 2 });
  });
});

describe("decideDeadlinePassed", () => {
  it("first eval sets the baseline and does not fire", () => {
    const d = decideDeadlinePassed(null, [{ assignmentId: "a1", name: "Assignment 1", dueAt: "2026-07-10T00:00:00Z" }], "2026-07-14T00:00:00Z");
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ lastCheck: "2026-07-14T00:00:00Z" });
  });

  it("does not fire when no assignment is between lastCheck and now", () => {
    const base = decideDeadlinePassed(null, [], "2026-07-14T00:00:00Z");
    const d = decideDeadlinePassed(base.cursor, [{ assignmentId: "a1", name: "Assignment 1", dueAt: "2026-07-20T00:00:00Z" }], "2026-07-15T00:00:00Z");
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ lastCheck: "2026-07-15T00:00:00Z" });
  });

  it("fires when an assignment dueAt is between lastCheck and now", () => {
    const base = decideDeadlinePassed(null, [], "2026-07-14T00:00:00Z");
    const d = decideDeadlinePassed(base.cursor, [{ assignmentId: "a1", name: "Assignment 1", dueAt: "2026-07-14T12:00:00Z" }], "2026-07-15T00:00:00Z");
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ lastCheck: "2026-07-15T00:00:00Z" });
    expect(d.detail).toContain("Assignment 1");
  });

  it("fires when an assignment dueAt equals now exactly", () => {
    const base = decideDeadlinePassed(null, [], "2026-07-14T00:00:00Z");
    const d = decideDeadlinePassed(base.cursor, [{ assignmentId: "a1", name: "Assignment 1", dueAt: "2026-07-15T00:00:00Z" }], "2026-07-15T00:00:00Z");
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ lastCheck: "2026-07-15T00:00:00Z" });
  });

  it("does not fire for assignments with null dueAt", () => {
    const base = decideDeadlinePassed(null, [], "2026-07-14T00:00:00Z");
    const d = decideDeadlinePassed(base.cursor, [{ assignmentId: "a1", name: "Assignment 1", dueAt: null }], "2026-07-15T00:00:00Z");
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ lastCheck: "2026-07-15T00:00:00Z" });
  });

  it("does not fire for assignments with dueAt in the future", () => {
    const base = decideDeadlinePassed(null, [], "2026-07-14T00:00:00Z");
    const d = decideDeadlinePassed(base.cursor, [{ assignmentId: "a1", name: "Assignment 1", dueAt: "2026-07-20T00:00:00Z" }], "2026-07-15T00:00:00Z");
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ lastCheck: "2026-07-15T00:00:00Z" });
  });

  it("fires for multiple assignments in the interval", () => {
    const base = decideDeadlinePassed(null, [], "2026-07-14T00:00:00Z");
    const d = decideDeadlinePassed(base.cursor, [
      { assignmentId: "a1", name: "Assignment 1", dueAt: "2026-07-14T12:00:00Z" },
      { assignmentId: "a2", name: "Assignment 2", dueAt: "2026-07-14T18:00:00Z" },
    ], "2026-07-15T00:00:00Z");
    expect(d.fired).toBe(true);
    expect(d.detail).toContain("Assignment 1");
    expect(d.detail).toContain("Assignment 2");
  });
});

describe("decideCourseStart", () => {
  it("never fires once the cursor already recorded a fire", () => {
    const d = decideCourseStart({ fired: true } as unknown as Json, "2026-01-01T00:00:00Z", Date.parse("2026-07-14T00:00:00Z"));
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ fired: true });
  });

  it("does not fire when there is no start date", () => {
    const d = decideCourseStart(null, null, Date.parse("2026-07-14T00:00:00Z"));
    expect(d.fired).toBe(false);
  });

  it("does not fire when the start date is in the future", () => {
    const now = Date.parse("2026-07-14T00:00:00Z");
    const d = decideCourseStart(null, "2026-08-01T00:00:00Z", now);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ fired: false });
  });

  it("fires when the start date has been reached", () => {
    const now = Date.parse("2026-07-14T00:00:00Z");
    const d = decideCourseStart(null, "2026-07-01T00:00:00Z", now);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ fired: true });
  });

  it("fires exactly at the start date", () => {
    const now = Date.parse("2026-07-14T00:00:00Z");
    const d = decideCourseStart(null, "2026-07-14T00:00:00Z", now);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ fired: true });
  });

  it("does not fire for an invalid date string", () => {
    const d = decideCourseStart(null, "not-a-date", Date.parse("2026-07-14T00:00:00Z"));
    expect(d.fired).toBe(false);
  });
});

describe("decideWorkflowCompleted", () => {
  it("first eval with a baseline latest run sets the baseline and does not fire", () => {
    const d = decideWorkflowCompleted(null, { baselineLatest: "2026-07-10T00:00:00.000Z", runsSince: [] }, false);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ lastAt: "2026-07-10T00:00:00.000Z" });
  });

  it("first eval with no prior runs does not fire", () => {
    const d = decideWorkflowCompleted(null, { baselineLatest: null, runsSince: [] }, false);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({});
  });

  it("non-null cursor with no new runs does not fire", () => {
    const base = decideWorkflowCompleted(null, { baselineLatest: "2026-07-10T00:00:00.000Z", runsSince: [] }, false);
    const d = decideWorkflowCompleted(base.cursor, { baselineLatest: null, runsSince: [] }, false);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ lastAt: "2026-07-10T00:00:00.000Z" });
  });

  it("fires on a newer run in runsSince and advances the cursor to the max timestamp", () => {
    const base = decideWorkflowCompleted(null, { baselineLatest: "2026-07-10T00:00:00.000Z", runsSince: [] }, false);
    const d = decideWorkflowCompleted(
      base.cursor,
      { baselineLatest: null, runsSince: [{ createdAt: "2026-07-11T00:00:00.000Z", status: "ok" }] },
      false
    );
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ lastAt: "2026-07-11T00:00:00.000Z" });
  });

  it("with requireSuccess, a success (T1) followed by a later error (T2) in the same interval still fires and the cursor advances to T2", () => {
    const base = decideWorkflowCompleted(null, { baselineLatest: "2026-07-10T00:00:00.000Z", runsSince: [] }, true);
    const d = decideWorkflowCompleted(
      base.cursor,
      {
        baselineLatest: null,
        runsSince: [
          { createdAt: "2026-07-11T00:00:00.000Z", status: "ok" },
          { createdAt: "2026-07-12T00:00:00.000Z", status: "error" },
        ],
      },
      true
    );
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ lastAt: "2026-07-12T00:00:00.000Z" });
  });

  it("with requireSuccess, only an errored newer run does not fire but still advances the cursor", () => {
    const base = decideWorkflowCompleted(null, { baselineLatest: "2026-07-10T00:00:00.000Z", runsSince: [] }, true);
    const d = decideWorkflowCompleted(
      base.cursor,
      { baselineLatest: null, runsSince: [{ createdAt: "2026-07-11T00:00:00.000Z", status: "error" }] },
      true
    );
    expect(d.fired).toBe(false);
    // The cursor must still advance to the newer run's timestamp, so this run
    // is not re-examined on the next poll.
    expect(d.cursor).toEqual({ lastAt: "2026-07-11T00:00:00.000Z" });
  });
});

describe("isTriggerDueForCheck", () => {
  it("a webhook trigger is never due", () => {
    const t = makeTrigger({ eventType: "webhook", lastCheckedAt: null });
    expect(isTriggerDueForCheck(t, new Date("2026-07-14T00:00:00Z"))).toBe(false);
  });

  it("a pollable trigger with a null lastCheckedAt is due", () => {
    const t = makeTrigger({ eventType: "submission-received", lastCheckedAt: null });
    expect(isTriggerDueForCheck(t, new Date("2026-07-14T00:00:00Z"))).toBe(true);
  });

  it("is not due when checked recently, within minPollMinutes", () => {
    const source = getEventSource("submission-received");
    expect(source?.minPollMinutes).toBe(15);
    const t = makeTrigger({ eventType: "submission-received", lastCheckedAt: "2026-07-14T00:10:00.000Z" });
    const now = new Date("2026-07-14T00:20:00.000Z");
    expect(isTriggerDueForCheck(t, now)).toBe(false);
  });

  it("is due when checked long ago", () => {
    const t = makeTrigger({ eventType: "submission-received", lastCheckedAt: "2026-07-14T00:10:00.000Z" });
    const now = new Date("2026-07-14T01:00:00.000Z");
    expect(isTriggerDueForCheck(t, now)).toBe(true);
  });
});

describe("mapTrigger", () => {
  it("maps a DB row to its camelCase domain object", () => {
    const row = makeRow({
      id: "t1",
      user_id: "u1",
      workflow_id: "wf1",
      workflow_name: "My Workflow",
      event_type: "repo-push",
      cursor: { count: 3 } as unknown as Json,
      check_version: 4,
      enabled: true,
      unattended: true,
      provider: "gemini",
      course_id: "course-1",
      institution: "example.edu",
      webhook_token: "abc123",
      last_checked_at: "2026-07-13T00:00:00.000Z",
      last_fired_at: "2026-07-12T00:00:00.000Z",
    });
    const t = mapTrigger(row);
    expect(t.id).toBe("t1");
    expect(t.userId).toBe("u1");
    expect(t.workflowId).toBe("wf1");
    expect(t.workflowName).toBe("My Workflow");
    expect(t.eventType).toBe("repo-push");
    expect(t.cursor).toEqual({ count: 3 });
    expect(t.checkVersion).toBe(4);
    expect(t.enabled).toBe(true);
    expect(t.unattended).toBe(true);
    expect(t.provider).toBe("gemini");
    expect(t.courseId).toBe("course-1");
    expect(t.institution).toBe("example.edu");
    expect(t.webhookToken).toBe("abc123");
    expect(t.lastCheckedAt).toBe("2026-07-13T00:00:00.000Z");
    expect(t.lastFiredAt).toBe("2026-07-12T00:00:00.000Z");
  });

  it("coerces field_values and event_config to string-only records", () => {
    const row = makeRow({
      field_values: { a: "1", b: 2, c: null, d: true } as unknown as Json,
      event_config: { institution: "example.edu", threshold: 5, extra: null } as unknown as Json,
    });
    const t = mapTrigger(row);
    expect(t.fieldValues).toEqual({ a: "1" });
    expect(t.eventConfig).toEqual({ institution: "example.edu" });
  });

  it("filters disabled_steps down to numbers only", () => {
    const row = makeRow({ disabled_steps: [0, "1", 2, null, 2.5] as unknown as Json });
    const t = mapTrigger(row);
    expect(t.disabledSteps).toEqual([0, 2, 2.5]);
  });

  it("treats a non-array disabled_steps value as empty", () => {
    const row = makeRow({ disabled_steps: { not: "an array" } as unknown as Json });
    const t = mapTrigger(row);
    expect(t.disabledSteps).toEqual([]);
  });

  it("falls back an unknown event_type to webhook", () => {
    const row = makeRow({ event_type: "not-a-real-event-type" });
    const t = mapTrigger(row);
    expect(t.eventType).toBe("webhook");
  });

  it("defaults check_version to 0 when it is not a number", () => {
    const row = makeRow({ check_version: "oops" as unknown as number });
    const t = mapTrigger(row);
    expect(t.checkVersion).toBe(0);
  });

  it("passes a null cursor through as null", () => {
    const row = makeRow({ cursor: null });
    const t = mapTrigger(row);
    expect(t.cursor).toBeNull();
  });
});

describe("describeTrigger", () => {
  it("describes a trigger with no extra config bits by its source label alone", () => {
    const t = makeTrigger({ eventType: "repo-push", eventConfig: {} });
    expect(describeTrigger(t)).toBe(getEventSource("repo-push")?.label);
  });

  it("appends institution, org, and threshold config bits when present", () => {
    const t = makeTrigger({
      eventType: "needs-grading-threshold",
      eventConfig: { institutions: "MCC", threshold: "5" },
    });
    const desc = describeTrigger(t);
    // Institution acronyms are normalized to uppercase for the summary.
    expect(desc).toContain("MCC");
    expect(desc).toContain(">= 5");
  });

  it("shows 'all institutions' for the wildcard config", () => {
    const t = makeTrigger({
      eventType: "message-received",
      eventConfig: { institutions: "*" },
    });
    expect(describeTrigger(t)).toContain("all institutions");
  });

  it("falls back to the raw event type when the source is unknown", () => {
    const t = makeTrigger({ eventType: "not-a-real-event-type" as unknown as WorkflowTrigger["eventType"] });
    expect(describeTrigger(t)).toBe("not-a-real-event-type");
  });
});

describe("EVENT_SOURCES / getEventSource", () => {
  it("every source has a unique type", () => {
    const types = EVENT_SOURCES.map((s) => s.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it("getEventSource returns the matching source for every registered type", () => {
    for (const s of EVENT_SOURCES) {
      expect(getEventSource(s.type)).toBe(s);
    }
  });

  it("getEventSource returns undefined for an unknown type", () => {
    expect(getEventSource("not-a-real-event-type")).toBeUndefined();
  });

  it("the webhook source has Infinity minPollMinutes and no evaluate function", () => {
    const webhook = getEventSource("webhook");
    expect(webhook).toBeDefined();
    expect(webhook?.minPollMinutes).toBe(Infinity);
    expect(webhook?.evaluate).toBeUndefined();
  });

  it("every polled source (not webhook, not a lifecycle event) has an evaluate function and a finite minPollMinutes", () => {
    for (const s of EVENT_SOURCES) {
      if (s.type === "webhook" || isLifecycleEventType(s.type)) continue;
      expect(typeof s.evaluate).toBe("function");
      expect(Number.isFinite(s.minPollMinutes)).toBe(true);
    }
  });

  it("app-open and app-focused are non-polled, non-server-evaluable app-category sources", () => {
    for (const type of ["app-open", "app-focused"] as const) {
      const s = getEventSource(type);
      expect(s).toBeDefined();
      expect(s?.category).toBe("app");
      expect(s?.serverEvaluable).toBe(false);
      expect(s?.minPollMinutes).toBe(Infinity);
      expect(s?.evaluate).toBeUndefined();
      expect(isLifecycleEventType(type)).toBe(true);
      // never due for the poller
      expect(isTriggerDueForCheck(makeTrigger({ eventType: type, lastCheckedAt: null }), new Date())).toBe(false);
    }
  });
});

describe("lifecycle triggers", () => {
  it("LIFECYCLE_EVENT_TYPES contains exactly app-open and app-focused", () => {
    expect([...LIFECYCLE_EVENT_TYPES].sort()).toEqual(["app-focused", "app-open"]);
    expect(isLifecycleEventType("webhook")).toBe(false);
    expect(isLifecycleEventType("submission-received")).toBe(false);
  });

  it("cooldown has elapsed when the trigger has never fired", () => {
    const t = makeTrigger({ eventType: "app-open", lastFiredAt: null });
    expect(lifecycleCooldownElapsed(t, Date.parse("2026-07-14T00:00:00Z"))).toBe(true);
  });

  it("app-open default cooldown is 5 minutes", () => {
    const firedAt = "2026-07-14T00:00:00Z";
    const t = makeTrigger({ eventType: "app-open", lastFiredAt: firedAt });
    // 4 minutes later: still cooling down
    expect(lifecycleCooldownElapsed(t, Date.parse("2026-07-14T00:04:00Z"))).toBe(false);
    // 5 minutes later: elapsed
    expect(lifecycleCooldownElapsed(t, Date.parse("2026-07-14T00:05:00Z"))).toBe(true);
  });

  it("app-focused default cooldown is 30 minutes", () => {
    const firedAt = "2026-07-14T00:00:00Z";
    const t = makeTrigger({ eventType: "app-focused", lastFiredAt: firedAt });
    expect(lifecycleCooldownElapsed(t, Date.parse("2026-07-14T00:29:00Z"))).toBe(false);
    expect(lifecycleCooldownElapsed(t, Date.parse("2026-07-14T00:30:00Z"))).toBe(true);
  });

  it("honors a custom cooldownMinutes from eventConfig", () => {
    const firedAt = "2026-07-14T00:00:00Z";
    const t = makeTrigger({ eventType: "app-open", lastFiredAt: firedAt, eventConfig: { cooldownMinutes: "1" } });
    expect(lifecycleCooldownElapsed(t, Date.parse("2026-07-14T00:00:30Z"))).toBe(false);
    expect(lifecycleCooldownElapsed(t, Date.parse("2026-07-14T00:01:00Z"))).toBe(true);
  });

  it("falls back to the default cooldown for a non-positive or non-numeric config", () => {
    const firedAt = "2026-07-14T00:00:00Z";
    for (const bad of ["", "0", "-3", "abc"]) {
      const t = makeTrigger({ eventType: "app-open", lastFiredAt: firedAt, eventConfig: { cooldownMinutes: bad } });
      // default 5 min applies
      expect(lifecycleCooldownElapsed(t, Date.parse("2026-07-14T00:04:00Z"))).toBe(false);
      expect(lifecycleCooldownElapsed(t, Date.parse("2026-07-14T00:05:00Z"))).toBe(true);
    }
  });
});

describe("parseInstitutionsConfig", () => {
  it("treats the '*' sentinel as all institutions", () => {
    expect(parseInstitutionsConfig({ institutions: ALL_INSTITUTIONS })).toEqual({ all: true, list: [] });
    expect(parseInstitutionsConfig({ institutions: "*" })).toEqual({ all: true, list: [] });
  });

  it("parses a comma- or newline-separated list, uppercased and de-duplicated", () => {
    expect(parseInstitutionsConfig({ institutions: "mcc, mpcc" })).toEqual({ all: false, list: ["MCC", "MPCC"] });
    expect(parseInstitutionsConfig({ institutions: "MCC\nUT\nMCC" })).toEqual({ all: false, list: ["MCC", "UT"] });
  });

  it("returns an empty list when blank (caller falls back to the active institution)", () => {
    expect(parseInstitutionsConfig({})).toEqual({ all: false, list: [] });
    expect(parseInstitutionsConfig({ institutions: "   " })).toEqual({ all: false, list: [] });
  });

  it("falls back to the legacy singular 'institution' key", () => {
    expect(parseInstitutionsConfig({ institution: "ut" })).toEqual({ all: false, list: ["UT"] });
  });

  it("prefers the plural 'institutions' key over the singular one", () => {
    expect(parseInstitutionsConfig({ institutions: "MCC", institution: "UT" })).toEqual({ all: false, list: ["MCC"] });
  });

  it("drops a stray '*' mixed into an explicit list", () => {
    expect(parseInstitutionsConfig({ institutions: "MCC,*,UT" })).toEqual({ all: false, list: ["MCC", "UT"] });
  });
});

describe("generateWebhookToken", () => {
  it("returns a 64-char lowercase hex-ish string with no dashes", () => {
    const token = generateWebhookToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
    expect(token).not.toContain("-");
  });

  it("two calls produce different tokens", () => {
    const a = generateWebhookToken();
    const b = generateWebhookToken();
    expect(a).not.toBe(b);
  });
});

describe("matchRepoPushTriggers", () => {
  it("matches triggers with matching org (case-insensitive) and no prefix", () => {
    const triggers = [
      makeTrigger({
        id: "t1",
        eventType: "repo-push",
        eventConfig: { org: "acme" },
      }),
    ];
    const matches = matchRepoPushTriggers(triggers, "ACME", "some-repo");
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("t1");
  });

  it("matches triggers with matching org and repo prefix (case-insensitive)", () => {
    const triggers = [
      makeTrigger({
        id: "t1",
        eventType: "repo-push",
        eventConfig: { org: "acme", prefix: "cs101-" },
      }),
    ];
    const matches = matchRepoPushTriggers(triggers, "ACME", "cs101-jane");
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("t1");
  });

  it("does not match when prefix does not match", () => {
    const triggers = [
      makeTrigger({
        id: "t1",
        eventType: "repo-push",
        eventConfig: { org: "acme", prefix: "cs101-" },
      }),
    ];
    const matches = matchRepoPushTriggers(triggers, "acme", "misc-jane");
    expect(matches).toHaveLength(0);
  });

  it("matches multiple triggers for the same push when multiple rules apply", () => {
    const triggers = [
      makeTrigger({
        id: "t1",
        eventType: "repo-push",
        eventConfig: { org: "acme" },
      }),
      makeTrigger({
        id: "t2",
        eventType: "repo-push",
        eventConfig: { org: "acme", prefix: "cs101-" },
      }),
    ];
    const matches = matchRepoPushTriggers(triggers, "ACME", "cs101-jane");
    expect(matches).toHaveLength(2);
    expect(matches.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
  });

  it("does not match different organizations", () => {
    const triggers = [
      makeTrigger({
        id: "t1",
        eventType: "repo-push",
        eventConfig: { org: "other" },
      }),
    ];
    const matches = matchRepoPushTriggers(triggers, "acme", "any-repo");
    expect(matches).toHaveLength(0);
  });

  it("never matches non-repo-push triggers", () => {
    const triggers = [
      makeTrigger({
        id: "t1",
        eventType: "submission-received",
        eventConfig: { org: "acme" },
      }),
    ];
    const matches = matchRepoPushTriggers(triggers, "acme", "any-repo");
    expect(matches).toHaveLength(0);
  });

  it("handles a complex scenario with mixed org/prefix rules", () => {
    const triggers = [
      makeTrigger({
        id: "t1",
        eventType: "repo-push",
        eventConfig: { org: "acme" },
      }),
      makeTrigger({
        id: "t2",
        eventType: "repo-push",
        eventConfig: { org: "acme", prefix: "cs101-" },
      }),
      makeTrigger({
        id: "t3",
        eventType: "repo-push",
        eventConfig: { org: "other" },
      }),
    ];
    const push1 = matchRepoPushTriggers(triggers, "acme", "misc");
    expect(push1.map((t) => t.id)).toEqual(["t1"]);
    const push2 = matchRepoPushTriggers(triggers, "acme", "cs101-jane");
    expect(push2.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
    const push3 = matchRepoPushTriggers(triggers, "other", "x");
    expect(push3.map((t) => t.id)).toEqual(["t3"]);
  });
});

describe("advanceRepoPushCursor", () => {
  it("advances a null cursor to a new repo entry", () => {
    const result = advanceRepoPushCursor(null, "my-repo", "2026-07-14T12:00:00Z");
    expect(result).toEqual({ repos: { "my-repo": "2026-07-14T12:00:00Z" } });
  });

  it("advances an empty object cursor to a new repo entry", () => {
    const result = advanceRepoPushCursor({} as Json, "my-repo", "2026-07-14T12:00:00Z");
    expect(result).toEqual({ repos: { "my-repo": "2026-07-14T12:00:00Z" } });
  });

  it("preserves existing repos when adding a new one", () => {
    const cursor = { repos: { "other-repo": "2026-07-01T00:00:00Z" } } as Json;
    const result = advanceRepoPushCursor(cursor, "my-repo", "2026-07-14T12:00:00Z");
    expect(result).toEqual({
      repos: {
        "other-repo": "2026-07-01T00:00:00Z",
        "my-repo": "2026-07-14T12:00:00Z",
      },
    });
  });

  it("updates an existing repo's timestamp", () => {
    const cursor = { repos: { "my-repo": "2026-07-01T00:00:00Z" } } as Json;
    const result = advanceRepoPushCursor(cursor, "my-repo", "2026-07-14T12:00:00Z");
    expect(result).toEqual({
      repos: { "my-repo": "2026-07-14T12:00:00Z" },
    });
  });

  it("preserves other top-level cursor keys when advancing", () => {
    const cursor = { repos: { "other-repo": "2026-07-01T00:00:00Z" }, foo: 1, bar: "baz" } as Json;
    const result = advanceRepoPushCursor(cursor, "my-repo", "2026-07-14T12:00:00Z");
    expect(result).toEqual({
      foo: 1,
      bar: "baz",
      repos: {
        "other-repo": "2026-07-01T00:00:00Z",
        "my-repo": "2026-07-14T12:00:00Z",
      },
    });
  });

  it("handles a non-object cursor by treating it as empty", () => {
    const result = advanceRepoPushCursor("not-an-object" as unknown as Json, "my-repo", "2026-07-14T12:00:00Z");
    expect(result).toEqual({ repos: { "my-repo": "2026-07-14T12:00:00Z" } });
  });

  it("handles a cursor with a non-object repos key by treating repos as empty", () => {
    const cursor = { repos: "invalid", other: "data" } as unknown as Json;
    const result = advanceRepoPushCursor(cursor, "my-repo", "2026-07-14T12:00:00Z");
    expect(result).toEqual({
      other: "data",
      repos: { "my-repo": "2026-07-14T12:00:00Z" },
    });
  });
});
