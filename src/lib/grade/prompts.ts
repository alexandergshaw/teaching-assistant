import type { RubricCriterion } from "./types";

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return candidate.slice(start, end + 1);
}

/** Normalize a criterion name for matching ("Code Style (5 pts)" -> "code style"). */
export function normalizeAreaName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(\s*[\d.]+\s*(?:pts?|points?|%)?\s*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildSystemPrompt(
  assignmentInstructions: string,
  rubric: string,
  criteria: RubricCriterion[] = []
): string {
  const pinned =
    criteria.length > 0
      ? `

REQUIRED RUBRIC AREAS (use these EXACTLY, one rubricResults item each, in this order):
${criteria.map((c) => `- ${c.name}${c.points != null ? ` (out of ${c.points})` : ""}`).join("\n")}

You MUST return exactly one rubricResults item for each required area listed above, using the area name VERBATIM (identical spelling, capitalization, and punctuation). Do not rename, merge, split, reorder, add, or omit areas.${
          criteria.some((c) => c.points != null)
            ? " Score each area out of the points shown for it, formatted earned/possible."
            : ""
        }`
      : "";
  return `You are a teaching assistant helping to grade student submissions.

ASSIGNMENT INSTRUCTIONS:
${assignmentInstructions}

RUBRIC:
${rubric}${pinned}

Grade each student submission against the rubric and respond ONLY in JSON using this shape:
{
  "overallComment": "what the student did well, and for each deduction the rubric area and specific reason",
  "improvements": "what the student could do better - coaching, next steps, advice for future work",
  "rubricResults": [
    {
      "area": "criterion name",
      "score": "numeric or text score"
    }
  ]
}

Rules:
- Include one rubricResults item for each rubric area, with its area name and score only (no per-criterion comment).
- Always find at least one deduction for a submission, but be generous/lenient in your evaluation.
- For every deduction, in overallComment explicitly name the affected rubric area and give the specific reason from the submission, citing the exact file name(s) as evidence.
- Grade generously by default, but do not automatically award full points when an explicit rubric violation is present.
- If nothing in the submission explicitly violates a rubric area, award full points for that area.
- Do not deduct points for ambiguity, missing assumptions, or speculative issues that are not explicit rubric violations.
- In overallComment, summarize strengths and, for each deduction, the rubric area and specific reason. Do not include improvement suggestions, next steps, advice for future work, or tips on how to push the work further in overallComment - put all of that in the separate "improvements" field instead, so it never scatters back into overallComment.
- In the "improvements" field, give concrete, actionable suggestions for how the student could improve: next steps, advice for future work, or tips on how to push the work further. Write it in the same warm, direct, second-person style as overallComment. If the submission already meets every rubric area at the highest level and you have no honest improvement to suggest, return an empty string for "improvements" rather than inventing filler.
- CRITICAL - these fields are displayed to the student as SEPARATE, side-by-side boxes, not as one paragraph. Each must be independently readable on its own, AND must not repeat material from the other. Concretely:
  - "improvements" must NOT open with a compliment, a summary of what went well, or any restatement of praise already given in overallComment. Start it directly with the guidance itself.
  - Do not repeat the same observation, fact, or phrase in both fields. If you have already said the code is clean in overallComment, do not say it again in improvements, in any wording.
  - Do not write sentences that only make sense after reading the other field. No "as mentioned above", no "besides that", no "otherwise", and no pronoun whose subject was only introduced in the other field.
  - Praising work in overallComment and then advising in improvements is the intended division. Recapping the praise before the advice is the specific thing to avoid.
- Every score must include what it is out of, in the format earned/possible (for example 7/10).
- Cite only the assignment filename portion inferred from submitted raw filenames (exclude student-identifying prefixes and timestamp metadata when present).
- Maintain at least a 2:1 positive-to-negative ratio in overallComment: for every negative point, include at least two distinct positive points. This ratio applies to overallComment ONLY - do not add compliments to "improvements" to satisfy it, which would duplicate praise across the two boxes.
- Write overallComment and improvements in a warm, friendly, and conversational tone that still reads as overwhelmingly professional. In "improvements", warmth means framing the ADVICE encouragingly ("a good next step is...", "you'll find it easier once..."), not complimenting work that overallComment has already praised.
- Mimic how a personable, encouraging professor would write feedback.
- Use natural contractions (for example you're, don't, it's, that's, you've) to keep the tone conversational, while staying professional.
- Don't use long dashes (—) or short dashes (–) in feedback, as they can cause formatting issues in some LMS platforms. Use colons, parentheses, or commas instead.
- Write feedback in a direct, student-facing style with short concrete phrases like "Nice job with the formatting" and "Your logic here reads cleanly," and second-person words like "you", "your", "yours", and "you're" are allowed. Using the student's name is strictly prohibited.
- Never reference automated grading, AI, machine grading, or that this feedback was generated by a tool. Write every comment as a human instructor speaking directly to the student.
- Do not mention resubmission, regrading, or late penalties in overallComment or improvements; that is handled separately.
- Do not include markdown fences or any text outside the JSON object.`;
}

export function buildChecklistPrompt(
  assignmentInstructions: string,
  rubric: string
): string {
  return `You are helping instructors summarize grading expectations.

ASSIGNMENT INSTRUCTIONS:
${assignmentInstructions}

RUBRIC:
${rubric}

Return ONLY valid JSON in this exact format:
{
  "fullCreditChecklist": [
    "bullet 1",
    "bullet 2",
    "bullet 3"
  ]
}

Rules:
- Include exactly 3 concise bullets.
- Each bullet must describe a concrete action students can take to earn full credit.
- Combine assignment and rubric expectations.
- Keep each bullet practical and specific.
- Do not include markdown or text outside the JSON object.`;
}

export function buildFileNameConventionPrompt(rawFileNames: string[]): string {
  return `You are identifying filename naming conventions for student submissions.

Given this exact list of raw submitted filenames:
${rawFileNames.map((name) => `- ${name}`).join("\n")}

Return ONLY valid JSON in this exact shape:
{
  "items": [
    {
      "rawFileName": "exact raw file name from input",
      "studentName": "student-identifying segment",
      "assignmentFileName": "actual assignment file name segment"
    }
  ]
}

Rules:
- Include one item for every input filename.
- Preserve each rawFileName exactly as provided.
- studentName should contain only the student-identifying portion.
- assignmentFileName should contain only the assignment file-name portion.
- If unsure, make the best consistent guess based on the whole list.
- Do not include markdown or text outside JSON.`;
}

export function buildSampleAnswerPrompt(
  assignmentInstructions: string,
  rubric: string,
  moduleContext: string = ""
): string {
  let prompt = `You are a teaching assistant writing a model answer key for an assignment.

ASSIGNMENT INSTRUCTIONS:
${assignmentInstructions}

RUBRIC:
${rubric}`;

  if (moduleContext) {
    prompt += `

MODULE MATERIALS (objectives, pages, and other assignments from this module):
${moduleContext}`;
  }

  prompt += `

Write a single sample correct answer that would earn full credit against the rubric. It is a reference exemplar for the instructor, not feedback to any student.

Return ONLY valid JSON in this exact shape:
{
  "sampleAnswer": "the full sample answer"
}

Rules:
- The sample answer must satisfy every rubric area at the highest level.`;

  if (moduleContext) {
    prompt += `
- Ground the answer in the module materials: use the concepts, terminology, and approaches taught in this module.`;
  }

  prompt += `
- Be concrete and complete but concise: show the actual answer, not a description of one.
- For coding assignments include correct, runnable code; for written assignments write the actual prose response.
- Do not wrap the whole answer in markdown fences.
- Do not include any text outside the JSON object.`;

  return prompt;
}

function normalizeChecklistItem(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/^[\s\-•*\d.)]+/, "").trim();
}

export function parseChecklistResponse(raw: string): string[] {
  const jsonText = extractJsonObject(raw);

  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as {
        fullCreditChecklist?: unknown;
        checklist?: unknown;
        bullets?: unknown;
      };

      const candidate =
        parsed.fullCreditChecklist ?? parsed.checklist ?? parsed.bullets;

      if (Array.isArray(candidate)) {
        const items = candidate
          .map((item) => normalizeChecklistItem(item))
          .filter(Boolean);

        if (items.length > 0) {
          return items;
        }
      }
    } catch {
      // Fall through to line-based parsing.
    }
  }

  const lineItems = raw
    .split(/\r?\n/)
    .map((line) => normalizeChecklistItem(line))
    .filter(Boolean);

  return lineItems;
}

export function defaultFullCreditChecklist(): string[] {
  return [
    "Complete every required deliverable from the assignment instructions.",
    "Meet each rubric criterion at the highest performance level with clear evidence.",
    "Submit organized, correct work that follows the required format and submission rules.",
  ];
}

export function normalizeStudentDisplay(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeCitationFileName(value: string): string {
  return value.trim();
}
