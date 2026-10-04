import { describe, it, expect } from "vitest";
import type { Course } from "@/lib/supabase/courses.types";
import type { BulkCourseMessageOutcome, BulkCoursePreview, RefusalKind } from "@/app/actions/bulk-course-message";
import { emptyCourseProject } from "@/lib/course-project";
import {
  bannerText,
  confirmFromPreview,
  confirmSignature,
  createSendLock,
  eligibleLiveCourses,
  outcomeNotice,
  reduceCompose,
  resolveSelectedCourse,
  stillMatchesConfirmed,
  EMPTY_FIELDS,
  type ComposeFields,
  type ConfirmedMessage,
} from "./bulk-message-model";

function makeCourse(over: Partial<Course> = {}): Course {
  const base: Course = {
    id: "c1",
    name: "C",
    courseCode: null,
    term: null,
    canvasUrl: "https://x.instructure.com/courses/42",
    repos: [],
    githubOrg: null,
    textbook: null,
    syllabusId: null,
    institution: "X",
    integrations: [],
    roster: null,
    notes: null,
    topics: null,
    csvName: null,
    csvData: null,
    rubricName: null,
    rubricData: null,
    startDate: null,
    description: null,
    weeks: null,
    tests: null,
    lms: null,
    dayTime: null,
    modality: null,
    topicOutline: null,
    syllabusTemplateId: null,
    endDate: null,
    breaks: null,
    assignmentDueRule: null,
    email: null,
    emailClient: null,
    classLengthMinutes: null,
    courseProject: emptyCourseProject(),
    materialsFiles: [],
    castletopFiles: [],
    miscFiles: [],
    exportFiles: [],
    materialsZipName: null,
    materialsZipPath: null,
    materialsZipSize: null,
    customTiles: [],
    hiddenTiles: [],
    studentRepos: [],
    updatedAt: "2024-09-01T00:00:00Z",
  };
  return { ...base, ...over };
}

// Derived from the closed RefusalKind union: a record keyed by every member
// fails to compile if a kind is added and not listed here.
const REFUSAL_KINDS_RECORD: Record<RefusalKind, true> = {
  "not-linked": true,
  "needs-institution": true,
  "no-credential": true,
  "canvas-unreachable": true,
  "one-student": true,
  "over-max": true,
  "canvas-refused": true,
};
const REFUSAL_KINDS = Object.keys(REFUSAL_KINDS_RECORD) as RefusalKind[];

function confirmed(over: Partial<ConfirmedMessage> = {}): ConfirmedMessage {
  return { courseId: "c1", courseName: "Algebra", count: 30, subject: "Hello", body: "World", ...over };
}

describe("AC-W3-2 confirmFromPreview", () => {
  it.each(REFUSAL_KINDS)("a refused preview (%s) yields null", (kind) => {
    const preview: BulkCoursePreview = { status: "refused", kind, reason: "r" };
    expect(confirmFromPreview(preview, "c1", "S", "B")).toBeNull();
  });
  it("a ready preview yields the preview's name and count with trimmed text", () => {
    const preview: BulkCoursePreview = { status: "ready", courseName: "Algebra", count: 30 };
    expect(confirmFromPreview(preview, "c1", "  S  ", "\nB \n")).toEqual({
      courseId: "c1",
      courseName: "Algebra",
      count: 30,
      subject: "S",
      body: "B",
    });
  });
});

describe("AC-W3-3 bannerText", () => {
  it.each([2, 50, 100])("contains the course name, the count %i, the subject and the body", (count) => {
    const c = confirmed({ count, courseName: 'Math & <b> "101"', subject: "Subj", body: "Body text" });
    const text = bannerText(c);
    expect(text).toContain('Math & <b> "101"');
    expect(text).toContain(String(count));
    expect(text).toContain("Subj");
    expect(text).toContain("Body text");
  });
});

describe("AC-W3-4 confirmSignature", () => {
  const base = confirmed();
  it("differs when any of the four inputs differs", () => {
    const sig = confirmSignature(base);
    expect(confirmSignature(confirmed({ courseId: "c2" }))).not.toBe(sig);
    expect(confirmSignature(confirmed({ count: 31 }))).not.toBe(sig);
    expect(confirmSignature(confirmed({ subject: "Other" }))).not.toBe(sig);
    expect(confirmSignature(confirmed({ body: "Other" }))).not.toBe(sig);
  });
  it("is equal when only leading or trailing whitespace differs", () => {
    expect(confirmSignature(confirmed({ subject: "  Hello ", body: " World\n" }))).toBe(confirmSignature(base));
  });
  it("SWAP row: swapping subject and body changes the signature (order-preserving)", () => {
    const a = confirmed({ subject: "A", body: "B" });
    const b = confirmed({ subject: "B", body: "A" });
    expect(confirmSignature(a)).not.toBe(confirmSignature(b));
  });
  it("a delimiter-free join would collide courseId 1 + count 2 with courseId 12", () => {
    expect(confirmSignature(confirmed({ courseId: "1", count: 2 }))).not.toBe(
      confirmSignature(confirmed({ courseId: "12", count: 2 }))
    );
    expect(confirmSignature(confirmed({ courseId: "1", count: 23 }))).not.toBe(
      confirmSignature(confirmed({ courseId: "12", count: 3 }))
    );
  });
  it("stillMatchesConfirmed disarms on an edit or a swap, and holds while unchanged", () => {
    const c = confirmed({ subject: "A", body: "B" });
    expect(stillMatchesConfirmed(c, "c1", "A", "B")).toBe(true);
    expect(stillMatchesConfirmed(c, "c1", " A ", "B ")).toBe(true);
    expect(stillMatchesConfirmed(c, "c1", "B", "A")).toBe(false);
    expect(stillMatchesConfirmed(c, "c1", "A", "B!")).toBe(false);
    expect(stillMatchesConfirmed(c, "c2", "A", "B")).toBe(false);
    expect(stillMatchesConfirmed(null, "c1", "A", "B")).toBe(false);
    expect(stillMatchesConfirmed(c, null, "A", "B")).toBe(false);
  });
});

