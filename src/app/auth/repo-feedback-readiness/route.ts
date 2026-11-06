import { readRepoFeedbackReadiness } from "@/lib/supabase/repo-feedback-readiness";
import { REPO_FEEDBACK_READINESS_PATH } from "@/lib/supabase/repo-feedback-readiness-contract";
import { hasEmptyFeedbackBody, isSameOriginFeedbackRequest } from "@/lib/supabase/repo-feedback-request";

const NO_STORE = { "Cache-Control": "no-store" };

function reject(status: number) {
  return Response.json({ error: "Feedback sign-in is unavailable." }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!isSameOriginFeedbackRequest(request, url)) return reject(403);
  if (request.method !== "POST" || url.href !== `${url.origin}${REPO_FEEDBACK_READINESS_PATH}` ||
    request.headers.has("authorization") || !(await hasEmptyFeedbackBody(request))) return reject(400);
  const readiness = readRepoFeedbackReadiness();
  const now = Date.now();
  if (request.signal.aborted || !readiness || now >= readiness.expiresAt) return reject(503);
  return Response.json(readiness, { headers: { ...NO_STORE, Date: new Date(now).toUTCString() } });
}
