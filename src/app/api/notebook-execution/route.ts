import { isSameOriginFeedbackRequest } from "@/lib/supabase/repo-feedback-request";
import { isExpectedOwnerSession } from "@/lib/grade/owner-session-binding";
import { cancelDurableNotebook, discoverNotebook, listDurableNotebooks, pollDurableNotebook, restoreDurableNotebook, startDurableNotebook } from "@/lib/grade/notebook-durable-execution";
import { requireAppOwner } from "@/lib/supabase/auth";
import { createGithubBoundedReadContext, readBoundedResponse } from "@/lib/github-bounded-read";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(status: number) { return Response.json({ error: "Notebook execution is unavailable." }, { status, headers }); }

export async function GET() {
  try { await requireAppOwner(); }
  catch { return fail(401); }
  return Response.json({ enabled: process.env.CODE_RUNNER_NOTEBOOK_DURABLE_ENABLED === "true" }, { headers });
}

/** Only a verified owner/session can start or poll its own attempt. */
export async function POST(request: Request) {
  if (process.env.CODE_RUNNER_NOTEBOOK_DURABLE_ENABLED !== "true") return fail(404);
  if (!isSameOriginFeedbackRequest(request, new URL(request.url))) return fail(403);
  try {
    await requireAppOwner();
    const limit = UPLOAD_WIRE_BUDGET_BYTES + 4096;
    if (Number(request.headers.get("content-length") ?? "0") > limit) return fail(413);
    const context = createGithubBoundedReadContext(Date.now() + 5_000, limit + 1);
    let text: string;
    try { text = await readBoundedResponse(new Response(request.body, { headers: request.headers }), context, limit); }
    finally { context.dispose(); }
    const body = JSON.parse(text);
    if (!body || !isExpectedOwnerSession(body.session)) return fail(400);
    if (body.operation !== "start" && Buffer.byteLength(text) > 4096) return fail(413);
    if (body.operation === "list" && Object.keys(body).sort().join(",") === "operation,session") return Response.json({ attempts: await listDurableNotebooks(body.session) }, { headers });
    if (body.operation === "discover" && Object.keys(body).sort().join(",") === "operation,session,sourceUrl" && typeof body.sourceUrl === "string" && body.sourceUrl.length <= 2000) return Response.json({ notebook: await discoverNotebook(body.session, body.sourceUrl) }, { headers });
    if (typeof body.attempt !== "string" || !UUID.test(body.attempt)) return fail(400);
    if (body.operation === "restore" && Object.keys(body).sort().join(",") === "attempt,operation,session") return Response.json({ gradeRequest: await restoreDurableNotebook(body.session, body.attempt) }, { headers });
    if (body.operation === "poll" && Object.keys(body).sort().join(",") === "attempt,operation,session") return Response.json(await pollDurableNotebook(body.session, body.attempt), { headers });
    if (body.operation === "cancel" && Object.keys(body).sort().join(",") === "attempt,operation,session") return Response.json(await cancelDurableNotebook(body.session, body.attempt), { headers });
    if (body.operation !== "start" || Object.keys(body).sort().join(",") !== "attempt,commit,gradeRequest,operation,owner,path,repo,session,sourceUrl" || typeof body.owner !== "string" || typeof body.repo !== "string" || typeof body.commit !== "string" || typeof body.path !== "string" || body.path.length > 200 || typeof body.sourceUrl !== "string" || body.sourceUrl.length > 2000 || !body.gradeRequest || typeof body.gradeRequest !== "object" || Array.isArray(body.gradeRequest)) return fail(400);
    const result = await startDurableNotebook(body.session, body.attempt, body.owner, body.repo, body.commit, body.path, body.sourceUrl, body.gradeRequest);
    return Response.json(result, { headers });
  } catch { return fail(503); }
}
