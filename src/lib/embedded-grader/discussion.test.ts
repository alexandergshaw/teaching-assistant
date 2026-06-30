import { describe, it, expect } from "vitest";
import type { DiscussionActivity } from "@/lib/canvas";
import {
  defaultDiscussionRubric,
  gradeDiscussion,
  discussionChecklist,
  type DiscussionStudent,
  type DiscussionContext,
} from "./discussion";

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

const ctx: DiscussionContext = {
  dueAt: "2026-02-10T23:59:00Z",
  participants: [
    { userId: 1, name: "Alice Adams" },
    { userId: 2, name: "Bob Smith" },
    { userId: 3, name: "Carol Lee" },
  ],
};

// A student who meets every signal in the default rubric.
const strong: DiscussionStudent = {
  student: "Alice Adams",
  userId: 1,
  activity: {
    initialPosts: [{ text: words(120), createdAt: "2026-02-08T10:00:00Z", isReply: false, parentUserId: null }],
    replies: [
      { text: `${words(55)} Nice analysis Bob, what about this? See http://example.com/x`, createdAt: "2026-02-09T10:00:00Z", isReply: true, parentUserId: 2 },
      { text: `${words(55)} Agreed with Carol here.`, createdAt: "2026-02-09T11:00:00Z", isReply: true, parentUserId: 3 },
    ],
  },
};

// A student with only a short, late initial post.
const weak: DiscussionStudent = {
  student: "Dan Doe",
  userId: 4,
  activity: {
    initialPosts: [{ text: words(20), createdAt: "2026-02-12T08:00:00Z", isReply: false, parentUserId: null }],
    replies: [],
  },
};

describe("gradeDiscussion with the default rubric", () => {
  const rubric = defaultDiscussionRubric();

  it("exposes the four composite columns and a checklist", () => {
    const run = gradeDiscussion([strong], rubric, ctx);
    expect(run.rubricAreaNames).toEqual(["Participation", "Timeliness", "Engagement", "Quality proxies"]);
    expect(run.fullCreditChecklist).toHaveLength(4);
  });

  it("awards full credit to a student who meets every signal", () => {
    const run = gradeDiscussion([strong], rubric, ctx);
    const r = run.results[0];
    expect(r.totalScore).toBe("40/40");
    for (const area of r.rubricAreas) expect(area.score).toBe("10/10");
    expect(r.userId).toBe(1); // preserved for Canvas write-back
    expect(r.submittedFiles[0]?.name).toBe("Discussion posts"); // posts previewable
    expect(r.overallComment).toContain("1 initial response and 2 replies");
  });

  it("penalizes a thin, late, no-reply submission", () => {
    const run = gradeDiscussion([weak], rubric, ctx);
    const byArea = Object.fromEntries(run.results[0].rubricAreas.map((a) => [a.area, a.score]));
    expect(byArea["Engagement"]).toBe("0/10"); // no replies, no peer named
    expect(byArea["Quality proxies"]).toBe("0/10"); // no question/source, short post
    const earned = Number(run.results[0].totalScore.split("/")[0]);
    expect(earned).toBeLessThan(15);
  });

  it("reports who is late via the Timeliness detail", () => {
    const run = gradeDiscussion([weak], rubric, ctx);
    const timeliness = run.results[0].rubricAreas.find((a) => a.area === "Timeliness");
    expect(timeliness?.comment).toMatch(/late/i);
  });

  it("re-bases the total onto a Canvas points_possible", () => {
    const run = gradeDiscussion([strong], rubric, ctx, 20);
    expect(run.results[0].totalScore).toBe("20/20");
  });

  it("warns that the quality column is a proxy", () => {
    expect(rubric.warnings.join(" ")).toContain("stand-in for content quality");
  });
});

describe("discussionChecklist", () => {
  it("describes each criterion's requirements", () => {
    const list = discussionChecklist(defaultDiscussionRubric());
    expect(list.join(" ")).toContain("make an initial post");
    expect(list.join(" ")).toContain("reply to at least 2 classmates");
  });
});
