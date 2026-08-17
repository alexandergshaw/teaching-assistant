"use client";

// F3's polling hook for the per-student invitation status panel
// (StudentRepoRoster.tsx). Shape copied from
// src/app/components/bulk-repo/hooks/useCopilotAgents.ts: localStorage
// seeding in useState initializers with a validating parse (here,
// parseStoredStatusRows - Wave B's own defensive parser, not reimplemented),
// write-back effects, a cancel ref, checkedAt, and a timer gated on an
// active flag with cleanup and an in-flight guard so a poll never overlaps
// a manual refresh or a mutation.
//
// AC3.6/AC3.6a/AC3.6b (polling discipline + the required Pause control) and
// AC2.5/AC2.7/AC3.8 (one shared serialization queue; a mutation's own
// refresh keeps the row honest without racing the poll) both live here
// rather than in the component, so the component stays about rendering.
//
// GitHub-bound work (the three mutations, the manual refresh, and the
// automatic poll) is serialized through a promise-chain queue rather than
// a boolean "bail if busy" guard: a click that arrives while another
// operation is in flight WAITS its turn instead of being silently
// dropped. Only the automatic poll refresh may still be skipped outright
// when something is already in flight - it is not user-initiated, so
// there is nothing to lose by dropping it and letting the next tick try
// again.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  studentRepoInvitationStatusAction,
  resendStudentRepoInviteAction,
  revokeStudentRepoInviteAction,
  setupStudentRepoAction,
} from "@/app/actions";
import type { RepoPermission } from "@/lib/github";
import { rosterToRows } from "@/lib/courses-tab-helpers";
import { parseStoredStatusRows, formatProvisionOutcome, type StudentRepoInvitationRow } from "@/lib/student-repo-status";

const BASE_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 180_000;
// Defect B fix: how long the prefix field waits after the last keystroke
// before its network refetch fires. Long enough to cover the gap between
// keystrokes for someone typing at a normal pace (well under 700ms), short
// enough that the panel still feels responsive once they stop.
const PREFIX_REFETCH_DEBOUNCE_MS = 700;

function statusStorageKey(courseId: string) {
  return `ta-roster-provision-status-${courseId}`;
}
function autoRefreshStorageKey(courseId: string) {
  return `ta-roster-provision-autorefresh-${courseId}`;
}

function normalizeHandle(u: string): string {
  return u.trim().replace(/^@/, "").toLowerCase();
}

/** Identifies one roster row across renders/refreshes: the normalized
 * GitHub handle when there is one (the only thing guaranteed unique),
 * otherwise the student's own text plus their position in the roster
 * (AC2.1a rows have no handle at all, and two handle-less students can
 * share the same trimmed/lowercased name - the roster index is what makes
 * THIS branch unique; it is never used for the handle branch, which is
 * already unique on its own). `index` must be the row's position in the
 * roster - stable across refreshes, since it never changes when a row's
 * status resolves - never anything derived from resolved status. */
export function rowKey(student: string, username: string, index: number): string {
  const handle = normalizeHandle(username);
  return handle ? `u:${handle}` : `s:${student.trim().toLowerCase()}:${index}`;
}

function rowSignature(rows: StudentRepoInvitationRow[]): string {
  return rows
    .map(
      (r, i) => `${rowKey(r.student, r.username, i)}|${r.state}|${r.detail ?? ""}|${r.invitationId ?? ""}|${r.expiresAt ?? ""}`
    )
    .sort()
    .join("\n");
}

export interface ProvisionParams {
  templateRepo: string;
  isPrivate: boolean;
  permission: RepoPermission;
}

export interface UseStudentRepoInvitationsOptions {
  /** Whether this panel is currently mounted/visible and should be
   * operating at all - mirrors useCopilotAgents' own `active` gate. The
   * caller only mounts this hook while the roster is expanded (AC1.5), so
   * in practice this stays true for the hook's whole lifetime; it is kept
   * as an explicit option anyway so the polling effect's gating logic
   * matches the reference idiom rather than assuming its own caller. */
  active: boolean;
  courseId: string;
  /** Trimmed course.githubOrg; "" when unset. */
  org: string;
  prefix: string;
  /** Raw course.roster text (not yet split into rows). */
  rosterText: string;
}

