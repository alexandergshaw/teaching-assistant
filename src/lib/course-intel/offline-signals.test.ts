import { describe, it, expect } from "vitest";
import { buildOfflineIdentityIndex, offlineStudentKey } from "./offline-identity";
import { computeOfflineConcernSet } from "./offline-signals";
import type {
  ComputeOfflineConcernSetArgs,
  OfflineConcernRow,
  OfflineRecordedParticipation,
  OfflineRecordedScore,
} from "./offline-signals";
import type { ConcernThresholds } from "./types";

const COURSE = "c1";
const NOW = "2026-06-01T00:00:00Z";
const THRESHOLDS: ConcernThresholds = { lowScorePercent: 65, minMissingCount: 2, staleActivityDays: 14 };

const ADA = "Ada Lovelace";
const GRACE = "Grace Hopper";
const ALAN = "Alan Turing";

function keyFor(name: string): string {
  const key = offlineStudentKey(COURSE, name);
  if (key === null) throw new Error(`no key for ${name}`);
  return key;
}

function roster(names: readonly string[] = [ADA, GRACE, ALAN]) {
  return buildOfflineIdentityIndex({ courseHubId: COURSE, rosterNames: names, studentRepos: [] }).students;
}

function score(over: Partial<OfflineRecordedScore> & { assessmentId: string }): OfflineRecordedScore {
  return {
    studentKey: keyFor(ADA),
    score: 10,
    pointsPossible: 10,
    recordedAt: "2026-05-31T00:00:00Z",
    ...over,
  };
}

function compute(over: Partial<ComputeOfflineConcernSetArgs> = {}) {
  return computeOfflineConcernSet({
    students: roster(),
    scores: [],
    participation: [],
    thresholds: THRESHOLDS,
    now: NOW,
    ...over,
  });
}

function rowFor(rows: readonly OfflineConcernRow[], index: number): OfflineConcernRow {
  const row = rows.find((r) => r.studentIndex === index);
  if (!row) throw new Error(`no row for student ${index}`);
  return row;
}

function labels(row: OfflineConcernRow): string {
  return row.signals.map((s) => s.label).join(" | ");
}

describe("the offline denominator", () => {
  it("counts only assessments the instructor actually recorded a grade for", () => {
    // a3 was captured for Ada but never scored, so nobody has been graded on
    // it and it is not missing work for anyone.
    const set = compute({
      scores: [
        score({ assessmentId: "a1" }),
        score({ assessmentId: "a1", studentKey: keyFor(GRACE), score: 6 }),
        score({ assessmentId: "a2" }),
        score({ assessmentId: "a3", score: null }),
      ],
    });
    expect(set.recordedAssessmentIds).toEqual(["a1", "a2"]);
  });

  it("draws both numbers of the missing sentence from that same set", () => {
    const scores: OfflineRecordedScore[] = [];
    for (let i = 1; i <= 8; i += 1) scores.push(score({ assessmentId: `a${i}` }));
    // Grace was graded on five of the eight.
    for (let i = 1; i <= 5; i += 1) {
      scores.push(score({ assessmentId: `a${i}`, studentKey: keyFor(GRACE), score: 9 }));
    }

    const set = compute({ scores });
    const grace = rowFor(set.rows, 2);
    expect(set.recordedAssessmentIds).toHaveLength(8);
    expect(grace.rollup.kind).toBe("recorded");
    if (grace.rollup.kind !== "recorded") throw new Error("expected a recorded rollup");
    expect(grace.rollup.notRecordedForStudentCount).toBe(3);
    expect(grace.rollup.recordedAssessmentCount).toBe(8);
    expect(labels(grace)).toContain("3 of 8");
  });

  it("still counts an assessment toward the denominator when the captured name resolved to nobody", () => {
    const set = compute({
      scores: [score({ assessmentId: "a1" }), score({ assessmentId: "a2", studentKey: null, score: 4 })],
    });
    expect(set.recordedAssessmentIds).toEqual(["a1", "a2"]);
    expect(set.unattributedScoreCount).toBe(1);
  });
});

