import { describe, it, expect } from "vitest";
import {
  filterRosterProvisionRows,
  sortRosterProvisionRows,
  matchesRosterProvisionFilter,
  rosterProvisionFilterIsActive,
  ariaSortForField,
  toggleRosterProvisionSort,
  type RosterProvisionRow,
} from "./roster-provision-table";

const rows: RosterProvisionRow[] = [
  { i: 0, student: "Zed Alpha", username: "zalpha", state: "accepted" },
  { i: 1, student: "Ana Ruiz", username: "", state: "no-username" },
  { i: 2, student: "Mo Kim", username: "mkim", state: "missing" },
  { i: 3, student: "Bo Diaz", username: "bdiaz", state: "pending" },
];

describe("matchesRosterProvisionFilter / rosterProvisionFilterIsActive", () => {
  it("is inactive when nothing is set", () => {
    expect(rosterProvisionFilterIsActive({ search: "", needsUsername: false, needsRepo: false })).toBe(false);
  });

  it("is active when search, needsUsername, or needsRepo is set", () => {
    expect(rosterProvisionFilterIsActive({ search: "a", needsUsername: false, needsRepo: false })).toBe(true);
    expect(rosterProvisionFilterIsActive({ search: "", needsUsername: true, needsRepo: false })).toBe(true);
    expect(rosterProvisionFilterIsActive({ search: "", needsUsername: false, needsRepo: true })).toBe(true);
  });

  it("search matches student OR username, case-insensitively", () => {
    expect(matchesRosterProvisionFilter(rows[3], { search: "bo", needsUsername: false, needsRepo: false })).toBe(true);
    expect(matchesRosterProvisionFilter(rows[3], { search: "BDIAZ", needsUsername: false, needsRepo: false })).toBe(true);
    expect(matchesRosterProvisionFilter(rows[3], { search: "zzz", needsUsername: false, needsRepo: false })).toBe(false);
  });

  it("needsUsername matches only the no-username state", () => {
    expect(matchesRosterProvisionFilter(rows[1], { search: "", needsUsername: true, needsRepo: false })).toBe(true);
    expect(matchesRosterProvisionFilter(rows[0], { search: "", needsUsername: true, needsRepo: false })).toBe(false);
  });

  it("needsRepo matches only the missing state", () => {
    expect(matchesRosterProvisionFilter(rows[2], { search: "", needsUsername: false, needsRepo: true })).toBe(true);
    expect(matchesRosterProvisionFilter(rows[0], { search: "", needsUsername: false, needsRepo: true })).toBe(false);
  });
});

describe("filterRosterProvisionRows", () => {
  it("preserves each surviving row's original `i` untouched", () => {
    const filtered = filterRosterProvisionRows(rows, { search: "", needsUsername: true, needsRepo: false });
    expect(filtered).toEqual([{ i: 1, student: "Ana Ruiz", username: "", state: "no-username" }]);
  });
});

describe("sortRosterProvisionRows", () => {
  it("sorts by student ascending/descending without mutating `i`", () => {
    const asc = sortRosterProvisionRows(rows, { field: "student", direction: "asc" });
    expect(asc.map((r) => r.student)).toEqual(["Ana Ruiz", "Bo Diaz", "Mo Kim", "Zed Alpha"]);
    expect(asc.map((r) => r.i)).toEqual([1, 3, 2, 0]);

    const desc = sortRosterProvisionRows(rows, { field: "student", direction: "desc" });
    expect(desc.map((r) => r.student)).toEqual(["Zed Alpha", "Mo Kim", "Bo Diaz", "Ana Ruiz"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...rows];
    sortRosterProvisionRows(rows, { field: "username", direction: "asc" });
    expect(rows).toEqual(copy);
  });

  it("breaks ties by original roster index, ascending, regardless of direction", () => {
    const tied: RosterProvisionRow[] = [
      { i: 5, student: "Same", username: "", state: "unresolved" },
      { i: 2, student: "Same", username: "", state: "unresolved" },
    ];
    const asc = sortRosterProvisionRows(tied, { field: "student", direction: "asc" });
    expect(asc.map((r) => r.i)).toEqual([2, 5]);
    const desc = sortRosterProvisionRows(tied, { field: "student", direction: "desc" });
    expect(desc.map((r) => r.i)).toEqual([2, 5]);
  });
});

describe("ariaSortForField / toggleRosterProvisionSort", () => {
  it("reports none for a field that isn't the active sort", () => {
    expect(ariaSortForField({ field: "student", direction: "asc" }, "username")).toBe("none");
  });

  it("reports ascending/descending for the active field", () => {
    expect(ariaSortForField({ field: "username", direction: "asc" }, "username")).toBe("ascending");
    expect(ariaSortForField({ field: "username", direction: "desc" }, "username")).toBe("descending");
  });

  it("toggling the same field flips direction; a new field resets to asc", () => {
    const first = toggleRosterProvisionSort({ field: "student", direction: "asc" }, "student");
    expect(first).toEqual({ field: "student", direction: "desc" });
    const second = toggleRosterProvisionSort({ field: "student", direction: "desc" }, "status");
    expect(second).toEqual({ field: "status", direction: "asc" });
  });
});
