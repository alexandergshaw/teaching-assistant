import { describe, expect, it, vi } from "vitest";
import { settlePostIfCurrent } from "./useAnnouncementDraftSlots";
import { makeSlot, slotsReducer, type DraftSlot } from "./announcement-draft-slots";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("post result after a reset", () => {
  for (const outcome of ["success", "failure"] as const) {
    it(`ignores old ${outcome} after a slot ID is reused`, async () => {
      const pending = deferred<{ course: string }>();
      let generation = 1;
      let slots: readonly DraftSlot[] = [makeSlot("wta-slot-1", { kind: "none" }, "beginning-of-week")];
      const applied = vi.fn((result: { course: string; scheduledLabel: string | null } | { error: string }) => {
        slots = slotsReducer(slots, { type: "post-result", id: "wta-slot-1", result });
      });
      settlePostIfCurrent(pending.promise, generation, () => generation,
        value => applied({ course: value.course, scheduledLabel: null }),
        () => applied({ error: "failed" }));
      generation += 1;
      slots = [makeSlot("wta-slot-1", { kind: "none" }, "beginning-of-week")];
      if (outcome === "success") pending.resolve({ course: "A" });
      else pending.reject(new Error("failed"));
      await pending.promise.catch(() => undefined);
      await Promise.resolve();
      expect(applied).not.toHaveBeenCalled();
      expect(slots[0].postLocked).toBe(false);
      expect(slots[0].postError).toBeNull();
    });
  }
});
