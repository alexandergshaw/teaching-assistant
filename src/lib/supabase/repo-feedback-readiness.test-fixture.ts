import { REPO_FEEDBACK_READINESS_POLICY } from "./repo-feedback-readiness-contract";

export function readyResponse(origin: string, expiresAt = Date.now() + 10 * 60_000) {
  return Response.json({ origin, policy: REPO_FEEDBACK_READINESS_POLICY, expiresAt }, {
    headers: { "cache-control": "no-store", date: new Date().toUTCString() },
  });
}
