// Shared helpers for step definitions: module caching, materials gathering,
// module context resolution, and utility functions used across multiple steps.

import type { LlmProvider } from "@/lib/llm";
import type { ScheduleWeekPlan, AssignmentPlan } from "@/app/actions";
import {
  listCourseContentAction,
  listCourseHubAction,
  getDeckTemplateAction,
} from "@/app/actions";
import type { Course, CourseInput } from "@/lib/supabase/courses";
import { resolveWeekTopic, mapLiveModulesForTopic, type WeekTopicSource } from "@/lib/workflows/next-week";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import { csvToSchedule } from "@/lib/workflows/types";
import type { PptxTheme } from "@/lib/pptx";
import { buildSlidesPptx, withDeckNotes } from "@/lib/pptx";
import { buildDocxFromPlainText } from "@/lib/docx";
import { detectCanvasUrlKind } from "@/lib/canvas-url";
import { courseProgressStatus } from "@/lib/week-numbering";
import { resolveTileCurrentWeek } from "@/lib/workflows/tile-week";
import type { CartridgeCourseData } from "@/lib/cartridge-import";
import type { CommonResourceItem } from "@/lib/common-resources";
import type { InstitutionField } from "@/lib/institution-fields";
import type { StepInputSpec, StepOutputSpec } from "@/lib/workflows/types";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { dueDateForWeek, type AssignmentDueRule } from "@/lib/assignment-due-rule";

export type { StepInputSpec, StepOutputSpec } from "@/lib/workflows/types";

export interface TermCoursePreviewRow {
  lmsId: string;
  name: string;
  courseCode: string | null;
  termName: string | null;
  canvasUrl: string;
  note: string;
  institution?: string;
  startAt?: string | null;
}

export interface StepRunHelpers {
  activeInstitution: string | null;
  provider: LlmProvider;
  author: string;
  saveBundle: ((blob: Blob, name: string) => Promise<void>) | null;
  saveRunReport?: ((name: string, markdown: string) => Promise<void>) | null;
  saveCourseMaterialFile: ((courseId: string, blob: Blob, fileName: string) => Promise<void>) | null;
  saveCourseCastletopFile: ((courseId: string, blob: Blob, fileName: string) => Promise<void>) | null;
  saveCourseExportFile: ((courseId: string, blob: Blob, fileName: string) => Promise<void>) | null;
  loadCommonResources: (() => Promise<CommonResourceItem[]>) | null;
  getLibraryFile: ((fileId: string) => Promise<{ blob: Blob; name: string; mimeType: string } | null>) | null;
  getInstitutionFields: ((acronym: string) => Promise<InstitutionField[]>) | null;
  loadCourseExport: ((courseId: string) => Promise<CartridgeCourseData | null>) | null;
  /** The newest course-materials zip (uploaded materials, not an LMS export)
   * on a tile - the "materials-zip" source kind's raw input; null when the
   * tile has none configured or courseId is not found. */
  loadCourseMaterials: ((courseId: string) => Promise<{ name: string; blob: Blob } | null>) | null;
  workflowId?: string;
  workflowName?: string;
  workflowRunId?: string;
}

export type StepRunSummary =
  | {
      kind: "schedule";
      courseTitle: string;
      schedule: ScheduleWeekPlan[];
      csv: string;
      /** Source-material alignment note (chapter/week balance, or a
       * name-only-grounding note when the TOC did not parse). Absent when no
       * source material was supplied. */
      notes?: string;
    }
  | { kind: "link"; label: string; url: string }
  | { kind: "list"; label: string; items: string[] }
  | { kind: "text"; text: string };

export interface TableRowDetail {
  text: string;
  files?: Array<{ name: string; base64: string; mimeType: string }>;
}

export interface StepRunResult {
  outputs: Record<string, unknown>;
  summary: StepRunSummary;
  requireConfirmation?: string;
  requireInput?: {
    message: string;
    key: string;
    kind: "text" | "choice" | "upload" | "workflow" | "table";
    options?: Array<{ value: string; label: string }>;
    optional?: boolean;
    handoffPrefill?: Record<string, string>;
    initialValue?: string;
    submitLabel?: string;
    regenerate?: () => Promise<string>;
    columns?: Array<{ key: string; label: string; editable?: boolean; multiline?: boolean; link?: boolean; width?: number }>;
    rows?: Array<Record<string, string>>;
    selectable?: boolean;
    rowDetail?: (row: Record<string, string>) => Promise<TableRowDetail>;
    transform?: (value: string | File[] | Array<Record<string, string>>) => unknown;
  };
}

