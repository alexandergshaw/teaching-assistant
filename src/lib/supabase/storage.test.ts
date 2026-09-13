// listFilesAs's field mapping, pinned. The installed SDK returns snake_case,
// nullable `updated_at` (node_modules/@supabase/storage-js/src/lib/types.ts:83)
// - this module's own StorageListEntry is camelCase `updatedAt`. tsc catches a
// bare typo against the raw field name, but it does NOT catch a spread or a
// cast through StorageListEntry - either compiles cleanly while making every
// updatedAt read `undefined` at runtime. This test exists so that hazard is
// caught here, not discovered by the orphan-upload sweep treating every
// object as unknown-age (or the reverse).
import { describe, it, expect } from "vitest";
import { listFilesAs, removeFilesAs } from "./storage";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function fakeSupabaseWithList(listResult: {
  data: { name: string; updated_at: string | null }[] | null;
  error: { message: string } | null;
}) {
  return {
    storage: {
      from: () => ({
        list: async () => listResult,
      }),
    },
  } as unknown as SupabaseClient<Database>;
}

function fakeSupabaseWithRemove(removeResult: {
  data: { name: string }[] | null;
  error: { message: string } | null;
}) {
  return {
    storage: {
      from: () => ({
        remove: async () => removeResult,
      }),
    },
  } as unknown as SupabaseClient<Database>;
}

describe("listFilesAs: field-by-field mapping from the SDK's snake_case updated_at", () => {
  it("maps name and updatedAt for a real, non-null timestamp", async () => {
    const supabase = fakeSupabaseWithList({
      data: [{ name: "abc123.docx", updated_at: "2026-09-01T00:00:00.000Z" }],
      error: null,
    });
    const page = await listFilesAs(supabase, "course-files", "u1/rubric-uploads", { limit: 100, offset: 0 });
    expect(page.data).toEqual([{ name: "abc123.docx", updatedAt: "2026-09-01T00:00:00.000Z" }]);
  });

  it("keeps a null updated_at as null - never undefined", async () => {
    const supabase = fakeSupabaseWithList({
      data: [{ name: "no-timestamp.pdf", updated_at: null }],
      error: null,
    });
    const page = await listFilesAs(supabase, "course-files", "u1/rubric-uploads", { limit: 100, offset: 0 });
    expect(page.data).toEqual([{ name: "no-timestamp.pdf", updatedAt: null }]);
    expect(page.data?.[0].updatedAt).not.toBeUndefined();
  });

  it("maps multiple entries independently, preserving order", async () => {
    const supabase = fakeSupabaseWithList({
      data: [
        { name: "a.docx", updated_at: "2026-09-01T00:00:00.000Z" },
        { name: "b.docx", updated_at: null },
        { name: "c.docx", updated_at: "2026-08-01T00:00:00.000Z" },
      ],
      error: null,
    });
    const page = await listFilesAs(supabase, "course-files", "u1/syllabus-uploads", { limit: 100, offset: 0 });
    expect(page.data).toEqual([
      { name: "a.docx", updatedAt: "2026-09-01T00:00:00.000Z" },
      { name: "b.docx", updatedAt: null },
      { name: "c.docx", updatedAt: "2026-08-01T00:00:00.000Z" },
    ]);
  });

  it("passes through an error rather than throwing", async () => {
    const supabase = fakeSupabaseWithList({ data: null, error: { message: "boom" } });
    const page = await listFilesAs(supabase, "course-files", "u1/rubric-uploads", { limit: 100, offset: 0 });
    expect(page.data).toBeNull();
    expect(page.error).toEqual({ message: "boom" });
  });
});

describe("removeFilesAs: forwards the SDK's data field verbatim, narrowed to name", () => {
  it("returns the removed names when the delete matches requested paths", async () => {
    const supabase = fakeSupabaseWithRemove({ data: [{ name: "u1/rubric-uploads/a.pdf" }], error: null });
    const result = await removeFilesAs(supabase, "course-files", ["u1/rubric-uploads/a.pdf"]);
    expect(result.data).toEqual([{ name: "u1/rubric-uploads/a.pdf" }]);
    expect(result.error).toBeNull();
  });

  it("returns an empty data array (not an error) when nothing matched - this is NOT proof of success", async () => {
    const supabase = fakeSupabaseWithRemove({ data: [], error: null });
    const result = await removeFilesAs(supabase, "course-files", ["u1/rubric-uploads/already-gone.pdf"]);
    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
  });

  it("passes through an error rather than throwing", async () => {
    const supabase = fakeSupabaseWithRemove({ data: null, error: { message: "boom" } });
    const result = await removeFilesAs(supabase, "course-files", ["u1/rubric-uploads/a.pdf"]);
    expect(result.data).toBeNull();
    expect(result.error).toEqual({ message: "boom" });
  });
});