describe("a student the recording suite has never seen", () => {
  it("is insufficient-data, never missing all of them", () => {
    const scores: OfflineRecordedScore[] = [];
    for (let i = 1; i <= 8; i += 1) scores.push(score({ assessmentId: `a${i}` }));

    const set = compute({ scores });
    const alan = rowFor(set.rows, 3);

    expect(alan.signals.map((s) => s.kind)).toEqual(["insufficient-data"]);
    expect(alan.rollup.kind).toBe("never-recorded");
    // Structural, not a convention: the never-recorded variant has no
    // not-recorded count for a consumer to render "8 of 8" from.
    expect("notRecordedForStudentCount" in alan.rollup).toBe(false);
    expect(labels(alan)).not.toMatch(/\d+ of \d+/);
    expect(labels(alan)).toMatch(/not recorded any graded work/i);
  });

  it("is reported rather than omitted from the set", () => {
    const set = compute({ scores: [score({ assessmentId: "a1" })] });
    expect(set.rows.some((r) => r.studentIndex === 3)).toBe(true);
  });

  it("sorts below every signalled row, because it is a different kind of statement", () => {
    const scores: OfflineRecordedScore[] = [];
    for (let i = 1; i <= 4; i += 1) scores.push(score({ assessmentId: `a${i}` }));
    scores.push(score({ assessmentId: "a1", studentKey: keyFor(GRACE), score: 1 }));

    const set = compute({ scores });
    expect(set.rows[set.rows.length - 1].studentIndex).toBe(3);
    expect(set.rows[set.rows.length - 1].sortWeight).toBe(-1);
  });
});

describe("recorded-score signals", () => {
  it("honours the instructor's minimum before calling unrecorded work a concern", () => {
    const scores = [
      score({ assessmentId: "a1" }),
      score({ assessmentId: "a2" }),
      score({ assessmentId: "a1", studentKey: keyFor(GRACE), score: 10 }),
    ];
    const set = compute({ scores });
    // Grace is unrecorded on one of two, below minMissingCount 2.
    expect(set.rows.find((r) => r.studentIndex === 2)).toBeUndefined();

    const stricter = compute({ scores, thresholds: { ...THRESHOLDS, minMissingCount: 1 } });
    expect(rowFor(stricter.rows, 2).signals.map((s) => s.kind)).toContain("missing-work");
  });

  it("flags a low recorded average and names how many assessments it covers", () => {
    const set = compute({
      scores: [
        score({ assessmentId: "a1", studentKey: keyFor(GRACE), score: 5 }),
        score({ assessmentId: "a2", studentKey: keyFor(GRACE), score: 7 }),
      ],
    });
    const grace = rowFor(set.rows, 2);
    const low = grace.signals.find((s) => s.kind === "low-score");
    expect(low).toBeDefined();
    expect(low?.value).toBeCloseTo(60);
    expect(low?.label).toContain("60%");
    expect(low?.label).toContain("2 graded assessments");
  });

  it("excludes a score with no usable points possible from the average and counts it", () => {
    const set = compute({
      scores: [
        score({ assessmentId: "a1", studentKey: keyFor(GRACE), score: 5, pointsPossible: 10 }),
        score({ assessmentId: "a2", studentKey: keyFor(GRACE), score: 5, pointsPossible: null }),
      ],
    });
    const grace = rowFor(set.rows, 2);
    if (grace.rollup.kind !== "recorded") throw new Error("expected a recorded rollup");
    expect(grace.rollup.scoredCount).toBe(2);
    expect(grace.rollup.unscalablePointsCount).toBe(1);
    expect(grace.rollup.averagedAssessmentCount).toBe(1);
    expect(grace.rollup.averagePercent).toBeCloseTo(50);
    // The sentence must not claim the average covered both.
    expect(labels(grace)).toContain("1 graded assessment");
    expect(labels(grace)).not.toContain("2 graded assessments");
  });

  it("lets a re-capture of the same assessment supersede the earlier read", () => {
    // A misread corrected upward: Grace is not on the list, and the two rows
    // are not averaged into a middling 55%.
    const corrected = compute({
      scores: [
        score({ assessmentId: "a1", studentKey: keyFor(GRACE), score: 2 }),
        score({ assessmentId: "a1", studentKey: keyFor(GRACE), score: 9 }),
      ],
    });
    expect(corrected.rows.find((r) => r.studentIndex === 2)).toBeUndefined();

    // The same correction the other way round still counts once.
    const downward = compute({
      scores: [
        score({ assessmentId: "a1", studentKey: keyFor(GRACE), score: 9 }),
        score({ assessmentId: "a1", studentKey: keyFor(GRACE), score: 2 }),
      ],
    });
    const grace = rowFor(downward.rows, 2);
    if (grace.rollup.kind !== "recorded") throw new Error("expected a recorded rollup");
    expect(grace.rollup.scoredCount).toBe(1);
    expect(grace.rollup.averagePercent).toBeCloseTo(20);
  });

  it("keeps a captured-but-unscored row as context only, never as a trigger", () => {
    const set = compute({
      students: roster([ADA, GRACE]),
      scores: [
        score({ assessmentId: "a1" }),
        score({ assessmentId: "a1", studentKey: keyFor(GRACE), score: null }),
      ],
    });
    // Grace's only fact is the instructor's own unscored capture. That is not
    // a concern about Grace.
    expect(set.rows.find((r) => r.studentIndex === 2)).toBeUndefined();
    expect(set.clearCount).toBe(2);
  });

  it("attaches the unscored backlog to a row that already qualified", () => {
    const set = compute({
      scores: [
        score({ assessmentId: "a1", studentKey: keyFor(GRACE), score: 3 }),
        score({ assessmentId: "a2", studentKey: keyFor(GRACE), score: null }),
      ],
    });
    const grace = rowFor(set.rows, 2);
    expect(grace.signals.map((s) => s.kind)).toContain("low-score");
    expect(grace.signals.map((s) => s.kind)).toContain("ungraded-backlog");
  });

  it("never emits late-work, which has no offline analogue", () => {
    const scores: OfflineRecordedScore[] = [];
    for (let i = 1; i <= 6; i += 1) scores.push(score({ assessmentId: `a${i}`, score: 2 }));
    scores.push(score({ assessmentId: "a1", studentKey: keyFor(GRACE), score: 1 }));
    const set = compute({ scores });
    const kinds = set.rows.flatMap((r) => r.signals.map((s) => s.kind));
    expect(kinds).not.toContain("late-work");
  });
});

