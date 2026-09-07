import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES,
  SESSION_DIAGNOSTIC_COVERAGE,
  SESSION_DIAGNOSTIC_NOT_COVERED,
  SESSION_DIAGNOSTIC_SURFACE_LABELS,
  buildSessionDiagnosticLog,
  formatSessionDiagnosticLogCsv,
  formatSessionDiagnosticLogJson,
  parseSessionDiagnosticLogEntries,
  readSessionDiagnosticLogState,
  readSessionDiagnosticSurfaceEntries,
  recentSessionDiagnosticEntries,
  recordSessionDiagnosticEntry,
  resetSessionDiagnosticLogForTests,
  sanitizeSessionDiagnosticError,
  sessionDiagnosticCoverageLine,
  sessionDiagnosticLogFileName,
  sessionDiagnosticLogSummaryLine,
  sessionDiagnosticRecordingStartedAt,
  summarizeSessionDiagnosticLog,
} from "./session-diagnostic-log";

const STARTED_AT = "2026-09-07T09:00:00.000Z";

// The store is module-scope by design (see the module header), so every test
// starts from a known, empty one. Vitest isolates test FILES from each other,
// so this file's store is not the content-tab test file's store.
beforeEach(() => {
  resetSessionDiagnosticLogForTests(STARTED_AT);
});

const CONTEXT = {
  currentInstitution: "acme",
  currentCourse: "/courses/123",
  currentPage: "/account/diagnostics",
  browser: "TestAgent/1.0",
};

describe("sessionDiagnosticLog: recording and ordering across surfaces", () => {
  it("records entries in the order they were reported, from more than one surface", () => {
    recordSessionDiagnosticEntry({
      at: "2026-09-07T10:00:01.000Z",
      surface: "lms-content",
      operation: "list_courses",
      label: "List courses",
      institution: "acme",
      outcome: "success",
    });
    recordSessionDiagnosticEntry({
      at: "2026-09-07T10:00:02.000Z",
      surface: "diagnostics",
      operation: "list_migrations",
      label: "List Canvas import jobs",
      institution: "acme",
      course: "/courses/123",
      outcome: "failure",
      error: "Canvas returned 401 for this course.",
    });
    recordSessionDiagnosticEntry({
      at: "2026-09-07T10:00:03.000Z",
      surface: "lms-content",
      operation: "load_course_content",
      label: "Load course content",
      institution: "acme",
      course: "/courses/123",
      outcome: "success",
    });

    const state = readSessionDiagnosticLogState();
    expect(state.entries.map((e) => e.operation)).toEqual([
      "list_courses",
      "list_migrations",
      "load_course_content",
    ]);
    expect(state.entries.map((e) => e.surface)).toEqual(["lms-content", "diagnostics", "lms-content"]);
    expect(state.entries.map((e) => e.at)).toEqual([
      "2026-09-07T10:00:01.000Z",
      "2026-09-07T10:00:02.000Z",
      "2026-09-07T10:00:03.000Z",
    ]);
  });

  it("gives one surface only its own entries, in the same order, and never another surface's", () => {
    recordSessionDiagnosticEntry({
      at: "2026-09-07T10:00:01.000Z",
      surface: "lms-content",
      operation: "list_courses",
      label: "List courses",
      outcome: "success",
    });
    recordSessionDiagnosticEntry({
      at: "2026-09-07T10:00:02.000Z",
      surface: "diagnostics",
      operation: "cancel_migration_job",
      label: "Cancel import job",
      outcome: "success",
    });
    recordSessionDiagnosticEntry({
      at: "2026-09-07T10:00:03.000Z",
      surface: "lms-content",
      operation: "list_addable_content",
      label: "List addable content",
      outcome: "failure",
      error: "no course selected",
    });

    const contentSlice = readSessionDiagnosticSurfaceEntries("lms-content");
    expect(contentSlice.entries.map((e) => e.operation)).toEqual(["list_courses", "list_addable_content"]);
    const diagnosticsSlice = readSessionDiagnosticSurfaceEntries("diagnostics");
    expect(diagnosticsSlice.entries.map((e) => e.operation)).toEqual(["cancel_migration_job"]);
  });

  it("hands out a copy, so a caller cannot mutate the store through a read", () => {
    recordSessionDiagnosticEntry({
      at: "2026-09-07T10:00:01.000Z",
      surface: "lms-content",
      operation: "list_courses",
      label: "List courses",
      outcome: "success",
    });
    const first = readSessionDiagnosticLogState();
    (first.entries as unknown as unknown[]).push({ bogus: true });
    expect(readSessionDiagnosticLogState().entries.length).toBe(1);
  });

  it("stores an empty error on a success entry even if one was passed in", () => {
    recordSessionDiagnosticEntry({
      at: "2026-09-07T10:00:01.000Z",
      surface: "lms-content",
      operation: "list_courses",
      label: "List courses",
      outcome: "success",
      error: "should be ignored",
    });
    expect(readSessionDiagnosticLogState().entries[0].error).toBe("");
  });

  it("keeps a failure's real message rather than a generic marker", () => {
    recordSessionDiagnosticEntry({
      at: "2026-09-07T10:00:01.000Z",
      surface: "diagnostics",
      operation: "list_migrations",
      label: "List Canvas import jobs",
      outcome: "failure",
      error: "No stored Canvas credential for institution acme. Connect it under Settings.",
    });
    expect(readSessionDiagnosticLogState().entries[0].error).toBe(
      "No stored Canvas credential for institution acme. Connect it under Settings."
    );
  });
});