export interface StepDefinition {
  type: string;
  name: string;
  description: string;
  inputs: StepInputSpec[];
  outputs: StepOutputSpec[];
  run: (
    values: Record<string, unknown>,
    helpers: StepRunHelpers,
    onProgress: (text: string) => void
  ) => Promise<StepRunResult>;
}

// Base64-encode UTF-8 text in the browser (btoa alone rejects non-latin1).
export function encodeTextBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// "Student" or "Student | github-username" (pipe-separated so commas in
// names like "Last, First" never masquerade as usernames).
export function parseRosterLines(text: string): Array<{ student: string; username: string }> {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((row) => {
      const idx = row.lastIndexOf("|");
      if (idx === -1) return { student: row, username: "" };
      return { student: row.slice(0, idx).trim(), username: row.slice(idx + 1).trim().replace(/^@/, "") };
    });
}

// Client-side equivalent of CoursesTab's courseToInput: course tiles are
// updated by full-input round-trips, so EVERY editable field must ride
// along or the update would blank it.
export function courseToInputPayload(c: Course): CourseInput {
  return {
    name: c.name,
    courseCode: c.courseCode,
    term: c.term,
    canvasUrl: c.canvasUrl,
    repos: c.repos,
    githubOrg: c.githubOrg,
    textbook: c.textbook,
    syllabusId: c.syllabusId,
    institution: c.institution,
    integrations: c.integrations,
    roster: c.roster,
    notes: c.notes,
    topics: c.topics,
    csvName: c.csvName,
    csvData: c.csvData,
    rubricName: c.rubricName,
    rubricData: c.rubricData,
    startDate: c.startDate,
    description: c.description,
    weeks: c.weeks,
    tests: c.tests,
    lms: c.lms,
    dayTime: c.dayTime,
    modality: c.modality,
    topicOutline: c.topicOutline,
    syllabusTemplateId: c.syllabusTemplateId,
    endDate: c.endDate,
    breaks: c.breaks,
    assignmentDueRule: c.assignmentDueRule,
    email: c.email,
    emailClient: c.emailClient,
    classLengthMinutes: c.classLengthMinutes,
    customTiles: c.customTiles,
    hiddenTiles: c.hiddenTiles,
    studentRepos: c.studentRepos,
  };
}

// Steps run in the browser, so atob decodes stored base64 docx payloads
// straight into Blobs.
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

// Isomorphic helper: converts Blob to base64 string.
// Works in both browser (via btoa) and Node.js (via Buffer).
// Feature-detects the environment; does not assume DOM APIs.
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (typeof Buffer !== 'undefined') {
    // Node.js environment
    return Buffer.from(bytes).toString('base64');
  } else if (typeof btoa !== 'undefined') {
    // Browser environment: chunk the byte array to avoid stack overflow
    // with very large files (btoa has a limit on string length)
    const chunkSize = 8192;
    let binaryStr = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binaryStr += String.fromCharCode(...chunk);
    }
    return btoa(binaryStr);
  } else {
    throw new Error('Neither Buffer nor btoa available for base64 encoding');
  }
}

