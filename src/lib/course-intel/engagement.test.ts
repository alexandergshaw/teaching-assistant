import { describe, it, expect } from "vitest";
import { computeEngagementSet, DEFAULT_ENGAGEMENT_THRESHOLDS } from "./engagement";
import type {
  ComputeEngagementArgs,
  EngagementAssessment,
  EngagementRow,
  EngagementSet,
  EngagementStudent,
  EngagementThresholds,
  RecordedSubmission,
} from "./engagement";
import type { ConcernSignalKind, EngagementCaveatKind } from "./types";

const NOW = "2026-06-01T00:00:00Z";
const PAST = "2026-05-01T00:00:00Z";
const FUTURE = "2026-07-01T00:00:00Z";
const TOOL = "recording-suite";
const OTHER_TOOL = "canvas-speedgrader";

// Keys stand in for `offlineStudentKey(course, name)` output. Built here rather
// than imported so this leaf test does not reach into the grading-recording
// surface for two string constants.
const ADA = "c1::ada lovelace";
const GRACE = "c1::grace hopper";
const ALAN = "c1::alan turing";

const THRESHOLDS: EngagementThresholds = DEFAULT_ENGAGEMENT_THRESHOLDS;

function student(index: number, key: string | null): EngagementStudent {
  return {
    index,
    key,
    userId: null,
    identitySource: key === null ? "ambiguous-name" : "course-roster-name",
  };
}

const ROSTER: readonly EngagementStudent[] = [student(1, ADA), student(2, GRACE), student(3, ALAN)];

function assessment(id: string, over: Partial<EngagementAssessment> = {}): EngagementAssessment {
  return { assessmentId: id, workKind: "assignment", deadlineAt: PAST, ...over };
}

/** Defaults to an on-time, dated, correctly-tooled row. Every test states only
 *  the fact it is about. */
function submission(
  assessmentId: string,
  studentKey: string | null,
  over: Partial<RecordedSubmission> = {}
): RecordedSubmission {
  return {
    assessmentId,
    studentKey,
    tool: TOOL,
    submittedAt: { state: "known", submittedAt: "2026-04-30T00:00:00Z" },
    ...over,
  };
}

function compute(over: Partial<ComputeEngagementArgs> = {}): EngagementSet {
  return computeEngagementSet({
    students: ROSTER,
    assessments: [],
    submissions: [],
    declarations: [{ workKind: "assignment", tool: TOOL }],
    thresholds: THRESHOLDS,
    now: NOW,
    ...over,
  });
}

function rowFor(set: EngagementSet, index: number): EngagementRow {
  const row = set.rows.find((r) => r.studentIndex === index);
  if (!row) throw new Error(`no row for student ${index}`);
  return row;
}

function signalKinds(row: EngagementRow): readonly ConcernSignalKind[] {
  return row.signals.map((s) => s.kind);
}

function caveatKinds(set: EngagementSet): readonly EngagementCaveatKind[] {
  return set.caveats.map((c) => c.kind);
}

function labels(row: EngagementRow): string {
  return row.signals.map((s) => s.label).join(" | ");
}

