import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES,
  readSessionDiagnosticLogState,
  recordSessionDiagnosticEntry,
  resetSessionDiagnosticLogForTests,
} from "@/lib/session-diagnostic-log";
import {
  contentDiagnosticLogView,
  recordContentDiagnosticEntry,
  sanitizeContentDiagnosticError,
  summarizeContentDiagnosticLog,
  contentDiagnosticLogSummaryLine,
  recentContentDiagnosticEntries,
  buildContentDiagnosticLog,
  formatContentDiagnosticLogCsv,
  formatContentDiagnosticLogJson,
  contentDiagnosticLogFileName,
  parseContentDiagnosticLogEntries,
  type RecordContentDiagnosticArgs,
} from "./contentDiagnosticLog";

const STARTED_AT = "2026-09-05T10:00:00.000Z";

// This module is now a VIEW over the app-wide session log, which is
// module-scope state - so every test starts from a known, empty store.
beforeEach(() => {
  resetSessionDiagnosticLogForTests(STARTED_AT);
});

function record(args: RecordContentDiagnosticArgs): void {
  recordContentDiagnosticEntry(args);
}

describe("contentDiagnosticLog: one store, not two", () => {
  it("writes into the app-wide session log, tagged as this surface and carrying this surface's own label", () => {
    record({
      at: "2026-09-05T10:00:01.000Z",
      operation: "list_export_courses",
      institution: "acme",
      course: "",
      outcome: "failure",
      error: "Could not reach the course hub.",
    });
    // The proof that the Settings-side "everything that happened" download
    // cannot be missing this tab's events: they are IN that store, not in a
    // parallel one this module keeps to itself.
    const session = readSessionDiagnosticLogState();
    expect(session.entries.length).toBe(1);
    expect(session.entries[0].surface).toBe("lms-content");
    expect(session.entries[0].operation).toBe("list_export_courses");
    expect(session.entries[0].label).toBe("List courses with a saved export");
    expect(session.entries[0].error).toBe("Could not reach the course hub.");
  });

  it("reads that same store back, and shows only this surface's entries", () => {
    record({
      at: "2026-09-05T10:00:01.000Z",
      operation: "list_courses",
      institution: "acme",
      course: "",
      outcome: "success",
    });
    // Recorded by a DIFFERENT surface (the Settings > Diagnostics screen).
    // It belongs in the session download but must not appear in this tab's
    // section, whose operation vocabulary does not include it.
    recordSessionDiagnosticEntry({
      at: "2026-09-05T10:00:02.000Z",
      surface: "diagnostics",
      operation: "cancel_migration_job",
      label: "Cancel import job",
      outcome: "success",
    });
    expect(readSessionDiagnosticLogState().entries.length).toBe(2);
    const view = contentDiagnosticLogView();
    expect(view.entries.map((e) => e.operation)).toEqual(["list_courses"]);
  });

  it("takes its recording-start time from the session, so it survives a tab switch", () => {
    expect(contentDiagnosticLogView().recordingStartedAt).toBe(STARTED_AT);
  });

  it("returns a fresh object every read, which is what makes the section re-render", () => {
    const first = contentDiagnosticLogView();
    const second = contentDiagnosticLogView();
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });
});

describe("contentDiagnosticLog: recording and ordering", () => {
  it("records entries in the order they were reported", () => {
    record({
      at: "2026-09-05T10:00:01.000Z",
      operation: "list_courses",
      institution: "acme",
      course: "",
      outcome: "success",
    });
    record({
      at: "2026-09-05T10:00:02.000Z",
      operation: "load_course_content",
      institution: "acme",
      course: "/courses/123",
      outcome: "failure",
      error: "Canvas returned a 404 for this course.",
    });
    const view = contentDiagnosticLogView();
    expect(view.entries.map((e) => e.operation)).toEqual(["list_courses", "load_course_content"]);
    expect(view.entries[0].at).toBe("2026-09-05T10:00:01.000Z");
    expect(view.entries[1].at).toBe("2026-09-05T10:00:02.000Z");
  });
});

