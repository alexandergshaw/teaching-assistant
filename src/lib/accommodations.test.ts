import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  listAccommodations,
  addAccommodation,
  updateAccommodation,
  deleteAccommodation,
} from "./accommodations";
import { runAsOwner } from "./supabase/owner-context";
import type { Database } from "./supabase/types";

type Row = Database["public"]["Tables"]["institution_accommodations"]["Row"];

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "a1",
    user_id: "u1",
    institution: "acme",
    course_id: "course-1",
    assignment_id: "assign-1",
    canvas_user_id: "canvas-42",
    note: "50% extended time",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

// ============================================================================
// The impersonation guard (assertNotImpersonated) - THE MOST IMPORTANT TEST
// IN THIS FILE. See src/lib/accommodations.ts's own header for why: under
// runAsOwner, the session client has no JWT and an RLS-denied SELECT returns
// { data: [], error: null } - an empty accommodations list with no error,
// silently telling an instructor that nobody has accommodations. Every
// exported function must throw before ever reaching the client when called
// from inside runAsOwner.
//
// SABOTAGE CHECK PERFORMED (reported per this task's instructions): with
// assertNotImpersonated()'s call temporarily commented out of each exported
// function in src/lib/accommodations.ts, every "throws inside runAsOwner"
// test below was re-run and failed (the promise resolved instead of
// rejecting), confirming the guard is load-bearing rather than a check that
// can never fail. The guard call was then restored before this file was
// finalized - no sabotage survives in the committed tree.
// ============================================================================

const IMPERSONATED_OWNER = {
  id: "owner-1",
  email: "owner@example.com",
  role: "owner" as const,
  status: "active" as const,
};

function fakeSupabase(resultRows: Row[]) {
  function builder() {
    const chain = {
      select() {
        return chain;
      },
      insert() {
        return chain;
      },
      update() {
        return chain;
      },
      delete() {
        return Promise.resolve({ error: null });
      },
      eq() {
        return chain;
      },
      order() {
        return chain;
      },
      single() {
        return Promise.resolve({ data: resultRows[0] ?? null, error: null });
      },
      then(resolve: (value: { data: Row[]; error: null }) => unknown) {
        return Promise.resolve({ data: resultRows, error: null }).then(resolve);
      },
    };
    return chain;
  }
  return { from: () => builder() };
}

describe("assertNotImpersonated - throws for every verb under runAsOwner", () => {
  it("listAccommodations throws inside runAsOwner", async () => {
    const client = fakeSupabase([]);
    await expect(
      runAsOwner(IMPERSONATED_OWNER, () =>
        listAccommodations(client as never, "u1", "acme", "course-1", "assign-1")
      )
    ).rejects.toThrow(/impersonat/i);
  });

  it("addAccommodation throws inside runAsOwner", async () => {
    const client = fakeSupabase([row()]);
    await expect(
      runAsOwner(IMPERSONATED_OWNER, () =>
        addAccommodation(client as never, "u1", {
          institution: "acme",
          courseId: "course-1",
          assignmentId: "assign-1",
          canvasUserId: "canvas-42",
          note: "note",
        })
      )
    ).rejects.toThrow(/impersonat/i);
  });

  it("updateAccommodation throws inside runAsOwner", async () => {
    const client = fakeSupabase([row()]);
    await expect(
      runAsOwner(IMPERSONATED_OWNER, () => updateAccommodation(client as never, "u1", "a1", { note: "x" }))
    ).rejects.toThrow(/impersonat/i);
  });

  it("deleteAccommodation throws inside runAsOwner", async () => {
    const client = fakeSupabase([]);
    await expect(
      runAsOwner(IMPERSONATED_OWNER, () => deleteAccommodation(client as never, "u1", "a1"))
    ).rejects.toThrow(/impersonat/i);
  });

  it("listAccommodations does NOT throw outside of runAsOwner (the guard is not vacuously true)", async () => {
    const client = fakeSupabase([]);
    await expect(listAccommodations(client as never, "u1", "acme", "course-1", "assign-1")).resolves.toEqual([]);
  });
});

// ============================================================================
// mapAccommodationRow - via listAccommodations, since the mapper is not
// exported (mirrors this repo's own convention of testing an unexported
// mapper through its public caller when the caller is a thin pass-through -
// see src/lib/recording-files.ts's own test file for the same shape).
// ============================================================================

describe("row mapping", () => {
  it("maps every column, including no name field anywhere in the result", async () => {
    const client = fakeSupabase([row()]);
    const [entry] = await listAccommodations(client as never, "u1", "acme", "course-1", "assign-1");

    expect(entry).toEqual({
      id: "a1",
      institution: "acme",
      courseId: "course-1",
      assignmentId: "assign-1",
      canvasUserId: "canvas-42",
      note: "50% extended time",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
    });
    expect(entry).not.toHaveProperty("name");
    expect(entry).not.toHaveProperty("courseName");
    expect(entry).not.toHaveProperty("assignmentName");
  });

  it("never spreads or destructures the raw row - every field is a hand mapping", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "accommodations.ts"), "utf-8");
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(withoutComments).not.toMatch(/\.\.\.\s*row\b/);
    expect(withoutComments).not.toMatch(/\.select<[^>]*Row[^>]*>\(/);
  });
});

// ============================================================================
// Filter pinning: user_id on every read, update, and delete (all three
// verbs - not just read and delete). Each of these mirrors
// src/lib/announcement-exemplars.test.ts's own "Filter pinning" section.
// ============================================================================

