import { beforeEach, expect, it, vi } from "vitest";

// Explicit commit dispatcher, including dependency-aware layout effects.
const h = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0, effects: [] as Array<() => void> }));
vi.mock("react", () => {
  const same = (a: unknown[] | undefined, b: unknown[] | undefined) => !!a && !!b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  return {
    useRef: (v: unknown) => { const i = h.cursor++; return h.cells[i] ?? (h.cells[i] = { current: v }); },
    useState: (v: unknown) => { const i = h.cursor++; if (!(i in h.cells)) h.cells[i] = v; return [h.cells[i], (x: unknown) => { h.cells[i] = typeof x === "function" ? (x as (old: unknown) => unknown)(h.cells[i]) : x; }]; },
    useReducer: (reducer: (s: unknown, a: unknown) => unknown, value: unknown, init: (v: unknown) => unknown) => { const i = h.cursor++; if (!(i in h.cells)) h.cells[i] = init(value); return [h.cells[i], (a: unknown) => { h.cells[i] = reducer(h.cells[i], a); }]; },
    useCallback: (fn: unknown, deps: unknown[]) => { const i = h.cursor++; const old = h.cells[i] as { deps: unknown[]; fn: unknown } | undefined; if (!old || !same(old.deps, deps)) h.cells[i] = { deps, fn }; return (h.cells[i] as { fn: unknown }).fn; },
    useLayoutEffect: (fn: () => void | (() => void), deps?: unknown[]) => { const i = h.cursor++; const old = h.cells[i] as { deps?: unknown[]; cleanup?: () => void } | undefined; if (!old || !same(old.deps, deps)) h.effects.push(() => { old?.cleanup?.(); const cleanup = fn(); h.cells[i] = { deps, cleanup }; }); },
  };
});

import { deriveAnnouncementOutline } from "@/lib/announcement-outline";
import { useAnnouncementDraftSlots } from "./useAnnouncementDraftSlots";
type Args = Parameters<typeof useAnnouncementDraftSlots>[0];
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function drain() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
beforeEach(() => { h.cells = []; h.cursor = 0; h.effects = []; });

function fixture(postDraft: Args["postDraft"]) {
  const outline = deriveAnnouncementOutline("## Weekly\nComplete the assignment.");
  const format = { id: "format", label: "Format", outline };
  const args: Args = {
    courseId: "A", scopeKey: "A", buildRequest: () => ({ courseId: "A", courseLabel: "A", moduleLabel: null, materialsText: "Captured", coverageBlock: "", notes: "", provider: "gemini", emojiOn: false, researchOn: false }),
    resolveLive: () => ({ pastedOutline: null, mostRecent: format, saved: [format], savedState: "loaded", blocked: () => false }),
    fetchResources: async () => ({ kind: "off" }), researchFingerprint: () => "same",
    draftOne: async () => ({ title: "Title", message: "Message", researchNotice: { kind: "off" } }), postDraft,
  };
  const useHarness = () => { h.cursor = 0; h.effects = []; const result = useAnnouncementDraftSlots(args); h.effects.forEach(effect => effect()); return result; };
  const render = useHarness;
  const draft = async () => {
    let current = render();
    current.chooseTemplate("wta-slot-1", { kind: "saved", exemplarId: format.id, label: format.label, outline });
    current = render();
    current.retry("wta-slot-1");
    await drain();
    current = render();
    expect(current.slots[0].draft.phase).toBe("drafted");
    return current;
  };
  return { render, draft };
}

for (const outcome of ["success", "failure"] as const) {
  it(`ignores deferred post ${outcome} after real hook reset and slot ID reuse`, async () => {
    const pending = deferred<{ course: string }>();
    const post = vi.fn(() => pending.promise);
    const f = fixture(post);
    let current = await f.draft();
    current.armPost("wta-slot-1"); current = f.render(); current.armPost("wta-slot-1");
    expect(post).toHaveBeenCalledTimes(1);
    current.reset();
    current = await f.draft();
    expect(current.slots[0].id).toBe("wta-slot-1");
    if (outcome === "success") pending.resolve({ course: "A" }); else pending.reject(new Error("transport"));
    await drain();
    current = f.render();
    expect(current.slots[0].postLocked).toBe(false);
    expect(current.slots[0].postError).toBeNull();
    expect(current.slots[0].postedTo).toBeNull();
  });
}

it("applies a successful post in the same generation", async () => {
  const pending = deferred<{ course: string }>();
  const post = vi.fn(() => pending.promise);
  const f = fixture(post);
  let current = await f.draft();
  current.armPost("wta-slot-1"); current = f.render(); current.armPost("wta-slot-1");
  expect(post).toHaveBeenCalledTimes(1);
  pending.resolve({ course: "A" });
  await drain();
  current = f.render();
  expect(current.slots[0].postLocked).toBe(true);
  expect(current.slots[0].postedTo).toBe("A");
});