describe("contentDiagnosticLog: failures keep their real message", () => {
  it("stores the action's own error text on a failure entry, not a generic marker", () => {
    record({
      at: "2026-09-05T10:00:01.000Z",
      operation: "list_courses",
      institution: "acme",
      course: "",
      outcome: "failure",
      error: "No stored Canvas credential for institution acme. Connect it under Settings.",
    });
    expect(contentDiagnosticLogView().entries[0].error).toBe(
      "No stored Canvas credential for institution acme. Connect it under Settings."
    );
  });

  it("stores an empty error string on a success entry even if one was passed in", () => {
    record({
      at: "2026-09-05T10:00:01.000Z",
      operation: "list_courses",
      institution: "acme",
      course: "",
      outcome: "success",
      error: "should be ignored",
    });
    expect(contentDiagnosticLogView().entries[0].error).toBe("");
  });
});

describe("contentDiagnosticLog: scrubbing (must run before storage, and before truncation)", () => {
  it("scrubs a credential-shaped substring out of a failure's error before it is stored", () => {
    const raw =
      "fatal: could not read Username for 'https://github.com': ghp_abcdefghijklmnopqrstuvwxyz0123456789 is invalid";
    record({
      at: "2026-09-05T10:00:01.000Z",
      operation: "load_course_content",
      institution: "acme",
      course: "/courses/1",
      outcome: "failure",
      error: raw,
    });
    // Asserted against the SESSION store, which is where this surface's
    // entries now actually live - so this pins that the scrub happened before
    // storage on the path the app really takes, not just in a local view.
    const stored = readSessionDiagnosticLogState().entries[0].error;
    expect(stored).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(stored).toContain("[REDACTED]");
    // The surrounding sentence - the actual diagnostic content - survives.
    expect(stored).toContain("could not read Username");
  });

  it("scrubs this app's own ?key= query parameter out of a failure's error", () => {
    const raw =
      "fetch failed: https://generativelanguage.googleapis.com/v1/models?key=AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456";
    record({
      at: "2026-09-05T10:00:01.000Z",
      operation: "load_course_content",
      institution: "acme",
      course: "/courses/1",
      outcome: "failure",
      error: raw,
    });
    const stored = contentDiagnosticLogView().entries[0].error;
    expect(stored).not.toContain("AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456");
    expect(stored).toContain("[REDACTED]");
  });

  it("scrubs a Canvas-style <id>~<opaque> access token quoted mid-sentence with no delimiter", () => {
    const token = "1234~AbCdEfGh1234567890abcdefghijklmnopqrstuvwxyz";
    record({
      at: "2026-09-05T10:00:01.000Z",
      operation: "list_courses",
      institution: "acme",
      course: "",
      outcome: "failure",
      error: `Canvas rejected token${token}: 401 Unauthorized`,
    });
    expect(contentDiagnosticLogView().entries[0].error).not.toContain(token);
  });

  it("scrubs before truncating, so a secret straddling the length cap is not left as a raw partial fragment", () => {
    // MAX_VALUE_CHARS is 500. Padding is a NON-WORD character ("-"), not a
    // letter/digit - the GitHub-token pattern requires a leading word
    // boundary immediately before "ghp_", which only exists when the
    // preceding character is non-word; letter padding would sit flush
    // against "ghp_" with no boundary at all and the pattern would never
    // match regardless of ordering, which would make this test vacuous.
    //
    // 485 characters of padding + the 40-character token = 525 raw
    // characters, straddling the 500-character cap.
    //
    // Truncate-FIRST (the bug this test pins) cuts the string to exactly
    // 500 characters before scrubbing ever runs: only "ghp_" plus 11 more
    // characters of the token survive the cut - short of the GitHub
    // pattern's 20-alphanumeric-character minimum after the prefix - so
    // the scrubber never fires on the remnant and a raw, unredacted
    // fragment of a real secret ships in the log. Scrub-FIRST (the
    // required order) sees the whole, unmodified 40-character token,
    // redacts all of it to the 10-character "[REDACTED]" marker, and the
    // resulting 495-character string is then well under the cap - so no
    // truncation happens at all and nothing raw survives either way.
    const padding = "-".repeat(485);
    const token = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
    const raw = `${padding}${token}`;
    const result = sanitizeContentDiagnosticError(raw);
    expect(result).not.toContain(token);
    // The specific failure mode: a raw, un-redacted PREFIX of the secret
    // (e.g. "ghp_abcdefghij") leaking through because it was cut short of
    // the pattern's minimum length before the scrubber ever saw it.
    expect(result).not.toMatch(/ghp_[A-Za-z0-9]/);
    expect(result).toContain("[REDACTED]");
  });

  it("still truncates a very long, already-scrubbed message, with a visible marker", () => {
    const raw = "y".repeat(2000);
    const result = sanitizeContentDiagnosticError(raw);
    expect(result.length).toBeLessThan(2000);
    expect(result).toContain("truncated");
    expect(result).toContain("more character(s) dropped");
  });
});

