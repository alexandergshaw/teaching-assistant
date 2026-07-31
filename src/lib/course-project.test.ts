import { describe, it, expect } from "vitest";
import {
  emptyCourseProject,
  coerceCourseProject,
  hasProject,
  hasCommittedTools,
  milestoneForWeek,
  milestoneBriefFor,
  renderMilestoneContract,
  projectChoiceContract,
  renderProjectBrief,
  describeProject,
  type CourseProject,
} from "./course-project";

function project(overrides: Partial<CourseProject> = {}): CourseProject {
  return {
    ...emptyCourseProject(),
    mode: "course-long",
    name: "Harden a small-business network",
    definition: "Assess, harden, and document the security posture of one small business.",
    milestones: [
      { week: 1, title: "Scope and asset inventory", deliverable: "An asset register" },
      { week: 3, title: "Threat model draft", deliverable: "A threat model document" },
      { week: 5, title: "Control selection", deliverable: "A control matrix" },
      { week: 7, title: "Remediation plan", deliverable: "A prioritized plan" },
    ],
    ...overrides,
  };
}

describe("coerceCourseProject", () => {
  // A tile read must never crash on whatever is in the jsonb column.
  it("never throws and returns the empty shape for any junk", () => {
    for (const junk of [null, undefined, "", 0, 42, [], [1, 2], "text", true]) {
      expect(() => coerceCourseProject(junk)).not.toThrow();
      expect(coerceCourseProject(junk)).toEqual(emptyCourseProject());
    }
  });

  it("falls back on an out-of-union mode", () => {
    expect(coerceCourseProject({ mode: "banana" }).mode).toBe("none");
    expect(coerceCourseProject({ mode: "course-long" }).mode).toBe("course-long");
  });

  it("survives a malformed milestones field", () => {
    expect(coerceCourseProject({ milestones: "nope" }).milestones).toEqual([]);
    expect(coerceCourseProject({ milestones: [null, 3, {}, "x"] }).milestones).toEqual([]);
  });

  // Inventing a week number or a title would silently mis-order the semester.
  it("drops milestones with an unusable week", () => {
    const p = coerceCourseProject({
      milestones: [
        { week: 0, title: "Too early" },
        { week: -2, title: "Negative" },
        { week: 1.5, title: "Fractional" },
        { week: Number.NaN, title: "NaN" },
        { week: "3", title: "String" },
        { week: 4, title: "Kept" },
      ],
    });
    expect(p.milestones.map((m) => m.title)).toEqual(["Kept"]);
  });

  it("drops milestones with a blank title", () => {
    const p = coerceCourseProject({
      milestones: [
        { week: 1, title: "   " },
        { week: 2, title: "Real" },
      ],
    });
    expect(p.milestones.map((m) => m.week)).toEqual([2]);
  });

  it("keeps the FIRST of duplicate weeks and sorts ascending", () => {
    const p = coerceCourseProject({
      milestones: [
        { week: 5, title: "Fifth" },
        { week: 2, title: "Second" },
        { week: 5, title: "Duplicate fifth" },
        { week: 1, title: "First" },
      ],
    });
    expect(p.milestones.map((m) => m.week)).toEqual([1, 2, 5]);
    expect(p.milestones.find((m) => m.week === 5)!.title).toBe("Fifth");
  });

  // The whole column is read on every tile load, so it must stay bounded.
  it("caps the brief and the milestone list", () => {
    const p = coerceCourseProject({
      brief: "x".repeat(100000),
      definition: "d".repeat(9000),
      milestones: Array.from({ length: 200 }, (_, i) => ({ week: i + 1, title: `M${i + 1}` })),
    });
    expect(p.brief.length).toBe(20000);
    expect(p.definition.length).toBe(4000);
    expect(p.milestones.length).toBe(60);
  });

  it("round-trips a valid record unchanged", () => {
    const valid = project();
    expect(coerceCourseProject(valid)).toEqual(valid);
  });
});

