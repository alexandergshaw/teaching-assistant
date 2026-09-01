import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  openRecordingTool,
  navigateToRecordingTool,
  parseRecordingLaunch,
  takeRecordingKnowledgeContext,
  RECORDING_LAUNCH_EVENT,
} from "./recording-launch";

describe("recording-launch", () => {
  describe("parseRecordingLaunch", () => {
    it("accepts a bare view with no knowledgeContext", () => {
      expect(parseRecordingLaunch({ view: "discussions" })).toEqual({ view: "discussions" });
    });

    it("accepts a view with a usable knowledgeContext", () => {
      expect(
        parseRecordingLaunch({ view: "discussions", knowledgeContext: { text: "hello", label: "1 page" } })
      ).toEqual({ view: "discussions", knowledgeContext: { text: "hello", label: "1 page" } });
    });

    it("degrades rather than throws on a completely malformed input", () => {
      expect(parseRecordingLaunch(undefined)).toBeNull();
      expect(parseRecordingLaunch(null)).toBeNull();
      expect(parseRecordingLaunch("discussions")).toBeNull();
      expect(parseRecordingLaunch(42)).toBeNull();
      expect(parseRecordingLaunch([])).toBeNull();
      expect(parseRecordingLaunch({})).toBeNull();
    });

    it("degrades rather than throws on an unrecognized view", () => {
      expect(parseRecordingLaunch({ view: "walkthrough" })).toBeNull();
      expect(parseRecordingLaunch({ view: "" })).toBeNull();
      expect(parseRecordingLaunch({ view: 7 })).toBeNull();
    });

    it("drops a blank or whitespace-only knowledgeContext.text without invalidating the view", () => {
      expect(parseRecordingLaunch({ view: "discussions", knowledgeContext: { text: "" } })).toEqual({
        view: "discussions",
      });
      expect(parseRecordingLaunch({ view: "discussions", knowledgeContext: { text: "   " } })).toEqual({
        view: "discussions",
      });
    });

    it("drops a malformed knowledgeContext shape (not an object, an array, or missing text) without invalidating the view", () => {
      expect(parseRecordingLaunch({ view: "record", knowledgeContext: "not-an-object" })).toEqual({
        view: "record",
      });
      expect(parseRecordingLaunch({ view: "record", knowledgeContext: ["a", "b"] })).toEqual({
        view: "record",
      });
      expect(parseRecordingLaunch({ view: "record", knowledgeContext: { label: "no text field" } })).toEqual({
        view: "record",
      });
    });

    it("drops a non-string label but keeps the text", () => {
      expect(
        parseRecordingLaunch({ view: "record", knowledgeContext: { text: "keep me", label: 12 } })
      ).toEqual({ view: "record", knowledgeContext: { text: "keep me" } });
    });
  });

  describe("openRecordingTool / takeRecordingKnowledgeContext (write-then-consume)", () => {
    it("write-then-consume: a knowledgeContext set by openRecordingTool is returned by the next take", () => {
      openRecordingTool({ view: "discussions", knowledgeContext: { text: "policy text", label: "2 pages" } });
      expect(takeRecordingKnowledgeContext()).toEqual({ text: "policy text", label: "2 pages" });
    });

    it("consume-twice-yields-nothing: a second take in a row returns null", () => {
      openRecordingTool({ view: "discussions", knowledgeContext: { text: "policy text" } });
      expect(takeRecordingKnowledgeContext()).toEqual({ text: "policy text" });
      expect(takeRecordingKnowledgeContext()).toBeNull();
    });

    it("take returns null when nothing was ever set", () => {
      // Fresh module state assumption doesn't hold across tests in one file
      // (module singleton persists) - explicitly drain first so this
      // assertion is meaningful regardless of test order.
      takeRecordingKnowledgeContext();
      expect(takeRecordingKnowledgeContext()).toBeNull();
    });

    it("a bare-view launch (no knowledgeContext) clears any previously pending context", () => {
      openRecordingTool({ view: "discussions", knowledgeContext: { text: "stale" } });
      openRecordingTool({ view: "record" });
      expect(takeRecordingKnowledgeContext()).toBeNull();
    });

    it("a stale/malformed openRecordingTool call degrades (no-ops) rather than throwing, and does not clobber a real pending context", () => {
      openRecordingTool({ view: "discussions", knowledgeContext: { text: "real one" } });
      // @ts-expect-error deliberately malformed input, mirroring an untrusted caller
      expect(() => openRecordingTool({ view: "not-a-real-view" })).not.toThrow();
      // The malformed call above must not have cleared the real pending context.
      expect(takeRecordingKnowledgeContext()).toEqual({ text: "real one" });
    });
  });

  // These tests exercise the actual window.dispatchEvent/addEventListener
  // path, so they need a real `window` to dispatch on and listen through.
  // vitest here is node-env (see AGENTS.md / this suite's other describe
  // blocks, which deliberately do NOT get this setup because they never
  // touch window) - a minimal EventTarget stands in for `window` well
  // enough for this module's needs, since openRecordingTool/
  // navigateToRecordingTool only ever call window.dispatchEvent and callers
  // (RecordingTab, and these tests) only ever call
  // window.addEventListener/removeEventListener. No jsdom, no environment
  // change: installed fresh in beforeEach and torn down in afterEach so it
  // can never leak into a test outside this describe block, or into another
  // file sharing the same worker.
  describe("openRecordingTool / navigateToRecordingTool dispatch RECORDING_LAUNCH_EVENT", () => {
    beforeEach(() => {
      (globalThis as unknown as { window: EventTarget }).window = new EventTarget();
    });

    afterEach(() => {
      delete (globalThis as { window?: unknown }).window;
    });

    it("openRecordingTool dispatches on a valid launch", () => {
      const eventSpy = vi.spyOn(window, "dispatchEvent");
      openRecordingTool({ view: "speed" });
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: RECORDING_LAUNCH_EVENT,
          detail: { view: "speed" },
        })
      );
      eventSpy.mockRestore();
    });

    it("openRecordingTool does NOT dispatch on an invalid launch", () => {
      const eventSpy = vi.spyOn(window, "dispatchEvent");
      // @ts-expect-error deliberately malformed input
      openRecordingTool({ view: "not-a-real-view" });
      expect(eventSpy).not.toHaveBeenCalled();
      eventSpy.mockRestore();
    });

    it("a listener registered ONCE, before any launch, observes EVERY dispatch with the correct per-dispatch detail - the live-listener model this module relies on instead of a mount-only effect", () => {
      const seen: Array<{ view: string; knowledgeContext?: unknown }> = [];
      const handler = (e: Event) => {
        const detail = e instanceof CustomEvent ? parseRecordingLaunch(e.detail) : null;
        if (detail) seen.push({ view: detail.view, knowledgeContext: detail.knowledgeContext });
      };
      // Registered ONCE, before any openRecordingTool call - exactly how
      // RecordingTab's own mount-once useEffect(..., []) registers its
      // listener (see RecordingTab.tsx).
      window.addEventListener(RECORDING_LAUNCH_EVENT, handler);
      try {
        openRecordingTool({ view: "record" });
        openRecordingTool({ view: "discussions" });
        openRecordingTool({ view: "avatar" });
      } finally {
        window.removeEventListener(RECORDING_LAUNCH_EVENT, handler);
      }
      expect(seen).toEqual([
        { view: "record", knowledgeContext: undefined },
        { view: "discussions", knowledgeContext: undefined },
        { view: "avatar", knowledgeContext: undefined },
      ]);
    });

    // FIX 2: replaces a prior test of the same name that only exercised the
    // module's one-shot pendingKnowledgeContext slot via take() - a check
    // that behaves IDENTICALLY under a mount-only-effect design (take()
    // itself has no notion of "mounted"), so it never actually discriminated
    // the bug this module exists to avoid. This version proves the real
    // property instead: a listener registered ONCE, before any launch,
    // keeps receiving fresh, correct payloads for the second and third
    // launches too - the exact thing a mount-only consumer (one that reads a
    // one-shot value on its own mount instead of subscribing live) would
    // fail on every launch after the first. Assertions are on the full
    // per-dispatch `detail` (view AND knowledgeContext), not a call count -
    // a listener that fires three times with a stale payload is the same
    // bug wearing a different hat.
    it("a listener registered once, before any launch, receives the correct view and knowledgeContext for a second and third launch too (the never-unmounts defect this module exists to avoid)", () => {
      const seen: Array<{ view: string; knowledgeContext?: unknown }> = [];
      const handler = (e: Event) => {
        const detail = e instanceof CustomEvent ? parseRecordingLaunch(e.detail) : null;
        if (detail) seen.push({ view: detail.view, knowledgeContext: detail.knowledgeContext });
      };
      window.addEventListener(RECORDING_LAUNCH_EVENT, handler);
      try {
        openRecordingTool({ view: "discussions", knowledgeContext: { text: "first selection" } });
        openRecordingTool({ view: "discussions", knowledgeContext: { text: "second selection" } });
        openRecordingTool({ view: "record" });
      } finally {
        window.removeEventListener(RECORDING_LAUNCH_EVENT, handler);
      }
      expect(seen).toEqual([
        { view: "discussions", knowledgeContext: { text: "first selection" } },
        { view: "discussions", knowledgeContext: { text: "second selection" } },
        { view: "record", knowledgeContext: undefined },
      ]);
    });

    it("navigateToRecordingTool dispatches RECORDING_LAUNCH_EVENT with a bare-view detail", () => {
      const eventSpy = vi.spyOn(window, "dispatchEvent");
      navigateToRecordingTool("discussions");
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: RECORDING_LAUNCH_EVENT,
          detail: { view: "discussions" },
        })
      );
      eventSpy.mockRestore();
    });

    it("navigateToRecordingTool does NOT dispatch on an invalid view", () => {
      const eventSpy = vi.spyOn(window, "dispatchEvent");
      // @ts-expect-error deliberately malformed input
      navigateToRecordingTool("not-a-real-view");
      expect(eventSpy).not.toHaveBeenCalled();
      eventSpy.mockRestore();
    });

    // FIX 4: the whole point of navigateToRecordingTool existing at all - it
    // must NOT touch the one-shot knowledgeContext slot, unlike a bare-view
    // openRecordingTool() call (which clears it - see the write-then-consume
    // describe block above). Without this, the fab's Recording entries would
    // silently wipe out a Knowledge-tab selection the instructor made just
    // before reaching the same pane through the fab instead of the
    // Knowledge tab's own "Start recording" button.
    it("navigateToRecordingTool leaves a pending knowledgeContext completely untouched", () => {
      openRecordingTool({ view: "discussions", knowledgeContext: { text: "instructor's selection" } });
      navigateToRecordingTool("discussions");
      navigateToRecordingTool("record");
      // Still there, still one-shot: the FIRST take after the fab
      // navigations still returns exactly what was pending before them.
      expect(takeRecordingKnowledgeContext()).toEqual({ text: "instructor's selection" });
      // And still one-shot afterward - a fab navigation does not create a
      // second copy or otherwise change take()'s single-consume contract.
      expect(takeRecordingKnowledgeContext()).toBeNull();
    });

    it("navigateToRecordingTool never sets a knowledgeContext of its own when nothing was pending", () => {
      takeRecordingKnowledgeContext(); // drain any stray state from a prior test
      navigateToRecordingTool("record");
      expect(takeRecordingKnowledgeContext()).toBeNull();
    });
  });
});