describe("contentDiagnosticLog: the cap is enforced and made visible, not silently dropped", () => {
  it("reports only THIS surface's losses to the session cap, not the session-wide total", () => {
    const otherSurfaceDrops = 12;
    // These fall off the front first and belong to another surface, so if
    // this view reported the session total it would overstate its own losses
    // by exactly `otherSurfaceDrops`.
    for (let i = 0; i < otherSurfaceDrops; i++) {
      recordSessionDiagnosticEntry({
        at: `2026-09-05T09:00:${String(i).padStart(2, "0")}.000Z`,
        surface: "diagnostics",
        operation: "list_migrations",
        label: "List Canvas import jobs",
        outcome: "success",
      });
    }
    const ownDrops = 7;
    for (let i = 0; i < MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES + ownDrops; i++) {
      record({
        at: `2026-09-05T10:00:${String(i % 60).padStart(2, "0")}.000Z`,
        operation: "list_courses",
        institution: "acme",
        course: String(i),
        outcome: "success",
      });
    }
    const view = contentDiagnosticLogView();
    expect(view.entries.length).toBe(MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES);
    expect(view.droppedCount).toBe(ownDrops);
    expect(readSessionDiagnosticLogState().droppedCount).toBe(otherSurfaceDrops + ownDrops);
    // The oldest surviving content entry is the (ownDrops)-th one recorded.
    expect(view.entries[0].course).toBe(String(ownDrops));
  });

  it("states the dropped count in the on-screen summary line, not silently", () => {
    for (let i = 0; i < MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES + 3; i++) {
      record({
        at: `2026-09-05T10:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`,
        operation: "list_courses",
        institution: "acme",
        course: "",
        outcome: "success",
      });
    }
    const line = contentDiagnosticLogSummaryLine(summarizeContentDiagnosticLog(contentDiagnosticLogView()));
    expect(line).toContain("3 earlier");
    expect(line).toContain("dropped");
  });

  it("states the dropped count in the CSV and JSON downloads too", () => {
    for (let i = 0; i < MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES + 5; i++) {
      record({
        at: `2026-09-05T10:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.000Z`,
        operation: "list_courses",
        institution: "acme",
        course: "",
        outcome: "success",
      });
    }
    const log = buildContentDiagnosticLog(
      contentDiagnosticLogView(),
      { currentInstitution: "acme", currentCourse: "" },
      "2026-09-05T11:00:00.000Z"
    );
    const csv = formatContentDiagnosticLogCsv(log);
    expect(csv).toContain("Entries dropped (cap reached)");
    expect(csv).toContain("5");
    const json = JSON.parse(formatContentDiagnosticLogJson(log));
    expect(json.droppedCount).toBe(5);
    expect(json.summary.droppedCount).toBe(5);
  });
});

describe("contentDiagnosticLog: empty vs never-recording is distinguishable", () => {
  it("an empty log still states that recording is active, never a bare blank", () => {
    const line = contentDiagnosticLogSummaryLine(summarizeContentDiagnosticLog(contentDiagnosticLogView()));
    expect(line.length).toBeGreaterThan(0);
    expect(line.toLowerCase()).toContain("recording");
  });

  it("the download states the recording start time and generation time even with zero entries", () => {
    const log = buildContentDiagnosticLog(
      contentDiagnosticLogView(),
      { currentInstitution: "acme", currentCourse: "" },
      "2026-09-05T11:00:00.000Z"
    );
    const csv = formatContentDiagnosticLogCsv(log);
    expect(csv).toContain("Recording started");
    expect(csv).toContain("2026-09-05T10:00:00.000Z");
    expect(csv).toContain("Generated");
    expect(csv).toContain("2026-09-05T11:00:00.000Z");
    const json = JSON.parse(formatContentDiagnosticLogJson(log));
    expect(json.recordingStartedAt).toBe("2026-09-05T10:00:00.000Z");
    expect(json.generatedAt).toBe("2026-09-05T11:00:00.000Z");
    expect(json.entries).toEqual([]);
  });

  it("says in the file that it is the Course Content slice, not the whole session", () => {
    const log = buildContentDiagnosticLog(
      contentDiagnosticLogView(),
      { currentInstitution: "acme", currentCourse: "" },
      "2026-09-05T11:00:00.000Z"
    );
    expect(formatContentDiagnosticLogCsv(log)).toContain("Course Content operations only");
  });
});

