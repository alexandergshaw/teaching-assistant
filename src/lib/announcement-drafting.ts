// Pure per-week draft orchestration for "draft each scheduled weekly
// announcement from that week's Canvas module content"
// (docs/weekly-announcement-module-content-acceptance-criteria.md AC2 items
// 7, 9, 10, 11, 11a).
//
// This module owns HOW MANY drafts run at once, HOW a failure is isolated per
// week, WHEN a non-transient quota refusal stops new work, and WHEN the
// caller's time budget defers the rest - never the actual LLM call, which is
// injected as `draft`, and never the network, Canvas, or Supabase. That keeps
// it callable from anywhere (it is exercised here with nothing but in-memory
// fakes) and safe to call from the one server action that owns gathering and
// drafting for a whole run (AC2 item 7) - Next.js serializes client-
// dispatched Server Functions one at a time, so bounded concurrency is only
// real when this loop runs server-side, inside a single action call.
//
// The concurrency shape mirrors mapWithConcurrency
// (src/lib/canvas-modules/fetch-helpers.ts:80) - a fixed pool of workers
// draining a shared cursor - but is reimplemented here rather than imported,
// because that module is server-only (it wraps `fetch` with a Canvas auth
// header) and this one must not be.
import { isNonTransientQuotaRefusal } from "@/lib/llm-refusal";

export interface WeeklyDraftTarget {
  week: number;
  instruction: string;
}

export type WeeklyDraftOutcome =
  | { week: number; title: string; message: string }
  | { week: number; error: string; skipped?: true; reason?: "quota" }
  | { week: number; deferred: true; reason: "budget" };

const DEFAULT_CONCURRENCY = 4;

/**
 * Drafts one announcement per target, respecting bounded concurrency, a
 * non-transient-quota short-circuit, and an optional wall-clock budget.
 * Returns one outcome per target, keyed by week - never throws, and never
 * lets one week's failure stop another's draft.
 */
export async function draftWeeklyAnnouncements(
  targets: WeeklyDraftTarget[],
  draft: (instruction: string) => Promise<{ title: string; message: string } | { error: string }>,
  options?: { concurrency?: number; budgetMs?: number; clock?: () => number }
): Promise<Map<number, WeeklyDraftOutcome>> {
  const outcomes = new Map<number, WeeklyDraftOutcome>();
  if (targets.length === 0) return outcomes;

  const concurrency = Math.max(1, options?.concurrency ?? DEFAULT_CONCURRENCY);
  const clock = options?.clock ?? Date.now;
  const budgetMs = options?.budgetMs;
  const start = clock();

  let cursor = 0;
  // Set the moment ANY draft's error is recognized as a non-transient quota
  // refusal (AC2 item 10). Holding the refusal TEXT (not just a boolean)
  // lets every not-yet-started target report the same underlying reason the
  // run actually stopped for, rather than a generic message.
  let quotaRefusalText: string | null = null;

  // Claims the next target synchronously - the budget and quota gates are
  // checked here, BEFORE a target is considered started, so a target that
  // loses the race never reaches `draft` at all. Safe without locking because
  // JS async functions only yield at `await`; everything in this function
  // body up to (not including) the `await draft(...)` below runs atomically.
  function claimNext(): WeeklyDraftTarget | null {
    while (cursor < targets.length) {
      const target = targets[cursor];
      cursor += 1;

      if (quotaRefusalText !== null) {
        outcomes.set(target.week, { week: target.week, error: quotaRefusalText, skipped: true, reason: "quota" });
        continue;
      }
      if (budgetMs !== undefined && clock() - start >= budgetMs) {
        // Deferred, not failed: a re-run (with a fresh budget) will draft
        // this week normally. Falling back to the template here would
        // permanently cost the instructor a draft the clock - not the
        // content - prevented.
        outcomes.set(target.week, { week: target.week, deferred: true, reason: "budget" });
        continue;
      }
      return target;
    }
    return null;
  }

  const workerCount = Math.min(concurrency, targets.length);
  const workers = Array.from({ length: workerCount }, async () => {
    for (let target = claimNext(); target !== null; target = claimNext()) {
      let errorMessage: string | null = null;
      try {
        const result = await draft(target.instruction);
        if ("error" in result) {
          errorMessage = result.error;
        } else {
          outcomes.set(target.week, { week: target.week, title: result.title, message: result.message });
        }
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : "unknown error";
      }

      if (errorMessage !== null) {
        outcomes.set(target.week, { week: target.week, error: errorMessage });
        // A target that itself discovers the refusal is reported with its
        // own real error, not `skipped` - only targets claimed AFTER this
        // point are short-circuited.
        if (quotaRefusalText === null && isNonTransientQuotaRefusal(errorMessage)) {
          quotaRefusalText = errorMessage;
        }
      }
    }
  });

  await Promise.all(workers);
  return outcomes;
}
