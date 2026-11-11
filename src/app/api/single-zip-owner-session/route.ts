import { requireAppOwner } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { hasEmptyFeedbackBody, isSameOriginFeedbackRequest } from "@/lib/supabase/repo-feedback-request";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL = "00000000-0000-0000-0000-000000000000";
const headers = { "Cache-Control": "private, no-store" };
function fail(status: number) { return Response.json({ error: "Unable to verify owner session." }, { status, headers }); }

/** Verifies the cookie-backed owner and the exact signed session used by it. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!isSameOriginFeedbackRequest(request, url)) return fail(403);
  if (url.search || !(await hasEmptyFeedbackBody(request))) return fail(400);
  try {
    const owner = await requireAppOwner();
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (request.signal.aborted || error || !claims || claims.sub !== owner.id || typeof claims.session_id !== "string" || !UUID.test(claims.session_id) || claims.session_id === NIL || typeof claims.exp !== "number" || !Number.isSafeInteger(claims.exp) || claims.exp <= Date.now() / 1000) return fail(401);
    return Response.json({ accountId: owner.id, sessionId: claims.session_id }, { headers });
  } catch { return fail(401); }
}
