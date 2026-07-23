import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runAsOwner } from "@/lib/supabase/owner-context";
import { isOwnerEmail } from "@/lib/owner";
import {
  listDueUnattendedWorkflowSchedules, claimWorkflowSchedule,
  claimFanoutSchedule, checkpointFanoutInstitution, deferFanoutResume, finishFanoutSchedule,
} from "@/lib/workflow-schedules";
import { updateScheduleRunOutcome } from "@/lib/workflow-run-status";
import { listWorkflowDefs } from "@/lib/workflow-defs";
import { allWorkflows } from "@/lib/workflows/presets";
import { isHeadlessSafeWorkflow } from "@/lib/workflows/headless";
import { runWorkflowUnattended, buildServerStepRunHelpers } from "@/lib/workflows/server-runner";
import { isInstitutionFanout, isCourseFanout, hasCourseMultiplicity } from "@/lib/workflows/fanout";
import { runDueUnattendedTriggers } from "@/lib/workflow-trigger-runner";
import { recordWorkflowRun } from "@/lib/workflow-runs";
import { resolveDocumentAuthor } from "@/lib/author";
import { saveRecordingFile } from "@/lib/recording-files";
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
            await recordWorkflowRun(supabase, schedule.userId, {
              workflowId: schedule.workflowId,
              workflowName: def!.name,
              status: "skipped",
              triggerSource: "schedule",
              id: workflowRunId,
            });
          } catch { /* ignore */ }
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

        if (outcome.fanout?.truncated) {
          await deferFanoutResume(supabase, schedule.userId, schedule.id, progress.runToken, new Date());
          const completedCount = isCourse
            ? (progress.doneCourses ?? []).length
            : progress.doneInstitutions.length;
          const partialDetail = `fan-out partial: ${completedCount}/${outcome.fanout.total} done`;
          await updateScheduleRunOutcome(supabase, schedule.userId, schedule.id, "started", partialDetail).catch(() => {});
          results.push({ scheduleId: schedule.id, workflowId: schedule.workflowId, status: "ok", detail: partialDetail });
        } else {
          await finishFanoutSchedule(supabase, schedule.userId, schedule.id, progress, new Date());
          const runOk = outcome.ok && !progress.anyError;
          const detail = runOk ? "" : outcome.steps
            .filter((s) => s.status === "error" || s.status === "needs-interaction")
            .map((s) => `step ${s.index + 1} ${s.type}: ${s.error ?? s.status}`)
            .join("; ");
          await updateScheduleRunOutcome(supabase, schedule.userId, schedule.id, runOk ? "ok" : "error", detail).catch(() => {});
          results.push({
            scheduleId: schedule.id, workflowId: schedule.workflowId,
            status: runOk ? "ok" : "error",
            detail: runOk ? undefined : detail,
          });
          try {
            await recordWorkflowRun(supabase, schedule.userId, {
              workflowId: schedule.workflowId, workflowName: def!.name,
              status: runOk ? "ok" : "error", triggerSource: "schedule", id: workflowRunId,
            });
          } catch { /* ignore */ }
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
          await recordWorkflowRun(supabase, schedule.userId, {
            workflowId: schedule.workflowId,
            workflowName: schedule.workflowName,
            status: "skipped",
            triggerSource: "schedule",
            id: workflowRunId,
          });
        } catch { /* ignore */ }
        results.push({ scheduleId: schedule.id, workflowId: schedule.workflowId, status: "skipped", detail: "workflow not found" });
        continue;
      }
      if (!isHeadlessSafeWorkflow(def, lookup)) {
        const workflowRunId = crypto.randomUUID();
        const reason = "workflow is not headless-safe";
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
          await recordWorkflowRun(supabase, schedule.userId, {
            workflowId: schedule.workflowId,
            workflowName: def.name,
            status: "skipped",
            triggerSource: "schedule",
            id: workflowRunId,
          });
        } catch { /* ignore */ }
        results.push({ scheduleId: schedule.id, workflowId: schedule.workflowId, status: "skipped", detail: "workflow is not headless-safe" });
        continue;
      }

      const workflowRunId = crypto.randomUUID();
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
        })
      );

      const runDetail = outcome.ok ? "" : outcome.steps
        .filter((s) => s.status === "error" || s.status === "needs-interaction")
        .map((s) => `step ${s.index + 1} ${s.type}: ${s.error ?? s.status}`)
        .join("; ");
      await updateScheduleRunOutcome(supabase, schedule.userId, schedule.id, outcome.ok ? "ok" : "error", runDetail).catch(() => {});
      results.push({
        scheduleId: schedule.id, workflowId: schedule.workflowId,
        status: outcome.ok ? "ok" : "error",
        detail: outcome.ok ? undefined : runDetail,
      });

      try {
        await recordWorkflowRun(supabase, schedule.userId, {
          workflowId: schedule.workflowId, workflowName: def.name,
          status: outcome.ok ? "ok" : "error", triggerSource: "schedule", id: workflowRunId,
        });
      } catch { /* ignore */ }
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
  let triggerResults: Awaited<ReturnType<typeof runDueUnattendedTriggers>> = [];
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
}