describe("sessionDiagnosticLog: scrubbing runs before storage, and before truncation", () => {
  it("scrubs a credential-shaped substring out of a failure BEFORE it is stored, not at download time", () => {
    const raw =
      "fatal: could not read Username for 'https://github.com': ghp_abcdefghijklmnopqrstuvwxyz0123456789 is invalid";
    recordSessionDiagnosticEntry({
      at: "2026-09-07T10:00:01.000Z",
      surface: "lms-content",
      operation: "load_course_content",
      label: "Load course content",
      outcome: "failure",
      error: raw,
    });
    // Asserted against the STORE, not against a formatted download: if the
    // scrub ran at render time the raw token would still be sitting here.
    const stored = readSessionDiagnosticLogState().entries[0].error;
    expect(stored).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(stored).toContain("[REDACTED]");
    // The surrounding sentence - the actual diagnostic content - survives.
    expect(stored).toContain("could not read Username");
  });

  it("scrubs this app's own ?key= query parameter out of a failure", () => {
    recordSessionDiagnosticEntry({
      at: "2026-09-07T10:00:01.000Z",
      surface: "diagnostics",
      operation: "load_migration_progress",
      label: "Load import job progress",
      outcome: "failure",
      error:
        "fetch failed: https://generativelanguage.googleapis.com/v1/models?key=AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456",
    });
    const stored = readSessionDiagnosticLogState().entries[0].error;
    expect(stored).not.toContain("AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456");
    expect(stored).toContain("[REDACTED]");
  });

  it("scrubs a Canvas-style <id>~<opaque> access token quoted mid-sentence with no delimiter", () => {
    const token = "1234~AbCdEfGh1234567890abcdefghijklmnopqrstuvwxyz";
    recordSessionDiagnosticEntry({
      at: "2026-09-07T10:00:01.000Z",
      surface: "diagnostics",
      operation: "list_migrations",
      label: "List Canvas import jobs",
      outcome: "failure",
      error: `Canvas rejected token${token}: 401 Unauthorized`,
    });
    expect(readSessionDiagnosticLogState().entries[0].error).not.toContain(token);
  });

  it("scrubs before truncating, so a secret straddling the length cap is not left as a raw partial fragment", () => {
    // MAX_VALUE_CHARS is 500. The padding is a NON-WORD character ("-"), not
    // a letter or digit, and that choice is what makes this test able to tell
    // the two orderings apart at all: the GitHub-token pattern requires a
    // word boundary immediately before "ghp_", which exists only when the
    // preceding character is non-word. Word-character padding would sit flush
    // against "ghp_" with no boundary, the pattern would never match under
    // EITHER ordering, and the test would pass regardless - vacuously.
    //
    // 485 characters of padding + the 40-character token = 525 raw
    // characters, straddling the 500-character cap.
    //
    // Truncate-FIRST (the bug this pins) cuts to exactly 500 characters
    // before the scrubber ever runs: only "ghp_" plus 11 more characters of
    // the token survive - short of the pattern's 20-alphanumeric minimum - so
    // the scrubber never fires on the remnant and a raw, unredacted fragment
    // of a real secret ships in the log. Scrub-FIRST sees the whole
    // 40-character token, replaces all of it with the 10-character
    // "[REDACTED]" marker, and the resulting 495-character string is then
    // under the cap, so no truncation happens at all.
    const padding = "-".repeat(485);
    const token = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
    const result = sanitizeSessionDiagnosticError(`${padding}${token}`);
    expect(result).not.toContain(token);
    // The specific failure mode: a raw, un-redacted PREFIX of the secret
    // leaking through because it was cut short of the pattern's minimum
    // length before the scrubber ever saw it.
    expect(result).not.toMatch(/ghp_[A-Za-z0-9]/);
    expect(result).toContain("[REDACTED]");
  });

  it("applies that same ordering on the real recording path, not only in the exported helper", () => {
    const padding = "-".repeat(485);
    const token = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
    recordSessionDiagnosticEntry({
      at: "2026-09-07T10:00:01.000Z",
      surface: "lms-content",
      operation: "load_course_content",
      label: "Load course content",
      outcome: "failure",
      error: `${padding}${token}`,
    });
    const stored = readSessionDiagnosticLogState().entries[0].error;
    expect(stored).not.toContain(token);
    expect(stored).not.toMatch(/ghp_[A-Za-z0-9]/);
    expect(stored).toContain("[REDACTED]");
  });

  it("still truncates a very long, already-scrubbed message, with a visible marker", () => {
    const result = sanitizeSessionDiagnosticError("y".repeat(2000));
    expect(result.length).toBeLessThan(2000);
    expect(result).toContain("truncated");
    expect(result).toContain("more character(s) dropped");
  });
});

