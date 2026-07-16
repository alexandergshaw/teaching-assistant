// Persistence for presentation drafts: the durable output of the save-presentation-draft
// workflow step and the "Save as draft" button in PowerPointDesignTab. A draft holds a
// self-contained presentation payload (title, slides, template info, subject) that the
// app-open UI later loads, reviews, and - only after the user approves it - further edits
// or exports. This module never exports to Canvas or files and has no Canvas dependency.
//
// Mirrors src/lib/message-drafts.ts: functions take an explicit SupabaseClient
// + userId (so the same code works from a browser session and from the cron's
// service-role client via requireOwner()'s runAsOwner impersonation), every
// query is scoped with .eq("user_id", userId), and a cast-through-any table()
// helper works around the generated Database type not yet describing this
// table's row shape everywhere the client needs it.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";

export type PresentationDraftStatus = "pending" | "reviewed";

export interface PresentationDraftSlide {
  title: string;
  bullets: string[];
  code?: string;
  codeLanguage?: string;
}

export interface PresentationDraftPayload {
  presentationTitle: string;
  slides: PresentationDraftSlide[];
  templateName?: string;
  subject?: string;
}

export interface PresentationDraft {
  id: string;
  userId: string;
  status: PresentationDraftStatus;
  summary: string;
  payload: PresentationDraftPayload;
  createdAt: string;
  updatedAt: string;
  workflowId?: string;
  workflowName?: string;
}

type DraftRow = Database["public"]["Tables"]["presentation_drafts"]["Row"];

/** Coerce an untyped jsonb payload into a typed PresentationDraftPayload,
 * dropping anything malformed rather than throwing - a hand-edited or
 * partially-written row degrades gracefully. */
export function coercePresentationDraftPayload(raw: unknown): PresentationDraftPayload {
  if (!raw || typeof raw !== "object") return { presentationTitle: "", slides: [] };
  const o = raw as Record<string, unknown>;
  const presentationTitle = typeof o.presentationTitle === "string" ? o.presentationTitle : "";
  const templateName = typeof o.templateName === "string" ? o.templateName : undefined;
  const subject = typeof o.subject === "string" ? o.subject : undefined;

  let slides: PresentationDraftSlide[] = [];
  if (Array.isArray(o.slides)) {
    slides = o.slides
      .map((s) => {
        if (!s || typeof s !== "object") return null;
        const slide = s as Record<string, unknown>;
        const title = typeof slide.title === "string" ? slide.title : "";
        const bullets = Array.isArray(slide.bullets)
          ? slide.bullets.filter((b) => typeof b === "string")
          : [];
        const code = typeof slide.code === "string" ? slide.code : undefined;
        const codeLanguage = typeof slide.codeLanguage === "string" ? slide.codeLanguage : undefined;
        return {
          title,
          bullets,
          ...(code ? { code } : {}),
          ...(codeLanguage ? { codeLanguage } : {}),
        };
      })
      .filter((s) => s !== null) as PresentationDraftSlide[];
  }

  return {
    presentationTitle,
    slides,
    ...(templateName ? { templateName } : {}),
    ...(subject ? { subject } : {}),
  };
}

/** Explicit row -> domain mapper, mirroring mapDraft in message-drafts.ts. */
export function mapDraft(row: DraftRow): PresentationDraft {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status === "reviewed" ? "reviewed" : "pending",
    summary: row.summary,
    payload: coercePresentationDraftPayload(row.payload),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    workflowId: row.workflow_id ?? undefined,
    workflowName: row.workflow_name ?? undefined,
  };
}

function table(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("presentation_drafts");
}

/** The owner's pending drafts, oldest first. */
export async function listPendingPresentationDrafts(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<PresentationDraft[]> {
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
export async function getPresentationDraft(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<PresentationDraft | null> {
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

export async function createPresentationDraft(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    summary: string;
    payload: PresentationDraftPayload;
    workflowId?: string;
    workflowName?: string;
  }
): Promise<PresentationDraft> {
  const { data, error } = await table(supabase)
    .insert({
      user_id: userId,
      status: "pending",
      summary: input.summary,
      payload: input.payload as unknown as Json,
      workflow_id: input.workflowId ?? null,
      workflow_name: input.workflowName ?? null,
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
export async function markPresentationDraftReviewed(
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

/** Update a draft's payload (e.g. after the user edits the slides in the
 * Drafts tab). Scoped to the owner; leaves status unchanged. */
export async function updatePresentationDraft(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  input: { payload: PresentationDraftPayload }
): Promise<void> {
  const { error } = await table(supabase)
    .update({ payload: input.payload as unknown as Json, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function deletePresentationDraft(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<void> {
  const { error } = await table(supabase).delete().eq("user_id", userId).eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}
