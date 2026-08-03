"use server";

// Per-module instructor notes (LMS-publishable, defaulted to unpublished so
// students never see them): free software alternatives for the module's
// ACTUAL tools, plus common debugging problems and solutions for those same
// tools and their named alternatives. The tool LIST itself is never decided
// here - the caller (steps.instructor-notes.ts) resolves it from the
// course's committed toolset (courseProject.tools, course-tools-selection.ts)
// and that week's own generated text (toolKeysMentionedIn, resource-links.ts)
// before this function is ever called, so a course whose module never
// mentions a tool never gets alternatives/debugging content invented for one
// it did not use.
//
// Kept in its own file rather than growing llm-content.ts or shared.ts, both
// already close to the repo's 1000-line cap - the same reasoning
// course-guides.ts's own header comment gives for generateCourseFaqAction.

import { callLlm, describeLlmFailure, describeEmptyLlmText, type LlmProvider } from "@/lib/llm";
import { courseKindContract, type CourseKind } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";
import { extractJsonObject } from "./shared";
import { stripModelUrls } from "@/lib/urls";

export interface InstructorNoteAlternative {
  tool: string;
  freeAlternative: string;
  why: string;
}

export interface InstructorNoteDebuggingProblem {
  issue: string;
  solution: string;
}

export interface InstructorNoteDebuggingEntry {
  tool: string;
  problems: InstructorNoteDebuggingProblem[];
}

function sanitizeAlternatives(raw: unknown): InstructorNoteAlternative[] {
  if (!Array.isArray(raw)) return [];
  const results: InstructorNoteAlternative[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const tool = String(record.tool ?? "").trim();
    const freeAlternative = String(record.freeAlternative ?? "").trim();
    const why = String(record.why ?? "").trim();
    if (!tool || !freeAlternative) continue;
    results.push({ tool, freeAlternative, why });
  }
  return results;
}

function sanitizeDebugging(raw: unknown): InstructorNoteDebuggingEntry[] {
  if (!Array.isArray(raw)) return [];
  const results: InstructorNoteDebuggingEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const tool = String(record.tool ?? "").trim();
    if (!tool) continue;
    const rawProblems = Array.isArray(record.problems) ? record.problems : [];
    const problems: InstructorNoteDebuggingProblem[] = [];
    for (const p of rawProblems) {
      if (!p || typeof p !== "object") continue;
      const pRecord = p as Record<string, unknown>;
      const issue = String(pRecord.issue ?? "").trim();
      const solution = String(pRecord.solution ?? "").trim();
      if (!issue || !solution) continue;
      problems.push({ issue, solution });
    }
    if (problems.length === 0) continue;
    results.push({ tool, problems });
  }
  return results;
}

/**
 * Generate instructor-facing notes for one module's ACTUAL tools: a free
 * software alternative for each (when one genuinely exists - the model is
 * told explicitly not to invent one for a tool that has none), and common
 * debugging problems/solutions covering BOTH the primary tools and every
 * alternative named in the first half - so an instructor who switches a
 * class to the free option is never left without troubleshooting for it.
 *
 * `toolNames` is the caller-verified list (never decided by the model) - see
 * this file's own header comment. Returns an error when it is empty; the
 * caller is expected to skip the module entirely in that case rather than
 * call this with nothing to write about.
 */
export async function generateInstructorNotesAction(
  topic: string,
  toolNames: string[],
  provider: LlmProvider = "gemini",
  courseKind: CourseKind = "coding"
): Promise<{ alternatives: InstructorNoteAlternative[]; debugging: InstructorNoteDebuggingEntry[] } | { error: string }> {
  try {
    const tools = toolNames.map((t) => t.trim()).filter(Boolean);
    if (tools.length === 0) {
      return { error: "Provide this module's actual tools to ground the instructor notes in." };
    }

    // Embedded Deterministic Engine: no model call, so no alternative or
    // debugging content can be safely invented - degrades to an honest empty
    // result rather than guessing at real software names with no LLM.
    if (provider === "embedded") {
      return { alternatives: [], debugging: [] };
    }

    const toolsBlock = tools.join("; ");

    const prompt = `You are writing PRIVATE, INSTRUCTOR-ONLY notes for a college course module - never shown to students. This module's activities actually use, or teach with, the following real tool(s): ${toolsBlock}.

${courseKindContract(courseKind)}

${PLAIN_LANGUAGE_CONTRACT}

MODULE TOPIC: ${topic.trim() || "(no topic recorded)"}

Do TWO things:

1. FREE SOFTWARE ALTERNATIVES: for each tool listed above, name ONE real, well-known, widely used free or open-source alternative a student or instructor could use instead - never invent a product that does not exist. If a listed tool is already free (a genuine free tier, free trial, community edition, or is itself free/open-source) and has no meaningfully different free alternative worth naming, say so plainly instead of forcing an unnecessary substitute.

2. COMMON DEBUGGING PROBLEMS AND SOLUTIONS: for EVERY tool named anywhere above - both the original tools AND every free alternative you just named in step 1 - list 2-3 of the most common problems a student or instructor actually runs into with that specific tool, each with a concrete, actionable solution. Cover the alternatives with the same care as the primary tools; an instructor who switches a class to the free option must not be left without troubleshooting help for it.

Return ONLY valid JSON:
{
  "alternatives": [
    { "tool": "...", "freeAlternative": "...", "why": "one sentence on how it compares" }
  ],
  "debugging": [
    { "tool": "...", "problems": [ { "issue": "...", "solution": "..." } ] }
  ]
}

Requirements:
- Every tool named in step 1 above must also have exactly one corresponding "debugging" entry.
- Never invent a tool, product, or company that does not actually exist.
- You MUST NEVER write a URL, link, or web address anywhere - a URL you write yourself is never trusted and will be removed.
- Do not include any text outside the JSON object.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
      },
      provider
    );

    if (!result.ok) {
      return { error: describeLlmFailure(result, "Instructor notes generation failed") };
    }
    if (!result.text.trim()) {
      return { error: describeEmptyLlmText(result, "Instructor notes generation failed") };
    }

    const parsed = extractJsonObject(result.text);
    if (!parsed) {
      return { error: "Could not parse the instructor notes from the model response." };
    }

    const alternatives = sanitizeAlternatives(parsed.alternatives).map((a) => ({
      tool: stripModelUrls(a.tool).trim(),
      freeAlternative: stripModelUrls(a.freeAlternative).trim(),
      why: stripModelUrls(a.why).trim(),
    }));
    const debugging = sanitizeDebugging(parsed.debugging).map((d) => ({
      tool: stripModelUrls(d.tool).trim(),
      problems: d.problems.map((p) => ({
        issue: stripModelUrls(p.issue).trim(),
        solution: stripModelUrls(p.solution).trim(),
      })),
    }));

    if (alternatives.length === 0 && debugging.length === 0) {
      return { error: "The model returned no usable alternatives or debugging content." };
    }

    return { alternatives, debugging };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}