describe("missing work is a set difference against the roster", () => {
  it("counts a student with no rows anywhere, not only one others were graded against", () => {
    // Alan has no recorded row of any kind. The old relative signal could only
    // ever say "no recorded work on an assessment OTHERS were graded on"; with
    // a declared tool and a passed deadline the comparison set is the ROSTER.
    const set = compute({
      assessments: [assessment("a1"), assessment("a2"), assessment("a3")],
      submissions: [submission("a1", ADA), submission("a2", ADA), submission("a3", ADA)],
    });
    const alan = rowFor(set, 3);
    expect(alan.metrics.missingCount).toBe(3);
    expect(alan.metrics.missingConsideredCount).toBe(3);
    expect(labels(alan)).toContain("3 of 3 assessments");
  });

  it("draws both numbers of the sentence from the same set of computed assessments", () => {
    // a4 has no deadline, so it is not in the denominator and not in anyone's
    // missing count either.
    const set = compute({
      assessments: [assessment("a1"), assessment("a2"), assessment("a3"), assessment("a4", { deadlineAt: null })],
      submissions: [submission("a1", GRACE)],
    });
    expect(set.consideredAssessmentIds).toEqual(["a1", "a2", "a3"]);
    const grace = rowFor(set, 2);
    expect(grace.metrics.missingCount).toBe(2);
    expect(grace.metrics.missingConsideredCount).toBe(3);
    expect(labels(grace)).toContain("2 of 3 assessments");
  });

  it("REFUSES to report missing when no authoritative tool is declared", () => {
    const set = compute({
      declarations: [],
      assessments: [assessment("a1"), assessment("a2"), assessment("a3")],
      submissions: [submission("a1", ADA)],
    });
    expect(set.assessments.map((a) => a.missing.state)).toEqual(["not-declared", "not-declared", "not-declared"]);
    for (const row of set.rows) {
      expect(row.metrics.missingCount).toBe(0);
      expect(signalKinds(row)).not.toContain("missing-work");
    }
    expect(caveatKinds(set)).toContain("assumption-not-declared");
    expect(set.needsOutreach).toHaveLength(0);
  });

  it("REFUSES to report missing for an assessment whose assumption is violated, and says so", () => {
    const set = compute({
      assessments: [assessment("a1"), assessment("a2")],
      // a2 was graded partly in another tool, so its record is not complete.
      submissions: [submission("a1", ADA), submission("a2", ADA, { tool: OTHER_TOOL })],
    });
    const a1 = set.assessments.find((a) => a.assessmentId === "a1");
    const a2 = set.assessments.find((a) => a.assessmentId === "a2");
    expect(a1?.missing.state).toBe("computed");
    expect(a2?.missing.state).toBe("violated");
    if (a2?.missing.state === "violated") expect(a2.missing.foreignTools).toEqual([OTHER_TOOL]);
    // The wrong number is unavailable rather than quietly averaged in: Alan is
    // missing a1 only, not a1 and a2.
    expect(rowFor(set, 3).metrics.missingCount).toBe(1);
    expect(rowFor(set, 3).metrics.missingConsideredCount).toBe(1);
    const caveat = set.caveats.find((c) => c.kind === "assumption-violated");
    expect(caveat?.assessmentIds).toEqual(["a2"]);
  });

  it("treats two contradicting declarations for one work kind as no declaration", () => {
    const set = compute({
      declarations: [
        { workKind: "assignment", tool: TOOL },
        { workKind: "assignment", tool: OTHER_TOOL },
      ],
      assessments: [assessment("a1")],
      submissions: [submission("a1", ADA)],
    });
    expect(set.assessments[0].missing.state).toBe("not-declared");
  });

  it("declares per work kind, so a declared kind still computes beside an undeclared one", () => {
    const set = compute({
      declarations: [{ workKind: "discussion-post", tool: TOOL }],
      assessments: [assessment("d1", { workKind: "discussion-post" }), assessment("a1")],
      submissions: [submission("d1", ADA), submission("a1", ADA)],
    });
    expect(set.assessments.map((a) => a.missing.state)).toEqual(["computed", "not-declared"]);
  });

  it("does not report missing before the deadline, or with no deadline at all", () => {
    const set = compute({
      assessments: [assessment("a1", { deadlineAt: FUTURE }), assessment("a2", { deadlineAt: null })],
    });
    expect(set.assessments.map((a) => a.missing.state)).toEqual(["not-yet-due", "no-deadline"]);
    expect(caveatKinds(set)).toContain("deadline-not-passed");
    expect(caveatKinds(set)).toContain("no-deadline");
    expect(rowFor(set, 1).metrics.missingCount).toBe(0);
  });

  it("excludes a student who cannot be joined rather than reporting them absent", () => {
    const set = compute({
      students: [student(1, ADA), student(2, null)],
      assessments: [assessment("a1"), assessment("a2")],
      submissions: [submission("a1", ADA), submission("a2", ADA)],
    });
    const a1 = set.assessments[0];
    if (a1.missing.state !== "computed") throw new Error("expected a computed missing state");
    expect(a1.missing.missingStudentIndexes).toEqual([]);
    const ambiguous = rowFor(set, 2);
    expect(ambiguous.metrics.missingCount).toBe(0);
    expect(ambiguous.outcome).toBe("insufficient-data");
    expect(caveatKinds(set)).toContain("ambiguous-name");
  });

  it("states the ungraded gap whenever missing is reported, and not when it is not", () => {
    const withMissing = compute({
      assessments: [assessment("a1"), assessment("a2")],
      submissions: [submission("a1", ADA), submission("a2", ADA)],
    });
    expect(caveatKinds(withMissing)).toContain("ungraded-gap");
    expect(signalKinds(rowFor(withMissing, 3))).toContain("ungraded-gap");

    const everyoneSubmitted = compute({
      assessments: [assessment("a1")],
      submissions: [submission("a1", ADA), submission("a1", GRACE), submission("a1", ALAN)],
    });
    expect(everyoneSubmitted.rows.every((r) => r.metrics.missingCount === 0)).toBe(true);
    expect(caveatKinds(everyoneSubmitted)).not.toContain("ungraded-gap");
  });
});

