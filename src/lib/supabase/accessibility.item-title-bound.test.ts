// RES-A11Y-6: POST /api/accessibility's scan-files-batch op reads
// body.files[].title straight from the caller-supplied JSON (route.ts casts
// it with `as Array<{ id: number; title: string; ... }>` without validating
// it) and passes it into upsertScans, which writes it into item_title
// through the service-role client with no length or type check.
//
// This test drives the real upsertScans() (src/lib/supabase/accessibility.ts)
// against a hand-built fake of the service client, mirroring the
// vi.mock("./server", ...) idiom used in courses.deleteCourse.test.ts. The
// title values below are deliberately smuggled past ItemScan's `title:
// string` type via `as unknown as ItemScan[]`, because that is exactly how
// an attacker-controlled value would arrive in practice: route.ts's own `as`
// cast on the untrusted request body is the real bypass, not a defect in
// this test.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./server", () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from "./server";
import { upsertScans } from "./accessibility";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import type { ItemScan } from "@/lib/accessibility/types";

function makeFakeServiceClient() {
  const upsertedRows: Array<Record<string, unknown>> = [];
  const client = {
    from: (table: string) => {
      if (table === "accessibility_scans") {
        return {
          upsert: (rows: Array<Record<string, unknown>>) => {
            upsertedRows.push(...rows);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table in fake client: ${table}`);
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, upsertedRows };
}

function itemWithRawTitle(title: unknown): ItemScan {
  // Simulates a caller-supplied body.files[].title reaching ItemScan via
  // route.ts's unvalidated `as` cast - the value can be anything the caller
  // sends, regardless of ItemScan's compile-time `title: string`.
  return {
    type: "file",
    id: "1",
    title,
    fingerprint: "fp",
    errorCount: 0,
    warningCount: 0,
    suggestionCount: 0,
    issues: [],
  } as unknown as ItemScan;
}

describe("upsertScans bounds and type-checks item_title (RES-A11Y-6)", () => {
  beforeEach(() => {
    vi.mocked(createServiceClient).mockReset();
  });

  it("truncates an oversized title to 200 characters", async () => {
    const fake = makeFakeServiceClient();
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    const longTitle = "x".repeat(5000);
    await upsertScans("user-1", "inst", "course-1", [itemWithRawTitle(longTitle)]);

    expect(fake.upsertedRows).toHaveLength(1);
    const stored = fake.upsertedRows[0].item_title;
    expect(typeof stored).toBe("string");
    expect((stored as string).length).toBe(200);
    expect(stored).toBe("x".repeat(200));
  });

  it("coerces a non-string title to an empty string rather than storing it as-is", async () => {
    const fake = makeFakeServiceClient();
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await upsertScans("user-1", "inst", "course-1", [
      itemWithRawTitle({ malicious: "object", not: "a string" }),
    ]);

    expect(fake.upsertedRows).toHaveLength(1);
    expect(fake.upsertedRows[0].item_title).toBe("");
  });

  it("leaves an in-bound, ordinary string title untouched", async () => {
    const fake = makeFakeServiceClient();
    vi.mocked(createServiceClient).mockReturnValue(fake.client);

    await upsertScans("user-1", "inst", "course-1", [itemWithRawTitle("Week 3 Lecture Slides.pptx")]);

    expect(fake.upsertedRows[0].item_title).toBe("Week 3 Lecture Slides.pptx");
  });
});
