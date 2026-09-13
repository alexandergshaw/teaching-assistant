import { describe, it, expect } from "vitest";
import {
  MAX_SHOTS,
  SNAP_TARGET_WIDTH_CAP,
  SNAP_JPEG_QUALITY,
  SNAPSHOT_ROLES,
  STABLE_SNAPSHOT_ROLES,
  resolveSnapTargetWidth,
  computeSnapshotWireBytes,
  checkShotWireBudget,
  canAddShot,
  groupShotsByRole,
  shotTileLabel,
  mintShotId,
  partitionShotsForNextStudent,
  computeNextStudentCounts,
  describeNextStudentCounts,
  type SnapshotShot,
  type SnapshotRole,
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

// ---------------------------------------------------------------------------
// Oracle B: role partition. PER_STUDENT_SNAPSHOT_ROLES does not exist in src
// (confirmed: `grep -rn "PER_STUDENT_SNAPSHOT_ROLES" src/` returns nothing) -
// it is not part of this oracle. Total coverage is proven via the
// Object.keys(EXPECTED_ROLE_CLASS) vs SNAPSHOT_ROLES equality check, not a
// second role-list constant.
// ---------------------------------------------------------------------------

const EXPECTED_ROLE_CLASS: Record<SnapshotRole, "stable" | "per-student"> = {
  assignment: "stable",
  rubric: "stable",
  post: "per-student",
  replies: "per-student",
  submission: "per-student",
  other: "per-student",
};

describe("EXPECTED_ROLE_CLASS covers exactly SNAPSHOT_ROLES, and STABLE_SNAPSHOT_ROLES agrees with it role by role", () => {
  it("has total coverage and per-role agreement", () => {
    expect(Object.keys(EXPECTED_ROLE_CLASS).sort()).toEqual([...SNAPSHOT_ROLES].sort());
    const stableSet = new Set(STABLE_SNAPSHOT_ROLES);
    for (const role of SNAPSHOT_ROLES) {
      expect(stableSet.has(role)).toBe(EXPECTED_ROLE_CLASS[role] === "stable");
    }
  });
});

describe("partitionShotsForNextStudent", () => {
  it("partitions one shot per role exactly along the stable/per-student line", () => {
    const shots = SNAPSHOT_ROLES.map((role, i) => makeShot({ id: `shot-${i}`, role, capturedAt: i }));
    const { kept, cleared } = partitionShotsForNextStudent(shots);
    expect(kept.map((s) => s.role).sort()).toEqual(
      SNAPSHOT_ROLES.filter((r) => EXPECTED_ROLE_CLASS[r] === "stable").sort()
    );
    expect(cleared.map((s) => s.role).sort()).toEqual(
      SNAPSHOT_ROLES.filter((r) => EXPECTED_ROLE_CLASS[r] === "per-student").sort()
    );
    expect(kept.length + cleared.length).toBe(SNAPSHOT_ROLES.length);
  });
});

describe("computeNextStudentCounts", () => {
  it("tallies cleared/kept totals and per-role counts from a mixed tray", () => {
    const shots = [
      makeShot({ id: "a", role: "post" }),
      makeShot({ id: "b", role: "replies" }),
      makeShot({ id: "c", role: "replies" }),
      makeShot({ id: "d", role: "replies" }),
      makeShot({ id: "e", role: "assignment" }),
      makeShot({ id: "f", role: "rubric" }),
      makeShot({ id: "g", role: "rubric" }),
    ];
    expect(computeNextStudentCounts(shots)).toEqual({
      clearedTotal: 4,
      keptTotal: 3,
      clearedByRole: { post: 1, replies: 3 },
      keptByRole: { assignment: 1, rubric: 2 },
    });
  });
});

describe("describeNextStudentCounts", () => {
  it("binds each total to its own side via the pinned ' and ' separator, and pairs each role count with its own label", () => {
    const counts = {
      clearedTotal: 4,
      keptTotal: 3,
      clearedByRole: { post: 1, replies: 3 },
      keptByRole: { assignment: 1, rubric: 2 },
    };
    const description = describeNextStudentCounts(counts);
    expect(description).toContain(" and ");
    expect(description.endsWith(".")).toBe(true);
    const halves = description.split(" and ");
    // The name of this test claims the separator is a pin, so assert it: if a
    // future SNAPSHOT_ROLE_LABELS value ever contains " and ", keptHalf would
    // silently rebind to a fragment and the binding below would prove nothing.
    expect(halves).toHaveLength(2);
    const [clearedHalf, keptHalf] = halves;
    expect(clearedHalf).toContain("4");
    expect(clearedHalf).toContain("1 Post");
    expect(clearedHalf).toContain("3 Replies");
    expect(keptHalf).toContain("3");
    expect(keptHalf).toContain("1 Assignment");
    expect(keptHalf).toContain("2 Rubric");
  });

  it("ordering: roles render in first-occurrence order, which can disagree with SNAPSHOT_ROLES declaration order", () => {
    // NOT `post` then `replies` in that order - SNAPSHOT_ROLES already
    // declares post before replies, so that fixture cannot tell first-
    // occurrence order apart from declaration order. This fixture puts
    // `replies` first in the array so the two orders disagree.
    const counts = computeNextStudentCounts([
      makeShot({ id: "a", role: "replies" }),
      makeShot({ id: "b", role: "replies" }),
      makeShot({ id: "c", role: "post" }),
    ]);
    const description = describeNextStudentCounts(counts);
    expect(description.indexOf("Replies")).toBeLessThan(description.indexOf("Post"));
  });

  it("singular 'shot' when clearedTotal is exactly 1", () => {
    const description = describeNextStudentCounts({
      clearedTotal: 1,
      keptTotal: 0,
      clearedByRole: { other: 1 },
      keptByRole: {},
    });
    expect(description).toMatch(/1 shot(?!s)/);
  });

  it("plural 'shots' when clearedTotal is 0 or >= 2", () => {
    expect(
      describeNextStudentCounts({ clearedTotal: 0, keptTotal: 5, clearedByRole: {}, keptByRole: { other: 5 } })
    ).toMatch(/0 shots/);
    expect(
      describeNextStudentCounts({ clearedTotal: 2, keptTotal: 0, clearedByRole: { post: 2 }, keptByRole: {} })
    ).toMatch(/2 shots/);
  });

  it("an empty tally renders no parenthetical at all for that side", () => {
    const description = describeNextStudentCounts({
      clearedTotal: 2,
      keptTotal: 0,
      clearedByRole: { post: 2 },
      keptByRole: {},
    });
    expect(description).not.toMatch(/\(\)/);
    expect(description).not.toMatch(/keeps 0\s*\(/);
  });

  it("addendum addition 5: an empty tray (both totals zero) renders the dedicated empty-tray sentence, not two zeroes", () => {
    const description = describeNextStudentCounts({
      clearedTotal: 0,
      keptTotal: 0,
      clearedByRole: {},
      keptByRole: {},
    });
    expect(description).toBe("There are no shots to clear or keep - this starts a new student.");
  });
});
