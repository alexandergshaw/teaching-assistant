// Tests for ./question-scope - the module that carries D7's guarantee.
//
// The property under test is not "the rewrite works". It is that a real
// student's name CANNOT reach a composed prompt through the instructor's own
// question, which is the one path every other pseudonymisation in this feature
// leaves open: the prompt builder embeds the question verbatim, twice, and is
// given no roster to check it against.
//
// So the central test composes the whole prompt for real - assembly, context
// block, turns - and asserts on the bytes that would go to the model, rather
// than asserting on this module's own return value and trusting the rest.

import { describe, it, expect } from "vitest";

import {
  SINGLE_TOKEN_STOPWORDS,
  assertNoStudentNameRemains,
  scopeCourseIntelQuestion,
  shapeNeedsStudentText,
  studentNameVariants,
  type ScopeRosterEntry,
} from "./question-scope";
import { buildCourseIntelAssembly } from "./join";
import { buildCourseIntelContext } from "./context-block";
import { buildStudentQuestionTurns } from "./prompt";

const ALEX: ScopeRosterEntry = {
  index: 1,
  userId: 4021,
  name: "Alex Rivera",
  sortableName: "Rivera, Alex",
};
const JORDAN: ScopeRosterEntry = {
  index: 2,
  userId: 4022,
  name: "Jordan Blake",
  sortableName: "Blake, Jordan",
};
const OTHER_ALEX: ScopeRosterEntry = {
  index: 3,
  userId: 4023,
  name: "Alex Chen",
  sortableName: "Chen, Alex",
};

function scoped(question: string, roster: readonly ScopeRosterEntry[] = [ALEX, JORDAN]) {
  const result = scopeCourseIntelQuestion({ question, roster });
  if (result.status !== "scoped") throw new Error(`expected a scoped result, got ${result.status}`);
  return result;
}

describe("studentNameVariants", () => {
  it("recognises the display name, the sortable name, and the sortable name flipped", () => {
    const variants = studentNameVariants(ALEX);
    expect(variants).toContain("alex rivera");
    expect(variants).toContain("rivera alex");
  });

  it("adds single tokens as a fallback but never a stopword", () => {
    expect(studentNameVariants(ALEX)).toContain("rivera");
    // "may" is a real first name AND an ordinary English word. The single-token
    // fallback must not claim it, or every question containing "may" becomes a
    // question about that student.
    const may: ScopeRosterEntry = { index: 9, userId: 90, name: "May Winters", sortableName: "Winters, May" };
    expect(studentNameVariants(may)).not.toContain("may");
    expect(studentNameVariants(may)).toContain("winters");
    expect(SINGLE_TOKEN_STOPWORDS.has("may")).toBe(true);
  });
});

describe("scopeCourseIntelQuestion - rewriting the name away", () => {
  it("replaces a full name with the student's index marker", () => {
    const result = scoped("how is Alex Rivera doing in the course");
    expect(result.subject).toEqual({ index: 1, userId: 4021 });
    expect(result.questionForModel).toBe("how is S1 doing in the course");
    expect(result.questionForModel.toLowerCase()).not.toContain("alex");
    expect(result.questionForModel.toLowerCase()).not.toContain("rivera");
  });

  it("replaces EVERY occurrence, in any case, including a possessive", () => {
    const result = scoped("Alex Rivera - what about ALEX's grades, and is alex ok?");
    // Three occurrences, three different casings, one of them possessive. A
    // rewrite that stopped at the first would send the other two.
    expect(result.questionForModel).toBe("S1 - what about S1's grades, and is S1 ok?");
    expect(/alex/i.test(result.questionForModel)).toBe(false);
    expect(/rivera/i.test(result.questionForModel)).toBe(false);
  });

  it("resolves the sortable name Canvas actually returns, comma and all", () => {
    expect(scoped("how is Rivera, Alex doing").questionForModel).toBe("how is S1 doing");
    expect(scoped("how is rivera alex doing").questionForModel).toBe("how is S1 doing");
  });

  it("resolves a single surname when no full name is present", () => {
    const result = scoped("what has Blake been posting about");
    expect(result.subject).toEqual({ index: 2, userId: 4022 });
    expect(/blake/i.test(result.questionForModel)).toBe(false);
  });

  it("does not match a name fragment inside a longer word", () => {
    // "Blake" must not be found inside "Blakeney", or an unrelated word turns a
    // whole-course question into a question about one person.
    const result = scopeCourseIntelQuestion({
      question: "who are the students of concern in Blakeney Hall",
      roster: [ALEX, JORDAN],
    });
    expect(result.status).toBe("scoped");
    if (result.status !== "scoped") return;
    expect(result.shape.kind).toBe("concern");
  });
});

