// Tests for the pure decision half of G3's once-per-Generate research
// orchestration: cachedResearchFor (Ruling 17/33), shouldReuseInFlightResearch
// and resolveRegenerateResearchOutcome (Ruling 17/34). The rest of
// useAnnouncementDraftSlots.ts (all React state - useReducer, useRef,
// useCallback, the actual generate()/regenerate() closures) cannot be
// exercised here: this project's vitest runs in the "node" environment with
// no jsdom/@testing-library/react and no hook is ever rendered anywhere in
// this suite - see useTakeAnnouncement.test.ts's own header comment for the
// established precedent this follows (decideRealTimeGuard was pulled out of
// that hook for the identical reason).
//
// Not covered by these tests (verifiable only by reading
// useAnnouncementDraftSlots.ts directly, per docs/loop/this-repo.md section
// 6): that generate() actually awaits research BEFORE dispatching
// "generate-started" and re-reads slotsRef.current after that await
// (Ruling 24); that two concurrent generate() calls for the SAME fingerprint
// produce exactly one real fetchResources call and both resolve end-to-end
// (Ruling 34) - the functions below are the DECISIONS that make that true,
// not a rendered reproduction of the effect itself; and that Generate stays
// clickable (not disabled) throughout the research wait, which is a JSX
// `disabled=` prop read off WalkthroughAnnouncementPanel.tsx, not this file.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  cachedResearchFor,
  postArgsFor,
  postResultFor,
  postSignatureFor,
  resolvePostCommit,
  resolveRegenerateResearchOutcome,
  shouldReuseInFlightResearch,
} from "./useAnnouncementDraftSlots";
import { makeSlot, type ResourceOutcome } from "./announcement-draft-slots";

const FOUND: ResourceOutcome = { kind: "found", links: [{ title: "A", url: "https://example.edu/a" }] };
const OFF: ResourceOutcome = { kind: "off" };

describe("cachedResearchFor - Ruling 17/33", () => {
  it("returns null when there is no cache at all", () => {
    expect(cachedResearchFor(null, "fp-1")).toBeNull();
  });

  it("returns the cached outcome when the fingerprint matches exactly", () => {
    expect(cachedResearchFor({ fingerprint: "fp-1", outcome: FOUND }, "fp-1")).toBe(FOUND);
  });

  it("returns null when the fingerprint does not match - a course/module/materials change must never reuse a previous context's result", () => {
    expect(cachedResearchFor({ fingerprint: "fp-course-a", outcome: FOUND }, "fp-course-b")).toBeNull();
  });

  it("sabotage check: a naive truthy-cache check (ignoring the fingerprint) would wrongly reuse across a course change - this test would catch that", () => {
    const cached = { fingerprint: "fp-old", outcome: FOUND };
    const result = cachedResearchFor(cached, "fp-new");
    expect(result).not.toBe(FOUND);
    expect(result).toBeNull();
  });
});

describe("shouldReuseInFlightResearch - Ruling 34", () => {
  it("reuses an in-flight request for the SAME fingerprint", () => {
    expect(shouldReuseInFlightResearch({ fingerprint: "fp-1" }, "fp-1")).toBe(true);
  });

  it("does NOT reuse when there is no in-flight request", () => {
    expect(shouldReuseInFlightResearch(null, "fp-1")).toBe(false);
  });

  it("does NOT reuse an in-flight request for a DIFFERENT fingerprint - a concurrent click for a different course must start its own fetch, never borrow an unrelated one (this is Ruling 17's guarantee arriving from the dedup path)", () => {
    expect(shouldReuseInFlightResearch({ fingerprint: "fp-course-a" }, "fp-course-b")).toBe(false);
  });
});

describe("resolveRegenerateResearchOutcome - Ruling 17", () => {
  it("returns 'off' when researchOn is false, regardless of any cached outcome", () => {
    expect(resolveRegenerateResearchOutcome(false, { fingerprint: "fp-1", outcome: FOUND }, "fp-1")).toEqual(OFF);
  });

  it("reuses the cached outcome when researchOn is true and the fingerprint matches", () => {
    expect(resolveRegenerateResearchOutcome(true, { fingerprint: "fp-1", outcome: FOUND }, "fp-1")).toBe(FOUND);
  });

  it("falls back to 'off' (never an inline re-research) when researchOn is true but the cache is stale - toggling the toggle OFF then back ON, or changing course, must not silently drag along the previous context's links", () => {
    expect(resolveRegenerateResearchOutcome(true, { fingerprint: "fp-old", outcome: FOUND }, "fp-new")).toEqual(OFF);
  });

  it("falls back to 'off' when there is no cache at all yet", () => {
    expect(resolveRegenerateResearchOutcome(true, null, "fp-1")).toEqual(OFF);
  });

  it("sabotage check: consulting researchOn only at Generate time (never re-checking on regenerate) would keep citing resources after the toggle is switched off - this test would catch that", () => {
    // Simulates: Generate ran with research ON and cached a "found" result,
    // then the instructor switched researchOn OFF before clicking
    // Regenerate. The correct behavior ignores the cache entirely here.
    const result = resolveRegenerateResearchOutcome(false, { fingerprint: "fp-1", outcome: FOUND }, "fp-1");
    expect(result).toEqual(OFF);
  });
});