// Parse a tile's Day/Time (e.g. "MW 10:00-11:15", "TTh 2:00 PM") into
// weekday numbers plus the FIRST start time. Day tokens only scan the text
// before the first digit so the M in "PM" never reads as Monday; tokens are
// case-insensitive, ordered longest-first (SU, SA, TH, TU before single
// letters M, T, W, R, F), and "R" is the registrar shorthand for Thursday.
// A time with no AM/PM and an hour of 7 or less is assumed PM - typical class times.
export function parseDayTime(
  text: string
): { days: Set<number>; hour: number; minute: number } | null {
  const firstDigit = text.search(/\d/);
  const dayPart = firstDigit === -1 ? text : text.slice(0, firstDigit);
  const dayPartUpper = dayPart.toUpperCase();

  // Longest-first token matching: SU, SA, TH, TU before single letters
  const tokenMap: Record<string, number> = {
    SU: 0,
    SA: 6,
    TH: 4,
    TU: 2,
    M: 1,
    T: 2,
    W: 3,
    R: 4,
    F: 5,
  };

  // Spelled-out day names, matched whole by a token's first three letters.
  const FULL_NAMES: Record<string, number> = {
    SUN: 0,
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6,
  };

  const days = new Set<number>();
  const tokens = dayPartUpper.split(/[^A-Z]+/).filter(Boolean);
  for (const token of tokens) {
    // A spelled-out name (MON, MONDAY, THURS, ...) is matched whole first, so
    // its inner letters are never mistaken for concatenated codes ("FRI" must
    // not yield Thursday from its R).
    if (token.length >= 3) {
      const three = token.slice(0, 3);
      if (three in FULL_NAMES) {
        days.add(FULL_NAMES[three]);
        continue;
      }
    }
    // Otherwise treat the token as one or more concatenated day codes (MW,
    // MWF, TTH, TR, SU...), consuming two chars at a time when they match a
    // two-char code (SU/SA/TH/TU) and one char otherwise, so every code in
    // the token is captured instead of just the first.
    let i = 0;
    while (i < token.length) {
      const two = token.slice(i, i + 2);
      if (two.length === 2 && two in tokenMap) {
        days.add(tokenMap[two]);
        i += 2;
        continue;
      }
      const one = token[i];
      if (one in tokenMap) {
        days.add(tokenMap[one]);
      }
      i += 1;
    }
  }

  if (days.size === 0) return null;

  const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?/);
  if (!timeMatch) return null;

  let hour = Number(timeMatch[1]);
  const minute = timeMatch[2] ? Number(timeMatch[2]) : 0;
  const meridiem = timeMatch[3]?.toLowerCase() ?? "";
  if (meridiem === "pm" && hour < 12) {
    hour += 12;
  } else if (meridiem === "am" && hour === 12) {
    hour = 0;
  } else if (!meridiem && hour <= 7) {
    hour += 12;
  }
  if (hour > 23 || minute > 59) return null;

  return { days, hour, minute };
}

// The historical, hardcoded default: deadlines land on the Sunday ending
// week N (23:59:00.000 local time), matching Assign Due Dates.
const DEFAULT_DUE_RULE: AssignmentDueRule = { day: "sun", time: "23:59" };

// Calculate the deadline for a given week, anchored on the Monday of the start date's week.
// With no rule (or an explicit null), this reproduces the historical Sunday-23:59 behavior
// exactly - DEFAULT_DUE_RULE is proven equal to the old hardcoded arithmetic across weeks
// 1-20 and every start weekday (see assignment-due-rule.test.ts). Delegates to
// dueDateForWeek so there is exactly one implementation of the date arithmetic
// (src/lib/assignment-due-rule.ts), not two copies that can drift apart.
export function weekDeadline(start: Date, week: number, rule?: AssignmentDueRule | null): Date {
  return dueDateForWeek(start, week, rule ?? DEFAULT_DUE_RULE);
}

// gatherModuleMaterials lives in registry-helpers.sources.ts (kept this file
// under the 1000-line gate); re-exported here so existing importers are
// unchanged.
export { gatherModuleMaterials } from "@/lib/workflows/registry-helpers.sources";

// Module-level cache for live course modules, keyed by canvasUrl.
// TTL is ~120 seconds to avoid redundant fetches during multi-week/multi-tile runs.
interface CachedLiveModules {
  at: number;
  modules: Array<{ id: number; title: string; position: number; items: Array<{ title: string }> }>;
}

const liveModulesCache = new Map<string, CachedLiveModules>();
const LIVE_MODULES_CACHE_TTL_MS = 120_000;

export function getCachedLiveModules(
  canvasUrl: string
): Array<{ id: number; title: string; position: number; items: Array<{ title: string }> }> | null {
  const cached = liveModulesCache.get(canvasUrl);
  const now = Date.now();
  if (cached && now - cached.at < LIVE_MODULES_CACHE_TTL_MS) {
    return cached.modules;
  }
  liveModulesCache.delete(canvasUrl);
  return null;
}

export function setCachedLiveModules(
  canvasUrl: string,
  modules: Array<{ id: number; title: string; position: number; items: Array<{ title: string }> }>
): void {
  liveModulesCache.set(canvasUrl, { at: Date.now(), modules });
}

