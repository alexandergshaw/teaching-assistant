import { describe, it, expect } from "vitest";
import { buildRunLogText } from "./workflow-run-log-text";
import type { WorkflowRunRecord, WorkflowRunStep } from "./workflow-runs";

function makeRun(overrides: Partial<WorkflowRunRecord> = {}): WorkflowRunRecord {
  return {
    id: "run-1",
    userId: "u1",
    workflowId: "wf-42",
    workflowName: "Weekly Announcement",
    status: "ok",
    triggerSource: "schedule",
    triggerRef: "sched-9",
    createdAt: "2026-07-27T10:00:00.000Z",
    startedAt: "2026-07-27T10:00:00.000Z",
    finishedAt: "2026-07-27T10:00:05.000Z",
    durationMs: 5000,
    stepCount: 2,
    errorCount: 0,
    detail: null,
    ...overrides,
  };
}

function makeStep(overrides: Partial<WorkflowRunStep> = {}): WorkflowRunStep {
  return {
    id: "step-1",
    runId: "run-1",
    userId: "u1",
    stepIndex: 0,
    stepType: "pull-current-materials",
    status: "done",
    error: null,
    summary: null,
    progress: [],
    startedAt: "2026-07-27T10:00:00.000Z",
    finishedAt: "2026-07-27T10:00:01.000Z",
    durationMs: 1000,
    institution: null,
    courseId: null,
    courseName: null,
    createdAt: "2026-07-27T10:00:01.000Z",
    ...overrides,
  };
}

