import { describe, expect, it } from "vitest";
import {
  resolveChatEntities,
  buildGroundingBlock,
  type GroundingCourse,
  type GroundingPage,
} from "./entity-grounding";

// ---------------------------------------------------------------------------
// Fixtures. Two institutions, four courses - deliberately including a course
// whose name is short and generic ("AI"), which must NOT be matched by name,
// and two courses at the same institution so an institution match returns
// more than one row.
// ---------------------------------------------------------------------------

function course(over: Partial<GroundingCourse> & { id: string }): GroundingCourse {
  return {
    name: "Untitled",
    courseCode: null,
    term: null,
    institution: null,
    description: null,
    topics: null,
    textbook: null,
    weeks: null,
    startDate: null,
    modality: null,
    lms: null,
    ...over,
  };
}

const COURSES: GroundingCourse[] = [
  course({
    id: "c1",
    name: "Business Information Systems",
    courseCode: "BIT 320",
    term: "Fall 2026",
    institution: "GCU",
    description: "Applied business information technology.",
    topics: "Databases, networks, security",
    textbook: "Info Systems 5e",
    weeks: 8,
    modality: "async",
  }),
  course({ id: "c2", name: "Intro to Programming", courseCode: "CST 150", institution: "GCU" }),
  course({ id: "c3", name: "Data Structures", courseCode: "CS 220", institution: "ASU" }),
  // Guards the name-matching floor: a two-letter name must never match.
  course({ id: "c4", name: "AI", courseCode: "AI 101", institution: "ASU" }),
];

const INSTITUTIONS = ["GCU", "ASU"];

function resolve(message: string, activeInstitution: string | null = null) {
  return resolveChatEntities({
    message,
    institutions: INSTITUTIONS,
    courses: COURSES,
    activeInstitution,
  });
}

describe("resolveChatEntities - institutions", () => {
  it("resolves an institution named by acronym", () => {
    const r = resolve("What is the late work policy at GCU?");
    expect(r.institutions).toEqual(["GCU"]);
    expect(r.viaFallback).toBe(false);
  });

  it("matches an acronym case-insensitively", () => {
    expect(resolve("anything about gcu?").institutions).toEqual(["GCU"]);
  });

  it("does NOT match an acronym embedded inside a longer word", () => {
    // The single biggest false-positive risk: institution acronyms are two to
    // five letters, so a substring match would fire on ordinary prose.
    expect(resolve("Please discuss the gcurriculum").institutions).toEqual([]);
    expect(resolve("ASUS laptops for the lab").institutions).toEqual([]);
  });

  it("resolves several institutions when several are named", () => {
    const r = resolve("Compare GCU and ASU grading policies");
    expect([...r.institutions].sort()).toEqual(["ASU", "GCU"]);
  });

  it("ignores an acronym the user has not registered", () => {
    expect(resolve("What about MIT?").institutions).toEqual([]);
  });
});

describe("resolveChatEntities - courses", () => {
  it("resolves a course named by its course code", () => {
    const r = resolve("How many weeks is BIT 320?");
    expect(r.courseIds).toEqual(["c1"]);
  });

  it("resolves a course code written without the internal space", () => {
    expect(resolve("tell me about BIT320").courseIds).toEqual(["c1"]);
  });

  it("resolves a course named by its full name", () => {
    expect(resolve("What is Business Information Systems about?").courseIds).toEqual(["c1"]);
  });

  it("does NOT match a course whose name is too short to be distinctive", () => {
    // "AI" appears constantly in ordinary questions; matching it by name would
    // ground almost every message on the wrong course. Its CODE still matches.
    expect(resolve("Can AI help me grade faster?").courseIds).toEqual([]);
    expect(resolve("what about AI 101").courseIds).toEqual(["c4"]);
  });

  it("pulls in the named course's own institution, so its policies are in scope", () => {
    const r = resolve("How many weeks is BIT 320?");
    expect(r.institutions).toEqual(["GCU"]);
    expect(r.viaFallback).toBe(false);
  });

  it("normalizes a course's own institution casing so it never duplicates an explicitly-mentioned one", () => {
    // A course row's `institution` field is free-typed client-side data and
    // is not guaranteed to already match the caller's normalized (uppercase)
    // candidate set - unlike the fixtures above, which are already
    // uppercase. Without normalizing on the way in here, a lower-cased
    // course row plus an explicit mention of the same institution would
    // resolve BOTH casings ("GCU" and "gcu") instead of collapsing to one.
    const lowerCasedCourses: GroundingCourse[] = [
      ...COURSES,
      course({ id: "c5", name: "Capstone Project", courseCode: "CAP 499", institution: "gcu" }),
    ];
    const r = resolveChatEntities({
      message: "Compare GCU policy with the Capstone Project (CAP 499) requirements",
      institutions: INSTITUTIONS,
      courses: lowerCasedCourses,
      activeInstitution: null,
    });
    expect(r.institutions).toEqual(["GCU"]);
    expect(r.courseIds).toEqual(["c5"]);
  });

  it("resolves several courses when several are named", () => {
    const r = resolve("Compare BIT 320 and CS 220");
    expect([...r.courseIds].sort()).toEqual(["c1", "c3"]);
    expect([...r.institutions].sort()).toEqual(["ASU", "GCU"]);
  });
});

