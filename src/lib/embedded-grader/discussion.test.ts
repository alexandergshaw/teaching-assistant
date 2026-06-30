import { describe, it, expect } from "vitest";
import {
  defaultDiscussionRubric,
  buildDiscussionRubric,
  gradeDiscussion,
  discussionChecklist,
  type DiscussionStudent,
  type DiscussionContext,
  type DiscussionSignal,
} from "./discussion";

function signalsOf(rubric: ReturnType<typeof buildDiscussionRubric>, column: string): DiscussionSignal[] {
  return rubric.criteria.find((c) => c.criterion === column)?.signals ?? [];
}

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

describe("buildDiscussionRubric", () => {
  it("detects the reply count and word floor from the prompt", () => {
    const rubric = buildDiscussionRubric(
      "Post an initial response of at least 250 words and reply to at least 3 classmates by Friday."
    );
    const participation = signalsOf(rubric, "Participation");
    expect(participation).toContainEqual({ kind: "min_replies", count: 3 });
    expect(participation).toContainEqual({ kind: "min_words", count: 250 });
    expect(signalsOf(rubric, "Engagement")).toContainEqual({ kind: "replies_to_peers", count: 3 });
  });

  it("understands written-out reply counts", () => {
    const rubric = buildDiscussionRubric("Reply to at least two of your peers.");
    expect(signalsOf(rubric, "Participation")).toContainEqual({ kind: "min_replies", count: 2 });
  });

  it("adds a keyword-coverage proxy from prompt terms", () => {
    const rubric = buildDiscussionRubric('Discuss the role of "encapsulation" in your design. Reply to 2 peers.');
    const quality = signalsOf(rubric, "Quality proxies");
    const keywords = quality.find((s): s is Extract<DiscussionSignal, { kind: "keywords" }> => s.kind === "keywords");
    expect(keywords?.terms).toContain("encapsulation");
  });

  it("falls back to defaults with a warning when no prompt is given", () => {
    const rubric = buildDiscussionRubric("");
    expect(signalsOf(rubric, "Participation")).toContainEqual({ kind: "min_replies", count: 2 });
    expect(rubric.warnings.join(" ")).toContain("default participation thresholds");
  });

  it("always warns that the quality column is a proxy", () => {
    expect(buildDiscussionRubric("Write at least 100 words.").warnings.join(" ")).toContain("stand-in for content quality");
  });

  it("does not invent a multi-day or word-count requirement the prompt never states", () => {
    // The user's real prompt: a post + two replies, by the due date. No days, no word count.
    const prompt = `Your posts in the discussion area should exhibit careful thought and logical reasoning and provide evidence for your position. The discussions must be completed by the due dates specified. You are also required to read and reply to other students in this discussion forum. Your grade will be based on your post as well as your required two replies to the posts of your classmates. Once you have posted, reply to two other students' posts.`;
    const rubric = buildDiscussionRubric(prompt);
    const kinds = rubric.criteria.flatMap((c) => c.signals.map((s) => s.kind));
    expect(kinds).not.toContain("distinct_days");
    expect(kinds).not.toContain("min_words");
    // ...but it still grades what the prompt does state.
    expect(kinds).toContain("initial_post");
    expect(signalsOf(rubric, "Participation")).toContainEqual({ kind: "min_replies", count: 2 });
    expect(signalsOf(rubric, "Engagement")).toContainEqual({ kind: "replies_to_peers", count: 2 });
    expect(signalsOf(rubric, "Timeliness").map((s) => s.kind)).toEqual(["posted_by_due"]);
  });

  it("adds a multi-day signal only when the prompt explicitly asks for one", () => {
    const rubric = buildDiscussionRubric("Post on at least 3 different days throughout the week. Reply to 2 peers.");
    expect(signalsOf(rubric, "Timeliness")).toContainEqual({ kind: "distinct_days", count: 3 });
  });
});
