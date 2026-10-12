// CHAT-GRADING-DETAILED-DIAGNOSTICS WE: the pure intake helpers, the new detail
// builders' closed vocabularies, the recorders, and the AC-15 panel-gate wiring
// (source-text; no component renders under vitest).
import fs from "fs";
import path from "path";
import { describe, expect, it, beforeEach } from "vitest";
import { readSessionDiagnosticSurfaceEntries, resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";
import {
  describeIntakeGate,
  intakeExtBucket,
  intakeSignalsFor,
  intakeSizeKb,
  ledgerSignals,
  recordAdmitAnomaly,
  recordIntakeGate,
  recordPrepareDetail,
  recordSplitDecision,
  safeIntake,
} from "./chatIntakeDiagnostic";
import {
  buildAdmitSubmissionsDetail,
  buildPrepareSubmissionDetail,
  buildResolveRecordingSplitDetail,
} from "./chatGradeDetail";
import { chooseSingleFileTransport, chooseZipTransport } from "@/lib/grade/grading-zip-transport";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf-8");

beforeEach(() => resetSessionDiagnosticLogForTests("2026-10-08T10:00:00.000Z"));

describe("pure helpers", () => {
  it("buckets the extension from a closed list and never returns the name", () => {
    expect(intakeExtBucket({ name: "A.ZIP" })).toBe("zip");
    expect(intakeExtBucket({ name: "x.pdf" })).toBe("pdf");
    expect(intakeExtBucket({ name: "x.PNG" })).toBe("image");
    expect(intakeExtBucket({ name: "x.docx" })).toBe("text");
    expect(intakeExtBucket({ name: "ZZ_CANARY_NAME.weird" })).toBe("other");
    expect(intakeExtBucket({ name: "noext" })).toBe("other");
  });

  it("sizes in whole KB, rounded up, never negative or NaN", () => {
    expect(intakeSizeKb(1)).toBe(1);
    expect(intakeSizeKb(1024)).toBe(1);
    expect(intakeSizeKb(1025)).toBe(2);
    expect(intakeSizeKb(0)).toBe(0);
    expect(intakeSizeKb(Number.NaN)).toBe(0);
    expect(intakeSizeKb(-5)).toBe(0);
  });

  it("describes the gate for the real transport outputs (AC-15)", () => {
    const small = { name: "essay.docx", size: 200 * 1024 };
    expect(chooseSingleFileTransport(small).kind).toBe("body");
    expect(describeIntakeGate(small, "body")).toEqual({ transport: "body", sizeKb: 200, ext: "text" });

    const bigZip = { name: "class.zip", size: 60 * 1024 * 1024 };
    const zipChoice = chooseZipTransport(bigZip, true);
    expect(zipChoice.kind).toBe("storage");
    expect(describeIntakeGate(bigZip, "storage")).toEqual({ transport: "storage", sizeKb: 61440, ext: "zip" });

    const overLimit = { name: "huge.zip", size: 900 * 1024 * 1024 };
    expect(chooseZipTransport(overLimit, true).kind).toBe("refused");
    const refused = describeIntakeGate(overLimit, "refused");
    expect(refused).toEqual({ sizeKb: 921600, ext: "zip" });
    expect(refused).not.toHaveProperty("transport");
  });

  it("derives intake signals without any name or text", () => {
    const signals = intakeSignalsFor(
      { kind: "composite", student: "ZZ_CANARY_STUDENT", parts: [{ kind: "text", content: "ZZ_CANARY_TEXT" }] },
      { kind: "refused", reason: "ZZ_CANARY_REASON", refusalClass: "composite-parts" }
    );
    expect(signals).toEqual({ inputKind: "composite", stage: "prepare", parts: 1, refusal: "composite-parts" });
    expect(JSON.stringify(signals)).not.toContain("ZZ_CANARY");
    const urlSignals = intakeSignalsFor({ kind: "url", url: "https://ZZ_CANARY.example/x" }, { kind: "refused", reason: "r" });
    expect(urlSignals).toEqual({ inputKind: "url", stage: "prepare", urlKind: "other" });
  });

  it("counts a ledger and ignores its names", () => {
    const signals = ledgerSignals({
      studentsFound: 3,
      studentsEmitted: 2,
      skipped: [{ student: "ZZ_CANARY_STUDENT", reason: "r" }],
      failedSupportedFiles: [],
    });
    expect(signals).toEqual({ inputKind: "zip-storage", stage: "prepare", transport: "storage", found: 3, emitted: 2, skipped: 1, failedFiles: 0 });
  });
});

describe("detail builders stay closed-vocabulary", () => {
  it("drops a refusal that is not in the closed list", () => {
    expect(buildPrepareSubmissionDetail({ refusal: "no-file" })).toEqual({ refusal: "no-file" });
    expect(buildPrepareSubmissionDetail({ refusal: "ZZ_CANARY" as never })).toEqual({});
  });

  it("admit: counts plus a closed reason, hostile reason dropped", () => {
    expect(buildAdmitSubmissionsDetail({ requested: 5, admitted: 3, clipped: 2, skipped: 0, cap: 3, reason: "cap-clipped" })).toEqual({
      requested: 5, admitted: 3, clipped: 2, skipped: 0, cap: 3, reason: "cap-clipped",
    });
    expect(buildAdmitSubmissionsDetail({ requested: -1, reason: "ZZ_CANARY" as never })).toEqual({});
  });

  it("split: closed decision plus counts", () => {
    expect(buildResolveRecordingSplitDetail({ decision: "confirm", segments: 2, admitted: 2, clipped: 0 })).toEqual({
      decision: "confirm", segments: 2, admitted: 2, clipped: 0,
    });
    expect(buildResolveRecordingSplitDetail({ decision: "ZZ_CANARY" as never })).toEqual({});
  });
});

describe("recorders", () => {
  const entries = () => readSessionDiagnosticSurfaceEntries("grading").entries;

  it("recordPrepareDetail classifies the raw reason and never stores it", () => {
    recordPrepareDetail({ startedAtMs: 0, rawReason: "ZZ_CANARY collision in a.txt", signals: { inputKind: "file", stage: "prepare" } });
    const [entry] = entries();
    expect(entry.operation).toBe("prepare_submission");
    expect(entry.error).toBe("name collision");
    expect(JSON.stringify(entries())).not.toContain("ZZ_CANARY");
  });

  it("recordPrepareDetail with no start captured records nothing", () => {
    recordPrepareDetail({ startedAtMs: null, rawReason: null, signals: {} });
    expect(entries()).toHaveLength(0);
  });

  it("recordIntakeGate writes the transport, size bucket and extension, never the name", () => {
    recordIntakeGate({ stage: "gate", file: { name: "ZZ_CANARY_FILE.zip", size: 900 * 1024 * 1024 }, transport: "refused", rawReason: "This zip is over the limit" });
    const [entry] = entries();
    expect(entry.outcome).toBe("failure");
    expect(entry.detail).toEqual({ inputKind: "file", stage: "gate", sizeKb: 921600, ext: "zip" });
    expect(JSON.stringify(entries())).not.toContain("ZZ_CANARY");
  });

  it("anomaly recorders write their own operations", () => {
    recordAdmitAnomaly({ failureClass: "cap exceeded", signals: { requested: 1, admitted: 0, clipped: 1, cap: 40, reason: "cap-reached" } });
    recordSplitDecision({ decision: "reject", segments: 3, admitted: 1, clipped: 0 });
    expect(entries().map((e) => e.operation)).toEqual(["admit_submissions", "resolve_recording_split"]);
    expect(entries()[0].label).toBe("Admit submissions");
  });

  it("safeIntake swallows a throw", () => {
    expect(() => safeIntake(() => { throw new Error("boom"); })).not.toThrow();
  });
});

describe("source pins", () => {
  it("the leaf is browser-only: no server path imports it", () => {
    const leaf = "chatIntakeDiagnostic";
    for (const rel of ["src/app/actions/grading-chat-intake.ts", "src/app/api/grade-run-item/route.ts", "src/app/components/grading-chat/chatSubmissionIntake.ts"]) {
      expect(read(rel)).not.toContain(leaf);
    }
  });

  it("the panel records each gate branch inside safeIntake (AC-15)", () => {
    const src = read("src/app/components/grading-chat/GradingChatPanel.tsx");
    expect(src).toContain('safeIntake(() => recordIntakeGate({ stage: "gate", file, transport: "refused"');
    expect(src).toContain('safeIntake(() => recordIntakeGate({ stage: "gate", file, transport: "body"');
    expect(src).toContain('safeIntake(() => recordIntakeGate({ stage: "upload", file, transport: "storage"');
  });

  it("the hook wraps every intake record in safeDiagnostic", () => {
    const src = read("src/app/components/grading-chat/useContinuousGradingRun.ts");
    for (const fn of ["recordPrepareDetail", "recordAdmitAnomaly", "recordSplitDecision"]) {
      const calls = [...src.matchAll(new RegExp(`${fn}\\(`, "g"))].length;
      const guarded = [...src.matchAll(new RegExp(`safeDiagnostic\\(\\(\\) =>\\s*${fn}\\(`, "g"))].length;
      expect(calls).toBeGreaterThan(0);
      expect(guarded).toBe(calls);
    }
  });

  it("no string-typed parameter was added to the detail builders", () => {
    const src = read("src/app/components/grading-chat/chatGradeDetail.ts");
    expect([...src.matchAll(/^\s+(\w+)\?: string;/gm)].map((m) => m[1])).toEqual(["rubricFp", "rubricFp"]);
  });
});
