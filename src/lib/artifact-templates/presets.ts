// Built-in reusable artifact templates (presets). Pure, unit-testable; no I/O.
//
// Assignment presets are the only kind shipped this wave - they are the only
// templates available until the editor lands (a later wave), so their specs
// are deliberately realistic and complete rather than placeholders.

import type { ArtifactTemplate, ArtifactTemplateKind, AssignmentSpec } from "./types";

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
];

export function isPresetArtifactTemplateId(id: string): boolean {
  return id.startsWith("preset-");
}

export function presetsForKind(kind: ArtifactTemplateKind): ArtifactTemplate[] {
  return ARTIFACT_TEMPLATE_PRESETS.filter((t) => t.kind === kind);
}
