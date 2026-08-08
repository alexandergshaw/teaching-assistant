// TDD suite for the per-week draft orchestration
// (docs/weekly-announcement-module-content-acceptance-criteria.md AC2 items
// 7, 9, 10, 11, 11a).
//
// Written BEFORE the implementation exists. The drafting FUNCTION and the CLOCK
// are injected, so this suite never touches an LLM, a server action, or the
// network: it pins the orchestration contract only - how many calls are issued,
// how many at once, what happens to the other weeks when one fails, and when the
// run stops asking.
//
// This module is called from ONE server action (AC2 item 7), never from the
// client-bundled step: Next serializes client-dispatched Server Functions, so
// concurrency here is only real when the loop runs server-side.
import { describe, it, expect, vi } from "vitest";
import { draftWeeklyAnnouncements } from "./announcement-drafting";

const targets = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ week: i + 1, instruction: `Draft week ${i + 1}` }));

describe("draftWeeklyAnnouncements (AC2 item 7)", () => {
  it("returns one outcome per week, keyed by week number", async () => {
    const draft = vi.fn(async (instruction: string) => ({
      title: `T: ${instruction}`,
      message: `M: ${instruction}`,
    }));

    const out = await draftWeeklyAnnouncements(targets(3), draft);

    expect(out.size).toBe(3);
    expect(draft).toHaveBeenCalledTimes(3);
    expect(out.get(2)).toMatchObject({ week: 2, title: "T: Draft week 2", message: "M: Draft week 2" });
  });

  it("issues no calls at all for an empty target list", async () => {
    const draft = vi.fn(async () => ({ title: "t", message: "m" }));

    const out = await draftWeeklyAnnouncements([], draft);

    expect(out.size).toBe(0);
    expect(draft).not.toHaveBeenCalled();
  });
});

describe("bounded concurrency (AC2 item 9)", () => {
  async function measure(options?: { concurrency?: number }) {
    let inFlight = 0;
    let maxInFlight = 0;
    const draft = async (instruction: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { title: "t", message: instruction };
    };

    const out = await draftWeeklyAnnouncements(targets(12), draft, options);
    return { out, maxInFlight };
  }

  it("defaults to four drafts in flight - not one, and not twelve", async () => {
    const { out, maxInFlight } = await measure();

    expect(out.size).toBe(12);
    // Pinned exactly: a sequential implementation (1) loses the whole point,
    // and an unbounded one (12) is what the LLM rate limits punish.
    expect(maxInFlight).toBe(4);
  });

  it("honours a configured limit", async () => {
    const { maxInFlight } = await measure({ concurrency: 2 });

    expect(maxInFlight).toBe(2);
  });
});

describe("per-week failure isolation (AC2 item 11)", () => {
  it("keeps the other weeks when one week's draft returns an error", async () => {
    const draft = vi.fn(async (instruction: string) =>
      instruction.includes("week 2")
        ? { error: "Draft failed: HTTP 500 - upstream blew up" }
        : { title: "t", message: instruction }
    );

    const out = await draftWeeklyAnnouncements(targets(3), draft, { concurrency: 1 });

    expect(out.get(1)).toMatchObject({ message: "Draft week 1" });
    expect(out.get(3)).toMatchObject({ message: "Draft week 3" });
    const failed = out.get(2)!;
    expect("error" in failed).toBe(true);
    expect((failed as { error: string }).error).toContain("upstream blew up");
  });

  it("treats a THROWN error the same way, without taking down the run", async () => {
    const draft = vi.fn(async (instruction: string) => {
      if (instruction.includes("week 1")) throw new Error("network down");
      return { title: "t", message: instruction };
    });

    const out = await draftWeeklyAnnouncements(targets(2), draft, { concurrency: 1 });

    expect((out.get(1) as { error: string }).error).toContain("network down");
    expect(out.get(2)).toMatchObject({ message: "Draft week 2" });
  });
});

describe("quota short-circuit (AC2 item 10)", () => {
  it("stops asking once the provider refuses for a NON-TRANSIENT reason", async () => {
    const draft = vi.fn(async () => ({
      error: "Draft failed: HTTP 429 — your billing quota was exceeded (spending cap reached)",
    }));

    const out = await draftWeeklyAnnouncements(targets(6), draft, { concurrency: 1 });

    // The first week discovers the refusal; the remaining five are never asked.
    expect(draft).toHaveBeenCalledTimes(1);
    expect(out.size).toBe(6);
    expect(out.get(6)).toMatchObject({ week: 6, skipped: true, reason: "quota" });
    expect((out.get(6) as { error: string }).error).toMatch(/quota|spending cap/i);
  });

  it("does NOT short-circuit on an ordinary transient 429 that merely mentions quota", async () => {
    // Gemini's own transient 429 body reads "Resource has been exhausted (e.g.
    // check quota)". A naive /quota/i test would abandon a whole term's drafting
    // on a rate limit that a retry would have cleared.
    const draft = vi.fn(async () => ({
      error: "Draft failed: HTTP 429 — Resource has been exhausted (e.g. check quota).",
    }));

    await draftWeeklyAnnouncements(targets(4), draft, { concurrency: 1 });

    expect(draft).toHaveBeenCalledTimes(4);
  });

  it("does NOT short-circuit on a plain server error", async () => {
    const draft = vi.fn(async () => ({ error: "Draft failed: HTTP 503 - try again" }));

    await draftWeeklyAnnouncements(targets(4), draft, { concurrency: 1 });

    expect(draft).toHaveBeenCalledTimes(4);
  });
});

describe("the time budget defers rather than degrades (AC2 item 11a)", () => {
  it("stops issuing drafts once the budget is spent and marks the rest deferred", async () => {
    let now = 0;
    const clock = () => now;
    const draft = vi.fn(async (instruction: string) => {
      now += 10_000; // each draft costs ten seconds of the budget
      return { title: "t", message: instruction };
    });

    const out = await draftWeeklyAnnouncements(targets(6), draft, {
      concurrency: 1,
      budgetMs: 25_000,
      clock,
    });

    expect(draft).toHaveBeenCalledTimes(3);
    expect(out.size).toBe(6);
    expect(out.get(1)).toMatchObject({ message: "Draft week 1" });
    // Deferred, NOT failed and NOT quietly downgraded: a re-run will draft these.
    expect(out.get(4)).toMatchObject({ week: 4, deferred: true });
    expect(out.get(6)).toMatchObject({ week: 6, deferred: true });
    expect("message" in out.get(6)!).toBe(false);
  });

  it("never defers when the work fits the budget", async () => {
    const out = await draftWeeklyAnnouncements(targets(3), async () => ({ title: "t", message: "m" }), {
      budgetMs: 25_000,
    });

    for (const outcome of out.values()) {
      expect("deferred" in outcome).toBe(false);
    }
  });
});