describe("submission time is three-valued", () => {
  it("counts a dated submission after the deadline as late", () => {
    const set = compute({
      assessments: [assessment("a1")],
      submissions: [submission("a1", ADA, { submittedAt: { state: "known", submittedAt: "2026-05-20T00:00:00Z" } })],
    });
    expect(rowFor(set, 1).metrics.lateCount).toBe(1);
    expect(rowFor(set, 1).metrics.onTimeCount).toBe(0);
  });

  it("an UNKNOWN submission time is neither late nor on time", () => {
    const set = compute({
      assessments: [assessment("a1")],
      submissions: [submission("a1", ADA, { submittedAt: { state: "unknown" } })],
    });
    const ada = rowFor(set, 1);
    expect(ada.metrics.lateCount).toBe(0);
    expect(ada.metrics.onTimeCount).toBe(0);
    expect(ada.metrics.unknownTimeCount).toBe(1);
    expect(signalKinds(ada)).toContain("unknown-submission-time");
    expect(caveatKinds(set)).toContain("unknown-submission-times");
  });

  it("never resolves an unknown time against a long-past deadline in either direction", () => {
    // D23c source (3), the rejected one: a capture time would say "graded on
    // 2026-06-01, deadline was 2026-05-01, therefore late" and mark the whole
    // class. There is no field to put a capture time in, and no fallback that
    // guesses from the deadline having passed.
    const set = compute({
      assessments: [assessment("a1")],
      submissions: [
        submission("a1", ADA, { submittedAt: { state: "unknown" } }),
        submission("a1", GRACE, { submittedAt: { state: "unknown" } }),
        submission("a1", ALAN, { submittedAt: { state: "unknown" } }),
      ],
    });
    expect(set.assessments[0].lateRowCount).toBe(0);
    expect(set.assessments[0].onTimeRowCount).toBe(0);
    expect(set.assessments[0].unknownTimeRowCount).toBe(3);
    expect(set.needsOutreach).toHaveLength(0);
  });

  it("honours the instructor's own late mark, which needs no deadline and dates nothing", () => {
    const set = compute({
      assessments: [assessment("a1", { deadlineAt: null })],
      submissions: [submission("a1", ADA, { submittedAt: { state: "instructor-marked", late: true } })],
    });
    const ada = rowFor(set, 1);
    expect(ada.metrics.lateCount).toBe(1);
    expect(ada.metrics.unknownTimeCount).toBe(0);
    // Lateness is known; WHEN is not, so it cannot date a remediation action.
    expect(ada.metrics.datedRemediationCount).toBe(0);
    expect(ada.metrics.daysSinceLastDatedAction).toBeNull();
  });

  it("treats an unparseable submission timestamp as unknown, never as on time", () => {
    const set = compute({
      assessments: [assessment("a1")],
      submissions: [submission("a1", ADA, { submittedAt: { state: "known", submittedAt: "not a date" } })],
    });
    expect(rowFor(set, 1).metrics.onTimeCount).toBe(0);
    expect(rowFor(set, 1).metrics.unknownTimeCount).toBe(1);
  });
});