export function useStudentRepoInvitations({ active, courseId, org, prefix, rosterText }: UseStudentRepoInvitationsOptions) {
  const rosterUsernames = rosterToRows(rosterText).map((r) => r.username);

  const [rows, setRows] = useState<StudentRepoInvitationRow[]>(() => {
    if (typeof window === "undefined") return [];
    const parsed = parseStoredStatusRows(localStorage.getItem(statusStorageKey(courseId)), rosterUsernames, prefix);
    return parsed.rows;
  });
  const [checkedAt, setCheckedAt] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const parsed = parseStoredStatusRows(localStorage.getItem(statusStorageKey(courseId)), rosterUsernames, prefix);
    return parsed.checkedAt || null;
  });
  const [checking, setChecking] = useState(false);
  const [notChecked, setNotChecked] = useState(0);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(autoRefreshStorageKey(courseId));
    return stored === null ? true : stored === "1";
  });
  // Defect 2 fix: `prefix` is the field rows are stored AS COMPUTED UNDER
  // (see the write-back effect below and AC3.9/AC3.9a) - so a prefix edit
  // must invalidate the resolved rows, not re-stamp them with the new
  // prefix while leaving every computed repo name stale. Compared here
  // during render (React's documented "adjust state during render"
  // pattern - mirrors useKbAttachments.ts' selectedId reset), not inside a
  // useEffect: the FIRST render/commit that carries the new prefix also
  // already carries rows=[]/checkedAt=null, so the write-back effect below
  // never observes rows tagged with the wrong prefix, not even for one
  // tick, and nothing downstream (resolvedByKey, the poll's `rows.some`
  // check) ever sees a stale row either.
  const [prefixAtLastResolve, setPrefixAtLastResolve] = useState(prefix);
  if (prefix !== prefixAtLastResolve) {
    setPrefixAtLastResolve(prefix);
    setRows([]);
    setCheckedAt(null);
  }
  const [busyRowKey, setBusyRowKey] = useState<string | null>(null);
  // Transient per-row outcome text (AC2.6), keyed the same way rows are.
  // A refresh (manual or polled) only reports status - it never touches
  // this. Each row clears its OWN entry when the user starts a fresh
  // action on that row (provisionRow/inviteOrResendRow/revokeRow), so a
  // retry doesn't show the previous attempt's message next to a fresh
  // spinner, and other rows' outcomes are left alone.
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});

  // Tail of the serialized GitHub-operation chain. Every queued operation
  // appends itself here via enqueue() below and becomes the new tail. This
  // promise is guaranteed to always resolve (never reject) - see enqueue -
  // so one operation's failure can never poison the ones queued behind it.
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  // True whenever an operation is queued or currently running. This is
  // consulted ONLY by the automatic poll/visibility refresh to decide
  // whether it may skip itself rather than pile up behind whatever is
  // already running - the three mutations and the manual refresh button
  // never consult it, they always enqueue and wait their turn.
  const inFlightRef = useRef(false);
  const pendingOpsRef = useRef(0);
  const intervalMsRef = useRef(BASE_INTERVAL_MS);
  const cancelledRef = useRef(false);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // Defect A fix: a refresh's only prior post-await guard was cancelledRef,
  // which only trips on unmount - a result from a refresh that closed over
  // an OLD (org, prefix, rosterText) can still land after the user has since
  // changed one of them, and nothing stopped it from being applied as if it
  // were current. generationRef is the live "which inputs are current right
  // now" counter, bumped by the effect below every time any of the three
  // change. runRefreshCore snapshots generationRef.current the instant IT
  // starts running (for a queued op, that's when the queue reaches it, not
  // when it was enqueued - so a request that closed over a stale prefix
  // still gets tagged with the generation that was live when it actually
  // started) and compares that snapshot back to generationRef.current before
  // touching any state in its result path, alongside (never instead of) the
  // cancelledRef check.
  const generationRef = useRef(0);
  useEffect(() => {
    generationRef.current += 1;
  }, [org, prefix, rosterText]);

  // Appends `op` to the tail of the GitHub-operation chain and returns a
  // promise that settles the same way `op` does. `op` only starts once
  // every previously queued operation has settled (successfully or not),
  // which is what guarantees at most one GitHub-bound request set is ever
  // in flight - the property the old `if (inFlightRef.current) return;`
  // guard was trying to provide, but without discarding the click.
  //
  // The chain's own tail (chainRef.current) is always replaced with a
  // promise that resolves regardless of whether `op` succeeded or threw,
  // so a rejected operation cannot poison the chain: whatever is queued
  // after it still runs. The rejection itself is preserved and delivered
  // to whoever called enqueue() for this particular operation.
  const enqueue = useCallback(<T,>(op: () => Promise<T>): Promise<T> => {
    pendingOpsRef.current += 1;
    inFlightRef.current = true;
    const resultPromise = chainRef.current.then(op);
    resultPromise.then(
      () => {
        pendingOpsRef.current = Math.max(0, pendingOpsRef.current - 1);
        if (pendingOpsRef.current === 0) inFlightRef.current = false;
      },
      () => {
        pendingOpsRef.current = Math.max(0, pendingOpsRef.current - 1);
        if (pendingOpsRef.current === 0) inFlightRef.current = false;
      }
    );
    chainRef.current = resultPromise.then(
      () => undefined,
      () => undefined
    );
    return resultPromise;
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // Write-back: rows + checkedAt + the prefix they were computed under
  // (AC3.9/AC3.9a - a prefix mismatch on the NEXT load discards this whole
  // list, since every computed repo name would otherwise be stale).
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(statusStorageKey(courseId), JSON.stringify({ prefix, checkedAt: checkedAt ?? 0, rows }));
  }, [courseId, prefix, checkedAt, rows]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(autoRefreshStorageKey(courseId), autoRefresh ? "1" : "0");
  }, [courseId, autoRefresh]);

  // The actual refresh request/state-update body, with no queueing logic
  // of its own. Called two ways:
  //   - via runRefresh() below, going through enqueue() like any other
  //     GitHub-bound operation, for the manual refresh button and the
  //     automatic poll/visibility triggers;
  //   - directly (bypassing enqueue) from inside a mutation's own queued
  //     operation, since that operation IS the current slot in the chain -
  //     see the comment on that call for why re-entering enqueue there
  //     would deadlock.
  const runRefreshCore = useCallback(
    async (manual: boolean) => {
      if (!active || !org.trim()) return;
      // Defect A fix: snapshot the generation THIS request is running under
      // before the await, so the result path below can tell a still-current
      // result from a stale one. See the generationRef declaration above.
      const generation = generationRef.current;
      setChecking(true);
      // Defect 3 fix: the action's own try/catch only covers errors raised
      // INSIDE it - an offline/500/transport failure rejects this await
      // instead. Without this try/finally, that rejection would leave
      // `checking` stuck true forever (aria-busy stuck on the table, the
      // Refresh button permanently disabled) with no way to recover short
      // of a reload. try/finally guarantees `checking` clears either way;
      // the catch surfaces the failure the same way a returned `{ error }`
      // already does, rather than leaving the panel silent.
      try {
        const result = await studentRepoInvitationStatusAction(org.trim(), prefix, rosterText);
        // Defect A fix: cancelledRef covers "the component is gone";
        // generation covers "the component is still here but has since
        // moved on to different inputs". Both must be checked before ANY
        // setState below - a stale result (by either measure) must never
        // touch rows/checkedAt/refreshError, or it gets written back to
        // localStorage as if it belonged to the current prefix.
        if (cancelledRef.current || generation !== generationRef.current) return;
        if ("error" in result) {
          setRefreshError(result.error);
          return;
        }
        setRefreshError(null);
        setNotChecked(result.notChecked);
        const changed = manual || rowSignature(rowsRef.current) !== rowSignature(result.rows);
        intervalMsRef.current = changed ? BASE_INTERVAL_MS : Math.min(intervalMsRef.current * 2, MAX_INTERVAL_MS);
        setRows(result.rows);
        setCheckedAt(result.checkedAt);
      } catch (err) {
        if (cancelledRef.current || generation !== generationRef.current) return;
        setRefreshError(err instanceof Error ? err.message : "Could not check invitation status.");
      } finally {
        if (!cancelledRef.current) setChecking(false);
      }
    },
    [active, org, prefix, rosterText]
  );

  const runRefresh = useCallback(
    (manual: boolean): Promise<void> => {
      if (manual) {
        // Manual refresh button: user-initiated, must never be dropped -
        // always enqueue and wait its turn.
        return enqueue(() => runRefreshCore(true));
      }
      // Automatic (poll timer / regained visibility): not user-initiated,
      // so it is the one case allowed to skip itself outright when
      // something is already in flight, instead of queuing behind a
      // possibly long mutation.
      if (inFlightRef.current) return Promise.resolve();
      return enqueue(() => runRefreshCore(false));
    },
    [enqueue, runRefreshCore]
  );

  // AC3.6 - first fetch on expand, SEPARATE FROM AND UNCONDITIONAL RELATIVE
  // TO the recurring poll below: not gated on `rows` (a fresh course has
  // none, which used to mean the poll effect's `rows.some(pending)` guard
  // could never arm and no request was EVER issued), on stored rows
  // existing, or on `autoRefresh`. Mirrors useCopilotAgents.ts' own
  // autoPopulatedRef gate: a plain ref (not state) so flipping it triggers
  // no extra render, reset to false only when `active` goes false so a
  // collapse-then-re-expand (which, per this hook's `active` doc comment,
  // is really an unmount/remount in the one caller that exists today, but
  // the gate is written to also cover a future caller that flips `active`
  // in place) fires exactly one more immediate refresh. `runRefresh(true)`
  // (the manual path) so this fetch can never be silently dropped by the
  // "skip if something is already in flight" behavior reserved for the
  // automatic poll/visibility triggers.
  // Defect C fix: on a course with no githubOrg, runRefreshCore's own
  // `!org.trim()` guard makes this mount fetch a no-op - rows stays [], so
  // the poll effect's `rows.some(pending)` guard never arms and nothing
  // else in this hook ever asks the server again. Setting the Organization
  // from a different cell in the same row re-renders StudentRepoRoster with
  // a new `org` (RosterCell never unmounts it while expanded), but that
  // alone does not unmount THIS hook, so didInitialFetchRef is already true
  // and this effect would otherwise stay a no-op forever, leaving the panel
  // stuck on "Checking..." indefinitely. orgWasBlankRef tracks org's
  // blank-ness across renders so the effect can re-arm on the SPECIFIC
  // blank -> non-blank transition, not on every org edit (which would
  // reintroduce a fetch-per-render problem the same shape as Defect B).
  const orgWasBlankRef = useRef(!org.trim());
  const didInitialFetchRef = useRef(false);
  useEffect(() => {
    const orgBlank = !org.trim();
    if (!active) {
      didInitialFetchRef.current = false;
      orgWasBlankRef.current = orgBlank;
      return;
    }
    const orgJustBecameSet = orgWasBlankRef.current && !orgBlank;
    orgWasBlankRef.current = orgBlank;
    if (didInitialFetchRef.current && !orgJustBecameSet) return;
    didInitialFetchRef.current = true;
    void runRefresh(true);
  }, [active, org, runRefresh]);

  // Defect 2 fix, refetch half: the render-phase reset above (next to
  // `prefixAtLastResolve`) already invalidates rows/checkedAt the instant
  // `prefix` changes; this effect is what makes "every row returns to
  // unresolved and the panel refetches" literally true instead of leaving
  // the table stuck on `Checking...` until the user finds Refresh. Reacts
  // ONLY to `prefix`, never to `rows`/`checkedAt`, so the refetch this
  // triggers (which changes `rows`/`checkedAt`) cannot re-trigger itself -
  // no loop. Guarded by its own ref (not `didInitialFetchRef` above) so it
  // never fires on mount - `prevPrefixForRefetchRef` starts equal to the
  // first render's `prefix`, so the initial fetch stays the ONLY fetch
  // issued on mount, and this effect only ever fires on a genuine,
  // subsequent prefix edit.
  // Defect B fix: the prefix TextField has no debounce of its own, so
  // `prefix` changes on every keystroke - this effect used to call
  // runRefresh(true) (a full serialized GitHub-bound refresh, exempt from
  // the "skip if already in flight" shortcut since it's the manual path)
  // on every single one, up to ~960 requests for a six-character edit. The
  // render-phase reset next to `prefixAtLastResolve` above still runs
  // immediately on every keystroke unchanged - only the NETWORK refetch is
  // delayed here, via PREFIX_REFETCH_DEBOUNCE_MS. prevPrefixForRefetchRef
  // only advances when the debounced refresh actually fires, so
  // intermediate keystrokes keep re-arming (and, via the cleanup below,
  // cancelling) the same pending timer instead of each starting its own -
  // and since the cleanup runs on every dependency change AND on unmount,
  // the timer can never fire once the panel has closed.
  const prevPrefixForRefetchRef = useRef(prefix);
  useEffect(() => {
    if (!active) return;
    if (prevPrefixForRefetchRef.current === prefix) return;
    const timer = setTimeout(() => {
      prevPrefixForRefetchRef.current = prefix;
      void runRefresh(true);
    }, PREFIX_REFETCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, prefix, runRefresh]);

  // AC3.6: base 60s, stop entirely once nothing is pending, pause while the
  // tab is hidden, back off 60->120->180s after no-change refreshes (all
  // handled by runRefresh above), reset to 60 on any change or manual
  // refresh. A fresh setTimeout (not setInterval) is scheduled every time
  // `rows` changes, so the NEXT delay always reflects the backoff computed
  // by the refresh that just completed.
  useEffect(() => {
    if (!active || !autoRefresh) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (!rows.some((r) => r.state === "pending")) return;

    const timer = setTimeout(() => {
      if (!inFlightRef.current) void runRefresh(false);
    }, intervalMsRef.current);
    return () => clearTimeout(timer);
  }, [active, autoRefresh, rows, runRefresh]);

  // AC3.6 rule 3: pause on document.hidden, one immediate refresh on
  // return - matching TanStack Query's / SWR's default behavior.
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const onVisibility = () => {
      if (!document.hidden && autoRefresh && rowsRef.current.some((r) => r.state === "pending")) {
        void runRefresh(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active, autoRefresh, runRefresh]);

  const refresh = useCallback(() => {
    void runRefresh(true);
  }, [runRefresh]);

  const provisionRow = useCallback(
    async (student: string, username: string, index: number, params: ProvisionParams) => {
      const key = rowKey(student, username, index);
      // Acknowledge the click immediately, before this operation even
      // reaches the front of the queue - otherwise a click that lands
      // mid-poll would show no busy state for however long the poll (or
      // whatever else is ahead of it) takes to finish.
      setBusyRowKey(key);
      // Clear this row's own stale outcome so a retry doesn't show the
      // previous attempt's message next to the fresh spinner. No other
      // row's outcome is touched.
      setOutcomes((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await enqueue(async () => {
        // Defect 3 fix: try/finally so a transport-level throw (offline,
        // 500, etc. - not one of the action's own `{ error }` returns)
        // still clears busyRowKey instead of leaving the row on "Working..."
        // forever, and still surfaces something in this row's outcome
        // rather than failing silently (the caller only does `void
        // provisionRow(...)`, so nothing else would ever see the
        // rejection).
        try {
          const result = await setupStudentRepoAction(
            org.trim(),
            params.templateRepo,
            prefix,
            student,
            username,
            params.isPrivate,
            params.permission
          );
          if (cancelledRef.current) return;
          if ("error" in result) {
            setOutcomes((prev) => ({ ...prev, [key]: `Failed: ${result.error}` }));
            return;
          }
          const hasUsername = username.trim().replace(/^@/, "") !== "";
          setOutcomes((prev) => ({ ...prev, [key]: formatProvisionOutcome(result, hasUsername) }));
          intervalMsRef.current = BASE_INTERVAL_MS;
          // AC2.7: this row's status refreshes immediately. Call the core
          // body directly rather than through runRefresh()/enqueue() - this
          // callback IS the current slot in the chain, so queuing again here
          // would append a new tail behind itself and deadlock waiting on
          // its own completion.
          await runRefreshCore(true);
        } catch (err) {
          if (cancelledRef.current) return;
          setOutcomes((prev) => ({
            ...prev,
            [key]: `Failed: ${err instanceof Error ? err.message : "The repository could not be created."}`,
          }));
        } finally {
          // Only clear this row's busy flag if it's still the one we set -
          // a later click on a different row may already have taken over
          // busyRowKey while this operation was queued/running.
          if (!cancelledRef.current) setBusyRowKey((prev) => (prev === key ? null : prev));
        }
      });
    },
    [org, prefix, enqueue, runRefreshCore]
  );

  const inviteOrResendRow = useCallback(
    async (student: string, username: string, index: number, repo: string, permission: RepoPermission) => {
      const key = rowKey(student, username, index);
      setBusyRowKey(key);
      // Clear this row's own stale outcome so a retry doesn't show the
      // previous attempt's message next to the fresh spinner. No other
      // row's outcome is touched.
      setOutcomes((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await enqueue(async () => {
        // See provisionRow above: try/finally covers a transport-level
        // throw, not just the action's own `{ error }` returns.
        try {
          const result = await resendStudentRepoInviteAction(org.trim(), repo, username, permission);
          if (cancelledRef.current) return;
          if ("error" in result) {
            setOutcomes((prev) => ({ ...prev, [key]: `Failed: ${result.error}` }));
            return;
          }
          setOutcomes((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
          intervalMsRef.current = BASE_INTERVAL_MS;
          // See provisionRow: direct call, not runRefresh()/enqueue(), to
          // avoid queuing behind this same operation.
          await runRefreshCore(true);
        } catch (err) {
          if (cancelledRef.current) return;
          setOutcomes((prev) => ({
            ...prev,
            [key]: `Failed: ${err instanceof Error ? err.message : "Could not resend the invitation."}`,
          }));
        } finally {
          if (!cancelledRef.current) setBusyRowKey((prev) => (prev === key ? null : prev));
        }
      });
    },
    [org, enqueue, runRefreshCore]
  );

  const revokeRow = useCallback(
    async (student: string, username: string, index: number, repo: string, invitationId: number) => {
      const key = rowKey(student, username, index);
      setBusyRowKey(key);
      // Clear this row's own stale outcome so a retry doesn't show the
      // previous attempt's message next to the fresh spinner. No other
      // row's outcome is touched.
      setOutcomes((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await enqueue(async () => {
        // See provisionRow above: try/finally covers a transport-level
        // throw, not just the action's own `{ error }` returns.
        try {
          const result = await revokeStudentRepoInviteAction(org.trim(), repo, invitationId);
          if (cancelledRef.current) return;
          if ("error" in result) {
            setOutcomes((prev) => ({ ...prev, [key]: `Failed: ${result.error}` }));
            return;
          }
          intervalMsRef.current = BASE_INTERVAL_MS;
          // See provisionRow: direct call, not runRefresh()/enqueue(), to
          // avoid queuing behind this same operation.
          await runRefreshCore(true);
        } catch (err) {
          if (cancelledRef.current) return;
          setOutcomes((prev) => ({
            ...prev,
            [key]: `Failed: ${err instanceof Error ? err.message : "Could not revoke the invitation."}`,
          }));
        } finally {
          if (!cancelledRef.current) setBusyRowKey((prev) => (prev === key ? null : prev));
        }
      });
    },
    [org, enqueue, runRefreshCore]
  );

  return {
    rows,
    checkedAt,
    checking,
    notChecked,
    refreshError,
    autoRefresh,
    setAutoRefresh,
    busyRowKey,
    outcomes,
    refresh,
    provisionRow,
    inviteOrResendRow,
    revokeRow,
  };
}
