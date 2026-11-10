"use server";

import { requireAppOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { automaticReasonLabel } from "@/lib/repo-grades-dashboard/automatic-reason-label";

const RUN_LIMIT = 20;
const TARGET_LIMIT = 5000;
const PAGE_SIZE = 200;
const STATES = new Set(["queued", "running", "succeeded", "no-submission", "partial", "failed", "unknown", "busy", "blocked", "already-processed", "not-started", "embedded-profile-required", "stopped"]);

/** Explicit export of persisted targets only, scoped to the current owner. */
export async function readRepoGradeDiagnosticTargetsAction(expectedAccountId: unknown) {
  const owner = await requireAppOwner().catch(() => null);
  if (!owner || typeof expectedAccountId !== "string" || owner.id !== expectedAccountId) return { status: "unavailable" as const, targets: [] };
  try {
    const client = createServiceClient();
    const runs = await client.from("repo_grade_automatic_runs").select("id,created_at,phase,repo_grade_automatic_courses(state,reason)", { count: "exact" })
      .eq("user_id", owner.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(RUN_LIMIT).retry(false);
    if (runs.error || !runs.data || runs.count === null || !Number.isSafeInteger(runs.count) || runs.data.length !== Math.min(RUN_LIMIT, runs.count)) throw new Error("runs");
    if (!runs.data.length) return { status: "no-run" as const, targets: [] };
    const targets: { repo: string; url: string; linkStatus: "available" | "invalid"; state: string; reason: string | null; runStartedAt: string; runPhase: string; discoveryIncomplete: boolean }[] = [];
    let targetLimitReached = false;
    const seen = new Set<number>();
    for (const run of runs.data) {
      if (!Number.isFinite(Date.parse(run.created_at)) || !["discovering", "grading", "complete", "incomplete", "stopped"].includes(run.phase)) throw new Error("run");
      const discoveryIncomplete = run.repo_grade_automatic_courses.some((course) => course.state !== "scanned" && course.state !== "not-configured");
      let expected: number | null = null;
      for (let start = 0; ; start += PAGE_SIZE) {
        if (targets.length >= TARGET_LIMIT) { targetLimitReached = true; break; }
        const page = await client.from("repo_grade_automatic_targets").select("id,repo,state,reason", { count: "exact" })
          .eq("run_id", run.id).order("id").range(start, start + PAGE_SIZE - 1).retry(false);
        if (page.error || !page.data || page.count === null || !Number.isSafeInteger(page.count) || page.count < 0 || (expected !== null && expected !== page.count)) throw new Error("page");
        expected = page.count;
        if (page.data.length !== Math.min(PAGE_SIZE, Math.max(0, expected - start))) throw new Error("short");
        for (const row of page.data) {
          if (targets.length >= TARGET_LIMIT) { targetLimitReached = true; break; }
          if (seen.has(row.id) || !STATES.has(row.state)) throw new Error("invalid");
          seen.add(row.id);
          const valid = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(row.repo) && !row.repo.split("/").some((part) => part === "." || part === "..");
          targets.push({ repo: valid ? row.repo : "", url: valid ? `https://github.com/${row.repo}` : "", linkStatus: valid ? "available" : "invalid", state: row.state, reason: row.reason ? automaticReasonLabel(row.reason) : null, runStartedAt: run.created_at, runPhase: run.phase, discoveryIncomplete });
        }
        if (targetLimitReached || start + page.data.length >= expected) break;
      }
      if (targetLimitReached) break;
    }
    // Embedded courses and paged requests are not a transactional snapshot;
    // discovery can omit unstaged targets, so completeness cannot be certified.
    return { status: "partial" as const, runCount: runs.data.length, runLimitReached: runs.count > RUN_LIMIT, targetLimitReached, targets };
  } catch { return { status: "unavailable" as const, targets: [] }; }
}
