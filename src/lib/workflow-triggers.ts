// Event-triggered workflow runs. Alongside MANUAL (a Run click) and TIME
// (workflow_schedules) triggers, an EVENT trigger runs a workflow when a
// condition is observed - a new submission, a new message, a repo push,
// another workflow completing, an inbound webhook, and so on.
//
// This environment has no LMS/GitHub webhooks (Vercel Hobby), so every event
// source is POLLED: the app-open watcher (WorkflowTriggerWatcher) and the
// Vercel Cron route each evaluate a trigger's event source on a tick, compare
// the current state against the trigger's stored `cursor`, and fire the
// workflow once when the event happens. Firing is deduped with an
// optimistic-lock `check_version` claim so two pollers (a browser tab and the
// cron) can never double-fire the same event.
//
// This module must stay server-safe: no "use client", no window/DOM access.
// It is imported by the client watcher (RPC-calls the server actions below),
// by the Vercel Cron route, and by the webhook route. The server actions it
// calls all run under an owner context (a signed-in session on the client, or
// runAsOwner on the server), exactly like the schedule runner.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";
import {
  getInstitutionCountsAction,
  getUnreadCountsAction,
  checkStudentActivityAction,
  checkBrokenLinksAction,
  listCourseRosterAction,
  listCourseHubAction,
  listConfiguredInstitutionsAction,
  listCourseAssignmentDueDatesAction,
  listConversationsAction,
} from "@/app/actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TriggerEventType =
  | "submission-received"
  | "needs-grading-threshold"
  | "message-received"
  | "unread-threshold"
  | "repo-push"
  | "repo-inactive"
  | "broken-links"
  | "roster-changed"
  | "course-start"
  | "workflow-completed"
  | "webhook"
  | "app-open"
  | "app-focused"
  | "deadline-passed";

export type TriggerEventCategory =
  | "lms"
  | "github"
  | "course"
  | "workflow"
  | "external"
  | "app";

export interface TriggerConfigField {
  key: string;
  label: string;
  type:
    | "text"
    | "number"
    | "institution"
    | "institutions"
    | "org"
    | "lmsCourse"
    | "course"
    | "workflow"
    | "boolean";
  required: boolean;
  help?: string;
}

/** The decision an event source reaches on one poll tick. */
export interface TriggerEvalResult {
  /** True when the event fired this tick and the workflow should run. */
  fired: boolean;
  /** The new dedup state to persist (ALWAYS, fired or not). */
  cursor: Json;
  /** Human-readable one-line summary of what was observed. */
  detail: string;
  /** Optional overlay merged onto the run's field_values when firing (e.g. the
   * observed count), so the workflow can read what the event carried. */
  fireValues?: Record<string, string>;
}

export interface TriggerEvalContext {
  /** Falls back for event sources whose institution config is blank. */
  activeInstitution: string | null;
  /** Looks up the most recent run of a workflow (workflow-completed source);
   * injected by the caller so this module needs no direct workflow_runs import
   * cycle. Returns null when the workflow has never run. */
  latestRun?: (
    workflowId: string
  ) => Promise<{ createdAt: string; status: string } | null>;
  /** All runs of a workflow strictly newer than the given ISO timestamp,
   * oldest first (workflow-completed source). Lets decideWorkflowCompleted
   * reason over every run in the interval, not just the newest, so a success
   * is not masked by a later error within the same poll tick. */
  runsSince?: (
    workflowId: string,
    sinceIso: string
  ) => Promise<Array<{ createdAt: string; status: string }>>;
}

export interface EventSourceDef {
  type: TriggerEventType;
  label: string;
  description: string;
  category: TriggerEventCategory;
  configFields: TriggerConfigField[];
  /** Minimum minutes between polls for this source (throttle). Infinity for
   * sources that are never polled (webhook). */
  minPollMinutes: number;
  /** Whether this source can be evaluated server-side (unattended cron). All
   * current sources can, but the flag keeps the door open for browser-only ones. */
  serverEvaluable: boolean;
  /** Absent for the webhook source (fired by the inbound endpoint, not polled). */
  evaluate?: (
    config: Record<string, string>,
    cursor: Json | null,
    ctx: TriggerEvalContext
  ) => Promise<TriggerEvalResult>;
}

export interface WorkflowTrigger {
  id: string;
  userId: string;
  workflowId: string;
  workflowName: string;
  fieldValues: Record<string, string>;
  eventType: TriggerEventType;
  eventConfig: Record<string, string>;
  cursor: Json | null;
  checkVersion: number;
  enabled: boolean;
  unattended: boolean;
  provider: string | null;
  disabledSteps: number[];
  courseId: string | null;
  institution: string | null;
  webhookToken: string | null;
  lastCheckedAt: string | null;
  lastFiredAt: string | null;
}

// ---------------------------------------------------------------------------
// Cursor helpers (safe reads over the loosely-typed Json cursor)
// ---------------------------------------------------------------------------

function asObject(cursor: Json | null): Record<string, unknown> | null {
  if (cursor && typeof cursor === "object" && !Array.isArray(cursor)) {
    return cursor as Record<string, unknown>;
  }
  return null;
}

function readNum(cursor: Json | null, key: string): number | null {
  const o = asObject(cursor);
  const v = o?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function readBool(cursor: Json | null, key: string): boolean | null {
  const o = asObject(cursor);
  const v = o?.[key];
  return typeof v === "boolean" ? v : null;
}

function readStr(cursor: Json | null, key: string): string | null {
  const o = asObject(cursor);
  const v = o?.[key];
  return typeof v === "string" ? v : null;
}

function readStringArray(cursor: Json | null, key: string): string[] | null {
  const o = asObject(cursor);
  const v = o?.[key];
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is string => typeof x === "string");
}

