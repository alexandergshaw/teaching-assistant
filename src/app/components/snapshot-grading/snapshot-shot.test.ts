import { describe, it, expect } from "vitest";
import {
  MAX_SHOTS,
  SNAP_TARGET_WIDTH_CAP,
  SNAP_JPEG_QUALITY,
  SNAPSHOT_ROLES,
  resolveSnapTargetWidth,
  computeSnapshotWireBytes,
  checkShotWireBudget,
  canAddShot,
  groupShotsByRole,
  shotTileLabel,
  mintShotId,
  type SnapshotShot,
} from "./snapshot-shot";

function makeShot(overrides: Partial<SnapshotShot> = {}): SnapshotShot {
  return {
    id: "snap-1",
    role: "assignment",
    base64: "AAAA",
    previewUrl: "blob:test",
    source: "capture",
    capturedAt: 0,
    ...overrides,
  };
}

describe("resolveSnapTargetWidth (the encoding decision - a hard cap, never a floor)", () => {
  it("passes a track narrower than the cap through unchanged", () => {
    expect(resolveSnapTargetWidth(1280)).toBe(1280);
  });

  it("caps a 1080p track at its own width (already under the cap)", () => {
    expect(resolveSnapTargetWidth(1920)).toBe(1920);
  });

  it("caps a 4K track down to 1920, never up toward the source width", () => {
    expect(resolveSnapTargetWidth(3840)).toBe(SNAP_TARGET_WIDTH_CAP);
  });

  it("never exceeds SNAP_TARGET_WIDTH_CAP for any input", () => {
    expect(resolveSnapTargetWidth(10000)).toBe(1920);
  });
});

describe("the encoding constants match the measured decision", () => {
  it("SNAP_JPEG_QUALITY is full-fidelity 0.92, not the stream's 0.55", () => {
    expect(SNAP_JPEG_QUALITY).toBe(0.92);
  });

  it("SNAP_TARGET_WIDTH_CAP is 1920", () => {
    expect(SNAP_TARGET_WIDTH_CAP).toBe(1920);
  });

  it("MAX_SHOTS is this feature's own constant, not borrowed from another feature", () => {
    expect(MAX_SHOTS).toBe(12);
  });
});

describe("computeSnapshotWireBytes / checkShotWireBudget (A7f)", () => {
  it("sums base64 lengths across every shot - the same unit the server enforces", () => {
    const shots = [makeShot({ base64: "AAAA" }), makeShot({ id: "snap-2", base64: "BBBBBB" })];
    expect(computeSnapshotWireBytes(shots)).toBe(4 + 6);
  });

  it("returns 0 for an empty tray", () => {
    expect(computeSnapshotWireBytes([])).toBe(0);
  });

  it("accepts a shot within the wire budget", () => {
    const check = checkShotWireBudget("A".repeat(1000));
    expect(check.ok).toBe(true);
  });

  it("refuses a single shot whose base64 alone exceeds the wire budget", () => {
    const check = checkShotWireBudget("A".repeat(4_000_000));
    expect(check.ok).toBe(false);
    expect(check.error).toBeTruthy();
  });
});

describe("canAddShot (MAX_SHOTS as a UI sanity cap)", () => {
  it("allows adding below the cap", () => {
    expect(canAddShot(0)).toBe(true);
    expect(canAddShot(MAX_SHOTS - 1)).toBe(true);
  });

  it("refuses adding at or above the cap", () => {
    expect(canAddShot(MAX_SHOTS)).toBe(false);
    expect(canAddShot(MAX_SHOTS + 1)).toBe(false);
  });
});

describe("groupShotsByRole (U7's tray grouping)", () => {
  it("returns every role's own bucket, even when empty", () => {
    const grouped = groupShotsByRole([]);
    for (const role of SNAPSHOT_ROLES) {
      expect(grouped[role]).toEqual([]);
    }
  });

  it("groups shots by role, preserving each role's own insertion order", () => {
    const a = makeShot({ id: "a", role: "replies", capturedAt: 1 });
    const b = makeShot({ id: "b", role: "rubric", capturedAt: 2 });
    const c = makeShot({ id: "c", role: "replies", capturedAt: 3 });
    const grouped = groupShotsByRole([a, b, c]);
    expect(grouped.replies.map((s) => s.id)).toEqual(["a", "c"]);
    expect(grouped.rubric.map((s) => s.id)).toEqual(["b"]);
    expect(grouped.assignment).toEqual([]);
  });
});

describe("shotTileLabel (U7's exact accessible name shape)", () => {
  it("names a captured shot", () => {
    const shot = makeShot({ role: "replies", source: "capture" });
    expect(shotTileLabel(shot, 3, 7)).toBe("Shot 3 of 7, Replies, captured from the shared screen");
  });

  it("names a pasted shot distinctly from a captured one", () => {
    const shot = makeShot({ role: "rubric", source: "paste" });
    expect(shotTileLabel(shot, 1, 1)).toBe("Shot 1 of 1, Rubric, pasted from the clipboard");
  });

  it("names a dropped shot distinctly from both", () => {
    const shot = makeShot({ role: "submission", source: "drop" });
    expect(shotTileLabel(shot, 2, 4)).toBe("Shot 2 of 4, Submission, dropped from a file");
  });
});

describe("mintShotId", () => {
  it("never mints the same id twice, even for the same timestamp", () => {
    const a = mintShotId(1000);
    const b = mintShotId(1000);
    expect(a).not.toBe(b);
  });
});
