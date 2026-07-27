// Pure text assembly for the "generate an assignment from a saved template"
// workflow step (steps.assignments-template.ts): the LLM objectives/context
// strings, plus the finished handout and in-class closer text. No I/O, no
// Date, no randomness - everything here is a deterministic function of its
// inputs, so it is unit-testable without mocking a server action.

import type { AssignmentSpec } from "@/lib/artifact-templates/types";
import { TECHNICAL_APTITUDES, GROUPINGS } from "@/lib/artifact-templates/types";

export interface AssignmentBriefContext {
  courseName: string;
  topic: string; // the week/module topic, may be ""
  weekLabel: string; // e.g. "Week 7" or "", for titles
}

/** The objectives string handed to generateAssignmentAction: the resolved
 * topic (when known) plus the template's own goal. */
export function buildAssignmentObjectives(spec: AssignmentSpec, ctx: AssignmentBriefContext): string {
  const lines: string[] = [];
  if (ctx.topic.trim()) {
    lines.push(`Topic: ${ctx.topic.trim()}`);
  }
  if (spec.goal.trim()) {
    lines.push(spec.goal.trim());
  }
  return lines.join("\n");
}

/**
 * The context string handed to generateAssignmentAction / the rubric
 * generator - carries the spec's constraints as prose.
 *
 * Incorporates the aptitude and grouping `promptContract` strings VERBATIM
 * (looked up in TECHNICAL_APTITUDES / GROUPINGS) rather than re-describing
 * them: that contract string is the single source of truth for what each
 * vocabulary value means to the model, so copying it here keeps the
 * vocabulary and the prompt from drifting apart.
 */
export function buildAssignmentContext(spec: AssignmentSpec, ctx: AssignmentBriefContext): string {
  const lines: string[] = [];

  if (spec.activity.trim()) {
    lines.push(spec.activity.trim());
  }

  const aptitude = TECHNICAL_APTITUDES.find((a) => a.value === spec.aptitude);
  if (aptitude) {
    lines.push(aptitude.promptContract);
  }

  const grouping = GROUPINGS.find((g) => g.value === spec.grouping);
  if (grouping) {
    lines.push(grouping.promptContract);
  }
  if (spec.grouping === "group" && spec.groupSize) {
    lines.push(`Group size: ${spec.groupSize} student(s) per group.`);
  }

  lines.push(`Time budget: about ${spec.minutes} minute(s).`);

  if (spec.deliverables.length > 0) {
    lines.push(`Required deliverables: ${spec.deliverables.join("; ")}.`);
  }

  if (ctx.weekLabel.trim()) {
    lines.push(`This assignment is for ${ctx.weekLabel.trim()}.`);
  }

  return lines.join("\n");
}

/**
 * The finished handout text, assembled from the generated AssignmentData plus
 * the spec's own constraints. Markdown-ish text suitable for
 * buildDocxFromPlainText: a title line, then "## Overview",
 * "## What you will do" (the steps), "## Tools", "## Deliverables", and a
 * "## Logistics" section stating the expected time and solo-vs-group. A step/
 * tool/deliverable list that is empty omits its heading entirely rather than
 * emitting an empty one.
 */
export function renderAssignmentHandout(
  data: {
    title: string;
    overview: string;
    steps: Array<{ stepTitle: string; description: string }>;
    tools: string[];
    deliverables: string[];
  },
  spec: AssignmentSpec,
  ctx: AssignmentBriefContext
): string {
  const lines: string[] = [];

  const titlePrefix = ctx.weekLabel.trim() ? `${ctx.weekLabel.trim()}: ` : "";
  lines.push(`# ${titlePrefix}${data.title}`);
  lines.push("");

  lines.push("## Overview");
  lines.push(data.overview);
  lines.push("");

  if (data.steps.length > 0) {
    lines.push("## What you will do");
    data.steps.forEach((step, i) => {
      lines.push(`${i + 1}. ${step.stepTitle}`);
      lines.push(`   ${step.description}`);
    });
    lines.push("");
  }

  if (data.tools.length > 0) {
    lines.push("## Tools");
    for (const tool of data.tools) {
      lines.push(`- ${tool}`);
    }
    lines.push("");
  }

  if (data.deliverables.length > 0) {
    lines.push("## Deliverables");
    for (const deliverable of data.deliverables) {
      lines.push(`- ${deliverable}`);
    }
    lines.push("");
  }

  lines.push("## Logistics");
  lines.push(`- Expected time: about ${spec.minutes} minute(s)`);
  if (spec.grouping === "group") {
    lines.push(spec.groupSize ? `- Group work (groups of ${spec.groupSize})` : "- Group work");
  } else {
    lines.push("- Individual work");
  }

  return lines.join("\n").trim();
}

/**
 * A deterministic in-class closer: a wrap-up checklist referencing the
 * spec's deliverables. Built with no LLM call (there is no closer generator
 * in the repo - see steps.assignments-template.ts for why), so its text can
 * never accidentally echo the separately generated opener text.
 */
export function renderAssignmentCloser(spec: AssignmentSpec, ctx: AssignmentBriefContext): string {
  const lines: string[] = ["## In-class closer", ""];

  const minutesNote = spec.closerMinutes ? ` (about ${spec.closerMinutes} minute(s))` : "";
  lines.push(`Wrap-up checklist${minutesNote}:`);
  lines.push("");

  if (spec.deliverables.length > 0) {
    for (const deliverable of spec.deliverables) {
      lines.push(`- [ ] Check progress on: ${deliverable}`);
    }
  } else {
    lines.push("- [ ] Check each student's progress toward the assignment.");
  }
  lines.push("- [ ] Answer outstanding questions before the class ends.");
  lines.push(
    ctx.weekLabel.trim()
      ? `- [ ] Preview what is coming next after ${ctx.weekLabel.trim()}.`
      : "- [ ] Preview what is coming next."
  );

  return lines.join("\n");
}
