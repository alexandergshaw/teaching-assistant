import { describe, it, expect } from "vitest";
import type { StudentSubmissionEntry } from "@/lib/grade";
import { runCheck } from "./checks";
import type { RubricCheck } from "./types";

function entry(content: string, extensions: string[] = []): StudentSubmissionEntry {
  return {
    student: "Test Student",
    content,
    mergedFileCount: 1,
    submittedFiles: extensions.map((extension) => ({
      name: `file.${extension}`,
      extension,
      previewContent: "",
      previewTruncated: false,
    })),
  };
}

const check = (partial: Partial<RubricCheck>): RubricCheck => ({
  id: "c1",
  criterion: "Criterion",
  checkType: "keyword",
  target: "",
  points: 10,
  ...partial,
});

describe("runCheck: keyword", () => {
  it("passes (full points) when the term appears", () => {
    const out = runCheck(check({ checkType: "keyword", target: "normalization" }), entry("we applied normalization"));
    expect(out.passed).toBe(true);
    expect(out.earned).toBe(10);
    expect(out.detail).toContain("found the required term");
  });

  it("fails (zero) when the term is absent", () => {
    const out = runCheck(check({ checkType: "keyword", target: "normalization" }), entry("nothing relevant"));
    expect(out.passed).toBe(false);
    expect(out.earned).toBe(0);
  });

  it("is case-insensitive and counts occurrences", () => {
    const out = runCheck(check({ checkType: "keyword", target: "loop" }), entry("Loop then loop again"));
    expect(out.passed).toBe(true);
    expect(out.detail).toContain("2 mentions");
  });

  it("matches single words on boundaries (no 'art' inside 'start')", () => {
    expect(runCheck(check({ checkType: "keyword", target: "art" }), entry("we will start now")).passed).toBe(false);
    expect(runCheck(check({ checkType: "keyword", target: "art" }), entry("modern art today")).passed).toBe(true);
  });

  it("still substring-matches multi-word phrases", () => {
    expect(
      runCheck(check({ checkType: "keyword", target: "machine learning" }), entry("a machine learning model")).passed
    ).toBe(true);
  });
});

describe("runCheck: all_keywords / any_keywords", () => {
  it("all_keywords awards proportional partial credit", () => {
    const out = runCheck(
      check({ checkType: "all_keywords", terms: ["alpha", "bravo", "charlie", "delta"], points: 8 }),
      entry("alpha and bravo only")
    );
    expect(out.passed).toBe(false);
    expect(out.earned).toBe(4); // 2 of 4 present -> 0.5 * 8
    expect(out.detail).toContain("not found");
  });

  it("all_keywords passes when every term is present", () => {
    const out = runCheck(check({ checkType: "all_keywords", terms: ["x", "y"] }), entry("x and y"));
    expect(out.passed).toBe(true);
    expect(out.earned).toBe(10);
  });

  it("any_keywords passes when at least one term is present", () => {
    const out = runCheck(check({ checkType: "any_keywords", terms: ["alpha", "beta"] }), entry("just beta"));
    expect(out.passed).toBe(true);
  });
});

describe("runCheck: min_words", () => {
  it("fails on short submissions", () => {
    expect(runCheck(check({ checkType: "min_words", count: 300 }), entry("too short")).passed).toBe(false);
  });

  it("passes when the threshold is met", () => {
    const long = Array(350).fill("word").join(" ");
    expect(runCheck(check({ checkType: "min_words", count: 300 }), entry(long)).passed).toBe(true);
  });
});

describe("runCheck: file checks", () => {
  it("file_type passes when the extension is submitted", () => {
    expect(runCheck(check({ checkType: "file_type", target: "pdf" }), entry("x", ["pdf"])).passed).toBe(true);
  });

  it("file_type fails and lists what was received", () => {
    const out = runCheck(check({ checkType: "file_type", target: "pdf" }), entry("x", ["docx"]));
    expect(out.passed).toBe(false);
    expect(out.detail).toContain(".docx");
  });

  it("min_file_count compares against the threshold", () => {
    expect(runCheck(check({ checkType: "min_file_count", count: 2 }), entry("x", ["py", "txt"])).passed).toBe(true);
    expect(runCheck(check({ checkType: "min_file_count", count: 2 }), entry("x", ["py"])).passed).toBe(false);
  });
});

describe("runCheck: regex and code_symbol", () => {
  it("regex matches the submission text", () => {
    expect(runCheck(check({ checkType: "regex", pattern: "\\bSELECT\\b" }), entry("select * from t")).passed).toBe(true);
  });

  it("regex with an invalid pattern fails safely", () => {
    const out = runCheck(check({ checkType: "regex", pattern: "(" }), entry("anything"));
    expect(out.passed).toBe(false);
  });

  it("code_symbol finds a python def", () => {
    expect(runCheck(check({ checkType: "code_symbol", target: "clean_data" }), entry("def clean_data(df):")).passed).toBe(true);
  });

  it("code_symbol finds a js function and a class", () => {
    expect(runCheck(check({ checkType: "code_symbol", target: "render" }), entry("function render() {}")).passed).toBe(true);
    expect(runCheck(check({ checkType: "code_symbol", target: "Animal" }), entry("class Animal {}")).passed).toBe(true);
  });

  it("code_symbol fails when the symbol is only mentioned, not defined", () => {
    expect(runCheck(check({ checkType: "code_symbol", target: "clean_data" }), entry("call clean_data soon")).passed).toBe(false);
  });
});
