import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Course } from "@/lib/supabase/courses.types";
import type { CourseConversationResult } from "@/lib/canvas/inbox";
import { CANVAS_CREDENTIAL_REQUIRED_MESSAGE } from "@/lib/canvas-credentials";
import { classifyRecipientCount } from "@/lib/bulk-course-message/refusal";
import { emptyCourseProject } from "@/lib/course-project";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const h = vi.hoisted(() => ({ order: [] as string[] }));

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

vi.mock("@/lib/supabase/auth", () => ({
  requireUser: vi.fn(async () => {
    h.order.push("requireUser");
    return { id: "user-1" };
  }),
}));
vi.mock("@/lib/supabase/courses", () => ({
  getCourse: vi.fn(async () => {
    h.order.push("getCourse");
    return makeCourse();
  }),
}));
vi.mock("@/lib/canvas/listings", () => ({
  countActiveCourseStudents: vi.fn(async () => {
    h.order.push("count");
    return 50;
  }),
}));
vi.mock("@/lib/canvas/inbox", () => ({
  createCourseConversation: vi.fn(async (): Promise<CourseConversationResult> => {
    h.order.push("post");
    return { status: "accepted" };
  }),
}));

import { requireUser } from "@/lib/supabase/auth";
import { getCourse } from "@/lib/supabase/courses";
import { countActiveCourseStudents } from "@/lib/canvas/listings";
import { createCourseConversation } from "@/lib/canvas/inbox";
import { sendBulkCourseMessageAction, previewBulkCourseMessageAction } from "./bulk-course-message";

const mReq = vi.mocked(requireUser);
const mGet = vi.mocked(getCourse);
const mCount = vi.mocked(countActiveCourseStudents);
const mPost = vi.mocked(createCourseConversation);

beforeEach(() => {
  h.order.length = 0;
  vi.clearAllMocks();
  mReq.mockImplementation(async () => {
    h.order.push("requireUser");
    return { id: "user-1" } as Awaited<ReturnType<typeof requireUser>>;
  });
  mCount.mockImplementation(async () => {
    h.order.push("count");
    return 50;
  });
  mPost.mockImplementation(async () => {
    h.order.push("post");
    return { status: "accepted" };
  });
  mGet.mockImplementation(async () => {
    h.order.push("getCourse");
    return makeCourse();
  });
});

function reasonOf(o: Awaited<ReturnType<typeof sendBulkCourseMessageAction>>): string {
  return "reason" in o ? o.reason : "";
}

describe("W2-2 call order", () => {
  it("runs requireUser, getCourse, count, post in that order", async () => {
    await sendBulkCourseMessageAction("c1", "S", "B");
    expect(h.order).toEqual(["requireUser", "getCourse", "count", "post"]);
  });
});

describe("W2-3 refusal with no POST", () => {
  it("refuses a count of 1", async () => {
    mCount.mockResolvedValueOnce(1);
    const o = await sendBulkCourseMessageAction("c1", "S", "B");
    expect(mPost).not.toHaveBeenCalled();
    expect(o).toMatchObject({ status: "refused", kind: "one-student" });
    expect(reasonOf(o)).toContain("1");
  });
  it("refuses a count of 0", async () => {
    mCount.mockResolvedValueOnce(0);
    const o = await sendBulkCourseMessageAction("c1", "S", "B");
    expect(mPost).not.toHaveBeenCalled();
    expect(o).toMatchObject({ status: "refused", kind: "one-student" });
  });
  it("refuses a count of 101", async () => {
    mCount.mockResolvedValueOnce(101);
    const o = await sendBulkCourseMessageAction("c1", "S", "B");
    expect(mPost).not.toHaveBeenCalled();
    expect(o).toMatchObject({ status: "refused", kind: "over-max" });
    expect(reasonOf(o)).toContain("101");
  });
  it("real predicate boundaries", () => {
    expect(classifyRecipientCount(2).send).toBe(true);
    expect(classifyRecipientCount(100).send).toBe(true);
    expect(classifyRecipientCount(1).send).toBe(false);
    expect(classifyRecipientCount(101).send).toBe(false);
  });
  it("the two kinds are distinct tags", () => {
    const a = classifyRecipientCount(1);
    const b = classifyRecipientCount(101);
    expect("kind" in a && "kind" in b && a.kind !== b.kind).toBe(true);
  });
});

