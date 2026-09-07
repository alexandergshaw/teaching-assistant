import { describe, it, expect } from "vitest";
import {
  buildOfflineIdentityIndex,
  offlineStudentKey,
  parseCachedCanvasUserId,
  resolveOfflineIdentity,
} from "./offline-identity";
import type { OfflineStudentRepoRef } from "./offline-identity";

const COURSE = "course-hub-1";

function index(rosterNames: readonly string[], studentRepos: readonly OfflineStudentRepoRef[] = []) {
  return buildOfflineIdentityIndex({ courseHubId: COURSE, rosterNames, studentRepos });
}

describe("parseCachedCanvasUserId", () => {
  it("reads a plain numeric id", () => {
    expect(parseCachedCanvasUserId("4242")).toBe(4242);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseCachedCanvasUserId("  4242  ")).toBe(4242);
  });

  // RosterCell.tsx seeds the editor column as `r.canvasUserId ?? ""`, so a
  // blank is the common case, not a defensive one. Number("") is 0.
  it.each([null, undefined, "", "   ", "abc", "-1", "0", "12.5", "1e3", "+42", "42a"])(
    "returns null rather than coercing %p",
    (raw) => {
      expect(parseCachedCanvasUserId(raw as string | null | undefined)).toBeNull();
    }
  );

  it("rejects an id beyond the safe integer range", () => {
    expect(parseCachedCanvasUserId("9007199254740993")).toBeNull();
  });
});

describe("offlineStudentKey", () => {
  it("is scoped to the course, so the same name in two courses is two keys", () => {
    const a = offlineStudentKey("course-a", "Ada Lovelace");
    const b = offlineStudentKey("course-b", "Ada Lovelace");
    expect(a).not.toBeNull();
    expect(a).not.toEqual(b);
  });

  it("canonicalises case, whitespace and Last-First order into one key", () => {
    const plain = offlineStudentKey(COURSE, "Ada Lovelace");
    expect(offlineStudentKey(COURSE, "  ada   LOVELACE ")).toEqual(plain);
    expect(offlineStudentKey(COURSE, "Lovelace, Ada")).toEqual(plain);
  });

  it("refuses to mint a key with no name or no course", () => {
    expect(offlineStudentKey(COURSE, "   ")).toBeNull();
    expect(offlineStudentKey("  ", "Ada Lovelace")).toBeNull();
  });
});

