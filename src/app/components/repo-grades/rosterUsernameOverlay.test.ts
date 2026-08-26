import { describe, expect, it } from "vitest";
import { overlayRosterUsernames, rosterHasUsernames } from "./rosterUsernameOverlay";
import type { CourseStudentRepo } from "@/lib/supabase/courses";

function row(overrides: Partial<CourseStudentRepo>): CourseStudentRepo {
  return { student: "Student", canvasUserId: null, repo: "", username: null, email: null, ...overrides };
}

describe("overlayRosterUsernames", () => {
  it("returns the input rows unchanged for a null roster", () => {
    const existing = [row({ student: "Ada Lovelace", canvasUserId: "1" })];
    const result = overlayRosterUsernames(existing, null);
    expect(result.rows).toEqual(existing);
    expect(result.matched).toBe(0);
    expect(result.added).toBe(0);
    expect(result.withoutCanvasId).toBe(0);
    expect(result.conflicts).toEqual([]);
  });

  it("returns the input rows unchanged for a blank roster", () => {
    const existing = [row({ student: "Ada Lovelace", canvasUserId: "1" })];
    const result = overlayRosterUsernames(existing, "   \n  \n");
    expect(result.rows).toEqual(existing);
    expect(result.matched).toBe(0);
    expect(result.added).toBe(0);
  });

  it("adds a new row for a roster student with no existing row", () => {
    const result = overlayRosterUsernames([], "Ada Lovelace | ada-gh");
    expect(result.added).toBe(1);
    expect(result.matched).toBe(0);
    expect(result.rows).toEqual([
      { student: "Ada Lovelace", canvasUserId: null, repo: "", username: "ada-gh", email: null },
    ]);
  });

  it("fills a blank username on an existing row and counts it as matched", () => {
    const existing = [row({ student: "Ada Lovelace", canvasUserId: "1", username: null })];
    const result = overlayRosterUsernames(existing, "Ada Lovelace | ada-gh");
    expect(result.matched).toBe(1);
    expect(result.added).toBe(0);
    expect(result.rows).toEqual([{ student: "Ada Lovelace", canvasUserId: "1", repo: "", username: "ada-gh", email: null }]);
  });

  it("matches Last, First roster spelling against a First Last existing row", () => {
    const existing = [row({ student: "John Smith", canvasUserId: "1", username: null })];
    const result = overlayRosterUsernames(existing, "Smith, John | jsmith-gh");
    expect(result.matched).toBe(1);
    expect(result.rows[0].username).toBe("jsmith-gh");
  });

  it("matches First Last roster spelling against a Last, First existing row", () => {
    const existing = [row({ student: "Smith, John", canvasUserId: "1", username: null })];
    const result = overlayRosterUsernames(existing, "John Smith | jsmith-gh");
    expect(result.matched).toBe(1);
    expect(result.rows[0].username).toBe("jsmith-gh");
  });

  it("keeps an existing non-empty username and reports the disagreement as a conflict", () => {
    const existing = [row({ student: "Ada Lovelace", canvasUserId: "1", username: "canvas-handle" })];
    const result = overlayRosterUsernames(existing, "Ada Lovelace | roster-handle");
    expect(result.matched).toBe(0);
    expect(result.added).toBe(0);
    expect(result.rows[0].username).toBe("canvas-handle");
    expect(result.conflicts).toEqual(["Ada Lovelace: kept canvas-handle, roster said roster-handle"]);
  });

  it("does nothing and reports no conflict when the existing username already matches, case-insensitively", () => {
    const existing = [row({ student: "Ada Lovelace", canvasUserId: "1", username: "Ada-GH" })];
    const result = overlayRosterUsernames(existing, "Ada Lovelace | ada-gh");
    expect(result.matched).toBe(0);
    expect(result.conflicts).toEqual([]);
    expect(result.rows[0].username).toBe("Ada-GH");
  });

  it("changes nothing for a name that matches more than one existing row and reports it as a conflict", () => {
    const existing = [
      row({ student: "Jo Smith", canvasUserId: "1", username: null }),
      row({ student: "Jo Smith", canvasUserId: "2", username: null }),
    ];
    const result = overlayRosterUsernames(existing, "Jo Smith | jo-gh");
    expect(result.matched).toBe(0);
    expect(result.added).toBe(0);
    expect(result.rows).toEqual(existing);
    expect(result.conflicts).toEqual(["Jo Smith: ambiguous match (2 existing rows share this name) - left unchanged"]);
  });

  it("counts withoutCanvasId for a matched row whose canvasUserId is null", () => {
    const existing = [row({ student: "Ada Lovelace", canvasUserId: null, username: null })];
    const result = overlayRosterUsernames(existing, "Ada Lovelace | ada-gh");
    expect(result.matched).toBe(1);
    expect(result.withoutCanvasId).toBe(1);
  });

  it("counts withoutCanvasId for a matched row whose canvasUserId is non-numeric", () => {
    const existing = [row({ student: "Ada Lovelace", canvasUserId: "not-a-number", username: null })];
    const result = overlayRosterUsernames(existing, "Ada Lovelace | ada-gh");
    expect(result.matched).toBe(1);
    expect(result.withoutCanvasId).toBe(1);
  });

  it("does not count withoutCanvasId for a matched row whose canvasUserId is numeric", () => {
    const existing = [row({ student: "Ada Lovelace", canvasUserId: "42", username: null })];
    const result = overlayRosterUsernames(existing, "Ada Lovelace | ada-gh");
    expect(result.matched).toBe(1);
    expect(result.withoutCanvasId).toBe(0);
  });

  it("counts withoutCanvasId for every added row, since a new row's canvasUserId is always null", () => {
    const result = overlayRosterUsernames([], "Ada Lovelace | ada-gh\nAlan Turing | at-gh");
    expect(result.added).toBe(2);
    expect(result.withoutCanvasId).toBe(2);
  });

  it("skips a roster line with no username", () => {
    const result = overlayRosterUsernames([], "Ada Lovelace | ada-gh\nNo Username Here");
    expect(result.added).toBe(1);
    expect(result.rows).toEqual([{ student: "Ada Lovelace", canvasUserId: null, repo: "", username: "ada-gh", email: null }]);
  });

  it("does not mutate the studentRepos input", () => {
    const existing = [row({ student: "Ada Lovelace", canvasUserId: "1", username: null })];
    const frozenCopy = JSON.parse(JSON.stringify(existing));
    overlayRosterUsernames(existing, "Ada Lovelace | ada-gh");
    expect(existing).toEqual(frozenCopy);
  });

  it("returns a new rows array, not the same reference or same row objects", () => {
    const existing = [row({ student: "Ada Lovelace", canvasUserId: "1", username: null })];
    const result = overlayRosterUsernames(existing, "");
    expect(result.rows).not.toBe(existing);
    expect(result.rows[0]).not.toBe(existing[0]);
  });

  it("handles a mixed roster: one matched, one added, one conflicting, in a single pass", () => {
    const existing = [
      row({ student: "Ada Lovelace", canvasUserId: "1", username: null }),
      row({ student: "Grace Hopper", canvasUserId: "2", username: "already-set" }),
    ];
    const result = overlayRosterUsernames(
      existing,
      "Ada Lovelace | ada-gh\nGrace Hopper | different-gh\nAlan Turing | at-gh"
    );
    expect(result.matched).toBe(1);
    expect(result.added).toBe(1);
    expect(result.conflicts).toEqual(["Grace Hopper: kept already-set, roster said different-gh"]);
    expect(result.rows).toHaveLength(3);
  });
});

describe("rosterHasUsernames", () => {
  it("is false for null", () => {
    expect(rosterHasUsernames(null)).toBe(false);
  });

  it("is false for an empty string", () => {
    expect(rosterHasUsernames("")).toBe(false);
  });

  it("is false for names with no usernames", () => {
    expect(rosterHasUsernames("Ada Lovelace\nAlan Turing")).toBe(false);
  });

  it("is false for a line with a pipe but a blank username", () => {
    expect(rosterHasUsernames("Ada Lovelace |   ")).toBe(false);
  });

  it("is true when at least one line has a usable name and username", () => {
    expect(rosterHasUsernames("Ada Lovelace\nAlan Turing | at-gh")).toBe(true);
  });
});