// Loads the week's topic using live-first fallback: live LMS modules first,
// then the course's LMS export, then the tile's schedule CSV, then its topics list.
// Returns the resolved topic/summary and source, or a skip with a diagnostic message.
export async function loadTileWeekTopic(
  tile: Course,
  week: number,
  helpers: StepRunHelpers
): Promise<WeekTopicSource | { skip: string }> {
  // Priority 1: Fetch live LMS modules if canvasUrl is set
  let liveModules: Array<{ id: number; title: string; position: number; items: Array<{ title: string }> }> | null = null;
  if (tile.canvasUrl) {
    try {
      // Check cache first
      const cached = getCachedLiveModules(tile.canvasUrl);
      if (cached !== null) {
        liveModules = cached;
      } else {
        // Fetch live modules using the server action
        const institution = tile.institution ?? helpers.activeInstitution ?? undefined;
        const result = await listCourseContentAction(tile.canvasUrl, institution);
        if (!("error" in result) && result.modules && result.modules.length > 0) {
          // Map Canvas modules to resolveWeekTopic shape
          liveModules = mapLiveModulesForTopic(result.modules);
        } else {
          // Cache negative outcome (error or empty modules) to prevent re-fetching
          liveModules = [];
        }
        setCachedLiveModules(tile.canvasUrl, liveModules);
      }
    } catch {
      // Cache negative outcome (exception) to prevent re-fetching
      setCachedLiveModules(tile.canvasUrl, []);
      // Silently fall through to export/CSV/topics on live fetch failure
    }
  }

  // Priority 2: Load export modules
  let modules: Array<{ title: string; position: number; items: Array<{ title: string }> }> | null = null;
  if (helpers.loadCourseExport) {
    try {
      const exported = await helpers.loadCourseExport(tile.id);
      if (exported && typeof exported === "object" && "modules" in exported) {
        const exportedModules = (exported as { modules: unknown[] }).modules;
        modules = exportedModules.map((m: unknown) => {
          const mod = m as { name: string; position: number; items: unknown[] };
          return {
            title: mod.name,
            position: mod.position,
            items: (mod.items || []).map((item: unknown) => ({
              title: (item as { title: string }).title || "",
            })),
          };
        });
      }
    } catch {
      // Silently fall through to CSV/topics on export load failure
    }
  }
  return resolveWeekTopic({
    liveModules,
    modules,
    csvData: tile.csvData ?? null,
    topics: tile.topics ?? null,
    week,
  });
}

// resolveTileCurrentWeek lives in tile-week.ts so registry-helpers.sources.ts
// can use it without importing this file (which re-exports those gatherers).
// Re-exported here so this file's import surface is unchanged; the local
// import below is what this file's own callers bind to.
export { resolveTileCurrentWeek };

// Loads the workflow-scoped course tile and returns its CURRENT module/week
// topic + learning-outcomes summary, or null when there is nothing to derive
// from (no hubCourse, missing tile, no/invalid start date, not-started/complete,
// or no topic can be resolved for the current week (export, schedule CSV, or topics list)). Uses export-first fallback for topic lookup.
export async function deriveCurrentModule(
  values: Record<string, unknown>,
  helpers: StepRunHelpers
): Promise<{ topic: string; summary: string; clamped?: boolean } | null> {
  const hubCourseId = String(values.hubCourse ?? "").trim();
  if (!hubCourseId) return null;
  const list = await listCourseHubAction();
  if ("error" in list) return null;
  const tile = list.courses.find((c) => c.id === hubCourseId);
  if (!tile) return null;
  const weekResolution = await resolveTileCurrentWeek(tile, helpers);
  if ("skip" in weekResolution) return null;
  const rawWeek = weekResolution.rawWeek;
  const status = courseProgressStatus(rawWeek, tile.weeks);
  if (status === "not-started" || status === "complete") return null;

  // Apply modulesAhead offset
  const modulesAhead = resolveModulesAhead(values);
  let effectiveWeek = rawWeek + modulesAhead;
  let clamped = false;
  if (tile.weeks && tile.weeks > 0) {
    if (effectiveWeek > tile.weeks) {
      effectiveWeek = tile.weeks;
      clamped = true;
    }
  }

  const weekTopic = await loadTileWeekTopic(tile, effectiveWeek, helpers);
  if ("skip" in weekTopic) {
    // Legacy passthrough, confined to this helper: a schedule row with a bare
    // summary and no topic still supplies objectives text (the shared
    // resolver treats a blank topic as unresolved and falls through).
    const e = csvToSchedule(tile.csvData ?? "").find((x) => x.week === effectiveWeek);
    if (e && e.summary.trim()) {
      const result: { topic: string; summary: string; clamped?: boolean } = { topic: "", summary: e.summary.trim() };
      if (clamped) result.clamped = true;
      return result;
    }
    return null;
  }
  const result: { topic: string; summary: string; clamped?: boolean } = { topic: weekTopic.topic, summary: weekTopic.summary };
  if (clamped) result.clamped = true;
  return result;
}

