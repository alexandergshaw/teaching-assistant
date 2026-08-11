// Guards the syllabus-template/syllabus upload budget in
// src/app/actions/syllabus-templates.ts.
//
// This file already measured the right thing - WIRE bytes (base64.length),
// not FILE bytes - before src/lib/upload-budget.ts existed to name that
// distinction. Its own cap (MAX_TEMPLATE_BASE64 = 8MB) was just set almost
// double Vercel's real ~4.5MB platform-layer request body cap, so the
// friendly "too large" refusal it prepared could never fire before the
// platform's own opaque 413 did. The three call sites below now share
// UPLOAD_WIRE_BUDGET_BYTES with every other upload path in the app, so this
// asserts each one refuses an over-budget payload BEFORE touching the
// database, and still lets an under-budget payload through.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "user-1", email: "user@example.com" }),
}));

vi.mock("@/lib/supabase/syllabus-templates", () => ({
  createTemplate: vi.fn().mockResolvedValue({ id: "template-1", name: "My template", fileName: "syllabus.docx" }),
  updateTemplate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/course-syllabi", () => ({
  createSyllabus: vi.fn().mockResolvedValue({ id: "syllabus-1", name: "My syllabus", fileName: "syllabus.docx" }),
}));

import { createTemplate, updateTemplate } from "@/lib/supabase/syllabus-templates";
import { createSyllabus } from "@/lib/supabase/course-syllabi";
import {
  createSyllabusTemplateAction,
  updateSyllabusTemplateAction,
  createFinalizedSyllabusAction,
} from "./syllabus-templates";

beforeEach(() => {
  vi.clearAllMocks();
});

// A base64 string whose length IS its WIRE-byte count, at an exact size
// relative to the shared budget - clearly under it, and clearly over it.
const UNDER_BUDGET_BASE64 = "a".repeat(UPLOAD_WIRE_BUDGET_BYTES - 10_000);
const OVER_BUDGET_BASE64 = "a".repeat(UPLOAD_WIRE_BUDGET_BYTES + 1);

describe("createSyllabusTemplateAction - wire-byte budget", () => {
  it("refuses an over-budget upload before ever calling createTemplate", async () => {
    const result = await createSyllabusTemplateAction("My template", "syllabus.docx", OVER_BUDGET_BASE64);
    expect(result).toHaveProperty("error");
    if ("error" in result) expect(result.error).toContain("That template");
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it("accepts an under-budget upload and reaches createTemplate", async () => {
    const result = await createSyllabusTemplateAction("My template", "syllabus.docx", UNDER_BUDGET_BASE64);
    expect(result).not.toHaveProperty("error");
    expect(createTemplate).toHaveBeenCalledTimes(1);
  });
});

describe("updateSyllabusTemplateAction - wire-byte budget", () => {
  it("refuses an over-budget replacement file before ever calling updateTemplate", async () => {
    const result = await updateSyllabusTemplateAction("template-1", {
      fileName: "syllabus.docx",
      base64: OVER_BUDGET_BASE64,
    });
    expect(result).toHaveProperty("error");
    if ("error" in result) expect(result.error).toContain("That template");
    expect(updateTemplate).not.toHaveBeenCalled();
  });

  it("accepts an under-budget replacement file and reaches updateTemplate", async () => {
    const result = await updateSyllabusTemplateAction("template-1", {
      fileName: "syllabus.docx",
      base64: UNDER_BUDGET_BASE64,
    });
    expect(result).toEqual({ ok: true });
    expect(updateTemplate).toHaveBeenCalledTimes(1);
  });
});

describe("createFinalizedSyllabusAction - wire-byte budget", () => {
  it("refuses an over-budget syllabus before ever calling createSyllabus", async () => {
    const result = await createFinalizedSyllabusAction("My syllabus", "syllabus.docx", OVER_BUDGET_BASE64);
    expect(result).toHaveProperty("error");
    if ("error" in result) expect(result.error).toContain("That syllabus");
    expect(createSyllabus).not.toHaveBeenCalled();
  });

  it("accepts an under-budget syllabus and reaches createSyllabus", async () => {
    const result = await createFinalizedSyllabusAction("My syllabus", "syllabus.docx", UNDER_BUDGET_BASE64);
    expect(result).not.toHaveProperty("error");
    expect(createSyllabus).toHaveBeenCalledTimes(1);
  });
});
