// Pure text assembly for the "generate a class session from a template"
// workflow step (steps.class-session-template.ts): the LLM objectives/context
// strings for each leg of the bundle, plus the finished case-study,
// discussion-prompt, and session-overview text.
//
// No I/O, no Date, no randomness - everything here is a deterministic function
// of its inputs, so it is unit-testable without mocking a server action.
// Mirrors assignment-brief.ts and test-brief.ts.

import type { ClassSessionSpec, ClassSessionOverrides } from "@/lib/artifact-templates/types";
import { renderMilestoneContract, PROJECT_HANDS_ON_CONTRACT, type MilestoneBrief } from "@/lib/course-project";
import {
  TECHNICAL_APTITUDES,
  CLASS_SESSION_VARIANTS,
  TEST_QUESTION_KINDS,
  ACTIVITY_SOURCES,
  SETUP_BURDENS,
  emptyClassSessionOverrides,
} from "@/lib/artifact-templates/types";

export interface ClassSessionContext {
  courseName: string;
  topic: string; // the week/module topic, may be ""
  weekLabel: string; // e.g. "Week 7" or "", for titles
  /** This week's course-project milestone, when the course has one. */
  milestone?: MilestoneBrief | null;
}

/** One case study as returned by the research layer. */
export interface CaseStudyLike {
  title: string;
  bullets: string[];
  url?: string;
}

/** The heading every leg of the bundle is titled under. */
export function sessionTitle(ctx: ClassSessionContext): string {
  const parts = [ctx.weekLabel.trim(), ctx.topic.trim()].filter((p) => p !== "");
  return parts.length > 0 ? parts.join(": ") : "Class session";
}

/**
 * The case-study page text. Sources are kept as an explicit link line rather
 * than folded into the prose: the research layer attaches provenance to
 * live-web material, and dropping it would present a scraped extract as if it
 * were curated fact.
 */
export function renderCaseStudy(material: CaseStudyLike, ctx: ClassSessionContext): string {
  const lines: string[] = [`# Case study: ${material.title}`, ""];

  if (ctx.topic.trim()) {
    lines.push(`Connects to: ${ctx.topic.trim()}`);
    lines.push("");
  }

  for (const bullet of material.bullets) {
    lines.push(`- ${bullet}`);
  }

  if (material.url) {
    lines.push("");
    lines.push(`Source: ${material.url}`);
  }

  return lines.join("\n").trim();
}

/**
 * The discussion board prompt. The participation requirements are stated in
 * the post itself so the expectation travels with the assignment rather than
 * living only in the syllabus.
 */
export function renderDiscussionPrompt(
  spec: ClassSessionSpec,
  ctx: ClassSessionContext,
  caseStudy: CaseStudyLike | null
): string {
  const lines: string[] = [`# Discussion: ${sessionTitle(ctx)}`, ""];

  if (caseStudy) {
    lines.push(`This week's case study is **${caseStudy.title}**.`);
    lines.push("");
  }

  if (spec.discussion.prompt.trim()) {
    lines.push(spec.discussion.prompt.trim());
  } else if (caseStudy) {
    lines.push(
      `Read the case study, then explain how it illustrates the ideas we covered${ctx.topic.trim() ? ` in ${ctx.topic.trim()}` : ""}. Be specific about which details matter and why.`
    );
  } else {
    lines.push(
      `Discuss what we covered${ctx.topic.trim() ? ` in ${ctx.topic.trim()}` : ""} this week, and where you expect it to matter in practice.`
    );
  }

  lines.push("");
  lines.push("## Requirements");
  lines.push(`- Your initial post is at least ${spec.discussion.postMinWords} words.`);
  if (spec.discussion.requiredReplies > 0) {
    lines.push(`- Reply substantively to at least ${spec.discussion.requiredReplies} classmate(s).`);
  }
  lines.push(`- Worth ${spec.discussion.points} point(s).`);

  return lines.join("\n").trim();
}

/** The objectives string handed to the assignment generator. */
export function buildSessionAssignmentObjectives(
  spec: ClassSessionSpec,
  ctx: ClassSessionContext
): string {
  const lines: string[] = [];
  if (ctx.topic.trim()) lines.push(`Topic: ${ctx.topic.trim()}`);
  if (spec.assignment.goal.trim()) lines.push(spec.assignment.goal.trim());
  if (ctx.milestone) lines.push(`Project milestone: ${ctx.milestone.title}`);
  return lines.join("\n");
}

/**
 * The context string handed to the assignment generator.
 *
 * Incorporates the variant and aptitude `promptContract` strings VERBATIM
 * (looked up in CLASS_SESSION_VARIANTS / TECHNICAL_APTITUDES) rather than
 * re-describing them, so the vocabulary and the prompt cannot drift apart.
 * The variant contract is what makes the codebase course's assignment ask for
 * a GitHub URL and the no-code course's not.
 */