// A32/REQ-A32-1, RULING 65 and RULING 66/M4: resolvePostCommit is
// commitPost's own decision - the DECISION half of REQ-A32-1, which the
// build check found had no instrument of any kind (BLOCKER 3) even though
// this file was in the wave's own declared write set. These tests execute
// the function directly (not merely read commitPost as source text), and
// the past-dated case is the discriminating one: it is what a raw
// `.trim()`-truthiness stand-in for resolveScheduledVisibility gets wrong.
describe("resolvePostCommit - RULING 65 (the decision half of REQ-A32-1)", () => {
  const NOW = new Date("2026-06-15T12:00:00.000Z").getTime();

  it("empty scheduledAt commits immediately - delayedPostAt undefined, scheduledLabel null", () => {
    expect(resolvePostCommit("", NOW)).toEqual({ kind: "commit", delayedPostAt: undefined, scheduledLabel: null });
  });

  it("a future scheduledAt commits with delayedPostAt as the resolved ISO string and scheduledLabel as the resolved locale label", () => {
    const raw = "2026-06-20T09:30";
    const when = new Date(raw);
    expect(resolvePostCommit(raw, NOW)).toEqual({
      kind: "commit",
      delayedPostAt: when.toISOString(),
      scheduledLabel: when.toLocaleString(),
    });
  });

  it('a PAST scheduledAt commits IMMEDIATELY (delayedPostAt undefined, scheduledLabel null) - this is the case a raw truthiness check gets wrong, since a past ISO string is non-empty and therefore "truthy"', () => {
    const raw = "2020-01-01T09:00";
    expect(raw.trim().length > 0).toBe(true); // sanity: this input IS truthy
    expect(resolvePostCommit(raw, NOW)).toEqual({ kind: "commit", delayedPostAt: undefined, scheduledLabel: null });
  });

  it("a malformed scheduledAt is invalid", () => {
    expect(resolvePostCommit("not-a-date", NOW)).toEqual({ kind: "invalid" });
  });
});

// A32 round-2 remediation, BLOCKER R2-1: postArgsFor and postResultFor are
// commitPost's own forwarding, pulled out so this test EXECUTES the
// forwarding rather than only reading commitPost as source text. The round-2
// check's exact mutation family: a single-token edit at either forwarding
// site (`decision.delayedPostAt` -> `undefined`, or
// `scheduledLabel: decision.scheduledLabel` -> `scheduledLabel: null`) kept
// every prior gate green. These tests pin the IDENTITY of the forwarded
// value, not the presence of a name, so both the "replace with undefined/
// null" mutation and the "drop the field entirely" mutation fail loudly.
describe("postArgsFor - RULING 65/BLOCKER R2-1 (the exact 3rd argument commitPost forwards to postDraft)", () => {
  it("forwards a resolved delayedPostAt ISO string verbatim - not a constant undefined", () => {
    const decision = { kind: "commit" as const, delayedPostAt: "2026-06-20T09:30:00.000Z" };
    expect(postArgsFor(decision)).toBe("2026-06-20T09:30:00.000Z");
  });

  it("forwards undefined for an immediate post - the other half of the same forwarding", () => {
    const decision = { kind: "commit" as const, delayedPostAt: undefined };
    expect(postArgsFor(decision)).toBeUndefined();
  });

  it("sabotage check: a mutation that hardcodes the return to undefined would pass the immediate case above but fail the scheduled case - both cases are required together, closing that escape", () => {
    const scheduled = { kind: "commit" as const, delayedPostAt: "2026-12-25T00:00:00.000Z" };
    const result = postArgsFor(scheduled);
    expect(result).not.toBeUndefined();
    expect(result).toBe(scheduled.delayedPostAt);
  });
});

