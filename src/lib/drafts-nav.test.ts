import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MESSAGE_DRAFTS_NAV_EVENT, openMessageDrafts } from "./drafts-nav";

// docs/message-replies-acceptance-criteria.md M16: the Saved-to-drafts link
// in MessageThreadRow.tsx must dispatch MESSAGE_DRAFTS_NAV_EVENT rather than
// render a plain <a href="?tab=..."> - mirrors src/lib/knowledge-return.
// test.ts's own setup (a minimal EventTarget standing in for `window`,
// installed fresh per test) since this module carries no payload of its own
// to write-then-consume the way knowledge-return.ts's pageId slot does.

describe("drafts-nav", () => {
  describe("openMessageDrafts dispatches MESSAGE_DRAFTS_NAV_EVENT", () => {
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
      window.addEventListener(MESSAGE_DRAFTS_NAV_EVENT, handler);
      try {
        openMessageDrafts();
      } finally {
        window.removeEventListener(MESSAGE_DRAFTS_NAV_EVENT, handler);
      }
      expect(seen).toBe(1);
    });

    // THE LIVE-LISTENER REQUIREMENT: page.tsx registers its
    // MESSAGE_DRAFTS_NAV_EVENT listener once, on mount, and never unmounts
    // for the life of the session (the same "kept mounted" shape
    // KNOWLEDGE_RETURN_EVENT's own listener relies on) - so it must observe
    // every dispatch, not just the first click of the session.
    it("a listener registered ONCE, before any call, observes a SECOND dispatch too", () => {
      let count = 0;
      const handler = () => {
        count += 1;
      };
      window.addEventListener(MESSAGE_DRAFTS_NAV_EVENT, handler);
      try {
        openMessageDrafts();
        expect(count).toBe(1);
        openMessageDrafts();
        expect(count).toBe(2);
      } finally {
        window.removeEventListener(MESSAGE_DRAFTS_NAV_EVENT, handler);
      }
    });
  });

  describe("SSR guard", () => {
    it("does not throw when window is undefined", () => {
      expect(() => openMessageDrafts()).not.toThrow();
    });
  });
});
