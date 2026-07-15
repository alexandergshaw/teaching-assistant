import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runAsOwner } from "@/lib/supabase/owner-context";
import { isOwnerEmail } from "@/lib/owner";
import { listDueUnattendedWorkflowSchedules, claimWorkflowSchedule } from "@/lib/workflow-schedules";
import { listWorkflowDefs } from "@/lib/workflow-defs";
import { allWorkflows } from "@/lib/workflows/presets";
import { isHeadlessSafeWorkflow } from "@/lib/workflows/headless";
import { runWorkflowUnattended, buildServerStepRunHelpers } from "@/lib/workflows/server-runner";
import { runDueUnattendedTriggers } from "@/lib/workflow-trigger-runner";
import { recordWorkflowRun } from "@/lib/workflow-runs";
import { resolveDocumentAuthor } from "@/lib/author";
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
        results.push({ scheduleId: schedule.id, workflowId: schedule.workflowId, status: "skipped", detail: "owner has no email on file" });
        continue;
      }

      // Atomic claim BEFORE running: conditioned on next_run_at/enabled still
      // holding their read values, so the client watcher (if the app happens
      // to be open too) and a second cron tick can never both run the same
      // occurrence. Also advances next_run_at (or disables a one-shot) and
      // stamps last_run_at, regardless of what happens next.
      const claimed = await claimWorkflowSchedule(supabase, schedule.userId, schedule, now);
      if (!claimed) {
        results.push({ scheduleId: schedule.id, workflowId: schedule.workflowId, status: "skipped", detail: "already claimed" });
        continue;
      }

      const customDefs = await listWorkflowDefs(supabase, schedule.userId);
      const defs = allWorkflows(customDefs);
      const lookup = (id: string) => defs.find((d) => d.id === id);
      const def = lookup(schedule.workflowId);

      if (!def) {
        results.push({ scheduleId: schedule.id, workflowId: schedule.workflowId, status: "skipped", detail: "workflow not found" });
        continue;
      }
      if (!isHeadlessSafeWorkflow(def, lookup)) {
        results.push({ scheduleId: schedule.id, workflowId: schedule.workflowId, status: "skipped", detail: "workflow is not headless-safe" });
        continue;
      }

      const provider: LlmProvider =
        schedule.provider === "gemini" || schedule.provider === "other" || schedule.provider === "embedded"
          ? schedule.provider
          : "gemini";

      const outcome = await runAsOwner({ id: userRes.user.id, email: ownerEmail }, () =>
        runWorkflowUnattended({
          def,
          resolveWorkflow: lookup,
          fieldValues: schedule.fieldValues,
          disabledTopIndices: new Set(schedule.disabledSteps),
          helpers: buildServerStepRunHelpers({
            supabase,
            userId: schedule.userId,
            institution: schedule.institution,
            provider,
            author: resolveDocumentAuthor(userRes.user),
            workflowName: def.name,
          }),
        })
      );

      results.push({
        scheduleId: schedule.id,
        workflowId: schedule.workflowId,
        status: outcome.ok ? "ok" : "error",
        detail: outcome.ok
          ? undefined
          : JSON.stringify(outcome.steps.filter((s) => s.status === "error" || s.status === "needs-interaction")),
      });

      // Log the completion so a 'workflow-completed' (chaining) trigger can
      // fire off this scheduled run. Best-effort: chaining is a convenience and
      // must never fail the run that produced it.
      try {
        await recordWorkflowRun(supabase, schedule.userId, {
          workflowId: schedule.workflowId,
          workflowName: def.name,
          status: outcome.ok ? "ok" : "error",
          triggerSource: "schedule",
        });
      } catch {
        // ignore
      }
    } catch (err) {
      results.push({
        scheduleId: schedule.id,
        workflowId: schedule.workflowId,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
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