describe("postResultFor - RULING 64/BLOCKER R2-1 (the exact post-result payload commitPost dispatches)", () => {
  it("an error result passes through unchanged", () => {
    expect(postResultFor({ kind: "commit", scheduledLabel: "6/20/2026, 9:30:00 AM" }, { error: "boom" })).toEqual({
      error: "boom",
    });
  });

  it("a success result on a SCHEDULED decision carries the decision's own scheduledLabel, not null", () => {
    const decision = { kind: "commit" as const, scheduledLabel: "6/20/2026, 9:30:00 AM" };
    expect(postResultFor(decision, { course: "CS 101" })).toEqual({
      course: "CS 101",
      scheduledLabel: "6/20/2026, 9:30:00 AM",
    });
  });

  it("a success result on an IMMEDIATE decision carries scheduledLabel null - the other half of the same forwarding", () => {
    const decision = { kind: "commit" as const, scheduledLabel: null };
    expect(postResultFor(decision, { course: "CS 101" })).toEqual({ course: "CS 101", scheduledLabel: null });
  });

  it("sabotage check: a mutation that hardcodes scheduledLabel to null would pass the immediate case above but fail the scheduled case - both cases are required together, closing that escape (this is RULING 64's field going always-null forever, the exact defect round 2 found)", () => {
    const decision = { kind: "commit" as const, scheduledLabel: "12/25/2026, 12:00:00 AM" };
    const result = postResultFor(decision, { course: "CS 101" });
    expect(result).not.toHaveProperty("scheduledLabel", null);
    expect((result as { scheduledLabel: string | null }).scheduledLabel).toBe(decision.scheduledLabel);
  });
});

// A32/M7 (RULING 68): postSignatureFor now includes scheduledAt, so an armed
// post disarms (a new signature no longer matches the armed one) when the
// scheduled time changes - the same guarantee editing title/message already
// had. This is the field that decides WHEN an irrevocable act takes effect,
// so it is the one field whose exclusion from the signature mattered most.
describe("postSignatureFor - RULING 68/M7 (scheduledAt is part of the confirm-arm signature)", () => {
  const DRAFTED_SLOT = {
    ...makeSlot("wta-slot-1", { kind: "default" }, "beginning-of-week"),
    draft: {
      phase: "drafted" as const,
      draft: {
        title: "Week 3",
        message: "Hello",
        builtFrom: { kind: "pasted" as const },
        researchNotice: { kind: "off" as const },
        timing: "beginning-of-week" as const,
      },
      error: null,
    },
  };

  it("returns null for a slot with no draft yet", () => {
    expect(postSignatureFor(makeSlot("wta-slot-1", { kind: "default" }, "beginning-of-week"))).toBeNull();
  });

  it("two slots that differ ONLY in scheduledAt get DIFFERENT signatures - changing just the time must disarm an already-armed post", () => {
    const a = postSignatureFor({ ...DRAFTED_SLOT, scheduledAt: "2026-06-20T09:30" });
    const b = postSignatureFor({ ...DRAFTED_SLOT, scheduledAt: "2026-06-20T10:00" });
    expect(a).not.toBe(b);
  });

  it("the same scheduledAt (and everything else unchanged) gets the SAME signature - so an unchanged armed post still confirms", () => {
    const a = postSignatureFor({ ...DRAFTED_SLOT, scheduledAt: "2026-06-20T09:30" });
    const b = postSignatureFor({ ...DRAFTED_SLOT, scheduledAt: "2026-06-20T09:30" });
    expect(a).toBe(b);
  });
});

// A32 round-2 remediation, BLOCKER R2-1: postArgsFor/postResultFor above are
// correct in isolation, but nothing stops commitPost's own CALL SITE from
// reverting to the old inline literals while those two functions sit
// untested-in-context. This reads this very file as source - the round-2
// check's own canary, `grep -rn 'readFileSync[^)]*useAnnouncementDraftSlots'
// src --include=*.test.ts`, exits 1 before this describe and 0 after it - to
// pin that commitPost actually calls them and forwards nothing else.
describe("BLOCKER R2-1: commitPost forwards through postArgsFor/postResultFor, never an inline literal", () => {
  const hookSource = fs.readFileSync(path.join(__dirname, "useAnnouncementDraftSlots.ts"), "utf-8");
  const slice = hookSource.slice(hookSource.indexOf("const commitPost = useCallback("), hookSource.indexOf("const armPost = useCallback("));

  it("both anchors resolve", () => {
    expect(slice.length).toBeGreaterThan(0);
  });

  it("postDraft's 3rd argument is postArgsFor(decision), and the dispatched result is postResultFor(decision, result) - never decision.delayedPostAt/scheduledLabel inlined", () => {
    expect(slice).toMatch(/postDraft\([^)]*,\s*postArgsFor\(decision\)\)/);
    expect(slice).toMatch(/result:\s*postResultFor\(decision,\s*result\)/);
    expect(slice).not.toMatch(/postDraft\([^)]*,\s*decision\.delayedPostAt\)/);
    expect(slice).not.toMatch(/scheduledLabel:\s*decision\.scheduledLabel/);
  });
});