describe("buildRunLogText", () => {
  it("includes every header field named in the spec", () => {
    const text = buildRunLogText(makeRun(), []);
    expect(text).toContain("Weekly Announcement");
    expect(text).toContain("wf-42");
    expect(text).toContain("run-1");
    expect(text).toContain("schedule");
    expect(text).toContain("sched-9");
    expect(text).toContain("Status: ok");
    expect(text).toContain("2026-07-27T10:00:00.000Z");
    expect(text).toContain("2026-07-27T10:00:05.000Z");
    expect(text).toContain("5000ms");
    expect(text).toContain("Step count: 2");
    expect(text).toContain("Error count: 0");
  });

  it("renders steps in the order given (index order)", () => {
    const steps = [
      makeStep({ id: "s0", stepIndex: 0, stepType: "first" }),
      makeStep({ id: "s1", stepIndex: 1, stepType: "second" }),
      makeStep({ id: "s2", stepIndex: 2, stepType: "third" }),
    ];
    const text = buildRunLogText(makeRun(), steps);
    const firstIdx = text.indexOf("[0] first");
    const secondIdx = text.indexOf("[1] second");
    const thirdIdx = text.indexOf("[2] third");
    expect(firstIdx).toBeGreaterThanOrEqual(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);
    expect(thirdIdx).toBeGreaterThan(secondIdx);
  });

  it("renders multiple progress messages in order", () => {
    const step = makeStep({ progress: ["fetched roster", "matched 12 students", "wrote grades"] });
    const text = buildRunLogText(makeRun(), [step]);
    const i1 = text.indexOf("fetched roster");
    const i2 = text.indexOf("matched 12 students");
    const i3 = text.indexOf("wrote grades");
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
  });

  it("renders a full, untruncated error", () => {
    const longError = "boom: " + "x".repeat(2000);
    const step = makeStep({ status: "error", error: longError });
    const text = buildRunLogText(makeRun({ status: "error" }), [step]);
    expect(text).toContain(longError);
  });

  it("renders the step summary when present", () => {
    const step = makeStep({ summary: "Posted 3 announcements" });
    const text = buildRunLogText(makeRun(), [step]);
    expect(text).toContain("Posted 3 announcements");
  });

  it("clearly marks a run with no finished_at as unfinished", () => {
    const text = buildRunLogText(makeRun({ finishedAt: null }), []);
    expect(text.toLowerCase()).toContain("no finish record");
  });

  it("does not mark a finished run as unfinished", () => {
    const text = buildRunLogText(makeRun({ finishedAt: "2026-07-27T10:00:05.000Z" }), []);
    expect(text.toLowerCase()).not.toContain("no finish record");
  });

  it("renders the run detail when present", () => {
    const text = buildRunLogText(makeRun({ status: "error", detail: "Step 2 failed: timeout" }), []);
    expect(text).toContain("Step 2 failed: timeout");
  });

  it("notes when no steps were recorded", () => {
    const text = buildRunLogText(makeRun(), []);
    expect(text).toContain("(no steps recorded)");
  });

  it("is deterministic: same inputs produce the exact same output", () => {
    const run = makeRun();
    const steps = [makeStep()];
    expect(buildRunLogText(run, steps)).toBe(buildRunLogText(run, steps));
  });

  it("produces plain text with no markdown markers", () => {
    const text = buildRunLogText(makeRun(), [makeStep({ summary: "done" })]);
    expect(text).not.toMatch(/^#+\s/m);
    expect(text).not.toMatch(/\*\*/);
  });

  // ---------------------------------------------------------------------
  // AC1 - dividers
  // ---------------------------------------------------------------------

  describe("dividers", () => {
    it("brackets each step with a repeated-character rule line, at one consistent width", () => {
      const steps = [
        makeStep({ id: "s0", stepIndex: 0, stepType: "first" }),
        makeStep({ id: "s1", stepIndex: 1, stepType: "second" }),
      ];
      const text = buildRunLogText(makeRun(), steps);
      const ruleLines = text.split("\n").filter((l) => /^=+$/.test(l) || /^-+$/.test(l));
      expect(ruleLines.length).toBeGreaterThan(0);
      const widths = new Set(ruleLines.map((l) => l.length));
      // Every rule line - major or minor, run header or per-step - uses the
      // SAME fixed width (AC1: "pick a width and stick to it").
      expect(widths.size).toBe(1);
    });

    it("separates a step's metadata from its progress/summary/error with a divider", () => {
      const step = makeStep({ progress: ["did a thing"], summary: "all good", error: null });
      const text = buildRunLogText(makeRun(), [step]);
      const metadataIdx = text.indexOf("Duration:");
      const progressIdx = text.indexOf("Progress:");
      const dividerBetween = text.slice(metadataIdx, progressIdx);
      expect(dividerBetween).toMatch(/^-+$/m);
    });
  });

  // ---------------------------------------------------------------------
  // AC3 - chronological ordering (defect 3)
  // ---------------------------------------------------------------------

  describe("chronological ordering", () => {
    it("orders steps by startedAt, not by array/index position", () => {
      // Same shape as the reported bug: a fan-out reuses stepIndex 0 for
      // every iteration, insertion order does not match wall-clock order.
      const steps = [
        makeStep({ id: "later", stepIndex: 0, stepType: "grade-repo", startedAt: "2026-07-29T03:46:06.000Z" }),
        makeStep({ id: "earliest", stepIndex: 0, stepType: "grade-repo", startedAt: "2026-07-29T03:45:19.000Z" }),
        makeStep({ id: "middle", stepIndex: 0, stepType: "grade-repo", startedAt: "2026-07-29T03:45:20.000Z" }),
      ];
      const text = buildRunLogText(makeRun(), steps);
      const earliestIdx = text.indexOf("03:45:19");
      const middleIdx = text.indexOf("03:45:20");
      const laterIdx = text.indexOf("03:46:06");
      expect(earliestIdx).toBeGreaterThanOrEqual(0);
      expect(middleIdx).toBeGreaterThan(earliestIdx);
      expect(laterIdx).toBeGreaterThan(middleIdx);
    });

    it("places a step with a null startedAt after every timestamped step", () => {
      const steps = [
        makeStep({ id: "no-time", stepIndex: 0, stepType: "unknown-timing", startedAt: null }),
        makeStep({ id: "timed", stepIndex: 1, stepType: "timed-step", startedAt: "2026-07-29T03:45:19.000Z" }),
      ];
      const text = buildRunLogText(makeRun(), steps);
      const timedIdx = text.indexOf("timed-step");
      const untimedIdx = text.indexOf("unknown-timing");
      expect(timedIdx).toBeGreaterThanOrEqual(0);
      expect(untimedIdx).toBeGreaterThan(timedIdx);
    });

    it("keeps the given relative order among steps that tie (including all-null startedAt)", () => {
      const steps = [
        makeStep({ id: "a", stepIndex: 0, stepType: "alpha", startedAt: null }),
        makeStep({ id: "b", stepIndex: 1, stepType: "beta", startedAt: null }),
      ];
      const text = buildRunLogText(makeRun(), steps);
      expect(text.indexOf("] alpha")).toBeLessThan(text.indexOf("] beta"));
    });
  });

  // ---------------------------------------------------------------------
  // AC1/AC3 - course name (defects 1 and 2)
  // ---------------------------------------------------------------------

  describe("course identification", () => {
    it("shows the course NAME, not a bare id, when the name was captured", () => {
      const step = makeStep({
        courseId: "1c41b131-f052-4da6-a077-ae5178271cea",
        courseName: "Prescriptive AI",
        institution: "MIT",
      });
      const text = buildRunLogText(makeRun(), [step]);
      expect(text).toContain("Prescriptive AI");
      // Never a BARE UUID with nothing else on the line when a name is
      // available - the id may still appear annotated alongside the name.
      expect(text).not.toMatch(/^\s*Course: 1c41b131-f052-4da6-a077-ae5178271cea\s*$/m);
    });

    it("falls back to the raw id for a row written before courseName existed", () => {
      const step = makeStep({ courseId: "1c41b131-f052-4da6-a077-ae5178271cea", courseName: null });
      const text = buildRunLogText(makeRun(), [step]);
      expect(text).toContain("1c41b131-f052-4da6-a077-ae5178271cea");
    });

    it("gives each fan-out iteration a distinguishing header (course + institution), not a repeated generic label", () => {
      const steps = [
        makeStep({ id: "s0", stepIndex: 0, courseId: "c1", courseName: "Prescriptive AI", institution: "MIT", startedAt: "2026-07-29T03:45:19.000Z" }),
        makeStep({ id: "s1", stepIndex: 0, courseId: "c2", courseName: "Applied Robotics", institution: "CMU", startedAt: "2026-07-29T03:45:20.000Z" }),
      ];
      const text = buildRunLogText(makeRun(), steps);
      // Both iterations render "[0] <type>" (same index), but the line
      // itself must differ so eleven such entries are not indistinguishable.
      const line1 = text.split("\n").find((l) => l.includes("Prescriptive AI") && l.startsWith("["));
      const line2 = text.split("\n").find((l) => l.includes("Applied Robotics") && l.startsWith("["));
      expect(line1).toBeTruthy();
      expect(line2).toBeTruthy();
      expect(line1).not.toBe(line2);
    });
  });

  // ---------------------------------------------------------------------
  // AC4/AC5 - human-readable timestamps and durations, precise value kept
  // ---------------------------------------------------------------------

  describe("timestamp and duration rendering", () => {
    it("renders a human-readable timestamp alongside the exact raw ISO value, on the dedicated metadata line", () => {
      const step = makeStep({ startedAt: "2026-07-29T03:45:19.418+00:00" });
      const text = buildRunLogText(makeRun(), [step]);
      expect(text).toContain("2026-07-29T03:45:19.418+00:00");
      expect(text).toContain("Jul 29, 2026 03:45:19 UTC");
      // Checked as the actual dedicated "Started at" line (not a loose
      // substring) so this cannot pass merely because the raw value or a
      // human form happens to appear somewhere else in the text.
      expect(text.split("\n")).toContain("  Started at: Jul 29, 2026 03:45:19 UTC (2026-07-29T03:45:19.418+00:00)");
    });

    it("renders a human-readable duration (seconds) alongside the exact raw millisecond count, on the dedicated metadata line", () => {
      const step = makeStep({ durationMs: 29708 });
      const text = buildRunLogText(makeRun(), [step]);
      expect(text).toContain("29708ms");
      expect(text).toContain("29.7s");
      // Checked as the actual dedicated "Duration" line - the human form
      // must appear THERE, not only in the step's header line (which
      // renders duration through a separate call and could mask a
      // regression in the metadata line alone).
      expect(text.split("\n")).toContain("  Duration: 29.7s (29708ms)");
    });

    it("renders minutes for a long duration, on the dedicated metadata line", () => {
      const step = makeStep({ durationMs: 90000 });
      const text = buildRunLogText(makeRun(), [step]);
      expect(text).toContain("90000ms");
      expect(text).toContain("1m 30s");
      expect(text.split("\n")).toContain("  Duration: 1m 30s (90000ms)");
    });
  });

  // ---------------------------------------------------------------------
  // AC3 - one repo (or item) per line in a multi-line summary (defect 5)
  // ---------------------------------------------------------------------

  describe("multi-line summary rendering", () => {
    it("renders each line of a multi-line summary on its own indented line, not run together", () => {
      // Mirrors what summaryToLogText now produces for a "list" summary:
      // one "- item" per line rather than a comma-joined paragraph.
      const summary = "Graded 3/3 repo(s) in org.:\n- repoA: graded - 85\n- repoB: graded - 90\n- repoC: graded - 78";
      const step = makeStep({ summary });
      const text = buildRunLogText(makeRun(), [step]);
      const iA = text.indexOf("- repoA: graded - 85");
      const iB = text.indexOf("- repoB: graded - 90");
      const iC = text.indexOf("- repoC: graded - 78");
      expect(iA).toBeGreaterThanOrEqual(0);
      expect(iB).toBeGreaterThan(iA);
      expect(iC).toBeGreaterThan(iB);
      // Each item is its own line (not comma-joined onto one).
      expect(text).not.toContain("85, repoB");
      const lines = text.split("\n");
      // Every line of the multi-line field is indented consistently (not
      // just its first) - a bare `"    " + text` interpolation would leave
      // continuation lines flush against the margin, since the embedded "\n"
      // in the source string survives untouched either way.
      expect(lines).toContain("    - repoA: graded - 85");
      expect(lines).toContain("    - repoB: graded - 90");
      expect(lines).toContain("    - repoC: graded - 78");
      expect(lines.some((l) => l === "- repoA: graded - 85")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // AC6 - the Detail block, one failure entry per line
  // ---------------------------------------------------------------------

  describe("Detail block rendering", () => {
    it("renders each joinStepErrorDetail entry on its own line", () => {
      const detail =
        "step 1 grade-repo: Prescriptive AI: timeout; step 3 grade-repo: MIT: rate limited (x2); (+7 more)";
      const text = buildRunLogText(makeRun({ status: "error", detail }), []);
      const i1 = text.indexOf("step 1 grade-repo: Prescriptive AI: timeout");
      const i2 = text.indexOf("step 3 grade-repo: MIT: rate limited (x2)");
      const i3 = text.indexOf("(+7 more)");
      expect(i1).toBeGreaterThanOrEqual(0);
      expect(i2).toBeGreaterThan(i1);
      expect(i3).toBeGreaterThan(i2);
      // Each entry is its own line, not part of one run-on paragraph line.
      const lines = text.split("\n");
      expect(lines.some((l) => l.includes("step 1 grade-repo: Prescriptive AI: timeout") && !l.includes("step 3"))).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // AC5 - nothing currently in the log is lost
  // ---------------------------------------------------------------------

  describe("no information is lost", () => {
    it("keeps every field of a fully-populated run and step", () => {
      const run = makeRun({
        workflowName: "Batch Grade Repos",
        workflowId: "wf-99",
        id: "run-77",
        triggerSource: "schedule",
        triggerRef: "sched-1",
        status: "error",
        startedAt: "2026-07-29T03:45:00.000Z",
        finishedAt: "2026-07-29T03:46:10.000Z",
        durationMs: 70000,
        stepCount: 11,
        errorCount: 1,
        detail: "step 1 grade-repo: Prescriptive AI: timeout",
      });
      const step = makeStep({
        stepIndex: 0,
        stepType: "grade-repo",
        status: "error",
        error: "Prescriptive AI: request timed out after 30s",
        summary: "Graded 2/3 repo(s).",
        progress: ["Listing repositories...", "Grading 1/3: repoA..."],
        startedAt: "2026-07-29T03:45:19.418+00:00",
        finishedAt: "2026-07-29T03:45:49.126+00:00",
        durationMs: 29708,
        institution: "MIT",
        courseId: "1c41b131-f052-4da6-a077-ae5178271cea",
        courseName: "Prescriptive AI",
      });
      const text = buildRunLogText(run, [step]);

      for (const expected of [
        "Batch Grade Repos", "wf-99", "run-77", "schedule", "sched-1", "error",
        "2026-07-29T03:45:00.000Z", "2026-07-29T03:46:10.000Z", "70000ms",
        "11", "1",
        "step 1 grade-repo: Prescriptive AI: timeout",
        "grade-repo", "Prescriptive AI: request timed out after 30s",
        "Graded 2/3 repo(s).", "Listing repositories...", "Grading 1/3: repoA...",
        "2026-07-29T03:45:19.418+00:00", "2026-07-29T03:45:49.126+00:00", "29708ms",
        "MIT", "1c41b131-f052-4da6-a077-ae5178271cea",
      ]) {
        expect(text).toContain(expected);
      }

      // Each of these is checked as its OWN dedicated labeled line (not a
      // loose substring), so a field silently dropped from the metadata
      // block cannot hide behind the same text also appearing in the
      // scannable header line above it.
      const lines = text.split("\n");
      expect(lines).toContain("  Institution: MIT");
      expect(lines).toContain("  Course: Prescriptive AI (1c41b131-f052-4da6-a077-ae5178271cea)");
      expect(lines).toContain("  Duration: 29.7s (29708ms)");
      expect(lines.some((l) => l.startsWith("  Started at: ") && l.includes("2026-07-29T03:45:19.418+00:00"))).toBe(true);
      expect(lines.some((l) => l.startsWith("  Finished at: ") && l.includes("2026-07-29T03:45:49.126+00:00"))).toBe(true);
      expect(lines).toContain("    - Listing repositories...");
      expect(lines).toContain("    - Grading 1/3: repoA...");
    });
  });
});