describe("recorded recency", () => {
  const scoresOn = (iso: string, studentKey: string, assessmentId: string, points: number) =>
    score({ assessmentId, studentKey, score: points, recordedAt: iso });

  it("does not flag the whole class when the instructor simply stopped recording", () => {
    const set = compute({
      students: roster([ADA, GRACE]),
      scores: [
        scoresOn("2026-05-01T00:00:00Z", keyFor(ADA), "a1", 10),
        scoresOn("2026-05-01T00:00:00Z", keyFor(GRACE), "a1", 10),
      ],
    });
    const kinds = set.rows.flatMap((r) => r.signals.map((s) => s.kind));
    expect(kinds).not.toContain("no-recent-activity");
    expect(set.clearCount).toBe(2);
  });

  it("flags a student whose classmates have more recent recorded work", () => {
    const set = compute({
      students: roster([ADA, GRACE]),
      scores: [
        scoresOn("2026-05-01T00:00:00Z", keyFor(ADA), "a1", 10),
        scoresOn("2026-05-01T00:00:00Z", keyFor(GRACE), "a1", 10),
        scoresOn("2026-05-31T00:00:00Z", keyFor(GRACE), "a2", 10),
      ],
    });
    const ada = rowFor(set.rows, 1);
    expect(ada.signals.map((s) => s.kind)).toContain("no-recent-activity");
    expect(set.rows.find((r) => r.studentIndex === 2)).toBeUndefined();
  });

  it("counts captured discussion participation as recorded activity", () => {
    const participation: OfflineRecordedParticipation[] = [
      { studentKey: keyFor(ADA), kind: "reply", occurredAt: "2026-05-30T00:00:00Z" },
    ];
    const set = compute({
      students: roster([ADA, GRACE]),
      scores: [
        scoresOn("2026-05-01T00:00:00Z", keyFor(ADA), "a1", 10),
        scoresOn("2026-05-01T00:00:00Z", keyFor(GRACE), "a1", 10),
        scoresOn("2026-05-31T00:00:00Z", keyFor(GRACE), "a2", 10),
      ],
      participation,
    });
    // Ada posted two days ago, so she is not quiet even though her last
    // recorded grade is a month old.
    const kinds = set.rows.flatMap((r) => r.signals.map((s) => s.kind));
    expect(kinds).not.toContain("no-recent-activity");
    const ada = set.rows.find((r) => r.studentIndex === 1);
    expect(ada).toBeUndefined();
  });

  it("carries participation counts on the rollup", () => {
    const set = compute({
      students: roster([ADA, GRACE]),
      scores: [score({ assessmentId: "a1", studentKey: keyFor(GRACE), score: 1 })],
      participation: [
        { studentKey: keyFor(GRACE), kind: "post", occurredAt: null },
        { studentKey: keyFor(GRACE), kind: "reply", occurredAt: null },
        { studentKey: keyFor(GRACE), kind: "reply", occurredAt: null },
        { studentKey: null, kind: "reply", occurredAt: null },
      ],
    });
    const grace = rowFor(set.rows, 2);
    if (grace.rollup.kind !== "recorded") throw new Error("expected a recorded rollup");
    expect(grace.rollup.discussionPostCount).toBe(1);
    expect(grace.rollup.discussionReplyCount).toBe(2);
    expect(set.unattributedParticipationCount).toBe(1);
  });
});

