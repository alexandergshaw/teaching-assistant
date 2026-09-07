import { describe, it, expect } from "vitest";
import {
  buildCourseIntelAssembly,
  computeMissingRollup,
  effectiveDueAt,
  isConsideredForMissing,
  isSyntheticStudentName,
  normaliseUserId,
  type DiscussionEntryInput,
  type JoinInput,
  type SubmissionFactInput,
} from "./join";
import type { CourseAssignmentBrief, StudentSubmissionFact } from "./types";

const NOW = "2026-06-01T00:00:00Z";
const PAST = "2026-05-01T00:00:00Z";
const FUTURE = "2026-07-01T00:00:00Z";

function assignment(id: string, over: Partial<CourseAssignmentBrief> = {}): CourseAssignmentBrief {
  return {
    assignmentId: id,
    name: `Assignment ${id}`,
    dueAt: PAST,
    pointsPossible: 100,
    published: true,
    omitFromFinalGrade: false,
    ...over,
  };
}

function fact(over: Partial<StudentSubmissionFact> & { assignmentId: string }): StudentSubmissionFact {
  return {
    score: null,
    pointsPossible: 100,
    workflowState: "unsubmitted",
    submittedAt: null,
    late: false,
    missing: false,
    excused: false,
    dueAt: null,
    dueAtPresent: false,
    ...over,
  };
}

function submission(userId: number, over: Partial<StudentSubmissionFact> & { assignmentId: string }): SubmissionFactInput {
  return { userId, ...fact(over) };
}

function entry(over: Partial<DiscussionEntryInput> & { userId: number; id: string }): DiscussionEntryInput {
  return {
    kind: "discussion-post",
    container: "Week 1",
    createdAt: PAST,
    parentUserId: null,
    text: "hello",
    ...over,
  };
}

function input(over: Partial<JoinInput> = {}): JoinInput {
  return {
    courseHubId: "hub-1",
    institution: "TEST",
    canvasCourseId: "900",
    courseName: "Intro",
    assembledAt: NOW,
    tier: "signals",
    roster: [],
    grades: { state: "not-fetched", reason: "signals tier" },
    submissions: { state: "not-fetched", reason: "signals tier" },
    discussion: { state: "not-fetched", reason: "signals tier" },
    messageThreads: { state: "not-fetched", reason: "signals tier" },
    messageBodies: { state: "not-fetched", reason: "signals tier" },
    assignments: [],
    announcements: [],
    ...over,
  };
}

describe("normaliseUserId - the single boundary where the key's type is reconciled", () => {
  it("accepts the number the discussion and submission readers produce", () => {
    expect(normaliseUserId(4021)).toBe(4021);
  });

  it("accepts the string listStudentGradeSummaries and listCourseRoster produce", () => {
    expect(normaliseUserId("4021")).toBe(4021);
  });

  it("rejects everything that would coerce to a plausible-looking id", () => {
    // Number("") is 0 and Number("12abc") is NaN; a user id of 0 attributed to
    // a real student's writing is a silent merge, which is the failure the key
    // exists to prevent.
    expect(normaliseUserId("")).toBeNull();
    expect(normaliseUserId("  ")).toBeNull();
    expect(normaliseUserId("12abc")).toBeNull();
    expect(normaliseUserId("4021.5")).toBeNull();
    expect(normaliseUserId(0)).toBeNull();
    expect(normaliseUserId(-3)).toBeNull();
    expect(normaliseUserId(4021.5)).toBeNull();
    expect(normaliseUserId(null)).toBeNull();
    expect(normaliseUserId(undefined)).toBeNull();
  });
});

