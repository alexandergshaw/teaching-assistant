import { describe, it, expect } from "vitest";
import {
  sessionTitle,
  renderCaseStudy,
  renderDiscussionPrompt,
  renderSessionOverview,
  buildSessionAssignmentObjectives,
  buildSessionAssignmentContext,
  quizSectionsFor,
  type ClassSessionContext,
  type CaseStudyLike,
} from "./class-session-brief";
import {
  emptyClassSessionSpec,
  coerceClassSessionSpec,
  coerceDiscussionSpec,
  coerceQuizSpec,
  CLASS_SESSION_VARIANTS,
  TECHNICAL_APTITUDES,
  type ClassSessionSpec,
} from "./artifact-templates/types";

function spec(overrides: Partial<ClassSessionSpec> = {}): ClassSessionSpec {
  return { ...emptyClassSessionSpec(), ...overrides };
}

function ctx(overrides: Partial<ClassSessionContext> = {}): ClassSessionContext {
  return { courseName: "CS 101", topic: "Loops", weekLabel: "Week 3", ...overrides };
}

const CASE: CaseStudyLike = {
  title: "An outage traced to an infinite loop",
  bullets: ["The service stalled for 40 minutes.", "A missing exit condition was the cause."],
  url: "https://example.test/postmortem",
};

describe("sessionTitle", () => {
  it("joins the week label and topic", () => {
    expect(sessionTitle(ctx())).toBe("Week 3: Loops");
  });

  it("uses whichever part exists", () => {
    expect(sessionTitle(ctx({ topic: "" }))).toBe("Week 3");
    expect(sessionTitle(ctx({ weekLabel: "" }))).toBe("Loops");
  });

  it("falls back when neither exists", () => {
    expect(sessionTitle(ctx({ topic: "", weekLabel: "" }))).toBe("Class session");
  });
});

describe("renderCaseStudy", () => {
  it("renders the title, bullets, and topic connection", () => {
    const text = renderCaseStudy(CASE, ctx());
    expect(text).toContain("# Case study: An outage traced to an infinite loop");
    expect(text).toContain("Connects to: Loops");
    expect(text).toContain("- The service stalled for 40 minutes.");
  });

  // The research layer attaches provenance to live-web material; dropping it
  // would present a scraped extract as if it were curated fact.
  it("keeps the source link when there is one", () => {
    expect(renderCaseStudy(CASE, ctx())).toContain("Source: https://example.test/postmortem");
  });

  it("omits the source line entirely when there is no url", () => {
    const text = renderCaseStudy({ title: "T", bullets: ["b"] }, ctx());
    expect(text).not.toContain("Source:");
  });
});

describe("renderDiscussionPrompt", () => {
  it("uses the template's own prompt when it has one", () => {
    const text = renderDiscussionPrompt(
      spec({ discussion: { prompt: "Argue the other side.", postMinWords: 100, requiredReplies: 1, points: 5 } }),
      ctx(),
      CASE
    );
    expect(text).toContain("Argue the other side.");
    expect(text).toContain("at least 100 words");
    expect(text).toContain("at least 1 classmate");
    expect(text).toContain("Worth 5 point(s).");
  });

  it("falls back to a case-study prompt when the template has none", () => {
    const text = renderDiscussionPrompt(spec(), ctx(), CASE);
    expect(text).toContain("Read the case study");
    expect(text).toContain("Loops");
  });

  it("falls back to a topic prompt when there is no case study", () => {
    const text = renderDiscussionPrompt(spec(), ctx(), null);
    expect(text).not.toContain("Read the case study");
    expect(text).toContain("Loops");
  });

  it("omits the replies line when no replies are required", () => {
    const text = renderDiscussionPrompt(
      spec({ discussion: { prompt: "p", postMinWords: 50, requiredReplies: 0, points: 5 } }),
      ctx(),
      null
    );
    expect(text).not.toContain("classmate");
  });
});

describe("buildSessionAssignmentObjectives / Context", () => {
  it("carries the topic and the template's goal", () => {
    const objectives = buildSessionAssignmentObjectives(
      spec({ assignment: { ...emptyClassSessionSpec().assignment, goal: "Build a parser." } }),
      ctx()
    );
    expect(objectives).toContain("Topic: Loops");
    expect(objectives).toContain("Build a parser.");
  });

  // The variant contract is the ONE thing that differs between the no-code and
  // codebase class templates, so it must reach the prompt verbatim.
  it("includes the variant's prompt contract verbatim", () => {
    const codebase = CLASS_SESSION_VARIANTS.find((v) => v.value === "codebase")!;
    const text = buildSessionAssignmentContext(spec({ variant: "codebase" }), ctx(), null);
    expect(text).toContain(codebase.promptContract);
    expect(text).toContain("GitHub");

    const noCode = CLASS_SESSION_VARIANTS.find((v) => v.value === "no-code")!;
    const other = buildSessionAssignmentContext(spec({ variant: "no-code" }), ctx(), null);
    expect(other).toContain(noCode.promptContract);
    expect(other).not.toContain(codebase.promptContract);
  });

  it("includes the aptitude's prompt contract verbatim", () => {
    const advanced = TECHNICAL_APTITUDES.find((a) => a.value === "advanced")!;
    const text = buildSessionAssignmentContext(
      spec({ assignment: { ...emptyClassSessionSpec().assignment, aptitude: "advanced" } }),
      ctx(),
      null
    );
    expect(text).toContain(advanced.promptContract);
  });

  it("names the semester project only when the assignment builds toward one", () => {
    const withProject = buildSessionAssignmentContext(
      spec({
        assignment: {
          ...emptyClassSessionSpec().assignment,
          buildsTowardProject: true,
          projectDescription: "A term-long data pipeline",
        },
      }),
      ctx(),
      null
    );
    expect(withProject).toContain("A term-long data pipeline");

    const without = buildSessionAssignmentContext(spec(), ctx(), null);
    expect(without).not.toContain("semester-long project");
  });

  it("ties the work to the case study when there is one", () => {
    const text = buildSessionAssignmentContext(spec(), ctx(), CASE);
    expect(text).toContain(CASE.title);
  });
});

