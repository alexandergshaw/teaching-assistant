import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { runAsOwner } from "@/lib/supabase/owner-context";
import { isOwnerEmail } from "@/lib/owner";
import {
  listEnabledRepoPushTriggers,
  matchRepoPushTriggers,
  advanceRepoPushCursor,
  claimAndAdvanceTrigger,
} from "@/lib/workflow-triggers";
import { recordWorkflowRun } from "@/lib/workflow-runs";
import { listWorkflowDefs } from "@/lib/workflow-defs";
import { allWorkflows } from "@/lib/workflows/presets";
import { isHeadlessSafeWorkflow } from "@/lib/workflows/headless";
import { runWorkflowUnattended, buildServerStepRunHelpers } from "@/lib/workflows/server-runner";
import { resolveDocumentAuthor } from "@/lib/author";
import type { LlmProvider } from "@/lib/llm";

// Inbound GitHub push webhook endpoint that instantly fires enabled repo-push
// workflow triggers. Like src/app/api/triggers/[token]/route.ts, this runs
// unattended workflows without a session cookie, so it is a trusted caller
// of runAsOwner. See that route (the template this one mirrors),
// src/lib/workflows/headless.ts (which workflows are eligible),
// src/lib/workflows/server-runner.ts (the run loop), and
// src/lib/supabase/owner-context.ts (the owner-impersonation bypass).
//
// Runs on the Node.js runtime (not edge): it needs the service-role Supabase
// client, Node crypto, and the same server actions the app already uses, none
// of which are edge-compatible.
//
// SECURITY: the trust boundary here is the HMAC signature over the raw
// request body (X-Hub-Signature-256) verified against GITHUB_WEBHOOK_SECRET,
// exactly like CRON_SECRET is for run-schedules. The signature is checked
// with timing-safe comparison to prevent timing attacks. After HMAC
// verification, every matched trigger's owner is re-checked against
// isOwnerEmail and the workflow is gated through isHeadlessSafeWorkflow,
// just like the token route.
export const runtime = "nodejs";
// 60s is the ceiling that builds on ALL plans (the Hobby cap). A higher value
// (up to 300 on Pro, 900 on Enterprise) makes the deployment FAIL to build on
// Hobby, which silently unregisters the route. On Pro you can raise this to 300.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "Use POST to fire a push webhook." }, { status: 405 });
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
    }
    const raw = await req.text();
    const sigHeader = req.headers.get("x-hub-signature-256") ?? "";
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
    // timingSafeEqual throws on length mismatch - treat any failure as invalid.
    let valid = false;
    try {
      valid =
        sigHeader.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected));
    } catch {
      valid = false;
    }
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }

    const event = req.headers.get("x-github-event") ?? "";
    if (event === "ping") return NextResponse.json({ ok: true, ping: true });
    if (event !== "push") return NextResponse.json({ ok: true, ignored: event || "unknown" });

    let payload: {
      repository?: { name?: string; full_name?: string; owner?: { login?: string; name?: string } };
      head_commit?: { timestamp?: string } | null;
    };
    try {
      payload = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Bad payload." }, { status: 400 });
    }
    const org = (payload.repository?.owner?.login ?? payload.repository?.owner?.name ?? "").trim();
    const repoName = (payload.repository?.name ?? "").trim();
    const headCommit = payload.head_commit;
    // No head commit = branch delete / tag / no new content - nothing to fire on.
    if (!org || !repoName || !headCommit) {
      return NextResponse.json({ ok: true, ignored: "no head commit" });
    }
    const commitTs = headCommit.timestamp || new Date().toISOString();
    const fullName = (payload.repository?.full_name ?? `${org}/${repoName}`).trim();

    const supabase = createServiceClient();
    const all = await listEnabledRepoPushTriggers(supabase);
    const matches = matchRepoPushTriggers(all, org, repoName);

    let fired = 0;
    for (const trigger of matches) {
      // Owner re-check + headless gate, exactly like the token route.
      const { data: userRes, error } = await supabase.auth.admin.getUserById(trigger.userId);
      if (error || !userRes?.user || !isOwnerEmail(userRes.user.email)) continue;
      const ownerEmail = userRes.user.email;
      if (!ownerEmail) continue;

      const customDefs = await listWorkflowDefs(supabase, trigger.userId);
      const defs = allWorkflows(customDefs);
      const lookup = (id: string) => defs.find((d) => d.id === id);
      const def = lookup(trigger.workflowId);
      if (!def || !isHeadlessSafeWorkflow(def, lookup)) continue;

      // Claim + advance the cursor atomically (dedup vs the poller / concurrent
      // pushes). If we do not win the claim, someone else handled this repo.
      const advanced = advanceRepoPushCursor(trigger.cursor, fullName, commitTs);
      const won = await claimAndAdvanceTrigger(
        supabase,
        trigger,
        { fired: true, cursor: advanced, detail: `push ${org}/${repoName}`, fireValues: { org, repo: repoName } },
        new Date()
      );
      if (!won) continue;

      const provider: LlmProvider =
        trigger.provider === "gemini" || trigger.provider === "other" || trigger.provider === "embedded"
          ? trigger.provider
          : "gemini";

      const outcome = await runAsOwner({ id: userRes.user.id, email: ownerEmail }, () =>
        runWorkflowUnattended({
          def,
          resolveWorkflow: lookup,
          fieldValues: { ...trigger.fieldValues, org, repo: repoName },
          disabledTopIndices: new Set(trigger.disabledSteps),
          helpers: buildServerStepRunHelpers({
            supabase,
            userId: trigger.userId,
            institution: trigger.institution,
            provider,
            author: resolveDocumentAuthor(userRes.user),
          }),
        })
      );
      try {
        await recordWorkflowRun(supabase, trigger.userId, {
          workflowId: trigger.workflowId,
          workflowName: trigger.workflowName,
          status: outcome.ok ? "ok" : "error",
          triggerSource: "webhook",
        });
      } catch {
        // best-effort
      }
      fired++;
    }

    return NextResponse.json({ ok: true, fired });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed." }, { status: 500 });
  }
}
