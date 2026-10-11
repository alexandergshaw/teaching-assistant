"use client";

// The browser half of the live send (LIVE-LMS-STUDENT-MESSAGING W4). It drives
// the owner-only actions ONE RECIPIENT PER CALL (the loop lives here because a
// Server Action has the platform's unconfigured duration) and holds the state
// machine: idle -> preparing -> confirm -> starting -> sending -> done.
//
// THE GATE. Nothing outward happens until the owner clicks the count-labelled
// confirm button: prepare() sends nothing, and confirmAndSend() is the ONLY
// place startLiveMessageBatchAction is referenced. The retry path re-confirms
// with its own count before it re-sends anything.
//
// Rendered subjects and bodies live in memory only (never persisted). The
// per-recipient "Send anyway" overrides are deliberately NOT persisted either:
// a decision about a specific batch must not survive a reload.

import { useEffect, useRef, useState } from "react";
import {
  getLiveMessageBatchAction,
  prepareLiveMessageBatchAction,
  requeueRefusedLiveMessagesAction,
  sendLiveMessageAction,
  startLiveMessageBatchAction,
} from "@/app/actions/live-messaging-send";
import {
  buildSendPlan,
  canConfirmSend,
  codeSummary,
  runSendJob,
  sendKey,
  tally,
  type JobCounts,
  type JobItemResult,
  type RenderedRecipient,
  type SendItem,
  type SendPlan,
} from "@/lib/live-messaging/send-job";
import type { ExcludedRecipient } from "@/lib/live-messaging/send-results";
import { recordMessagingBatchOutcome } from "./messagingDiagnosticLog";

export type SendPhase = "idle" | "preparing" | "confirm" | "starting" | "sending" | "done" | "retry-confirm" | "error";

export interface PreparedBatch {
  snapshot: string;
  institution: string;
  digest: string;
  plan: SendPlan;
  excluded: ExcludedRecipient[];
}

export interface LiveSendState {
  phase: SendPhase;
  error: string | null;
  prepared: PreparedBatch | null;
  /** Keys of excluded recipients the owner chose to send anyway. */
  overrides: ReadonlySet<string>;
  batchId: string | null;
  total: number;
  results: Readonly<Record<string, JobItemResult>>;
  halted: boolean;
}

const INITIAL: LiveSendState = {
  phase: "idle",
  error: null,
  prepared: null,
  overrides: new Set(),
  batchId: null,
  total: 0,
  results: {},
  halted: false,
};

