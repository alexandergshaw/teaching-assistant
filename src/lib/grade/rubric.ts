import { callLlm, type LlmProvider } from "../llm";
import { findRubricForTopic } from "../research/rubric-bank";
import { generateEmbeddedRubricText } from "../embedded-grader/rubric";
import { normalizeAreaName, buildSystemPrompt, buildChecklistPrompt, buildFileNameConventionPrompt, buildSampleAnswerPrompt, parseChecklistResponse, defaultFullCreditChecklist, normalizeStudentDisplay, normalizeCitationFileName } from "./prompts";
import { normalizeGeminiError } from "./parsing";
import type { RubricCriterion, InferredFileNameLookup, InferredFileNameParts } from "./types";

export function extractRubricCriteria(rubric: string): RubricCriterion[] {
  const out: RubricCriterion[] = [];
  const seen = new Set<string>();
  for (const raw of rubric.split(/\r?\n/)) {
    if (/^\s/.test(raw)) continue; // indented = rating/subcategory line, not a criterion
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^(.+?)\s*\(\s*(\d+(?:\.\d+)?)\s*(pts?|points?|%)?\s*\)\s*:/i);
    if (!match) continue;
    const name = match[1].trim();
    if (!name) continue;
    const key = normalizeAreaName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const unit = (match[3] ?? "").toLowerCase();
    const value = Number(match[2]);
    out.push({ name, points: unit.startsWith("p") && Number.isFinite(value) ? value : null });
  }
  return out;
}

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

function parseInferredFileNameLookup(
  raw: string,
  requestedRawFileNames: string[]
): InferredFileNameLookup {
  const empty: InferredFileNameLookup = {
    byRaw: new Map<string, InferredFileNameParts>(),
    byBase: new Map<string, InferredFileNameParts>(),
  };

  const jsonText = extractJsonObject(raw);
  if (!jsonText) {
    return empty;
  }

  try {
    const parsed = JSON.parse(jsonText) as {
      items?: Array<{
        rawFileName?: unknown;
        studentName?: unknown;
        assignmentFileName?: unknown;
      }>;
    };

    if (!Array.isArray(parsed.items)) {
      return empty;
    }

    const requestedSet = new Set(requestedRawFileNames);
    const byRaw = new Map<string, InferredFileNameParts>();
    const byBaseCandidates = new Map<string, InferredFileNameParts[]>();

    for (const item of parsed.items) {
      const rawFileName = typeof item.rawFileName === "string" ? item.rawFileName : "";
      const studentDisplay = normalizeStudentDisplay(
        typeof item.studentName === "string" ? item.studentName : ""
      );
      const citationFileName = normalizeCitationFileName(
        typeof item.assignmentFileName === "string" ? item.assignmentFileName : ""
      );

      if (!rawFileName || !requestedSet.has(rawFileName)) {
        continue;
      }

      if (!studentDisplay || !citationFileName) {
        continue;
      }

      const inferred = { studentDisplay, citationFileName };
      byRaw.set(rawFileName, inferred);

      const baseName = getBaseFileName(rawFileName);
      const candidates = byBaseCandidates.get(baseName) ?? [];
      candidates.push(inferred);
      byBaseCandidates.set(baseName, candidates);
    }

    const byBase = new Map<string, InferredFileNameParts>();
    for (const [baseName, candidates] of byBaseCandidates.entries()) {
      if (candidates.length !== 1) {
        continue;
      }

      byBase.set(baseName, candidates[0]);
    }

    return { byRaw, byBase };
  } catch {
    return empty;
  }
}

function getBaseFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? path;
}

export async function inferFileNameConvention(
  rawFileNames: string[],
  provider: LlmProvider
): Promise<InferredFileNameLookup> {
  const fallback: InferredFileNameLookup = {
    byRaw: new Map<string, InferredFileNameParts>(),
    byBase: new Map<string, InferredFileNameParts>(),
  };

  if (rawFileNames.length === 0) {
    return fallback;
  }

  try {
    const result = await callLlm(
      {
        contents: [
          { role: "user", parts: [{ text: buildFileNameConventionPrompt(rawFileNames) }] },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 1200 },
      },
      provider
    );

    if (!result.ok) {
      return fallback;
    }

    return parseInferredFileNameLookup(result.text.trim(), rawFileNames);
  } catch {
    return fallback;
  }
}

