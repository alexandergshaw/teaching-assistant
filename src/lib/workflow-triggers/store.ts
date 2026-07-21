// Persistence layer for workflow triggers. This module handles all database
// operations (list, create, update, delete) and mapping functions. Imports
// event-sources for type definitions and to build the EVENT_TYPES set for
// validation.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../supabase/types";
import { EVENT_SOURCES, type TriggerEventType, type WorkflowTrigger, type TriggerEvalResult } from "./event-sources";

export type { WorkflowTrigger };

// ---------------------------------------------------------------------------
// Webhook token
// ---------------------------------------------------------------------------

/** A long, URL-safe random token used as the entire trust boundary for the
 * inbound webhook endpoint. */
export function generateWebhookToken(): string {
  const c = globalThis.crypto;
  return `${c.randomUUID()}${c.randomUUID()}`.replace(/-/g, "");
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

type TriggerRow = Database["public"]["Tables"]["workflow_triggers"]["Row"];

function stringRecord(value: Json | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
  }
  return out;
}

const EVENT_TYPES = new Set<string>(EVENT_SOURCES.map((s) => s.type));

/** Row -> domain object. Exported so the row-shape coercion is unit-testable
 * without a live Supabase client (mirrors mapSchedule). */
export function mapTrigger(row: TriggerRow): WorkflowTrigger {
  const eventType = (EVENT_TYPES.has(row.event_type) ? row.event_type : "webhook") as TriggerEventType;
  const disabledSteps = Array.isArray(row.disabled_steps)
    ? (row.disabled_steps as unknown[]).filter((n): n is number => typeof n === "number")
    : [];
  return {
    id: row.id,
    userId: row.user_id,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    fieldValues: stringRecord(row.field_values),
    eventType,
    eventConfig: stringRecord(row.event_config),
    cursor: row.cursor ?? null,
    checkVersion: typeof row.check_version === "number" ? row.check_version : 0,
    enabled: row.enabled,
    unattended: row.unattended,
    provider: row.provider,
    disabledSteps,
    courseId: row.course_id,
    institution: row.institution,
    webhookToken: row.webhook_token,
    lastCheckedAt: row.last_checked_at,
    lastFiredAt: row.last_fired_at,
  };
}

function table(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("workflow_triggers");
}

/** All of the owner's triggers, newest first. */
export async function listWorkflowTriggers(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<WorkflowTrigger[]> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as TriggerRow[]).map(mapTrigger);
}