export function useLiveSend(args: {
  institution: string;
  recipients: ReadonlyArray<RenderedRecipient>;
  /** The identity of what the modal shows right now (see snapshotKey). */
  snapshot: string;
}) {
  const [state, setState] = useState<LiveSendState>(INITIAL);
  const stopRef = useRef(false);
  const inFlightRef = useRef(false);

  // Closing the modal (or switching institution, which unmounts it) stops
  // further dispatch; units already in flight finish and settle in the ledger.
  useEffect(() => {
    stopRef.current = false;
    return () => {
      stopRef.current = true;
    };
  }, []);

  const confirmCount = (() => {
    const p = state.prepared;
    if (!p) return 0;
    return p.plan.targets.length - p.excluded.length + state.overrides.size;
  })();

  const gateOpen = canConfirmSend({
    preparedSnapshot: state.prepared ? state.prepared.snapshot : null,
    currentSnapshot: args.snapshot,
    frozenInstitution: state.prepared ? state.prepared.institution : null,
    activeInstitution: args.institution,
    count: confirmCount,
    inFlight: state.phase !== "confirm",
  });

  /** Dry run. Sends NOTHING. */
  const prepare = async () => {
    if (inFlightRef.current) return;
    const plan = buildSendPlan(args.recipients);
    if (plan.targets.length === 0) {
      setState({ ...INITIAL, phase: "error", error: "There is nothing to send: every message has a missing variable." });
      return;
    }
    inFlightRef.current = true;
    setState({ ...INITIAL, phase: "preparing" });
    try {
      const result = await prepareLiveMessageBatchAction({ institutionCode: args.institution, targets: plan.targets });
      if (result.status === "refused") {
        setState({ ...INITIAL, phase: "error", error: result.reason });
      } else {
        setState({
          ...INITIAL,
          phase: "confirm",
          prepared: {
            snapshot: args.snapshot,
            institution: result.institution,
            digest: result.digest,
            plan,
            excluded: result.excluded,
          },
        });
      }
    } catch {
      setState({ ...INITIAL, phase: "error", error: "Could not prepare the messages. Nothing was sent." });
    } finally {
      inFlightRef.current = false;
    }
  };

  const toggleOverride = (key: string) => {
    setState((s) => {
      const next = new Set(s.overrides);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...s, overrides: next };
    });
  };

  const itemsFor = (keys: ReadonlyArray<string>): SendItem[] => {
    const byKey = new Map(args.recipients.map((r) => [sendKey(r.courseId, r.userId), r]));
    return keys.flatMap((key) => {
      const r = byKey.get(key);
      return r ? [{ key, subject: r.rendered.subject.text, body: r.rendered.body.text }] : [];
    });
  };

  const runItems = async (batchId: string, items: SendItem[], institution: string) => {
    const startedAt = Date.now();
    const summary = await runSendJob({
      batchId,
      items,
      sendOne: sendLiveMessageAction,
      pollBatch: getLiveMessageBatchAction,
      shouldStop: () => stopRef.current,
      onResult: (r) => setState((s) => ({ ...s, results: { ...s.results, [r.key]: r } })),
    });
    // Record OUTSIDE any setState updater. Counts and enumerated codes only.
    recordMessagingBatchOutcome({
      at: new Date().toISOString(),
      institution,
      durationMs: Date.now() - startedAt,
      accepted: summary.counts.accepted,
      refused: summary.counts.refused,
      unknown: summary.counts.unknown,
      refusedCodes: codeSummary(summary.results, "refused"),
      unknownCodes: codeSummary(summary.results, "unknown"),
    });
    return summary;
  };

  /** The ONLY caller of startLiveMessageBatchAction: the confirm click. */
  const confirmAndSend = async () => {
    const p = state.prepared;
    if (!p || !gateOpen || inFlightRef.current) return;
    inFlightRef.current = true;
    stopRef.current = false;
    setState((s) => ({ ...s, phase: "starting", error: null }));
    try {
      const started = await startLiveMessageBatchAction(
        {
          institutionCode: p.institution,
          targets: p.plan.targets.map((t) => ({
            ...t,
            allowResend: state.overrides.has(sendKey(t.courseId, t.recipientUserId)),
          })),
        },
        p.digest
      );
      if (started.status === "refused") {
        setState((s) => ({ ...s, phase: "error", error: started.reason }));
        return;
      }
      const keys = started.recipients.filter((r) => r.outcome === "inserted").map((r) => r.key);
      const items = itemsFor(keys);
      setState((s) => ({ ...s, phase: "sending", batchId: started.batchId, total: items.length, results: {} }));
      const summary = await runItems(started.batchId, items, p.institution);
      setState((s) => ({ ...s, phase: "done", halted: summary.halted }));
    } catch {
      setState((s) => ({ ...s, phase: "error", error: "Sending could not start. Nothing was sent." }));
    } finally {
      inFlightRef.current = false;
    }
  };

  const stop = () => {
    stopRef.current = true;
  };

  const refusedKeys = Object.values(state.results)
    .filter((r) => r.outcome === "refused")
    .map((r) => r.key);

  /** Opens a FRESH confirm for the refused rows; nothing is re-sent yet. */
  const askRetry = () => {
    if (state.phase === "done" && refusedKeys.length > 0) setState((s) => ({ ...s, phase: "retry-confirm" }));
  };
  const cancelRetry = () => {
    if (state.phase === "retry-confirm") setState((s) => ({ ...s, phase: "done" }));
  };

  const confirmRetry = async () => {
    if (state.phase !== "retry-confirm" || !state.batchId || inFlightRef.current) return;
    const batchId = state.batchId;
    const institution = state.prepared ? state.prepared.institution : args.institution;
    inFlightRef.current = true;
    stopRef.current = false;
    setState((s) => ({ ...s, phase: "sending" }));
    try {
      const requeued = await requeueRefusedLiveMessagesAction(batchId);
      if (requeued.status === "refused") {
        setState((s) => ({ ...s, phase: "error", error: requeued.reason }));
        return;
      }
      const summary = await runItems(batchId, itemsFor(refusedKeys), institution);
      setState((s) => ({ ...s, phase: "done", halted: summary.halted }));
    } catch {
      setState((s) => ({ ...s, phase: "error", error: "The retry could not start. Nothing further was sent." }));
    } finally {
      inFlightRef.current = false;
    }
  };

  const reset = () => {
    if (state.phase === "sending" || state.phase === "starting" || state.phase === "preparing") return;
    setState(INITIAL);
  };

  const counts: JobCounts = tally(Object.values(state.results), state.total);

  return {
    state,
    confirmCount,
    gateOpen,
    counts,
    refusedCount: refusedKeys.length,
    prepare,
    toggleOverride,
    confirmAndSend,
    stop,
    askRetry,
    cancelRetry,
    confirmRetry,
    reset,
  };
}
