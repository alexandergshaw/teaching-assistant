import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runAsOwner } from "@/lib/supabase/owner-context";
import { isOwnerEmail } from "@/lib/owner";
import {
  listDueUnattendedWorkflowSchedules, claimWorkflowSchedule,
  claimFanoutSchedule, checkpointFanoutInstitution, deferFanoutResume, finishFanoutSchedule,
  listStaleClaimedWorkflowSchedules, recoverStaleWorkflowSchedule,
} from "@/lib/workflow-schedules";
import { updateScheduleRunOutcome } from "@/lib/workflow-run-status";
import { listWorkflowDefs } from "@/lib/workflow-defs";
import { allWorkflows } from "@/lib/workflows/presets";
import { isHeadlessSafeWorkflow } from "@/lib/workflows/headless";
import { runWorkflowUnattended, buildServerStepRunHelpers } from "@/lib/workflows/server-runner";
import { joinStepErrorDetail } from "@/lib/workflows/run-detail";
import { isInstitutionFanout, isCourseFanout, hasCourseMultiplicity } from "@/lib/workflows/fanout";
import { runDueUnattendedTriggers } from "@/lib/workflow-trigger-runner";
import { listStaleClaimedWorkflowTriggers, recoverStaleWorkflowTrigger } from "@/lib/workflow-triggers";
import { finishWorkflowRun } from "@/lib/workflow-runs";
import { safeStartWorkflowRun } from "@/lib/workflows/run-logging";
import { resolveDocumentAuthor } from "@/lib/author";
import { saveRecordingFile } from "@/lib/recording-files";
import { recordCronHeartbeat } from "@/lib/cron-heartbeat";
import type { LlmProvider } from "@/lib/llm";

// Vercel Cron entry point for UNATTENDED (headless) scheduled workflow runs -
// the whole point is that this fires with the app closed / the machine
// asleep, so there is no session cookie and nobody to answer a mid-run pause.
// See src/lib/workflows/headless.ts (which workflows are eligible),
// src/lib/workflows/server-runner.ts (the run loop), and
// src/lib/supabase/owner-context.ts (the owner-impersonation bypass this
// route is the sole trusted caller of).
//
// Runs on the Node.js runtime (not edge): it needs the service-role Supabase
// client, Node crypto/AsyncLocalStorage, and the same server actions the app
// already uses, none of which are edge-compatible.
//
// SETUP (in the Vercel project, not in code):
//   1. Set env var CRON_SECRET to a long random string. Vercel automatically
//      sends it as `Authorization: Bearer <CRON_SECRET>` on the scheduled
//      request; nothing else should know this value.
//   2. SUPABASE_SERVICE_ROLE_KEY and the LLM/Canvas/GitHub env vars must
//      already be set server-side - they are, since every server action
//      already depends on them.
//   3. The schedule in vercel.json (*/10 * * * *, i.e. every 10 minutes)
//      needs a Vercel Pro plan for sub-daily crons; on the Hobby plan Vercel
//      silently runs crons at most once a day.
export const runtime = "nodejs";
// 60s is the ceiling that builds on ALL plans (the Hobby cap). A higher value
// (up to 300 on Pro, 900 on Enterprise) makes the deployment FAIL to build on
// Hobby, which silently unregisters the cron. On Pro you can raise this to 300.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Bounds one cron tick's work regardless of how large the due backlog is;
// listDueUnattendedWorkflowSchedules already caps its query to the same limit.
const MAX_SCHEDULES_PER_RUN = 5;

interface ScheduleResult {
  scheduleId: string;
  workflowId: string;
  status: "ok" | "error" | "skipped";
  detail?: string;
}

// Total conversion of a caught value to a string for the heartbeat's
// last_error: `String(x)` can itself throw (a thrown Symbol, or an object
// with a null/broken prototype), and a heartbeat write must never fail
// because the tick's own error was unusual - that would replace the real
// failure with an unrelated TypeError from this fallback path.
function safeErrorToString(err: unknown): string {
  try {
    return String(err);
  } catch {
    return "Unknown error (could not be converted to a string).";
  }
}