describe("sessionDiagnosticLog: the cap drops the oldest and says how many, never silently", () => {
  it("caps entries, drops from the front, and counts the drops per surface", () => {
    const overBy = 37;
    // The first `overBy` entries belong to one surface and the rest to
    // another, so the per-surface attribution is pinned to a specific number
    // rather than being trivially equal to the session total.
    for (let i = 0; i < overBy; i++) {
      recordSessionDiagnosticEntry({
        at: `2026-09-07T10:00:${String(i).padStart(2, "0")}.000Z`,
        surface: "diagnostics",
        operation: "list_migrations",
        label: "List Canvas import jobs",
        course: `old-${i}`,
        outcome: "success",
      });
    }
    for (let i = 0; i < MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES; i++) {
      recordSessionDiagnosticEntry({
        at: `2026-09-07T11:00:${String(i % 60).padStart(2, "0")}.000Z`,
        surface: "lms-content",
        operation: "list_courses",
        label: "List courses",
        course: `new-${i}`,
        outcome: "success",
      });
    }

    const state = readSessionDiagnosticLogState();
    expect(state.entries.length).toBe(MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES);
    expect(state.droppedCount).toBe(overBy);
    // The oldest survivor is the first of the second batch: all 37 of the
    // first surface's entries fell off the front, in order.
    expect(state.entries[0].course).toBe("new-0");
    expect(state.droppedBySurface.diagnostics).toBe(overBy);
    expect(state.droppedBySurface["lms-content"] ?? 0).toBe(0);

    // Each surface's own view reports ITS OWN losses, not the session total.
    expect(readSessionDiagnosticSurfaceEntries("diagnostics").droppedCount).toBe(overBy);
    expect(readSessionDiagnosticSurfaceEntries("lms-content").droppedCount).toBe(0);
  });

  it("states the dropped count in the on-screen summary line", () => {
    for (let i = 0; i < MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES + 3; i++) {
      recordSessionDiagnosticEntry({
        at: `2026-09-07T10:00:${String(i % 60).padStart(2, "0")}.000Z`,
        surface: "lms-content",
        operation: "list_courses",
        label: "List courses",
        outcome: "success",
      });
    }
    const line = sessionDiagnosticLogSummaryLine(summarizeSessionDiagnosticLog(readSessionDiagnosticLogState()));
    expect(line).toContain("3 earlier");
    expect(line).toContain("dropped");
  });

  it("states the dropped count in the CSV and JSON downloads too", () => {
    for (let i = 0; i < MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES + 5; i++) {
      recordSessionDiagnosticEntry({
        at: `2026-09-07T10:00:${String(i % 60).padStart(2, "0")}.000Z`,
        surface: "lms-content",
        operation: "list_courses",
        label: "List courses",
        outcome: "success",
      });
    }
    const log = buildSessionDiagnosticLog(readSessionDiagnosticLogState(), CONTEXT, "2026-09-07T12:00:00.000Z");
    const csv = formatSessionDiagnosticLogCsv(log);
    expect(csv).toContain("Entries dropped (cap reached)");
    expect(csv).toContain("Any entries dropped,Yes");
    const json = JSON.parse(formatSessionDiagnosticLogJson(log));
    expect(json.droppedCount).toBe(5);
    expect(json.summary.droppedCount).toBe(5);
  });
});

