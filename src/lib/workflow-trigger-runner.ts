// Server-side helper that evaluates and runs UNATTENDED event triggers across
// ALL users while the app is closed. This is the event-trigger analog of the
// schedule loop in src/app/api/cron/run-schedules/route.ts - same
// owner-resolution, allowlist re-check, headless-safety re-check, runAsOwner
// impersonation, and provider defaulting, but driven by workflow_triggers
// instead of workflow_schedules. The Vercel Cron route (or any other trusted
// server caller) invokes runDueUnattendedTriggers with a service-role client.
//
// This module must stay server-safe: no "use client", no window/DOM access.
// It is imported by a Route Handler.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { LlmProvider } from "@/lib/llm";
import {
  listUnattendedTriggersDue,
  isTriggerDueForCheck,
  evaluateTrigger,
  claimAndAdvanceTrigger,
  touchTriggerChecked,
} from "@/lib/workflow-triggers";
import { updateTriggerRunOutcome } from "@/lib/workflow-run-status";
import { recordWorkflowRun, latestWorkflowRun, runsSinceForWorkflow, latestRunAnyWorkflow, runsSinceAnyWorkflow } from "@/lib/workflow-runs";
import { runWorkflowUnattended, buildServerStepRunHelpers } from "@/lib/workflows/server-runner";
import { isHeadlessSafeWorkflow } from "@/lib/workflows/headless";
import { listWorkflowDefs } from "@/lib/workflow-defs";
import { allWorkflows } from "@/lib/workflows/presets";
import { runAsOwner } from "@/lib/supabase/owner-context";
import { isOwnerEmail } from "@/lib/owner";
import { resolveDocumentAuthor } from "@/lib/author";

export interface TriggerRunResult {
  triggerId: string;
  workflowId: string;
  status: "fired" | "not-fired" | "skipped" | "error";
  detail?: string;
}

/**
 * Evaluate every unattended, enabled, pollable trigger that is due for a
 * check (capped at `maxTriggers`), and run the ones that fire. Mirrors the
 * GET handler in src/app/api/cron/run-schedules/route.ts step for step -
 * see that file for the full rationale behind each re-check.
 */
