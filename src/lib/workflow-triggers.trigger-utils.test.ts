import { describe, it, expect } from "vitest";
import {
  isTriggerDueForCheck,
  mapTrigger,
  decideStaleTriggerRecovery,
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
  updateWorkflowTrigger,
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
    last_run_status: null,
    last_run_detail: null,
    recovery_attempts: 0,
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
    lastRunStatus: null,
    lastRunDetail: null,
    recoveryAttempts: 0,
    ...overrides,
  };
}

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

describe("decideStaleTriggerRecovery", () => {
  it("says interrupted and that no retry was scheduled", () => {
    const d = decideStaleTriggerRecovery();
    expect(d.detail).toMatch(/interrupted/);
    expect(d.detail).toMatch(/no retry was scheduled/);
  });
});

describe("mapTrigger", () => {
  it("round-trips lastRunStatus and lastRunDetail when set", () => {
    const row = makeRow({ last_run_status: "ok", last_run_detail: "completed successfully" });
    const t = mapTrigger(row);
    expect(t.lastRunStatus).toBe("ok");
    expect(t.lastRunDetail).toBe("completed successfully");
  });

  it("maps lastRunStatus and lastRunDetail as null when not set", () => {
    const row = makeRow({ last_run_status: null, last_run_detail: null });
    const t = mapTrigger(row);
    expect(t.lastRunStatus).toBeNull();
    expect(t.lastRunDetail).toBeNull();
  });

  it("maps recovery_attempts, defaulting to 0", () => {
    expect(mapTrigger(makeRow()).recoveryAttempts).toBe(0);
    expect(mapTrigger(makeRow({ recovery_attempts: 2 })).recoveryAttempts).toBe(2);
  });

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

  it("passes through the cartridge-uploaded event type correctly", () => {
    const row = makeRow({ event_type: "cartridge-uploaded" });
    const t = mapTrigger(row);
    expect(t.eventType).toBe("cartridge-uploaded");
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
  it("the exact set of event source types (canary)", () => {
    const types = EVENT_SOURCES.map((s) => s.type).sort();
    expect(types).toEqual([
      "app-focused",
      "app-open",
      "broken-links",
      "cartridge-uploaded",
      "course-start",
      "deadline-passed",
      "lms-email-received",
      "message-received",
      "needs-grading-threshold",
      "repo-inactive",
      "repo-push",
      "roster-changed",
      "submission-received",
      "unread-threshold",
      "webhook",
      "workflow-completed",
    ]);
  });

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
      expect(isTriggerDueForCheck(makeTrigger({ eventType: type, lastCheckedAt: null }), new Date())).toBe(false);
    }
  });

  it("cartridge-uploaded event source has serverEvaluable true", () => {
    const s = getEventSource("cartridge-uploaded");
    expect(s).toBeDefined();
    expect(s?.serverEvaluable).toBe(true);
    expect(s?.evaluate).toBeDefined();
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
    expect(lifecycleCooldownElapsed(t, Date.parse("2026-07-14T00:04:00Z"))).toBe(false);
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

describe("updateWorkflowTrigger field mapping", () => {
  it("accepts eventType for trigger updates", () => {
    const fields: Parameters<typeof updateWorkflowTrigger>[3] = {
      eventType: "webhook",
    };
    expect(fields.eventType).toBe("webhook");
  });

  it("accepts eventConfig for trigger updates", () => {
    const fields: Parameters<typeof updateWorkflowTrigger>[3] = {
      eventConfig: { institution: "example.edu", threshold: "5" },
    };
    expect(fields.eventConfig).toEqual({ institution: "example.edu", threshold: "5" });
  });

  it("accepts unattended for trigger updates", () => {
    const fields: Parameters<typeof updateWorkflowTrigger>[3] = {
      unattended: true,
    };
    expect(fields.unattended).toBe(true);
  });

  it("accepts courseId and institution for trigger updates", () => {
    const fields: Parameters<typeof updateWorkflowTrigger>[3] = {
      courseId: "course123",
      institution: "example.edu",
    };
    expect(fields.courseId).toBe("course123");
    expect(fields.institution).toBe("example.edu");
  });

  it("accepts cursor for trigger updates", () => {
    const fields: Parameters<typeof updateWorkflowTrigger>[3] = {
      cursor: { count: 5 } as unknown as Json,
    };
    expect(fields.cursor).toEqual({ count: 5 });
  });
});
