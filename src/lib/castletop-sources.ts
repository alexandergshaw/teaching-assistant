import type { CastletopItem } from "./castletop-plan";

export interface AssignmentBrief {
  name: string;
  pointsPossible?: number | null;
  dueAt?: string | null;
}

export interface CastletopSourceInput {
  schedule: Array<{
    week: number;
    topic: string;
    assignmentTitle?: string | null;
    testName?: string | null;
  }>;
  assignments?: AssignmentBrief[];
  startDate?: string | null;
  weeks: number;
  defaultAssignmentMinutes?: number;
  defaultTestMinutes?: number;
}

export interface CastletopSourceResult {
  topicsByWeek: Map<number, string>;
  itemsByWeek: Map<number, CastletopItem[]>;
  notes: string[];
}

const MODULE_NUMBER_PATTERN = /(?:module|week|unit)\s*0*(\d+)/i;

function toUtcMidnight(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms : null;
}

function daysBetween(startIso: string, dueIso: string): number | null {
  const a = toUtcMidnight(startIso);
  const b = toUtcMidnight(dueIso);
  if (a === null || b === null) return null;
  return Math.floor((b - a) / 86_400_000);
}

export function buildCastletopSources(input: CastletopSourceInput): CastletopSourceResult {
  const topicsByWeek = new Map<number, string>();
  const itemsByWeek = new Map<number, CastletopItem[]>();
  const notes: string[] = [];

  const defaultAssignmentMinutes = input.defaultAssignmentMinutes ?? 60;
  const defaultTestMinutes = input.defaultTestMinutes ?? 30;

  for (const schedRow of input.schedule) {
    const week = schedRow.week;
    if (week < 1 || week > input.weeks) continue;

    const topic = schedRow.topic ?? "";
    if (topic.trim()) {
      topicsByWeek.set(week, topic);
    }

    if (!itemsByWeek.has(week)) {
      itemsByWeek.set(week, []);
    }
    const weekItems = itemsByWeek.get(week)!;

    if (schedRow.assignmentTitle) {
      const title = schedRow.assignmentTitle.trim();
      if (title) {
        weekItems.push({
          assignment: title,
          minutes: defaultAssignmentMinutes,
        });
      }
    }

    if (schedRow.testName) {
      const testName = schedRow.testName.trim();
      if (testName) {
        weekItems.push({
          assignment: testName,
          minutes: defaultTestMinutes,
        });
      }
    }
  }

  if (!input.assignments || input.assignments.length === 0) {
    return { topicsByWeek, itemsByWeek, notes };
  }

  let nameMatched = 0;
  let dueDateBucketed = 0;
  let unbucketed = 0;

  for (const brief of input.assignments) {
    let assignedWeek: number | null = null;

    const briefName = (brief.name ?? "").trim();
    if (!briefName) {
      unbucketed++;
      continue;
    }

    const nameMatch = briefName.match(MODULE_NUMBER_PATTERN);
    if (nameMatch && nameMatch[1]) {
      const extractedWeek = parseInt(nameMatch[1], 10);
      if (extractedWeek >= 1 && extractedWeek <= input.weeks) {
        assignedWeek = extractedWeek;
        nameMatched++;
      }
    }

    if (assignedWeek === null && input.startDate && brief.dueAt) {
      const days = daysBetween(input.startDate, brief.dueAt);
      if (days !== null) {
        const week = Math.floor(days / 7) + 1;
        assignedWeek = Math.max(1, Math.min(week, input.weeks));
        if (Number.isFinite(assignedWeek)) {
          dueDateBucketed++;
        }
      }
      if (assignedWeek === null) {
        unbucketed++;
        continue;
      }
    }

    if (assignedWeek === null || !Number.isFinite(assignedWeek)) {
      unbucketed++;
      continue;
    }

    if (!itemsByWeek.has(assignedWeek)) {
      itemsByWeek.set(assignedWeek, []);
    }
    const weekItems = itemsByWeek.get(assignedWeek)!;

    const existingIndex = weekItems.findIndex(
      (item) => item.assignment.trim().toLowerCase() === briefName.toLowerCase()
    );

    if (existingIndex >= 0) {
      if (weekItems[existingIndex].points == null && brief.pointsPossible != null) {
        weekItems[existingIndex].points = brief.pointsPossible;
      }
    } else {
      weekItems.push({
        assignment: briefName,
        minutes: defaultAssignmentMinutes,
        points: brief.pointsPossible ?? null,
      });
    }
  }

  if (nameMatched > 0) {
    notes.push(`${nameMatched} assignment(s) matched to weeks by name`);
  }
  if (dueDateBucketed > 0) {
    notes.push(`${dueDateBucketed} assignment(s) bucketed by due date`);
  }
  if (unbucketed > 0) {
    notes.push(`${unbucketed} assignment(s) could not be placed in a week`);
  }

  return { topicsByWeek, itemsByWeek, notes };
}
