// Event source registry and evaluation logic. This module defines the catalog
// of event sources (triggers) that can fire workflows, polls them, and evaluates
// their conditions. Imports decisions (the pure cursor-reading and event-deciding
// logic) and server actions (to fetch fresh data on each poll tick).

import type { Json } from "../supabase/types";
import type { WorkflowRunStatus } from "../workflow-run-status";
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
  listOutlookMessagesAction,
  listInstitutionFeedUrlsAction,
  fetchIcsFeedAction,
  listNewCartridgeDropIdsAction,
} from "@/app/actions";
import { parseIcsEvents } from "../ics";
import { parseCanvasCourseId } from "../canvas-url";
import {
  decideCountRise,
  decideThresholdEdge,
  decideNewMessages,
  decideNewEmails,
  decideRepoPush,
  decideRepoInactive,
  decideBrokenLinks,
  decideRosterChanged,
  decideCourseStart,
  decideDeadlinePassed,
  decideWorkflowCompleted,
  decideCartridgeDrops,
  readNum,
  readBool,
  readStr,
} from "./decisions";

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
  | "deadline-passed"
  | "lms-email-received"
  | "cartridge-uploaded";

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
  lastRunStatus: WorkflowRunStatus | null;
  lastRunDetail: string | null;
  /** How many times the stale-claim sweep has already re-armed this trigger
   * after an interrupted run; capped at 1 (mirrors WorkflowSchedule). */
  recoveryAttempts: number;
}

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
  /** The workflow id of the trigger itself (used to exclude from "any workflow"
   * queries to prevent infinite loops). */
  excludeWorkflowId?: string;
  /** Most recent run of any workflow, excluding a given id (for "any workflow"
   * triggers). Returns null when no runs exist. */
  latestRunAny?: (
    excludeWorkflowId: string
  ) => Promise<{ createdAt: string; status: string; workflowName: string } | null>;
  /** All runs of any workflow strictly newer than sinceIso, excluding a given id,
   * oldest first (for "any workflow" triggers). */
  runsSinceAny?: (
    sinceIso: string,
    excludeWorkflowId: string
  ) => Promise<Array<{ createdAt: string; status: string; workflowName: string }>>;
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
export async function resolveInstitutionList(
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
      const inst = resolveInstitution(config, ctx);
      if (!inst) return { fired: false, cursor: cursor ?? {}, detail: "No institution configured." };

      let assignments: Array<{ assignmentId: string; name: string; dueAt: string | null }> | undefined;
      let apiError: string | null = null;

      if (courseId) {
        const r = await listCourseAssignmentDueDatesAction(inst, courseId);
        if ("error" in r) {
          apiError = r.error;
        } else {
          assignments = r.assignments;
        }
      }

      if (!assignments) {
        const feedResult = await listInstitutionFeedUrlsAction(inst);
        if (!("error" in feedResult) && feedResult.feedUrls.length > 0) {
          const feedAssignments: Array<{
            assignmentId: string;
            name: string;
            dueAt: string | null;
          }> = [];
          for (const feedUrl of feedResult.feedUrls) {
            const fetchResult = await fetchIcsFeedAction(feedUrl);
            if ("error" in fetchResult) {
              return { fired: false, cursor: cursor ?? {}, detail: fetchResult.error };
            }
            const events = parseIcsEvents(fetchResult.ics);
            for (const event of events) {
              feedAssignments.push({
                assignmentId: event.uid,
                name: event.summary,
                dueAt: event.startsAt,
              });
            }
          }
          assignments = feedAssignments;
        }
      }

      if (!assignments) {
        const errorMsg = apiError || "No assignment data available.";
        return { fired: false, cursor: cursor ?? {}, detail: errorMsg };
      }

      const d = decideDeadlinePassed(cursor, assignments, new Date().toISOString());
      return { ...d, fireValues: { course: courseUrl } };
    },
  },
  {
    type: "lms-email-received",
    label: "An LMS notification email arrives",
    description: "Watches the connected Outlook inbox for LMS notification emails (messages, submissions) - works at institutions with no LMS API.",
    category: "lms",
    configFields: [
      { key: "institutions", label: "Institutions", type: "institutions", required: false, help: "Defaults to the active institution; pick several or choose all." },
      { key: "filter", label: "Email type", type: "text", required: false, help: "messages, submissions, or blank for both." },
      { key: "senders", label: "Extra sender domains", type: "text", required: false, help: "Extra sender domains, one per line, added to the built-in LMS notifier domains." },
    ],
    minPollMinutes: 15,
    serverEvaluable: true,
    evaluate: async (config, cursor, ctx) => {
      const resolved = await resolveInstitutionList(config, ctx);
      if ("error" in resolved) return { fired: false, cursor: cursor ?? {}, detail: resolved.error };
      const insts = resolved.list;
      if (insts.length === 0) return { fired: false, cursor: cursor ?? {}, detail: "No institution configured." };

      const builtInDomains = [
        "instructure.com",
        "blackboard.com",
        "d2l.com",
        "brightspace.com",
      ];
      const extraSenders = (config.senders ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const allowedDomains = [...builtInDomains, ...extraSenders];

      const filter = (config.filter ?? "").trim().toLowerCase();
      const filterMessages = !filter || filter === "messages";
      const filterSubmissions = !filter || filter === "submissions";

      const allRows: Array<{
        institution: string;
        id: string;
        receivedAt: string | null;
      }> = [];

      for (const inst of insts) {
        const r = await listOutlookMessagesAction(inst);
        if ("error" in r) return { fired: false, cursor: cursor ?? {}, detail: r.error };

        for (const msg of r.messages) {
          const fromDomain = msg.fromAddress
            .split("@")
            .slice(1)
            .join("@")
            .toLowerCase();
          if (!allowedDomains.some((d) => fromDomain.endsWith(d))) continue;

          // A blank filter means "messages or submissions" - an LMS-domain
          // email must still look like one of the two (a weekly digest from
          // the same sender should not fire the trigger).
          const isMsg = /message|conversation|inbox/i.test(msg.subject);
          const isSub = /submi|assignment|turned in/i.test(msg.subject);
          if ((filterMessages && isMsg) || (filterSubmissions && isSub)) {
            allRows.push({
              institution: inst,
              id: msg.id,
              receivedAt: msg.receivedDateTime,
            });
          }
        }
      }

      const d = decideNewEmails(cursor, allRows);
      return {
        ...d,
        fireValues: {
          newEmails: String(d.advanced.length),
          institutions: insts.join(", "),
        },
      };
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
      { key: "workflow", label: "Source workflow", type: "workflow", required: false, help: "Run this trigger's workflow after that one completes. Leave blank for any workflow." },
      { key: "requireSuccess", label: "Only on success", type: "boolean", required: false, help: "Ignore runs that ended in an error." },
    ],
    minPollMinutes: 5,
    serverEvaluable: true,
    evaluate: async (config, cursor, ctx) => {
      const workflow = (config.workflow ?? "").trim();
      const sourceId = (config.sourceWorkflowId ?? "").trim() || workflow;
      if (!sourceId && sourceId !== "*") return { fired: false, cursor: cursor ?? {}, detail: "No source workflow configured." };
      const requireSuccess = config.requireSuccess === "1" || config.requireSuccess === "true";
      const lastAt = readStr(cursor, "lastAt");

      if (sourceId === "*") {
        // Any workflow: use exclusion pattern to avoid self-triggering
        const excludeId = ctx.excludeWorkflowId ?? "";
        if (lastAt === null) {
          const latest = ctx.latestRunAny ? await ctx.latestRunAny(excludeId) : null;
          return decideWorkflowCompleted(
            cursor,
            { baselineLatest: latest?.createdAt ?? null, baselineLatestName: latest?.workflowName ?? null, runsSince: [] },
            requireSuccess
          );
        }
        const runs = ctx.runsSinceAny ? await ctx.runsSinceAny(lastAt, excludeId) : [];
        return decideWorkflowCompleted(cursor, { baselineLatest: null, runsSince: runs }, requireSuccess);
      } else {
        // Specific workflow
        if (lastAt === null) {
          const latest = ctx.latestRun ? await ctx.latestRun(sourceId) : null;
          return decideWorkflowCompleted(
            cursor,
            { baselineLatest: latest?.createdAt ?? null, runsSince: [] },
            requireSuccess
          );
        }
        const runs = ctx.runsSince ? await ctx.runsSince(sourceId, lastAt) : [];
        return decideWorkflowCompleted(cursor, { baselineLatest: null, runsSince: runs }, requireSuccess);
      }
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
  {
    type: "cartridge-uploaded",
    label: "Submissions uploaded",
    description: "Fires when new student-submission zips are uploaded (Files > Submissions or the Grading panel) and are ready for grading.",
    category: "course",
    configFields: [],
    minPollMinutes: 15,
    serverEvaluable: true,
    evaluate: async (config, cursor) => {
      const r = await listNewCartridgeDropIdsAction();
      if ("error" in r) {
        return { fired: false, cursor: cursor ?? {}, detail: r.error };
      }
      const d = decideCartridgeDrops(cursor, r.ids);
      return { ...d, fireValues: { cartridgeCount: String(r.count) } };
    },
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