describe("assertNoStudentNameRemains", () => {
  // The last line of defence, tested on its own terms because it is
  // unreachable through scopeCourseIntelQuestion on correct code: the rewrite
  // uses the same alternation this check uses, so there is nothing left for it
  // to find. An untested guard is a guard nobody knows still works.
  it("throws on any surviving form of a name", () => {
    for (const leak of [
      "how is Alex Rivera doing",
      "how is ALEX doing",
      "how is Rivera, Alex doing",
      "what about Alex's grades",
      "what about Blake",
    ]) {
      expect(() => assertNoStudentNameRemains(leak, [ALEX, JORDAN]), leak).toThrow(
        /survived the question rewrite/
      );
    }
  });

  it("passes a question that carries only markers", () => {
    expect(() => assertNoStudentNameRemains("how is S1 doing", [ALEX, JORDAN])).not.toThrow();
  });

  it("passes when the roster has no usable name to look for", () => {
    expect(() => assertNoStudentNameRemains("how is Alex Rivera doing", [])).not.toThrow();
  });
});

describe("scopeCourseIntelQuestion - refusing rather than guessing", () => {
  it("refuses an ambiguous first name and names both candidates", () => {
    const result = scopeCourseIntelQuestion({
      question: "how is Alex doing",
      roster: [ALEX, JORDAN, OTHER_ALEX],
    });
    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") return;
    expect(result.matchedText).toBe("Alex");
    expect(result.candidates).toEqual([
      { index: 1, userId: 4021 },
      { index: 3, userId: 4023 },
    ]);
    // The refusal carries no rewritten question at all, because nothing is
    // going to be sent.
    expect("questionForModel" in result).toBe(false);
  });

  it("refuses two students who share a full name", () => {
    const twin: ScopeRosterEntry = { index: 7, userId: 4077, name: "Alex Rivera", sortableName: "Rivera, Alex" };
    const result = scopeCourseIntelQuestion({ question: "how is Alex Rivera doing", roster: [ALEX, twin] });
    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") return;
    expect(result.candidates.map((c) => c.index)).toEqual([1, 7]);
  });

  it("still resolves a full name when its first name alone would be ambiguous", () => {
    // Two Alexes on the roster, but the question names one of them in full.
    // Longest-match-first is what keeps this from reading as ambiguous.
    const result = scoped("how is Alex Rivera doing", [ALEX, JORDAN, OTHER_ALEX]);
    expect(result.subject).toEqual({ index: 1, userId: 4021 });
    expect(result.questionForModel).toBe("how is S1 doing");
  });

  it("refuses a question that names two different students", () => {
    const result = scopeCourseIntelQuestion({
      question: "compare Alex Rivera and Jordan Blake",
      roster: [ALEX, JORDAN],
    });
    expect(result.status).toBe("multiple-students");
    if (result.status !== "multiple-students") return;
    expect(result.subjects.map((s) => s.index)).toEqual([1, 2]);
  });
});

