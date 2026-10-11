// VIDEO-GRADING W2 (ops T8, section 9): the prepare_video diagnostic. The class
// is TYPED, not parsed from text; the recorded `error` is exactly a member of
// VIDEO_FAILURE_CLASSES; and a PII canary pushed through every producer must
// never appear in what reaches the session log.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const recorded: unknown[] = [];
vi.mock("@/app/components/grading/gradingDiagnosticLog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/components/grading/gradingDiagnosticLog")>();
  return { ...actual, recordGradingDiagnosticEntry: (entry: unknown) => recorded.push(entry) };
});

import {
  decideVideoDiagnostic,
  fanOutVideoOutcomes,
  recordVideoSettled,
  recordZipVideoOutcomes,
} from "./videoDiagnostic";
import { VIDEO_FAILURE_CLASSES, parseVideoOutcomes, type VideoFailureClass } from "@/lib/grade/video-failure";
import { GRADING_DIAGNOSTIC_OPERATION_LABELS } from "@/app/components/grading/gradingDiagnosticLog";
import { classifyChatSeamFailure } from "./chatSeamDiagnostic";

const CANARIES = ["Jordan Lee walkthrough.mp4", "u1/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4", "files/abc123"];

beforeEach(() => {
  recorded.length = 0;
});

describe("decideVideoDiagnostic (pure)", () => {
  it("is null with no captured start", () => {
    expect(decideVideoDiagnostic({ startedAtMs: null, settledAtMs: 9, failure: null })).toBeNull();
    expect(decideVideoDiagnostic({ startedAtMs: null, settledAtMs: 9, failure: "too large" })).toBeNull();
  });

  it("success carries no error; duration is rounded and never negative", () => {
    expect(decideVideoDiagnostic({ startedAtMs: 100, settledAtMs: 104.4, failure: null })).toEqual({
      operation: "prepare_video",
      outcome: "success",
      durationMs: 4,
    });
    expect(decideVideoDiagnostic({ startedAtMs: 500, settledAtMs: 400, failure: null })?.durationMs).toBe(0);
  });

  it("every one of the 8 classes is recorded as exactly itself", () => {
    expect(VIDEO_FAILURE_CLASSES).toHaveLength(8);
    for (const failure of VIDEO_FAILURE_CLASSES) {
      expect(decideVideoDiagnostic({ startedAtMs: 0, settledAtMs: 5, failure })).toEqual({
        operation: "prepare_video",
        outcome: "failure",
        durationMs: 5,
        error: failure,
      });
    }
  });

  it("O-7: a size refusal is 'too large' because it is TYPED; the text classifier would have bucketed the same message 'cap exceeded'", () => {
    const message = "This video is 41.0MB, over the 40.0MB limit. Nothing was uploaded.";
    expect(classifyChatSeamFailure(message)).toBe("cap exceeded");
    expect(decideVideoDiagnostic({ startedAtMs: 0, settledAtMs: 1, failure: "too large" })?.error).toBe("too large");
  });

  it("T8: a non-class value smuggled through a cast is NOT recorded verbatim", () => {
    for (const canary of CANARIES) {
      const decision = decideVideoDiagnostic({ startedAtMs: 0, settledAtMs: 1, failure: canary as unknown as VideoFailureClass });
      expect(decision?.error).toBe("extraction failed");
      expect(JSON.stringify(decision)).not.toContain(canary);
    }
  });
});

describe("T8: the PII canary through every producer", () => {
  function assertClean() {
    const text = JSON.stringify(recorded);
    for (const canary of CANARIES) expect(text).not.toContain(canary);
    for (const entry of recorded as Array<{ operation: string; error?: string }>) {
      expect(entry.operation).toBe("prepare_video");
      if (entry.error !== undefined) expect((VIDEO_FAILURE_CLASSES as readonly string[]).includes(entry.error)).toBe(true);
    }
  }

  it("recordVideoSettled (loose)", () => {
    for (const failure of [null, ...VIDEO_FAILURE_CLASSES]) {
      recordVideoSettled({ startedAtMs: 0, settledAtMs: 3, failure: failure as VideoFailureClass | null });
    }
    recordVideoSettled({ startedAtMs: 0, settledAtMs: 3, failure: CANARIES[0] as unknown as VideoFailureClass });
    expect(recorded).toHaveLength(VIDEO_FAILURE_CLASSES.length + 2);
    assertClean();
  });

  it("recordZipVideoOutcomes (in-zip ledger) fans counts out to one entry per video", () => {
    const outcomes = { accepted: 2, failed: { "unsupported format": 1, "too many videos": 2 } } as const;
    expect(fanOutVideoOutcomes(outcomes, 40)).toHaveLength(5);
    const n = recordZipVideoOutcomes({ outcomes, startedAtMs: 10, settledAtMs: 50 });
    expect(n).toBe(5);
    expect((recorded as Array<{ outcome: string }>).filter((e) => e.outcome === "success")).toHaveLength(2);
    expect((recorded as Array<{ durationMs: number }>).every((e) => e.durationMs === 40)).toBe(true);
    assertClean();
  });

  it("a hostile wire ledger is coerced to counts: unknown class keys and names are dropped", () => {
    const hostile = parseVideoOutcomes({
      accepted: 1,
      failed: { "unsupported format": 1, [CANARIES[0]]: 7, [CANARIES[2]]: "x" },
      names: CANARIES,
    });
    expect(hostile).toEqual({ accepted: 1, failed: { "unsupported format": 1 } });
    recordZipVideoOutcomes({ outcomes: hostile, startedAtMs: 0, settledAtMs: 2 });
    assertClean();
  });

  it("no start captured records nothing", () => {
    expect(recordVideoSettled({ startedAtMs: null, settledAtMs: 1, failure: "too large" })).toBe(false);
    expect(recordZipVideoOutcomes({ outcomes: { accepted: 3, failed: {} }, startedAtMs: null, settledAtMs: 1 })).toBe(0);
    expect(recorded).toHaveLength(0);
  });
});

describe("the operation exists and the module stays browser-only", () => {
  it("prepare_video has a label", () => {
    expect(GRADING_DIAGNOSTIC_OPERATION_LABELS.prepare_video).toBe("Prepare video");
  });

  it("neither new server file imports the browser-only recorder", () => {
    for (const rel of [
      "src/app/api/grade-submission-video/route.ts",
      "src/app/api/grade-submission-zip/route.ts",
      "src/lib/grade/video-failure.ts",
      "src/lib/grade/video-prepare.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), rel), "utf8");
      expect(source).not.toContain("gradingDiagnosticLog");
      expect(source).not.toContain("videoDiagnostic");
    }
  });
});
