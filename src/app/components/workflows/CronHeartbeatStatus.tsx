"use client";

// The scheduler's own status, at the top of the Automations hub (H3 items
// 13, 15, 16 - docs/cron-heartbeat-acceptance-criteria.md). Every OTHER row
// in this hub answers "what is set to run automatically"; this is the one
// place that answers "is the runner alive at all" - a dead cron and a quiet
// one are otherwise indistinguishable from inside the app (see
// src/lib/cron-heartbeat.ts's header comment for the full "hole" this
// closes).
//
// Loads its own data - no props from AutomationsPanel - via a server action
// (the cron_heartbeat table has no client-reachable read path of its own,
// and deliberately no insert/update policy at all; only the cron route's
// service-role client writes it). Fetched once when this mounts, matching
// item 14's "refreshed when the hub opens - not on a timer, and never on
// every render": no polling interval, no re-fetch on prop changes.

import { useEffect, useState } from "react";
import { getCronHeartbeatAction } from "@/app/actions/cron-heartbeat";
import { classifyCronHeartbeat, type CronHeartbeatStatus as HeartbeatStatus } from "@/lib/cron-heartbeat";
import styles from "../../page.module.css";

export function CronHeartbeatStatus() {
  // null = "the mount fetch has not resolved yet" - the only loading state a
  // no-argument, fetch-once effect needs (same idiom as useRepoGradesData's
  // useCourses: no separate setLoading call, no state written before the
  // effect's first await).
  const [status, setStatus] = useState<HeartbeatStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const heartbeat = await getCronHeartbeatAction();
      if (cancelled) return;
      // nowMs is read here, after the await, rather than threaded in from
      // outside - classifyCronHeartbeat is pure and takes nowMs as a
      // parameter precisely so every threshold (late/stalled/future-clock-
      // skew) lives in ONE place and is never re-derived here (AC item 8).
      // The heartbeat is passed through whole (not just lastTickAt) - it is
      // structurally a CronHeartbeatFacts already, and classifyCronHeartbeat
      // needs lastError too, to tell a tick that is firing on time but
      // throwing every time (`failing`) apart from one that is actually
      // healthy. Reading only the timestamp was the bug: it rendered "ran
      // less than a minute ago" over a scheduler broken on every run.
      setStatus(classifyCronHeartbeat(heartbeat, Date.now()));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch still in flight on first paint - nothing to say yet. Rendering
  // nothing (rather than a loading spinner) matches how small a single
  // sentence is; a spinner for this would be more motion than the content
  // warrants.
  if (status === null) return null;

  // Exhaustive switch (rather than the previous if-chain) so a state added
  // later to CronHeartbeatState fails the build here instead of silently
  // falling through to the wrong branch - the `default` below narrows
  // `status.state` to `never` and TypeScript rejects the assignment if a
  // case is missing.
  switch (status.state) {
    // `healthy` and `never` are both quiet hint text - never is explicitly
    // NOT a failure (AC item 15: "has not reported yet", not an error), and
    // a fresh deployment has genuinely never ticked, so it gets the exact
    // same calm treatment `healthy` gets rather than looking alarming on day
    // one.
    case "healthy":
    case "never":
      return (
        <p className={styles.fieldHint} style={{ margin: "0 0 4px" }}>
          {status.message}
        </p>
      );

    // `late`: a visible warning, but not yet an emergency - reuses the exact
    // fieldHint-plus-warning-ink idiom this codebase already uses for the
    // same severity elsewhere (LiveStatusBar's recentWarning,
    // TeleprompterPanel, CreateRepoPanel) rather than inventing a new visual
    // language. role="status" (not "alert") because this is worth noticing,
    // not worth interrupting - AC item 13 only requires a warning to be
    // visible.
    case "late":
      return (
        <p role="status" aria-live="polite" className={styles.fieldHint} style={{ margin: "0 0 4px", color: "var(--warning-ink)" }}>
          {status.message}
        </p>
      );

    // `failing`: the tick is arriving on schedule and throwing every time -
    // a confirmed, active break, not a "might be lagging" jitter case. That
    // makes it MORE urgent than `late` (which genuinely might resolve on its
    // own next interval): there is nothing to wait out here, the code is
    // broken on every run right now. It is still ranked below `stalled`
    // (total outage - the scheduler itself may be disabled, its secret
    // rotated, or the deployment down), because `failing` at least proves
    // the runner, the auth and the schedule loop are all alive; only the
    // work itself is broken. Only two severities exist in this file's
    // visual language (the calm fieldHint and the warning-ink/error pair
    // below), so `failing` reuses the SAME role="alert" + styles.error
    // treatment as `stalled` rather than the warning-ink one `late` uses -
    // "might resolve itself" is exactly the reassurance a `failing`
    // scheduler must not give the reader.
    case "failing":
    case "stalled":
      return (
        <p role="alert" className={styles.error} style={{ margin: "0 0 4px" }}>
          {status.message}
        </p>
      );

    default: {
      const exhaustive: never = status.state;
      throw new Error(`Unhandled cron heartbeat state: ${exhaustive}`);
    }
  }
}