describe("hasProject", () => {
  it("requires both course-long mode and a definition", () => {
    expect(hasProject(project())).toBe(true);
    expect(hasProject(project({ mode: "none" }))).toBe(false);
    expect(hasProject(project({ definition: "   " }))).toBe(false);
  });
});

describe("milestoneForWeek", () => {
  // Handing week 7's work to week 9 would duplicate an assignment the student
  // already did, so the match is exact with no nearest-neighbour fallback.
  it("matches exactly, and returns null for gaps and out-of-range weeks", () => {
    const p = project();
    expect(milestoneForWeek(p, 3)!.title).toBe("Threat model draft");
    expect(milestoneForWeek(p, 0)).toBeNull();
    expect(milestoneForWeek(p, 2)).toBeNull();
    expect(milestoneForWeek(p, 99)).toBeNull();
  });
});

describe("milestoneBriefFor", () => {
  it("returns null when the project is switched off, even with milestones stored", () => {
    expect(milestoneBriefFor(project({ mode: "none" }), 3)).toBeNull();
  });

  it("returns null when there is no milestone for that week", () => {
    expect(milestoneBriefFor(project(), 2)).toBeNull();
  });

  it("carries the project name and definition alongside the milestone", () => {
    const brief = milestoneBriefFor(project(), 3)!;
    expect(brief.week).toBe(3);
    expect(brief.title).toBe("Threat model draft");
    expect(brief.deliverable).toBe("A threat model document");
    expect(brief.projectName).toBe("Harden a small-business network");
    expect(brief.projectDefinition).toContain("small business");
  });

  it("carries at most the 3 most recent earlier titles, oldest-first", () => {
    const p = project({
      milestones: [
        { week: 1, title: "One", deliverable: "" },
        { week: 2, title: "Two", deliverable: "" },
        { week: 3, title: "Three", deliverable: "" },
        { week: 4, title: "Four", deliverable: "" },
        { week: 5, title: "Five", deliverable: "" },
      ],
    });
    expect(milestoneBriefFor(p, 5)!.priorTitles).toEqual(["Two", "Three", "Four"]);
  });

  it("has no prior titles for the first milestone", () => {
    expect(milestoneBriefFor(project(), 1)!.priorTitles).toEqual([]);
  });
});

describe("renderMilestoneContract", () => {
  it("names the milestone, the project, and the deliverable", () => {
    const text = renderMilestoneContract(milestoneBriefFor(project(), 3)!);
    expect(text).toContain("milestone 3");
    expect(text).toContain("Harden a small-business network");
    expect(text).toContain("Threat model draft");
    expect(text).toContain("A threat model document");
  });

  it("forbids re-specifying earlier milestones and reaching ahead", () => {
    const text = renderMilestoneContract(milestoneBriefFor(project(), 5)!);
    expect(text).toContain("Scope and asset inventory");
    expect(text).toContain("do not re-specify them");
    expect(text).toContain("do not reach ahead");
  });

  // Week 1 has nothing behind it; claiming prior work exists would have the
  // model build on an artifact the student never made.
  it("says plainly that the first milestone has nothing before it", () => {
    const text = renderMilestoneContract(milestoneBriefFor(project(), 1)!);
    expect(text).toContain("first milestone");
    expect(text).not.toContain("Earlier milestones are already done");
  });

  it("is deterministic", () => {
    const brief = milestoneBriefFor(project(), 3)!;
    expect(renderMilestoneContract(brief)).toBe(renderMilestoneContract(brief));
  });

  // AC1 (docs/REGRESSION.md 146): a later milestone must not just note that
  // earlier ones happened - it must explicitly say to EXTEND them.
  describe("chaining (AC1/AC4 pivot)", () => {
    it("tells the model to build on prior work rather than restart it", () => {
      const text = renderMilestoneContract(milestoneBriefFor(project(), 5)!);
      expect(text).toContain("BUILD ON");
      expect(text).toContain("do not restart it from scratch");
    });

    it("tells the model to follow the student's current direction on a pivot", () => {
      const text = renderMilestoneContract(milestoneBriefFor(project(), 5)!);
      expect(text).toContain("CURRENT direction instead of the original one");
      expect(text).toContain("never assume the specific content of a prior artifact");
    });

    // Week 1 has nothing to build on: the chaining sentence must not appear
    // at all for the first milestone.
    it("never asserts the build-on instruction for the first milestone", () => {
      const text = renderMilestoneContract(milestoneBriefFor(project(), 1)!);
      expect(text).not.toContain("BUILD ON");
      expect(text).toContain("do not ask the student to build on something they have not made yet");
    });
  });
});