type RecordedCall = { op: string; filters: Array<[string, unknown]>; row?: unknown };

function recordingSupabase(resultRows: Row[]) {
  const calls: RecordedCall[] = [];

  function builder() {
    let current: RecordedCall | null = null;
    const chain = {
      select() {
        if (current && (current.op === "insert" || current.op === "update")) return chain;
        current = { op: "select", filters: [] };
        calls.push(current);
        return chain;
      },
      insert(insertedRow: unknown) {
        current = { op: "insert", filters: [], row: insertedRow };
        calls.push(current);
        return chain;
      },
      update(updatedRow: unknown) {
        current = { op: "update", filters: [], row: updatedRow };
        calls.push(current);
        return chain;
      },
      delete() {
        current = { op: "delete", filters: [] };
        calls.push(current);
        return {
          ...chain,
          then(resolve: (value: { error: null }) => unknown) {
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
      },
      eq(column: string, value: unknown) {
        current?.filters.push([column, value]);
        return chain;
      },
      order() {
        return chain;
      },
      single() {
        return Promise.resolve({ data: resultRows[0] ?? null, error: null });
      },
      then(resolve: (value: { data: Row[]; error: null }) => unknown) {
        return Promise.resolve({ data: resultRows, error: null }).then(resolve);
      },
    };
    return chain;
  }

  return { client: { from: () => builder() }, calls };
}

describe("listAccommodations - owner scoping", () => {
  it("filters on user_id, institution, course_id, and assignment_id", async () => {
    const { client, calls } = recordingSupabase([]);
    await listAccommodations(client as never, "user-a", "Acme", "course-1", "assign-1");

    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe("select");
    expect(calls[0].filters).toContainEqual(["user_id", "user-a"]);
    expect(calls[0].filters).toContainEqual(["course_id", "course-1"]);
    expect(calls[0].filters).toContainEqual(["assignment_id", "assign-1"]);
    const institutionFilter = calls[0].filters.find(([c]) => c === "institution");
    expect(institutionFilter).toBeTruthy();
  });
});

describe("addAccommodation - owner scoping", () => {
  it("writes the server-derived userId into the inserted row's user_id", async () => {
    const { client, calls } = recordingSupabase([row({ user_id: "user-a" })]);
    await addAccommodation(client as never, "user-a", {
      institution: "acme",
      courseId: "course-1",
      assignmentId: "assign-1",
      canvasUserId: "canvas-42",
      note: "note",
    });

    expect(calls[0].op).toBe("insert");
    expect((calls[0].row as Record<string, unknown>).user_id).toBe("user-a");
  });

  it("never writes a name/courseName/assignmentName field into the inserted row", async () => {
    const { client, calls } = recordingSupabase([row()]);
    await addAccommodation(client as never, "user-a", {
      institution: "acme",
      courseId: "course-1",
      assignmentId: "assign-1",
      canvasUserId: "canvas-42",
      note: "note",
    });

    const inserted = calls[0].row as Record<string, unknown>;
    expect(inserted).not.toHaveProperty("name");
    expect(inserted).not.toHaveProperty("course_name");
    expect(inserted).not.toHaveProperty("assignment_name");
  });

  it("throws rather than inserting when canvasUserId is missing", async () => {
    const { client } = recordingSupabase([row()]);
    await expect(
      addAccommodation(client as never, "user-a", {
        institution: "acme",
        courseId: "course-1",
        assignmentId: "assign-1",
        canvasUserId: "",
        note: "note",
      })
    ).rejects.toThrow();
  });
});

describe("updateAccommodation - owner scoping", () => {
  it("filters on BOTH the entry id and the calling user's id", async () => {
    const { client, calls } = recordingSupabase([row()]);
    await updateAccommodation(client as never, "user-a", "a1", { note: "revised note" });

    expect(calls[0].op).toBe("update");
    expect([...calls[0].filters].sort()).toEqual(
      [
        ["id", "a1"],
        ["user_id", "user-a"],
      ].sort()
    );
  });

  it("writes a fresh updated_at and the new note, never a name field", async () => {
    const { client, calls } = recordingSupabase([row()]);
    await updateAccommodation(client as never, "user-a", "a1", { note: "revised note" });

    const updated = calls[0].row as Record<string, unknown>;
    expect(updated.note).toBe("revised note");
    expect(typeof updated.updated_at).toBe("string");
    expect(updated).not.toHaveProperty("name");
  });
});

describe("deleteAccommodation - owner scoping", () => {
  it("filters on BOTH the entry id and the calling user's id", async () => {
    const { client, calls } = recordingSupabase([]);
    await deleteAccommodation(client as never, "user-a", "a1");

    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe("delete");
    expect([...calls[0].filters].sort()).toEqual(
      [
        ["id", "a1"],
        ["user_id", "user-a"],
      ].sort()
    );
  });
});

// ============================================================================
// No accommodations value ever reaches the diagnostic log - a static-import
// check mirroring this repo's other "never imports X" pins.
// ============================================================================

describe("never imports the diagnostic log", () => {
  it("has no import statement naming session-diagnostic-log, and never calls recordSessionDiagnosticEntry", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "accommodations.ts"), "utf-8");
    expect(source).not.toMatch(/^import[^\n]*session-diagnostic-log/m);
    expect(source).not.toMatch(/recordSessionDiagnosticEntry\s*\(/);
  });
});
