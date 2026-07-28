// Persistence for live class sessions: one row per live class, holding the
// running transcript and every question the class-mode assistant detected
// and answered while the class was live.
//
// Mirrors src/lib/grading-drafts.ts: functions take an explicit
// SupabaseClient + userId, every query is scoped with .eq("user_id", userId),
// and a cast-through-any table() helper works around the generated Database
// type's Row/Insert/Update shapes not lining up everywhere the client needs
// them. Every row read back goes through the explicit mapClassSession
// mapper (mirrors mapRecordingFile in src/lib/recording-files.ts), which is
// defensive about the jsonb columns: a malformed segments/answered value (a
// string, an object, null) degrades to an empty array rather than throwing,
// and an unrecognized status falls back to "ended" - a hand-edited or
// partially-written row should never crash a read.
//
// appendClassSessionData APPENDS to the existing segments/answered arrays
// rather than overwriting them, and does so via read-modify-write: server
// actions in this app cap request bodies at ~10MB, so a browser transcribing
// a long live class must only ever send its newest few segments, never the
// whole transcript so far. That also means a retried append (the browser
// resending after a dropped response) must not duplicate rows - both arrays
// are deduped by `id` on every append.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
// Type-only import, so it erases at compile time and carries no runtime
// dependency edge - no cycle risk even if live-class/links.ts (or something
// it imports) ever came to depend on this file. AnswerLink is the source of
// truth for this shape; ClassSessionAnswer.links below is declared
// structurally identical to it.
import type { AnswerLink } from "@/lib/live-class/links";

export interface ClassSessionSegment {
  id: string;
  text: string;
  atMs: number;
  speaker?: string;
}

export interface ClassSessionAnswer {
  id: string;
  question: string;
  answer: string;
  askedAtMs: number;
  answeredAtMs: number;
  grounded: boolean;
  sources?: string[];
  /** Links resolved by code from the model's named concepts (see
   * src/lib/live-class/links.ts's AnswerLink - this field mirrors that shape
   * so a round trip through this table preserves what the live panel and
   * the end-of-class document both show). Optional so a row written before
   * this field existed still maps cleanly. */
  links?: AnswerLink[];
}

export interface ClassSession {
  id: string;
  courseId: string | null;
  title: string;
  moduleName: string;
  status: "live" | "ended" | "error";
  startedAt: string;
  endedAt: string | null;
  segments: ClassSessionSegment[];
  answered: ClassSessionAnswer[];
}

const VALID_STATUSES = ["live", "ended", "error"] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function coerceSegment(value: unknown): ClassSessionSegment | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.text !== "string") return null;
  return {
    id: o.id,
    text: o.text,
    atMs: typeof o.atMs === "number" ? o.atMs : 0,
    speaker: typeof o.speaker === "string" ? o.speaker : undefined,
  };
}

/** A malformed or non-array jsonb value (a string, null, an object) degrades
 * to [] rather than throwing. */
function coerceSegments(value: unknown): ClassSessionSegment[] {
  if (!Array.isArray(value)) return [];
  return value.map(coerceSegment).filter((s): s is ClassSessionSegment => s !== null);
}

const VALID_LINK_KINDS = ["visualizer", "docs"] as const;

/** A single resolved link entry is valid only when it has a non-empty
 * string `label`, a non-empty string `url`, and a `kind` of exactly
 * "visualizer" or "docs". An unrecognized `kind` is dropped rather than
 * coerced to a default - see this file's header comment: a wrong badge on a
 * link is worse than no link. */
function coerceLink(value: unknown): AnswerLink | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (typeof o.label !== "string" || o.label.trim().length === 0) return null;
  if (typeof o.url !== "string" || o.url.trim().length === 0) return null;
  if (typeof o.kind !== "string" || !(VALID_LINK_KINDS as readonly string[]).includes(o.kind)) return null;
  return { label: o.label, url: o.url, kind: o.kind as AnswerLink["kind"] };
}

/** A malformed or non-array jsonb value (a string, null, an object) degrades
 * to [] rather than throwing. An array containing malformed entries keeps
 * only the valid ones (see coerceLink). */
function coerceLinks(value: unknown): AnswerLink[] {
  if (!Array.isArray(value)) return [];
  return value.map(coerceLink).filter((l): l is AnswerLink => l !== null);
}

