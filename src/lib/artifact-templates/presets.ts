// Built-in reusable artifact templates (presets). Pure, unit-testable; no I/O.
//
// Every preset's spec is deliberately realistic and complete rather than a
// placeholder: presets are the templates a workflow can target before the user
// has authored any of their own.

import type {
  ArtifactTemplate,
  ArtifactTemplateKind,
  AssignmentSpec,
  TestSpec,
  ClassSessionSpec,
} from "./types";

function assignmentPreset(
  id: string,
  name: string,
  description: string,
  spec: AssignmentSpec
): ArtifactTemplate {
  return {
    id,
    kind: "assignment",
    name,
    description,
    spec,
  };
}

function testPreset(
  id: string,
  name: string,
  description: string,
  spec: TestSpec
): ArtifactTemplate {
  return {
    id,
    kind: "test",
    name,
    description,
    spec,
  };
}


function classSessionPreset(
  id: string,
  name: string,
  description: string,
  spec: ClassSessionSpec
): ArtifactTemplate {
  return { id, kind: "class-session", name, description, spec };
}

export const ARTIFACT_TEMPLATE_PRESETS: ArtifactTemplate[] = [
  assignmentPreset(
    "preset-assignment-intro-solo",
    "Intro solo exercise",
    "A short individual exercise that applies one newly introduced concept with heavy scaffolding - ideal for the first few weeks of a course.",
    {
      goal: "Apply a single newly introduced concept correctly in a small, self-contained exercise.",
      activity:
        "Work through a short set of guided exercises that each isolate one aspect of the concept, checking work against the provided expected output before moving to the next.",
      aptitude: "intro",
      minutes: 60,
      deliverables: [
        "A completed exercise file with every TODO filled in",
        "A short written note (2-3 sentences) describing one thing that was confusing and how it was resolved",
      ],
      grouping: "solo",
      groupSize: null,
      includeOpener: false,
      openerMinutes: null,
      includeCloser: false,
      closerMinutes: null,
    }
  ),
  assignmentPreset(
    "preset-assignment-applied-pair",
    "Applied pair project",
    "A hands-on paired project that combines several recent concepts into one small deliverable, bookended by an in-class kickoff and share-out.",
    {
      goal: "Combine several recently taught concepts to build one small, working deliverable with a partner.",
      activity:
        "In pairs, plan a short implementation, split the work, integrate each half, and test the combined result together.",
      aptitude: "intermediate",
      minutes: 180,
      deliverables: [
        "A working implementation committed to the pair's shared repository",
        "A short README explaining what each partner built and how the pieces fit together",
        "A 2-minute in-class demo of the working result",
      ],
      grouping: "group",
      groupSize: 2,
      includeOpener: true,
      openerMinutes: 15,
      includeCloser: true,
      closerMinutes: 10,
    }
  ),
  assignmentPreset(
    "preset-assignment-capstone-team",
    "Capstone team build",
    "A multi-session team capstone that asks a group to design, build, and present a complete project end to end.",
    {
      goal: "Design and build a complete, working project end-to-end as a team, then present and defend the design decisions.",
      activity:
        "As a team, scope a project, divide responsibilities, build and integrate the pieces over multiple sessions, and prepare a final presentation and demo.",
      aptitude: "advanced",
      minutes: 600,
      deliverables: [
        "A complete, working project in the team's shared repository",
        "A design document explaining key architectural decisions and trade-offs",
        "A final presentation with a live demo",
        "Individual reflections on each member's contribution",
      ],
      grouping: "group",
      groupSize: 4,
      includeOpener: false,
      openerMinutes: null,
      includeCloser: true,
      closerMinutes: 20,
    }
  ),
  testPreset(
    "preset-test-weekly-quiz",
    "Low-stakes weekly quiz",
    "A short, low-stakes check for understanding drawn from the current week's material - quick to take and quick to grade.",
    {
      goal: "Confirm students understood this week's core concepts before moving on.",
      coverage: "This week's assigned readings and lecture material.",
      aptitude: "intro",
      format: "online",
      mode: "written",
      minutes: 15,
      sections: [
        { kind: "multiple_choice", count: 5, pointsEach: 2 },
        { kind: "true_false", count: 3, pointsEach: 1 },
      ],
      allowedResources: [],
      includeAnswerKey: true,
      includeStudyGuide: false,
    }
  ),
  testPreset(
    "preset-test-midterm",
    "Midterm exam",
    "A closed-book, in-class midterm covering the first half of the course, mixing objective and short-answer questions with one synthesis essay.",
    {
      goal: "Assess mastery of the first half of the course's core concepts and skills.",
      coverage: "All topics covered from Week 1 through the week before the midterm.",
      aptitude: "intermediate",
      format: "in-class",
      mode: "project-based",
      minutes: 75,
      sections: [
        { kind: "multiple_choice", count: 10, pointsEach: 3 },
        { kind: "short_answer", count: 5, pointsEach: 6 },
        { kind: "essay", count: 1, pointsEach: 20 },
      ],
      allowedResources: ["One handwritten index card (both sides)"],
      includeAnswerKey: true,
      includeStudyGuide: true,
    }
  ),
  testPreset(
    "preset-test-comprehensive-final",
    "Comprehensive final",
    "A take-home comprehensive final covering the entire course, weighted toward applied short-answer and essay questions.",
    {
      goal: "Assess cumulative mastery of every major concept and skill taught across the course.",
      coverage: "Every topic covered across the entire course, weighted toward material since the midterm.",
      aptitude: "advanced",
      format: "take-home",
      mode: "project-based",
      minutes: 180,
      sections: [
        { kind: "multiple_choice", count: 15, pointsEach: 2 },
        { kind: "short_answer", count: 8, pointsEach: 5 },
        { kind: "essay", count: 2, pointsEach: 15 },
      ],
      allowedResources: ["Open book", "Open notes"],
      includeAnswerKey: true,
      includeStudyGuide: true,
    }
  ),
  classSessionPreset(
    "preset-class-session-no-code",
    "No-code weekly session",
    "One week's package for a no-code course: a recent-events case study, a discussion post about it, a tool-based hands-on assignment building toward the semester project, and a short quiz.",
    {
      variant: "no-code",
      includeCaseStudy: true,
      caseStudyWindow: "the past 30 days",
      discussion: {
        prompt:
          "Read this week's case study, then explain which decisions in it you would have made differently and what evidence supports your view.",
        postMinWords: 200,
        requiredReplies: 2,
        points: 10,
      },
      assignment: {
        goal: "Apply this week's concepts using accessible tools, producing one concrete piece of the semester project.",
        aptitude: "intro",
        minutes: 120,
        points: 25,
        buildsTowardProject: true,
        projectDescription:
          "A complete end-to-end analysis and recommendation for one organization, assembled one week at a time across the term.",
      },
      quiz: { questionCount: 8, pointsEach: 2, kinds: ["multiple_choice", "true_false"] },
    }
  ),
  classSessionPreset(
    "preset-class-session-codebase",
    "Codebase weekly session",
    "One week's package for a programming course: a recent-events case study, a discussion post about it, a coding assignment submitted as a GitHub URL and building toward the semester project, and a short quiz.",
    {
      variant: "codebase",
      includeCaseStudy: true,
      caseStudyWindow: "the past 30 days",
      discussion: {
        prompt:
          "Read this week's case study, then explain how the engineering decisions in it relate to what we built this week, and what you would do differently.",
        postMinWords: 200,
        requiredReplies: 2,
        points: 10,
      },
      assignment: {
        goal: "Write and run real code applying this week's concepts, committing one working increment of the semester project.",
        aptitude: "intermediate",
        minutes: 180,
        points: 30,
        buildsTowardProject: true,
        projectDescription:
          "A working application built incrementally across the term, one feature per week, in the student's own GitHub repository.",
      },
      quiz: { questionCount: 8, pointsEach: 2, kinds: ["multiple_choice", "short_answer"] },
    }
  ),
];

export function isPresetArtifactTemplateId(id: string): boolean {
  return id.startsWith("preset-");
}

export function presetsForKind(kind: ArtifactTemplateKind): ArtifactTemplate[] {
  return ARTIFACT_TEMPLATE_PRESETS.filter((t) => t.kind === kind);
}