describe("sessionDiagnosticLog: the recording-start time is fixed at first use and does not move", () => {
  it("is already set before anything is recorded, on a freshly evaluated module", async () => {
    vi.resetModules();
    const fresh = await import("./session-diagnostic-log");
    const started = fresh.sessionDiagnosticRecordingStartedAt();
    expect(started).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(fresh.readSessionDiagnosticLogState().entries).toEqual([]);
    expect(fresh.readSessionDiagnosticLogState().recordingStartedAt).toBe(started);
  });

  it("does not move as entries are recorded, read, or rendered", () => {
    const before = sessionDiagnosticRecordingStartedAt();
    expect(before).toBe(STARTED_AT);
    for (let i = 0; i < 5; i++) {
      recordSessionDiagnosticEntry({
        at: `2026-09-07T10:00:0${i}.000Z`,
        surface: "lms-content",
        operation: "list_courses",
        label: "List courses",
        outcome: i % 2 === 0 ? "success" : "failure",
        error: "boom",
      });
    }
    expect(sessionDiagnosticRecordingStartedAt()).toBe(before);
    expect(readSessionDiagnosticLogState().recordingStartedAt).toBe(before);
    expect(readSessionDiagnosticSurfaceEntries("lms-content").recordingStartedAt).toBe(before);
    const log = buildSessionDiagnosticLog(readSessionDiagnosticLogState(), CONTEXT, "2026-09-07T12:00:00.000Z");
    expect(JSON.parse(formatSessionDiagnosticLogJson(log)).recordingStartedAt).toBe(before);
  });
});

