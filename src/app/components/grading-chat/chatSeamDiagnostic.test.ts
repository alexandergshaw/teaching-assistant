import { beforeEach, describe, expect, it } from "vitest";
import { readSessionDiagnosticSurfaceEntries, resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";
import {
  CHAT_SEAM_FAILURE_CLASSES,
  classifyChatSeamFailure,
  decideChatSeamDiagnostic,
  recordChatSeamSettled,
} from "./chatSeamDiagnostic";

beforeEach(() => {
  resetSessionDiagnosticLogForTests("2026-10-08T10:00:00.000Z");
});

describe("classifyChatSeamFailure (pure)", () => {
  it("maps the collision refusal (which embeds names and paths) to a fixed class", () => {
    const raw =
      'Refused: 2 files in folder "Smith_Jane" resolve to the same student name "Jane Smith", so they would have been graded together as one row: a/b.txt, c/d.txt.';
    expect(classifyChatSeamFailure(raw)).toBe("name collision");
  });

  it("maps cap, timeout, size, unsupported, unreadable and unknown text", () => {
    expect(classifyChatSeamFailure("This session has reached its 40-submission limit.")).toBe("cap exceeded");
    expect(classifyChatSeamFailure(new Error("Request timed out"))).toBe("timed out");
    expect(classifyChatSeamFailure("This file is too large to upload.")).toBe("too large");
    expect(classifyChatSeamFailure("This file type isn't supported for grading.")).toBe("unsupported");
    expect(classifyChatSeamFailure("This file could not be read.")).toBe("unreadable");
    expect(classifyChatSeamFailure("anything else for Alice Jones")).toBe("refused");
    expect(classifyChatSeamFailure(undefined)).toBe("refused");
  });

  it("only ever returns a member of the fixed set, never the input", () => {
    for (const raw of ["Alice Jones /tmp/alice.zip", "same student name Alice", new Error("boom Alice")]) {
      const out = classifyChatSeamFailure(raw);
      expect(CHAT_SEAM_FAILURE_CLASSES).toContain(out);
      expect(out).not.toContain("Alice");
    }
  });
});

describe("decideChatSeamDiagnostic (pure)", () => {
  it("returns null with no captured start", () => {
    expect(
      decideChatSeamDiagnostic({ operation: "grade_item", startedAtMs: null, settledAtMs: 10, failureClass: null })
    ).toBeNull();
  });

  it("success carries a rounded, non-negative duration and no error", () => {
    expect(
      decideChatSeamDiagnostic({ operation: "resolve_header", startedAtMs: 100, settledAtMs: 350.6, failureClass: null })
    ).toEqual({ operation: "resolve_header", outcome: "success", durationMs: 251 });
    expect(
      decideChatSeamDiagnostic({ operation: "grade_item", startedAtMs: 500, settledAtMs: 400, failureClass: null })?.durationMs
    ).toBe(0);
  });

  it("failure carries the fixed class", () => {
    expect(
      decideChatSeamDiagnostic({ operation: "prepare_submission", startedAtMs: 0, settledAtMs: 40, failureClass: "name collision" })
    ).toEqual({ operation: "prepare_submission", outcome: "failure", durationMs: 40, error: "name collision" });
  });
});

describe("recordChatSeamSettled (wrapper call shape)", () => {
  it("records on the grading surface with a numeric durationMs and the fixed class", () => {
    const recorded = recordChatSeamSettled({
      operation: "prepare_submission",
      startedAtMs: performance.now(),
      failureClass: classifyChatSeamFailure('resolve to the same student name "Jane Smith"'),
    });
    expect(recorded).toBe(true);
    const { entries } = readSessionDiagnosticSurfaceEntries("grading");
    expect(entries).toHaveLength(1);
    expect(entries[0].surface).toBe("grading");
    expect(entries[0].operation).toBe("prepare_submission");
    expect(entries[0].outcome).toBe("failure");
    expect(entries[0].error).toBe("name collision");
    expect(typeof entries[0].durationMs).toBe("number");
    expect(JSON.stringify(entries)).not.toContain("Jane");
  });

  it("records nothing with no start", () => {
    expect(recordChatSeamSettled({ operation: "grade_item", startedAtMs: null, failureClass: null })).toBe(false);
    expect(readSessionDiagnosticSurfaceEntries("grading").entries).toHaveLength(0);
  });
});
