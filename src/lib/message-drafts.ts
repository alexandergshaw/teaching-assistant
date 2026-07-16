// Persistence for message drafts: the durable output of the save-message-draft
// workflow step. A draft holds a self-contained message payload (kind, body,
// and optional metadata for the target) that the app-open UI later loads,
// reviews, and - only after the user approves it - sends. This module never
// sends to Canvas or creates announcements/conversations and has no Canvas
// dependency at all.
//
// Mirrors src/lib/grading-drafts.ts: functions take an explicit SupabaseClient
// + userId (so the same code works from a browser session and from the cron's
// service-role client via requireOwner()'s runAsOwner impersonation), every
// query is scoped with .eq("user_id", userId), and a cast-through-any table()
// helper works around the generated Database type not yet describing this
// table's row shape everywhere the client needs it.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";

export type MessageDraftStatus = "pending" | "reviewed";
export type MessageDraftKind = "reply" | "announcement";

export interface MessageDraftPayload {
  kind: MessageDraftKind;
  body: string;
  conversationId?: string;
  courseUrl?: string;
  title?: string;
  institution?: string;
  context?: string;
}

export interface MessageDraft {
  id: string;
  userId: string;
  status: MessageDraftStatus;
  summary: string;
  payload: MessageDraftPayload;
  createdAt: string;
  updatedAt: string;
}

type DraftRow = Database["public"]["Tables"]["message_drafts"]["Row"];

/** Coerce an untyped jsonb payload into a typed MessageDraftPayload,
 * dropping anything malformed rather than throwing - a hand-edited or
 * partially-written row degrades gracefully. */
export function coerceMessageDraftPayload(raw: unknown): MessageDraftPayload {
  if (!raw || typeof raw !== "object") return { kind: "reply", body: "" };
  const o = raw as Record<string, unknown>;
  const kind = String(o.kind ?? "").trim().toLowerCase() === "announcement" ? "announcement" : "reply";
  const body = typeof o.body === "string" ? o.body : "";
  const conversationId = typeof o.conversationId === "string" ? o.conversationId : undefined;
  const courseUrl = typeof o.courseUrl === "string" ? o.courseUrl : undefined;
  const title = typeof o.title === "string" ? o.title : undefined;
  const institution = typeof o.institution === "string" ? o.institution : undefined;
  const context = typeof o.context === "string" ? o.context : undefined;

  return {
    kind,
    body,
    ...(conversationId ? { conversationId } : {}),
    ...(courseUrl ? { courseUrl } : {}),
    ...(title ? { title } : {}),
    ...(institution ? { institution } : {}),
    ...(context ? { context } : {}),
  };
}

/** Explicit row -> domain mapper, mirroring mapDraft in grading-drafts.ts. */
export function mapDraft(row: DraftRow): MessageDraft {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status === "reviewed" ? "reviewed" : "pending",
    summary: row.summary,
    payload: coerceMessageDraftPayload(row.payload),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function table(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("message_drafts");
}

/** The owner's pending drafts, oldest first. */
export async function listPendingMessageDrafts(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<MessageDraft[]> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as DraftRow[]).map(mapDraft);
}

/** One draft by id, scoped to its owner; null when missing or not owned. */
export async function getMessageDraft(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<MessageDraft | null> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;
  return mapDraft(data as DraftRow);
}

export async function createMessageDraft(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { summary: string; payload: MessageDraftPayload }
): Promise<MessageDraft> {
  const { data, error } = await table(supabase)
    .insert({
      user_id: userId,
      status: "pending",
      summary: input.summary,
      payload: input.payload as unknown as Json,
    })
    .select("*")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return mapDraft(data as DraftRow);
}

/** Idempotent: marking an already-reviewed (or missing) draft reviewed again
 * is a no-op success. */
export async function markMessageDraftReviewed(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<void> {
  const { error } = await table(supabase)
    .update({ status: "reviewed", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

/** Update a draft's payload (e.g. after the user edits the message in the
 * Drafts tab). Scoped to the owner; leaves status unchanged. */
export async function updateMessageDraft(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  input: { payload: MessageDraftPayload }
): Promise<void> {
  const { error } = await table(supabase)
    .update({ payload: input.payload as unknown as Json, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteMessageDraft(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<void> {
  const { error } = await table(supabase).delete().eq("user_id", userId).eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}