describe("W2-4 count-read failure", () => {
  it("credential error -> no-credential, no POST", async () => {
    mCount.mockRejectedValueOnce(new Error(CANVAS_CREDENTIAL_REQUIRED_MESSAGE));
    const o = await sendBulkCourseMessageAction("c1", "S", "B");
    expect(o).toMatchObject({ status: "refused", kind: "no-credential" });
    expect(mPost).not.toHaveBeenCalled();
  });
  it("network error -> canvas-unreachable, no POST", async () => {
    mCount.mockRejectedValueOnce(new Error("fetch failed"));
    const o = await sendBulkCourseMessageAction("c1", "S", "B");
    expect(o).toMatchObject({ status: "refused", kind: "canvas-unreachable" });
    expect(mPost).not.toHaveBeenCalled();
  });
});

describe("W2-5 canLms gate", () => {
  it("no canvasUrl -> not-linked, count never read", async () => {
    mGet.mockImplementationOnce(async () => {
      h.order.push("getCourse");
      return makeCourse({ canvasUrl: null });
    });
    const o = await sendBulkCourseMessageAction("c1", "S", "B");
    expect(o).toMatchObject({ status: "refused", kind: "not-linked" });
    expect(h.order).toEqual(["requireUser", "getCourse"]);
  });
  it("no institution -> needs-institution", async () => {
    mGet.mockImplementationOnce(async () => {
      h.order.push("getCourse");
      return makeCourse({ institution: null });
    });
    const o = await sendBulkCourseMessageAction("c1", "S", "B");
    expect(o).toMatchObject({ status: "refused", kind: "needs-institution" });
    expect(h.order).toEqual(["requireUser", "getCourse"]);
  });
  it("null row -> not-linked", async () => {
    mGet.mockImplementationOnce(async () => {
      h.order.push("getCourse");
      return null;
    });
    const o = await sendBulkCourseMessageAction("c1", "S", "B");
    expect(o).toMatchObject({ status: "refused", kind: "not-linked" });
    expect(h.order).toEqual(["requireUser", "getCourse"]);
  });
});

describe("W2-6 verbatim body", () => {
  it("passes body, url and subject through unchanged", async () => {
    await sendBulkCourseMessageAction("c1", "Subj", "**bold**\n# H\n- item");
    const args = mPost.mock.calls[0];
    expect(args[1]).toBe("**bold**\n# H\n- item");
    expect(args[0]).toBe("https://x.instructure.com/courses/42");
    expect(args[2]).toBe("Subj");
  });
});

const ALLOWED_KEYS = ["status", "kind", "reason"];

describe("W2-7 three-state", () => {
  it("accepted", async () => {
    const o = await sendBulkCourseMessageAction("c1", "S", "B");
    expect(o.status).toBe("accepted");
    expect(Object.keys(o).every((k) => ALLOWED_KEYS.includes(k))).toBe(true);
  });
  it("unknown", async () => {
    mPost.mockResolvedValueOnce({ status: "unknown", reason: "slow" });
    const o = await sendBulkCourseMessageAction("c1", "S", "B");
    expect(o.status).toBe("unknown");
    expect(Object.keys(o).every((k) => ALLOWED_KEYS.includes(k))).toBe(true);
  });
  it("builder refused -> canvas-refused", async () => {
    mPost.mockResolvedValueOnce({ status: "refused", reason: "HTTP 422" });
    const o = await sendBulkCourseMessageAction("c1", "S", "B");
    expect(o).toMatchObject({ status: "refused", kind: "canvas-refused" });
    expect(Object.keys(o).every((k) => ALLOWED_KEYS.includes(k))).toBe(true);
  });
  it("signed-out caller reaches nothing", async () => {
    mReq.mockImplementationOnce(async () => {
      throw new Error("Not signed in.");
    });
    await expect(sendBulkCourseMessageAction("c1", "S", "B")).rejects.toThrow("Not signed in.");
    expect(h.order).toEqual([]);
  });
});

describe("W2-9 egress pin", () => {
  it("source has no LLM or mail-provider reference", () => {
    const src = readFileSync(resolve(process.cwd(), "src/app/actions/bulk-course-message.ts"), "utf8");
    expect(src).not.toContain("callLlm");
    expect(src).not.toContain("@/lib/llm");
    expect(src).not.toMatch(/sendgrid|resend|nodemailer|smtp|gmail/i);
  });
});

// ---- A29 W3: the preview action, a read-only twin of the send ----

