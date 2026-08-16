// Guard tests for the repo_module_pairing dedicated-writer column
// (docs/durable-repo-module-associations-acceptance-criteria.md AC7).
// Mirrors courses.deleteCourse.test.ts's own fake-service-client idiom
// (mock "./server", fake `course_hub` table, no network).
//
// GUARD (a): a full updateCourse round trip leaves repo_module_pairing
// untouched - proven two ways: the payload updateCourse sends to the DB
// never mentions the column at all (so Postgrest's partial UPDATE cannot
// touch it), and, end to end against the fake store, the value that comes
// back out is byte-identical to what was there before the unrelated save.
//
// GUARD (c): two different export courses keep their pairings apart. Both
// fixture rows carry canvas_url: null (the exact shape ContentTab.tsx
// derives for every export-sourced course - see the AC doc's "The bug is
// not a collision" section) - proving the write/read path cannot be using
// canvas_url as an identity key, only the row id, is the whole point of this
// feature's bug fix.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./server", () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from "./server";
import { updateCourse, updateCourseRepoPairing, getCourse } from "./courses";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import type { RepoModulePairing } from "@/lib/repo-module-pairing";

type FakeRow = Record<string, unknown>;

function baseRow(id: string, overrides: FakeRow = {}): FakeRow {
  return {
    id,
    name: `Course ${id}`,
    course_code: null,
    term: null,
    canvas_url: null,
    repos: [],
    github_org: null,
    textbook: null,
    syllabus_id: null,
    institution: null,
    integrations: [],
    roster: null,
    notes: null,
    topics: null,
    csv_name: null,
    csv_data: null,
    rubric_name: null,
    rubric_data: null,
    start_date: null,
    description: null,
    weeks: null,
    tests: null,
    lms: null,
    day_time: null,
    modality: null,
    topic_outline: null,
    syllabus_template_id: null,
    course_kind: null,
    end_date: null,
    breaks: null,
    assignment_due_rule: null,
    email: null,
    email_client: null,
    class_length_minutes: null,
    materials_files: [],
    castletop_files: [],
    misc_files: [],
    course_project: null,
    export_files: [],
    materials_zip_name: null,
    materials_zip_path: null,
    materials_zip_size: null,
    custom_tiles: [],
    hidden_tiles: [],
    student_repos: [],
    weekly_checklist: null,
    grades_due_date: null,
    grades_due_time: null,
    instructor_bio: null,
    instructor_title: null,
    instructor_credentials: null,
    instructor_department: null,
    repo_module_pairing: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

interface UpdateCallRecord {
  payload: FakeRow;
  eq: Array<[string, unknown]>;
}

function makeFakeServiceClient(initialRows: Record<string, FakeRow>) {
  const rows: Record<string, FakeRow> = { ...initialRows };
  const updateCalls: UpdateCallRecord[] = [];

  function selectChain(filters: Array<[string, unknown]>) {
    const obj = {
      eq: (col: string, val: unknown) => selectChain([...filters, [col, val]]),
      order: () => {
        const data = Object.values(rows);
        return Promise.resolve({ data, error: null });
      },
      maybeSingle: () => {
        const idFilter = filters.find(([c]) => c === "id")?.[1] as string | undefined;
        const row = idFilter !== undefined ? (rows[idFilter] ?? null) : null;
        return Promise.resolve({ data: row, error: null });
      },
      single: () => {
        const idFilter = filters.find(([c]) => c === "id")?.[1] as string | undefined;
        const row = idFilter !== undefined ? (rows[idFilter] ?? null) : null;
        return Promise.resolve({ data: row, error: row ? null : { message: "not found" } });
      },
    };
    return obj;
  }

  function updateChain(payload: FakeRow, filters: Array<[string, unknown]>) {
    const applyAndRecord = () => {
      const idFilter = filters.find(([c]) => c === "id")?.[1] as string | undefined;
      if (idFilter !== undefined && rows[idFilter]) {
        rows[idFilter] = { ...rows[idFilter], ...payload };
      }
      updateCalls.push({ payload, eq: filters });
      return idFilter;
    };
    const obj = {
      eq: (col: string, val: unknown) => updateChain(payload, [...filters, [col, val]]),
      select: () => ({
        single: () => {
          const idFilter = applyAndRecord();
          const row = idFilter !== undefined ? (rows[idFilter] ?? null) : null;
          return Promise.resolve({ data: row, error: row ? null : { message: "not found" } });
        },
      }),
      // Thenable: `await table().update(payload).eq(a).eq(b)` (no .select()) -
      // the shape updateCourseProject/updateCourseRepoPairing/etc. all use.
      then: (resolve: (v: { error: null }) => void, reject: (e: unknown) => void) => {
        applyAndRecord();
        return Promise.resolve({ error: null }).then(resolve, reject);
      },
    };
    return obj;
  }

  const client = {
    from: (table: string) => {
      if (table !== "course_hub") throw new Error(`unexpected table in fake client: ${table}`);
      return {
        select: () => selectChain([]),
        update: (payload: FakeRow) => updateChain(payload, []),
      };
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, rows, updateCalls };
}

beforeEach(() => {
  vi.mocked(createServiceClient).mockReset();
});

describe("GUARD (a): updateCourse never touches repo_module_pairing", () => {
  it("the payload updateCourse sends to the database does not mention repo_module_pairing at all", async () => {
    const fake = makeFakeServiceClient({ "course-1": baseRow("course-1") });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await updateCourse("user-1", "course-1", { name: "Updated Name" });

    expect(fake.updateCalls).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(fake.updateCalls[0].payload, "repo_module_pairing")).toBe(false);
  });

  it("end to end: a full updateCourse round trip leaves a previously-stored pairing byte-identical", async () => {
    const storedPairing: RepoModulePairing = {
      v: 1,
      repoRef: "org/repo",
      branch: "main",
      associations: [{ path: "assignments/module_01", kind: "folder", moduleId: "10", boundAt: "2026-01-01T00:00:00Z" }],
    };
    const fake = makeFakeServiceClient({ "course-1": baseRow("course-1", { repo_module_pairing: storedPairing }) });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    // A full, realistic course-form save - the same shape a course-editor
    // "Save" click sends, touching many unrelated columns.
    await updateCourse("user-1", "course-1", {
      name: "CS 101",
      courseCode: "INFO-2350",
      term: "Fall 2026",
      institution: "MCC",
      modality: "sync",
      courseKind: "coding",
      instructorBio: "Updated bio",
    });

    expect(fake.rows["course-1"].repo_module_pairing).toEqual(storedPairing);
  });
});

describe("GUARD (c): two different export courses keep their pairings apart, keyed on row id not courseUrl", () => {
  it("writes and reads two courses' pairings independently, even though both share the export shape canvas_url: null", async () => {
    const fake = makeFakeServiceClient({
      "course-a": baseRow("course-a", { canvas_url: null }),
      "course-b": baseRow("course-b", { canvas_url: null }),
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const pairingA: RepoModulePairing = {
      v: 1,
      repoRef: "org/repo-a",
      branch: "main",
      associations: [{ path: "assignments/module_01", kind: "folder", moduleId: "10", boundAt: "" }],
    };
    const pairingB: RepoModulePairing = {
      v: 1,
      repoRef: "org/repo-b",
      branch: "dev",
      associations: [{ path: "assignments/module_02", kind: "folder", moduleId: "20", boundAt: "" }],
    };

    await updateCourseRepoPairing("user-1", "course-a", pairingA);
    await updateCourseRepoPairing("user-1", "course-b", pairingB);

    const courseA = await getCourse("user-1", "course-a");
    const courseB = await getCourse("user-1", "course-b");

    expect(courseA?.repoModulePairing).toEqual(pairingA);
    expect(courseB?.repoModulePairing).toEqual(pairingB);
  });

  it("scopes the write by user_id and the row id only - canvas_url never appears in the filter", async () => {
    const fake = makeFakeServiceClient({ "course-a": baseRow("course-a", { canvas_url: null }) });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const pairing: RepoModulePairing = { v: 1, repoRef: "org/repo-a", branch: "main", associations: [] };
    await updateCourseRepoPairing("user-1", "course-a", pairing);

    expect(fake.updateCalls).toHaveLength(1);
    expect(fake.updateCalls[0].eq).toContainEqual(["user_id", "user-1"]);
    expect(fake.updateCalls[0].eq).toContainEqual(["id", "course-a"]);
    expect(fake.updateCalls[0].eq.some(([col]) => col === "canvas_url")).toBe(false);
  });
});