export async function generateRubric(
  assignmentInstructions: string,
  provider: LlmProvider = "gemini"
): Promise<string> {
  // Embedded Deterministic Engine: prefer a rubric the instructor has already
  // authored for this topic (the rubric bank grows as real rubrics pass through
  // grading); otherwise derive one from the instructions with rule-based
  // checks. No model call either way.
  if (provider === "embedded") {
    const banked = await findRubricForTopic(assignmentInstructions);
    if (banked) return banked;
    return generateEmbeddedRubricText(assignmentInstructions);
  }

  const prompt = `You are a teaching assistant creating a grading rubric.

ASSIGNMENT INSTRUCTIONS:
${assignmentInstructions}

Create a grading rubric suited to these instructions. Return ONLY valid JSON:
{
  "rubric": "..."
}

The rubric text must:
- Contain between 3 and 5 grading areas tied directly to the assignment requirements.
- Weight ALL areas equally: divide 100% evenly across the number of areas you choose (e.g. 4 areas = 25% each). Every area must have the same percentage as every other.
- Start each area on its own line: "[Area Name] ([Percentage]%): [Brief description of what this area covers]"
- Immediately under each area, include exactly three subcategory lines, each indented with two spaces, using these fixed deduction tiers:
  "  Excellent (100% — no deductions): [Specific criteria for full credit]"
  "  Meets Expectations (75% — 25% deducted): [What is missing or partially done that causes the deduction]"
  "  Needs Improvement (50% — 50% deducted): [Significant deficiencies that reduce the score by half]"
- Be specific and actionable, not generic.
- Use plain prose only, no markdown.
- Do not include text outside the JSON object.
- IMPORTANT: Every criterion must evaluate only the presence or absence of things in the submitted code itself (e.g. specific functions, classes, variables, logic, structure, or required features). Do NOT include criteria that require running tests, checking commits, verifying deployments, or evaluating anything outside the code files themselves.`;

  const result = await callLlm(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
    },
    provider
  );

  if (!result.ok) {
    throw new Error(`Rubric generation failed: HTTP ${result.status} ${result.body}`);
  }

  const raw = result.text;

  const jsonText = extractJsonObject(raw);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as { rubric?: unknown };
      if (typeof parsed.rubric === "string" && parsed.rubric.trim()) {
        return parsed.rubric.trim();
      }
    } catch {
      // fall through to raw text
    }
  }

  if (raw.trim()) {
    return raw.trim();
  }

  throw new Error("Gemini returned an empty rubric.");
}

export async function synthesizeFullCreditChecklist(
  assignmentInstructions: string,
  rubric: string,
  provider: LlmProvider = "gemini"
): Promise<string[]> {
  const fallback = defaultFullCreditChecklist();

  try {
    const result = await callLlm(
      {
        contents: [
          { role: "user", parts: [{ text: buildChecklistPrompt(assignmentInstructions, rubric) }] },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
      },
      provider
    );

    if (!result.ok) {
      console.error(`[LLM synthesizeFullCreditChecklist] HTTP ${result.status}:`, result.body);
      throw new Error(normalizeGeminiError(result.status, result.body));
    }

    const rawChecklist = result.text.trim();

    const parsed = parseChecklistResponse(rawChecklist);
    const normalized = parsed.slice(0, 3);

    for (let i = normalized.length; i < 3; i += 1) {
      normalized.push(fallback[i]);
    }

    return normalized;
  } catch {
    return fallback;
  }
}

export async function generateSampleAnswer(
  assignmentInstructions: string,
  rubric: string,
  provider: LlmProvider = "gemini",
  moduleContext: string = ""
): Promise<string> {
  try {
    const prompt = buildSampleAnswerPrompt(assignmentInstructions, rubric, moduleContext);

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
      },
      provider
    );

    if (!result.ok) {
      return "";
    }

    const jsonText = extractJsonObject(result.text);
    if (jsonText) {
      try {
        const parsed = JSON.parse(jsonText) as { sampleAnswer?: unknown };
        if (typeof parsed.sampleAnswer === "string" && parsed.sampleAnswer.trim()) {
          return parsed.sampleAnswer.trim();
        }
      } catch {
        // fall through to raw text
      }
    }

    return result.text.trim();
  } catch {
    return "";
  }
}

export { buildSystemPrompt, normalizeAreaName, buildSampleAnswerPrompt };
export type { RubricCriterion };