describe("resubmission", () => {
  it("is detected with no timestamps at all", () => {
    const set = compute({
      assessments: [assessment("a1")],
      submissions: [
        submission("a1", ADA, { submittedAt: { state: "unknown" } }),
        submission("a1", ADA, { submittedAt: { state: "unknown" } }),
      ],
    });
    const ada = rowFor(set, 1);
    expect(ada.metrics.resubmittedAssessmentCount).toBe(1);
    expect(signalKinds(ada)).toContain("resubmission");
  });

  it("REFUSES to order a resubmission when any of its times is unknown, and says so", () => {
    const set = compute({
      assessments: [assessment("a1")],
      submissions: [
        submission("a1", ADA, { submittedAt: { state: "known", submittedAt: "2026-04-20T00:00:00Z" } }),
        submission("a1", ADA, { submittedAt: { state: "unknown" } }),
      ],
    });
    const ada = rowFor(set, 1);
    expect(ada.metrics.resubmittedAssessmentCount).toBe(1);
    expect(ada.metrics.unorderedResubmissionCount).toBe(1);
    expect(labels(ada)).toContain("cannot be put in order");
    // Nothing is credited as a resubmission action, because the dated row might
    // be the original.
    expect(ada.metrics.datedRemediationCount).toBe(0);
  });

  it("orders a resubmission when every one of its rows is dated", () => {
    const set = compute({
      assessments: [assessment("a1")],
      submissions: [
        submission("a1", ADA, { submittedAt: { state: "known", submittedAt: "2026-04-20T00:00:00Z" } }),
        submission("a1", ADA, { submittedAt: { state: "known", submittedAt: "2026-04-25T00:00:00Z" } }),
      ],
    });
    const ada = rowFor(set, 1);
    expect(ada.metrics.unorderedResubmissionCount).toBe(0);
    expect(ada.metrics.datedRemediationCount).toBe(1);
    expect(labels(ada)).toContain("resubmitted");
  });
});