describe("sessionDiagnosticLog: an empty log and a log that never recorded read differently", () => {
  it("an empty log still states that recording is active, never a bare blank", () => {
    const line = sessionDiagnosticLogSummaryLine(summarizeSessionDiagnosticLog(readSessionDiagnosticLogState()));
    expect(line.length).toBeGreaterThan(0);
    expect(line.toLowerCase()).toContain("recording");
  });

  it("the download states the period covered, and that recording was active, with zero entries", () => {
    const log = buildSessionDiagnosticLog(readSessionDiagnosticLogState(), CONTEXT, "2026-09-07T12:00:00.000Z");
    const csv = formatSessionDiagnosticLogCsv(log);
    expect(csv).toContain("Recording started");
    expect(csv).toContain(STARTED_AT);
    expect(csv).toContain("Generated");
    expect(csv).toContain("2026-09-07T12:00:00.000Z");
    expect(csv).toContain("Recording active,Yes");
    const json = JSON.parse(formatSessionDiagnosticLogJson(log));
    expect(json.recordingStartedAt).toBe(STARTED_AT);
    expect(json.generatedAt).toBe("2026-09-07T12:00:00.000Z");
    expect(json.recordingActive).toBe(true);
    expect(json.entries).toEqual([]);
  });

  it("carries the settings and environment in force at download time", () => {
    const log = buildSessionDiagnosticLog(readSessionDiagnosticLogState(), CONTEXT, "2026-09-07T12:00:00.000Z");
    const csv = formatSessionDiagnosticLogCsv(log);
    expect(csv).toContain("acme");
    expect(csv).toContain("/courses/123");
    expect(csv).toContain("/account/diagnostics");
    expect(csv).toContain("TestAgent/1.0");
  });
});

describe("sessionDiagnosticLog: coverage is declared, so silence is readable", () => {
  it("declares a non-trivial list of covered and uncovered areas, rather than an empty one", () => {
    // Pinned as ABSOLUTE numbers, not against the constants themselves: a
    // loop over SESSION_DIAGNOSTIC_NOT_COVERED asserting each of its members
    // appears is vacuous the moment that list is emptied, which is exactly
    // the change that would turn this file into a false claim of total
    // coverage. Both counts are floors, so the lists may grow.
    expect(SESSION_DIAGNOSTIC_COVERAGE.length).toBeGreaterThanOrEqual(2);
    expect(SESSION_DIAGNOSTIC_NOT_COVERED.length).toBeGreaterThanOrEqual(4);
    // A count floor alone still passes while the list quietly loses the
    // areas that matter, so the FACT is pinned instead of the spelling:
    // these are real app areas this log does not watch, and each one has to
    // be named as uncovered. Only the keyword is asserted, never the
    // sentence around it.
    const declared = SESSION_DIAGNOSTIC_NOT_COVERED.join(" ").toLowerCase();
    for (const area of ["recording", "grading", "workflow", "chat", "files"]) {
      expect(declared, `"${area}" is not instrumented but is not declared as uncovered`).toContain(area);
    }
  });

  it("names every instrumented area AND every area that is not instrumented, in both formats", () => {
    const log = buildSessionDiagnosticLog(readSessionDiagnosticLogState(), CONTEXT, "2026-09-07T12:00:00.000Z");
    const csv = formatSessionDiagnosticLogCsv(log);
    expect(csv).toContain("=== Coverage ===");
    for (const row of SESSION_DIAGNOSTIC_COVERAGE) {
      expect(csv).toContain(SESSION_DIAGNOSTIC_SURFACE_LABELS[row.surface]);
      expect(csv).toContain(row.covers);
    }
    for (const notCovered of SESSION_DIAGNOSTIC_NOT_COVERED) {
      expect(csv).toContain(notCovered);
    }
    // A frozen literal oracle for the disclaimer itself, so the uncovered
    // rows cannot silently lose the sentence that makes them meaningful.
    expect(csv).toContain("Not instrumented - this log's silence about it means nothing.");
    const json = JSON.parse(formatSessionDiagnosticLogJson(log));
    expect(json.coverage.instrumented.length).toBe(SESSION_DIAGNOSTIC_COVERAGE.length);
    expect(json.coverage.notInstrumented).toEqual([...SESSION_DIAGNOSTIC_NOT_COVERED]);
    expect(json.coverage.notInstrumented.length).toBeGreaterThanOrEqual(4);
  });

  it("says on screen that the log is not the whole app and that a reload starts a new one", () => {
    const line = sessionDiagnosticCoverageLine();
    expect(line).toContain("not yet the whole app");
    expect(line.toLowerCase()).toContain("reloading the page");
    for (const row of SESSION_DIAGNOSTIC_COVERAGE) {
      expect(line).toContain(SESSION_DIAGNOSTIC_SURFACE_LABELS[row.surface]);
    }
  });

  it("counts attempts per area, so an area that reported nothing is visible as such", () => {
    recordSessionDiagnosticEntry({
      at: "2026-09-07T10:00:01.000Z",
      surface: "lms-content",
      operation: "list_courses",
      label: "List courses",
      outcome: "success",
    });
    const summary = summarizeSessionDiagnosticLog(readSessionDiagnosticLogState());
    expect(summary.bySurface["lms-content"]).toBe(1);
    expect(summary.bySurface.diagnostics).toBe(0);
  });
});

