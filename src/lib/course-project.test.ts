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
  PROJECT_HANDS_ON_CONTRACT,
  PROJECT_EVERYDAY_CONTRACT,
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

// "Hands-on project" fix: a real generated ethical hacking course's weekly
// project deliverables were documentation ABOUT security work ("a visual
// network diagram exported as PNG or PDF", "a link to your updated Airtable
// base"), never evidence of having done any. PROJECT_HANDS_ON_CONTRACT is
// composed VERBATIM by both the project-design prompt
// (generateCourseProjectAction, src/app/actions/course-project.ts) and every
// week's assignment prompt that carries a milestone forward (shared.ts) -
// these tests pin the constant's own wording so a later edit cannot quietly
// soften or drop either half of it.
describe("PROJECT_HANDS_ON_CONTRACT (AC4/AC5/AC6/AC7)", () => {
  // AC4: push toward doing the work and evidencing it, not describing it.
  it("AC4: pushes toward producing evidence of having done the field's real work, not describing it", () => {
    expect(PROJECT_HANDS_ON_CONTRACT).toContain("actually DOING this field's real work");
    expect(PROJECT_HANDS_ON_CONTRACT).toContain("producing evidence of having done it");
    expect(PROJECT_HANDS_ON_CONTRACT).toContain(
      "an artifact a working practitioner in this field would actually produce"
    );
    expect(PROJECT_HANDS_ON_CONTRACT).toContain("never just a plan, summary, report, or diagram ABOUT the work");
  });

  // AC5: generalized, not hardcoded to security - the rule states the
  // PRINCIPLE and only names several different fields as illustrations of the
  // same reasoning, so it is not "if security course, then X".
  it("AC5: generalizes across fields rather than hardcoding security", () => {
    expect(PROJECT_HANDS_ON_CONTRACT).toContain("Reason from the course's own description and weekly topics");
    expect(PROJECT_HANDS_ON_CONTRACT).toContain("a statistics course analyzes real data");
    expect(PROJECT_HANDS_ON_CONTRACT).toContain("a design course produces real designs");
    expect(PROJECT_HANDS_ON_CONTRACT).toContain("a network course configures and tests real networks");
    // Security is only ONE of several named examples, not the sole subject of
    // the rule - the AUTHORIZED TARGETS ONLY paragraph (checked separately
    // below) is what is unconditional, not a security-only branch here.
    expect(PROJECT_HANDS_ON_CONTRACT).toContain("a security course finds and reports real vulnerabilities");
  });

  // AC6: the legal/safety boundary - explicit, unconditional, and never
  // pointed at a real system the student does not own or is not permitted to
  // test. Practice targets/labs, isolated environments, and instructor-scoped
  // environments are the only sanctioned options.
  it("AC6: requires authorized targets only, and states the boundary explicitly", () => {
    expect(PROJECT_HANDS_ON_CONTRACT).toContain("AUTHORIZED TARGETS ONLY");
    expect(PROJECT_HANDS_ON_CONTRACT).toContain("intentionally vulnerable practice target or lab built for exactly this purpose");
    expect(PROJECT_HANDS_ON_CONTRACT).toContain("the student's own isolated environment");
    expect(PROJECT_HANDS_ON_CONTRACT).toContain("a scoped environment the instructor provides");
    expect(PROJECT_HANDS_ON_CONTRACT).toContain(
      "Never direct a student at a real system, network, account, or organization they do not own or do not have explicit written permission to test."
    );
  });

  // AC6 (this must not be quietly removable): the exact authorization
  // sentence, verbatim - a paraphrase that drops "own" or "explicit written
  // permission" would silently weaken the one part of this constant that is
  // a safety boundary, not a style choice.
  it("AC6: the authorization sentence is exactly this wording", () => {
    expect(PROJECT_HANDS_ON_CONTRACT).toContain(
      "Never direct a student at a real system, network, account, or organization they do not own or do not have explicit written permission to test."
    );
  });

  // AC7: hands-on must never regress into "write a program" for an applied
  // (no-code) course.
  it("AC7: hands-on for an applied (no-code) course still means real tools, never a program to write or run", () => {
    expect(PROJECT_HANDS_ON_CONTRACT).toContain("For an APPLIED (no-code) course, hands-on still means");
    expect(PROJECT_HANDS_ON_CONTRACT).toContain("it never means writing or running a program");
  });

  it("is a non-empty constant string, not a function", () => {
    expect(typeof PROJECT_HANDS_ON_CONTRACT).toBe("string");
    expect(PROJECT_HANDS_ON_CONTRACT.length).toBeGreaterThan(0);
  });
});

