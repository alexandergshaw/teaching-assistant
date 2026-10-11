/**
 * The ONE constants leaf for the live student send (LIVE-LMS-STUDENT-MESSAGING
 * W4). Every limit lives here so changing one is a one-file edit with no
 * migration, and so the display logic (effectiveStatus) and the ledger wrapper
 * read the SAME threshold. The SQL functions take the window and stale values
 * as parameters from here; their own range checks are sanity floors, not copies.
 */

/** Largest batch one send may carry. */
export const MAX_BATCH_RECIPIENTS = 250;
/** App-side sanity caps (not Canvas limits). */
export const SUBJECT_MAX_CHARS = 200;
export const BODY_MAX_CHARS = 10000;
/** Concurrent per-recipient sends the browser keeps in flight. */
export const SEND_POOL_LIMIT = 3;
/** The circuit breaker pauses after this many consecutive non-accepted results. */
export const BREAKER_K = 3;
/** Total attempts per recipient (refused only). */
export const MAX_ATTEMPTS = 3;
/** A sending row older than this is treated as unknown (persisted by reconcile). */
export const SENDING_STALE_MS = 120000;
/** Duplicate-suspect window: an identical message inside it is excluded. */
export const DUP_WINDOW_MS = 86_400_000;
/** Ledger retention, pruned lazily at Prepare. */
export const LEDGER_RETENTION_DAYS = 90;
/** Rows deleted per prune call. */
export const PRUNE_BATCH_LIMIT = 500;
/** Client-side ceiling on one ledger RPC before it counts as a failure. */
export const LEDGER_RPC_TIMEOUT_MS = 3000;