export async function runDueUnattendedTriggers(
  supabase: SupabaseClient<Database>,
  now: Date,
  maxTriggers = 5
): Promise<TriggerRunResult[]> {
  const results: TriggerRunResult[] = [];

  const due = (await listUnattendedTriggersDue(supabase)).filter((trigger) =>
    isTriggerDueForCheck(trigger, now)
  ).slice(0, maxTriggers);

  for (const trigger of due) {
    try {
      // Defensive re-check: confirm the trigger's owner is still an
      // allowlisted owner right now, independent of whatever it was when the
      // trigger was created (OWNER_EMAILS may have changed since).
      const { data: userRes, error } = await supabase.auth.admin.getUserById(trigger.userId);
      if (error || !userRes?.user || !isOwnerEmail(userRes.user.email)) {
        await touchTriggerChecked(supabase, trigger, now).catch(() => {});
        await updateTriggerRunOutcome(supabase, trigger.userId, trigger.id, "skipped", "owner is not allowlisted").catch(() => {});
        results.push({ triggerId: trigger.id, workflowId: trigger.workflowId, status: "skipped", detail: "owner is not allowlisted" });
        continue;
      }
      const ownerEmail = userRes.user.email;
      if (!ownerEmail) {
        await updateTriggerRunOutcome(supabase, trigger.userId, trigger.id, "skipped", "owner has no email on file").catch(() => {});
        results.push({ triggerId: trigger.id, workflowId: trigger.workflowId, status: "skipped", detail: "owner has no email on file" });
        continue;
      }

      const customDefs = await listWorkflowDefs(supabase, trigger.userId);
      const defs = allWorkflows(customDefs);
      const lookup = (id: string) => defs.find((d) => d.id === id);
      const def = lookup(trigger.workflowId);

      if (!def) {
        await touchTriggerChecked(supabase, trigger, now).catch(() => {});
        await updateTriggerRunOutcome(supabase, trigger.userId, trigger.id, "skipped", "workflow not found").catch(() => {});
        results.push({ triggerId: trigger.id, workflowId: trigger.workflowId, status: "skipped", detail: "workflow not found" });
        continue;
      }
      if (!isHeadlessSafeWorkflow(def, lookup)) {
        await touchTriggerChecked(supabase, trigger, now).catch(() => {});
        await updateTriggerRunOutcome(supabase, trigger.userId, trigger.id, "skipped", "workflow is not headless-safe").catch(() => {});
        results.push({ triggerId: trigger.id, workflowId: trigger.workflowId, status: "skipped", detail: "workflow is not headless-safe" });
        continue;
      }

      // Evaluate the event source inside runAsOwner so the server actions it
      // calls (getInstitutionCountsAction, checkStudentActivityAction, etc.)
      // resolve the impersonated owner exactly like the run itself does.
      const evalResult = await runAsOwner({ id: userRes.user.id, email: ownerEmail }, () =>
        evaluateTrigger(trigger, {
          activeInstitution: trigger.institution ?? null,
          latestRun: (workflowId) => latestWorkflowRun(supabase, trigger.userId, workflowId),
          runsSince: (workflowId, sinceIso) => runsSinceForWorkflow(supabase, trigger.userId, workflowId, sinceIso),
          excludeWorkflowId: trigger.workflowId,
          latestRunAny: (excludeId) => latestRunAnyWorkflow(supabase, trigger.userId, excludeId),
          runsSinceAny: (sinceIso, excludeId) => runsSinceAnyWorkflow(supabase, trigger.userId, sinceIso, excludeId),
        })
      );

      // Atomic claim AFTER evaluating: conditioned on check_version still
      // holding its read value, so the client watcher (if the app happens to
      // be open too) and a second cron tick can never both fire the same
      // occurrence. Also advances the cursor and stamps last_checked_at (and
      // last_fired_at when fired), regardless of what happens next.
      const claimed = await claimAndAdvanceTrigger(supabase, trigger, evalResult, now);
      if (!claimed) {
        await updateTriggerRunOutcome(supabase, trigger.userId, trigger.id, "skipped", "already claimed").catch(() => {});
        results.push({ triggerId: trigger.id, workflowId: trigger.workflowId, status: "skipped", detail: "already claimed" });
        continue;
      }
      if (!evalResult.fired) {
        results.push({ triggerId: trigger.id, workflowId: trigger.workflowId, status: "not-fired", detail: evalResult.detail });
        continue;
      }

      const provider: LlmProvider =
        trigger.provider === "gemini" || trigger.provider === "other" || trigger.provider === "embedded"
          ? trigger.provider
          : "gemini";

      const runDeadlineMs = now.getTime() + 50_000;
      const workflowRunId = crypto.randomUUID();
      const outcome = await runAsOwner({ id: userRes.user.id, email: ownerEmail }, () =>
        runWorkflowUnattended({
          def,
          resolveWorkflow: lookup,
          fieldValues: { ...trigger.fieldValues, ...(evalResult.fireValues ?? {}) },
          disabledTopIndices: new Set(trigger.disabledSteps),
          helpers: buildServerStepRunHelpers({
            supabase,
            userId: trigger.userId,
            institution: trigger.institution,
            provider,
            author: resolveDocumentAuthor(userRes.user),
            workflowId: trigger.workflowId,
            workflowName: trigger.workflowName,
            workflowRunId,
          }),
          deadlineMs: runDeadlineMs,
        })
      );

      const triggerDetail = outcome.ok ? "" : outcome.steps
        .filter((s) => s.status === "error" || s.status === "needs-interaction")
        .map((s) => `step ${s.index + 1} ${s.type}: ${s.error ?? s.status}`)
        .join("; ");
      await updateTriggerRunOutcome(supabase, trigger.userId, trigger.id, outcome.ok ? "ok" : "error", triggerDetail).catch(() => {});

      // Best-effort run log so the 'workflow-completed' event source can see
      // this run; a logging failure must never fail the trigger itself.
      try {
        await recordWorkflowRun(supabase, trigger.userId, {
          workflowId: trigger.workflowId,
          workflowName: trigger.workflowName,
          status: outcome.ok ? "ok" : "error",
          triggerSource: "trigger",
          id: workflowRunId,
        });
      } catch {
        // swallow - logging is a convenience, not a correctness requirement.
      }

      results.push({
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        status: "fired",
        detail: outcome.ok ? undefined : triggerDetail,
      });
    } catch (err) {
      results.push({
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
