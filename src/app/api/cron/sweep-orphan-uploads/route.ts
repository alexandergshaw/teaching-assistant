import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { listFilesAs, removeFilesAs } from "@/lib/supabase/storage";
import { SYLLABUS_UPLOAD_BUCKET } from "@/lib/syllabus-upload-source";
import {
  sweepOrphanUploads,
  ORPHAN_SWEEP_THRESHOLD_MS,
  SWEEP_SOFT_DEADLINE_MS,
  PHASE1_ROOT_LISTING_BUDGET_MS,
  MAX_USER_PREFIXES_PER_TICK,
  SWEEP_LIST_PAGE_SIZE,
  type OrphanSweepLister,
  type OrphanSweepRemover,
  type StartIndexPicker,
} from "@/lib/orphan-upload-sweep";

// The scheduled sweep for orphaned rubric/syllabus upload objects - the
// backstop for two independent leak mechanisms in
// src/lib/syllabus-upload-source.ts: a failed removal that used to be
// swallowed silently, and a tab-close/navigate-away between the browser's
// direct upload and the immediately-following extract call. Mirrors
// src/app/api/cron/run-schedules/route.ts's shape: CRON_SECRET bearer guard,
// nodejs runtime, 60s maxDuration, force-dynamic.
//
// RULING 1 (binding, orphan-uploads-sweep design): the delete/failure
// accounting in the response body is OBSERVATIONAL ONLY in this first
// deployment. The sweep still deletes; only the failedCount is not wired to
// the calling workflow's exit code - see
// .github/workflows/sweep-orphan-uploads.yml. The reconciliation rule keys
// off remove()'s `data` field, whose real-world shape for a named delete is
// unmeasured in this checkout (see src/lib/orphan-upload-sweep.ts's header).
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// The two adapters deciding how Supabase Storage SDK results become the
// sweep's own shapes - exported (and directly unit-tested in route.test.ts
// against fakes shaped like storage.test.ts's) rather than left as inline
// object literals inside GET, where the wholesale `sweepOrphanUploads` mock
// in route.test.ts would otherwise mean these two mapping lines are never
// actually exercised. `makeOrphanSweepRemover`'s `entry.name` line in
// particular is the single line deciding whether `removedNames` (and
// therefore `deleted`) holds leaf names or full paths - see Ruling 1 in
// src/lib/orphan-upload-sweep.ts's header and the `matchedByLeafName` /
// `matchedByFullPath` counters below.
export function makeOrphanSweepLister(supabase: ReturnType<typeof createServiceClient>): OrphanSweepLister {
  return {
    async listPage(path, page) {
      const result = await listFilesAs(supabase, SYLLABUS_UPLOAD_BUCKET, path, page);
      if (result.error || result.data === null) {
        return { entries: [], error: result.error?.message ?? "Unknown listing error" };
      }
      return { entries: result.data, error: null };
    },
  };
}

export function makeOrphanSweepRemover(supabase: ReturnType<typeof createServiceClient>): OrphanSweepRemover {
  return {
    async remove(paths) {
      const result = await removeFilesAs(supabase, SYLLABUS_UPLOAD_BUCKET, paths);
      if (result.error || result.data === null) {
        return { removedNames: [], error: result.error?.message ?? "Unknown removal error" };
      }
      return { removedNames: result.data.map((entry) => entry.name), error: null };
    },
  };
}

export async function GET(req: NextRequest) {
  // SECURITY: this check is the entire trust boundary for the service-role
  // client below - anyone who can guess/steal CRON_SECRET can trigger a
  // bulk delete across every user's Storage objects under the two upload
  // path segments. Never log this value.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  // ABSOLUTE deadline, computed here from the DURATION constant - never pass
  // SWEEP_SOFT_DEADLINE_MS itself through as if it were an absolute instant;
  // see orphan-upload-sweep.ts's own header for why that collision is fatal.
  const softDeadlineAt = new Date(now.getTime() + SWEEP_SOFT_DEADLINE_MS);

  console.log("Orphan-upload sweep tick started:", {
    tickAt: now.toISOString(),
    softDeadlineAt: softDeadlineAt.toISOString(),
  });

  const lister = makeOrphanSweepLister(supabase);
  const remover = makeOrphanSweepRemover(supabase);

  // A genuine CSPRNG draw (never a clock-derived formula - a fixed cron
  // schedule makes any deterministic function of `now` collapse to a
  // period-one orbit). Never called with total === 0 - the sweep's own
  // zero-prefix guard returns before this would ever be reached.
  const picker: StartIndexPicker = { pick: (total) => randomInt(0, total) };

  const result = await sweepOrphanUploads(lister, remover, picker, now, {
    thresholdMs: ORPHAN_SWEEP_THRESHOLD_MS,
    softDeadlineAt,
    phase1BudgetMs: PHASE1_ROOT_LISTING_BUDGET_MS,
    maxUserPrefixesThisTick: MAX_USER_PREFIXES_PER_TICK,
    pageSize: SWEEP_LIST_PAGE_SIZE,
  });

  // Per-object failures are logged with decomposed {userId, segment,
  // uploadId} fields - never a concatenated path, which would be a
  // copy-pastable Storage key. This stays inside Vercel's own function
  // logs; the HTTP response body below is counts-only, since that body
  // crosses into the GitHub Actions log, a different retention/access
  // domain.
  for (const failure of result.failed) {
    console.error("Orphan-upload sweep: object not confirmed removed:", {
      userId: failure.userId,
      segment: failure.segment,
      uploadId: failure.uploadId,
    }, failure.error);
  }

  return NextResponse.json({
    totalUserPrefixes: result.totalUserPrefixes,
    scannedUserPrefixes: result.scannedUserPrefixes,
    deletedCount: result.deleted.length,
    failedCount: result.failed.length,
    skippedNotOldEnoughCount: result.skippedNotOldEnough,
    skippedUnknownAgeCount: result.skippedUnknownAge,
    truncatedByBudget: result.truncatedByBudget,
    // MJ-2: a listing error (wrong bucket, revoked key, a policy change) is
    // a different failure mode than budget exhaustion, and previously
    // produced the exact same truncatedByBudget: true with every other
    // count at zero as a merely-slow tick - watched by nothing. See
    // .github/workflows/sweep-orphan-uploads.yml.
    listingErrors: result.listingErrors,
    // RULING A: both counts, both safe to cross into the GitHub Actions log
    // - a first tick with deletedCount > 0 and one of these at 0 answers
    // the open Ruling 1 question (leaf name vs full path) outright. See
    // src/lib/orphan-upload-sweep.ts's OrphanSweepResult docs.
    matchedByLeafName: result.matchedByLeafName,
    matchedByFullPath: result.matchedByFullPath,
  });
}
