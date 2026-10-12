import { beforeEach, describe, expect, it } from "vitest";

import {
  buildSessionDiagnosticLog,
  formatSessionDiagnosticLogCsv,
  formatSessionDiagnosticLogJson,
  parseSessionDiagnosticLogEntries,
  readSessionDiagnosticLogState,
  recordSessionDiagnosticEntry,
  resetSessionDiagnosticLogForTests,
  MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES,
  type SessionDiagnosticEntry,
} from "./session-diagnostic-log";

const CONTEXT = { currentInstitution: "acme", currentCourse: "c", currentPage: "/p", browser: "T/1" };

beforeEach(() => {
  resetSessionDiagnosticLogForTests("2026-10-12T09:00:00.000Z");
});

function record(detail?: Record<string, unknown>, extra?: { operation?: string }): SessionDiagnosticEntry {
  recordSessionDiagnosticEntry({
    at: "2026-10-12T10:00:00.000Z",
    surface: "grading",
    operation: extra?.operation ?? "grade_item",
    outcome: "success",
    ...(detail !== undefined ? { detail: detail as Record<string, number | boolean | string> } : {}),
  });
  const entries = readSessionDiagnosticLogState().entries;
  return entries[entries.length - 1];
}

describe("session log detail: core backstop (AC-6)", () => {
  it("stores a valid bag intact", () => {
    expect(record({ item: 3, trigger: "retry", truncated: false, model: "gemini-2.5-flash" }).detail).toEqual({
      item: 3,
      trigger: "retry",
      truncated: false,
      model: "gemini-2.5-flash",
    });
  });

  it("drops bad keys, bad strings and non-finite numbers; rounds fractions", () => {
    const d = record({
      "Bad Key": 1,
      "a-b": 2,
      name: "Ada Lovelace",
      pair: "x=1;y",
      inf: Infinity,
      nan: Number.NaN,
      huge: 1e13,
      rounded: 12.7,
      ok: "fine",
    }).detail;
    expect(d).toEqual({ ok: "fine", rounded: 13 });
  });

  it("keeps 40 of 41 valid pairs in sorted-key order", () => {
    const bag: Record<string, number> = {};
    for (let i = 0; i < 41; i += 1) bag[`k${String(i).padStart(2, "0")}`] = i;
    const d = record(bag).detail as Record<string, number>;
    expect(Object.keys(d)).toHaveLength(40);
    expect(Object.keys(d)[0]).toBe("k00");
    expect("k40" in d).toBe(false);
  });

  it("omits the key entirely when empty after scrub or when not supplied", () => {
    expect(Object.keys(record({ "Bad Key": "Ada Lovelace" }))).not.toContain("detail");
    expect(Object.keys(record())).not.toContain("detail");
    expect(Object.keys(record({}))).not.toContain("detail");
  });

  it("rejects non-object bags", () => {
    expect(Object.keys(record(["a"] as unknown as Record<string, unknown>))).not.toContain("detail");
  });
});

describe("session log detail: export and old-export compatibility (AC-7)", () => {
  it("CSV header ends with Server (ms),Detail and every row has the header's cell count", () => {
    record({ item: 1, trigger: "first" });
    record();
    const log = buildSessionDiagnosticLog(readSessionDiagnosticLogState(), CONTEXT, "2026-10-12T12:00:00.000Z");
    const lines = formatSessionDiagnosticLogCsv(log).split("\r\n");
    const h = lines.findIndex((l) => l.startsWith("At,"));
    expect(lines[h].endsWith("Students,Host,Cause,Code,Server (ms),Detail")).toBe(true);
    const cells = (l: string): number => l.split(",").length;
    expect(cells(lines[h + 1])).toBe(cells(lines[h]));
    expect(cells(lines[h + 2])).toBe(cells(lines[h]));
    expect(lines[h + 1].endsWith(",item=1;trigger=first")).toBe(true);
    expect(lines[h + 2].endsWith(",,,,,,,")).toBe(true);
  });

  it("detail cell is sorted and never starts with a formula prefix", () => {
    record({ zeta: 1, alpha: true });
    const log = buildSessionDiagnosticLog(readSessionDiagnosticLogState(), CONTEXT, "g");
    const lines = formatSessionDiagnosticLogCsv(log).split("\r\n");
    const row = lines[lines.findIndex((l) => l.startsWith("At,")) + 1];
    const cell = row.slice(row.lastIndexOf(",") + 1);
    expect(cell).toBe("alpha=true;zeta=1");
    expect(/^[=+\-@]/.test(cell)).toBe(false);
  });

  it("JSON round-trips equal", () => {
    record({ item: 2, failure: "model-quota" });
    record();
    const state = readSessionDiagnosticLogState();
    const log = buildSessionDiagnosticLog(state, CONTEXT, "g");
    const reparsed = parseSessionDiagnosticLogEntries(JSON.parse(formatSessionDiagnosticLogJson(log)).entries);
    expect(reparsed).toEqual([...state.entries]);
    expect("detail" in reparsed[1]).toBe(false);
  });

  it("a frozen old export without detail parses to entries lacking the key", () => {
    const old = [
      {
        at: "2026-09-07T10:00:00.000Z",
        surface: "grading",
        operation: "grade_item",
        label: "Grade item",
        institution: "",
        course: "",
        outcome: "success",
        error: "",
        durationMs: 5,
        serverMs: 7,
      },
    ];
    const parsed = parseSessionDiagnosticLogEntries(old);
    expect(parsed).toEqual(old);
    expect(Object.keys(parsed[0])).not.toContain("detail");
  });

  it("a hand-edited export cannot smuggle bad pairs in", () => {
    const parsed = parseSessionDiagnosticLogEntries([
      {
        at: "a",
        surface: "grading",
        operation: "o",
        label: "l",
        institution: "",
        course: "",
        outcome: "success",
        error: "",
        detail: { "A b": 1, ok: "Ada Lovelace" },
      },
    ]);
    expect(parsed).toHaveLength(1);
    expect(Object.keys(parsed[0])).not.toContain("detail");
  });
});

describe("session log detail: enrich, do not multiply (AC-22)", () => {
  it("a detail-bearing record is exactly one entry and the cap accounting is unchanged", () => {
    for (let i = 0; i < 3; i += 1) record({ item: i });
    expect(readSessionDiagnosticLogState().entries).toHaveLength(3);
    for (let i = 0; i < MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES; i += 1) record({ item: i });
    const s = readSessionDiagnosticLogState();
    expect(s.entries).toHaveLength(MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES);
    expect(s.droppedCount).toBe(3);
  });
});