describe("three outcomes, and the third is not a milder second", () => {
  /** Ada submits everything on time; Grace is the subject; Alan is silent. */
  function scenario(graceRows: readonly RecordedSubmission[]): EngagementSet {
    return compute({
      assessments: [assessment("a1"), assessment("a2"), assessment("a3"), assessment("a4")],
      submissions: [
        submission("a1", ADA),
        submission("a2", ADA),
        submission("a3", ADA),
        submission("a4", ADA),
        ...graceRows,
      ],
    });
  }

  it("a DISENGAGED student - missing work and silence - is on the concern list", () => {
    const set = scenario([]);
    const alan = rowFor(set, 3);
    expect(alan.metrics.missingCount).toBe(4);
    expect(alan.metrics.recentRemediationCount).toBe(0);
    expect(alan.outcome).toBe("needs-outreach");
    expect(set.needsOutreach.map((r) => r.studentIndex)).toContain(3);
  });

  it("a RECOVERING student - late but present, recently - is NOT on the concern list", () => {
    const set = scenario([
      submission("a3", GRACE, { submittedAt: { state: "known", submittedAt: "2026-05-25T00:00:00Z" } }),
      submission("a4", GRACE, { submittedAt: { state: "known", submittedAt: "2026-05-26T00:00:00Z" } }),
    ]);
    const grace = rowFor(set, 2);
    expect(grace.metrics.missingCount).toBe(2);
    expect(grace.metrics.lateCount).toBe(2);
    expect(grace.metrics.recentRemediationCount).toBe(2);
    expect(grace.outcome).toBe("recovering");
    expect(set.recovering.map((r) => r.studentIndex)).toContain(2);
    expect(set.needsOutreach.map((r) => r.studentIndex)).not.toContain(2);
    // And the disengaged student in the same set is still flagged, so this is
    // a separation rather than a blanket softening.
    expect(set.needsOutreach.map((r) => r.studentIndex)).toContain(3);
  });

  it("recovery never removes the missing work from the row", () => {
    const set = scenario([
      // Old missing on a1/a2; a3 carries two dated rows, the later one recent.
      submission("a3", GRACE, { submittedAt: { state: "known", submittedAt: "2026-04-10T00:00:00Z" } }),
      submission("a3", GRACE, { submittedAt: { state: "known", submittedAt: "2026-05-28T00:00:00Z" } }),
      submission("a4", GRACE, { submittedAt: { state: "known", submittedAt: "2026-04-11T00:00:00Z" } }),
    ]);
    const grace = rowFor(set, 2);
    expect(grace.outcome).toBe("recovering");
    expect(grace.metrics.missingCount).toBe(2);
    const missing = grace.signals.find((s) => s.kind === "missing-work");
    expect(missing?.value).toBe(2);
    expect(missing?.label).toContain("2 of 4 assessments");
    expect(signalKinds(grace)).toContain("resubmission");
    expect(signalKinds(grace)).toContain("ungraded-gap");
  });

  it("an UNDATED remediation action does not buy recovery, and the evidence still shows", () => {
    // The line: recovery SUPPRESSES outreach, so it is never bought with work
    // that might be from last term. The resubmission stays visible on the row.
    const set = scenario([
      submission("a3", GRACE, { submittedAt: { state: "unknown" } }),
      submission("a3", GRACE, { submittedAt: { state: "unknown" } }),
      submission("a4", GRACE, { submittedAt: { state: "unknown" } }),
    ]);
    const grace = rowFor(set, 2);
    expect(grace.metrics.missingCount).toBe(2);
    expect(grace.metrics.recentRemediationCount).toBe(0);
    expect(grace.outcome).toBe("needs-outreach");
    expect(signalKinds(grace)).toContain("resubmission");
    expect(signalKinds(grace)).toContain("unknown-submission-time");
  });

  it("a STALE remediation action does not buy recovery either", () => {
    const set = scenario([
      submission("a3", GRACE, { submittedAt: { state: "known", submittedAt: "2026-05-02T00:00:00Z" } }),
      submission("a4", GRACE, { submittedAt: { state: "known", submittedAt: "2026-05-03T00:00:00Z" } }),
    ]);
    const grace = rowFor(set, 2);
    expect(grace.metrics.lateCount).toBe(2);
    expect(grace.metrics.datedRemediationCount).toBe(2);
    expect(grace.metrics.recentRemediationCount).toBe(0);
    expect(grace.outcome).toBe("needs-outreach");
  });

  it("a student with one missed deadline and nothing else is DOING WELL, not recovering", () => {
    const set = scenario([submission("a2", GRACE), submission("a3", GRACE), submission("a4", GRACE)]);
    const grace = rowFor(set, 2);
    expect(grace.metrics.missingCount).toBe(1);
    expect(grace.outcome).toBe("doing-well");
    expect(set.doingWell.map((r) => r.studentIndex)).toContain(2);
    expect(set.recovering).toHaveLength(0);
  });

  it("partitions every student into exactly one outcome, and never lists a recovering row as a concern", () => {
    const set = scenario([
      submission("a3", GRACE, { submittedAt: { state: "known", submittedAt: "2026-05-25T00:00:00Z" } }),
      submission("a4", GRACE, { submittedAt: { state: "known", submittedAt: "2026-05-26T00:00:00Z" } }),
    ]);
    const partitioned =
      set.needsOutreach.length + set.recovering.length + set.doingWell.length + set.insufficientData.length;
    expect(partitioned).toBe(set.rows.length);
    expect(set.needsOutreach.every((r) => r.outcome === "needs-outreach")).toBe(true);
    for (const row of set.recovering) {
      expect(set.needsOutreach).not.toContain(row);
    }
  });

  it("reports activity after a measured gap as its own evidence", () => {
    const set = scenario([
      submission("a2", GRACE, { submittedAt: { state: "known", submittedAt: "2026-04-01T00:00:00Z" } }),
      submission("a3", GRACE, { submittedAt: { state: "known", submittedAt: "2026-05-29T00:00:00Z" } }),
    ]);
    const grace = rowFor(set, 2);
    expect(grace.metrics.gapBeforeLastActionDays).toBe(58);
    expect(grace.metrics.daysSinceLastDatedAction).toBe(3);
    expect(signalKinds(grace)).toContain("recent-activity-after-gap");
  });

  it("reports a student nothing can be computed about, and never counts them as doing well", () => {
    const set = compute({ assessments: [], submissions: [] });
    expect(set.doingWell).toHaveLength(0);
    expect(set.insufficientData).toHaveLength(3);
    for (const row of set.rows) {
      expect(row.outcome).toBe("insufficient-data");
      expect(signalKinds(row)).toContain("insufficient-data");
    }
  });
});