describe("an ambiguous student", () => {
  it("is reported as a question for the instructor, not graded on a guess", () => {
    const students = roster(["Alex Chen", "Alex Chen"]);
    const set = computeOfflineConcernSet({
      students,
      // A row whose captured name could not be resolved to one of them.
      scores: [{ assessmentId: "a1", studentKey: null, score: 2, pointsPossible: 10, recordedAt: NOW }],
      participation: [],
      thresholds: THRESHOLDS,
      now: NOW,
    });

    expect(set.rows).toHaveLength(2);
    for (const row of set.rows) {
      expect(row.identitySource).toBe("ambiguous-name");
      expect(row.userId).toBeNull();
      expect(row.signals.map((s) => s.kind)).toEqual(["insufficient-data"]);
      expect(labels(row)).toMatch(/more than one student/i);
      expect(labels(row)).not.toMatch(/have not recorded any graded work/i);
    }
    expect(set.unattributedScoreCount).toBe(1);
  });
});

describe("what leaves this module", () => {
  it("carries no student name or join key on a row", () => {
    const set = compute({
      scores: [
        score({ assessmentId: "a1", studentKey: keyFor(GRACE), score: 1 }),
        score({ assessmentId: "a2" }),
      ],
    });
    for (const row of set.rows) {
      expect(Object.keys(row).sort()).toEqual(
        ["identitySource", "rollup", "signals", "sortWeight", "studentIndex", "userId"].sort()
      );
      const rendered = `${labels(row)} ${JSON.stringify(row)}`;
      for (const name of [ADA, GRACE, ALAN, "ada lovelace", "grace hopper", "alan turing"]) {
        expect(rendered.toLowerCase()).not.toContain(name.toLowerCase());
      }
    }
  });

  it("carries a cached Canvas id through, and never invents one", () => {
    const students = buildOfflineIdentityIndex({
      courseHubId: COURSE,
      rosterNames: [ADA, GRACE],
      studentRepos: [{ student: GRACE, canvasUserId: "4242" }],
    }).students;

    const set = computeOfflineConcernSet({
      students,
      scores: [
        { assessmentId: "a1", studentKey: keyFor(ADA), score: 1, pointsPossible: 10, recordedAt: NOW },
        { assessmentId: "a1", studentKey: keyFor(GRACE), score: 1, pointsPossible: 10, recordedAt: NOW },
      ],
      participation: [],
      thresholds: THRESHOLDS,
      now: NOW,
    });

    expect(rowFor(set.rows, 1).userId).toBeNull();
    expect(rowFor(set.rows, 1).identitySource).toBe("course-roster-name");
    expect(rowFor(set.rows, 2).userId).toBe(4242);
    expect(rowFor(set.rows, 2).identitySource).toBe("cached-canvas-id");
  });

  it("is deterministic: the same inputs produce the same set", () => {
    const scores = [
      score({ assessmentId: "a1" }),
      score({ assessmentId: "a2", studentKey: keyFor(GRACE), score: 3 }),
    ];
    expect(compute({ scores })).toEqual(compute({ scores }));
  });
});