/**
 * Which caller this tick came from, for the heartbeat's per-caller row
 * (heartbeatIdForSource in src/lib/cron-heartbeat.ts). An explicit
 * `?source=` wins; otherwise Vercel's own cron is recognised by its
 * user-agent.
 *
 * WHY THE USER-AGENT RATHER THAN A QUERY STRING IN vercel.json: `vercel.json`
 * is deploy-critical on a project that auto-deploys from main, and a `path`
 * value its schema rejects would break the deployment for a label. Sniffing
 * the user-agent here costs nothing and cannot fail a deploy. Note the
 * labelling is a nicety, not the defence: heartbeat rows are keyed per
 * caller, so even an unlabelled Vercel tick lands in its own
 * `run-schedules:unknown` row and still cannot mask a dead GitHub Actions
 * cron - which was the actual defect.
 */
function resolveTickSource(req: NextRequest): string {
  const explicit = req.nextUrl.searchParams.get("source")?.trim();
  if (explicit) return explicit;
  const userAgent = req.headers.get("user-agent") ?? "";
  if (userAgent.toLowerCase().includes("vercel-cron")) return "vercel-cron";
  return "unknown";
}

export async function GET(req: NextRequest) {
  // SECURITY: this check is the entire trust boundary for runAsOwner below.
  // Anyone who can guess/steal CRON_SECRET can trigger scheduled runs as
  // their owning user (never as an arbitrary user - see the isOwnerEmail
  // re-check per schedule further down), so keep it a long random secret and
  // never log it.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  // Soft deadline inside the maxDuration cap: an institution fan-out stops
  // starting new institutions past this so the tick stays in budget and the
  // rest resume next tick (see runWorkflowUnattended deadlineMs).
  const runDeadlineMs = now.getTime() + 50_000;
  const results: ScheduleResult[] = [];
  // Tick start, captured before any work so a hung tick still shows a
  // last-tick-at from when it began (H1 item 4), and a start-ms so the
  // heartbeat below can record how long the tick actually ran.
  const tickStartMs = Date.now();
  // Free-text caller id for the heartbeat (H1 item 6) - deliberately not
  // validated against a list, so an unrecognised or absent source can never
  // fail the request; it just records as "unknown".
  const source = resolveTickSource(req);
  let triggerResults: Awaited<ReturnType<typeof runDueUnattendedTriggers>> = [];
  // Whatever this tick throws, captured for the heartbeat's last_error and
  // then re-thrown unchanged below - the heartbeat write must never mask or
  // alter the tick's own outcome.
  let tickError: unknown = null;

  // H1: the heartbeat must be written on every exit path past the
  // authorization check above - the normal return AND a throw - so the rest
  // of this tick is wrapped in try/catch/finally. An unauthorized (401) or
  // misconfigured (500, missing CRON_SECRET) request returns before this
  // point and therefore writes no heartbeat (H1 item 7).
  try {
    // Second heartbeat write, at tick START rather than only in the `finally`
    // below (H1 item 4). A tick killed by the platform at the 60s maxDuration
    // cap never runs `finally` at all, so a single write there would make a
    // hung tick record NOTHING - indistinguishable from a dead cron - even
    // though `last_tick_at` being the tick's start time exists specifically
    // to make a hung tick show up as a STALE heartbeat instead of no
    // heartbeat. Writing here, before any work begins, is what actually
    // delivers on that. Zeros/nulls here are provisional; the `finally`
    // write below overwrites this row with the real counts once the tick
    // finishes (or with the real error, if it didn't). Best-effort and
    // awaited: recordCronHeartbeat never throws, and this must never affect
    // the tick's own outcome.
    const startHeartbeatOk = await recordCronHeartbeat(supabase, {
      tickAt: now,
      source,
      schedulesProcessed: 0,
      triggersProcessed: 0,
      durationMs: null,
      lastError: null,
    });
    if (!startHeartbeatOk) console.error("Failed to write the start-of-tick cron heartbeat.");

    // Sweep stale claims BEFORE processing due schedules/triggers: a row stuck
    // at "started" (its runner - a browser tab or a prior process - never
    // reported back) would otherwise leave that occurrence silently lost
    // forever, since claiming already advanced past it. Per-row try/catch so
    // one failure to stamp/reset a row never aborts the tick.
    const staleSchedules = await listStaleClaimedWorkflowSchedules(supabase, now, MAX_SCHEDULES_PER_RUN);
    for (const stale of staleSchedules) {
      try {
        await recoverStaleWorkflowSchedule(supabase, stale, now);
      } catch (err) {
        console.error("Failed to recover stale schedule claim:", stale.id, err);
      }
    }
    const staleTriggers = await listStaleClaimedWorkflowTriggers(supabase, now, MAX_SCHEDULES_PER_RUN);
    for (const stale of staleTriggers) {
      try {
        await recoverStaleWorkflowTrigger(supabase, stale, now);
      } catch (err) {
        console.error("Failed to recover stale trigger claim:", stale.id, err);
      }
    }

    const due = await listDueUnattendedWorkflowSchedules(supabase, now, MAX_SCHEDULES_PER_RUN);

    for (const schedule of due) {
      try {
        // Defensive re-check: confirm the schedule's owner is still an
        // allowlisted owner right now, independent of whatever it was when the
        // schedule was created (OWNER_EMAILS may have changed since).
        const { data: userRes, error: userErr } = await supabase.auth.admin.getUserById(schedule.userId);
        if (userErr || !userRes?.user || !isOwnerEmail(userRes.user.email)) {
          results.push({ scheduleId: schedule.id, workflowId: schedule.workflowId, status: "skipped", detail: "owner is not allowlisted" });
          continue;
        }
        const ownerEmail = userRes.user.email;
        if (!ownerEmail) {
          await updateScheduleRunOutcome(supabase, schedule.userId, schedule.id, "skipped", "owner has no email on file").catch(() => {});
          results.push({ scheduleId: schedule.id, workflowId: schedule.workflowId, status: "skipped", detail: "owner has no email on file" });
          continue;
        }

        // Load the def BEFORE claiming so a fan-out can take the checkpoint-aware
        // claim path. Invalid/non-headless defs still fall through to the ordinary
        // claim below (which advances next_run_at) so they don't re-select forever.
        const customDefs = await listWorkflowDefs(supabase, schedule.userId);
        const defs = allWorkflows(customDefs);
        const lookup = (id: string) => defs.find((d) => d.id === id);
        const def = lookup(schedule.workflowId);
        const runnable = !!def && isHeadlessSafeWorkflow(def, lookup);

        const provider: LlmProvider =
          schedule.provider === "gemini" || schedule.provider === "other" || schedule.provider === "embedded"
            ? schedule.provider
            : "gemini";

        if (runnable && (isInstitutionFanout(def!.scope) || isCourseFanout(def!.scope))) {
          const claim = await claimFanoutSchedule(supabase, schedule.userId, schedule, now);
          if (!claim) {
            await updateScheduleRunOutcome(supabase, schedule.userId, schedule.id, "skipped", "already claimed").catch(() => {});
            results.push({ scheduleId: schedule.id, workflowId: schedule.workflowId, status: "skipped", detail: "already claimed" });
            continue;
          }
          if (claim.kind === "abandon") {
            const workflowRunId = crypto.randomUUID();
            const reason = "fan-out abandoned: no forward progress";
            // Start row BEFORE anything else - no step ever runs on this path
            // (the occurrence is abandoned outright), so the start+finish pair
            // below brackets zero step executions, but the row still exists.
            await safeStartWorkflowRun(supabase, schedule.userId, {
              id: workflowRunId, workflowId: schedule.workflowId, workflowName: def!.name, triggerSource: "schedule", triggerRef: schedule.id,
            });
            await updateScheduleRunOutcome(supabase, schedule.userId, schedule.id, "skipped", reason).catch(() => {});
            try {
              const markdown = `# ${def!.name} - run skipped\n\n${reason}\n`;
              await saveRecordingFile(supabase, schedule.userId, new Blob([markdown], { type: "text/markdown" }), {
                name: `${def!.name} - skipped`,
                kind: "file",
                mimeType: "text/markdown",
                durationSec: null,
                fileExt: "md",
                source: "workflow",
                origin: "unattended",
                workflowName: def!.name,
                workflowId: schedule.workflowId,
                workflowRunId,
              });
            } catch { /* ignore */ }
            await finishWorkflowRun(supabase, schedule.userId, workflowRunId, { status: "skipped", detail: reason });
            results.push({ scheduleId: schedule.id, workflowId: schedule.workflowId, status: "skipped", detail: "fan-out abandoned (no forward progress)" });
            continue;
          }
          const progress = claim.progress;
          // A composed fan-out (institution "*" + course multiplicity) iterates
          // per COURSE too (see runWorkflowUnattended's composed branch), so it
          // needs the same doneCourses checkpointing as a plain course fan-out -
          // hasCourseMultiplicity is institution-blind, unlike isCourseFanout
          // (which returns false once institution wins).
          const isCourse = hasCourseMultiplicity(def!.scope);

          const workflowRunId = crypto.randomUUID();
          // Start row BEFORE runWorkflowUnattended - before this tick's first
          // step of the first fan-out group executes. Guarded (never throws),
          // so a logging outage cannot block the run itself.
          await safeStartWorkflowRun(supabase, schedule.userId, {
            id: workflowRunId, workflowId: schedule.workflowId, workflowName: def!.name, triggerSource: "schedule", triggerRef: schedule.id,
            fieldValues: schedule.fieldValues,
          });
          const outcome = await runAsOwner({ id: userRes.user.id, email: ownerEmail }, () =>
            runWorkflowUnattended({
              def: def!,
              resolveWorkflow: lookup,
              fieldValues: schedule.fieldValues,
              disabledTopIndices: new Set(schedule.disabledSteps),
              helpers: buildServerStepRunHelpers({
                supabase, userId: schedule.userId, institution: schedule.institution,
                provider, author: resolveDocumentAuthor(userRes.user), workflowId: schedule.workflowId, workflowName: def!.name,
                workflowRunId,
              }),
              deadlineMs: runDeadlineMs,
              runLog: { supabase, userId: schedule.userId, runId: workflowRunId },
              ...(isCourse
                ? {
                    skipCourses: new Set(progress.doneCourses ?? []),
                    onCourseDone: async (tileId: string, ok: boolean) => {
                      if (!(progress.doneCourses ?? []).includes(tileId)) {
                        if (!progress.doneCourses) progress.doneCourses = [];
                        progress.doneCourses.push(tileId);
                      }
                      if (!ok) progress.anyError = true;
                      return await checkpointFanoutInstitution(supabase, schedule.userId, schedule.id, progress, new Date());
                    },
                  }
                : {
                    skipInstitutions: new Set(progress.doneInstitutions),
                    onInstitutionDone: async (acronym: string, ok: boolean) => {
                      if (!progress.doneInstitutions.includes(acronym)) progress.doneInstitutions.push(acronym);
                      if (!ok) progress.anyError = true;
                      return await checkpointFanoutInstitution(supabase, schedule.userId, schedule.id, progress, new Date());
                    },
                  }),
            })
          );

          const runStepCount = outcome.steps.length;
          const runErrorCount = outcome.steps.filter((s) => s.status === "error" || s.status === "needs-interaction").length;

          if (outcome.fanout?.truncated) {
            await deferFanoutResume(supabase, schedule.userId, schedule.id, progress.runToken, new Date());
            const completedCount = isCourse
              ? (progress.doneCourses ?? []).length
              : progress.doneInstitutions.length;
            const partialDetail = `fan-out partial: ${completedCount}/${outcome.fanout.total} done`;
            await updateScheduleRunOutcome(supabase, schedule.userId, schedule.id, "started", partialDetail).catch(() => {});
            results.push({ scheduleId: schedule.id, workflowId: schedule.workflowId, status: "ok", detail: partialDetail });
            // This TICK's own run row is finished here even though the
            // fan-out OCCURRENCE (tracked separately via progress.runToken in
            // workflow_schedules) is not: the next tick mints a fresh
            // workflowRunId (see "no new id plumbing" in this feature's
            // ground truth) rather than resuming this one, so leaving this
            // row on "running" forever would misrepresent a tick that in fact
            // completed cleanly (just partially, by design) as one that
            // crashed. "skipped" best matches "did not reach a final ok/error
            // outcome, deliberately deferred" without claiming either.
            await finishWorkflowRun(supabase, schedule.userId, workflowRunId, {
              status: "skipped", detail: partialDetail, stepCount: runStepCount, errorCount: runErrorCount,
            });
          } else {
            await finishFanoutSchedule(supabase, schedule.userId, schedule.id, progress, new Date());
            const runOk = outcome.ok && !progress.anyError;
            const detail = runOk ? "" : joinStepErrorDetail(outcome.steps);
            await updateScheduleRunOutcome(supabase, schedule.userId, schedule.id, runOk ? "ok" : "error", detail).catch(() => {});
            results.push({
              scheduleId: schedule.id, workflowId: schedule.workflowId,
              status: runOk ? "ok" : "error",
              detail: runOk ? undefined : detail,
            });
            await finishWorkflowRun(supabase, schedule.userId, workflowRunId, {
              status: runOk ? "ok" : "error", detail, stepCount: runStepCount, errorCount: runErrorCount,
            });
          }
          continue;
        }

        // Non-fan-out (and invalid/non-headless) schedules: ordinary claim path
        // (advances next_run_at). Unchanged behavior.
        const claimed = await claimWorkflowSchedule(supabase, schedule.userId, schedule, now);
        if (!claimed) {
          await updateScheduleRunOutcome(supabase, schedule.userId, schedule.id, "skipped", "already claimed").catch(() => {});
          results.push({ scheduleId: schedule.id, workflowId: schedule.workflowId, status: "skipped", detail: "already claimed" });
          continue;
        }
        if (!def) {
          const workflowRunId = crypto.randomUUID();
          const reason = "workflow not found";
          await safeStartWorkflowRun(supabase, schedule.userId, {
            id: workflowRunId, workflowId: schedule.workflowId, workflowName: schedule.workflowName, triggerSource: "schedule", triggerRef: schedule.id,
          });
          await updateScheduleRunOutcome(supabase, schedule.userId, schedule.id, "skipped", reason).catch(() => {});
          try {
            const markdown = `# ${schedule.workflowName} - run skipped\n\n${reason}\n`;
            await saveRecordingFile(supabase, schedule.userId, new Blob([markdown], { type: "text/markdown" }), {
              name: `${schedule.workflowName} - skipped`,
              kind: "file",
              mimeType: "text/markdown",
              durationSec: null,
              fileExt: "md",
              source: "workflow",
              origin: "unattended",
              workflowName: schedule.workflowName,
              workflowId: schedule.workflowId,
              workflowRunId,
            });
          } catch { /* ignore */ }
          await finishWorkflowRun(supabase, schedule.userId, workflowRunId, { status: "skipped", detail: reason });
          results.push({ scheduleId: schedule.id, workflowId: schedule.workflowId, status: "skipped", detail: "workflow not found" });
          continue;
        }
        if (!isHeadlessSafeWorkflow(def, lookup)) {
          const workflowRunId = crypto.randomUUID();
          const reason = "workflow is not headless-safe";
          await safeStartWorkflowRun(supabase, schedule.userId, {
            id: workflowRunId, workflowId: schedule.workflowId, workflowName: def.name, triggerSource: "schedule", triggerRef: schedule.id,
          });
          await updateScheduleRunOutcome(supabase, schedule.userId, schedule.id, "skipped", reason).catch(() => {});
          try {
            const markdown = `# ${def.name} - run skipped\n\n${reason}\n`;
            await saveRecordingFile(supabase, schedule.userId, new Blob([markdown], { type: "text/markdown" }), {
              name: `${def.name} - skipped`,
              kind: "file",
              mimeType: "text/markdown",
              durationSec: null,
              fileExt: "md",
              source: "workflow",
              origin: "unattended",
              workflowName: def.name,
              workflowId: schedule.workflowId,
              workflowRunId,
            });
          } catch { /* ignore */ }
          await finishWorkflowRun(supabase, schedule.userId, workflowRunId, { status: "skipped", detail: reason });
          results.push({ scheduleId: schedule.id, workflowId: schedule.workflowId, status: "skipped", detail: "workflow is not headless-safe" });
          continue;
        }

        const workflowRunId = crypto.randomUUID();
        // Start row BEFORE runWorkflowUnattended - before step 0 executes.
        await safeStartWorkflowRun(supabase, schedule.userId, {
          id: workflowRunId, workflowId: schedule.workflowId, workflowName: def.name, triggerSource: "schedule", triggerRef: schedule.id,
          fieldValues: schedule.fieldValues,
        });
        const outcome = await runAsOwner({ id: userRes.user.id, email: ownerEmail }, () =>
          runWorkflowUnattended({
            def,
            resolveWorkflow: lookup,
            fieldValues: schedule.fieldValues,
            disabledTopIndices: new Set(schedule.disabledSteps),
            helpers: buildServerStepRunHelpers({
              supabase, userId: schedule.userId, institution: schedule.institution,
              provider, author: resolveDocumentAuthor(userRes.user), workflowId: schedule.workflowId, workflowName: def.name,
              workflowRunId,
            }),
            deadlineMs: runDeadlineMs,
            runLog: { supabase, userId: schedule.userId, runId: workflowRunId },
          })
        );

        const runDetail = outcome.ok ? "" : joinStepErrorDetail(outcome.steps);
        await updateScheduleRunOutcome(supabase, schedule.userId, schedule.id, outcome.ok ? "ok" : "error", runDetail).catch(() => {});
        results.push({
          scheduleId: schedule.id, workflowId: schedule.workflowId,
          status: outcome.ok ? "ok" : "error",
          detail: outcome.ok ? undefined : runDetail,
        });

        await finishWorkflowRun(supabase, schedule.userId, workflowRunId, {
          status: outcome.ok ? "ok" : "error",
          detail: runDetail,
          stepCount: outcome.steps.length,
          errorCount: outcome.steps.filter((s) => s.status === "error" || s.status === "needs-interaction").length,
        });
      } catch (err) {
        // A throw anywhere after this schedule was claimed (claimWorkflowSchedule
        // / claimFanoutSchedule already flipped its row to "started") would
        // otherwise leave that row stuck on "started" forever - the JSON result
        // below is only ever seen by whoever inspects this response, not by the
        // schedule row the Automate panel reads. Stamp the row too so it always
        // reflects the true outcome. Best-effort: a DB failure while stamping
        // must never mask the original error.
        const message = err instanceof Error ? err.message : String(err);
        await updateScheduleRunOutcome(supabase, schedule.userId, schedule.id, "error", message).catch(() => {});
        results.push({
          scheduleId: schedule.id,
          workflowId: schedule.workflowId,
          status: "error",
          detail: message,
        });
      }
    }

    // After time-schedules, evaluate due UNATTENDED event triggers across all
    // users (a new submission, a repo push, a chained workflow, ...). Isolated in
    // its own try so a trigger-side failure never masks the schedule results.
    try {
      triggerResults = await runDueUnattendedTriggers(supabase, now, MAX_SCHEDULES_PER_RUN);
    } catch (err) {
      triggerResults = [
        {
          triggerId: "",
          workflowId: "",
          status: "error",
          detail: err instanceof Error ? err.message : String(err),
        },
      ];
    }

    return NextResponse.json({
      processed: results.length,
      results,
      triggersProcessed: triggerResults.length,
      triggers: triggerResults,
    });
  } catch (err) {
    tickError = err;
    // Re-thrown rather than turned into a JSON 500: an uncaught tick failure
    // keeps producing this route's existing behavior (Next's default 500 for
    // an uncaught handler error), unchanged by this feature.
    throw err;
  } finally {
    // H1 item 2: best-effort by contract. recordCronHeartbeat already logs
    // and never throws; a false return here just needs its own log line and
    // must never change the HTTP status this handler already returned or is
    // about to throw.
    const heartbeatOk = await recordCronHeartbeat(supabase, {
      tickAt: now,
      source,
      schedulesProcessed: results.length,
      triggersProcessed: triggerResults.length,
      durationMs: Date.now() - tickStartMs,
      lastError: tickError === null ? null : tickError instanceof Error ? tickError.message : safeErrorToString(tickError),
    });
    if (!heartbeatOk) console.error("Failed to write the cron heartbeat for this tick.");
  }
}