// "Subject chosen once" fix: the original PROJECT_CHOICE_CONTRACT constant
// was pushed unconditionally into every week's prompt, so a real generated
// week 8 re-offered a fresh set of subject examples ("Select a specific
// infrastructure project subject to budget for this assignment. Examples
// include: a community garden ...") even though that SAME assignment's own
// milestone sentence, one paragraph earlier, said to build on the student's
// existing work. projectChoiceContract(isFirstMilestone) fixes this by
// branching: the first milestone still gives an explicit choice point, and
// every later milestone instead says the choice is already made and must not
// be re-offered.
describe("projectChoiceContract (AC2/AC3/AC7, subject-chosen-once fix)", () => {
  describe("the FIRST milestone (isFirstMilestone: true)", () => {
    const text = projectChoiceContract(true);

    // AC2: the subject is the student's, not one the prompt invents.
    it("states the subject is the student's choice, not an invented one", () => {
      expect(text).toContain("STUDENT's choice");
      expect(text).toContain("do not invent or assume a particular company, dataset, or scenario yourself");
    });

    it("gives an explicit choice point now, since this is the first milestone", () => {
      expect(text).toContain("FIRST milestone");
      expect(text).toContain("give the student an explicit choice point for it now");
    });

    // AC2: reuses the concrete-direction rule instead of restating its own
    // "2-4 examples" requirement - a second paraphrase is exactly what AC7
    // asks this constant to avoid.
    it("references the concrete-direction rule rather than restating it", () => {
      expect(text).toContain("concrete-direction rule");
      expect(text).not.toContain("2-4");
    });

    // AC3: rigor is the constraint that makes the freedom safe.
    it("fixes the rigor bar regardless of the student's chosen subject", () => {
      expect(text).toContain("RIGOR IS NOT NEGOTIABLE");
      expect(text).toContain("the subject is open, the competency demonstrated is not");
    });

    // Nothing to pivot from yet - the first milestone must not carry pivot
    // language that presupposes an earlier choice.
    it("carries no pivot language - there is nothing yet to pivot from", () => {
      expect(text).not.toContain("CURRENT direction");
      expect(text).not.toContain("never penalize a change of direction");
    });

    // AC6: nothing here should read as coding- or applied-specific.
    it("is course-kind neutral", () => {
      expect(text.toLowerCase()).not.toContain("code");
      expect(text.toLowerCase()).not.toContain("program");
    });
  });

  describe("a LATER milestone (isFirstMilestone: false)", () => {
    const text = projectChoiceContract(false);

    // The core of the fix: a later week must NOT re-offer the subject
    // choice - this is what let a real generated week 8 contradict its own
    // "build on your previous milestone" instruction.
    it("states the subject was already chosen and forbids re-offering it", () => {
      expect(text).toContain("already chosen by the student at an earlier milestone");
      expect(text).toContain("do NOT ask the student to select, choose, or pick a project subject again");
      expect(text).toContain("do NOT re-offer subject examples");
    });

    // AC5/regression-146 pivot rule: a genuine pivot must still be honored,
    // not penalized - continuity must not become a trap.
    it("tells the model to follow the student's current direction on a pivot", () => {
      expect(text).toContain("follow their CURRENT direction");
      expect(text).toContain("never penalize a change of direction");
    });

    // AC4: the concrete-direction requirement still applies THIS week - not
    // to re-picking the subject, but to how the student approaches this
    // week's own task within the subject already chosen.
    it("redirects the concrete-direction rule at HOW to approach this week's task, not WHICH subject to use", () => {
      expect(text).toContain("HOW the student approaches this week's specific task");
      expect(text).not.toContain("2-4");
    });

    // AC3: rigor is unchanged by which branch is in play.
    it("fixes the rigor bar regardless of the student's chosen subject", () => {
      expect(text).toContain("RIGOR IS NOT NEGOTIABLE");
      expect(text).toContain("the subject is open, the competency demonstrated is not");
    });

    // AC6: nothing here should read as coding- or applied-specific.
    it("is course-kind neutral", () => {
      expect(text.toLowerCase()).not.toContain("code");
      expect(text.toLowerCase()).not.toContain("program");
    });
  });

  it("is deterministic", () => {
    expect(projectChoiceContract(true)).toBe(projectChoiceContract(true));
    expect(projectChoiceContract(false)).toBe(projectChoiceContract(false));
  });
});

