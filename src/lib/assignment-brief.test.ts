import { describe, it, expect } from "vitest";
import {
  buildAssignmentObjectives,
  buildAssignmentContext,
  renderAssignmentHandout,
  renderAssignmentCloser,
  type AssignmentBriefContext,
} from "./assignment-brief";
import {
  emptyAssignmentSpec,
  TECHNICAL_APTITUDES,
  GROUPINGS,
  type AssignmentSpec,
} from "@/lib/artifact-templates/types";

function baseSpec(overrides: Partial<AssignmentSpec> = {}): AssignmentSpec {
  return {
    ...emptyAssignmentSpec(),
    goal: "Apply loops correctly to solve small problems.",
    activity: "Work through a set of guided exercises.",
    aptitude: "intro",
    minutes: 60,
    deliverables: ["A completed exercise file", "A short reflection note"],
    grouping: "solo",
    groupSize: null,
    ...overrides,
  };
}

function baseCtx(overrides: Partial<AssignmentBriefContext> = {}): AssignmentBriefContext {
  return {
    courseName: "Intro to Programming",
    topic: "Loops",
    weekLabel: "Week 3",
    ...overrides,
  };
}

const assignmentData = {
  title: "Loop Practice",
  overview: "Students practice writing loops to solve small problems.",
  steps: [
    { stepTitle: "Read the prompt", description: "Understand what is being asked." },
    { stepTitle: "Write the loop", description: "Implement the loop in your editor." },
  ],
  tools: ["Python", "VS Code"],
  deliverables: ["A completed exercise file", "A short reflection note"],
};

describe("buildAssignmentObjectives", () => {
  it("includes the topic and the spec's goal", () => {
    const objectives = buildAssignmentObjectives(baseSpec(), baseCtx());
    expect(objectives).toContain("Loops");
    expect(objectives).toContain("Apply loops correctly to solve small problems.");
  });

  it("omits the topic line when the topic is blank", () => {
    const objectives = buildAssignmentObjectives(baseSpec(), baseCtx({ topic: "" }));
    expect(objectives).not.toContain("Topic:");
    expect(objectives).toContain("Apply loops correctly to solve small problems.");
  });

  it("is empty when both the topic and the goal are blank", () => {
    const objectives = buildAssignmentObjectives(baseSpec({ goal: "" }), baseCtx({ topic: "" }));
    expect(objectives).toBe("");
  });
});

describe("buildAssignmentContext", () => {
  it("includes the aptitude promptContract verbatim", () => {
    for (const aptitude of TECHNICAL_APTITUDES) {
      const context = buildAssignmentContext(baseSpec({ aptitude: aptitude.value }), baseCtx());
      expect(context).toContain(aptitude.promptContract);
    }
  });

  it("includes the grouping promptContract verbatim", () => {
    for (const grouping of GROUPINGS) {
      const context = buildAssignmentContext(baseSpec({ grouping: grouping.value }), baseCtx());
      expect(context).toContain(grouping.promptContract);
    }
  });

  it("states the group size only for a group spec", () => {
    const soloContext = buildAssignmentContext(
      baseSpec({ grouping: "solo", groupSize: 4 }),
      baseCtx()
    );
    expect(soloContext).not.toContain("Group size");

    const groupContext = buildAssignmentContext(
      baseSpec({ grouping: "group", groupSize: 4 }),
      baseCtx()
    );
    expect(groupContext).toContain("Group size: 4");
  });

  it("omits the group size line for a group spec with no groupSize set", () => {
    const context = buildAssignmentContext(baseSpec({ grouping: "group", groupSize: null }), baseCtx());
    expect(context).not.toContain("Group size");
  });

  it("states the time budget", () => {
    const context = buildAssignmentContext(baseSpec({ minutes: 45 }), baseCtx());
    expect(context).toContain("45");
  });

  it("states the required deliverables", () => {
    const context = buildAssignmentContext(
      baseSpec({ deliverables: ["Deliverable A", "Deliverable B"] }),
      baseCtx()
    );
    expect(context).toContain("Deliverable A");
    expect(context).toContain("Deliverable B");
  });

  it("includes the spec's activity", () => {
    const context = buildAssignmentContext(
      baseSpec({ activity: "Pair up and split the work." }),
      baseCtx()
    );
    expect(context).toContain("Pair up and split the work.");
  });
});