describe("sessionDiagnosticLog: summary counts and recent slice", () => {
  it("counts succeeded and failed independently of the order they were recorded", () => {
    recordSessionDiagnosticEntry({ at: "a", surface: "lms-content", operation: "list_courses", outcome: "success" });
    recordSessionDiagnosticEntry({
      at: "b",
      surface: "diagnostics",
      operation: "list_migrations",
      outcome: "failure",
      error: "boom",
    });
    recordSessionDiagnosticEntry({ at: "c", surface: "lms-content", operation: "list_courses", outcome: "success" });
    const summary = summarizeSessionDiagnosticLog(readSessionDiagnosticLogState());
    expect(summary.total).toBe(3);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.droppedCount).toBe(0);
  });

  it("returns the most recent N entries, newest first", () => {
    for (let i = 0; i < 8; i++) {
      recordSessionDiagnosticEntry({
        at: `2026-09-07T10:00:0${i}.000Z`,
        surface: "lms-content",
        operation: "list_courses",
        label: "List courses",
        course: String(i),
        outcome: "success",
      });
    }
    const recent = recentSessionDiagnosticEntries(readSessionDiagnosticLogState().entries, 3);
    expect(recent.map((e) => e.course)).toEqual(["7", "6", "5"]);
  });

  it("falls back to the operation name when a caller supplies no label", () => {
    recordSessionDiagnosticEntry({ at: "a", surface: "diagnostics", operation: "list_migrations", outcome: "success" });
    expect(readSessionDiagnosticLogState().entries[0].label).toBe("list_migrations");
  });
});

describe("sessionDiagnosticLog: filename", () => {
  it("builds a stable, extension-correct filename from the timestamp", () => {
    expect(sessionDiagnosticLogFileName("csv", "2026-09-07T14:03:07.123Z")).toBe(
      "session-diagnostic-log-20260907-140307.csv"
    );
    expect(sessionDiagnosticLogFileName("json", "2026-09-07T14:03:07.123Z")).toBe(
      "session-diagnostic-log-20260907-140307.json"
    );
  });
});

