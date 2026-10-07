import { describe, it, expect } from "vitest";
import { mintManualGradingRow } from "./grading-rows";
import { advanceGradingCapture, type TrackedSubmission } from "./grading-capture-sync";
import { seedTrackedFromRows } from "./grading-capture-tombstones";
import type { GradingRow } from "./grading-row";
import type { ExtractedSubmission } from "./grading-submission-merge";

function sub(name: string, text: string): ExtractedSubmission {
  return { name, text, suggestedSubmissionKind: "unknown", submissionKindCue: "" };
}

function counterMint(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${(n += 1)}`;
}

describe("mintManualGradingRow", () => {
  it("trims, starts pending and ungraded, and is unconfirmed", () => {
    const row = mintManualGradingRow("m1", "  Ada Lovelace ", "  my post  ");
    expect(row.studentName).toBe("Ada Lovelace");
    expect(row.submissionText).toBe("my post");
    expect(row.state).toBe("pending");
    expect(row.userEdited).toBe(false);
    expect(row.rubricAreas).toEqual([]);
    expect(row.submissionKind).toBe("unknown");
    expect(row.totalScore).toBe("");
  });
});

describe("a manual row survives capture merges (grading-capture-sync.ts preserved branch)", () => {
  it("is still present and unchanged after an advance whose accumulator never saw it", () => {
    const manual = mintManualGradingRow("manual-1", "Grace Hopper", "the missed post");
    const tracked: TrackedSubmission[] = [];
    const mint = counterMint("auto");

    const first = advanceGradingCapture(tracked, [manual], [sub("Alan Turing", "captured post")], mint);
    expect(first.rows.find((r) => r.id === "manual-1")).toEqual(manual);
    expect(first.rows).toHaveLength(2);

    // A second batch extending the SAME captured post still leaves it alone.
    const second = advanceGradingCapture(first.tracked, first.rows, [sub("Alan Turing", "captured post, continued")], mint);
    const survivor = second.rows.find((r) => r.id === "manual-1");
    expect(survivor).toEqual(manual);
    expect(second.divergentRowIds).toEqual([]);
  });

  it("keeps instructor edits made to the manual row between merges", () => {
    const manual = mintManualGradingRow("manual-2", "Grace Hopper", "text");
    const edited: GradingRow = { ...manual, strengths: "clear", userEdited: true };
    const out = advanceGradingCapture([], [edited], [sub("Someone", "else")], counterMint("a"));
    expect(out.rows.find((r) => r.id === "manual-2")).toEqual(edited);
  });

  it("after a reload the seeded accumulator owns it, and a later unrelated batch still leaves it unchanged", () => {
    const manual = mintManualGradingRow("manual-3", "Grace Hopper", "the missed post");
    const seeded = seedTrackedFromRows([manual], [], undefined, counterMint("seed"));
    const out = advanceGradingCapture(seeded, [manual], [sub("Alan Turing", "unrelated")], counterMint("a"));
    expect(out.rows.find((r) => r.id === "manual-3")).toEqual(manual);
  });
});
