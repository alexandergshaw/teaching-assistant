import { verifyRepoFeedbackSession } from "@/lib/supabase/repo-feedback-session";
import { hasEmptyFeedbackBody, isSameOriginFeedbackRequest } from "@/lib/supabase/repo-feedback-request";

const MAX_AUTHORIZATION_LENGTH = 8_192;
const BEARER_JWT = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;
const NO_STORE = { "Cache-Control": "no-store" };

function reject(status: number) {
  return Response.json({ error: "Unable to verify feedback session." }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!isSameOriginFeedbackRequest(request, url)) return reject(403);

  const authorization = request.headers.get("authorization");
  if (url.search) return reject(400);
  const jwt = authorization && authorization.length <= MAX_AUTHORIZATION_LENGTH && BEARER_JWT.exec(authorization)?.[1];
  if (!jwt) return reject(401);
  if (!(await hasEmptyFeedbackBody(request))) return reject(400);

  const identity = await verifyRepoFeedbackSession(jwt, request.signal);
  if (!identity) return reject(401);
  return Response.json(identity, { headers: NO_STORE });
}