describe("the join keys on the numeric user id and nothing else", () => {
  it("joins a string-keyed grade row to a number-keyed submission row for the same student", () => {
    const assembly = buildCourseIntelAssembly(
      input({
        roster: [{ id: "4021", name: "Alex Shaw", sortableName: "Shaw, Alex" }],
        grades: { state: "loaded", value: [{ userId: "4021", name: "Alex Shaw", currentScore: 61, finalScore: 58 }] },
        submissions: { state: "loaded", value: [submission(4021, { assignmentId: "a1", missing: true })] },
        assignments: [assignment("a1")],
      })
    );

    expect(assembly.students).toHaveLength(1);
    const student = assembly.students[0];
    expect(student.userId).toBe(4021);
    expect(student.grades).toEqual({ state: "loaded", value: { currentScore: 61, finalScore: 58 } });
    expect(student.submissions.state).toBe("loaded");
  });

  it("keeps two students who share a display name apart", () => {
    // AC1's whole point. Two Jamie Lees, different ids, different work.
    const assembly = buildCourseIntelAssembly(
      input({
        roster: [
          { id: "1", name: "Jamie Lee", sortableName: "Lee, Jamie" },
          { id: "2", name: "Jamie Lee", sortableName: "Lee, Jamie" },
        ],
        submissions: {
          state: "loaded",
          value: [submission(1, { assignmentId: "a1", missing: true }), submission(2, { assignmentId: "a1", workflowState: "graded", score: 95, submittedAt: PAST })],
        },
        assignments: [assignment("a1")],
      })
    );

    expect(assembly.students.map((s) => s.userId)).toEqual([1, 2]);
    const [first, second] = assembly.students;
    expect(first.submissions.state === "loaded" && first.submissions.value.rollup.missingCount).toBe(1);
    expect(second.submissions.state === "loaded" && second.submissions.value.rollup.missingCount).toBe(0);
  });

  it("assigns 1-based indices in roster order, then off-roster ids ascending", () => {
    const assembly = buildCourseIntelAssembly(
      input({
        roster: [
          { id: "10", name: "A", sortableName: "A" },
          { id: "11", name: "B", sortableName: "B" },
        ],
        discussion: { state: "loaded", value: [entry({ userId: 99, id: "d1" }), entry({ userId: 50, id: "d2" })] },
      })
    );
    expect(assembly.students.map((s) => [s.index, s.userId])).toEqual([
      [1, 10],
      [2, 11],
      [3, 50],
      [4, 99],
    ]);
  });
});

describe("off-roster participants are reported, never merged and never dropped", () => {
  it("gives a thread-only user id its own record marked off-roster, plus an omission", () => {
    const assembly = buildCourseIntelAssembly(
      input({
        roster: [{ id: "1", name: "Real Student", sortableName: "Student, Real" }],
        discussion: { state: "loaded", value: [entry({ userId: 777, id: "d1", text: "I dropped last week" })] },
      })
    );

    const offRoster = assembly.students.find((s) => s.userId === 777);
    expect(offRoster).toBeDefined();
    expect(offRoster?.onRoster).toBe(false);
    expect(assembly.students.find((s) => s.userId === 1)?.onRoster).toBe(true);
    expect(assembly.omissions.some((o) => o.kind === "off-roster-participant" && o.count === 1)).toBe(true);
  });

  it("names an off-roster participant from the id, never from a self-supplied display name", () => {
    const assembly = buildCourseIntelAssembly(
      input({ discussion: { state: "loaded", value: [entry({ userId: 777, id: "d1" })] } })
    );
    const offRoster = assembly.students[0];
    expect(isSyntheticStudentName(offRoster.name)).toBe(true);
    expect(offRoster.name).toContain("777");
  });

  it("records rows whose user id could not be read rather than dropping them silently", () => {
    const assembly = buildCourseIntelAssembly(
      input({
        roster: [{ id: "not-a-number", name: "X", sortableName: "X" }],
        grades: { state: "loaded", value: [{ userId: "", name: "Y", currentScore: 10, finalScore: 10 }] },
      })
    );
    expect(assembly.students).toHaveLength(0);
    const omission = assembly.omissions.find((o) => o.kind === "source-failed");
    expect(omission?.count).toBe(2);
  });
});

describe("Presence is filled honestly - not-fetched is never an empty result", () => {
  it("carries a not-fetched source through to every student rather than flattening it", () => {
    const assembly = buildCourseIntelAssembly(
      input({
        roster: [{ id: "1", name: "A", sortableName: "A" }],
        submissions: { state: "not-fetched", reason: "signals tier does not fetch submissions" },
      })
    );
    const student = assembly.students[0];
    expect(student.submissions.state).toBe("not-fetched");
    expect(student.submissions.state === "not-fetched" && student.submissions.reason).toContain("signals tier");
  });

  it("distinguishes a failed source from an empty one", () => {
    const assembly = buildCourseIntelAssembly(
      input({
        roster: [{ id: "1", name: "A", sortableName: "A" }],
        discussion: { state: "failed", reason: "Canvas returned 403" },
        grades: { state: "loaded", value: [] },
      })
    );
    const student = assembly.students[0];
    expect(student.discussion.state).toBe("failed");
    expect(student.grades.state).toBe("none");
  });

  it("reports a loaded submission source with zero rows for a student as none, not as zero submissions", () => {
    const assembly = buildCourseIntelAssembly(
      input({
        roster: [
          { id: "1", name: "A", sortableName: "A" },
          { id: "2", name: "B", sortableName: "B" },
        ],
        submissions: { state: "loaded", value: [submission(1, { assignmentId: "a1" })] },
        assignments: [assignment("a1")],
      })
    );
    expect(assembly.students[1].submissions.state).toBe("none");
  });

  it("keeps message bodies under their own Presence when only the cheap index was fetched", () => {
    const assembly = buildCourseIntelAssembly(
      input({
        roster: [{ id: "1", name: "A", sortableName: "A" }],
        messageThreads: {
          state: "loaded",
          value: [{ userId: 1, conversationId: 5, subject: "Question", lastMessageAt: PAST, messageCount: 2 }],
        },
        messageBodies: { state: "not-fetched", reason: "one call per conversation" },
      })
    );
    const messages = assembly.students[0].messages;
    expect(messages.state).toBe("loaded");
    expect(messages.state === "loaded" && messages.value.bodies.state).toBe("not-fetched");
  });
});

