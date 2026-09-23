import { describe, it, expect, vi, beforeEach } from "vitest";

// N15-rubric-picture-scope, section 4.4: the zip grading path (gradeAction,
// "other"/"embedded"/"gemini" providers) shares one Server Action form body
// with the rubric field, and had NO wire-budget check at all -
// `grep -nE "upload-budget|checkWireBudget|checkFileWireBudget|bodySize"
// src/app/actions/grading.ts` used to exit 1 with no output. This file pins
// the check added at gradeAction's file-branch entry, right after the
// "please upload a zip" guard and before any provider branches.
//
// requireOwner is mocked (auth only - not the subject of this test). The
// embedded-provider dependencies (extractStudentEntries, attachCodeRuns,
// buildEmbeddedRubric, gradeEntriesEmbedded, rememberRubric) are mocked too,
// so the "under budget still grades" case proves the guard does not refuse
// legitimate work without depending on real zip parsing or a live model call
// (network is blocked under vitest here regardless - vitest.setup.ts throws
// on any real fetch).

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/grade", async () => {
  const actual = await vi.importActual<typeof import("@/lib/grade")>("@/lib/grade");
  return {
    ...actual,
    extractStudentEntries: vi.fn(),
  };
});

vi.mock("@/lib/embedded-grader", async () => {
  const actual = await vi.importActual<typeof import("@/lib/embedded-grader")>("@/lib/embedded-grader");
  return {
    ...actual,
    buildEmbeddedRubric: vi.fn(),
    gradeEntriesEmbedded: vi.fn(),
  };
});

vi.mock("@/lib/code-runner", async () => {
  const actual = await vi.importActual<typeof import("@/lib/code-runner")>("@/lib/code-runner");
  return {
    ...actual,
    attachCodeRuns: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/research/rubric-bank", () => ({
  rememberRubric: vi.fn().mockResolvedValue(0),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { extractStudentEntries } from "@/lib/grade";
import { buildEmbeddedRubric, gradeEntriesEmbedded } from "@/lib/embedded-grader";
import { gradeAction } from "./grading";
import {
  checkFileWireBudget,
  maxFileBytesForWireBudget,
  UPLOAD_WIRE_BUDGET_BYTES,
} from "@/lib/upload-budget";

function zipFile(sizeBytes: number, name = "submissions.zip"): File {
  // Content does not matter for the over-budget case (refused before any
  // byte is read); for the under-budget case, extractStudentEntries is
  // mocked so the actual bytes are never parsed either. A minimal buffer
  // keeps the fixture cheap regardless of the requested size.
  const buf = new Uint8Array(sizeBytes);
  return new File([buf], name, { type: "application/zip" });
}

function baseFormData(file: File): FormData {
  const fd = new FormData();
  fd.set("studentSubmissions", file);
  fd.set("provider", "embedded");
  fd.set("rubric", "1. Correctness (10 pts)");
  fd.set("assignmentInstructions", "Write a function that adds two numbers.");
  return fd;
}

describe("gradeAction - zip wire budget (N15-rubric-picture-scope section 4.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" } as never);
    vi.mocked(extractStudentEntries).mockResolvedValue([
      { student: "Student A", files: [{ name: "main.py", content: "x = 1" }] },
    ] as never);
    vi.mocked(buildEmbeddedRubric).mockReturnValue({
      checks: [{ id: "c1", label: "Correctness", points: 10 }],
      warnings: [],
      origin: "text",
    } as never);
    vi.mocked(gradeEntriesEmbedded).mockReturnValue({
      results: [],
      rubricAreaNames: [],
      fullCreditChecklist: [],
    } as never);
  });

  it("refuses a zip over the wire budget, naming the size, before touching the grading engine", async () => {
    const oversized = maxFileBytesForWireBudget(UPLOAD_WIRE_BUDGET_BYTES) + 1;
    const formData = baseFormData(zipFile(oversized));

    const result = await gradeAction({ run: null, error: null }, formData);

    expect(result.run).toBeNull();
    expect(result.error).toEqual(expect.stringContaining("too large to upload"));
    expect(extractStudentEntries).not.toHaveBeenCalled();
    expect(gradeEntriesEmbedded).not.toHaveBeenCalled();
  });

  it("still grades a zip under the wire budget - the guard must not refuse work that would have succeeded", async () => {
    const underBudget = maxFileBytesForWireBudget(UPLOAD_WIRE_BUDGET_BYTES) - 1;
    const formData = baseFormData(zipFile(underBudget));

    const result = await gradeAction({ run: null, error: null }, formData);

    expect(result.error).toBeNull();
    expect(result.run).not.toBeNull();
    expect(extractStudentEntries).toHaveBeenCalledTimes(1);
    expect(gradeEntriesEmbedded).toHaveBeenCalledTimes(1);
  });

  it("pins the exact refusal boundary against upload-budget.ts's own export, so a later change to the constant cannot silently move this path's behaviour unnoticed", () => {
    const maxOk = maxFileBytesForWireBudget(UPLOAD_WIRE_BUDGET_BYTES);

    expect(maxOk).toBe(2752512);
    expect(checkFileWireBudget(maxOk, "The student submissions zip").ok).toBe(true);
    expect(checkFileWireBudget(maxOk + 1, "The student submissions zip").ok).toBe(false);
  });
});
