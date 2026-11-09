import { beforeEach, describe, expect, it } from "vitest";
import { buildSessionDiagnosticLog, formatSessionDiagnosticLogCsv, formatSessionDiagnosticLogJson, readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";
import { mediaCategory, recordTakeDiagnostic, type TakeDiagnosticOperation } from "./take-announcement-diagnostics";

beforeEach(() => resetSessionDiagnosticLogForTests("2026-01-01T00:00:00.000Z"));

describe("recording announcement diagnostics", () => {
  it("records every operation with success and failure in both exports without private text", () => {
    const operations: TakeDiagnosticOperation[] = ["example_list", "example_add", "example_select", "example_remove", "draft", "regenerate", "edit_save", "source_response", "download_dispatch", "post"];
    for (const operation of operations) {
      recordTakeDiagnostic(operation, true, Date.now(), { hasExample: true, exampleCount: 50000 });
      recordTakeDiagnostic(operation, false, Date.now(), { delivery: "uncertain", raw: "SECRET" } as never);
    }
    const state = readSessionDiagnosticLogState();
    expect(state.entries).toHaveLength(20);
    expect(state.entries[0].detail?.exampleCount).toBe(10000);
    expect(state.entries[1].detail).toEqual({ delivery: "uncertain" });
    expect(state.entries[1].error).toBe("Announcement operation failed.");
    const log = buildSessionDiagnosticLog(state, { currentInstitution: "", currentCourse: "", currentPage: "", browser: "" }, "2026-01-01T00:00:01.000Z");
    for (const output of [formatSessionDiagnosticLogCsv(log), formatSessionDiagnosticLogJson(log)]) {
      expect(output).toContain("Recording-based Announcements");
      expect(output).toContain("Recording announcement post");
      expect(output).not.toContain("SECRET");
    }
  });
  it("uses fixed media categories", () => {
    expect(mediaCategory("audio/wav")).toBe("audio");
    expect(mediaCategory("video/mp4")).toBe("video");
    expect(mediaCategory("private filename")).toBe("other");
  });
});