describe("renderAssignmentHandout", () => {
  it("contains every deliverable and every step", () => {
    const handout = renderAssignmentHandout(assignmentData, baseSpec(), baseCtx());
    for (const deliverable of assignmentData.deliverables) {
      expect(handout).toContain(deliverable);
    }
    for (const step of assignmentData.steps) {
      expect(handout).toContain(step.stepTitle);
      expect(handout).toContain(step.description);
    }
  });

  it("starts with a title line that includes the week label", () => {
    const handout = renderAssignmentHandout(assignmentData, baseSpec(), baseCtx({ weekLabel: "Week 3" }));
    expect(handout.split("\n")[0]).toBe("# Week 3: Loop Practice");
  });

  it("starts with a plain title line when there is no week label", () => {
    const handout = renderAssignmentHandout(assignmentData, baseSpec(), baseCtx({ weekLabel: "" }));
    expect(handout.split("\n")[0]).toBe("# Loop Practice");
  });

  it("always includes the Overview section", () => {
    const handout = renderAssignmentHandout(assignmentData, baseSpec(), baseCtx());
    expect(handout).toContain("## Overview");
    expect(handout).toContain(assignmentData.overview);
  });

  it("omits the What you will do heading when steps is empty", () => {
    const handout = renderAssignmentHandout({ ...assignmentData, steps: [] }, baseSpec(), baseCtx());
    expect(handout).not.toContain("## What you will do");
  });

  it("omits the Tools heading when tools is empty", () => {
    const handout = renderAssignmentHandout({ ...assignmentData, tools: [] }, baseSpec(), baseCtx());
    expect(handout).not.toContain("## Tools");
  });

  it("omits the Deliverables heading when deliverables is empty", () => {
    const handout = renderAssignmentHandout({ ...assignmentData, deliverables: [] }, baseSpec(), baseCtx());
    expect(handout).not.toContain("## Deliverables");
  });

  it("keeps the Tools and Deliverables headings when both are present", () => {
    const handout = renderAssignmentHandout(assignmentData, baseSpec(), baseCtx());
    expect(handout).toContain("## Tools");
    expect(handout).toContain("## Deliverables");
  });

  it("states the expected time and individual work in Logistics for a solo spec", () => {
    const handout = renderAssignmentHandout(
      assignmentData,
      baseSpec({ grouping: "solo", minutes: 90 }),
      baseCtx()
    );
    expect(handout).toContain("## Logistics");
    expect(handout).toContain("90 minute(s)");
    expect(handout).toContain("Individual work");
  });

  it("states group work and the group size in Logistics for a group spec", () => {
    const handout = renderAssignmentHandout(
      assignmentData,
      baseSpec({ grouping: "group", groupSize: 3 }),
      baseCtx()
    );
    expect(handout).toContain("Group work (groups of 3)");
  });
});

describe("renderAssignmentCloser", () => {
  it("includes the In-class closer heading", () => {
    const closer = renderAssignmentCloser(baseSpec(), baseCtx());
    expect(closer).toContain("## In-class closer");
  });

  it("references every deliverable in the wrap-up checklist", () => {
    const closer = renderAssignmentCloser(baseSpec(), baseCtx());
    for (const deliverable of baseSpec().deliverables) {
      expect(closer).toContain(deliverable);
    }
  });

  it("falls back to a generic checklist item when there are no deliverables", () => {
    const closer = renderAssignmentCloser(baseSpec({ deliverables: [] }), baseCtx());
    expect(closer).toContain("Check each student's progress");
  });

  it("is deterministic and pure - the same inputs always produce the same text", () => {
    const spec = baseSpec();
    const ctx = baseCtx();
    expect(renderAssignmentCloser(spec, ctx)).toBe(renderAssignmentCloser(spec, ctx));
  });

  it("never duplicates a sample opener's text, even when both cover the same topic", () => {
    // A representative opener body, shaped like generateClassOpenerAction's
    // actual output (see src/app/actions/research.ts) - case study + warm-up
    // + debrief sections, entirely distinct wording from the closer's
    // wrap-up checklist.
    const openerText = [
      "# Class Opener: Loops",
      "",
      "## Case study discussion (about 15 minutes)",
      "Case Study: Loops",
      "",
      "## Warm-up coding exercise (about 10 minutes)",
      "Write a short program that demonstrates loops.",
      "",
      "## Debrief (about 5 minutes)",
      "Key concepts: Focus on how loops connect theory to real practice.",
    ].join("\n");

    const closer = renderAssignmentCloser(baseSpec(), baseCtx({ topic: "Loops" }));

    expect(closer).not.toBe(openerText);
    expect(openerText).not.toContain("In-class closer");
    expect(openerText).not.toContain("Wrap-up checklist");
    expect(closer).not.toContain("Class Opener");
    expect(closer).not.toContain("Case study discussion");
    expect(closer).not.toContain("Warm-up coding exercise");
  });
});
