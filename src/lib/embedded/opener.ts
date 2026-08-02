/**
 * Deterministic scaffold for the class-opener generator - the "embedded"
 * provider's counterpart to generateClassOpenerAction's LLM path
 * (src/app/actions/research.ts). Mirrors that path's three-section shape
 * (case study discussion, warm-up exercise, debrief) but is assembled from
 * material the caller already holds - the course's assigned case study, the
 * week's concept plan, the generated assignment text, and a curated
 * practice-bank entry - with no model call and nothing invented.
 *
 * Pure: no I/O, no Date, no randomness. Every branch is a function of its
 * arguments, which is what lets the sibling test assert exact output.
 */

import type { CaseStudyAssignment } from "@/lib/case-study-prompt";
import type { CaseStudyMaterial } from "@/lib/research";
import type { PracticeProblemEntry } from "@/lib/research/practice-problems";
import { buildFallbackWarmup, enforceReadOnlyWarmup, findWriteCodeViolation } from "@/lib/opener-warmup";

export interface EmbeddedOpenerInput {
  topic: string;
  /** Section timings, already split from the caller's target duration. */
  caseStudyMinutes: number;
  warmupMinutes: number;
  debriefMinutes: number;
  /** The "## <heading>" the warm-up section uses, shared with the LLM path. */
  warmupHeading: string;
  /** A coding opener gets the read-only warm-up rules; applied never sees code. */
  isCoding: boolean;
  /** This week's ordered concept plan, already trimmed of blanks by the caller. */
  concepts: string[];
  /** The assignment's own heading, or "" when the caller has no assignment. */
  assignment: string;
  assignedCaseStudy?: CaseStudyAssignment;
  caseStudyMaterial: CaseStudyMaterial | null;
  practiceProblems: PracticeProblemEntry[];
}

/**
 * Compose the read-only trace warm-up from a curated practice-bank entry, or
 * return undefined when there is no usable entry OR when the composed block
 * would ask the student to produce code.
 *
 * Z2-AC3: the bank's own titles are authored for a "solve this" context
 * ("Write a function that converts..."), so composing one straight into a
 * READ-ONLY warm-up re-injects the very instruction Z2 exists to remove.
 * Screening here rather than leaving the repair to enforceReadOnlyWarmup
 * matters: that guard replaces the whole warm-up SECTION body, which would
 * also delete the concept-preview and assignment-connection lines this
 * scaffold deliberately places in that section.
 */
function buildTraceWarmup(
  isCoding: boolean,
  practiceProblems: PracticeProblemEntry[]
): string[] | undefined {
  if (!isCoding || practiceProblems.length === 0 || !practiceProblems[0].exampleCode) {
    return undefined;
  }
  const problem = practiceProblems[0];
  const block = [
    problem.title,
    "",
    "Read the code below - do not write or run any code yourself. Work out by hand what it produces.",
    "",
    "```",
    problem.exampleCode,
    "```",
    "",
    "Trace through it line by line and predict: what does this code output, and what does each key variable hold along the way?",
    "",
  ];
  return findWriteCodeViolation(block.join("\n")) ? undefined : block;
}

/**
 * Build the embedded class opener. Returns the document title and text; the
 * text is already run through enforceReadOnlyWarmup for a coding opener, so
 * the caller never has to remember that step.
 */