describe("quizSectionsFor", () => {
  it("splits the question count evenly across the kinds", () => {
    const sections = quizSectionsFor(
      spec({ quiz: { questionCount: 8, pointsEach: 2, kinds: ["multiple_choice", "true_false"] } })
    );
    expect(sections).toEqual([
      { kind: "multiple_choice", count: 4, pointsEach: 2 },
      { kind: "true_false", count: 4, pointsEach: 2 },
    ]);
  });

  it("gives the remainder to the earlier kinds", () => {
    const sections = quizSectionsFor(
      spec({ quiz: { questionCount: 7, pointsEach: 1, kinds: ["multiple_choice", "true_false", "short_answer"] } })
    );
    expect(sections.map((s) => s.count)).toEqual([3, 2, 2]);
    expect(sections.reduce((sum, s) => sum + s.count, 0)).toBe(7);
  });

  it("never emits a zero-count section", () => {
    const sections = quizSectionsFor(
      spec({ quiz: { questionCount: 2, pointsEach: 1, kinds: ["multiple_choice", "true_false", "essay"] } })
    );
    expect(sections.every((s) => s.count > 0)).toBe(true);
    expect(sections.reduce((sum, s) => sum + s.count, 0)).toBe(2);
  });

  it("returns nothing for a zero-question quiz", () => {
    expect(quizSectionsFor(spec({ quiz: { questionCount: 0, pointsEach: 1, kinds: ["multiple_choice"] } }))).toEqual([]);
  });
});

describe("renderSessionOverview", () => {
  it("lists every leg of the package", () => {
    const text = renderSessionOverview(spec(), ctx(), CASE);
    expect(text).toContain("# Week 3: Loops");
    expect(text).toContain(`- Case study: ${CASE.title}`);
    expect(text).toContain("Discussion board post");
    expect(text).toContain("Hands-on assignment");
    expect(text).toContain("Quiz");
  });

  it("says so plainly when the case study could not be found", () => {
    const text = renderSessionOverview(spec(), ctx(), null);
    expect(text).toContain("no recent example could be found");
  });

  it("omits the case-study line entirely when the template turned it off", () => {
    const text = renderSessionOverview(spec({ includeCaseStudy: false }), ctx(), null);
    expect(text).not.toContain("Case study");
  });

  it("marks the codebase variant's GitHub URL submission", () => {
    expect(renderSessionOverview(spec({ variant: "codebase" }), ctx(), null)).toContain("GitHub URL");
    expect(renderSessionOverview(spec({ variant: "no-code" }), ctx(), null)).not.toContain("GitHub URL");
  });
});

describe("class session spec coercion", () => {
  it("never throws on junk and falls back to the empty spec", () => {
    for (const junk of [null, undefined, "text", 42, [1, 2]]) {
      expect(() => coerceClassSessionSpec(junk)).not.toThrow();
      expect(coerceClassSessionSpec(junk)).toEqual(emptyClassSessionSpec());
    }
  });

  it("falls back on an unknown variant rather than guessing", () => {
    expect(coerceClassSessionSpec({ variant: "hybrid" }).variant).toBe("no-code");
  });

  it("falls back on an unknown assignment aptitude", () => {
    expect(coerceClassSessionSpec({ assignment: { aptitude: "expert" } }).assignment.aptitude).toBe("intro");
  });

  it("rejects a blank case-study window rather than searching on nothing", () => {
    expect(coerceClassSessionSpec({ caseStudyWindow: "   " }).caseStudyWindow).toBe("the past 30 days");
  });

  it("round-trips a fully valid spec unchanged", () => {
    const valid = spec({ variant: "codebase", includeCaseStudy: false });
    expect(coerceClassSessionSpec(valid)).toEqual(valid);
  });

  it("drops unknown quiz kinds, and falls back when none survive", () => {
    expect(coerceQuizSpec({ kinds: ["multiple_choice", "riddle"] }).kinds).toEqual(["multiple_choice"]);
    // An empty list would mean a quiz with no answerable question kind.
    expect(coerceQuizSpec({ kinds: ["riddle"] }).kinds).toEqual(["multiple_choice"]);
  });

  it("falls back on negative or non-numeric discussion values", () => {
    const d = coerceDiscussionSpec({ postMinWords: -5, requiredReplies: "two", points: NaN });
    expect(d.postMinWords).toBe(150);
    expect(d.requiredReplies).toBe(2);
    expect(d.points).toBe(10);
  });
});
