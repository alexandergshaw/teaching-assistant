"use server";

import type { CourseScheduleRow, CourseScheduleResult } from "../actions-types";
import { parseLenientJsonArray } from "@/lib/lenient-json";
import { scaffoldCourseSchedule } from "@/lib/embedded/schedule";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { courseEngineSchedule, type ScheduleResponse } from "@/lib/course-engine";
import { jsonObjectSlice } from "./shared";

// ── Course schedule generation (display rows for the syllabus) ─────────────
// Split out of course-planning.ts (which was pushing the 1000-line cap) with
// no behaviour change - every export below keeps its exact name, signature,
// and semantics from before the split.

// Format the Monday–Friday range for week N (1-based) starting from an ISO
// date (YYYY-MM-DD), e.g. "Aug 25 – Aug 29". Used when the Course Engine
// schedule endpoint supplies topics but no calendar dates (Gemini does both).
function weekDateRange(startISO: string, weekNumber: number): string {
  if (!startISO) return "";
  const start = new Date(`${startISO}T00:00:00`);
  if (Number.isNaN(start.getTime())) return "";

  // Snap to the Monday of the start week, then advance to the requested week.
  const day = start.getDay(); // 0 Sun … 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(start);
  monday.setDate(start.getDate() + mondayOffset + (weekNumber - 1) * 7);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(friday)}`;
}

// Adapt the Course Engine schedule response to the CourseScheduleRow shape the
// UI already renders. The endpoint provides per-week topics + citations but no
// dates or per-week assignments, so dates are derived locally and assignment is
// left blank.
function scheduleResponseToRows(
  resp: ScheduleResponse,
  startingDate: string
): CourseScheduleRow[] {
  return (resp.weeks ?? []).map((w) => ({
    week: w.week,
    dates: weekDateRange(startingDate, w.week),
    topics: (w.topics ?? []).join(", "),
    assignment: "",
  }));
}

export async function generateCourseScheduleAction(
  courseDescription: string,
  term: string,
  startingDate: string,
  numberOfWeeks: number | null,
  numberOfTests: number | null,
  provider: LlmProvider = "gemini"
): Promise<CourseScheduleResult | { error: string }> {
  try {
    const topicsOnly = !term.trim() && !startingDate && numberOfWeeks === null && numberOfTests === null;

    if (topicsOnly) {
      if (provider === "other") {
        const resp = await courseEngineSchedule(courseDescription.trim(), 15);
        const rows = scheduleResponseToRows(resp, "");
        const topics = rows.flatMap((r) => r.topics.split(", ")).filter(Boolean);
        return { rows: [], topics };
      }

      if (provider === "embedded") {
        const rows = scaffoldCourseSchedule(courseDescription, "", 15, 0);
        const topics = rows.flatMap((r) => r.topics.split(", ")).filter(Boolean);
        return { rows: [], topics };
      }

      const prompt = `You are an expert curriculum designer. Given this course description, return ONLY a JSON array of strings — the ordered list of topics the course should cover, one concise topic per entry (8–30 topics depending on scope). No numbering in the strings, no markdown.

COURSE DESCRIPTION:
${courseDescription}

Return ONLY valid JSON in this exact format:
["Topic 1", "Topic 2", "Topic 3", ...]`;

      const parts: Array<{ text: string }> = [
        { text: prompt },
      ];

      const llmResult = await callLlm(
        {
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
        },
        provider
      );

      if (!llmResult.ok) {
        return { error: `Topics generation failed: HTTP ${llmResult.status} — ${llmResult.body.slice(0, 200)}` };
      }

      const parsed = parseLenientJsonArray(llmResult.text);
      if (!parsed) {
        return { error: "Could not parse topics from the model response." };
      }

      const topics = parsed
        .filter((t) => typeof t === "string")
        .map((t) => (t as string).trim())
        .filter(Boolean);

      if (topics.length === 0) {
        return { error: "The model produced no usable topics." };
      }

      return { rows: [], topics };
    }

    const weeks = numberOfWeeks ?? 15;
    const tests = numberOfTests ?? 0;
    const useToday = !startingDate;
    const dateForSchedule = useToday ? new Date().toISOString().split("T")[0] : startingDate;

    if (provider === "other") {
      const resp = await courseEngineSchedule(courseDescription.trim(), weeks);
      let rows = scheduleResponseToRows(resp, dateForSchedule);
      if (useToday) {
        rows = rows.map((r) => ({ ...r, dates: "" }));
      }
      return { rows };
    }

    if (provider === "embedded") {
      let rows = scaffoldCourseSchedule(courseDescription, dateForSchedule, weeks, tests);
      if (useToday) {
        rows = rows.map((r) => ({ ...r, dates: "" }));
      }
      return { rows };
    }

    const termLine = term.trim() ? `\nTERM: ${term}` : "";
    const dateInstruction = startingDate
      ? `COURSE START DATE: ${startingDate}`
      : "No start date was provided - use week numbers only and leave the dates field an empty string";

    const prompt = `You are an expert curriculum designer creating a weekly course schedule.

COURSE DESCRIPTION:
${courseDescription}${termLine}
${dateInstruction}
NUMBER OF WEEKS: ${weeks}
NUMBER OF TESTS: ${tests}

Generate a complete ${weeks}-week course schedule. Distribute ${tests} test(s) logically across the schedule (e.g. after major topic blocks).${startingDate ? ` Calculate actual date ranges for each week starting from the provided start date (Monday–Friday format, e.g. "Aug 25 – Aug 29").` : ""} Every week should have instructional content — do not include break weeks or non-instruction weeks.

Return ONLY valid JSON in this exact format:
{
  "rows": [
    { "week": 1, "dates": "...", "topics": "...", "assignment": "..." },
    ...
  ]
}

Requirements:
- Include exactly ${weeks} rows (one per week).
- "week" is the week number (1-based integer).
- "dates" is the date range for that week (e.g. "Aug 25 – Aug 29")${startingDate ? "." : " or empty string if no start date was provided."}"
- "topics" describes the main subject(s) covered that week; for test weeks include "Test${tests > 1 ? " N" : ""}" alongside the topic.
- "assignment" is a brief description of the homework or activity due that week; write "Test" for test weeks.
- Space the ${tests} test(s) evenly across the schedule, placing them at the end of major topic blocks.
- Each test week must be immediately preceded by a review week (e.g. "Review" or "Review: [topic]").
- No new topics are introduced in review weeks or test weeks; these weeks consolidate previously covered material.
- Do not include any text outside the JSON object.`;

    const parts: Array<{ text: string }> = [
      { text: prompt },
    ];

    const result = await callLlm(
      {
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Schedule generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;

    const jsonText = jsonObjectSlice(raw);
    if (!jsonText) {
      return { error: "Could not parse the schedule from the model response." };
    }

    const parsed = JSON.parse(jsonText) as {
      rows?: Array<{ week?: unknown; dates?: unknown; topics?: unknown; assignment?: unknown }>;
    };

    if (!parsed.rows || !Array.isArray(parsed.rows)) {
      return { error: "Model did not return a valid schedule." };
    }

    const rows: CourseScheduleRow[] = parsed.rows
      .filter((r) => typeof r.week === "number" || typeof r.week === "string")
      .map((r) => ({
        week: typeof r.week === "number" ? r.week : parseInt(String(r.week), 10),
        dates: typeof r.dates === "string" ? r.dates : "",
        topics: typeof r.topics === "string" ? r.topics : "",
        assignment: typeof r.assignment === "string" ? r.assignment : "",
      }));

    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}