// The Module objectives for a content step: the explicitly provided text, or -
// when empty and a course tile is given (typically from workflow scope) -
// derived from that tile's CURRENT module (topic + the week's learning-outcomes
// summary). Returns "" when nothing can be derived.
export async function resolveModuleObjectives(
  values: Record<string, unknown>,
  helpers: StepRunHelpers
): Promise<string> {
  const explicit = String(values.objectives ?? "").trim();
  if (explicit) return explicit;
  const mod = await deriveCurrentModule(values, helpers);
  if (!mod) return "";
  const parts: string[] = [];
  if (mod.topic) parts.push(`Topic: ${mod.topic}`);
  if (mod.summary) parts.push(mod.summary);
  return parts.join("\n");
}

// Both the topic and objectives for a content step that needs each separately
// (e.g. Generate a lecture script): explicit values win per field; whatever is
// empty is derived from the scoped course's current module.
export async function resolveModuleContext(
  values: Record<string, unknown>,
  helpers: StepRunHelpers
): Promise<{ topic: string; objectives: string }> {
  const explicitTopic = String(values.topic ?? "").trim();
  const explicitObjectives = String(values.objectives ?? "").trim();
  if (explicitTopic && explicitObjectives) return { topic: explicitTopic, objectives: explicitObjectives };
  const mod = await deriveCurrentModule(values, helpers);
  const parts: string[] = [];
  if (mod?.topic) parts.push(`Topic: ${mod.topic}`);
  if (mod?.summary) parts.push(mod.summary);
  return {
    topic: explicitTopic || (mod?.topic ?? ""),
    objectives: explicitObjectives || parts.join("\n"),
  };
}

// Resolve a template input to its theme for buildSlidesPptx. Defaults to
// Classic Lecture; fails forward with a note if the template is not found.
export async function resolveDeckTheme(
  templateValue: unknown
): Promise<{ theme: PptxTheme | undefined; templateName: string; note: string | null }> {
  const idOrName = String(templateValue ?? "").trim() || "preset-classic-lecture";
  const r = await getDeckTemplateAction(idOrName);
  if ("error" in r) {
    return {
      theme: undefined,
      templateName: "Classic Lecture",
      note: `Template "${idOrName}" not found - used Classic Lecture.`,
    };
  }
  const theme: PptxTheme = {
    backgroundKind: r.template.theme.backgroundKind,
    backgroundColor: r.template.theme.backgroundColor,
    backgroundColor2: r.template.theme.backgroundColor2,
    fontColor: r.template.theme.fontColor,
    // Note: backgroundImageData server/client-side falls back to solid exactly
    // like savePresentationFileAction; gradients without the precomputed PNG
    // render as solid fills.
  };
  return { theme, templateName: r.template.name, note: null };
}

// Whether an optional-generator "selected" input (steps.course-build-scope.ts's
// "select-course-outputs" boolean outputs - selectedAssignments/Objectives/
// Openers/Decks, and the single "selected" input generate-course-guides/
// generate-weekly-announcements/generate-knowledge-checks each declare) says
// this generator should run. UNBOUND (undefined - the value every preset that
// never wires the new selector leaves it at, and every EXISTING saved run
// form with no value for it) means "generate" - the opposite default of most
// boolean inputs in this registry (e.g. postToLms, which defaults OFF when
// unbound). This is deliberate: "blank means ALL" (COURSE_BUILD's output
// selector) must reproduce today's full-generation behavior exactly for
// every preset that does not bind it, so unbound can never mean "skip."
export function isGeneratorSelected(value: unknown): boolean {
  if (value === undefined) return true;
  const v = String(value).trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false";
}

