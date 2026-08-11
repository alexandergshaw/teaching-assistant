import { describe, it, expect } from "vitest";
import {
  nextArtifactVersion,
  pickCurrentArtifactVersion,
  sortArtifactVersionsNewestFirst,
} from "./generated-artifact-version";

describe("nextArtifactVersion", () => {
  it("returns 1 when there are no existing versions", () => {
    expect(nextArtifactVersion([])).toBe(1);
  });

  it("returns one past the highest existing version", () => {
    expect(nextArtifactVersion([1])).toBe(2);
    expect(nextArtifactVersion([1, 2, 3])).toBe(4);
  });

  it("uses the highest version even when versions are supplied out of order", () => {
    expect(nextArtifactVersion([3, 1, 2])).toBe(4);
  });

  it("jumps past gaps rather than filling them - only the maximum matters", () => {
    expect(nextArtifactVersion([1, 5])).toBe(6);
  });
});

describe("pickCurrentArtifactVersion", () => {
  it("returns null for an empty set", () => {
    expect(pickCurrentArtifactVersion([])).toBeNull();
  });

  it("returns the row flagged isCurrent", () => {
    const rows = [
      { version: 1, isCurrent: false },
      { version: 2, isCurrent: true },
      { version: 3, isCurrent: false },
    ];
    expect(pickCurrentArtifactVersion(rows)).toEqual({ version: 2, isCurrent: true });
  });

  it("prefers the flagged row even when it is not the highest version - the flag is authoritative", () => {
    const rows = [
      { version: 5, isCurrent: false },
      { version: 2, isCurrent: true },
    ];
    expect(pickCurrentArtifactVersion(rows)).toEqual({ version: 2, isCurrent: true });
  });

  it("falls back to the highest version when no row is flagged current (defensive, corrupt-data path)", () => {
    const rows = [
      { version: 1, isCurrent: false },
      { version: 4, isCurrent: false },
      { version: 2, isCurrent: false },
    ];
    expect(pickCurrentArtifactVersion(rows)).toEqual({ version: 4, isCurrent: false });
  });
});

describe("sortArtifactVersionsNewestFirst", () => {
  it("orders rows by version, highest first", () => {
    const rows = [{ version: 1 }, { version: 3 }, { version: 2 }];
    expect(sortArtifactVersionsNewestFirst(rows)).toEqual([{ version: 3 }, { version: 2 }, { version: 1 }]);
  });

  it("does not mutate the input array", () => {
    const rows = [{ version: 1 }, { version: 2 }];
    const original = [...rows];
    sortArtifactVersionsNewestFirst(rows);
    expect(rows).toEqual(original);
  });

  it("returns an empty array unchanged", () => {
    expect(sortArtifactVersionsNewestFirst([])).toEqual([]);
  });
});
