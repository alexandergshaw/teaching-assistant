// useCartridgeToCanvas.ts owns the "Upload to Canvas" phase machine
// (docs/modules-cartridge-import-upload-acceptance-criteria.md, section C).
// vitest here is node-env and renders no component (see
// contentSourceGating.test.ts's own header) - `useCartridgeToCanvas` itself
// is a React hook and is therefore untestable directly in this suite. Every
// DECISION the hook makes lives in a pure, exported function instead
// (`validateCartridgeFile`, `interpretMigrationState`,
// `pollMigrationUntilTerminal`), and this file pins those exhaustively - the
// hook's own body is then just wiring `useState` around calls this file
// already proves correct.
import { describe, expect, it, vi } from "vitest";
import {
  CARTRIDGE_POLL_MAX_ATTEMPTS,
  MAX_CARTRIDGE_BYTES,
  interpretMigrationState,
  pollMigrationUntilTerminal,
  validateCartridgeFile,
} from "./useCartridgeToCanvas";

// ── AC17 - pre-flight rejections ────────────────────────────────────────────

describe("validateCartridgeFile - AC17 pre-flight, before any Canvas call", () => {
  it("accepts a normal-sized .imscc file", () => {
    expect(validateCartridgeFile({ name: "course-export.imscc", size: 1024 })).toBeNull();
  });

  it("accepts a normal-sized .zip file", () => {
    expect(validateCartridgeFile({ name: "course-export.zip", size: 1024 })).toBeNull();
  });

  it("is case-insensitive about the extension", () => {
    expect(validateCartridgeFile({ name: "COURSE.IMSCC", size: 1024 })).toBeNull();
    expect(validateCartridgeFile({ name: "course.ZIP", size: 1024 })).toBeNull();
  });

  it("rejects a file over the 100 MB ceiling, naming the size", () => {
    const oversized = MAX_CARTRIDGE_BYTES + 1024 * 1024;
    const reason = validateCartridgeFile({ name: "big.imscc", size: oversized });
    expect(reason).toBeTruthy();
    expect(reason).toContain("too large");
    // The size named must actually reflect the oversized file, not a
    // hardcoded placeholder - proves the message is computed, not canned.
    expect(reason).toContain((oversized / (1024 * 1024)).toFixed(1));
  });

  it("accepts a file exactly at the 100 MB ceiling", () => {
    expect(validateCartridgeFile({ name: "exact.imscc", size: MAX_CARTRIDGE_BYTES })).toBeNull();
  });

  it("rejects a file whose name ends in neither .imscc nor .zip", () => {
    const reason = validateCartridgeFile({ name: "course-export.pdf", size: 1024 });
    expect(reason).toBeTruthy();
    expect(reason?.toLowerCase()).toContain("imscc");
  });

  it("rejects a file with no extension at all", () => {
    expect(validateCartridgeFile({ name: "course-export", size: 1024 })).toBeTruthy();
  });

  it("the two rejections are worded differently - size vs. extension are distinct problems", () => {
    const sizeReason = validateCartridgeFile({ name: "big.imscc", size: MAX_CARTRIDGE_BYTES + 1 });
    const extReason = validateCartridgeFile({ name: "small.pdf", size: 1024 });
    expect(sizeReason).not.toBe(extReason);
  });
});

// ── AC14 - Canvas workflow_state -> phase mapping ───────────────────────────

describe("interpretMigrationState - AC14's state-to-phase mapping", () => {
  it("maps completed to done", () => {
    expect(interpretMigrationState("completed")).toEqual({ kind: "done" });
  });

  it("maps failed to failed, carrying the raw state so it can be named", () => {
    expect(interpretMigrationState("failed")).toEqual({ kind: "failed", canvasState: "failed" });
  });

  it("maps waiting_for_select to selecting", () => {
    expect(interpretMigrationState("waiting_for_select")).toEqual({ kind: "selecting" });
  });

  it("maps every other known in-progress state to continue - never a false failure", () => {
    for (const state of ["queued", "pre_processing", "exporting", "importing", "running", ""]) {
      expect(interpretMigrationState(state)).toEqual({ kind: "continue" });
    }
  });

  it("maps an UNRECOGNISED state to continue too - an unknown string is not proof of failure", () => {
    expect(interpretMigrationState("some_future_canvas_state")).toEqual({ kind: "continue" });
  });
});

// ── AC14 - the bounded poll loop, including the timeout branch ─────────────

