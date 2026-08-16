// Guard tests for the export_module_additions dedicated-writer column
// (docs/export-module-additions-acceptance-criteria.md AC1/AC7). Mirrors
// courses.repo-pairing.test.ts's own fake-service-client idiom (mock
// "./server", fake `course_hub` table, no network) - read that file first;
// this one repeats its shape deliberately.
//
// GUARD (a): a full updateCourse round trip leaves export_module_additions
// untouched - proven two ways: the payload updateCourse sends to the DB
// never mentions the column at all (so Postgrest's partial UPDATE cannot
// touch it), and, end to end against the fake store, the value that comes
// back out is byte-identical to what was there before the unrelated save.
//
// GUARD (c): two different export courses keep their additions apart, both
// with canvas_url: null (the export-course shape) - proving the write/read
// path is keyed on the row id, not courseUrl.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./server", () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from "./server";
import { updateCourse, updateCourseExportModuleAdditions, getCourse } from "./courses";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import type { ExportModuleAdditions } from "@/lib/export-module-additions";

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
    export_module_additions: null,
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
      // the shape updateCourseProject/updateCourseRepoPairing/
      // updateCourseExportModuleAdditions/etc. all use.
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

describe("GUARD (a): updateCourse never touches export_module_additions", () => {
  it("the payload updateCourse sends to the database does not mention export_module_additions at all", async () => {
    const fake = makeFakeServiceClient({ "course-1": baseRow("course-1") });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await updateCourse("user-1", "course-1", { name: "Updated Name" });

    expect(fake.updateCalls).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(fake.updateCalls[0].payload, "export_module_additions")).toBe(false);
  });

  it("end to end: a full updateCourse round trip leaves previously-stored additions byte-identical", async () => {
    const storedAdditions: ExportModuleAdditions = {
      v: 1,
      additions: [{ id: "a1", moduleRef: "mod-1", title: "Extra credit", type: "Page", addedAt: "2026-01-01T00:00:00Z" }],
    };
    const fake = makeFakeServiceClient({ "course-1": baseRow("course-1", { export_module_additions: storedAdditions }) });
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

    expect(fake.rows["course-1"].export_module_additions).toEqual(storedAdditions);
  });
});

describe("GUARD (c): two different export courses keep their additions apart, keyed on row id not courseUrl", () => {
  it("writes and reads two courses' additions independently, even though both share the export shape canvas_url: null", async () => {
    const fake = makeFakeServiceClient({
      "course-a": baseRow("course-a", { canvas_url: null }),
      "course-b": baseRow("course-b", { canvas_url: null }),
    });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const additionsA: ExportModuleAdditions = {
      v: 1,
      additions: [{ id: "a1", moduleRef: "mod-1", title: "Course A item", type: "Page", addedAt: "" }],
    };
    const additionsB: ExportModuleAdditions = {
      v: 1,
      additions: [{ id: "b1", moduleRef: "mod-2", title: "Course B item", type: "File", addedAt: "" }],
    };

    await updateCourseExportModuleAdditions("user-1", "course-a", additionsA);
    await updateCourseExportModuleAdditions("user-1", "course-b", additionsB);

    const courseA = await getCourse("user-1", "course-a");
    const courseB = await getCourse("user-1", "course-b");

    expect(courseA?.exportModuleAdditions).toEqual(additionsA);
    expect(courseB?.exportModuleAdditions).toEqual(additionsB);
  });

  it("scopes the write by user_id and the row id only - canvas_url never appears in the filter", async () => {
    const fake = makeFakeServiceClient({ "course-a": baseRow("course-a", { canvas_url: null }) });
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const additions: ExportModuleAdditions = { v: 1, additions: [] };
    await updateCourseExportModuleAdditions("user-1", "course-a", additions);

    expect(fake.updateCalls).toHaveLength(1);
    expect(fake.updateCalls[0].eq).toContainEqual(["user_id", "user-1"]);
    expect(fake.updateCalls[0].eq).toContainEqual(["id", "course-a"]);
    expect(fake.updateCalls[0].eq.some(([col]) => col === "canvas_url")).toBe(false);
  });
});
