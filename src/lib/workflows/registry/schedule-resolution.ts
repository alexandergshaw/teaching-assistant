// Pure helper: resolves a usable, topic-bearing schedule for the repoless
// lecture-zip step (steps.content-lectures.ts). Schedule-type workflow
// inputs are ordinarily bound to a prior step's "schedule" output and arrive
// as an already-parsed array (see presets/course-setup.ts and
// server-runner.ts's "step" binding path, which passes the producing step's
// output through unchanged) - but a literal/runtime binding stores its value
// as a string, so a JSON-encoded schedule is tolerated too. Never assumes
// which shape is provided; both are handled, and neither is required.
import { type ScheduleWeekPlan } from "@/app/actions";
import { csvToSchedule } from "@/lib/workflows/types";
import { parseCsvRows } from "@/lib/csv";
import { isNonContentWeekText } from "@/lib/workflows/source-alignment";

function withTopicOnly(weeks: ScheduleWeekPlan[]): ScheduleWeekPlan[] {
  return weeks.filter((w) => w.topic && w.topic.trim());
}

// AC5: alias headers consulted ONLY when the exact "topic" column is missing
// or entirely blank - priority order, exact "topic" always wins when it has
// content (checked by the caller before this runs). Reuses the same CSV row
// parser csvToSchedule uses (parseCsvRows); shared csvToSchedule itself is
// NOT modified so its other callers are unaffected.
const CSV_TOPIC_ALIAS_HEADERS = ["topic", "topics", "title", "subject", "lesson", "module", "description"];

interface AliasCsvSchedule {
  schedule: ScheduleWeekPlan[];
  header: string;
}

function deriveAliasTopicSchedule(csv: string): AliasCsvSchedule | null {
  const rows = parseCsvRows(csv);
  const nonEmpty = rows.filter((row) => row.some((cell) => cell.trim().length > 0));
  if (nonEmpty.length < 2) return null;

  const headerRow = nonEmpty[0];
  const columnIndex: Record<string, number> = {};
  for (let i = 0; i < headerRow.length; i++) {
    const normalized = headerRow[i].trim().toLowerCase();
    if (!(normalized in columnIndex)) columnIndex[normalized] = i;
  }
  if (!("week" in columnIndex)) return null;

  let aliasHeader: string | null = null;
  let aliasIndex = -1;
  for (const alias of CSV_TOPIC_ALIAS_HEADERS) {
    if (!(alias in columnIndex)) continue;
    const idx = columnIndex[alias];
    const hasContent = nonEmpty.slice(1).some((row) => (row[idx] ?? "").trim().length > 0);
    if (hasContent) {
      aliasHeader = alias;
      aliasIndex = idx;
      break;
    }
  }
  if (!aliasHeader) return null;

  const summaryIdx = columnIndex["summary"];
  const assignmentIdx = columnIndex["assignment"];
  const testIdx = columnIndex["test"];

  const schedule: ScheduleWeekPlan[] = [];
  for (let i = 1; i < nonEmpty.length; i++) {
    const row = nonEmpty[i];
    const weekCell = (row[columnIndex["week"]] ?? "").trim();
    const week = Number(weekCell);
    if (!Number.isInteger(week) || week < 1) continue;

    const topic = (row[aliasIndex] ?? "").trim();
    const summary = (row[summaryIdx ?? -1] ?? "").trim();
    const assignmentCell = (row[assignmentIdx ?? -1] ?? "").trim();
    const testCell = (row[testIdx ?? -1] ?? "").trim();

    schedule.push({
      week,
      topic,
      summary,
      assignmentTitle: assignmentCell || null,
      assignmentSlug: null,
      testName: testCell || null,
    });
  }

  return { schedule, header: aliasHeader };
}

// AC3: maps ordered LMS/export module names to weeks, skipping obvious
// non-content modules (review/exam/etc, via the same isNonContentWeekText
// used elsewhere) UNLESS filtering would empty the list - then every name is
// kept and the caller is told so via the returned `filtered` flag.
function moduleNamesToWeeks(moduleNames: string[]): { weeks: ScheduleWeekPlan[]; filtered: boolean } {
  const contentOnly = moduleNames.filter((name) => !isNonContentWeekText(name));
  const usable = contentOnly.length > 0 ? contentOnly : moduleNames;
  const weeks: ScheduleWeekPlan[] = usable.map((name, i) => ({
    week: i + 1,
    topic: name,
    summary: "",
    assignmentTitle: null,
    assignmentSlug: null,
    testName: null,
  }));
  return { weeks, filtered: contentOnly.length > 0 && contentOnly.length < moduleNames.length };
}