describe("sessionDiagnosticLog: the serialised form round-trips", () => {
  it("reconstructs the exact entries from the JSON download", () => {
    recordSessionDiagnosticEntry({
      at: "2026-09-07T10:00:01.000Z",
      surface: "lms-content",
      operation: "list_courses",
      label: "List courses",
      institution: "acme",
      outcome: "success",
    });
    recordSessionDiagnosticEntry({
      at: "2026-09-07T10:00:02.000Z",
      surface: "diagnostics",
      operation: "cancel_migration_job",
      label: "Cancel import job",
      institution: "acme",
      course: "/courses/123",
      outcome: "failure",
      error: "Canvas returned a 404 for this job.",
    });
    const state = readSessionDiagnosticLogState();
    const log = buildSessionDiagnosticLog(state, CONTEXT, "2026-09-07T12:00:00.000Z");
    const parsed = JSON.parse(formatSessionDiagnosticLogJson(log));
    expect(parseSessionDiagnosticLogEntries(parsed.entries)).toEqual([...state.entries]);
  });

  it("drops a malformed entry rather than throwing", () => {
    const parsed = parseSessionDiagnosticLogEntries([
      {
        at: "2026-09-07T10:00:00.000Z",
        surface: "lms-content",
        operation: "list_courses",
        label: "List courses",
        institution: "acme",
        course: "",
        outcome: "success",
        error: "",
      },
      {
        at: "2026-09-07T10:00:01.000Z",
        surface: "not-a-real-surface",
        operation: "list_courses",
        label: "List courses",
        institution: "",
        course: "",
        outcome: "success",
        error: "",
      },
      "not even an object",
      null,
      { surface: "lms-content", operation: "list_courses" },
    ]);
    expect(parsed.length).toBe(1);
    expect(parsed[0].operation).toBe("list_courses");
  });

  it("returns an empty array for a non-array input rather than throwing", () => {
    expect(parseSessionDiagnosticLogEntries(null)).toEqual([]);
    expect(parseSessionDiagnosticLogEntries(undefined)).toEqual([]);
    expect(parseSessionDiagnosticLogEntries("not an array")).toEqual([]);
    expect(parseSessionDiagnosticLogEntries({})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The browser-only contract, enforced rather than documented.
//
// This module holds mutable state at module scope. On a Next.js server that
// state is shared across REQUESTS - so one instructor's failures would land
// in another instructor's download. The module is only ever safe because
// nothing server-side imports it. That is a property of the repo, not of this
// file, so it gets a scan rather than a comment.
// ---------------------------------------------------------------------------

const MODULE_SPECIFIER = "session-diagnostic-log";

// The DIRECTIVE, on its own line - not a mention of the words. A substring
// scan for `"use server"` also matches this file and the module itself, both
// of which discuss the marker in prose, and reported them as offenders on the
// first run of this test.
const USE_SERVER_DIRECTIVE = /^\s*["']use server["'];?\s*$/m;

// The store and this test are the two files allowed to name the module: they
// ARE it. Excluded by path so the scan below can stay a plain substring
// search, which catches a `require`, a dynamic `import()` and a re-export
// alike, not only a static import line.
const SELF = new Set<string>(["src/lib/session-diagnostic-log.ts", "src/lib/session-diagnostic-log.test.ts"]);

function listSourceFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("sessionDiagnosticLog: nothing server-side may import this module", () => {
  const repoRoot = process.cwd();
  const rel = (file: string): string => path.relative(repoRoot, file).split(path.sep).join("/");
  const serverDirs = [path.resolve(repoRoot, "src/app/api"), path.resolve(repoRoot, "src/app/actions")];
  const allSrcFiles = listSourceFiles(path.resolve(repoRoot, "src"));
  const candidates = [
    ...serverDirs.flatMap((dir) => listSourceFiles(dir)),
    ...allSrcFiles.filter((file) => USE_SERVER_DIRECTIVE.test(fs.readFileSync(file, "utf-8"))),
  ].filter((file) => !SELF.has(rel(file)));

  it("finds server files to scan - a scan over nothing proves nothing", () => {
    expect(serverDirs.flatMap((dir) => listSourceFiles(dir)).length).toBeGreaterThan(0);
    expect(allSrcFiles.filter((file) => USE_SERVER_DIRECTIVE.test(fs.readFileSync(file, "utf-8"))).length).toBeGreaterThan(
      0
    );
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("is not imported by any route handler, server action, or file carrying the use-server directive", () => {
    const offenders: string[] = [];
    for (const file of new Set(candidates)) {
      if (fs.readFileSync(file, "utf-8").includes(MODULE_SPECIFIER)) offenders.push(rel(file));
    }
    expect(
      offenders,
      `\nModule-scope state in src/lib/session-diagnostic-log.ts is per-PROCESS on a server, so it would be shared across requests and therefore across users. These server-side files reference it:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
