import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/supabase/auth";
import { getWorkflowSchedule } from "@/lib/workflow-schedules";
import { getWorkflowTrigger } from "@/lib/workflow-triggers";
import { listWorkflowDefs } from "@/lib/workflow-defs";
import { allWorkflows } from "@/lib/workflows/presets";
import { isHeadlessSafeWorkflow } from "@/lib/workflows/headless";
import { runWorkflowUnattended, buildServerStepRunHelpers } from "@/lib/workflows/server-runner";
import { safeStartWorkflowRun } from "@/lib/workflows/run-logging";
import { finishWorkflowRun } from "@/lib/workflow-runs";
import { resolveDocumentAuthor } from "@/lib/author";
import { assembleManualRunInput, manualRunEligibility, describeManualRunOutcome, type ManualRunKind } from "@/lib/automation-manual-run";
import type { LlmProvider } from "@/lib/llm";

// Manual "Run now" entry point for the Automations hub (AutomationsPanel /
// AutomationRow): runs ONE schedule or trigger's OWN stored configuration
// (AC2) through the SAME unattended runner the cron route and the webhook
// route use - see src/app/api/cron/run-schedules/route.ts (the template this
// mirrors) for the run-loop / headless-safety rationale, and
// src/lib/workflows/headless.ts for which workflows are eligible.
//
// Differences from the cron route (both deliberate):
//   - Authenticated by the caller's own cookie session (requireOwner), not
//     CRON_SECRET - there is no impersonation here (runAsOwner is never
//     called): the person clicking the button already IS the owner, so
//     requireOwner() inside every nested server action this run touches
//     resolves the same way it would for anything else that user does.
//   - Never claims the schedule/trigger (claimWorkflowSchedule /
//     claimAndAdvanceTrigger) and never calls updateScheduleRunOutcome /
//     updateTriggerRunOutcome - see the AC4/AC3 notes below.
//
// A dedicated Route Handler (not a Server Action) because this needs its own
// maxDuration: Next.js only honors maxDuration for Server Actions at the
// PAGE level (see node_modules/next/dist/docs/.../maxDuration.md - "If using
// Server Actions, set the maxDuration at the page level"), and this repo's
// page.tsx is not this feature's to edit. A route.ts can set its own ceiling
// directly, exactly like the cron and webhook routes already do.
export const runtime = "nodejs";
// 60s is the ceiling that builds on ALL plans (the Hobby cap) - see the same
// comment on src/app/api/cron/run-schedules/route.ts.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export interface ManualRunResponse {
  runId: string;
  ok: boolean;
  status: "ok" | "error" | "skipped";
  message: string;
}

export async function GET() {
  return NextResponse.json({ error: "Use POST to run an automation now." }, { status: 405 });
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireOwner();

    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const kind: ManualRunKind = b.kind === "trigger" ? "trigger" : "schedule";
    const id = typeof b.id === "string" ? b.id : "";
    if (!id) {
      return NextResponse.json({ error: "Missing schedule/trigger id." }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Re-read fresh from the database rather than trusting anything the
    // client sent - the ENTIRE point of "runs its own stored configuration"
    // (AC2) is that a manual run can never drift from what is actually saved.
    const record =
      kind === "schedule"
        ? await getWorkflowSchedule(supabase, user.id, id)
        : await getWorkflowTrigger(supabase, user.id, id);
    if (!record) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const customDefs = await listWorkflowDefs(supabase, user.id);
    const defs = allWorkflows(customDefs);
    const lookup = (workflowId: string) => defs.find((d) => d.id === workflowId);
    const def = lookup(record.workflowId);

    const eligibility = manualRunEligibility({
      workflowExists: !!def,
      isHeadlessSafe: !!def && isHeadlessSafeWorkflow(def, lookup),
    });
    if (!eligibility.eligible || !def) {
      return NextResponse.json({ error: eligibility.reason ?? "This automation cannot be run right now." }, { status: 422 });
    }

    const provider: LlmProvider =
      record.provider === "gemini" || record.provider === "other" || record.provider === "embedded"
        ? record.provider
        : "gemini";

    const runInput = assembleManualRunInput(record);
    const workflowRunId = crypto.randomUUID();

    // Start row BEFORE runWorkflowUnattended - before step 0 executes.
    // triggerSource "manual" + triggerRef = the schedule/trigger id is what
    // makes this run show up in THAT row's own Recent runs table (AC3),
    // exactly like a schedule/trigger/webhook-caused run does for its kind.
    await safeStartWorkflowRun(supabase, user.id, {
      id: workflowRunId,
      workflowId: record.workflowId,
      workflowName: record.workflowName,
      triggerSource: "manual",
      triggerRef: record.id,
      fieldValues: runInput.fieldValues,
    });

    // `user` is `User | OwnerIdentity` (requireOwner's return type covers the
    // cron route's impersonation path too); only a real Supabase User carries
    // user_metadata, which resolveDocumentAuthor reads for a display name.
    const author = resolveDocumentAuthor("user_metadata" in user ? (user as User) : null);

    const outcome = await runWorkflowUnattended({
      def,
      resolveWorkflow: lookup,
      fieldValues: runInput.fieldValues,
      disabledTopIndices: runInput.disabledTopIndices,
      helpers: buildServerStepRunHelpers({
        supabase,
        userId: user.id,
        institution: runInput.institution,
        provider,
        author,
        workflowId: record.workflowId,
        workflowName: record.workflowName,
        workflowRunId,
      }),
      // Manual "Run now" does not implement the cron route's multi-tick
      // fan-out checkpoint/resume (claimFanoutSchedule / skipInstitutions /
      // onInstitutionDone and their course equivalents) - it is a one-off
      // test invocation, not an occurrence claim (AC4: it must never touch
      // fanout_progress or next_run_at at all). A fan-out automation run this
      // way simply does as much as fits in the time budget below and reports
      // an honest partial-skip outcome (describeManualRunOutcome) rather than
      // pretending to resume across calls.
      deadlineMs: Date.now() + 50_000,
      runLog: { supabase, userId: user.id, runId: workflowRunId },
    });

    const message = describeManualRunOutcome(outcome);

    // AC3, deliberate: this does NOT call updateScheduleRunOutcome /
    // updateTriggerRunOutcome. Those columns (last_run_status/last_run_detail,
    // shown in the Status column and the row's "Needs attention" flag) are the
    // instructor's record of the automation's REAL scheduled/triggered firing
    // history - what tells them whether the cron job is actually working. A
    // manual test click overwriting that would corrupt the one signal this
    // feature exists to protect (see the run-schedules cron route header
    // comment). The manual run is still fully attributable and inspectable:
    // it gets its own workflow_runs row (triggerSource "manual") and appears
    // in the row's own Recent runs list via triggerRef, same as any other
    // run - it just never overwrites the summary the row's own columns show.
    await finishWorkflowRun(supabase, user.id, workflowRunId, {
      status: message.status,
      detail: message.ok ? "" : message.message,
      stepCount: outcome.steps.length,
      errorCount: outcome.steps.filter((s) => s.status === "error" || s.status === "needs-interaction").length,
    });

    const response: ManualRunResponse = { runId: workflowRunId, ok: message.ok, status: message.status, message: message.message };
    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not run the automation." }, { status: 500 });
  }
}