describe("resolveChatEntities - no entity and the deictic fallback", () => {
  it("resolves nothing for a question that names no entity", () => {
    const r = resolve("Write me a haiku about grading.");
    expect(r.institutions).toEqual([]);
    expect(r.courseIds).toEqual([]);
    expect(r.viaFallback).toBe(false);
  });

  it("resolves a deictic reference to the active institution", () => {
    const r = resolve("What is the late work policy at this institution?", "GCU");
    expect(r.institutions).toEqual(["GCU"]);
    expect(r.viaFallback).toBe(true);
  });

  it("resolves nothing for a deictic reference when no institution is active", () => {
    const r = resolve("What is the policy at this school?", null);
    expect(r.institutions).toEqual([]);
    expect(r.viaFallback).toBe(false);
  });

  it("IGNORES an active institution the caller is not entitled to", () => {
    // The security boundary, and the one this suite originally left unpinned.
    // The server derives the candidate set from the caller's OWN courses and
    // pages; the client-sent activeInstitution is only a HINT and must be
    // checked against that set. Without this test, deleting the membership
    // check entirely leaves the suite green - confirmed by sabotage - which
    // would let a forged hint name any institution and pull its pages.
    const r = resolve("What is the late work policy at this institution?", "MIT");
    expect(r.institutions).toEqual([]);
    expect(r.viaFallback).toBe(false);
  });

  it("prefers an explicitly named institution over the active one", () => {
    const r = resolve("What is ASU's policy?", "GCU");
    expect(r.institutions).toEqual(["ASU"]);
    expect(r.viaFallback).toBe(false);
  });

  it("does not fall back merely because an institution is active", () => {
    // Grounding every unrelated message on the active institution would burn
    // tokens and drag irrelevant policy into plain questions.
    const r = resolve("Write me a haiku about grading.", "GCU");
    expect(r.institutions).toEqual([]);
  });
});

describe("buildGroundingBlock", () => {
  const pages: Record<string, GroundingPage[]> = {
    GCU: [
      { title: "Late Work Policy", body: "Late work loses 10 percent per day.", tags: ["policy"] },
      { title: "Office Hours", body: "Two hours per week are required.", tags: [] },
    ],
  };

  it("returns an empty string when nothing was resolved", () => {
    expect(buildGroundingBlock({ institutions: [], courses: [], pagesByInstitution: {} })).toBe("");
  });

  it("includes the course's own fields", () => {
    const block = buildGroundingBlock({
      institutions: ["GCU"],
      courses: [COURSES[0]],
      pagesByInstitution: {},
    });
    expect(block).toContain("BIT 320");
    expect(block).toContain("Business Information Systems");
    expect(block).toContain("Fall 2026");
    expect(block).toContain("Databases, networks, security");
  });

  it("includes knowledge page titles and bodies", () => {
    const block = buildGroundingBlock({
      institutions: ["GCU"],
      courses: [],
      pagesByInstitution: pages,
    });
    expect(block).toContain("Late Work Policy");
    expect(block).toContain("Late work loses 10 percent per day.");
    expect(block).toContain("Office Hours");
  });

  it("omits a field that is null rather than printing an empty label", () => {
    const block = buildGroundingBlock({
      institutions: [],
      courses: [course({ id: "x", name: "Bare Course" })],
      pagesByInstitution: {},
    });
    expect(block).toContain("Bare Course");
    expect(block).not.toMatch(/null/i);
    expect(block).not.toMatch(/undefined/i);
  });

  it("never exceeds maxChars, and says so when it drops content", () => {
    const big: Record<string, GroundingPage[]> = {
      GCU: Array.from({ length: 50 }, (_, i) => ({
        title: `Page ${i}`,
        body: "x".repeat(2000),
        tags: [],
      })),
    };
    const block = buildGroundingBlock({
      institutions: ["GCU"],
      courses: COURSES,
      pagesByInstitution: big,
      maxChars: 1500,
    });
    expect(block.length).toBeLessThanOrEqual(1500);
    expect(block.toLowerCase()).toContain("truncated");
  });

  it("does not claim truncation when everything fit", () => {
    const block = buildGroundingBlock({
      institutions: ["GCU"],
      courses: [COURSES[1]],
      pagesByInstitution: {},
      maxChars: 100000,
    });
    expect(block.toLowerCase()).not.toContain("truncated");
  });

  it("is deterministic for the same input", () => {
    const args = { institutions: ["GCU"], courses: COURSES, pagesByInstitution: pages };
    expect(buildGroundingBlock(args)).toBe(buildGroundingBlock(args));
  });

  it("emits no markdown, since the chat is under a plain-text-only rule", () => {
    const block = buildGroundingBlock({
      institutions: ["GCU"],
      courses: [COURSES[0]],
      pagesByInstitution: pages,
    });
    expect(block).not.toMatch(/\*\*|^#|^\s*[-*]\s|```/m);
  });

  it("tells the model this is real instructor data, not an instruction to obey", () => {
    // The block carries user-authored page bodies straight into the prompt, so
    // it must be framed as reference material - otherwise a knowledge page
    // that happens to read like a command becomes a prompt injection.
    const block = buildGroundingBlock({
      institutions: ["GCU"],
      courses: [],
      pagesByInstitution: pages,
    });
    expect(block.toLowerCase()).toMatch(/reference|context|record/);
  });
});
