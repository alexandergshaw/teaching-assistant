import { resetSessionDiagnosticLogForTests, readSessionDiagnosticLogState } from "@/lib/session-diagnostic-log";
import { describe, it, expect, vi } from "vitest";
import { handoffTemplate, SELECTED_TEMPLATE_KEY, recordPowerPointDiagnostic } from "./panel-logic";
describe("synchronous template selection handoff", () => {
  it("commits the JSON source identity before navigation and destination reopen", () => {
    const values = new Map<string, string>();
    const storage = { setItem: (key: string, value: string) => { values.set(key, value); } };
    const navigate = vi.fn(() => {
      expect(JSON.parse(values.get(SELECTED_TEMPLATE_KEY)!)).toBe("saved-original");
    });
    expect(handoffTemplate("saved-original", storage, navigate)).toEqual({ ok: true });
    expect(navigate).toHaveBeenCalledOnce();
    const reopenedDestinationSelectedId = JSON.parse(values.get("ta-ppt-template-file-id")!);
    expect(reopenedDestinationSelectedId).toBe("saved-original");
  });
  it("refuses navigation with stable retryable error when persistence throws", () => {
    const navigate = vi.fn();
    expect(handoffTemplate("id", { setItem: () => { throw new Error("private browser detail"); } }, navigate)).toEqual({
      code: "PPT_SELECTION", error: "Could not remember the selected template. Allow browser storage and retry.",
    });
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("template diagnostic privacy", () => {
  it("emits actual operation outcomes, duration and fixed codes without accepting content", () => {
    resetSessionDiagnosticLogForTests("2026-10-15T00:00:00.000Z");
    for (const operation of ["load", "analyze", "save", "reuse", "download"] as const) {
      recordPowerPointDiagnostic(operation, Date.now() - 12);
      recordPowerPointDiagnostic(operation, Date.now() - 10, { code: "PPT_STORAGE" });
    }
    const entries = readSessionDiagnosticLogState().entries;
    expect(entries).toHaveLength(10);
    for (const entry of entries) {
      expect(entry.surface).toBe("templates");
      expect(entry.durationMs).toBeGreaterThanOrEqual(10);
      expect(entry.institution).toBe(""); expect(entry.course).toBe("");
      if (entry.outcome === "failure") { expect(entry.code).toBe("PPT_STORAGE"); expect(entry.error).toBe("PPT_STORAGE"); }
      else expect(entry.error).toBe("");
    }
    expect(JSON.stringify(entries)).not.toMatch(/source.pptx|source text|field value|provider detail/);
  });
});