describe("contentDiagnosticLog: recent-entries ordering", () => {
  it("returns the most recent N entries, newest first", () => {
    for (let i = 0; i < 8; i++) {
      record({
        at: `2026-09-05T10:00:0${i}.000Z`,
        operation: "list_courses",
        institution: "acme",
        course: String(i),
        outcome: "success",
      });
    }
    const recent = recentContentDiagnosticEntries(contentDiagnosticLogView().entries, 3);
    expect(recent.map((e) => e.course)).toEqual(["7", "6", "5"]);
  });
});

describe("contentDiagnosticLog: filename", () => {
  it("builds a stable, extension-correct filename from the timestamp", () => {
    expect(contentDiagnosticLogFileName("csv", "2026-09-05T14:03:07.123Z")).toBe(
      "content-diagnostic-log-20260905-140307.csv"
    );
    expect(contentDiagnosticLogFileName("json", "2026-09-05T14:03:07.123Z")).toBe(
      "content-diagnostic-log-20260905-140307.json"
    );
  });
});

describe("contentDiagnosticLog: the serialised form round-trips", () => {
  it("JSON.parse(formatContentDiagnosticLogJson(...)).entries reconstructs via parseContentDiagnosticLogEntries to the same entries", () => {
    record({
      at: "2026-09-05T10:00:01.000Z",
      operation: "list_courses",
      institution: "acme",
      course: "",
      outcome: "success",
    });
    record({
      at: "2026-09-05T10:00:02.000Z",
      operation: "load_course_content",
      institution: "acme",
      course: "/courses/123",
      outcome: "failure",
      error: "Canvas returned a 404 for this course.",
    });
    const state = contentDiagnosticLogView();
    const log = buildContentDiagnosticLog(
      state,
      { currentInstitution: "acme", currentCourse: "/courses/123" },
      "2026-09-05T11:00:00.000Z"
    );
    const json = formatContentDiagnosticLogJson(log);
    const parsed = JSON.parse(json);
    const roundTripped = parseContentDiagnosticLogEntries(parsed.entries);
    expect(roundTripped).toEqual([...state.entries]);
  });

  it("drops a malformed entry rather than throwing, matching parseRubricRunLogEntries's defensive posture", () => {
    const parsed = parseContentDiagnosticLogEntries([
      { at: "2026-09-05T10:00:00.000Z", operation: "list_courses", institution: "acme", course: "", outcome: "success", error: "" },
      { at: "2026-09-05T10:00:01.000Z", operation: "not-a-real-operation", institution: "acme", course: "", outcome: "success", error: "" },
      "not even an object",
      null,
      { operation: "list_courses" }, // missing required string fields
    ]);
    expect(parsed.length).toBe(1);
    expect(parsed[0].operation).toBe("list_courses");
  });

  it("returns an empty array for a non-array input rather than throwing", () => {
    expect(parseContentDiagnosticLogEntries(null)).toEqual([]);
    expect(parseContentDiagnosticLogEntries(undefined)).toEqual([]);
    expect(parseContentDiagnosticLogEntries("not an array")).toEqual([]);
    expect(parseContentDiagnosticLogEntries({})).toEqual([]);
  });
});

describe("contentDiagnosticLog: summary counts", () => {
  it("counts succeeded and failed independently of the order they were recorded", () => {
    record({ at: "2026-09-05T10:00:01.000Z", operation: "list_courses", institution: "a", course: "", outcome: "success" });
    record({ at: "2026-09-05T10:00:02.000Z", operation: "list_courses", institution: "a", course: "", outcome: "failure", error: "boom" });
    record({ at: "2026-09-05T10:00:03.000Z", operation: "list_addable_content", institution: "a", course: "x", outcome: "success" });
    const summary = summarizeContentDiagnosticLog(contentDiagnosticLogView());
    expect(summary.total).toBe(3);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.droppedCount).toBe(0);
  });
});