describe("W3-1 preview twin", () => {
  it("runs requireUser first, then getCourse, then count, and never posts", async () => {
    await previewBulkCourseMessageAction("c1");
    expect(h.order).toEqual(["requireUser", "getCourse", "count"]);
    expect(mPost).not.toHaveBeenCalled();
  });

  it.each([2, 50, 100])("count %i -> ready with the stored name and the count", async (n) => {
    mCount.mockResolvedValueOnce(n);
    mGet.mockImplementationOnce(async () => makeCourse({ name: "Stored Name" }));
    const p = await previewBulkCourseMessageAction("c1");
    expect(p).toEqual({ status: "ready", courseName: "Stored Name", count: n });
    expect(Object.keys(p).every((k) => ["status", "courseName", "count"].includes(k))).toBe(true);
    expect(mPost).not.toHaveBeenCalled();
  });

  it("refuses 1, 0 and 101 with the count in the reason where it applies", async () => {
    mCount.mockResolvedValueOnce(1);
    const one = await previewBulkCourseMessageAction("c1");
    expect(one).toMatchObject({ status: "refused", kind: "one-student" });
    expect("reason" in one && one.reason).toContain("1");
    mCount.mockResolvedValueOnce(0);
    expect(await previewBulkCourseMessageAction("c1")).toMatchObject({ status: "refused", kind: "one-student" });
    mCount.mockResolvedValueOnce(101);
    const over = await previewBulkCourseMessageAction("c1");
    expect(over).toMatchObject({ status: "refused", kind: "over-max" });
    expect("reason" in over && over.reason).toContain("101");
    expect(mPost).not.toHaveBeenCalled();
  });

  it("a blank url, a blank institution and a null course refuse without reading the count", async () => {
    mGet.mockImplementationOnce(async () => makeCourse({ canvasUrl: null }));
    expect(await previewBulkCourseMessageAction("c1")).toMatchObject({ status: "refused", kind: "not-linked" });
    mGet.mockImplementationOnce(async () => makeCourse({ institution: null }));
    expect(await previewBulkCourseMessageAction("c1")).toMatchObject({ status: "refused", kind: "needs-institution" });
    mGet.mockImplementationOnce(async () => null);
    expect(await previewBulkCourseMessageAction("c1")).toMatchObject({ status: "refused", kind: "not-linked" });
    expect(mCount).not.toHaveBeenCalled();
  });

  it("a credential error -> no-credential; any other throw -> canvas-unreachable", async () => {
    mCount.mockRejectedValueOnce(new Error(CANVAS_CREDENTIAL_REQUIRED_MESSAGE));
    expect(await previewBulkCourseMessageAction("c1")).toMatchObject({ status: "refused", kind: "no-credential" });
    mCount.mockRejectedValueOnce(new Error("fetch failed"));
    expect(await previewBulkCourseMessageAction("c1")).toMatchObject({ status: "refused", kind: "canvas-unreachable" });
  });

  it("a signed-out caller reaches nothing", async () => {
    mReq.mockImplementationOnce(async () => {
      throw new Error("Not signed in.");
    });
    await expect(previewBulkCourseMessageAction("c1")).rejects.toThrow("Not signed in.");
    expect(h.order).toEqual([]);
  });
});

describe("W3-1 parity: preview refuses iff send refuses, ready iff send posts", () => {
  const countFixtures: number[] = [0, 1, 2, 50, 100, 101];
  it.each(countFixtures)("count %i", async (n) => {
    mCount.mockResolvedValue(n);
    const preview = await previewBulkCourseMessageAction("c1");
    expect(mPost).not.toHaveBeenCalled();
    const sent = await sendBulkCourseMessageAction("c1", "S", "B");
    const posted = mPost.mock.calls.length === 1;
    expect(preview.status === "ready").toBe(posted);
    expect(preview.status === "refused").toBe(sent.status === "refused");
    if (preview.status === "refused" && sent.status === "refused") {
      expect(preview.kind).toBe(sent.kind);
      expect(preview.reason).toBe(sent.reason);
    }
  });

  const pathFixtures: Array<[string, Partial<Course> | null]> = [
    ["blank url", { canvasUrl: "  " }],
    ["blank institution", { institution: " " }],
    ["no course id in url", { canvasUrl: "https://x.instructure.com/about" }],
    ["null course", null],
  ];
  it.each(pathFixtures)("%s", async (_label, over) => {
    mGet.mockImplementation(async () => (over === null ? null : makeCourse(over)));
    const preview = await previewBulkCourseMessageAction("c1");
    const sent = await sendBulkCourseMessageAction("c1", "S", "B");
    expect(preview.status).toBe("refused");
    expect(sent.status).toBe("refused");
    if (preview.status === "refused" && sent.status === "refused") expect(preview.kind).toBe(sent.kind);
    expect(mPost).not.toHaveBeenCalled();
  });
});