// Assemble lecture materials from assignment plans into files and zip,
// handling deck theming, file creation, download/save logic.
// Shared by lecture-zip and lecture-materials-from-schedule steps.
export async function assembleLectureFiles(
  plans: AssignmentPlan[],
  values: Record<string, unknown>,
  helpers: StepRunHelpers,
  onProgress: (msg: string) => void,
  baseNameFallback: string
): Promise<{
  files: GeneratedCourseFile[];
  summary: StepRunSummary;
}> {
  const includeInstructions =
    values.includeInstructions === undefined
      ? true
      : String(values.includeInstructions) === "1";

  // COURSE_BUILD's output selector (steps.course-build-scope.ts's
  // "select-course-outputs"): each of the four roles this function can
  // produce per plan is independently selectable. Every OTHER caller
  // (lecture-zip's repo and repoless branches, and lecture-materials-from-
  // schedule when used by NO_CODE_KICKOFF/COURSE_KICKOFF/a standalone Course
  // Refresh) never binds these, so isGeneratorSelected's "unbound means
  // generate" default reproduces today's full-generation behavior exactly.
  // "Module introductions" have no toggle of their own - they ride as the
  // deck's own opening-slide speaker notes (withDeckNotes below) and are
  // therefore controlled by selectedDecks, not a separate flag.
  const selectedObjectives = isGeneratorSelected(values.selectedObjectives);
  const selectedDecks = isGeneratorSelected(values.selectedDecks);
  const selectedAssignments = isGeneratorSelected(values.selectedAssignments);
  const selectedOpeners = isGeneratorSelected(values.selectedOpeners);
  const deselectedRoles = [
    !selectedObjectives && "module objectives",
    !selectedDecks && "lecture decks",
    !selectedAssignments && "assignment instructions",
    !selectedOpeners && "class openers",
  ].filter((r): r is string => Boolean(r));

  const deck = await resolveDeckTheme(values.template);
  const files: GeneratedCourseFile[] = [];

  // Determine the course tile (if any) up front so both the per-file names
  // below and the zip's base name share the same course label.
  const hubCourseId = String(values.hubCourse ?? "").trim();
  let course: { courseCode: string | null; name: string } | null = null;
  if (hubCourseId) {
    const list = await listCourseHubAction();
    if (!("error" in list)) {
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (tile) {
        course = { courseCode: tile.courseCode, name: tile.name };
      }
    }
  }

  if (deck.note) onProgress(deck.note);
  onProgress(`Processing ${plans.length} assignments...`);
  for (const plan of plans) {
    // AC1/AC2/AC3: the module objectives document ships alongside the other
    // per-week artifacts, generated by the SAME builders that already
    // produce the slides/intro/instructions here (buildScheduleWeekPlan and
    // the repo-driven buildAssignmentPlan) - so it needs no new generation
    // call of its own at this layer, just packaging. Always present
    // (moduleObjectives is never "" - real generation or, on failure, the
    // deterministic scaffold - see the AssignmentPlan field's doc comment),
    // so this always runs; the guard is defensive only. pageText carries the
    // same markdown the docx renders, so lms-populate can turn it into a
    // native LMS Page through the SAME role+pageText mechanism "introduction"
    // already uses (steps.lms-modules.ts).
    if (selectedObjectives && plan.moduleObjectives.trim()) {
      const objectivesData = await buildDocxFromPlainText(plan.moduleObjectives, [], helpers.author);
      files.push({
        name: buildWorkflowFileName({
          course,
          artifact: "Module Objectives",
          qualifier: plan.label,
          ext: "docx",
        }),
        blob: new Blob([objectivesData], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        weekNumber: plan.weekNumber,
        sortOrder: 0.5,
        role: "objectives",
        pageText: plan.moduleObjectives,
      });
    }

    // V3 (professional-lift audit): a week whose slide generation failed
    // falls back to an empty slides array (buildScheduleWeekPlan/
    // buildAssignmentPlan), which buildSlidesPptx renders as a single title
    // slide - a real generated run shipped exactly this to Canvas as an
    // ordinary lecture while the run's own header read clean. Mark it
    // unmistakably instead: the one slide it has says so, the filename says
    // so, and needsRegeneration tells lms-populate/the Common Cartridge
    // builder to never upload it as if it were a finished lecture.
    if (selectedDecks) {
      const slidesNeedRegeneration = plan.slidesFailed === true;
      const pptxData = await buildSlidesPptx({
        presentationTitle: slidesNeedRegeneration
          ? `REGENERATE THIS WEEK - ${plan.presentationTitle}`
          : plan.presentationTitle,
        // The module introduction rides in as the opening slide's speaker notes
        // rather than shipping as its own document - so deselecting "decks"
        // also means no module-introduction artifact ships this run (there is
        // no separate toggle for it - see this function's own header note).
        slides: withDeckNotes(plan.slides, plan.moduleIntroduction),
        subtitle: plan.label,
        author: helpers.author,
        theme: deck.theme,
      });

      files.push({
        name: buildWorkflowFileName({
          course,
          artifact: "Lecture Slides",
          qualifier: slidesNeedRegeneration ? `${plan.label} - NEEDS REGENERATION` : plan.label,
          ext: "pptx",
        }),
        blob: new Blob([pptxData], {
          type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        }),
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        weekNumber: plan.weekNumber,
        sortOrder: 1,
        role: "slides",
        ...(slidesNeedRegeneration ? { needsRegeneration: true } : {}),
      });
    }

    if (selectedAssignments && includeInstructions && plan.assignmentInstructions) {
      const docxData = await buildDocxFromPlainText(
        plan.assignmentInstructions,
        plan.instructionsTemplateHeadings,
        helpers.author
      );
      files.push({
        name: buildWorkflowFileName({
          course,
          artifact: "Assignment Instructions",
          qualifier: plan.label,
          ext: "docx",
        }),
        blob: new Blob([docxData], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        weekNumber: plan.weekNumber,
        sortOrder: 2,
        role: "instructions",
        pageText: plan.assignmentInstructions,
      });
    }

    // T2 (no-code pipeline reorder): present only when the plan's own
    // sequenceOpenerBeforeDeck phase actually generated one. That phase now
    // runs unconditionally for every production caller of BOTH plan builders
    // - buildAssignmentPlan (shared.ts), reached via lecture-zip's repo
    // branch, and buildScheduleWeekPlan (course-planning-grounding.ts),
    // reached via the schedule-driven branches - so plan.openerText is
    // populated for those. It stays undefined only for a plan built with the
    // phase left off, which today means exactly one caller:
    // generateLecturePlanForAssignmentAction's single-assignment regeneration
    // (lecture-plans.ts), which does not pass sequenceOpenerBeforeDeck and so
    // keeps buildAssignmentPlan's own default (false) - see that parameter's
    // doc comment for why single-assignment regen is deliberately excluded.
    // Ships as its own docx, role "opener", the SAME role and file shape the
    // standalone generate-class-openers step already produces, so
    // gatherWeekMaterials (steps.weekly-announcements.ts) and the cartridge/
    // zip bucketing both pick it up identically either way.
    if (selectedOpeners && plan.openerText && plan.openerText.trim()) {
      const openerData = await buildDocxFromPlainText(plan.openerText, [], helpers.author);
      files.push({
        name: buildWorkflowFileName({
          course,
          artifact: "Class Opener",
          qualifier: plan.label,
          ext: "docx",
        }),
        blob: new Blob([openerData], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        weekNumber: plan.weekNumber,
        sortOrder: 3,
        role: "opener",
        pageText: plan.openerText,
      });
    }
  }

  onProgress("Assembling zip...");
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.name, file.blob);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });

  const zipFileName = course
    ? buildWorkflowFileName({ course, artifact: "Lecture Materials", ext: "zip" })
    : `${baseNameFallback}.zip`;

  // The zip always downloads in an attended run, regardless of the tile's
  // LMS. A Canvas/Blackboard tile separately gets a Common Cartridge built
  // by its own step (steps.lms-export.ts) for importing into the LMS, but
  // that cartridge is an import artifact FOR the LMS - it is not the
  // instructor's own copy of the materials, and the two are not
  // substitutes for one another. Headless (server) runs have no `document`
  // to build a download link with, so they always skip the download itself
  // and rely on the Files tab/tile save below.
  let downloadSkipped = false;
  if (typeof document !== "undefined") {
    onProgress("Downloading zip...");
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = zipFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    downloadSkipped = true;
  }

  if (helpers.saveBundle) {
    try {
      await helpers.saveBundle(zipBlob, zipFileName);
    } catch (err) {
      console.error("Library save failed:", err);
    }
  }

  // A week that fell back to the deterministic scaffold still produces a
  // file, so without this the run looks like a clean success while shipping
  // placeholder prose. That is exactly how 16 weeks of template lecture notes
  // reached a real course unnoticed.
  const degraded: string[] = [];
  for (const plan of plans) {
    const failures: string[] = [];
    if (plan.slidesFailed) failures.push("slides");
    if (plan.introFailed) failures.push("lecture notes");
    // AC1/AC7: a week whose objectives generation itself failed still ships
    // the deterministic scaffold (never an empty document, never an aborted
    // run) - this only makes that degradation visible, matching how
    // slidesFailed/introFailed already surface here.
    if (plan.objectivesFailed) failures.push("module objectives");
    // T2: mirrors objectivesFailed above - undefined unless
    // sequenceOpenerBeforeDeck actually attempted an opener for this plan.
    if (plan.openerFailed) failures.push("class opener");
    // AC6: the assignment is this module's spine (buildScheduleWeekPlan
    // generates it first, then grounds the intro/deck/objectives in its
    // text) - when it falls back to a placeholder, the intro/deck/objectives
    // were NOT given fake grounding to compensate (see
    // assignmentContextForDownstream there), so that knock-on effect must be
    // visible here too, not just the assignment failure itself.
    if (plan.instructionsFailed) {
      failures.push(
        "assignment instructions (module intro, slides, and objectives generated without assignment grounding as a result)"
      );
    }
    // AC2: a no-code course's model returned code anyway - it was stripped
    // before shipping, but the run must say so rather than looking clean.
    if (plan.codeStrippedFromApplied) {
      failures.push(
        `code removed from ${plan.codeStrippedFromApplied} slide(s) (this course does not use code)`
      );
    }
    // AC3: an applied week whose required-tool selection failed/found
    // nothing - the assignment and the deck each chose independently instead
    // of sharing one tool, so the run must say so rather than looking clean.
    if (plan.moduleToolsSelectionFailed) {
      failures.push(
        "required tool selection (the assignment and slides chose tools independently as a result)"
      );
    }
    if (failures.length > 0) {
      degraded.push(`${plan.label}: ${failures.join(", ")} fell back to a placeholder template.`);
    }
  }

  // AC1 (COURSE_BUILD's output selector): a deselected role produced no
  // files this run - said here so the step's own summary shows it, not just
  // a shorter file list with no explanation.
  const selectionNote =
    deselectedRoles.length > 0
      ? [`Not generated this run (deselected in the output selection): ${deselectedRoles.join(", ")}.`]
      : [];

  return {
    files,
    summary: {
      kind: "list",
      label: downloadSkipped
        ? `Generated ${files.length} files (zip saved to the Files tab as "${zipFileName}" - this run had no browser to download it to)`
        : `Generated ${files.length} files (zip downloaded)`,
      items:
        degraded.length > 0 || selectionNote.length > 0
          ? [...selectionNote, ...degraded, ...files.map((f) => f.name)]
          : files.map((f) => f.name),
    },
  };
}

// Classify a resolve-rubric source line: a Canvas assignment/discussion URL is
// an LMS rubric probe; an owner/name or github.com URL is a repo probe; a bare
// topic goes to the rubric bank; a URL matching neither handler (e.g. a bare
// Canvas course URL) is skipped rather than mis-probed against the bank.
export function classifyRubricSource(line: string): "lms" | "repo" | "topic" | "skip" {
  if (detectCanvasUrlKind(line)) return "lms";
  if (/github\.com/i.test(line) || /^[^/\s]+\/[^/\s]+$/.test(line)) return "repo";
  if (/^https?:\/\//i.test(line)) return "skip";
  return "topic";
}

// Parse and validate a modules-ahead offset value: clamps to [0, 12], defaults to 0.
// Fail-soft on unparseable values: treat as 0.
export function resolveModulesAhead(values: Record<string, unknown> | undefined): number {
  const raw = String(values?.modulesAhead ?? "").trim();
  if (!raw) return 0;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) return 0;
  return Math.max(0, Math.min(12, parsed));
}
