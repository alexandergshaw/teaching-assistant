import { describe, expect, it } from "vitest";
import type { GradeResult, LinkFetchOutcome } from "@/lib/grade/types";
import type { IngestLedger } from "@/lib/grade/ndjson-ingest-parser";
import { buildLedgerView, describeBulkProgress, mergeIngestLedgers } from "./ingestLedger";

function row(student: string, linkFetch?: LinkFetchOutcome): GradeResult {
  return {
    student,
    overallComment: "",
    strengths: "",
    improvements: "",
    resubmitNotice: "",
    rubricAreas: [],
    totalScore: "",
    feedback: "",
    mergedFileCount: 1,
    submittedFiles: [],
    ...(linkFetch !== undefined ? { linkFetch } : {}),
  };
}

const ledger: IngestLedger = {
  studentsFound: 5,
  studentsEmitted: 4,
  skipped: [{ student: "Big", reason: "too large" }],
  failedSupportedFiles: ["a/broken.docx", "b/bad.pdf"],
};

describe("buildLedgerView (I-ledger-map)", () => {
  const results = [row("Ann"), row("Bo", "failed"), row("Cy", "flagged"), row("Di", "ok")];
  const view = buildLedgerView(results, ledger);

  it("names skipped students with their reason", () => {
    expect(view.skipped).toEqual([{ student: "Big", reason: "too large" }]);
  });

  it("derives link-not-fetched from result.linkFetch (failed and flagged only)", () => {
    expect(view.linkNotFetched).toEqual([{ student: "Bo" }, { student: "Cy" }]);
  });

  it("keeps failed files as a per-file list and out of the student accounting", () => {
    expect(view.failedFiles).toEqual(["a/broken.docx", "b/bad.pdf"]);
    expect(view.accountedFor).toBe(true);
  });

  it("flags an unaccounted student", () => {
    expect(buildLedgerView(results, { ...ledger, studentsEmitted: 3 }).accountedFor).toBe(false);
  });

  it("a failed file alone shows the ledger but drops no student", () => {
    const v = buildLedgerView([row("Ann")], { studentsFound: 1, studentsEmitted: 1, skipped: [], failedSupportedFiles: ["x.pdf"] });
    expect(v.hasAny).toBe(true);
    expect(v.skipped).toEqual([]);
    expect(v.linkNotFetched).toEqual([]);
    expect(v.accountedFor).toBe(true);
  });

  it("is empty with no ledger and clean rows", () => {
    expect(buildLedgerView([row("Ann")], null).hasAny).toBe(false);
  });
});

describe("mergeIngestLedgers", () => {
  it("accumulates a second zip without erasing the first", () => {
    const merged = mergeIngestLedgers(ledger, { studentsFound: 2, studentsEmitted: 2, skipped: [], failedSupportedFiles: ["c.pdf"] });
    expect(merged.studentsFound).toBe(7);
    expect(merged.skipped).toHaveLength(1);
    expect(merged.failedSupportedFiles).toEqual(["a/broken.docx", "b/bad.pdf", "c.pdf"]);
  });
});

describe("describeBulkProgress (I-progress-text)", () => {
  it("words each phase", () => {
    expect(describeBulkProgress({ phase: "uploading", dispatchedCount: 0, completedCount: 0 })).toBe("Uploading zip...");
    expect(describeBulkProgress({ phase: "preparing", dispatchedCount: 0, completedCount: 0 })).toBe("Preparing students...");
    expect(describeBulkProgress({ phase: "grading", dispatchedCount: 26, completedCount: 10 })).toBe("16 of 26 students still grading");
  });

  it("is blank when idle or nothing is outstanding", () => {
    expect(describeBulkProgress({ phase: "idle", dispatchedCount: 3, completedCount: 0 })).toBe("");
    expect(describeBulkProgress({ phase: "grading", dispatchedCount: 3, completedCount: 3 })).toBe("");
  });
});
