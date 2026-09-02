import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KNOWLEDGE_RETURN_EVENT, returnToKnowledge, takeKnowledgeReturnPageId } from "./knowledge-return";

describe("knowledge-return", () => {
  describe("returnToKnowledge / takeKnowledgeReturnPageId (write-then-consume)", () => {
    it("write-then-consume: a pageId set by returnToKnowledge is returned by the next take", () => {
      returnToKnowledge("page-1");
      expect(takeKnowledgeReturnPageId()).toBe("page-1");
    });

    it("consume-twice-yields-nothing: a second take in a row returns null", () => {
      returnToKnowledge("page-2");
      expect(takeKnowledgeReturnPageId()).toBe("page-2");
      expect(takeKnowledgeReturnPageId()).toBeNull();
    });

    it("take returns null when nothing was ever set", () => {
      // Module-singleton state persists across tests in one file (same as
      // recording-launch.test.ts's own precedent) - drain first so this
      // assertion is meaningful regardless of test order.
      takeKnowledgeReturnPageId();
      expect(takeKnowledgeReturnPageId()).toBeNull();
    });

    it("a call with no pageId requests a bare tab switch - nothing pending afterward", () => {
      returnToKnowledge();
      expect(takeKnowledgeReturnPageId()).toBeNull();
    });

    it("a call with a blank/whitespace-only pageId is treated the same as no pageId", () => {
      returnToKnowledge("   ");
      expect(takeKnowledgeReturnPageId()).toBeNull();
    });

    it("a bare call OVERWRITES a previously-pending id, never merges with it", () => {
      returnToKnowledge("stale");
      returnToKnowledge();
      expect(takeKnowledgeReturnPageId()).toBeNull();
    });

    it("a second real call's pageId replaces the first's, rather than the first winning", () => {
      returnToKnowledge("first");
      returnToKnowledge("second");
      expect(takeKnowledgeReturnPageId()).toBe("second");
    });
  });

  // These tests exercise the actual window.dispatchEvent/addEventListener
  // path (mirroring recording-launch.test.ts's own identical setup) - a
  // minimal EventTarget stands in for `window`, installed fresh per test so
  // it can never leak into a test outside this describe block.
  describe("returnToKnowledge dispatches KNOWLEDGE_RETURN_EVENT", () => {
    beforeEach(() => {
      (globalThis as unknown as { window: EventTarget }).window = new EventTarget();
    });

    afterEach(() => {
      delete (globalThis as { window?: unknown }).window;
    });

    it("dispatches the event with the right type", () => {
      let seen = 0;
      const handler = () => {
        seen += 1;
      };
      window.addEventListener(KNOWLEDGE_RETURN_EVENT, handler);
      try {
        returnToKnowledge();
      } finally {
        window.removeEventListener(KNOWLEDGE_RETURN_EVENT, handler);
      }
      expect(seen).toBe(1);
    });

    // THE LIVE-LISTENER REQUIREMENT: page.tsx registers its
    // KNOWLEDGE_RETURN_EVENT listener once, on mount, and never unmounts for
    // the life of the session (the same "kept mounted" shape
    // RECORDING_LAUNCH_EVENT's own listener relies on) - so it must observe
    // EVERY dispatch, not just the first. A listener that silently stopped
    // firing after one call would strand the instructor on the Recording
    // tab after their second "Back to Knowledge" click of the session.
    it("a listener registered ONCE, before any call, observes a SECOND dispatch too", () => {
      let count = 0;
      const handler = () => {
        count += 1;
      };
      window.addEventListener(KNOWLEDGE_RETURN_EVENT, handler);
      try {
        returnToKnowledge("a");
        expect(count).toBe(1);
        returnToKnowledge("b");
        expect(count).toBe(2);
      } finally {
        window.removeEventListener(KNOWLEDGE_RETURN_EVENT, handler);
      }
    });

    it("a listener simulating KnowledgeTab's mount-effect drain sees the fresh pageId on each of two dispatches", () => {
      const seenByListener: Array<string | null> = [];
      const handler = () => {
        seenByListener.push(takeKnowledgeReturnPageId());
      };
      window.addEventListener(KNOWLEDGE_RETURN_EVENT, handler);
      try {
        returnToKnowledge("first-page");
        returnToKnowledge("second-page");
      } finally {
        window.removeEventListener(KNOWLEDGE_RETURN_EVENT, handler);
      }
      expect(seenByListener).toEqual(["first-page", "second-page"]);
    });
  });

  describe("SSR guard", () => {
    it("does not throw when window is undefined, and still stashes the pageId for a later take", () => {
      expect(() => returnToKnowledge("ssr-page")).not.toThrow();
      expect(takeKnowledgeReturnPageId()).toBe("ssr-page");
    });
  });
});
