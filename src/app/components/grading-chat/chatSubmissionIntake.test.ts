import { describe, it, expect } from "vitest";
import {
  buildTextEntry,
  CHAT_LABEL_MAX_CHARS,
  extractSingleEntry,
  mergeCompositeEntries,
  type ChatSubmissionInput,
  type IntakeOutcome,
} from "./chatSubmissionIntake";
import type { StudentSubmissionEntry, SubmittedFileInfo } from "@/lib/grade/types";

describe("buildTextEntry", () => {
  it("defaults the label to Submission <ordinal> when no label is given", () => {
    const entry = buildTextEntry({ content: "hello" }, 3);
    expect(entry.student).toBe("Submission 3");
    expect(entry.content).toBe("hello");
    expect(entry.mergedFileCount).toBe(0);
    expect(entry.submittedFiles).toEqual([]);
  });

  it("uses a trimmed custom label when one is given", () => {
    const entry = buildTextEntry({ label: "  Jane Doe  ", content: "hi" }, 1);
    expect(entry.student).toBe("Jane Doe");
  });

  it("falls back to the default when the label is blank/whitespace-only", () => {
    const entry = buildTextEntry({ label: "   ", content: "hi" }, 5);
    expect(entry.student).toBe("Submission 5");
  });

  // F4 Gap 2 (docs/grading-chat-security.md SEC-GC-4): an overlong custom
  // label degrades (sliced) rather than failing closed at the route's own
  // 500-char rejection. RED if the defaulter is changed to leave the label
  // unbounded - a 600-char label would then reach route.ts:88-90's own
  // MAX_STUDENT_CHARS check and 400 the whole submission instead.
  it("slices an overlong custom label to CHAT_LABEL_MAX_CHARS after defaulting", () => {
    const longLabel = "x".repeat(600);
    const entry = buildTextEntry({ label: longLabel, content: "hi" }, 1);
    expect(entry.student.length).toBe(CHAT_LABEL_MAX_CHARS);
    expect(entry.student).toBe("x".repeat(500));
  });

  it("never produces an empty student label", () => {
    const entry = buildTextEntry({ content: "hi" }, 1);
    expect(entry.student.length).toBeGreaterThan(0);
  });
});

describe("ChatSubmissionInput / IntakeOutcome shapes (type-level smoke, no runtime import)", () => {
  it("accepts a text/file/url discriminated value for each kind", () => {
    const text: ChatSubmissionInput = { kind: "text", content: "hi" };
    const file: ChatSubmissionInput = { kind: "file", file: new File(["x"], "a.txt") };
    const url: ChatSubmissionInput = { kind: "url", url: "https://example.com" };
    expect(text.kind).toBe("text");
    expect(file.kind).toBe("file");
    expect(url.kind).toBe("url");
  });

  it("accepts a composite value carrying text/file/url parts", () => {
    const composite: ChatSubmissionInput = {
      kind: "composite",
      student: "Ada",
      parts: [{ kind: "text", content: "hi" }, { kind: "file", file: new File(["x"], "a.txt") }, { kind: "url", url: "https://example.com" }],
    };
    expect(composite.kind).toBe("composite");
  });

  it("the entries outcome carries pointsPossible (wave-plan BLOCKER-1)", () => {
    const outcome: IntakeOutcome = { kind: "entries", entries: [], pointsPossible: 100 };
    expect(outcome.kind).toBe("entries");
    if (outcome.kind === "entries") {
      expect(outcome.pointsPossible).toBe(100);
    }
  });
});

function fileInfo(name: string): SubmittedFileInfo {
  return { name, extension: ".txt", previewContent: "p-" + name, previewTruncated: false, mimeType: "text/plain" };
}

function entryOf(student: string, content: string, mergedFileCount: number, names: string[]): StudentSubmissionEntry {
  return { student, content, mergedFileCount, submittedFiles: names.map(fileInfo) };
}

// FROZEN ORACLE (docs/grading-chat-composite-scope.md section 9): literal
// expected values, written out by hand, not derived from the implementation.
describe("mergeCompositeEntries - frozen oracle", () => {
  const text = entryOf("Text", "my essay", 0, []);
  const file = entryOf("report", "File: report.txt\n\nbody", 1, ["report.txt"]);
  const repo = entryOf("o/r", "repo code", 3, ["a.ts", "report.txt"]);

  it("pins the exact content format: header per part, separator between parts", () => {
    const merged = mergeCompositeEntries([text, file], "Ada");
    expect(merged.content).toBe("Part 1 - Text:\n\nmy essay\n\n---\n\nPart 2 - report:\n\nFile: report.txt\n\nbody");
  });

  it("a single part has a header and no separator", () => {
    expect(mergeCompositeEntries([text], "Ada").content).toBe("Part 1 - Text:\n\nmy essay");
  });

  it("student is the argument verbatim, never a part's", () => {
    expect(mergeCompositeEntries([file, repo], "Ada Lovelace").student).toBe("Ada Lovelace");
  });

  it("mergedFileCount is the SUM of each part's own count (text 0 + file 1 + repo 3 = 4)", () => {
    expect(mergeCompositeEntries([text, file, repo], "Ada").mergedFileCount).toBe(4);
  });

  it("an all-text composite reports 0 files (no floor)", () => {
    expect(mergeCompositeEntries([text, entryOf("T2", "more", 0, [])], "Ada").mergedFileCount).toBe(0);
  });

  it("submittedFiles are unioned in part order and colliding names are de-duplicated", () => {
    const merged = mergeCompositeEntries([text, file, repo], "Ada");
    expect(merged.submittedFiles.map((f) => f.name)).toEqual(["report.txt", "a.ts", "report.txt (2)"]);
    expect(merged.submittedFiles[2].previewContent).toBe("p-report.txt");
  });

  it("leaves single-source provenance fields unset", () => {
    const withProvenance: StudentSubmissionEntry = { ...repo, gradedRepo: "o/r", gradedRef: "abc", submissionUrl: "u", userId: 1 };
    const merged = mergeCompositeEntries([withProvenance], "Ada");
    expect(merged.gradedRepo).toBeUndefined();
    expect(merged.gradedRef).toBeUndefined();
    expect(merged.submissionUrl).toBeUndefined();
    expect(merged.userId).toBeUndefined();
    expect(merged.codeRun).toBeUndefined();
  });
});

describe("extractSingleEntry", () => {
  const one = entryOf("A", "a", 1, []);

  it("admits an outcome with exactly one entry", () => {
    const got = extractSingleEntry({ kind: "entries", entries: [one], pointsPossible: 100 }, "Part 1");
    expect(got).toEqual({ ok: true, entry: one });
  });

  it("refuses zero entries, naming the part", () => {
    const got = extractSingleEntry({ kind: "entries", entries: [], pointsPossible: null }, "Part 2");
    expect(got).toEqual({ ok: false, reason: "Part 2 had nothing to grade." });
  });

  it("refuses more than one entry as a multi-student source", () => {
    const got = extractSingleEntry({ kind: "entries", entries: [one, entryOf("B", "b", 1, [])], pointsPossible: null }, "Part 3");
    expect(got.ok).toBe(false);
    if (!got.ok) {
      expect(got.reason).toContain("Part 3");
      expect(got.reason).toContain("more than one student");
    }
  });

  it("passes a refusal reason through verbatim", () => {
    expect(extractSingleEntry({ kind: "refused", reason: "nope" }, "Part 1")).toEqual({ ok: false, reason: "nope" });
  });
});
