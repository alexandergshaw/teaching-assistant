import { describe, it, expect } from "vitest";
import {
  emptyCourseProject,
  coerceCourseProject,
  hasProject,
  milestoneForWeek,
  milestoneBriefFor,
  renderMilestoneContract,
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