describe("the missing rollup denominator", () => {
  const byId = (list: CourseAssignmentBrief[]) => new Map(list.map((a) => [a.assignmentId, a]));
  const nowMs = Date.parse(NOW);

  it("counts only published, non-omitted assignments whose effective due date has passed", () => {
    const assignments = byId([
      assignment("past"),
      assignment("future", { dueAt: FUTURE }),
      assignment("unpublished", { published: false }),
      assignment("omitted", { omitFromFinalGrade: true }),
      assignment("undated", { dueAt: null }),
    ]);
    const rollup = computeMissingRollup(
      [
        fact({ assignmentId: "past", missing: true }),
        fact({ assignmentId: "future", missing: true }),
        fact({ assignmentId: "unpublished", missing: true }),
        fact({ assignmentId: "omitted", missing: true }),
        fact({ assignmentId: "undated", missing: true }),
      ],
      assignments,
      nowMs
    );
    // Both numbers in "1 of 1" come from the same set. An assignment nobody
    // could have submitted yet is not missing work.
    expect(rollup).toMatchObject({ consideredCount: 1, missingCount: 1 });
  });

  it("uses the student's own effective due date over the assignment's when Canvas supplied one", () => {
    const brief = assignment("a1", { dueAt: PAST });
    // Canvas spoke for this student and gave them a later deadline.
    expect(effectiveDueAt(fact({ assignmentId: "a1", dueAt: FUTURE, dueAtPresent: true }), brief)).toBe(FUTURE);
    expect(isConsideredForMissing(fact({ assignmentId: "a1", dueAt: FUTURE, dueAtPresent: true }), brief, nowMs)).toBe(false);
    // Canvas said nothing, so the assignment's base date applies.
    expect(effectiveDueAt(fact({ assignmentId: "a1", dueAtPresent: false }), brief)).toBe(PAST);
    expect(isConsideredForMissing(fact({ assignmentId: "a1", dueAtPresent: false }), brief, nowMs)).toBe(true);
  });

  it("treats a student with no deadline of their own as out of the denominator", () => {
    const brief = assignment("a1", { dueAt: PAST });
    // dueAtPresent true with a null dueAt means "no deadline for them", which
    // a single nullable field could not tell apart from "ask the assignment".
    expect(isConsideredForMissing(fact({ assignmentId: "a1", dueAt: null, dueAtPresent: true }), brief, nowMs)).toBe(false);
  });

  it("keeps an unknown published flag in the denominator, and only an explicit false out", () => {
    const unknown = byId([assignment("a1", { published: null })]);
    expect(computeMissingRollup([fact({ assignmentId: "a1", missing: true })], unknown, nowMs).consideredCount).toBe(1);
  });

  it("excludes a submission whose assignment brief is unknown", () => {
    expect(computeMissingRollup([fact({ assignmentId: "ghost", missing: true })], byId([]), nowMs).consideredCount).toBe(0);
  });

  it("counts excused work separately and never as missing or late", () => {
    const rollup = computeMissingRollup(
      [fact({ assignmentId: "a1", missing: true, late: true, excused: true })],
      byId([assignment("a1")]),
      nowMs
    );
    expect(rollup).toMatchObject({ consideredCount: 1, excusedCount: 1, missingCount: 0, lateCount: 0 });
  });

  it("separates graded work from submitted-but-ungraded work", () => {
    const rollup = computeMissingRollup(
      [
        fact({ assignmentId: "a1", workflowState: "graded", score: 80, submittedAt: PAST }),
        fact({ assignmentId: "a2", workflowState: "submitted", submittedAt: PAST }),
        fact({ assignmentId: "a3", workflowState: "unsubmitted", missing: true }),
      ],
      byId([assignment("a1"), assignment("a2"), assignment("a3")]),
      nowMs
    );
    expect(rollup).toMatchObject({
      consideredCount: 3,
      gradedCount: 1,
      ungradedSubmittedCount: 1,
      missingCount: 1,
    });
  });

  it("uses Canvas's own missing flag rather than re-deriving it from submittedAt", () => {
    // A teacher's manual "mark missing" override on work that WAS submitted.
    const rollup = computeMissingRollup(
      [fact({ assignmentId: "a1", submittedAt: PAST, missing: true, workflowState: "submitted" })],
      byId([assignment("a1")]),
      nowMs
    );
    expect(rollup.missingCount).toBe(1);
  });
});