export function buildSessionAssignmentContext(
  spec: ClassSessionSpec,
  ctx: ClassSessionContext,
  caseStudy: CaseStudyLike | null,
  overrides: ClassSessionOverrides = emptyClassSessionOverrides()
): string {
  const lines: string[] = [];

  const variant = CLASS_SESSION_VARIANTS.find((v) => v.value === spec.variant);
  if (variant) lines.push(variant.promptContract);

  const aptitude = TECHNICAL_APTITUDES.find((a) => a.value === spec.assignment.aptitude);
  if (aptitude) lines.push(aptitude.promptContract);

  // The run's course-design choices. Both vocabularies use an empty
  // promptContract for their "template" value, so an unset choice adds nothing
  // to the prompt rather than adding a sentence that says nothing.
  const source = ACTIVITY_SOURCES.find((s) => s.value === overrides.activitySource);
  if (source?.promptContract) lines.push(source.promptContract);

  const burden = SETUP_BURDENS.find((b) => b.value === overrides.setupBurden);
  if (burden?.promptContract) lines.push(burden.promptContract);

  lines.push(`Time budget: about ${spec.assignment.minutes} minute(s).`);
  lines.push(`Worth ${spec.assignment.points} point(s).`);

  if (spec.assignment.buildsTowardProject) {
    if (ctx.milestone) {
      // A real milestone is strictly better than the generic sentence: it
      // names the week's increment instead of asking the model to invent one.
      // PROJECT_HANDS_ON_CONTRACT rides along with it (the "hands-on
      // project" fix) - this in-session assignment is yet another SEPARATE
      // generation call carrying the milestone forward (alongside
      // assignment-brief.ts, test-brief.ts, shared.ts), so without pushing
      // the same contract here it could still ask for a write-up ABOUT the
      // milestone's work, or drift toward an unauthorized target.
      lines.push(renderMilestoneContract(ctx.milestone));
      lines.push(PROJECT_HANDS_ON_CONTRACT);
    } else {
      const project = spec.assignment.projectDescription.trim();
      lines.push(
        project
          ? `This week's work must be a concrete increment of the semester-long project: ${project}. Say explicitly which piece of that project the student finishes this week.`
          : "This week's work must be a concrete increment of the course's semester-long project. Say explicitly which piece the student finishes this week."
      );
    }
  }

  if (caseStudy) {
    lines.push(
      `Tie the work to this week's case study, "${caseStudy.title}", so the hands-on task echoes the real situation the class just discussed.`
    );
  }

  if (ctx.weekLabel.trim()) lines.push(`This assignment is for ${ctx.weekLabel.trim()}.`);

  return lines.join("\n");
}

/**
 * The sections passed to the test-question generator for the session's quiz.
 * The quiz spec names one count and one point value across a set of kinds, so
 * the questions are split as evenly as possible across them, with the
 * remainder landing on the earlier kinds.
 */
export function quizSectionsFor(
  spec: ClassSessionSpec
): Array<{ kind: (typeof TEST_QUESTION_KINDS)[number]["value"]; count: number; pointsEach: number }> {
  const kinds = spec.quiz.kinds;
  const total = Math.floor(spec.quiz.questionCount);
  if (kinds.length === 0 || total <= 0) return [];

  const base = Math.floor(total / kinds.length);
  let remainder = total % kinds.length;

  const sections: Array<{
    kind: (typeof TEST_QUESTION_KINDS)[number]["value"];
    count: number;
    pointsEach: number;
  }> = [];
  for (const kind of kinds) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    const count = base + extra;
    if (count > 0) sections.push({ kind, count, pointsEach: spec.quiz.pointsEach });
  }
  return sections;
}

/**
 * A short overview page introducing the week's package, so the LMS module
 * opens with something that explains how its four items fit together instead
 * of a bare list of links.
 */
export function renderSessionOverview(
  spec: ClassSessionSpec,
  ctx: ClassSessionContext,
  caseStudy: CaseStudyLike | null
): string {
  const lines: string[] = [`# ${sessionTitle(ctx)}`, "", "## This week"];

  if (spec.includeCaseStudy) {
    lines.push(
      caseStudy
        ? `- Case study: ${caseStudy.title}`
        : "- Case study: no recent example could be found for this topic"
    );
  }
  lines.push("- Discussion board post responding to the case study");

  const variant = CLASS_SESSION_VARIANTS.find((v) => v.value === spec.variant);
  lines.push(
    `- Hands-on assignment (${spec.assignment.minutes} minute(s), ${spec.assignment.points} point(s))${
      variant?.value === "codebase" ? " - submitted as a GitHub URL" : ""
    }`
  );
  lines.push(`- Quiz (${Math.floor(spec.quiz.questionCount)} question(s))`);

  if (ctx.milestone) {
    lines.push("");
    lines.push("## Course project - this week");
    lines.push(`Milestone ${ctx.milestone.week}: ${ctx.milestone.title}`);
    if (ctx.milestone.deliverable.trim()) {
      lines.push(`Hand in: ${ctx.milestone.deliverable.trim()}`);
    }
  } else if (spec.assignment.buildsTowardProject && spec.assignment.projectDescription.trim()) {
    lines.push("");
    lines.push("## Semester project");
    lines.push(spec.assignment.projectDescription.trim());
  }

  return lines.join("\n").trim();
}
