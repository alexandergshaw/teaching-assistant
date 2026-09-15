import { describe, it, expect } from "vitest";
import { nextDraftUiState } from "./classTrendsDraftState";
import type { DraftUiState } from "./classTrendsDraftState";

describe('"composed" - status "ok"', () => {
  it("transitions to ready, copy idle", () => {
    const state: DraftUiState = { status: "idle" };
    const next = nextDraftUiState(state, { type: "composed", result: { status: "ok", markdown: "hello" } });
    expect(next).toEqual({ status: "ready", markdown: "hello", copy: "idle" });
  });
});

describe('"composed" - status "empty" (Amendment 3)', () => {
  it("transitions to an explicit empty state, never a ready state with empty-string markdown", () => {
    const state: DraftUiState = { status: "idle" };
    const next = nextDraftUiState(state, { type: "composed", result: { status: "empty" } });
    expect(next).toEqual({ status: "empty" });
    expect(next.status).not.toBe("ready");
  });
});

describe('"composed" - status "below-floor"', () => {
  it("carries floor and totalResults through", () => {
    const state: DraftUiState = { status: "idle" };
    const next = nextDraftUiState(state, {
      type: "composed",
      result: { status: "below-floor", floor: 5, totalResults: 3 },
    });
    expect(next).toEqual({ status: "below-floor", floor: 5, totalResults: 3 });
  });
});

describe('"composed" - status "rejected"', () => {
  it("carries the reason through", () => {
    const state: DraftUiState = { status: "idle" };
    const next = nextDraftUiState(state, {
      type: "composed",
      result: { status: "rejected", reason: "template bug" },
    });
    expect(next).toEqual({ status: "rejected", reason: "template bug" });
  });
});

describe('"copy-settled"', () => {
  it("sets copy to copied on success when the state is ready", () => {
    const state: DraftUiState = { status: "ready", markdown: "hello", copy: "idle" };
    const next = nextDraftUiState(state, { type: "copy-settled", ok: true });
    expect(next).toEqual({ status: "ready", markdown: "hello", copy: "copied" });
  });

  it("sets copy to error on failure when the state is ready", () => {
    const state: DraftUiState = { status: "ready", markdown: "hello", copy: "idle" };
    const next = nextDraftUiState(state, { type: "copy-settled", ok: false });
    expect(next).toEqual({ status: "ready", markdown: "hello", copy: "error" });
  });

  it("is a no-op against a non-ready state (stale settle after recompose)", () => {
    const state: DraftUiState = { status: "empty" };
    const next = nextDraftUiState(state, { type: "copy-settled", ok: true });
    expect(next).toBe(state);
  });

  it("is a no-op against idle", () => {
    const state: DraftUiState = { status: "idle" };
    const next = nextDraftUiState(state, { type: "copy-settled", ok: false });
    expect(next).toBe(state);
  });
});