describe("reply direction, both ways", () => {
  it("records who a student replied to and who replied to them", () => {
    const assembly = buildCourseIntelAssembly(
      input({
        roster: [
          { id: "1", name: "A", sortableName: "A" },
          { id: "2", name: "B", sortableName: "B" },
        ],
        discussion: {
          state: "loaded",
          value: [
            entry({ userId: 1, id: "d1", kind: "discussion-post" }),
            entry({ userId: 2, id: "d2", kind: "discussion-reply", parentUserId: 1 }),
            entry({ userId: 2, id: "d3", kind: "discussion-reply", parentUserId: 1 }),
          ],
        },
      })
    );
    const a = assembly.students[0];
    const b = assembly.students[1];
    expect(a.discussion.state === "loaded" && a.discussion.value.repliedToBy).toEqual([{ userId: 2, count: 2 }]);
    expect(b.discussion.state === "loaded" && b.discussion.value.repliedTo).toEqual([{ userId: 1, count: 2 }]);
    expect(b.discussion.state === "loaded" && b.discussion.value.posts).toHaveLength(0);
    expect(b.discussion.state === "loaded" && b.discussion.value.replies).toHaveLength(2);
  });

  it("splits posts from replies on kind, not on whether a parent id was readable", () => {
    const assembly = buildCourseIntelAssembly(
      input({
        roster: [{ id: "1", name: "A", sortableName: "A" }],
        discussion: {
          state: "loaded",
          value: [entry({ userId: 1, id: "d1", kind: "discussion-reply", parentUserId: null })],
        },
      })
    );
    const a = assembly.students[0];
    expect(a.discussion.state === "loaded" && a.discussion.value.posts).toHaveLength(0);
    expect(a.discussion.state === "loaded" && a.discussion.value.replies).toHaveLength(1);
  });
});

describe("lastActivityAt", () => {
  it("takes the latest timestamp across every loaded source", () => {
    const assembly = buildCourseIntelAssembly(
      input({
        roster: [{ id: "1", name: "A", sortableName: "A" }],
        discussion: { state: "loaded", value: [entry({ userId: 1, id: "d1", createdAt: "2026-03-01T00:00:00Z" })] },
        messageThreads: {
          state: "loaded",
          value: [{ userId: 1, conversationId: 1, subject: "s", lastMessageAt: "2026-04-01T00:00:00Z", messageCount: 1 }],
        },
        messageBodies: { state: "none" },
      })
    );
    expect(assembly.students[0].lastActivityAt).toBe("2026-04-01T00:00:00Z");
  });

  it("is null when nothing loaded carried a timestamp, which is not the same as inactive", () => {
    const assembly = buildCourseIntelAssembly(
      input({
        roster: [{ id: "1", name: "A", sortableName: "A" }],
        discussion: { state: "not-fetched", reason: "signals tier" },
      })
    );
    expect(assembly.students[0].lastActivityAt).toBeNull();
  });
});

describe("omissions", () => {
  it("states the uncountable message course-filter caveat on every assembly", () => {
    const assembly = buildCourseIntelAssembly(input());
    const caveat = assembly.omissions.find((o) => o.kind === "course-filter-best-effort");
    expect(caveat).toBeDefined();
    expect(caveat?.count).toBeUndefined();
    expect(caveat?.detail).toContain("Canvas associated them with this course");
  });

  it("carries the caller's own omissions through", () => {
    const assembly = buildCourseIntelAssembly(
      input({ omissions: [{ kind: "topic-over-cap", detail: "3 topics beyond the cap", count: 3 }] })
    );
    expect(assembly.omissions.some((o) => o.kind === "topic-over-cap" && o.count === 3)).toBe(true);
  });
});

describe("isSyntheticStudentName", () => {
  it("is true only for a label built from a user id", () => {
    expect(isSyntheticStudentName("Canvas user 4021")).toBe(true);
    expect(isSyntheticStudentName("Canvas user")).toBe(false);
    expect(isSyntheticStudentName("Alex Shaw")).toBe(false);
    expect(isSyntheticStudentName("Canvas user Alex")).toBe(false);
  });
});