function readStringMap(cursor: Json | null, key: string): Record<string, string> | null {
  const o = asObject(cursor);
  const v = o?.[key];
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pure deciders - the testable heart of each event source. Each takes the
// prior cursor plus the freshly-fetched observation and returns whether to
// fire and the next cursor. The FIRST evaluation (cursor null) establishes a
// baseline and never fires, so a trigger never fires on a pre-existing backlog
// the moment it is created (course-start is the deliberate exception - a
// genuine one-time future event we DO want to catch the first time).
// ---------------------------------------------------------------------------

type Decision = { fired: boolean; cursor: Json; detail: string };

/** Fire when a new message lands in a conversation thread or a new conversation
 * appears. Returns a Decision with an additional `advanced` field containing
 * conversation IDs (or a count string) of the new/advanced conversations, for
 * the evaluator to emit in fireValues.
 *
 * Canvas orders conversations by recency, so a thread reappearing on the first
 * page (a new entry in rows) or a timestamp advance implies a new message. */
export function decideNewMessages(
  cursor: Json | null,
  rows: Array<{ institution: string; id: number; lastMessageAt: string | null }>
): { fired: boolean; cursor: Json; detail: string; advanced: string[] } {
  const prev = readStringMap(cursor, "convs");
  const firstEval = prev === null;
  const curr: Record<string, string> = {};
  const advanced: string[] = [];

  for (const r of rows) {
    const key = `${r.institution}:${r.id}`;
    const lma = r.lastMessageAt ?? "";
    curr[key] = lma;
    if (firstEval || !lma) continue;
    const p = prev[key];
    const isNew = p === undefined;
    if ((isNew || lma > p) && lma) advanced.push(String(r.id));
  }

  const fired = !firstEval && advanced.length > 0;
  return {
    fired,
    cursor: { convs: curr },
    detail: firstEval
      ? `Baseline: ${rows.length} conversation(s).`
      : fired
        ? `New messages: ${advanced.length > 5 ? advanced.length : advanced.join(", ")}`
        : "No new messages.",
    advanced,
  };
}

/** Fire when the current count strictly exceeds the last-seen count. */
export function decideCountRise(cursor: Json | null, current: number): Decision {
  const prev = readNum(cursor, "count");
  if (prev === null) {
    return { fired: false, cursor: { count: current }, detail: `Baseline set at ${current}.` };
  }
  const fired = current > prev;
  return {
    fired,
    cursor: { count: current },
    detail: fired ? `Rose from ${prev} to ${current}.` : `Steady at ${current} (was ${prev}).`,
  };
}

/** Fire on the rising edge across a threshold (below -> at-or-above). */
export function decideThresholdEdge(cursor: Json | null, current: number, threshold: number): Decision {
  const isAbove = current >= threshold;
  const wasAbove = readBool(cursor, "above");
  if (wasAbove === null) {
    return { fired: false, cursor: { above: isAbove }, detail: `Baseline: ${current} (threshold ${threshold}).` };
  }
  const fired = isAbove && !wasAbove;
  return {
    fired,
    cursor: { above: isAbove },
    detail: fired ? `Crossed ${threshold} (now ${current}).` : `${current} vs threshold ${threshold}.`,
  };
}

/** Fire when any repo's last-commit timestamp advances (a push), or a new repo
 * appears with commits after the baseline. */
export function decideRepoPush(
  cursor: Json | null,
  rows: Array<{ repo: string; lastCommit: string | null }>
): Decision {
  const prev = readStringMap(cursor, "repos");
  const firstEval = prev === null;
  const curr: Record<string, string> = {};
  const advanced: string[] = [];
  for (const r of rows) {
    const lc = r.lastCommit ?? "";
    curr[r.repo] = lc;
    if (firstEval || !lc) continue;
    const p = prev[r.repo];
    const isNew = p === undefined;
    if ((isNew || lc > p) && lc) advanced.push(r.repo);
  }
  const fired = !firstEval && advanced.length > 0;
  return {
    fired,
    cursor: { repos: curr },
    detail: firstEval
      ? `Baseline: ${rows.length} repo(s).`
      : fired
        ? `New commits: ${advanced.join(", ")}`
        : "No new commits.",
  };
}

/** Fire for repos that became stale since the last check (crossed into the
 * no-commit-in-N-days window). `now` is passed in for testability. */
export function decideRepoInactive(
  cursor: Json | null,
  rows: Array<{ repo: string; lastCommit: string | null }>,
  staleDays: number,
  now: number
): Decision {
  const cutoff = now - staleDays * 86_400_000;
  const currStale = rows
    .filter((r) => {
      if (!r.lastCommit) return true;
      const t = Date.parse(r.lastCommit);
      return Number.isNaN(t) || t < cutoff;
    })
    .map((r) => r.repo);
  const prevStale = readStringArray(cursor, "stale");
  const firstEval = prevStale === null;
  const newlyStale = firstEval ? [] : currStale.filter((x) => !prevStale.includes(x));
  const fired = newlyStale.length > 0;
  return {
    fired,
    cursor: { stale: currStale },
    detail: firstEval
      ? `Baseline: ${currStale.length} stale.`
      : fired
        ? `Newly inactive: ${newlyStale.join(", ")}`
        : `${currStale.length} stale, none new.`,
  };
}

/** Fire when the broken-link count rises above the last-seen count. */
export function decideBrokenLinks(cursor: Json | null, brokenCount: number): Decision {
  const prev = readNum(cursor, "broken");
  if (prev === null) {
    return { fired: false, cursor: { broken: brokenCount }, detail: `Baseline: ${brokenCount} broken.` };
  }
  const fired = brokenCount > prev;
  return {
    fired,
    cursor: { broken: brokenCount },
    detail: fired ? `Broken links rose ${prev} -> ${brokenCount}.` : `${brokenCount} broken link(s).`,
  };
}

/** Fire when the set of roster member ids changes (enroll or drop). */
export function decideRosterChanged(cursor: Json | null, memberIds: string[]): Decision {
  const sig = [...memberIds].sort().join("\n");
  const prev = readStr(cursor, "sig");
  const count = memberIds.length;
  if (prev === null) {
    return { fired: false, cursor: { sig, count }, detail: `Baseline: ${count} member(s).` };
  }
  const fired = sig !== prev;
  const prevCount = readNum(cursor, "count") ?? 0;
  return {
    fired,
    cursor: { sig, count },
    detail: fired ? `Roster changed: ${prevCount} -> ${count}.` : `Unchanged (${count}).`,
  };
}

/** One-shot: fire the first time the course start date is reached. Unlike the
 * other deciders this DOES fire on its first true observation - a course start
 * is a genuine scheduled event, not a pre-existing backlog. */
export function decideCourseStart(cursor: Json | null, startDateIso: string | null, now: number): Decision {
  if (readBool(cursor, "fired") === true) {
    return { fired: false, cursor: { fired: true }, detail: "Already fired." };
  }
  if (!startDateIso) {
    return { fired: false, cursor: cursor ?? {}, detail: "No start date set." };
  }
  const startMs = Date.parse(startDateIso);
  if (Number.isNaN(startMs)) {
    return { fired: false, cursor: cursor ?? {}, detail: "Invalid start date." };
  }
  const reached = now >= startMs;
  return {
    fired: reached,
    cursor: reached ? { fired: true } : { fired: false },
    detail: reached ? "Course start reached." : `Starts ${startDateIso}.`,
  };
}

/** Pure: decide whether any assignment deadline crossed since the last check.
 * First evaluation sets a baseline and does NOT fire (so already-passed
 * deadlines from before the trigger existed are ignored). */
export function decideDeadlinePassed(
  cursor: Json | null,
  assignments: Array<{ assignmentId: string; name: string; dueAt: string | null }>,
  nowIso: string
): { fired: boolean; cursor: Json; detail: string } {
  const prev = asObject(cursor);
  const lastCheck = prev && typeof prev.lastCheck === "string" ? (prev.lastCheck as string) : null;
  const now = new Date(nowIso).getTime();
  if (!lastCheck) {
    return { fired: false, cursor: { lastCheck: nowIso }, detail: "Baseline set; will fire when a deadline passes." };
  }
  const last = new Date(lastCheck).getTime();
  const passed = assignments.filter((a) => {
    if (!a.dueAt) return false;
    const due = new Date(a.dueAt).getTime();
    return Number.isFinite(due) && due > last && due <= now;
  });
  if (passed.length === 0) {
    return { fired: false, cursor: { lastCheck: nowIso }, detail: "No deadlines passed." };
  }
  return { fired: true, cursor: { lastCheck: nowIso }, detail: `Deadline passed: ${passed.map((a) => a.name).join(", ")}` };
}

/** Fire when a run of the source workflow appears among `runsSince` that
 * qualifies (optionally only successful runs). Reasons over ALL runs newer
 * than the cursor, not just the newest, so a success at T1 followed by an
 * error at T2 within one poll interval still fires (the cursor would
 * otherwise advance past T1's success and bury it). The cursor advances to
 * the newest seen run even when every run is filtered out, so an errored run
 * is not re-examined forever. */
export function decideWorkflowCompleted(
  cursor: Json | null,
  input: { baselineLatest: string | null; runsSince: Array<{ createdAt: string; status: string }> },
  requireSuccess: boolean
): Decision {
  const lastAt = readStr(cursor, "lastAt");
  if (lastAt === null) {
    // First eval: baseline to the newest run overall; never fire on history.
    return {
      fired: false,
      cursor: input.baselineLatest ? { lastAt: input.baselineLatest } : cursor ?? {},
      detail: "Baseline set.",
    };
  }
  if (input.runsSince.length === 0) {
    return { fired: false, cursor: { lastAt }, detail: "No new runs." };
  }
  const maxAt = input.runsSince.reduce((m, r) => (r.createdAt > m ? r.createdAt : m), lastAt);
  const qualifying = input.runsSince.filter((r) => !requireSuccess || r.status === "ok");
  return {
    fired: qualifying.length > 0,
    cursor: { lastAt: maxAt },
    detail: qualifying.length ? `${qualifying.length} completion(s).` : "Only ignored runs.",
  };
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function resolveInstitution(config: Record<string, string>, ctx: TriggerEvalContext): string {
  return (config.institution || ctx.activeInstitution || "").trim();
}

/** The special config value meaning "every institution the server is
 * configured for" - expanded server-side at evaluation time so it stays
 * current as institutions are added, without snapshotting a list. */
export const ALL_INSTITUTIONS = "*";

/** Parse an institutions config value (from the multi-select) into either the
 * "all" sentinel or an explicit, de-duplicated, uppercased acronym list. Pure
 * and testable; the acronyms are comma- or newline-separated. Reads the plural
 * `institutions` key, falling back to the legacy singular `institution`. */
export function parseInstitutionsConfig(config: Record<string, string>): { all: boolean; list: string[] } {
  const raw = (config.institutions ?? config.institution ?? "").trim();
  if (raw === ALL_INSTITUTIONS) return { all: true, list: [] };
  const list = [
    ...new Set(
      raw
        .split(/[,\n]/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .filter((s) => s !== ALL_INSTITUTIONS)
    ),
  ];
  return { all: false, list };
}

/** Resolve an institutions config to the concrete acronym list to poll: the
 * full configured set for "all" (via the server), the explicit list otherwise,
 * or the active institution as a last resort. Returns a discriminated result so
 * a genuine "all" lookup failure is surfaced by the caller rather than masked as
 * an empty (looks-unconfigured) list. */
async function resolveInstitutionList(
  config: Record<string, string>,
  ctx: TriggerEvalContext
): Promise<{ list: string[] } | { error: string }> {
  const parsed = parseInstitutionsConfig(config);
  if (parsed.all) {
    const r = await listConfiguredInstitutionsAction();
    if ("error" in r) return { error: r.error };
    return { list: r.acronyms };
  }
  if (parsed.list.length > 0) return { list: parsed.list };
  const active = (ctx.activeInstitution || "").trim().toUpperCase();
  return { list: active ? [active] : [] };
}

function parseThreshold(raw: string | undefined, fallback: number): number {
  const n = Number((raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Canvas course id out of a course URL (".../courses/12345"). */
function parseCanvasCourseId(url: string): string | null {
  const m = /courses\/(\d+)/.exec(url);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Event source registry
// ---------------------------------------------------------------------------

export const EVENT_SOURCES: EventSourceDef[] = [
  {
    type: "submission-received",
    label: "A submission is received",
    description: "Fires when the number of submissions waiting to be graded rises - i.e. a student turned something in.",
    category: "lms",
    configFields: [
      { key: "institutions", label: "Institutions", type: "institutions", required: false, help: "Defaults to the active institution; pick several or choose all." },
    ],
    minPollMinutes: 15,
    serverEvaluable: true,
    evaluate: async (config, cursor, ctx) => {
      const resolved = await resolveInstitutionList(config, ctx);
      if ("error" in resolved) return { fired: false, cursor: cursor ?? {}, detail: resolved.error };
      const insts = resolved.list;
      if (insts.length === 0) return { fired: false, cursor: cursor ?? {}, detail: "No institution configured." };
      const r = await getInstitutionCountsAction(insts);
      if ("error" in r) return { fired: false, cursor: cursor ?? {}, detail: r.error };
      const needsGrading = r.counts.reduce((n, c) => n + c.needsGrading, 0);
      const d = decideCountRise(cursor, needsGrading);
      return { ...d, fireValues: { needsGrading: String(needsGrading), institutions: insts.join(", ") } };
    },
  },
  {
    type: "needs-grading-threshold",
    label: "Submissions waiting cross a threshold",
    description: "Fires when the count of submissions needing grading reaches at least N (on the rising edge).",
    category: "lms",
    configFields: [
      { key: "institutions", label: "Institutions", type: "institutions", required: false, help: "Defaults to the active institution; pick several or choose all." },
      { key: "threshold", label: "Threshold", type: "number", required: true, help: "Fire when this many or more are waiting (summed across the institutions)." },
    ],
    minPollMinutes: 15,
    serverEvaluable: true,
    evaluate: async (config, cursor, ctx) => {
      const resolved = await resolveInstitutionList(config, ctx);
      if ("error" in resolved) return { fired: false, cursor: cursor ?? {}, detail: resolved.error };
      const insts = resolved.list;
      if (insts.length === 0) return { fired: false, cursor: cursor ?? {}, detail: "No institution configured." };
      const threshold = parseThreshold(config.threshold, 1);
      const r = await getInstitutionCountsAction(insts);
      if ("error" in r) return { fired: false, cursor: cursor ?? {}, detail: r.error };
      const needsGrading = r.counts.reduce((n, c) => n + c.needsGrading, 0);
      const d = decideThresholdEdge(cursor, needsGrading, threshold);
      return { ...d, fireValues: { needsGrading: String(needsGrading), institutions: insts.join(", ") } };
    },
  },
  {
    type: "message-received",
    label: "A message is received",
    description: "Fires when a new message lands in the inbox - a new conversation appears or an existing thread gets a new message.",
    category: "lms",
    configFields: [
      { key: "institutions", label: "Institutions", type: "institutions", required: false, help: "Defaults to the active institution; pick several or choose all." },
    ],
    minPollMinutes: 15,
    serverEvaluable: true,
    evaluate: async (config, cursor, ctx) => {
      const resolved = await resolveInstitutionList(config, ctx);
      if ("error" in resolved) return { fired: false, cursor: cursor ?? {}, detail: resolved.error };
      const insts = resolved.list;
      if (insts.length === 0) return { fired: false, cursor: cursor ?? {}, detail: "No institution configured." };

      const allRows: Array<{ institution: string; id: number; lastMessageAt: string | null }> = [];
      const allConversations: Array<{ institution: string; workflowState: string }> = [];

      for (const inst of insts) {
        const r = await listConversationsAction(inst);
        if ("error" in r) return { fired: false, cursor: cursor ?? {}, detail: r.error };
        for (const conv of r.conversations) {
          allRows.push({ institution: inst, id: conv.id, lastMessageAt: conv.lastMessageAt });
          allConversations.push({ institution: inst, workflowState: conv.workflowState });
        }
      }

      const d = decideNewMessages(cursor, allRows);
      const unread = allConversations.filter((c) => c.workflowState === "unread").length;

      return {
        ...d,
        fireValues: {
          unread: String(unread),
          institutions: insts.join(", "),
          newMessages: String(d.advanced.length),
        },
      };
    },
  },
  {
    type: "unread-threshold",
    label: "Unread messages cross a threshold",
    description: "Fires when unread inbox messages reach at least N (on the rising edge).",
    category: "lms",
    configFields: [
      { key: "institutions", label: "Institutions", type: "institutions", required: false, help: "Defaults to the active institution; pick several or choose all." },
      { key: "threshold", label: "Threshold", type: "number", required: true, help: "Fire when this many or more are unread (summed across the institutions)." },
    ],
    minPollMinutes: 15,
    serverEvaluable: true,
    evaluate: async (config, cursor, ctx) => {
      const resolved = await resolveInstitutionList(config, ctx);
      if ("error" in resolved) return { fired: false, cursor: cursor ?? {}, detail: resolved.error };
      const insts = resolved.list;
      if (insts.length === 0) return { fired: false, cursor: cursor ?? {}, detail: "No institution configured." };
      const threshold = parseThreshold(config.threshold, 1);
      const r = await getUnreadCountsAction(insts);
      if ("error" in r) return { fired: false, cursor: cursor ?? {}, detail: r.error };
      const unread = r.counts.reduce((n, c) => n + c.unread, 0);
      const d = decideThresholdEdge(cursor, unread, threshold);
      return { ...d, fireValues: { unread: String(unread), institutions: insts.join(", ") } };
    },
  },
  {
    type: "repo-push",
    label: "A student repo gets a push",
    description: "Fires when any repo in the GitHub org receives a new commit since the last check.",
    category: "github",
    configFields: [
      { key: "org", label: "Organization", type: "org", required: true },
      { key: "prefix", label: "Repo name prefix", type: "text", required: false, help: "Only repos whose name starts with this." },
    ],
    minPollMinutes: 15,
    serverEvaluable: true,
    evaluate: async (config, cursor) => {
      const org = (config.org ?? "").trim();
      if (!org) return { fired: false, cursor: cursor ?? {}, detail: "No organization configured." };
      const prefix = (config.prefix ?? "").trim() || undefined;
      const r = await checkStudentActivityAction(org, prefix);
      if ("error" in r) return { fired: false, cursor: cursor ?? {}, detail: r.error };
      const d = decideRepoPush(cursor, r.rows);
      return { ...d, fireValues: { org } };
    },
  },
  {
    type: "repo-inactive",
    label: "A student repo goes inactive",
    description: "Fires when a repo in the org goes stale - no commit within the given number of days.",
    category: "github",
    configFields: [
      { key: "org", label: "Organization", type: "org", required: true },
      { key: "prefix", label: "Repo name prefix", type: "text", required: false, help: "Only repos whose name starts with this." },
      { key: "staleDays", label: "Stale after (days)", type: "number", required: false, help: "Default 7." },
    ],
    minPollMinutes: 60,
    serverEvaluable: true,
    evaluate: async (config, cursor) => {
      const org = (config.org ?? "").trim();
      if (!org) return { fired: false, cursor: cursor ?? {}, detail: "No organization configured." };
      const prefix = (config.prefix ?? "").trim() || undefined;
      const staleDays = parseThreshold(config.staleDays, 7);
      const r = await checkStudentActivityAction(org, prefix);
      if ("error" in r) return { fired: false, cursor: cursor ?? {}, detail: r.error };
      // Date.now is unavailable in some sandboxes but this runs in the browser
      // watcher / Node cron, where it is fine; deciders take `now` explicitly so
      // the pure logic stays testable.
      const d = decideRepoInactive(cursor, r.rows, staleDays, Date.now());
      return { ...d, fireValues: { org } };
    },
  },
  {
    type: "broken-links",
    label: "Broken links appear in a course",
    description: "Fires when a Canvas course's link validation finds more broken links than before. Runs a fresh scan each cycle (results are read on the next).",
    category: "course",
    configFields: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "institution", label: "Institution", type: "institution", required: false, help: "Defaults to the active institution." },
    ],
    minPollMinutes: 60,
    serverEvaluable: true,
    evaluate: async (config, cursor, ctx) => {
      const course = (config.course ?? "").trim();
      if (!course) return { fired: false, cursor: cursor ?? {}, detail: "No course configured." };
      const inst = resolveInstitution(config, ctx) || undefined;
      const brokenBaseline = readNum(cursor, "broken");
      const pending = readBool(cursor, "pending") === true;

      // Two-phase: Canvas link validation is async. On a tick with no scan in
      // flight, kick one off and wait for the next tick to read it.
      if (!pending) {
        const started = await checkBrokenLinksAction(course, inst, true);
        if ("error" in started) return { fired: false, cursor: cursor ?? {}, detail: started.error };
        return {
          fired: false,
          cursor: { pending: true, ...(brokenBaseline !== null ? { broken: brokenBaseline } : {}) },
          detail: "Started a link scan.",
        };
      }

      const r = await checkBrokenLinksAction(course, inst, false);
      if ("error" in r) return { fired: false, cursor: cursor ?? {}, detail: r.error };
      // Still running: stay pending, do not advance the broken baseline.
      if (r.state !== "completed") {
        return {
          fired: false,
          cursor: { pending: true, ...(brokenBaseline !== null ? { broken: brokenBaseline } : {}) },
          detail: `Scan ${r.state}...`,
        };
      }
      const broken = r.links.length;
      const d = decideBrokenLinks(brokenBaseline === null ? null : { broken: brokenBaseline }, broken);
      const nextBroken = readNum(d.cursor, "broken") ?? broken;
      return {
        fired: d.fired,
        cursor: { pending: false, broken: nextBroken },
        detail: d.detail,
        fireValues: { brokenCount: String(broken), course },
      };
    },
  },
  {
    type: "roster-changed",
    label: "The course roster changes",
    description: "Fires when a student is added to or removed from the LMS course's roster.",
    category: "course",
    configFields: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "institution", label: "Institution", type: "institution", required: false, help: "Defaults to the active institution." },
    ],
    minPollMinutes: 60,
    serverEvaluable: true,
    evaluate: async (config, cursor, ctx) => {
      const courseUrl = (config.course ?? "").trim();
      const courseId = parseCanvasCourseId(courseUrl);
      if (!courseId) return { fired: false, cursor: cursor ?? {}, detail: "The course URL has no course id." };
      const inst = resolveInstitution(config, ctx);
      if (!inst) return { fired: false, cursor: cursor ?? {}, detail: "No institution configured." };
      const r = await listCourseRosterAction(inst, courseId);
      if ("error" in r) return { fired: false, cursor: cursor ?? {}, detail: r.error };
      const ids = r.students.map((s) => s.loginId || s.name);
      const d = decideRosterChanged(cursor, ids);
      return { ...d, fireValues: { studentCount: String(ids.length), institution: inst } };
    },
  },
  {
    type: "deadline-passed",
    label: "An assignment deadline passes",
    description: "Fires when an assignment's due date passes in the LMS course - once per deadline, from when the trigger is created onward. Pair it with Zero out missing submissions to auto-draft zeros after each deadline.",
    category: "course",
    configFields: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: false, help: "Leave blank to watch the course the workflow is set for (This workflow is for)." },
      { key: "institution", label: "Institution", type: "institution", required: false, help: "Leave blank to use the workflow's institution, then the active one." },
    ],
    minPollMinutes: 60,
    serverEvaluable: true,
    evaluate: async (config, cursor, ctx) => {
      const courseUrl = (config.course ?? "").trim();
      const courseId = parseCanvasCourseId(courseUrl);
      if (!courseId) return { fired: false, cursor: cursor ?? {}, detail: "The course URL has no course id." };
      const inst = resolveInstitution(config, ctx);
      if (!inst) return { fired: false, cursor: cursor ?? {}, detail: "No institution configured." };
      const r = await listCourseAssignmentDueDatesAction(inst, courseId);
      if ("error" in r) return { fired: false, cursor: cursor ?? {}, detail: r.error };
      const d = decideDeadlinePassed(cursor, r.assignments, new Date().toISOString());
      return { ...d, fireValues: { course: courseUrl } };
    },
  },
  {
    type: "course-start",
    label: "A course start date is reached",
    description: "Fires once when the attached course's start date arrives.",
    category: "course",
    configFields: [
      { key: "courseId", label: "Course", type: "course", required: true, help: "The course whose start date to watch." },
    ],
    minPollMinutes: 60,
    serverEvaluable: true,
    evaluate: async (config, cursor) => {
      const courseId = (config.courseId ?? "").trim();
      if (!courseId) return { fired: false, cursor: cursor ?? {}, detail: "No course configured." };
      const r = await listCourseHubAction();
      if ("error" in r) return { fired: false, cursor: cursor ?? {}, detail: r.error };
      const course = r.courses.find((c) => c.id === courseId);
      if (!course) return { fired: false, cursor: cursor ?? {}, detail: "Course not found." };
      const d = decideCourseStart(cursor, course.startDate, Date.now());
      return { ...d, fireValues: { courseName: course.name } };
    },
  },
  {
    type: "workflow-completed",
    label: "Another workflow completes",
    description: "Fires when a run of the chosen source workflow finishes - the basis for chaining workflows together.",
    category: "workflow",
    configFields: [
      { key: "sourceWorkflowId", label: "Source workflow", type: "workflow", required: true, help: "Run this trigger's workflow after that one completes." },
      { key: "requireSuccess", label: "Only on success", type: "boolean", required: false, help: "Ignore runs that ended in an error." },
    ],
    minPollMinutes: 5,
    serverEvaluable: true,
    evaluate: async (config, cursor, ctx) => {
      const sourceId = (config.sourceWorkflowId ?? "").trim();
      if (!sourceId) return { fired: false, cursor: cursor ?? {}, detail: "No source workflow configured." };
      const requireSuccess = config.requireSuccess === "1" || config.requireSuccess === "true";
      const lastAt = readStr(cursor, "lastAt");
      if (lastAt === null) {
        const latest = ctx.latestRun ? await ctx.latestRun(sourceId) : null;
        return decideWorkflowCompleted(cursor, { baselineLatest: latest?.createdAt ?? null, runsSince: [] }, requireSuccess);
      }
      const runs = ctx.runsSince ? await ctx.runsSince(sourceId, lastAt) : [];
      return decideWorkflowCompleted(cursor, { baselineLatest: null, runsSince: runs }, requireSuccess);
    },
  },
  {
    type: "webhook",
    label: "An external webhook is called",
    description: "Fires when an external system POSTs to this trigger's secret URL. Never polled.",
    category: "external",
    configFields: [],
    minPollMinutes: Infinity,
    serverEvaluable: false,
  },
  {
    type: "app-open",
    label: "The app is opened",
    description: "Runs when you open the app - a fresh load, or returning after it was closed. Only fires while the app is open; not eligible for cloud runs.",
    category: "app",
    configFields: [
      { key: "cooldownMinutes", label: "Minimum minutes between runs", type: "number", required: false, help: "Suppress repeat runs from reloads or extra tabs. Default 5." },
    ],
    minPollMinutes: Infinity,
    serverEvaluable: false,
    // No evaluate: fired directly by the client watcher on app load, not polled.
  },
  {
    type: "app-focused",
    label: "The app tab regains focus",
    description: "Runs when you switch back to the app's browser tab. Only fires while the app is open; not eligible for cloud runs.",
    category: "app",
    configFields: [
      { key: "cooldownMinutes", label: "Minimum minutes between runs", type: "number", required: false, help: "Suppress rapid re-runs when you switch tabs often. Default 30." },
    ],
    minPollMinutes: Infinity,
    serverEvaluable: false,
    // No evaluate: fired directly by the client watcher on window focus.
  },
];

export function getEventSource(type: string): EventSourceDef | undefined {
  return EVENT_SOURCES.find((s) => s.type === type);
}

/** Evaluate a trigger's event source against its current cursor. */
export async function evaluateTrigger(
  trigger: WorkflowTrigger,
  ctx: TriggerEvalContext
): Promise<TriggerEvalResult> {
  const source = getEventSource(trigger.eventType);
  if (!source || !source.evaluate) {
    return { fired: false, cursor: trigger.cursor ?? {}, detail: "This event type is not polled." };
  }
  return source.evaluate(trigger.eventConfig, trigger.cursor ?? null, ctx);
}

/** Whether enough time has passed since the last check to poll this trigger
 * again (its event source's minPollMinutes throttle). Webhook triggers, whose
 * minPollMinutes is Infinity, are never due. */
export function isTriggerDueForCheck(trigger: WorkflowTrigger, now: Date): boolean {
  const source = getEventSource(trigger.eventType);
  if (!source || !source.evaluate) return false;
  if (!Number.isFinite(source.minPollMinutes)) return false;
  if (!trigger.lastCheckedAt) return true;
  const last = Date.parse(trigger.lastCheckedAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= source.minPollMinutes * 60_000;
}

// ---------------------------------------------------------------------------
// Browser-lifecycle event sources (app-open, app-focused)
// ---------------------------------------------------------------------------
//
// Unlike the polled sources, these have no external state to compare against a
// cursor - the "event" IS a browser lifecycle event (the app loading, the tab
// regaining focus). They are therefore never server-evaluable and never polled
// (minPollMinutes Infinity, no evaluate); the client watcher fires them
// directly. A cooldown keeps a reload, an extra tab, or rapid tab-switching
// from re-running the workflow, and the check_version claim keeps two tabs from
// double-firing the same occurrence.

export const LIFECYCLE_EVENT_TYPES: ReadonlySet<string> = new Set([
  "app-open",
  "app-focused",
]);

export function isLifecycleEventType(type: string): boolean {
  return LIFECYCLE_EVENT_TYPES.has(type);
}

/** Whether a lifecycle trigger's cooldown has elapsed since it last fired.
 * `now` is passed in (epoch ms) for testability. Defaults: app-focused 30 min,
 * app-open 5 min; overridable per trigger via eventConfig.cooldownMinutes. */
export function lifecycleCooldownElapsed(trigger: WorkflowTrigger, now: number): boolean {
  const raw = Number((trigger.eventConfig.cooldownMinutes ?? "").trim());
  const defaultMin = trigger.eventType === "app-focused" ? 30 : 5;
  const cooldownMin = Number.isFinite(raw) && raw > 0 ? raw : defaultMin;
  if (!trigger.lastFiredAt) return true;
  const last = Date.parse(trigger.lastFiredAt);
  if (Number.isNaN(last)) return true;
  return now - last >= cooldownMin * 60_000;
}

/** A human summary of what a trigger watches, for the UI list. */
export function describeTrigger(trigger: WorkflowTrigger): string {
  const source = getEventSource(trigger.eventType);
  const base = source?.label ?? trigger.eventType;
  const cfg = trigger.eventConfig;
  const bits: string[] = [];
  const insts = parseInstitutionsConfig(cfg);
  if (insts.all) bits.push("all institutions");
  else if (insts.list.length) bits.push(insts.list.join("/"));
  if (cfg.org) bits.push(cfg.org);
  if (cfg.threshold) bits.push(`>= ${cfg.threshold}`);
  return bits.length ? `${base} (${bits.join(", ")})` : base;
}

// ---------------------------------------------------------------------------
// Webhook token
// ---------------------------------------------------------------------------

/** A long, URL-safe random token used as the entire trust boundary for the
 * inbound webhook endpoint. */
export function generateWebhookToken(): string {
  const c = globalThis.crypto;
  return `${c.randomUUID()}${c.randomUUID()}`.replace(/-/g, "");
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

type TriggerRow = Database["public"]["Tables"]["workflow_triggers"]["Row"];

function stringRecord(value: Json | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
  }
  return out;
}

const EVENT_TYPES = new Set<string>(EVENT_SOURCES.map((s) => s.type));

/** Row -> domain object. Exported so the row-shape coercion is unit-testable
 * without a live Supabase client (mirrors mapSchedule). */
export function mapTrigger(row: TriggerRow): WorkflowTrigger {
  const eventType = (EVENT_TYPES.has(row.event_type) ? row.event_type : "webhook") as TriggerEventType;
  const disabledSteps = Array.isArray(row.disabled_steps)
    ? (row.disabled_steps as unknown[]).filter((n): n is number => typeof n === "number")
    : [];
  return {
    id: row.id,
    userId: row.user_id,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    fieldValues: stringRecord(row.field_values),
    eventType,
    eventConfig: stringRecord(row.event_config),
    cursor: row.cursor ?? null,
    checkVersion: typeof row.check_version === "number" ? row.check_version : 0,
    enabled: row.enabled,
    unattended: row.unattended,
    provider: row.provider,
    disabledSteps,
    courseId: row.course_id,
    institution: row.institution,
    webhookToken: row.webhook_token,
    lastCheckedAt: row.last_checked_at,
    lastFiredAt: row.last_fired_at,
  };
}

function table(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("workflow_triggers");
}

/** All of the owner's triggers, newest first. */
export async function listWorkflowTriggers(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<WorkflowTrigger[]> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as TriggerRow[]).map(mapTrigger);
}

export async function createWorkflowTrigger(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    workflowId: string;
    workflowName: string;
    fieldValues: Record<string, string>;
    eventType: TriggerEventType;
    eventConfig: Record<string, string>;
    unattended?: boolean;
    provider?: string | null;
    disabledSteps?: number[];
    courseId?: string | null;
    institution?: string | null;
    webhookToken?: string | null;
  }
): Promise<WorkflowTrigger> {
  const { data, error } = await table(supabase)
    .insert({
      user_id: userId,
      workflow_id: input.workflowId,
      workflow_name: input.workflowName,
      field_values: input.fieldValues as unknown as Json,
      event_type: input.eventType,
      event_config: input.eventConfig as unknown as Json,
      unattended: input.unattended ?? false,
      provider: input.provider ?? null,
      disabled_steps: (input.disabledSteps ?? []) as unknown as Json,
      course_id: input.courseId ?? null,
      institution: input.institution ?? null,
      webhook_token: input.webhookToken ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapTrigger(data as TriggerRow);
}

export async function updateWorkflowTrigger(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  fields: { enabled?: boolean }
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.enabled !== undefined) patch.enabled = fields.enabled;
  const { error } = await table(supabase).update(patch).eq("user_id", userId).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteWorkflowTrigger(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<void> {
  const { error } = await table(supabase).delete().eq("user_id", userId).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Claim a poll tick and persist its result with an optimistic-lock update
 * conditioned on `check_version`. Advances the cursor and last_checked_at
 * (always), stamps last_fired_at when the event fired, and bumps check_version.
 * Returns true when THIS caller won the claim: a second poller (another tab or
 * the cron) that read the same check_version updates 0 rows and must discard
 * its decision, so an event fires at most once.
 */
export async function claimAndAdvanceTrigger(
  supabase: SupabaseClient<Database>,
  trigger: WorkflowTrigger,
  result: TriggerEvalResult,
  now: Date
): Promise<boolean> {
  const patch: Record<string, unknown> = {
    cursor: result.cursor as unknown as Json,
    check_version: trigger.checkVersion + 1,
    last_checked_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  if (result.fired) patch.last_fired_at = now.toISOString();
  const { data, error } = await table(supabase)
    .update(patch)
    .eq("id", trigger.id)
    .eq("user_id", trigger.userId)
    .eq("check_version", trigger.checkVersion)
    .eq("enabled", true)
    .select("id");
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

/** Advance last_checked_at (and bump check_version) for a trigger a poller
 * skipped before evaluating, so it rotates to the back of the due window
 * instead of pinning the front. Best-effort. */
export async function touchTriggerChecked(
  supabase: SupabaseClient<Database>,
  trigger: WorkflowTrigger,
  now: Date
): Promise<void> {
  const { error } = await table(supabase)
    .update({
      last_checked_at: now.toISOString(),
      check_version: trigger.checkVersion + 1,
      updated_at: now.toISOString(),
    })
    .eq("id", trigger.id)
    .eq("check_version", trigger.checkVersion);
  if (error) throw new Error(error.message);
}

/**
 * Enabled, unattended, pollable triggers across ALL users (service-role client
 * only - RLS would hide other users' rows). Excludes webhook triggers, which
 * are never polled. The caller further throttles each by isTriggerDueForCheck.
 */
export async function listUnattendedTriggersDue(
  supabase: SupabaseClient<Database>,
  limit = 20
): Promise<WorkflowTrigger[]> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("enabled", true)
    .eq("unattended", true)
    .neq("event_type", "webhook")
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as TriggerRow[]).map(mapTrigger);
}

/** Enabled, unattended repo-push triggers across all users (service-role only). */
export async function listEnabledRepoPushTriggers(
  supabase: SupabaseClient<Database>
): Promise<WorkflowTrigger[]> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("event_type", "repo-push")
    .eq("enabled", true)
    .eq("unattended", true);
  if (error) throw new Error(error.message);
  return ((data ?? []) as TriggerRow[]).map(mapTrigger);
}

/** Pure: repo-push triggers matching an incoming push's org + repo name.
 * Matches when the trigger's config.org equals the org (case-insensitive) and
 * the repo name starts with config.prefix (empty prefix = all repos). */
export function matchRepoPushTriggers(
  triggers: WorkflowTrigger[],
  org: string,
  repoName: string
): WorkflowTrigger[] {
  const o = org.trim().toLowerCase();
  const rn = repoName.trim().toLowerCase();
  return triggers.filter((t) => {
    if (t.eventType !== "repo-push") return false;
    const cfg = (t.eventConfig ?? {}) as Record<string, unknown>;
    const cfgOrg = String(cfg.org ?? "").trim().toLowerCase();
    if (!cfgOrg || cfgOrg !== o) return false;
    const prefix = String(cfg.prefix ?? "").trim().toLowerCase();
    return rn.startsWith(prefix);
  });
}

/** Pure: advance a repo-push cursor so a pushed repo is marked seen at
 * commitTimestamp (mirrors decideRepoPush's cursor.repos map), preventing the
 * poller from re-firing the same push. */
export function advanceRepoPushCursor(
  cursor: Json | null,
  repo: string,
  commitTimestamp: string
): Json {
  const prev =
    cursor && typeof cursor === "object" && !Array.isArray(cursor)
      ? (cursor as Record<string, unknown>)
      : {};
  const prevRepos =
    prev.repos && typeof prev.repos === "object" && !Array.isArray(prev.repos)
      ? (prev.repos as Record<string, string>)
      : {};
  return { ...prev, repos: { ...prevRepos, [repo]: commitTimestamp } } as unknown as Json;
}

/** Look up a single enabled webhook trigger by its token (service-role client;
 * the token is the trust boundary). Returns null when no enabled row matches. */
export async function findEnabledWebhookTrigger(
  supabase: SupabaseClient<Database>,
  token: string
): Promise<WorkflowTrigger | null> {
  if (!token) return null;
  const { data, error } = await table(supabase)
    .select("*")
    .eq("webhook_token", token)
    .eq("event_type", "webhook")
    .eq("enabled", true)
    .limit(1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as TriggerRow[];
  return rows.length ? mapTrigger(rows[0]) : null;
}

/** Claim a webhook trigger BEFORE running it, using the same optimistic-lock
 * (check_version) as claimAndAdvanceTrigger, so a duplicate or concurrent POST
 * of the same token runs the workflow at most once. Returns true iff THIS
 * caller won the claim. */
export async function claimWebhookTrigger(
  supabase: SupabaseClient<Database>,
  trigger: WorkflowTrigger,
  now: Date
): Promise<boolean> {
  const { data, error } = await table(supabase)
    .update({
      last_fired_at: now.toISOString(),
      last_checked_at: now.toISOString(),
      check_version: trigger.checkVersion + 1,
      updated_at: now.toISOString(),
    })
    .eq("id", trigger.id)
    .eq("check_version", trigger.checkVersion)
    .eq("enabled", true)
    .select("id");
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}
