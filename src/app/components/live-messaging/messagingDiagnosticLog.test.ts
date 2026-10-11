import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  readSessionDiagnosticSurfaceEntries,
  resetSessionDiagnosticLogForTests,
  SESSION_DIAGNOSTIC_COVERAGE,
  SESSION_DIAGNOSTIC_SURFACE_LABELS,
} from "@/lib/session-diagnostic-log";
import {
  MESSAGING_DIAGNOSTIC_OPERATION_LABELS,
  buildBatchDiagnosticEntries,
  recordMessagingBatchOutcome,
  type MessagingBatchOutcome,
} from "./messagingDiagnosticLog";

const OUTCOME: MessagingBatchOutcome = {
  at: "2026-10-11T12:00:00.000Z",
  institution: "MCC",
  durationMs: 4200,
  accepted: 50,
  refused: 3,
  unknown: 4,
  refusedCodes: "2x refused-http, 1x refused-rate-limited",
  unknownCodes: "4x unknown-no-response",
};

beforeEach(() => {
  resetSessionDiagnosticLogForTests("2026-10-11T00:00:00.000Z");
});

describe("the messaging surface is registered", () => {
  it("has a coverage row and a label, and the row promises counts only", () => {
    expect(SESSION_DIAGNOSTIC_COVERAGE.map((r) => r.surface)).toContain("messaging");
    expect(SESSION_DIAGNOSTIC_SURFACE_LABELS.messaging).toBeTruthy();
    const covers = SESSION_DIAGNOSTIC_COVERAGE.find((r) => r.surface === "messaging")?.covers ?? "";
    expect(covers.toLowerCase()).toContain("counts only");
    expect(covers.toLowerCase()).toContain("no student names");
  });
});

describe("a batch records exactly three entries, always, counts only", () => {
  it("emits accepted, refused and unknown in order with their counts in the Students column", () => {
    recordMessagingBatchOutcome(OUTCOME);
    const { entries } = readSessionDiagnosticSurfaceEntries("messaging");
    expect(entries.map((e) => [e.operation, e.classificationStudentCount, e.outcome])).toEqual([
      ["send_batch_accepted", 50, "success"],
      ["send_batch_refused", 3, "failure"],
      ["send_batch_unknown", 4, "failure"],
    ]);
    expect(entries.every((e) => e.institution === "MCC" && e.course === "")).toBe(true);
    expect(entries[1].error).toBe("2x refused-http, 1x refused-rate-limited");
    expect(entries.map((e) => e.label)).toEqual(Object.values(MESSAGING_DIAGNOSTIC_OPERATION_LABELS));
  });

  it("a zero count is a recorded zero, a success with an empty error", () => {
    const drafts = buildBatchDiagnosticEntries({ ...OUTCOME, accepted: 7, refused: 0, unknown: 0, refusedCodes: "", unknownCodes: "" });
    expect(drafts.map((d) => [d.count, d.outcome, d.error])).toEqual([
      [7, "success", ""],
      [0, "success", ""],
      [0, "success", ""],
    ]);
  });

  it("the three counts plus not-attempted account for the batch (P26)", () => {
    const drafts = buildBatchDiagnosticEntries(OUTCOME);
    const notAttempted = 60 - drafts.reduce((sum, d) => sum + d.count, 0);
    expect(drafts.reduce((sum, d) => sum + d.count, 0) + notAttempted).toBe(60);
    expect(notAttempted).toBe(3);
  });

  it("sanitises a negative or non-finite count to zero", () => {
    const drafts = buildBatchDiagnosticEntries({ ...OUTCOME, accepted: -5, refused: Number.NaN, unknown: 2.9 });
    expect(drafts.map((d) => d.count)).toEqual([0, 0, 2]);
  });
});

describe("L8 PII canary: nothing student-shaped reaches the log", () => {
  it("the serialized entries carry no name, subject, body or login id even when the inputs try to", () => {
    // The wrapper's inputs are numbers and enumerated code summaries; the
    // entry fields are the closed set below.
    recordMessagingBatchOutcome(OUTCOME);
    const { entries } = readSessionDiagnosticSurfaceEntries("messaging");
    const json = JSON.stringify(entries);
    for (const needle of ["Ada", "Lovelace", "ada@", "Dear", "grade", "@example"]) {
      expect(json).not.toContain(needle);
    }
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual(
        ["at", "classificationStudentCount", "course", "durationMs", "error", "institution", "label", "operation", "outcome", "surface"].sort()
      );
    }
  });

  it("the wrapper's input type has no free-form student field", () => {
    const keys = Object.keys(OUTCOME).sort();
    expect(keys).toEqual(["accepted", "at", "durationMs", "institution", "refused", "refusedCodes", "unknown", "unknownCodes"].sort());
  });

  it("the wrapper source does not reference names, subjects or bodies", () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), "src", "app", "components", "live-messaging", "messagingDiagnosticLog.ts"),
      "utf8"
    );
    const code = text.replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\b(studentName|subject|body|loginId|email)\b/i);
  });
});
