// Pure decision functions for event source evaluation. These are testable,
// stateless functions that take a prior cursor (dedup state) and freshly-fetched
// observations, and return whether to fire the trigger plus the new cursor.
// The FIRST evaluation (cursor null) establishes a baseline and never fires,
// so a trigger never fires on a pre-existing backlog the moment it is created
// (course-start and cartridge-drops are deliberate exceptions - genuine events
// we DO want to catch the first time).

import type { Json } from "../supabase/types";

// ---------------------------------------------------------------------------
// Cursor helpers (safe reads over the loosely-typed Json cursor)
// ---------------------------------------------------------------------------

function asObject(cursor: Json | null): Record<string, unknown> | null {
  if (cursor && typeof cursor === "object" && !Array.isArray(cursor)) {
    return cursor as Record<string, unknown>;
  }
  return null;
}

export function readNum(cursor: Json | null, key: string): number | null {
  const o = asObject(cursor);
  const v = o?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function readBool(cursor: Json | null, key: string): boolean | null {
  const o = asObject(cursor);
  const v = o?.[key];
  return typeof v === "boolean" ? v : null;
}

export function readStr(cursor: Json | null, key: string): string | null {
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

type Decision = { fired: boolean; cursor: Json; detail: string; fireValues?: Record<string, string> };

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

/** Fire when a new email arrives in the Outlook inbox. Similar to decideNewMessages
 * but for individual emails rather than Canvas conversations. Fires when an email
 * with a new id appears or when an email's receivedAt timestamp advances. */
export function decideNewEmails(
  cursor: Json | null,
  rows: Array<{ institution: string; id: string; receivedAt: string | null }>
): { fired: boolean; cursor: Json; detail: string; advanced: string[] } {
  const prev = readStringMap(cursor, "emails");
  const firstEval = prev === null;
  const curr: Record<string, string> = {};
  const advanced: string[] = [];

  for (const r of rows) {
    const key = `${r.institution}:${r.id}`;
    const ra = r.receivedAt ?? "";
    curr[key] = ra;
    if (firstEval || !ra) continue;
    const p = prev[key];
    const isNew = p === undefined;
    if ((isNew || ra > p) && ra) advanced.push(r.id);
  }

  const fired = !firstEval && advanced.length > 0;
  return {
    fired,
    cursor: { emails: curr },
    detail: firstEval
      ? `Baseline: ${rows.length} email(s).`
      : fired
        ? `New emails: ${advanced.length > 5 ? advanced.length : advanced.join(", ")}`
        : "No new emails.",
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
  input: { baselineLatest: string | null; baselineLatestName?: string | null; runsSince: Array<{ createdAt: string; status: string; workflowName?: string }> },
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
  const decision: Decision = {
    fired: qualifying.length > 0,
    cursor: { lastAt: maxAt },
    detail: qualifying.length ? `${qualifying.length} completion(s).` : "Only ignored runs.",
  };
  if (qualifying.length > 0 && qualifying[0]?.workflowName) {
    decision.fireValues = { completedWorkflow: qualifying[0].workflowName };
  }
  return decision;
}

/** Fire when new cartridge drops are detected. Unlike most deciders, this one
 * DOES fire on its first true observation - cartridge drops are explicit work
 * items (user uploads), not pre-existing backlogs, so we always fire when the
 * user uploads one, even if it is the very first time we evaluate this trigger. */
export function decideCartridgeDrops(cursor: Json | null, newDropIds: string[]): Decision {
  const sig = [...newDropIds].sort().join("\n");
  const count = newDropIds.length;

  // Fire if there are any new drops, regardless of whether this is the first
  // evaluation or not. Pre-existing new drops SHOULD trigger grading.
  const fired = count > 0;

  return {
    fired,
    cursor: { ids: sig, count },
    detail: fired ? `${count} new drop(s) to grade.` : "No new drops.",
  };
}
