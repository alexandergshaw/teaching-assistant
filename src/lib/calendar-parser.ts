import { OfficeParser } from "officeparser";
import {
  getGeminiApiKey,
  getGeminiMaxOutputTokens,
  getGeminiModel,
} from "./gemini";
import {
  CALENDAR_EVENT_TYPES,
  isCalendarEventType,
  type CalendarEventType,
  type ParsedCalendarEvent,
  type ParsedCalendarResult,
} from "./calendar-events";

// Hard cap on the amount of extracted text we send to the model. PDFs of
// syllabi / academic calendars are typically well under this, but a defensive
// cap keeps cost + latency predictable and avoids accidentally shipping huge
// documents to the LLM.
const MAX_DOCUMENT_CHARS = 40_000;

export interface ParseCalendarOptions {
  // Optional hint for the school name when the caller already knows it
  // (e.g. coming from a logged-in user's profile). The model is still asked
  // to confirm / refine from the document content.
  schoolHint?: string;
  // Optional override for the file name to give the model better grounding.
  fileName?: string;
}

/**
 * Extract plain text from an arbitrary PDF buffer. Returns an empty string
 * (rather than throwing) when extraction yields no usable text, so that
 * callers can surface a friendly error.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const ast = await OfficeParser.parseOffice(buffer, { fileType: "pdf" });
  const conversion = await ast.to("text");
  const value = typeof conversion.value === "string" ? conversion.value : "";
  return value.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
}

interface RawModelEvent {
  title?: unknown;
  date?: unknown;
  end_date?: unknown;
  endDate?: unknown;
  type?: unknown;
  description?: unknown;
}

interface RawModelResponse {
  school?: unknown;
  course_name?: unknown;
  courseName?: unknown;
  term?: unknown;
  events?: unknown;
}

function buildPrompt(text: string, opts: ParseCalendarOptions): string {
  const typeList = CALENDAR_EVENT_TYPES.join(", ");
  const truncated = text.length > MAX_DOCUMENT_CHARS;
  const body = truncated ? text.slice(0, MAX_DOCUMENT_CHARS) : text;

  const hintLines: string[] = [];
  if (opts.fileName) hintLines.push(`File name: ${opts.fileName}`);
  if (opts.schoolHint) hintLines.push(`Known school hint: ${opts.schoolHint}`);

  return [
    "You are extracting structured calendar data from an academic calendar or course syllabus.",
    "",
    "Return ONLY a single JSON object (no markdown fences, no commentary) with the shape:",
    "{",
    '  "school": string | null,        // The school / university / institution the document is from, e.g. "Stanford University". Use null if not clearly identifiable.',
    '  "course_name": string | null,   // The specific course this syllabus is for, if any (e.g. "CS 106A: Programming Methodology"). null for general academic calendars.',
    '  "term": string | null,          // The term / semester / quarter (e.g. "Fall 2025"). null if not stated.',
    '  "events": [                     // Every notable dated item in the document.',
    "    {",
    '      "title": string,            // Short human-readable title (e.g. "Midterm Exam", "Problem Set 3 Due", "Thanksgiving Break").',
    '      "date": string,             // ISO date YYYY-MM-DD. For ranges, the start date.',
    '      "end_date": string | null,  // ISO date YYYY-MM-DD for the LAST day of a range (inclusive). null for single-day events.',
    `      "type": one of [${typeList}],`,
    '      "description": string | null // Optional additional context (location, weight, notes).',
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- Output MUST be valid JSON. Do not wrap in markdown.",
    "- Use exactly the type values listed above. Map: homework/problem sets/papers/projects -> 'assignment'; midterms/final exams -> 'exam'; quizzes -> 'quiz'; recitations/review sessions/office hours specifically called out as review -> 'review_session'; first day of classes -> 'term_start'; last day of classes -> 'term_end'; finals/finals week/exam week -> 'finals_week'; spring/winter/fall break / reading week -> 'break'; federal/observed holidays -> 'holiday'; specific lecture topics with dates -> 'lecture'; anything else -> 'other'.",
    "- Resolve relative dates ('Week 3 Monday', 'next Tuesday') against any term dates stated in the document. If a year is not stated anywhere in the document, infer the most likely academic year from context; otherwise omit the event.",
    "- Skip items without a resolvable date.",
    "- Deduplicate identical events.",
    "- Prefer the school's full official name when extracting `school`.",
    "",
    hintLines.length > 0 ? `Hints from the caller:\n${hintLines.join("\n")}\n` : "",
    truncated
      ? "NOTE: The document was truncated to fit. Extract what you can from the provided portion."
      : "",
    "Document content:",
    "<<<DOCUMENT>>>",
    body,
    "<<<END DOCUMENT>>>",
  ]
    .filter(Boolean)
    .join("\n");
}

function coerceString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function coerceIsoDate(value: unknown): string | undefined {
  const str = coerceString(value);
  if (!str || !ISO_DATE_RE.test(str)) return undefined;
  // Validate it's an actual calendar date.
  const d = new Date(`${str}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return str;
}

function coerceEventType(value: unknown): CalendarEventType {
  if (isCalendarEventType(value)) return value;
  return "other";
}

function extractJsonObject(text: string): string | null {
  // Prefer content inside a markdown fence block when present.
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? text.trim();
  // Always find the outermost {...} boundaries so any surrounding text is excluded.
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

function parseModelResponse(raw: string): ParsedCalendarResult {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) {
    throw new Error("Model response was not valid JSON.");
  }

  let parsed: RawModelResponse;
  try {
    parsed = JSON.parse(jsonText) as RawModelResponse;
  } catch {
    throw new Error("Model response was not valid JSON.");
  }

  const rawEvents = Array.isArray(parsed.events) ? parsed.events : [];
  const events: ParsedCalendarEvent[] = [];
  const seen = new Set<string>();

  for (const item of rawEvents as RawModelEvent[]) {
    if (!item || typeof item !== "object") continue;
    const title = coerceString(item.title);
    const date = coerceIsoDate(item.date);
    if (!title || !date) continue;
    const endDate = coerceIsoDate(item.end_date ?? item.endDate);
    const type = coerceEventType(item.type);
    const description = coerceString(item.description);

    const key = `${type}|${date}|${endDate ?? ""}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    events.push({
      title,
      date,
      ...(endDate ? { endDate } : {}),
      type,
      ...(description ? { description } : {}),
    });
  }

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    school: coerceString(parsed.school),
    courseName: coerceString(parsed.course_name ?? parsed.courseName),
    term: coerceString(parsed.term),
    events,
  };
}

/**
 * Call Gemini to convert raw syllabus / calendar text into a structured set
 * of events. Throws on transport / API errors; returns an empty events array
 * (with whatever metadata could be parsed) if the model returns no events.
 */
export async function parseCalendarFromText(
  text: string,
  options: ParseCalendarOptions = {}
): Promise<ParsedCalendarResult> {
  if (!text.trim()) {
    return { events: [] };
  }

  const apiKey = getGeminiApiKey();
  const model = getGeminiModel();
  const maxOutputTokens = Math.max(getGeminiMaxOutputTokens(), 2048);

  const prompt = buildPrompt(text, options);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Gemini API error: HTTP ${response.status} — ${body.slice(0, 300)}`
    );
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const raw =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
    "";

  if (!raw.trim()) {
    return { events: [] };
  }

  return parseModelResponse(raw);
}

/**
 * Convenience wrapper that takes the raw PDF buffer and returns the parsed
 * calendar result in one step.
 */
export async function parseCalendarPdf(
  buffer: Buffer,
  options: ParseCalendarOptions = {}
): Promise<ParsedCalendarResult> {
  const text = await extractPdfText(buffer);
  if (!text) {
    throw new Error(
      "Could not extract any text from the PDF. The file may be scanned images without OCR."
    );
  }
  return parseCalendarFromText(text, options);
}