export async function createWorkflowTrigger(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    workflowId: string;
    workflowName: string;
    fieldValues: Record<string, string>;
    eventType: TriggerEventType;
    eventConfig: Record<string, string>;
    unattended?: boolean;
    provider?: string | null;
    disabledSteps?: number[];
    courseId?: string | null;
    institution?: string | null;
    webhookToken?: string | null;
  }
): Promise<WorkflowTrigger> {
  const { data, error } = await table(supabase)
    .insert({
      user_id: userId,
      workflow_id: input.workflowId,
      workflow_name: input.workflowName,
      field_values: input.fieldValues as unknown as Json,
      event_type: input.eventType,
      event_config: input.eventConfig as unknown as Json,
      unattended: input.unattended ?? false,
      provider: input.provider ?? null,
      disabled_steps: (input.disabledSteps ?? []) as unknown as Json,
      course_id: input.courseId ?? null,
      institution: input.institution ?? null,
      webhook_token: input.webhookToken ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapTrigger(data as TriggerRow);
}

export async function updateWorkflowTrigger(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  fields: {
    enabled?: boolean;
    eventType?: TriggerEventType;
    eventConfig?: Record<string, string>;
    unattended?: boolean;
    courseId?: string | null;
    institution?: string | null;
    cursor?: Json | null;
  }
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.enabled !== undefined) patch.enabled = fields.enabled;
  if (fields.eventType !== undefined) patch.event_type = fields.eventType;
  if (fields.eventConfig !== undefined) patch.event_config = fields.eventConfig;
  if (fields.unattended !== undefined) patch.unattended = fields.unattended;
  if (fields.courseId !== undefined) patch.course_id = fields.courseId;
  if (fields.institution !== undefined) patch.institution = fields.institution;
  if (fields.cursor !== undefined) patch.cursor = fields.cursor;
  const { error } = await table(supabase).update(patch).eq("user_id", userId).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteWorkflowTrigger(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<void> {
  const { error } = await table(supabase).delete().eq("user_id", userId).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Claim a poll tick and persist its result with an optimistic-lock update
 * conditioned on `check_version`. Advances the cursor and last_checked_at
 * (always), stamps last_fired_at when the event fired, and bumps check_version.
 * Returns true when THIS caller won the claim: a second poller (another tab or
 * the cron) that read the same check_version updates 0 rows and must discard
 * its decision, so an event fires at most once.
 */
export async function claimAndAdvanceTrigger(
  supabase: SupabaseClient<Database>,
  trigger: WorkflowTrigger,
  result: TriggerEvalResult,
  now: Date
): Promise<boolean> {
  const patch: Record<string, unknown> = {
    cursor: result.cursor as unknown as Json,
    check_version: trigger.checkVersion + 1,
    last_checked_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  if (result.fired) patch.last_fired_at = now.toISOString();
  const { data, error } = await table(supabase)
    .update(patch)
    .eq("id", trigger.id)
    .eq("user_id", trigger.userId)
    .eq("check_version", trigger.checkVersion)
    .eq("enabled", true)
    .select("id");
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

/** Advance last_checked_at (and bump check_version) for a trigger a poller
 * skipped before evaluating, so it rotates to the back of the due window
 * instead of pinning the front. Best-effort. */
export async function touchTriggerChecked(
  supabase: SupabaseClient<Database>,
  trigger: WorkflowTrigger,
  now: Date
): Promise<void> {
  const { error } = await table(supabase)
    .update({
      last_checked_at: now.toISOString(),
      check_version: trigger.checkVersion + 1,
      updated_at: now.toISOString(),
    })
    .eq("id", trigger.id)
    .eq("check_version", trigger.checkVersion);
  if (error) throw new Error(error.message);
}

/**
 * Enabled, unattended, pollable triggers across ALL users (service-role client
 * only - RLS would hide other users' rows). Excludes webhook triggers, which
 * are never polled. The caller further throttles each by isTriggerDueForCheck.
 */
export async function listUnattendedTriggersDue(
  supabase: SupabaseClient<Database>,
  limit = 20
): Promise<WorkflowTrigger[]> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("enabled", true)
    .eq("unattended", true)
    .neq("event_type", "webhook")
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as TriggerRow[]).map(mapTrigger);
}

/** Enabled, unattended repo-push triggers across all users (service-role only). */
export async function listEnabledRepoPushTriggers(
  supabase: SupabaseClient<Database>
): Promise<WorkflowTrigger[]> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("event_type", "repo-push")
    .eq("enabled", true)
    .eq("unattended", true);
  if (error) throw new Error(error.message);
  return ((data ?? []) as TriggerRow[]).map(mapTrigger);
}

/** Pure: repo-push triggers matching an incoming push's org + repo name.
 * Matches when the trigger's config.org equals the org (case-insensitive) and
 * the repo name starts with config.prefix (empty prefix = all repos). */
export function matchRepoPushTriggers(
  triggers: WorkflowTrigger[],
  org: string,
  repoName: string
): WorkflowTrigger[] {
  const o = org.trim().toLowerCase();
  const rn = repoName.trim().toLowerCase();
  return triggers.filter((t) => {
    if (t.eventType !== "repo-push") return false;
    const cfg = (t.eventConfig ?? {}) as Record<string, unknown>;
    const cfgOrg = String(cfg.org ?? "").trim().toLowerCase();
    if (!cfgOrg || cfgOrg !== o) return false;
    const prefix = String(cfg.prefix ?? "").trim().toLowerCase();
    return rn.startsWith(prefix);
  });
}

/** Pure: advance a repo-push cursor so a pushed repo is marked seen at
 * commitTimestamp (mirrors decideRepoPush's cursor.repos map), preventing the
 * poller from re-firing the same push. */
export function advanceRepoPushCursor(
  cursor: Json | null,
  repo: string,
  commitTimestamp: string
): Json {
  const prev =
    cursor && typeof cursor === "object" && !Array.isArray(cursor)
      ? (cursor as Record<string, unknown>)
      : {};
  const prevRepos =
    prev.repos && typeof prev.repos === "object" && !Array.isArray(prev.repos)
      ? (prev.repos as Record<string, string>)
      : {};
  return { ...prev, repos: { ...prevRepos, [repo]: commitTimestamp } } as unknown as Json;
}

/** Look up a single enabled webhook trigger by its token (service-role client;
 * the token is the trust boundary). Returns null when no enabled row matches. */
export async function findEnabledWebhookTrigger(
  supabase: SupabaseClient<Database>,
  token: string
): Promise<WorkflowTrigger | null> {
  if (!token) return null;
  const { data, error } = await table(supabase)
    .select("*")
    .eq("webhook_token", token)
    .eq("event_type", "webhook")
    .eq("enabled", true)
    .limit(1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as TriggerRow[];
  return rows.length ? mapTrigger(rows[0]) : null;
}

/** Claim a webhook trigger BEFORE running it, using the same optimistic-lock
 * (check_version) as claimAndAdvanceTrigger, so a duplicate or concurrent POST
 * of the same token runs the workflow at most once. Returns true iff THIS
 * caller won the claim. */
export async function claimWebhookTrigger(
  supabase: SupabaseClient<Database>,
  trigger: WorkflowTrigger,
  now: Date
): Promise<boolean> {
  const { data, error } = await table(supabase)
    .update({
      last_fired_at: now.toISOString(),
      last_checked_at: now.toISOString(),
      check_version: trigger.checkVersion + 1,
      updated_at: now.toISOString(),
    })
    .eq("id", trigger.id)
    .eq("check_version", trigger.checkVersion)
    .eq("enabled", true)
    .select("id");
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}
