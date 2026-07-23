// Client-side step catalog: planning steps that generate or derive calendars, schedules, and outlines.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  generateCourseScheduleAction,
} from "@/app/actions";
import {
  type StepDefinition,
} from "@/lib/workflows/registry-helpers";
import { parseCalendarEmbedded } from "@/lib/embedded/calendar";
import { scaffoldCourseSchedule } from "@/lib/embedded/schedule";
import { scaffoldCourseOutline } from "@/lib/embedded/course";

export const planningGeneratorSteps: StepDefinition[] = [
  {
    type: "parse-academic-calendar",
    name: "Parse an academic calendar",
    description: "Extract typed, categorized calendar events (lectures, exams, deadlines, holidays) from pasted syllabus or calendar text.",
    inputs: [
      {
        key: "text",
        label: "Calendar or syllabus text",
        type: "longtext",
        required: true,
      },
    ],
    outputs: [
      { key: "events", label: "Parsed events", type: "longtext" },
      { key: "school", label: "School", type: "text" },
      { key: "term", label: "Term", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const text = String(values.text ?? "").trim();
      if (!text) {
        throw new Error("Paste the calendar or syllabus text to parse.");
      }

      onProgress("Parsing calendar...");
      const result = parseCalendarEmbedded(text);

      const items = result.events.map((evt) => {
        let line = `${evt.date}`;
        if (evt.endDate) {
          line += ` - ${evt.endDate}`;
        }
        line += ` - ${evt.type}: ${evt.title}`;
        return line;
      });

      const eventCount = result.events.length;
      const school = result.school ?? "";
      const term = result.term ?? "";
      const events = items.join("\n");

      return {
        outputs: {
          events,
          school,
          term,
        },
        summary: {
          kind: "list",
          label: `${eventCount} event(s) parsed`,
          items: items.length ? items : ["(none found)"],
        },
      };
    },
  },

  {
    type: "generate-dated-schedule",
    name: "Generate a dated course schedule",
    description: "Generate a week-by-week course schedule anchored to real calendar dates from a term and start date.",
    inputs: [
      { key: "description", label: "Course description", type: "longtext", required: true },
      { key: "startDate", label: "Start date", type: "date", required: true },
      { key: "term", label: "Term", type: "text", required: false, help: "e.g. Fall 2026." },
      { key: "weeks", label: "Number of weeks", type: "number", required: false },
      { key: "tests", label: "Number of tests", type: "number", required: false },
    ],
    outputs: [
      { key: "courseTitle", label: "Course title", type: "text" },
      { key: "scheduleText", label: "Schedule", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const description = String(values.description ?? "").trim();
      if (!description) {
        throw new Error("Provide a course description.");
      }

      const startDate = String(values.startDate ?? "").trim();
      if (!startDate) {
        throw new Error("Provide a start date.");
      }

      const term = String(values.term ?? "").trim();
      const weeksRaw = String(values.weeks ?? "").trim();
      const weeks = weeksRaw ? Number(weeksRaw) : null;
      const testsRaw = String(values.tests ?? "").trim();
      const tests = testsRaw ? Number(testsRaw) : null;

      onProgress("Generating dated schedule...");
      const r = await generateCourseScheduleAction(description, term, startDate, weeks, tests, helpers.provider);
      if ("error" in r) throw new Error(r.error);

      const courseTitle = "";
      const rows = r.rows ?? [];
      const items: string[] = [];
      const lines: string[] = [];

      for (const row of rows) {
        const weekLabel = row.dates ? `Week ${row.week} (${row.dates})` : `Week ${row.week}`;
        const topicStr = row.topics || "(no topics)";
        const line = `${weekLabel} - ${topicStr}`;
        lines.push(line);
        items.push(topicStr || `Week ${row.week}`);
      }

      const scheduleText = lines.join("\n");

      return {
        outputs: { courseTitle, scheduleText },
        summary: { kind: "list", label: `${rows.length}-week schedule`, items },
      };
    },
  },

  {
    type: "generate-schedule-offline",
    name: "Generate a schedule (offline, no AI)",
    description: "Deterministically build a week-by-week schedule (dates, topics, spaced tests) with no model call -- an offline fallback that always runs unattended.",
    inputs: [
      { key: "description", label: "Course description", type: "longtext", required: true },
      { key: "startDate", label: "Start date", type: "date", required: true },
      { key: "weeks", label: "Number of weeks", type: "number", required: true },
      { key: "tests", label: "Number of tests", type: "number", required: false },
    ],
    outputs: [
      { key: "scheduleText", label: "Schedule", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const description = String(values.description ?? "").trim();
      if (!description) {
        throw new Error("Provide a course description.");
      }

      const startDate = String(values.startDate ?? "").trim();
      if (!startDate) {
        throw new Error("Provide a start date.");
      }

      const weeks = Number(values.weeks);
      if (!Number.isInteger(weeks) || weeks < 1) {
        throw new Error("Provide a valid number of weeks (1 or more).");
      }

      const testsRaw = String(values.tests ?? "").trim();
      const tests = testsRaw && Number.isInteger(Number(testsRaw)) ? Number(testsRaw) : 0;

      onProgress("Building schedule...");
      const rows = scaffoldCourseSchedule(description, startDate, weeks, tests);

      const items: string[] = [];
      const lines: string[] = [];

      for (const row of rows) {
        const weekLabel = row.dates ? `Week ${row.week} (${row.dates})` : `Week ${row.week}`;
        const topicStr = row.topics || "(no topic)";
        const assignStr = row.assignment || "(no assignment)";
        const line = `${weekLabel} - ${topicStr} [${assignStr}]`;
        lines.push(line);
        items.push(topicStr);
      }

      const scheduleText = lines.join("\n");

      return {
        outputs: { scheduleText },
        summary: { kind: "list", label: `${rows.length}-week schedule`, items },
      };
    },
  },

  {
    type: "outline-course-from-repo",
    name: "Outline a course from a repo digest",
    description: "Build a week-by-week markdown course outline from a repository digest or file listing (detects technologies, adds a capstone).",
    inputs: [
      {
        key: "digest",
        label: "Repo digest or file listing",
        type: "longtext",
        required: true,
        help: "A repo digest or newline-separated file paths, e.g. from Build a repo digest.",
      },
    ],
    outputs: [
      { key: "outline", label: "Course outline", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const digest = String(values.digest ?? "").trim();
      if (!digest) {
        throw new Error("Provide a repo digest or file listing.");
      }

      onProgress("Building course outline...");

      const lines = digest.split("\n").map((s) => s.trim()).filter(Boolean);
      const fullName = lines[0] || "Repository";
      const paths = lines.slice(1);

      const outline = scaffoldCourseOutline(fullName, paths);

      return {
        outputs: { outline },
        summary: { kind: "text", text: outline },
      };
    },
  },
];