describe("what the set states rather than swallows", () => {
  it("counts rows that attribute to nobody and says one may belong to a missing student", () => {
    const set = compute({
      assessments: [assessment("a1")],
      submissions: [submission("a1", ADA), submission("a1", null)],
    });
    expect(set.assessments[0].unattributedRowCount).toBe(1);
    const caveat = set.caveats.find((c) => c.kind === "unattributed-rows");
    expect(caveat?.count).toBe(1);
    expect(caveat?.detail).toContain("missing");
  });

  it("counts rows naming an assessment that is not in the list, and uses them for nothing", () => {
    const set = compute({
      assessments: [assessment("a1")],
      submissions: [submission("a1", ADA), submission("a9", GRACE)],
    });
    expect(set.caveats.find((c) => c.kind === "orphan-rows")?.count).toBe(1);
    expect(rowFor(set, 2).metrics.missingCount).toBe(1);
  });

  it("computes nothing time-dependent when the reference instant cannot be read", () => {
    const set = compute({
      now: "not a date",
      assessments: [assessment("a1")],
      submissions: [submission("a1", ADA)],
    });
    expect(set.assessments[0].missing.state).toBe("no-reference-time");
    expect(caveatKinds(set)).toContain("no-reference-time");
    expect(set.needsOutreach).toHaveLength(0);
  });

  it("emits no student name or key anywhere in the set", () => {
    const set = compute({
      assessments: [assessment("a1"), assessment("a2")],
      submissions: [submission("a1", ADA), submission("a1", null)],
    });
    const serialised = JSON.stringify(set);
    for (const key of [ADA, GRACE, ALAN, "ada", "grace", "alan"]) {
      expect(serialised.toLowerCase()).not.toContain(key.toLowerCase());
    }
  });

  it("is deterministic: the same inputs produce the same set", () => {
    const args: Partial<ComputeEngagementArgs> = {
      assessments: [assessment("a1"), assessment("a2")],
      submissions: [
        submission("a1", ADA),
        submission("a2", GRACE, { submittedAt: { state: "known", submittedAt: "2026-05-20T00:00:00Z" } }),
      ],
    };
    expect(JSON.stringify(compute(args))).toBe(JSON.stringify(compute(args)));
  });
});
