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

    it("accepts the announcement view - the new dedicated front door for recording FOR an announcement", () => {
      expect(parseRecordingLaunch({ view: "announcement" })).toEqual({ view: "announcement" });
    });

    it("accepts the grading view - grading-via-recording's own dedicated view", () => {
      expect(parseRecordingLaunch({ view: "grading" })).toEqual({ view: "grading" });
    });

    it("accepts openRubric: true alongside the grading view", () => {
      expect(parseRecordingLaunch({ view: "grading", openRubric: true })).toEqual({
        view: "grading",
        openRubric: true,
      });
    });

    it("drops openRubric when it is not literally true (false, missing, or a non-boolean), without invalidating the view", () => {
      expect(parseRecordingLaunch({ view: "grading", openRubric: false })).toEqual({ view: "grading" });
      expect(parseRecordingLaunch({ view: "grading" })).toEqual({ view: "grading" });
      expect(parseRecordingLaunch({ view: "grading", openRubric: "yes" })).toEqual({ view: "grading" });
    });

    it("accepts openRubric alongside a knowledgeContext in the same launch (the Knowledge base's 'Grade via recording' button sets both)", () => {
      expect(
        parseRecordingLaunch({ view: "grading", openRubric: true, knowledgeContext: { text: "policy text" } })
      ).toEqual({ view: "grading", openRubric: true, knowledgeContext: { text: "policy text" } });
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

    // `pages` (structural-fix pass): optional, advisory, NOT populated by any
    // real launch site yet - these tests only prove the parser's own
    // contract for the field a later chunk will start sending.
    it("accepts a knowledgeContext carrying a usable pages array alongside text/label", () => {
      expect(
        parseRecordingLaunch({
          view: "discussions",
          knowledgeContext: {
            text: "hello",
            label: "2 pages",
            pages: [
              { id: "p1", title: "Grading rubric" },
              { id: "p2", title: "Late policy" },
            ],
          },
        })
      ).toEqual({
        view: "discussions",
        knowledgeContext: {
          text: "hello",
          label: "2 pages",
          pages: [
            { id: "p1", title: "Grading rubric" },
            { id: "p2", title: "Late policy" },
          ],
        },
      });
    });

    it("drops a malformed pages field (not an array) without invalidating text/label", () => {
      expect(
        parseRecordingLaunch({ view: "discussions", knowledgeContext: { text: "hello", pages: "not-an-array" } })
      ).toEqual({ view: "discussions", knowledgeContext: { text: "hello" } });
    });

    it("drops each unusable pages ENTRY individually (missing id, missing title, or a non-object entry), keeping the rest", () => {
      expect(
        parseRecordingLaunch({
          view: "discussions",
          knowledgeContext: {
            text: "hello",
            pages: [
              { id: "p1", title: "Grading rubric" },
              { id: "p2" }, // no title - dropped
              { title: "no id" }, // no id - dropped
              "not-an-object", // dropped
              { id: "p3", title: "Late policy" },
            ],
          },
        })
      ).toEqual({
        view: "discussions",
        knowledgeContext: {
          text: "hello",
          pages: [
            { id: "p1", title: "Grading rubric" },
            { id: "p3", title: "Late policy" },
          ],
        },
      });
    });

    it("drops the whole pages field (not just narrowing to an empty array) when every entry is unusable - absent, not empty, mirrors label's own contract", () => {
      const result = parseRecordingLaunch({
        view: "discussions",
        knowledgeContext: { text: "hello", pages: [{ id: "" }, { title: "   " }] },
      });
      expect(result).toEqual({ view: "discussions", knowledgeContext: { text: "hello" } });
      expect(result?.knowledgeContext).not.toHaveProperty("pages");
    });

    // AC1/AM-L: "moduledeck" is the module-walkthrough-capture panel's own
    // view, and its bulk-bar prefill rides `capturePrefill` on the SAME
    // detail as `view` (never a one-shot slot - see this module's own doc
    // comment on RecordingLaunch.capturePrefill).
    it("accepts the moduledeck view with no capturePrefill", () => {
      expect(parseRecordingLaunch({ view: "moduledeck" })).toEqual({ view: "moduledeck" });
    });

    it("accepts a moduledeck launch carrying a full capturePrefill", () => {
      expect(
        parseRecordingLaunch({
          view: "moduledeck",
          capturePrefill: {
            courseId: "course-1",
            courseUrl: "https://canvas.example.edu/courses/100",
            acronym: "MIT",
            moduleLabel: "Week 3",
          },
        })
      ).toEqual({
        view: "moduledeck",
        capturePrefill: {
          courseId: "course-1",
          courseUrl: "https://canvas.example.edu/courses/100",
          acronym: "MIT",
          moduleLabel: "Week 3",
        },
      });
    });

    it("degrades a malformed capturePrefill FIELD BY FIELD, dropping only the bad field, never the whole prefill or the whole launch", () => {
      expect(
        parseRecordingLaunch({
          view: "moduledeck",
          capturePrefill: { courseId: "course-1", moduleLabel: 42, acronym: "   " },
        })
      ).toEqual({ view: "moduledeck", capturePrefill: { courseId: "course-1" } });
    });

    it("drops a capturePrefill that is not an object (array or primitive), without invalidating the view", () => {
      expect(parseRecordingLaunch({ view: "moduledeck", capturePrefill: "not-an-object" })).toEqual({
        view: "moduledeck",
      });
      expect(parseRecordingLaunch({ view: "moduledeck", capturePrefill: ["a"] })).toEqual({
        view: "moduledeck",
      });
    });

    it("a capturePrefill with every field blank/invalid still parses as an empty object, not undefined - both leave the panel's own controls blank (AM-L, advisory only)", () => {
      expect(parseRecordingLaunch({ view: "moduledeck", capturePrefill: {} })).toEqual({
        view: "moduledeck",
        capturePrefill: {},
      });
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

    // Structural-fix pass: useDiscussionKnowledgeContext.ts (and
    // GradingRecordingPanel.tsx before it) no longer take the pending
    // context from a Start-click handler - they take it LIVE, inside a
    // window.addEventListener(RECORDING_LAUNCH_EVENT, ...) callback that
    // runs at launch arrival. This test simulates exactly that consumer
    // shape (a listener that calls takeRecordingKnowledgeContext() itself,
    // the moment its event fires) rather than only exercising the module's
    // bare slot via direct take() calls, and proves the three-step property
    // that shape depends on: a dispatch is taken by the listener; a second,
    // unrelated take right after finds nothing (the one-shot already
    // drained - this is the "someone later added a second reader and the
    // real consumer now silently gets nothing" case); and a THIRD dispatch
    // (a second real launch) still delivers a FRESH value to the SAME,
    // still-registered listener - proving the mechanism keeps working for
    // every later launch, not just the first, which is the entire reason
    // this module uses a live listener instead of a mount-only read
    // (recording-launch.ts's own header).
    //
    // Self-contained window stub (rather than relying on the shared
    // beforeEach/afterEach below, which this describe block does not use) -
    // installed and torn down entirely within this one test.
    //
    // Verified by sabotage: temporarily removed `pendingKnowledgeContext =
    // null;` from takeRecordingKnowledgeContext() in recording-launch.ts
    // (making the "one-shot" slot non-draining), ran `npx vitest run
    // recording-launch.test.ts`: this test's own "second take right after
    // finds nothing" assertion went RED, along with four pre-existing
    // one-shot tests elsewhere in this file (proving those already covered
    // the bare-slot property; this test additionally proves it holds for
    // the real listener-take SHAPE, not only a direct take() call). Reverted
    // (restored the `pendingKnowledgeContext = null;` line), re-ran green.
    it("simulated live-listener take: a dispatched launch is taken by a listener, a second take right after finds nothing, and a THIRD dispatch (a second real launch) delivers a fresh value to the same listener", () => {
      (globalThis as unknown as { window: EventTarget }).window = new EventTarget();
      try {
        const seenByListener: Array<ReturnType<typeof takeRecordingKnowledgeContext>> = [];
        const listener = (e: Event) => {
          const detail = e instanceof CustomEvent ? parseRecordingLaunch(e.detail) : null;
          if (detail?.knowledgeContext) seenByListener.push(takeRecordingKnowledgeContext());
        };
        window.addEventListener(RECORDING_LAUNCH_EVENT, listener);
        try {
          // First dispatch: the listener takes it immediately, at arrival -
          // BEFORE any Start-click equivalent would ever run.
          openRecordingTool({ view: "discussions", knowledgeContext: { text: "first selection" } });
          expect(seenByListener).toEqual([{ text: "first selection" }]);

          // A second take right after, from OUTSIDE the listener (simulating
          // a stray extra reader) - the one-shot already drained.
          expect(takeRecordingKnowledgeContext()).toBeNull();

          // A third dispatch - a second real launch - still reaches the
          // SAME, still-registered listener with a FRESH value.
          openRecordingTool({ view: "discussions", knowledgeContext: { text: "second selection" } });
          expect(seenByListener).toEqual([{ text: "first selection" }, { text: "second selection" }]);
        } finally {
          window.removeEventListener(RECORDING_LAUNCH_EVENT, listener);
        }
      } finally {
        delete (globalThis as { window?: unknown }).window;
      }
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

    // AiChatFab's "Record for Announcement" entry now navigates here instead
    // of to "record" (see that file's own comment on why: the owner asked
    // for recording FOR an announcement to be its own directly-reachable
    // feature rather than something found only via a per-take button inside
    // Record). This is the launch-seam half of that change - proving the new
    // view is a valid, dispatchable target the same way every pre-existing
    // view already was, not a guarded no-op that only compiles.
    it("navigateToRecordingTool dispatches RECORDING_LAUNCH_EVENT for the announcement view", () => {
      const eventSpy = vi.spyOn(window, "dispatchEvent");
      navigateToRecordingTool("announcement");
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: RECORDING_LAUNCH_EVENT,
          detail: { view: "announcement" },
        })
      );
      eventSpy.mockRestore();
    });

    // The fab's own "grading" entry (item 3 of this task) uses
    // navigateToRecordingTool, never openRecordingTool with openRubric - see
    // this module's own header on RecordingLaunch.openRubric for why a plain
    // fab visit must not surprise the instructor with the rubric modal.
    it("navigateToRecordingTool dispatches RECORDING_LAUNCH_EVENT for the grading view, with no openRubric", () => {
      const eventSpy = vi.spyOn(window, "dispatchEvent");
      navigateToRecordingTool("grading");
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: RECORDING_LAUNCH_EVENT,
          detail: { view: "grading" },
        })
      );
      eventSpy.mockRestore();
    });

    // The Knowledge base's "Grade via recording" button (item 2 of this
    // task) is expected to call openRecordingTool({ view: "grading",
    // openRubric: true, ... }) - this proves that exact shape is a
    // dispatchable, non-degraded launch, carrying BOTH the view switch
    // RecordingTab reacts to and the openRubric flag GradingRecordingPanel
    // reacts to, from ONE dispatch.
    it("openRecordingTool dispatches RECORDING_LAUNCH_EVENT with openRubric true for a grading launch", () => {
      const eventSpy = vi.spyOn(window, "dispatchEvent");
      openRecordingTool({ view: "grading", openRubric: true });
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: RECORDING_LAUNCH_EVENT,
          detail: { view: "grading", openRubric: true },
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

    // AC1/AM-L (Modules bulk-bar prefill): the bulk-bar action is expected to
    // call openRecordingTool({ view: "moduledeck", capturePrefill: {...} }) -
    // this proves that exact shape dispatches undegraded.
    it("openRecordingTool dispatches RECORDING_LAUNCH_EVENT with capturePrefill for a moduledeck launch", () => {
      const eventSpy = vi.spyOn(window, "dispatchEvent");
      openRecordingTool({ view: "moduledeck", capturePrefill: { moduleLabel: "Week 3" } });
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: RECORDING_LAUNCH_EVENT,
          detail: { view: "moduledeck", capturePrefill: { moduleLabel: "Week 3" } },
        })
      );
      eventSpy.mockRestore();
    });

    // THE TWO-LISTENERS PROPERTY (AC1's own reason `capturePrefill` rides the
    // event detail rather than a one-shot slot): every listener that cares
    // about this launch must see the SAME payload from the SAME dispatch -
    // there is no "handed to exactly one consumer" concern the way
    // knowledgeContext has. Proven here with TWO independent listeners
    // registered before the launch, mirroring RecordingTab's `recView` switch
    // and the module-deck-capture panel's own prefill-seeding effect both
    // reacting to one real dispatch.
    it("a single moduledeck launch with capturePrefill reaches TWO independent listeners with the identical payload", () => {
      const seenByFirst: unknown[] = [];
      const seenBySecond: unknown[] = [];
      const firstHandler = (e: Event) => {
        const detail = e instanceof CustomEvent ? parseRecordingLaunch(e.detail) : null;
        if (detail) seenByFirst.push(detail);
      };
      const secondHandler = (e: Event) => {
        const detail = e instanceof CustomEvent ? parseRecordingLaunch(e.detail) : null;
        if (detail) seenBySecond.push(detail);
      };
      window.addEventListener(RECORDING_LAUNCH_EVENT, firstHandler);
      window.addEventListener(RECORDING_LAUNCH_EVENT, secondHandler);
      try {
        openRecordingTool({
          view: "moduledeck",
          capturePrefill: { courseId: "course-1", moduleLabel: "Week 3" },
        });
      } finally {
        window.removeEventListener(RECORDING_LAUNCH_EVENT, firstHandler);
        window.removeEventListener(RECORDING_LAUNCH_EVENT, secondHandler);
      }
      const expected = { view: "moduledeck", capturePrefill: { courseId: "course-1", moduleLabel: "Week 3" } };
      expect(seenByFirst).toEqual([expected]);
      expect(seenBySecond).toEqual([expected]);
    });

    it("navigateToRecordingTool dispatches RECORDING_LAUNCH_EVENT for the moduledeck view, carrying no capturePrefill (a plain fab-style visit)", () => {
      const eventSpy = vi.spyOn(window, "dispatchEvent");
      navigateToRecordingTool("moduledeck");
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: RECORDING_LAUNCH_EVENT,
          detail: { view: "moduledeck" },
        })
      );
      eventSpy.mockRestore();
    });
  });
});
