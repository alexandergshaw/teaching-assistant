"use server";

// Cron heartbeat - the read half's server-action door (H3 item 14,
// docs/cron-heartbeat-acceptance-criteria.md). The cron_heartbeat table has
// deliberately NO insert/update policy (H4 item 18) - only the service-role
// client in /api/cron/run-schedules can write it - so this action is
// read-only by construction, not just by convention. Follows the exact
// try/requireOwner/createServiceClient/catch-returns-error shape every other
// action in this directory uses (see automation-runs.ts, repo-grades.ts):
// requireOwner() runs FIRST, before anything else, so an unauthenticated
// caller gets nothing rather than a heartbeat row it has no reason to see.
//
// A "use server" file may export ONLY async functions - no type re-exports,
// no constants (src/lib/use-server-exports.test.ts guards this; see
// AGENTS memory use-server-no-type-reexport.md). CronHeartbeat itself is
// exported from src/lib/cron-heartbeat.ts and the client component below
// imports it from there directly, never through this file.

import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { readCronHeartbeat, type CronHeartbeat } from "@/lib/cron-heartbeat";

/**
 * The `run-schedules` tick's heartbeat, or null when it has never fired (or
 * the read itself failed - readCronHeartbeat already folds both into null;
 * classifyCronHeartbeat downstream treats that as `never` rather than
 * claiming to tell the two apart, per AC item 12).
 */
export async function getCronHeartbeatAction(): Promise<CronHeartbeat | null> {
  try {
    await requireOwner();
    const supabase = createServiceClient();
    return await readCronHeartbeat(supabase);
  } catch {
    return null;
  }
}