describe("scopeCourseIntelQuestion - shapes", () => {
  it("names nobody, so it is the concern shape and no name resolution happened", () => {
    const result = scoped("who are the students of concern");
    expect(result.shape).toEqual({ kind: "concern" });
    expect(result.subject).toBeNull();
  });

  it("a question about a student's writing is the topics shape", () => {
    const result = scoped("what areas has Alex Rivera asked about");
    expect(result.shape).toEqual({ kind: "student-topics", studentIndex: 1 });
    expect(shapeNeedsStudentText(result.shape)).toBe(true);
  });

  it("a status question sends no prose unless the instructor opted in", () => {
    const closed = scoped("how is Alex Rivera doing");
    expect(closed.shape).toEqual({ kind: "student-status", studentIndex: 1, includeText: false });
    expect(shapeNeedsStudentText(closed.shape)).toBe(false);

    const opened = scopeCourseIntelQuestion({
      question: "how is Alex Rivera doing",
      roster: [ALEX, JORDAN],
      includeStudentTextForStatus: true,
    });
    expect(opened.status).toBe("scoped");
    if (opened.status !== "scoped") return;
    expect(opened.shape).toEqual({ kind: "student-status", studentIndex: 1, includeText: true });
    expect(shapeNeedsStudentText(opened.shape)).toBe(true);
  });

  it("survives a roster with no usable names rather than building an empty alternation", () => {
    const blank: ScopeRosterEntry = { index: 1, userId: 1, name: "", sortableName: "" };
    const result = scopeCourseIntelQuestion({ question: "who are the students of concern", roster: [blank] });
    expect(result.status).toBe("scoped");
    if (result.status !== "scoped") return;
    expect(result.shape.kind).toBe("concern");
  });

  it("an empty roster resolves nobody", () => {
    const result = scopeCourseIntelQuestion({ question: "how is Alex Rivera doing", roster: [] });
    expect(result.status).toBe("scoped");
    if (result.status !== "scoped") return;
    expect(result.shape.kind).toBe("concern");
  });
});

describe("no student name reaches a composed prompt", () => {
  // The whole point of the module, checked on the bytes that would actually be
  // sent rather than on this module's own return value.
  function composeTurns(question: string) {
    const roster = [
      { id: "4021", name: ALEX.name, sortableName: ALEX.sortableName },
      { id: "4022", name: JORDAN.name, sortableName: JORDAN.sortableName },
    ];
    const assembly = buildCourseIntelAssembly({
      courseHubId: "hub-1",
      institution: "MCC",
      canvasCourseId: "900",
      courseName: "Intro to Programming",
      assembledAt: "2026-09-05T12:00:00.000Z",
      tier: "signals+text",
      roster,
      grades: {
        state: "loaded",
        value: [{ userId: "4021", name: ALEX.name, currentScore: 61, finalScore: 61 }],
      },
      submissions: { state: "none" },
      discussion: {
        state: "loaded",
        value: [
          {
            userId: 4021,
            id: "topic:5:u4021:0",
            kind: "discussion-post",
            container: "Week 3 discussion",
            createdAt: "2026-09-01T00:00:00.000Z",
            parentUserId: null,
            text: "I am stuck on the loop exercise and could use a pointer.",
          },
        ],
      },
      messageThreads: { state: "none" },
      messageBodies: { state: "none" },
      assignments: [],
      announcements: [],
    });

    const scope = scopeCourseIntelQuestion({
      question,
      roster: assembly.students,
      includeStudentTextForStatus: true,
    });
    if (scope.status !== "scoped" || scope.shape.kind === "concern") {
      throw new Error(`expected a per-student scope, got ${scope.status}`);
    }
    const context = buildCourseIntelContext({
      assembly,
      nonce: "nonce-abc123",
      textStudentIndices: [scope.shape.studentIndex],
    });
    const turns = buildStudentQuestionTurns({
      contextBlock: context.text,
      nonce: "nonce-abc123",
      subjectIndex: scope.shape.studentIndex,
      questionForModel: scope.questionForModel,
      includeText: true,
    });
    return JSON.stringify(turns);
  }

  it("carries no part of the subject's name, however the question spelled it", () => {
    for (const question of [
      "what areas has Alex Rivera asked about",
      "what has ALEX RIVERA asked about",
      "what areas has Rivera, Alex asked about",
      "what has Alex Rivera asked about - and what are Alex's main questions",
    ]) {
      const sent = composeTurns(question);
      expect(sent, question).not.toMatch(/alex/i);
      expect(sent, question).not.toMatch(/rivera/i);
    }
  });

  it("carries the marker instead", () => {
    expect(composeTurns("what areas has Alex Rivera asked about")).toContain("S1");
  });
});
