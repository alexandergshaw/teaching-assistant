import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runAsOwner } from "@/lib/supabase/owner-context";
import { isOwnerEmail } from "@/lib/owner";
import { findEnabledWebhookTrigger, claimWebhookTrigger } from "@/lib/workflow-triggers";
import { recordWorkflowRun } from "@/lib/workflow-runs";
import { listWorkflowDefs } from "@/lib/workflow-defs";
import { allWorkflows } from "@/lib/workflows/presets";
import { isHeadlessSafeWorkflow } from "@/lib/workflows/headless";
import { runWorkflowUnattended, buildServerStepRunHelpers } from "@/lib/workflows/server-runner";
import { resolveDocumentAuthor } from "@/lib/author";
import type { LlmProvider } from "@/lib/llm";

// Inbound webhook entry point for EVENT-triggered (event_type = 'webhook')
// unattended workflow runs - an external system POSTs here to fire a trigger
// with no session cookie and nobody to answer a mid-run pause, exactly like
// src/app/api/cron/run-schedules/route.ts. See that route (the template this
// one mirrors), src/lib/workflows/headless.ts (which workflows are eligible),
// src/lib/workflows/server-runner.ts (the run loop), and
// src/lib/supabase/owner-context.ts (the owner-impersonation bypass this
// route - alongside run-schedules - is a trusted caller of).
//
// Runs on the Node.js runtime (not edge): it needs the service-role Supabase
// client, Node crypto/AsyncLocalStorage, and the same server actions the app
// already uses, none of which are edge-compatible.
//
// SECURITY: the `token` path segment is the ENTIRE trust boundary for this
// route, exactly like CRON_SECRET is for run-schedules - never log it.
// findEnabledWebhookTrigger only matches an enabled row whose event_type is
// 'webhook', and every unknown/disabled/wrong-type token gets the same 404
// below so a caller cannot distinguish "wrong token" from "token exists but
// disabled".
export const runtime = "nodejs";
// 60s is the ceiling that builds on ALL plans (the Hobby cap). A higher value
// (up to 300 on Pro, 900 on Enterprise) makes the deployment FAIL to build on
// Hobby, which silently unregisters the route. On Pro you can raise this to 300.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "Use POST to fire a webhook trigger." }, { status: 405 });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    if (!token) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const supabase = createServiceClient();

    const trigger = await findEnabledWebhookTrigger(supabase, token);
    if (!trigger) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    // Defensive re-check: confirm the trigger's owner is still an allowlisted
    // owner right now, independent of whatever it was when the trigger was
    // created (OWNER_EMAILS may have changed since).
    const { data: userRes, error } = await supabase.auth.admin.getUserById(trigger.userId);
    if (error || !userRes?.user || !isOwnerEmail(userRes.user.email)) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const ownerEmail = userRes.user.email;
    if (!ownerEmail) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const customDefs = await listWorkflowDefs(supabase, trigger.userId);
    const defs = allWorkflows(customDefs);
    const lookup = (id: string) => defs.find((d) => d.id === id);
    const def = lookup(trigger.workflowId);

    if (!def) {
      return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
    }
    if (!isHeadlessSafeWorkflow(def, lookup)) {
      return NextResponse.json({ error: "This workflow cannot run unattended." }, { status: 422 });
    }

    const provider: LlmProvider =
      trigger.provider === "gemini" || trigger.provider === "other" || trigger.provider === "embedded"
        ? trigger.provider
        : "gemini";

    // Optionally overlay the POST body's string fields onto the trigger's
    // stored field values, so the caller can pass in data the workflow reads.
    // A malformed or absent body is fine - it just means no overlay.
    const bodyValues: Record<string, string> = {};
    try {
      const b = await req.json();
      if (b && typeof b === "object" && !Array.isArray(b)) {
        for (const [k, v] of Object.entries(b)) {
          if (typeof v === "string") bodyValues[k] = v;
        }
      }
    } catch {
      // No body, or not valid JSON - proceed with an empty overlay.
    }

    const claimed = await claimWebhookTrigger(supabase, trigger, new Date());
    if (!claimed) {
      return NextResponse.json({ ok: true, deduped: true, workflow: trigger.workflowName });
    }

    const workflowRunId = crypto.randomUUID();
    const outcome = await runAsOwner({ id: userRes.user.id, email: ownerEmail }, () =>
      runWorkflowUnattended({
        def,
        resolveWorkflow: lookup,
        fieldValues: { ...trigger.fieldValues, ...bodyValues },
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
      })
    );

    try {
      await recordWorkflowRun(supabase, trigger.userId, {
        workflowId: trigger.workflowId,
        workflowName: trigger.workflowName,
        status: outcome.ok ? "ok" : "error",
        triggerSource: "webhook",
        id: workflowRunId,
      });
    } catch {
      // Best-effort: chaining/history is a convenience, never let it break the
      // response for the run that produced it.
    }

    return NextResponse.json({ ok: outcome.ok, workflow: trigger.workflowName });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed." }, { status: 500 });
  }
}
