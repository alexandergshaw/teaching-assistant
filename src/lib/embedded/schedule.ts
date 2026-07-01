/**
 * Deterministic weekly course-schedule builder. Dates are computed from the start
 * date, tests are spaced evenly (each preceded by a review week), and topics are
 * drawn in order from the course description. No model call; the same inputs
 * always produce the same schedule.
 */

import { keyPhrases, titleCase, toBullets } from "./scaffold";

export interface ScheduleRow {
  week: number;
  dates: string;
  topics: string;
  assignment: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseStart(value: string): Date | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function fmt(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** Topic phrases to sequence across the instructional weeks. */
function topicPool(courseDescription: string): string[] {
  const bullets = toBullets(courseDescription);
  const pool = bullets.length > 1 ? bullets : keyPhrases(courseDescription, 16);
  const cleaned = pool.map((t) => titleCase(t.replace(/[.:;,]+$/, "").trim())).filter(Boolean);
  return cleaned.length > 0 ? cleaned : ["Course topic"];
}

export function scaffoldCourseSchedule(
  courseDescription: string,
  startingDate: string,
  numberOfWeeks: number,
  numberOfTests: number
): ScheduleRow[] {
  const weeks = Math.max(1, Math.floor(numberOfWeeks) || 1);
  const tests = Math.max(0, Math.min(Math.floor(numberOfTests) || 0, weeks));
  const start = parseStart(startingDate);

  // Place tests evenly (the last on the final week), each preceded by a review.
  const testWeekOf = new Map<number, number>();
  const reviewWeeks = new Set<number>();
  for (let t = 1; t <= tests; t += 1) {
    const pos = Math.min(weeks, Math.max(1, Math.round((t * weeks) / tests)));
    testWeekOf.set(pos, t);
  }
  for (const pos of testWeekOf.keys()) {
    const prev = pos - 1;
    if (prev >= 1 && !testWeekOf.has(prev)) reviewWeeks.add(prev);
  }

  const topics = topicPool(courseDescription);
  let topicIndex = 0;
  const rows: ScheduleRow[] = [];

  for (let week = 1; week <= weeks; week += 1) {
    const dates = start ? `${fmt(addDays(start, (week - 1) * 7))} - ${fmt(addDays(start, (week - 1) * 7 + 4))}` : "";

    if (testWeekOf.has(week)) {
      const label = tests > 1 ? `Test ${testWeekOf.get(week)}` : "Test";
      rows.push({ week, dates, topics: label, assignment: "Test" });
    } else if (reviewWeeks.has(week)) {
      rows.push({ week, dates, topics: "Review", assignment: "Review" });
    } else {
      const topic = topics[topicIndex % topics.length];
      topicIndex += 1;
      rows.push({ week, dates, topics: topic, assignment: "Weekly assignment" });
    }
  }

  return rows;
}