describe("AC-W3-5 reduceCompose", () => {
  const marked = "# Heading\n**bold** and *it*\n- item\n<b>tag</b> words";
  it("strips markup from a drafted result and keeps the words", () => {
    const next = reduceCompose(EMPTY_FIELDS, { kind: "drafted", result: { title: "**T**", message: marked } });
    expect(next.subject).toBe("T");
    for (const marker of ["# ", "**", "- ", "<b>", "</b>"]) expect(next.body).not.toContain(marker);
    for (const word of ["Heading", "bold", "item", "tag", "words"]) expect(next.body).toContain(word);
  });
  it("stores typed text byte-identical", () => {
    const next = reduceCompose(EMPTY_FIELDS, { kind: "typed", field: "body", value: marked });
    expect(next.body).toBe(marked);
    const sub = reduceCompose(EMPTY_FIELDS, { kind: "typed", field: "subject", value: "**x**" });
    expect(sub.subject).toBe("**x**");
  });
  it("a drafter error changes nothing", () => {
    const before: ComposeFields = { subject: "s", body: "b", prompt: "p" };
    expect(reduceCompose(before, { kind: "drafted", result: { error: "boom" } })).toEqual(before);
  });
  it("cleared-after-accept empties subject and body and keeps the prompt", () => {
    const before: ComposeFields = { subject: "s", body: "b", prompt: "p" };
    expect(reduceCompose(before, { kind: "cleared-after-accept" })).toEqual({ subject: "", body: "", prompt: "p" });
  });
});

describe("AC-W3-6 createSendLock", () => {
  it("claims once, refuses an immediate second, and re-claims after release", () => {
    const lock = createSendLock();
    expect(lock.tryClaim()).toBe(true);
    expect(lock.tryClaim()).toBe(false);
    lock.release();
    expect(lock.tryClaim()).toBe(true);
  });
});

describe("AC-W3-7 eligibleLiveCourses and resolveSelectedCourse", () => {
  // Axes written from canLms's definition: both a trimmed url and a trimmed
  // institution must be non-empty.
  const urls: Array<[string, string]> = [
    ["empty", ""],
    ["whitespace", "   "],
    ["set", "https://x.instructure.com/courses/42"],
  ];
  const institutions: Array<[string, string]> = [
    ["empty", ""],
    ["whitespace", "  "],
    ["set", "X"],
  ];
  it("exactly the (set, set) row is eligible", () => {
    const rows: Course[] = [];
    const expectedIds: string[] = [];
    for (const [uName, url] of urls) {
      for (const [iName, inst] of institutions) {
        const id = `${uName}-${iName}`;
        rows.push(makeCourse({ id, canvasUrl: url, institution: inst }));
        if (uName === "set" && iName === "set") expectedIds.push(id);
      }
    }
    expect(rows).toHaveLength(9);
    expect(eligibleLiveCourses(rows).map((c) => c.id)).toEqual(expectedIds);
  });
  it("a stored id absent from the eligible set does not resolve (several eligible)", () => {
    expect(resolveSelectedCourse("gone", [{ id: "a" }, { id: "b" }])).toBeNull();
  });
  it("a stored id that is eligible resolves to itself", () => {
    expect(resolveSelectedCourse("b", [{ id: "a" }, { id: "b" }])).toBe("b");
  });
  it("exactly one eligible course resolves to itself; none resolves to null", () => {
    expect(resolveSelectedCourse(null, [{ id: "a" }])).toBe("a");
    expect(resolveSelectedCourse(null, [])).toBeNull();
    expect(resolveSelectedCourse("a", [])).toBeNull();
  });
});

describe("AC-W3-8 outcomeNotice", () => {
  it("accepted -> success, names Canvas accepted and the course", () => {
    const n = outcomeNotice({ status: "accepted" }, "Algebra");
    expect(n.tone).toBe("success");
    expect(n.text).toContain("Canvas accepted");
    expect(n.text).toContain("Algebra");
  });
  it("unknown -> warning, says Canvas did not confirm, never the accepted copy", () => {
    const n = outcomeNotice({ status: "unknown", reason: "slow" }, "Algebra");
    expect(n.tone).toBe("warning");
    expect(n.text).toContain("did not confirm");
    expect(n.text).not.toContain("Canvas accepted");
  });
  it.each(REFUSAL_KINDS)("refused %s -> error tone carrying the reason verbatim", (kind) => {
    const outcome: BulkCourseMessageOutcome = { status: "refused", kind, reason: `reason for ${kind}` };
    const n = outcomeNotice(outcome, "Algebra");
    expect(n.tone).toBe("error");
    expect(n.text).toContain(`reason for ${kind}`);
  });
  it("the three tones are pairwise distinct", () => {
    const tones = [
      outcomeNotice({ status: "accepted" }, "A").tone,
      outcomeNotice({ status: "unknown", reason: "r" }, "A").tone,
      outcomeNotice({ status: "refused", kind: "over-max", reason: "r" }, "A").tone,
    ];
    expect(new Set(tones).size).toBe(3);
  });
});