// Tool-churn fix: the persisted, course-committed toolset lives on
// CourseProject.tools (see steps.course-project.ts's ensureCourseTools).
describe("CourseProject.tools / hasCommittedTools (tool-churn fix)", () => {
  it("emptyCourseProject has no committed tools", () => {
    expect(emptyCourseProject().tools).toEqual([]);
    expect(hasCommittedTools(emptyCourseProject())).toBe(false);
  });

  it("hasCommittedTools is true once a toolset is set, regardless of project mode", () => {
    expect(hasCommittedTools({ ...emptyCourseProject(), tools: ["Trello (free plan)"] })).toBe(true);
  });

  describe("coerceCourseProject", () => {
    it("keeps a valid tools array, trimmed and bounded", () => {
      const p = coerceCourseProject({ tools: ["  Trello (free plan)  ", "Excel (free trial)"] });
      expect(p.tools).toEqual(["Trello (free plan)", "Excel (free trial)"]);
    });

    it("drops non-string and blank entries", () => {
      const p = coerceCourseProject({ tools: ["Trello (free plan)", 42, null, "   ", "Excel (free trial)"] });
      expect(p.tools).toEqual(["Trello (free plan)", "Excel (free trial)"]);
    });

    it("caps the toolset small - a committed set is not a catalog", () => {
      const p = coerceCourseProject({
        tools: ["A", "B", "C", "D", "E", "F", "G"],
      });
      expect(p.tools.length).toBe(5);
      expect(p.tools).toEqual(["A", "B", "C", "D", "E"]);
    });

    it("falls back to an empty array for a malformed tools field", () => {
      expect(coerceCourseProject({ tools: "not an array" }).tools).toEqual([]);
      expect(coerceCourseProject({ tools: null }).tools).toEqual([]);
      expect(coerceCourseProject({}).tools).toEqual([]);
    });
  });
});

describe("renderProjectBrief", () => {
  it("renders the name, definition and every milestone", () => {
    const text = renderProjectBrief(project());
    expect(text).toContain("# Harden a small-business network");
    expect(text).toContain("small business");
    expect(text).toContain("- Week 3 - Threat model draft");
    expect(text).toContain("Hand in: A threat model document");
  });

  it("omits the milestones section entirely when there are none", () => {
    expect(renderProjectBrief(project({ milestones: [] }))).not.toContain("## Milestones");
  });

  it("is deterministic", () => {
    expect(renderProjectBrief(project())).toBe(renderProjectBrief(project()));
  });
});

describe("describeProject", () => {
  it("summarizes a set project and says Not set otherwise", () => {
    expect(describeProject(project())).toBe("Harden a small-business network - 4 milestones");
    expect(describeProject(project({ milestones: [{ week: 1, title: "Only", deliverable: "" }] }))).toContain(
      "1 milestone"
    );
    expect(describeProject(project({ milestones: [] }))).toContain("no milestones yet");
    expect(describeProject(emptyCourseProject())).toBe("Not set");
    expect(describeProject(project({ mode: "none" }))).toBe("Not set");
  });
});
