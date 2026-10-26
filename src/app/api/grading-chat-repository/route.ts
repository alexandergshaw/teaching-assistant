import { requireAppOwner } from "@/lib/supabase/auth";
import { createGithubBoundedReadContext, readBoundedResponse } from "@/lib/github-bounded-read";
import { REPOSITORY_EVIDENCE_LIMITS as LIMIT, validateRepositoryCollectRequest } from "@/lib/grade/repository-evidence-policy";
import { collectRepositoryEvidence } from "@/lib/grade/repository-evidence-collector";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  try { await requireAppOwner(); }
  catch { return Response.json({ error: "Owner authorization required." }, { status: 401 }); }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return Response.json({ error: "Expected JSON." }, { status: 400 });
  const deadline = Date.now() + LIMIT.deadlineMs;
  const bodyContext = createGithubBoundedReadContext(deadline, LIMIT.requestBytes);
  let body: unknown;
  try {
    body = JSON.parse(await readBoundedResponse(new Response(request.body, { headers: request.headers }), bodyContext, LIMIT.requestBytes));
  } catch { return Response.json({ error: "Invalid or oversized repository request." }, { status: 400 }); }
  finally { bodyContext.dispose(); }
  if (!validateRepositoryCollectRequest(body)) return Response.json({ error: "Invalid confirmed repository mapping." }, { status: 400 });
  try { return Response.json(await collectRepositoryEvidence(body, deadline)); }
  catch { return Response.json({ error: "Repository collection failed. Check the confirmed scope and available coverage, then retry." }, { status: 422 }); }
}