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
import {
  cachedResearchFor,
  resolveRegenerateResearchOutcome,
  shouldReuseInFlightResearch,
} from "./useAnnouncementDraftSlots";
import type { ResourceOutcome } from "./announcement-draft-slots";

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