describe("pollMigrationUntilTerminal - AC14's bounded poll loop", () => {
  const neverCancelled = () => false;
  const noSleep = () => Promise.resolve();

  it("returns done as soon as the state reports completed", async () => {
    const checkState = vi.fn().mockResolvedValue({ state: "completed" });
    const outcome = await pollMigrationUntilTerminal(checkState, neverCancelled, { sleep: noSleep });
    expect(outcome).toEqual({ kind: "done" });
    expect(checkState).toHaveBeenCalledTimes(1);
  });

  it("returns failed with the Canvas state named", async () => {
    const checkState = vi.fn().mockResolvedValue({ state: "failed" });
    const outcome = await pollMigrationUntilTerminal(checkState, neverCancelled, { sleep: noSleep });
    expect(outcome).toEqual({ kind: "failed", canvasState: "failed" });
  });

  it("returns selecting on waiting_for_select, stopping the loop rather than continuing to poll", async () => {
    const checkState = vi.fn().mockResolvedValue({ state: "waiting_for_select" });
    const outcome = await pollMigrationUntilTerminal(checkState, neverCancelled, { sleep: noSleep });
    expect(outcome).toEqual({ kind: "selecting" });
    expect(checkState).toHaveBeenCalledTimes(1);
  });

  it("keeps polling through in-progress states until a terminal one arrives", async () => {
    const checkState = vi
      .fn()
      .mockResolvedValueOnce({ state: "queued" })
      .mockResolvedValueOnce({ state: "pre_processing" })
      .mockResolvedValueOnce({ state: "completed" });
    const outcome = await pollMigrationUntilTerminal(checkState, neverCancelled, { sleep: noSleep });
    expect(outcome).toEqual({ kind: "done" });
    expect(checkState).toHaveBeenCalledTimes(3);
  });

  it("THE BOUNDED-TIMEOUT BRANCH: gives up after maxAttempts and reports timeout - NEVER failed", async () => {
    const checkState = vi.fn().mockResolvedValue({ state: "pre_processing" });
    const outcome = await pollMigrationUntilTerminal(checkState, neverCancelled, {
      sleep: noSleep,
      maxAttempts: 5,
    });
    expect(outcome).toEqual({ kind: "timeout" });
    expect(checkState).toHaveBeenCalledTimes(5);
  });

  it("never spins past maxAttempts even when the state never changes", async () => {
    const checkState = vi.fn().mockResolvedValue({ state: "importing" });
    await pollMigrationUntilTerminal(checkState, neverCancelled, { sleep: noSleep, maxAttempts: 3 });
    expect(checkState.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("stops immediately when already cancelled, before even one check", async () => {
    const checkState = vi.fn().mockResolvedValue({ state: "completed" });
    const outcome = await pollMigrationUntilTerminal(checkState, () => true, { sleep: noSleep });
    expect(outcome).toEqual({ kind: "cancelled" });
    expect(checkState).not.toHaveBeenCalled();
  });

  it("stops mid-loop once cancellation flips true between attempts", async () => {
    let cancelled = false;
    const checkState = vi.fn().mockImplementation(async () => {
      // Cancel right after the first check - the loop should not perform a
      // second one.
      cancelled = true;
      return { state: "pre_processing" };
    });
    const outcome = await pollMigrationUntilTerminal(checkState, () => cancelled, { sleep: noSleep });
    expect(outcome).toEqual({ kind: "cancelled" });
    expect(checkState).toHaveBeenCalledTimes(1);
  });

  it("surfaces a status-check error distinctly from a Canvas-reported failure", async () => {
    const checkState = vi.fn().mockResolvedValue({ error: "network blip" });
    const outcome = await pollMigrationUntilTerminal(checkState, neverCancelled, { sleep: noSleep });
    expect(outcome).toEqual({ kind: "error", message: "network blip" });
  });

  it("the default maxAttempts constant is what the loop actually uses when none is passed", async () => {
    const checkState = vi.fn().mockResolvedValue({ state: "pre_processing" });
    await pollMigrationUntilTerminal(checkState, neverCancelled, { sleep: noSleep });
    expect(checkState).toHaveBeenCalledTimes(CARTRIDGE_POLL_MAX_ATTEMPTS);
  });

  it("sleeps between attempts using the caller-supplied interval, not a hardcoded one", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const checkState = vi
      .fn()
      .mockResolvedValueOnce({ state: "pre_processing" })
      .mockResolvedValueOnce({ state: "completed" });
    await pollMigrationUntilTerminal(checkState, neverCancelled, { sleep, intervalMs: 4242 });
    expect(sleep).toHaveBeenCalledWith(4242);
  });
});