export function buildEmbeddedOpener(input: EmbeddedOpenerInput): { title: string; text: string } {
  const {
    topic,
    caseStudyMinutes,
    warmupMinutes,
    debriefMinutes,
    warmupHeading,
    isCoding,
    concepts,
    assignment,
    assignedCaseStudy,
    caseStudyMaterial,
    practiceProblems,
  } = input;

  const title = `Class Opener: ${topic}`;
  const sections: string[] = [
    `# ${title}`,
    "",
    `## Case study discussion (about ${caseStudyMinutes} minutes)`,
  ];

  if (assignedCaseStudy) {
    sections.push(`Case Study: ${assignedCaseStudy.organization}`, "");
    if (assignedCaseStudy.period) {
      sections.push(`- Period: ${assignedCaseStudy.period}.`);
    }
    sections.push(`- ${assignedCaseStudy.hook}`, "");
  } else if (caseStudyMaterial) {
    sections.push(caseStudyMaterial.title);
    sections.push("");
    for (const bullet of caseStudyMaterial.bullets) {
      sections.push(`- ${bullet}`);
    }
    sections.push("");
  } else {
    sections.push(
      `Case Study: ${topic}`,
      "",
      `This case study explores a real-world application of ${topic}. Consider how the principles of ${topic} applied in practice, and what lessons apply to your learning.`,
      ""
    );
  }

  sections.push(
    "Discussion Questions:",
    `1. What key principles of ${concepts[0] || topic} were at play in this scenario?`,
    "2. How might this situation have been different with better planning or execution?",
    "3. What would you do differently?",
    ""
  );

  // F1: these two lines are the hand-off from the case discussion to the
  // exercise - they used to live INSIDE the warm-up section, where
  // enforceReadOnlyWarmup's whole-body replacement (heading to next heading)
  // could delete them as collateral damage from a tainted assignment title
  // or concept name that has nothing to do with the exercise itself.
  // Screening every value that lands in the warm-up section can never be
  // complete (buildTraceWarmup screens the practice-bank block, but
  // assignment/concepts are two more inputs the guard can still reach), so
  // instead these are placed in their own section entirely BEFORE the
  // warm-up heading - structurally outside the range the guard scans, not
  // merely screened within it. When neither line applies there is nothing to
  // hand off, so no heading is emitted at all.
  const beforeWarmup: string[] = [];
  if (concepts.length > 0) {
    beforeWarmup.push(`Concepts to preview: ${concepts.join(", ")}.`, "");
  }
  if (assignment) {
    beforeWarmup.push(
      `Assignment connection: Before implementation, map each concept above to one requirement in ${assignment}.`,
      ""
    );
  }
  if (beforeWarmup.length > 0) {
    sections.push("## Before the warm-up", "", ...beforeWarmup);
  }

  sections.push(`## ${warmupHeading} (about ${warmupMinutes} minutes)`, "");

  // Z2-AC1/AC2: this scaffold's coding warm-up used to say "Write a short
  // program or function..." - exactly the "produce code you have not been
  // taught yet" instruction Z2 exists to remove. It now traces a REAL,
  // already-vetted example (never invented) when one is available - reading
  // only - and otherwise maps the concept to a familiar analogy, which by
  // construction can never ask for code.
  //
  // traceWarmup is only ever set for a coding opener, so it alone gates the
  // warm-up branch here and the matching debrief branch below - the two must
  // agree, or the debrief discusses a trace the warm-up never showed.
  const traceWarmup = buildTraceWarmup(isCoding, practiceProblems);

  if (traceWarmup) {
    sections.push(...traceWarmup);
  } else if (isCoding) {
    sections.push(buildFallbackWarmup(concepts[0] || topic), "");
    if (concepts.length > 1) {
      sections.push(
        `Then explain, in one sentence each, how ${concepts.slice(1).join(", ")} changes the reasoning. Answer in prose only - nothing here asks you to produce code.`,
        ""
      );
    }
  } else {
    sections.push(
      `Work through a short, concrete exercise that applies ${topic} to a realistic situation.`,
      "- Start from a realistic scenario",
      "- Decide what a good outcome looks like",
      "- Produce a short written artifact (a list, a table, or a one-page plan)",
      ""
    );
  }

  sections.push(`## Debrief (about ${debriefMinutes} minutes)`, "");

  if (traceWarmup) {
    sections.push(
      "Discuss the trace as a class: what did students predict the code would produce, and why? Walk through it line by line to confirm the actual behavior.",
      "",
      `Key concepts: The exercise reinforces ${topic} by reading and reasoning about real code, before writing any.`,
      ""
    );
  } else {
    sections.push(
      `Key concepts: Focus on how ${concepts.length > 0 ? concepts.join(", ") : topic} connects theory to real practice.`,
      ""
    );
  }

  const joined = sections.join("\n");
  // Backstop only - buildTraceWarmup already screens the one branch that can
  // introduce write-code language. Kept so this scaffold carries the same
  // final guarantee the LLM path does.
  const text = isCoding ? enforceReadOnlyWarmup(joined, warmupHeading, topic).text : joined;
  return { title, text };
}