export interface ScheduleResolution {
  /** The resolved, topic-bearing schedule (possibly empty if every tier came up dry). */
  schedule: ScheduleWeekPlan[];
  /** Which tier won, for the run summary - null when no tier produced a schedule. */
  note: string | null;
  /** One entry per tier attempted, describing what was found there - for error messages. */
  tried: string[];
}

// Ladder: bound schedule value -> tile's schedule CSV (with alias topic
// columns, AC5) -> LMS/export module names (AC3) -> tile's topics lines.
// Each tier is filtered to weeks with a non-empty trimmed topic (mirroring
// generateLectureMaterialsFromScheduleAction's own
// schedule.filter(w => w.topic && w.topic.trim()) check in course-planning.ts)
// so the action is never reached with a schedule that has zero topic-bearing
// weeks.
//
// `moduleNames` is pre-resolved by the caller (the step already gathered
// material via the source policy, which may have discovered module names -
// see registry-helpers.sources.ts's GatherModuleMaterialsOptions/
// moduleNames) - this function stays pure/IO-free, so it takes the names
// rather than fetching them itself.
export function resolveRepolessSchedule(
  boundValue: unknown,
  tile: { csvData?: string | null; topics?: string | null },
  moduleNames?: string[]
): ScheduleResolution {
  const tried: string[] = [];

  let boundWeeks: ScheduleWeekPlan[] = [];
  if (typeof boundValue === "string") {
    const trimmed = boundValue.trim();
    if (trimmed) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          boundWeeks = parsed as ScheduleWeekPlan[];
        }
      } catch {
        // Malformed JSON - tolerate and fall through to the next tier.
      }
    }
  } else if (Array.isArray(boundValue)) {
    boundWeeks = boundValue as ScheduleWeekPlan[];
  }
  const boundTopicWeeks = withTopicOnly(boundWeeks);
  tried.push(
    boundWeeks.length > 0
      ? `bound schedule input (${boundTopicWeeks.length} of ${boundWeeks.length} week(s) have a topic)`
      : "bound schedule input (none provided)"
  );
  if (boundTopicWeeks.length > 0) {
    return { schedule: boundTopicWeeks, note: "schedule from the bound input", tried };
  }

  const csvWeeks = csvToSchedule(tile.csvData ?? "");
  const csvTopicWeeks = withTopicOnly(csvWeeks);
  tried.push(
    csvWeeks.length > 0
      ? `the tile's schedule CSV (${csvTopicWeeks.length} of ${csvWeeks.length} week(s) have a topic)`
      : "the tile's schedule CSV (none set)"
  );
  if (csvTopicWeeks.length > 0) {
    return { schedule: csvTopicWeeks, note: "schedule from the tile's schedule CSV", tried };
  }

  const aliasResult = deriveAliasTopicSchedule(tile.csvData ?? "");
  if (aliasResult) {
    const aliasTopicWeeks = withTopicOnly(aliasResult.schedule);
    if (aliasTopicWeeks.length > 0) {
      return {
        schedule: aliasTopicWeeks,
        note: `schedule from the tile's schedule CSV (topics read from the "${aliasResult.header}" column)`,
        tried,
      };
    }
  }

  const moduleNameList = (moduleNames ?? []).map((n) => n.trim()).filter(Boolean);
  const { weeks: moduleWeeks, filtered } = moduleNamesToWeeks(moduleNameList);
  tried.push(
    moduleNameList.length > 0
      ? `LMS/export module names (${moduleWeeks.length} of ${moduleNameList.length} usable as week(s))`
      : "LMS/export module names (none available)"
  );
  if (moduleWeeks.length > 0) {
    return {
      schedule: moduleWeeks,
      note: `schedule derived from ${moduleWeeks.length} LMS module name(s)${filtered ? " (non-content modules skipped)" : ""}`,
      tried,
    };
  }

  const topicsLines = (tile.topics ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  tried.push(
    topicsLines.length > 0
      ? `the tile's topics field (${topicsLines.length} line(s))`
      : "the tile's topics field (blank)"
  );
  if (topicsLines.length > 0) {
    const synthesized: ScheduleWeekPlan[] = topicsLines.map((line, i) => ({
      week: i + 1,
      topic: line,
      summary: "",
      assignmentTitle: null,
      assignmentSlug: null,
      testName: null,
    }));
    return {
      schedule: synthesized,
      note: `schedule derived from the tile's topics (${synthesized.length} weeks)`,
      tried,
    };
  }

  return { schedule: [], note: null, tried };
}
