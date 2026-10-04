import { describe, it, expect, vi } from "vitest";
import type { MessageDraftPayload } from "@/lib/message-drafts";
import {
  INITIAL_TAKE_DRAFT_STATE,
  planTakeDraftSave,
  applyTakeDraftSaveResult,
  planTakeDraftPostCleanup,
  applyTakeDraftPostCleanup,
  runTakeDraftSave,
  runTakeDraftPostCleanup,
  takeDraftSavedNotice,
  type TakeDraftState,
} from "./take-draft-lifecycle";

const SUMMARY = "Announcement from Take 1";
const ID1 = "draft-aaa-111";
const P1: MessageDraftPayload = {
  kind: "announcement",
  title: "Week 3 recap",
  body: "Hi all, here is the recap.",
  courseUrl: "https://canvas.example.edu/courses/5",
  hubCourseId: "c5",
  institution: "inst-a",
};
const P2: MessageDraftPayload = { ...P1, body: "Hi all, here is the recap. EDITED" };

function holder(initial: string | null): {
  get: () => string | null;
  set: (id: string | null) => void;
} {
  let value = initial;
  return { get: () => value, set: (id) => { value = id; } };
}

describe("ARC-S1 plan/apply", () => {
  it("creates first, then updates in place", () => {
    const s0 = INITIAL_TAKE_DRAFT_STATE;
    const p1 = planTakeDraftSave(s0, { summary: SUMMARY, payload: P1 });
    expect(p1).toEqual({ op: "create", summary: SUMMARY, payload: P1 });
    const s1 = applyTakeDraftSaveResult(s0, p1, { ok: true, id: ID1 });
    expect(s1).toEqual({ savedDraftId: ID1 });
    const p2 = planTakeDraftSave(s1, { summary: SUMMARY, payload: P2 });
    expect(p2).toEqual({ op: "update", id: ID1, payload: P2 });
    const s2 = applyTakeDraftSaveResult(s1, p2, { ok: true });
    expect(s2).toEqual({ savedDraftId: ID1 });
    expect([p1.op, p2.op]).toEqual(["create", "update"]);
  });

  it("a failed create or a create without an id retains nothing", () => {
    const plan = planTakeDraftSave(INITIAL_TAKE_DRAFT_STATE, { summary: SUMMARY, payload: P1 });
    expect(applyTakeDraftSaveResult(INITIAL_TAKE_DRAFT_STATE, plan, { ok: false })).toEqual({ savedDraftId: null });
    expect(applyTakeDraftSaveResult(INITIAL_TAKE_DRAFT_STATE, plan, { ok: true })).toEqual({ savedDraftId: null });
  });
});

describe("ARC-S1 runTakeDraftSave", () => {
  it("saves once, updates once, never saves twice", async () => {
    const h = holder(null);
    const save = vi.fn(async () => ({ id: ID1 }));
    const update = vi.fn(async () => ({ ok: true as const }));
    const deps = { save, update, getSavedId: h.get, setSavedId: h.set };
    await runTakeDraftSave(deps, { summary: SUMMARY, payload: P1 });
    await runTakeDraftSave(deps, { summary: SUMMARY, payload: P2 });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(SUMMARY, P1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(ID1, P2);
    expect(h.get()).toBe(ID1);
  });

  it("a save error is returned and retains nothing", async () => {
    const h = holder(null);
    const save = vi.fn(async () => ({ error: "boom" }));
    const update = vi.fn(async () => ({ ok: true as const }));
    const res = await runTakeDraftSave(
      { save, update, getSavedId: h.get, setSavedId: h.set },
      { summary: SUMMARY, payload: P1 }
    );
    expect(res).toEqual({ error: "boom" });
    expect(h.get()).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("ARC-S2 cleanup", () => {
  it("plans cleanup iff a draft was saved, and apply clears the id", () => {
    const saved: TakeDraftState = { savedDraftId: ID1 };
    expect(planTakeDraftPostCleanup(saved)).toEqual({ op: "cleanup", id: ID1 });
    expect(applyTakeDraftPostCleanup(saved)).toEqual({ savedDraftId: null });
    expect(planTakeDraftPostCleanup(INITIAL_TAKE_DRAFT_STATE)).toEqual({ op: "none" });
  });

  it("cleans up once with the saved id and clears it", async () => {
    const h = holder(ID1);
    const cleanup = vi.fn(async () => ({ ok: true as const }));
    const res = await runTakeDraftPostCleanup({ cleanup, getSavedId: h.get, setSavedId: h.set });
    expect(res).toEqual({ ok: true });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith(ID1);
    expect(h.get()).toBeNull();
  });

  it("does not call cleanup when no draft was saved", async () => {
    const h = holder(null);
    const cleanup = vi.fn(async () => ({ ok: true as const }));
    await runTakeDraftPostCleanup({ cleanup, getSavedId: h.get, setSavedId: h.set });
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("a cleanup failure returns the error and keeps the id so a later save updates", async () => {
    const h = holder(ID1);
    const cleanup = vi.fn(async () => ({ error: "nope" }));
    const res = await runTakeDraftPostCleanup({ cleanup, getSavedId: h.get, setSavedId: h.set });
    expect(res).toEqual({ error: "nope" });
    expect(h.get()).toBe(ID1);
    const save = vi.fn(async () => ({ id: "other" }));
    const update = vi.fn(async () => ({ ok: true as const }));
    await runTakeDraftSave({ save, update, getSavedId: h.get, setSavedId: h.set }, { summary: SUMMARY, payload: P2 });
    expect(save).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(ID1, P2);
  });
});

describe("ARC-S4 notice copy", () => {
  it("with-course copy is frozen and the no-course copy differs and names the limitation", () => {
    expect(takeDraftSavedNotice(true)).toBe("Saved to drafts.");
    expect(takeDraftSavedNotice(false)).not.toBe(takeDraftSavedNotice(true));
    expect(takeDraftSavedNotice(false)).toContain("no course");
  });
});