// "Everyday default project" fix: an instructor asked for default projects
// that are "approachable, simple, things that people would encounter
// everyday" instead of the app's own enterprise/institutional default (e.g.
// the shipped "one organization" preset text this same fix also rewrites,
// artifact-templates/presets.ts). PROJECT_EVERYDAY_CONTRACT is a SEPARATE,
// ADDITIVE constant - PROJECT_HANDS_ON_CONTRACT above is intentionally
// unedited, and its own pinned substrings (including the security example)
// must remain unchanged by this describe block.
describe("PROJECT_EVERYDAY_CONTRACT (everyday default project fix)", () => {
  it("steers the subject toward an everyday context, not enterprise/institutional by default", () => {
    expect(PROJECT_EVERYDAY_CONTRACT).toContain(
      "a context an ordinary person already understands without being taught it first"
    );
    expect(PROJECT_EVERYDAY_CONTRACT).toContain("a household, a personal habit or hobby, a club or community group");
    expect(PROJECT_EVERYDAY_CONTRACT).toContain("a small local business");
    expect(PROJECT_EVERYDAY_CONTRACT).toContain(
      'rather than defaulting to an enterprise, institutional, or unnamed "organization" as the subject'
    );
  });

  // Everyday-ness constrains SUBJECT only - it must not read as license for
  // easier or less rigorous work, and must not loosen PROJECT_HANDS_ON_CONTRACT.
  it("states plainly that everyday-ness and hands-on-ness are orthogonal, and never relaxes hands-on/authorized-targets", () => {
    expect(PROJECT_EVERYDAY_CONTRACT).toContain("This constrains SUBJECT ONLY");
    expect(PROJECT_EVERYDAY_CONTRACT).toContain("it never means easier, smaller, or less rigorous work");
    expect(PROJECT_EVERYDAY_CONTRACT).toContain(
      "it never relaxes the HANDS-ON, NOT ABOUT THE FIELD or AUTHORIZED TARGETS ONLY rules above by one inch"
    );
    expect(PROJECT_EVERYDAY_CONTRACT).toContain(
      "a household budget tracker and a penetration test are both real artifacts a working practitioner would actually produce"
    );
    expect(PROJECT_EVERYDAY_CONTRACT).toContain("everyday-ness and hands-on-ness are orthogonal");
  });

  // Must not contradict courseKindContract's applied-course text ("Ground
  // every example in the practice of this field: real organizations...") -
  // an everyday context must read as a real practice setting, not an
  // exception to that rule.
  it("frames an everyday context as a real practice setting, not an exception carved out of one", () => {
    expect(PROJECT_EVERYDAY_CONTRACT).toContain("A REAL PRACTICE SETTING, NOT AN EXCEPTION TO ONE");
    expect(PROJECT_EVERYDAY_CONTRACT).toContain(
      "has its own real decisions, documents, processes, and tools, exactly as any other organization does"
    );
  });

  // Must survive a course whose field is inherently serious (e.g. security):
  // reach for that field's own everyday face, never pretend it is a
  // different, softer field.
  it("reaches for the everyday face of a serious field rather than reframing the field itself", () => {
    expect(PROJECT_EVERYDAY_CONTRACT).toContain("do not soften or reframe the field itself");
    expect(PROJECT_EVERYDAY_CONTRACT).toContain(
      "a security course can harden a home network, audit a family's password hygiene, or secure a small shop's point-of-sale system"
    );
  });

  // Modeled on projectChoiceContract's "RIGOR IS NOT NEGOTIABLE" precedent -
  // widening the subject axis must not widen what counts as finished, real
  // work.
  it("carries a RIGOR IS NOT NEGOTIABLE clause modeled on projectChoiceContract's", () => {
    expect(PROJECT_EVERYDAY_CONTRACT).toContain("RIGOR IS NOT NEGOTIABLE");
    expect(PROJECT_EVERYDAY_CONTRACT).toContain(
      "the setting is everyday, the competency demonstrated and the work produced are not"
    );
  });

  it("is a non-empty constant string, not a function", () => {
    expect(typeof PROJECT_EVERYDAY_CONTRACT).toBe("string");
    expect(PROJECT_EVERYDAY_CONTRACT.length).toBeGreaterThan(0);
  });

  // PROJECT_HANDS_ON_CONTRACT must remain untouched by this fix - the AC's
  // whole point is ADD, not edit, so its own pinned wording (including the
  // security example other tests in this file pin) must be unaffected.
  it("does not overlap with or replace PROJECT_HANDS_ON_CONTRACT's own text", () => {
    expect(PROJECT_EVERYDAY_CONTRACT).not.toBe(PROJECT_HANDS_ON_CONTRACT);
    expect(PROJECT_HANDS_ON_CONTRACT).toContain("a security course finds and reports real vulnerabilities");
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
