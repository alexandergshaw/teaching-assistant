import { randomUUID, timingSafeEqual } from "node:crypto";
import { repoGradeAdmissionMode, repoGradeDurableStartupAvailable } from "@/lib/repo-grades-dashboard/admission-mode";
import { claimAutomaticRepoGrade, enqueueDueAutomaticRepoGrades, finishAutomaticRepoGrade, type AutomaticRepoGradeCompletion } from "@/lib/repo-grades-dashboard/automatic-store";
import { createAutomaticRepoGradeWorker } from "@/lib/repo-grades-dashboard/automatic-worker";
import { resolveImpersonationIdentity, runAsOwner } from "@/lib/supabase/owner-context";
import { createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 300;

// Leave time for the final bounded scan, rubric preparation and evaluation.
const CLAIM_WINDOW_MS = 85_000;
const MAX_CLAIMS_PER_TICK = 32;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ status: "misconfigured" }, { status: 500 });
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from("Bearer " + secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return Response.json({ status: "unauthorized" }, { status: 401 });
  }

  const mode = repoGradeAdmissionMode();
  if (!repoGradeDurableStartupAvailable(mode) || (mode !== "coordinated" && mode !== "embedded-only")) {
    return Response.json({ status: "disabled" });
  }
  const deadline = performance.now() + CLAIM_WINDOW_MS;
  const worker = createAutomaticRepoGradeWorker(mode);
  const supabase = createServiceClient();
  let handled = 0;
  let scheduled = { accepted: 0, failed: 0 };
  try {
    scheduled = await enqueueDueAutomaticRepoGrades().catch(() => ({ accepted: 0, failed: 1 }));
    for (let index = 0; index < MAX_CLAIMS_PER_TICK && performance.now() < deadline; index += 1) {
      const lease = randomUUID();
      const work = await claimAutomaticRepoGrade(lease);
      if (work === null) break;
      if (work === "advanced") continue;
      const { data, error } = await supabase.auth.admin.getUserById(work.accountId);
      if (error) throw new Error("Automatic repository grading identity unavailable");
      const user = data.user;
      const identity = user?.id === work.accountId
        ? await resolveImpersonationIdentity(user.id, user.email, !!user.email_confirmed_at)
        : null;

      const unavailable: AutomaticRepoGradeCompletion = work.phase === "discovering"
        ? { state: "partial", reason: "owner-unavailable", targets: [] }
        : { state: "blocked", reason: "owner-unavailable" };
      const result = identity?.role === "owner"
        ? await runAsOwner(identity, () => worker(work, lease)).catch((): AutomaticRepoGradeCompletion => work.phase === "discovering"
          ? { state: "partial", reason: "discovery-unavailable", targets: [] }
          : { state: "unknown", reason: "worker-interrupted" })
        : unavailable;
      if (!await finishAutomaticRepoGrade(work, lease, result)) {
        throw new Error("Automatic repository grading settlement unavailable");
      }
      handled += 1;
    }
    return scheduled.failed
      ? Response.json({ status: "schedule-unavailable", handled, scheduled }, { status: 503 })
      : Response.json({ status: "ok", handled, scheduled });
  } catch {
    return Response.json({ status: "worker-unavailable", handled, scheduled }, { status: 503 });
  }
}
