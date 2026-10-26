import { proposeRepositoryGrade } from "@/lib/grade/repository-proposal";
import { reviewRepositoryProposal } from "@/lib/grade/repository-proposal-review";
import { requireAppOwner } from "@/lib/supabase/auth";
import { createGithubBoundedReadContext, readBoundedResponse } from "@/lib/github-bounded-read";
import { REPOSITORY_EVIDENCE_LIMITS as LIMIT, validateRepositoryCollectRequest, validateRepositoryModelRequest } from "@/lib/grade/repository-evidence-policy";
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
  if (!validateRepositoryCollectRequest(body) && !validateRepositoryModelRequest(body)) return Response.json({ error: "Invalid confirmed repository mapping." }, { status: 400 });
  try {
    const result = body.operation === "collect" ? await collectRepositoryEvidence(body, deadline) : body.operation === "propose" ? await proposeRepositoryGrade(body, deadline) : await reviewRepositoryProposal(body, deadline);
    const serialized = JSON.stringify(result);
    if (body.operation !== "collect" && new TextEncoder().encode(serialized).byteLength > 262_144) throw new Error("Response exceeds retention budget.");
    return new Response(serialized, { headers: { "content-type": "application/json" } });
  }
  catch { return Response.json({ error: "Repository operation could not complete. Check the frozen rubric, supported Gemini provider, confirmed scope, evidence coverage and input budgets. Prior grades are preserved." }, { status: 422 }); }
}