describe("buildOfflineIdentityIndex", () => {
  it("numbers students 1-based in roster order", () => {
    const built = index(["Ada Lovelace", "Grace Hopper", "Alan Turing"]);
    expect(built.students.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(built.students.map((s) => s.name)).toEqual(["Ada Lovelace", "Grace Hopper", "Alan Turing"]);
    expect(built.hasRoster).toBe(true);
  });

  it("has no roster when there is neither roster text nor a repo binding", () => {
    const built = index([], []);
    expect(built.hasRoster).toBe(false);
    expect(built.students).toEqual([]);
  });

  it("attaches a cached Canvas id to the roster entry rather than adding a second entry", () => {
    // The merge trap: concatenating both sources would give Ada two entries,
    // and every lookup for her would report ambiguous.
    const built = index(["Ada Lovelace", "Grace Hopper"], [{ student: "Lovelace, Ada", canvasUserId: "77" }]);
    expect(built.students).toHaveLength(2);
    const ada = built.students[0];
    expect(ada.userId).toBe(77);
    expect(ada.identitySource).toBe("cached-canvas-id");
    expect(built.students[1].identitySource).toBe("course-roster-name");
    expect(built.cachedIdCount).toBe(1);
  });

  it("adds a student known only from a repo binding", () => {
    const built = index(["Ada Lovelace"], [{ student: "Grace Hopper", canvasUserId: "9" }]);
    expect(built.students.map((s) => s.name)).toEqual(["Ada Lovelace", "Grace Hopper"]);
    expect(built.students[1].userId).toBe(9);
  });

  it("gives an ambiguous roster name a null key so nothing can join to it", () => {
    const built = index(["Alex Chen", "Alex Chen"]);
    expect(built.students.every((s) => s.key === null)).toBe(true);
    expect(built.students.every((s) => s.identitySource === "ambiguous-name")).toBe(true);
    expect(built.students.every((s) => s.userId === null)).toBe(true);
  });

  it("does not let a cached id break a roster-name tie", () => {
    // The id identifies one Canvas user; it says nothing about WHICH of the
    // two roster lines that user is.
    const built = index(["Alex Chen", "Alex Chen"], [{ student: "Alex Chen", canvasUserId: "5" }]);
    expect(built.students.every((s) => s.userId === null)).toBe(true);
    expect(built.students.every((s) => s.identitySource === "ambiguous-name")).toBe(true);
    expect(built.cachedIdCount).toBe(0);
  });

  it("treats two repo rows sharing a name with different ids as two people", () => {
    const built = index([], [
      { student: "Alex Chen", canvasUserId: "5" },
      { student: "Alex Chen", canvasUserId: "6" },
    ]);
    expect(built.students).toHaveLength(1);
    expect(built.students[0].identitySource).toBe("ambiguous-name");
    expect(built.students[0].userId).toBeNull();
  });

  it("collapses two repo rows that agree on the id", () => {
    const built = index([], [
      { student: "Alex Chen", canvasUserId: "5" },
      { student: "Chen, Alex", canvasUserId: "5" },
    ]);
    expect(built.students).toHaveLength(1);
    expect(built.students[0].userId).toBe(5);
  });

  it("ignores blank roster lines and blank repo names", () => {
    const built = index(["   ", "Ada Lovelace"], [{ student: "  ", canvasUserId: "3" }]);
    expect(built.students.map((s) => s.name)).toEqual(["Ada Lovelace"]);
  });
});

describe("resolveOfflineIdentity", () => {
  it("resolves an exact roster match by name, with no invented id", () => {
    const built = index(["Ada Lovelace", "Grace Hopper"]);
    const result = resolveOfflineIdentity(built, "Ada Lovelace");
    expect(result.outcome).toBe("matched");
    expect(result.identitySource).toBe("course-roster-name");
    expect(result.studentIndex).toBe(1);
    expect(result.userId).toBeNull();
    expect(result.key).toBe(offlineStudentKey(COURSE, "Ada Lovelace"));
  });

  it("matches a 'Last, First' roster line against a screen-read 'First Last'", () => {
    const built = index(["Lovelace, Ada", "Hopper, Grace"]);
    const result = resolveOfflineIdentity(built, "Ada Lovelace");
    expect(result.outcome).toBe("matched");
    expect(result.studentIndex).toBe(1);
    // The roster's own spelling is what comes back - the read name is never
    // overwritten and the roster name is never rewritten.
    expect(result.candidates).toEqual(["Lovelace, Ada"]);
  });

  it("folds case and extra whitespace", () => {
    const built = index(["Ada Lovelace"]);
    expect(resolveOfflineIdentity(built, "  ada    LOVELACE ").outcome).toBe("matched");
  });

  it("prefers a cached Canvas id over the name match and marks it differently", () => {
    const withCache = index(["Ada Lovelace"], [{ student: "Ada Lovelace", canvasUserId: "4242" }]);
    const withoutCache = index(["Ada Lovelace"]);

    const cached = resolveOfflineIdentity(withCache, "Ada Lovelace");
    const named = resolveOfflineIdentity(withoutCache, "Ada Lovelace");

    expect(cached.outcome).toBe("matched");
    expect(cached.userId).toBe(4242);
    expect(cached.identitySource).toBe("cached-canvas-id");

    expect(named.outcome).toBe("matched");
    expect(named.userId).toBeNull();
    expect(named.identitySource).toBe("course-roster-name");

    // The two must not be reported as the same kind of knowledge.
    expect(cached.identitySource).not.toEqual(named.identitySource);
  });

  // THE ONE THAT MATTERS. Picking here attributes one student's work to
  // another, silently.
  it("attributes NOTHING for an ambiguous name and says so", () => {
    const built = index(["Alex Chen", "Alex Chen", "Grace Hopper"]);
    const result = resolveOfflineIdentity(built, "alex chen");
    expect(result.outcome).toBe("ambiguous");
    expect(result.identitySource).toBe("ambiguous-name");
    expect(result.studentIndex).toBeNull();
    expect(result.userId).toBeNull();
    expect(result.key).toBeNull();
    expect(result.candidates).toHaveLength(2);
  });

  it("stays ambiguous when the collision is only visible in the repo bindings", () => {
    const built = index([], [
      { student: "Alex Chen", canvasUserId: "5" },
      { student: "Alex Chen", canvasUserId: "6" },
    ]);
    const result = resolveOfflineIdentity(built, "Alex Chen");
    expect(result.outcome).toBe("ambiguous");
    expect(result.studentIndex).toBeNull();
    expect(result.userId).toBeNull();
  });

  it("distinguishes a name absent from the roster from a course with no roster at all", () => {
    const withRoster = index(["Ada Lovelace"]);
    const withoutRoster = index([], []);

    const absent = resolveOfflineIdentity(withRoster, "Grace Hopper");
    const noList = resolveOfflineIdentity(withoutRoster, "Grace Hopper");

    expect(absent.outcome).toBe("unmatched");
    expect(noList.outcome).toBe("no-roster");
    // An absent roster is our gap, not the student's - the two must never
    // collapse into one outcome.
    expect(absent.outcome).not.toEqual(noList.outcome);
    expect(absent.identitySource).toBeNull();
    expect(noList.identitySource).toBeNull();
  });

  it("never matches on a first name alone", () => {
    const built = index(["Ada Lovelace"]);
    expect(resolveOfflineIdentity(built, "Ada").outcome).toBe("unmatched");
  });

  it("reports a blank read name as unmatched rather than matching a student", () => {
    const built = index(["Ada Lovelace"]);
    const result = resolveOfflineIdentity(built, "   ");
    expect(result.outcome).toBe("unmatched");
    expect(result.studentIndex).toBeNull();
  });
});
