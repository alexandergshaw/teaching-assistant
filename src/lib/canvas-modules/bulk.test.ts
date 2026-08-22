// Tests for listBulkItems's Assignment/Quiz split and New Quiz routing
// (docs/assignments-quizzes-tabs-acceptance-criteria.md Contract 1, AC C, E1,
// E3, E4). Mirrors module-content.test.ts's pattern: only globalThis.fetch is
// stubbed, resolveCourse/fetchAll run for real, so the assertions are about
// the actual request/response shape.
//
// No bulk.test.ts existed before this change (checked via Glob before
// writing this file).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listBulkItems, bulkUpdate } from "./bulk";

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";

function jsonResponse(body: unknown, linkHeader: string | null = null) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    headers: { get: (name: string) => (name.toLowerCase() === "link" ? linkHeader : null) },
  } as unknown as Response;
}

let requested: string[] = [];

function stubCanvas(handlers: { assignments?: unknown[][]; quizzes?: unknown[] }) {
  requested = [];
  const assignmentPages = handlers.assignments ?? [[]];
  const fetchMock = vi.fn(async (url: string | URL) => {
    const href = String(url);
    requested.push(href);

    if (href.includes("/assignments")) {
      // Page-by-page: the first call always hits the base URL (no `page=`
      // param in this app's URLs - pagination is driven purely by the Link
      // header per fetch-helpers.ts), so index by call count.
      const priorAssignmentCalls = requested.filter((u) => u.includes("/assignments")).length - 1;
      const page = assignmentPages[priorAssignmentCalls] ?? [];
      const isLastPage = priorAssignmentCalls >= assignmentPages.length - 1;
      const link = isLastPage ? null : `<${href}&page_marker=${priorAssignmentCalls + 1}>; rel="next"`;
      return jsonResponse(page, link);
    }
    if (href.includes("/quizzes")) {
      return jsonResponse(handlers.quizzes ?? []);
    }
    return jsonResponse([]);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// A genuine New Quiz's assignment JSON shape, per new-quiz.ts's evidence.
const NEW_QUIZ_ASSIGNMENT = {
  id: 901,
  name: "Chapter 3 New Quiz",
  published: true,
  due_at: "2026-03-01T00:00:00Z",
  points_possible: 10,
  submission_types: ["external_tool"],
  is_quiz_assignment: true,
  quiz_id: null,
};

const ORDINARY_ASSIGNMENT = {
  id: 902,
  name: "Essay 1",
  published: true,
  due_at: "2026-03-02T00:00:00Z",
  points_possible: 100,
  submission_types: ["online_upload"],
};

const CLASSIC_QUIZ_SHADOW_ASSIGNMENT = {
  id: 903,
  name: "Classic Quiz",
  published: true,
  due_at: null,
  points_possible: 5,
  submission_types: ["online_quiz"],
  quiz_id: 55,
};

const CLASSIC_QUIZ = {
  id: 55,
  title: "Classic Quiz",
  published: true,
  due_at: null,
  points_possible: 5,
};

// A graded discussion's shadow assignment: same shape of hazard as a classic
// quiz's shadow (Finding 1) - Canvas creates one of these for every graded
// discussion, and this app already models discussions as their own BulkKind
// ("Discussion") with their own /discussion_topics listing, never through
// the Assignment tab.
const GRADED_DISCUSSION_SHADOW_ASSIGNMENT = {
  id: 904,
  name: "Week 3 Discussion",
  published: true,
  due_at: "2026-03-06T00:00:00Z",
  points_possible: 20,
  submission_types: ["discussion_topic"],
};

describe("listBulkItems('Assignment') excludes New Quizzes (C3)", () => {
  it("drops a row the classifier flags as a New Quiz, keeping ordinary assignments", async () => {
    stubCanvas({ assignments: [[NEW_QUIZ_ASSIGNMENT, ORDINARY_ASSIGNMENT]] });

    const items = await listBulkItems(COURSE_URL, "Assignment", "MCC");

    expect(items.map((i) => i.id)).toEqual(["902"]);
    expect(items[0].title).toBe("Essay 1");
  });
});

describe("listBulkItems('Assignment') also excludes Classic-quiz and graded-discussion shadow assignments (Finding 1)", () => {
  it("drops a Classic quiz's shadow assignment row (quiz_id populated), keeping ordinary assignments", async () => {
    stubCanvas({ assignments: [[CLASSIC_QUIZ_SHADOW_ASSIGNMENT, ORDINARY_ASSIGNMENT]] });

    const items = await listBulkItems(COURSE_URL, "Assignment", "MCC");

    expect(items.map((i) => i.id)).toEqual(["902"]);
  });

  it("drops a graded discussion's shadow assignment row (submission_types includes discussion_topic)", async () => {
    stubCanvas({ assignments: [[GRADED_DISCUSSION_SHADOW_ASSIGNMENT, ORDINARY_ASSIGNMENT]] });

    const items = await listBulkItems(COURSE_URL, "Assignment", "MCC");

    expect(items.map((i) => i.id)).toEqual(["902"]);
  });

  it("never mislabels a graded discussion's shadow assignment as a New Quiz in the Quiz tab either", async () => {
    stubCanvas({ assignments: [[GRADED_DISCUSSION_SHADOW_ASSIGNMENT]], quizzes: [CLASSIC_QUIZ] });

    const items = await listBulkItems(COURSE_URL, "Quiz", "MCC");

    // Only the Classic quiz - the graded discussion belongs in neither tab
    // this chunk builds (no flat Discussions tab yet).
    expect(items.map((i) => i.id)).toEqual(["55"]);
  });
});

describe("listBulkItems('Quiz') includes Classic AND New Quizzes, each labelled (C2)", () => {
  it("returns the classic quiz unflagged and the New Quiz flagged isNewQuiz: true", async () => {
    stubCanvas({
      assignments: [[NEW_QUIZ_ASSIGNMENT, ORDINARY_ASSIGNMENT]],
      quizzes: [CLASSIC_QUIZ],
    });

    const items = await listBulkItems(COURSE_URL, "Quiz", "MCC");
    const byId = new Map(items.map((i) => [i.id, i]));

    expect(byId.get("55")?.isNewQuiz).toBeUndefined();
    expect(byId.get("901")?.isNewQuiz).toBe(true);
    expect(byId.get("901")?.title).toBe("Chapter 3 New Quiz");
    // The ordinary (non-quiz) assignment must never leak into the Quiz list.
    expect(byId.has("902")).toBe(false);
  });

  it("excludes a classic quiz's own shadow assignment from the New Quiz set (disqualifying quiz_id)", async () => {
    stubCanvas({
      assignments: [[CLASSIC_QUIZ_SHADOW_ASSIGNMENT]],
      quizzes: [CLASSIC_QUIZ],
    });

    const items = await listBulkItems(COURSE_URL, "Quiz", "MCC");

    // Only one "Classic Quiz" row - the shadow assignment (903) must not
    // also appear as a second, separately-flagged New Quiz row.
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("55");
  });
});

describe("Classic and New Quiz lists cannot double-count (C5)", () => {
  // Fixture set includes the Classic quiz's SHADOW ASSIGNMENT (id 903,
  // title "Classic Quiz") alongside the Classic quiz's own /quizzes record
  // (id 55, same title). Counting by id - as this test used to - cannot
  // catch a double-listed Classic quiz: the shadow assignment and the quiz
  // object have DIFFERENT ids, so `every(c => c === 1)` passed even while
  // Finding 1's bug shipped it in both tabs. Counting by TITLE across both
  // tabs together is what actually pins "one Canvas object, one row".
  it("a Classic quiz appears exactly once by TITLE across both tabs combined, despite its shadow assignment having a different id", async () => {
    stubCanvas({
      assignments: [[NEW_QUIZ_ASSIGNMENT, ORDINARY_ASSIGNMENT, CLASSIC_QUIZ_SHADOW_ASSIGNMENT]],
      quizzes: [CLASSIC_QUIZ],
    });

    const assignmentItems = await listBulkItems(COURSE_URL, "Assignment", "MCC");
    stubCanvas({
      assignments: [[NEW_QUIZ_ASSIGNMENT, ORDINARY_ASSIGNMENT, CLASSIC_QUIZ_SHADOW_ASSIGNMENT]],
      quizzes: [CLASSIC_QUIZ],
    });
    const quizItems = await listBulkItems(COURSE_URL, "Quiz", "MCC");

    const allTitles = [...assignmentItems.map((i) => i.title), ...quizItems.map((i) => i.title)];
    const titleCounts = new Map<string, number>();
    for (const t of allTitles) titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);

    // "Classic Quiz" must appear exactly once TOTAL, not once per tab.
    expect(titleCounts.get("Classic Quiz")).toBe(1);
    expect(titleCounts.get("Chapter 3 New Quiz")).toBe(1);
    expect(titleCounts.get("Essay 1")).toBe(1);
    expect([...titleCounts.values()].every((c) => c === 1)).toBe(true);

    // And by id: the shadow assignment's own id (903) must not surface as a
    // distinct row anywhere - it is the same object as id 55, not a second one.
    const allIds = [...assignmentItems.map((i) => i.id), ...quizItems.map((i) => i.id)];
    expect(allIds).not.toContain("903");
  });
});

describe("pagination still works for both kinds after the New Quiz split (E1)", () => {
  it("Assignment: follows the Link header across pages, keeping only non-New-Quiz rows from EACH page", async () => {
    stubCanvas({
      assignments: [
        [NEW_QUIZ_ASSIGNMENT, ORDINARY_ASSIGNMENT],
        [{ ...ORDINARY_ASSIGNMENT, id: 999, name: "Essay 2 (page 2)" }],
      ],
    });

    const items = await listBulkItems(COURSE_URL, "Assignment", "MCC");

    expect(items.map((i) => i.id).sort()).toEqual(["902", "999"]);
  });

  it("Quiz: multi-page assignments AND multi-page quizzes both fully resolve", async () => {
    // Two assignment pages (page 2 carries a New Quiz that must still be
    // picked up even though exclusion removed rows from page 1).
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);
      requested.push(href);
      if (href.includes("/assignments")) {
        const priorAssignmentCalls = requested.filter((u) => u.includes("/assignments")).length - 1;
        if (priorAssignmentCalls === 0) {
          return jsonResponse([ORDINARY_ASSIGNMENT], `<${href}&page=2>; rel="next"`);
        }
        return jsonResponse([NEW_QUIZ_ASSIGNMENT], null);
      }
      if (href.includes("/quizzes")) {
        const priorQuizCalls = requested.filter((u) => u.includes("/quizzes")).length - 1;
        if (priorQuizCalls === 0) {
          return jsonResponse([CLASSIC_QUIZ], `<${href}&page=2>; rel="next"`);
        }
        return jsonResponse([{ ...CLASSIC_QUIZ, id: 56, title: "Classic Quiz 2 (page 2)" }], null);
      }
      return jsonResponse([]);
    });
    requested = [];
    vi.stubGlobal("fetch", fetchMock);

    const items = await listBulkItems(COURSE_URL, "Quiz", "MCC");

    expect(items.map((i) => i.id).sort()).toEqual(["55", "56", "901"]);
    expect(items.find((i) => i.id === "901")?.isNewQuiz).toBe(true);
    expect(items.find((i) => i.id === "55")?.isNewQuiz).toBeUndefined();
    expect(items.find((i) => i.id === "56")?.isNewQuiz).toBeUndefined();
  });
});

describe("bulkUpdate's assignment[published]/quiz[published] request shape (B2, E4)", () => {
  it("PUTs assignment[published] for kind Assignment", async () => {
    const calls: { url: string; method: string; body: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), method: String(init?.method), body: String(init?.body ?? "") });
        return jsonResponse({});
      })
    );

    await bulkUpdate(COURSE_URL, "Assignment", ["42"], { published: true }, "MCC");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/assignments/42");
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].body).toBe("assignment%5Bpublished%5D=true");
  });

  it("PUTs quiz[published] for kind Quiz - the path B2 says has never been exercised by the UI", async () => {
    const calls: { url: string; method: string; body: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), method: String(init?.method), body: String(init?.body ?? "") });
        return jsonResponse({});
      })
    );

    await bulkUpdate(COURSE_URL, "Quiz", ["901"], { published: false }, "MCC");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/quizzes/901");
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].body).toBe("quiz%5Bpublished%5D=false");
  });
});