function coerceAnswer(value: unknown): ClassSessionAnswer | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.question !== "string" || typeof o.answer !== "string") return null;
  const sources = Array.isArray(o.sources)
    ? o.sources.filter((s): s is string => typeof s === "string")
    : undefined;
  const links = coerceLinks(o.links);
  return {
    id: o.id,
    question: o.question,
    answer: o.answer,
    askedAtMs: typeof o.askedAtMs === "number" ? o.askedAtMs : 0,
    answeredAtMs: typeof o.answeredAtMs === "number" ? o.answeredAtMs : 0,
    grounded: !!o.grounded,
    sources: sources && sources.length > 0 ? sources : undefined,
    links: links.length > 0 ? links : undefined,
  };
}

/** A malformed or non-array jsonb value (a string, null, an object) degrades
 * to [] rather than throwing. */
function coerceAnswered(value: unknown): ClassSessionAnswer[] {
  if (!Array.isArray(value)) return [];
  return value.map(coerceAnswer).filter((a): a is ClassSessionAnswer => a !== null);
}

/** Explicit row -> domain mapper, mirroring mapRecordingFile in
 * recording-files.ts. Takes `unknown` (not a typed Row) because it must
 * degrade gracefully on a hand-edited or partially-written row rather than
 * trusting the raw jsonb columns. */
export function mapClassSession(row: unknown): ClassSession {
  const r = asRecord(row);
  const status =
    typeof r.status === "string" && (VALID_STATUSES as readonly string[]).includes(r.status)
      ? (r.status as ClassSession["status"])
      : "ended";
  return {
    id: typeof r.id === "string" ? r.id : "",
    courseId: typeof r.course_id === "string" ? r.course_id : null,
    title: typeof r.title === "string" ? r.title : "",
    moduleName: typeof r.module_name === "string" ? r.module_name : "",
    status,
    startedAt: typeof r.started_at === "string" ? r.started_at : new Date(0).toISOString(),
    endedAt: typeof r.ended_at === "string" ? r.ended_at : null,
    segments: coerceSegments(r.segments),
    answered: coerceAnswered(r.answered),
  };
}

/** Merge `incoming` onto `existing`, deduping by `id` so a retried append
 * (the browser resending after a dropped response) can never duplicate a
 * segment or answer, whether the duplicate is already stored or repeated
 * within `incoming` itself. */
function dedupeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const merged = [...existing];
  const seen = new Set(merged.map((x) => x.id));
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

function table(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("class_session_transcripts");
}

/** Start a new live class session. Returns the created row. */
export async function createClassSession(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { courseId?: string | null; title?: string; moduleName?: string }
): Promise<ClassSession> {
  const { data, error } = await table(supabase)
    .insert({
      user_id: userId,
      course_id: input.courseId ?? null,
      title: input.title ?? "",
      module_name: input.moduleName ?? "",
    })
    .select("*")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return mapClassSession(data);
}

/** Append new transcript segments and/or answered questions to a session.
 * Read-modify-write is acceptable here (one browser tab owns a session at a
 * time), but every append dedupes by `id` against what is already stored, so
 * a retried request can never duplicate rows, and always bumps updated_at. */
export async function appendClassSessionData(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  delta: { segments?: ClassSessionSegment[]; answered?: ClassSessionAnswer[] }
): Promise<void> {
  const { data, error: selectError } = await table(supabase)
    .select("segments, answered")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .single();
  if (selectError) {
    throw new Error(selectError.message);
  }

  const current = asRecord(data);
  const mergedSegments = dedupeById(coerceSegments(current.segments), delta.segments ?? []);
  const mergedAnswered = dedupeById(coerceAnswered(current.answered), delta.answered ?? []);

  const { error } = await table(supabase)
    .update({
      segments: mergedSegments,
      answered: mergedAnswered,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", sessionId);
  if (error) {
    throw new Error(error.message);
  }
}

/** End a live class session, setting its status and ended_at. */
export async function endClassSession(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
  status: "ended" | "error" = "ended"
): Promise<void> {
  const { error } = await table(supabase)
    .update({
      status,
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", sessionId);
  if (error) {
    throw new Error(error.message);
  }
}

/** List the owner's class sessions, newest first. */
export async function listClassSessions(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit = 20
): Promise<ClassSession[]> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as unknown[]).map(mapClassSession);
}

/** Fetch one class session by id, scoped to its owner; null if missing or
 * not owned. */
export async function getClassSession(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string
): Promise<ClassSession | null> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;
  return mapClassSession(data);
}
