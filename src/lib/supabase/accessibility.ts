import { createServiceClient } from "./server";
import type { ItemScan, Issue, AccessibleItemType } from "@/lib/accessibility/types";

/**
 * Best-effort cache of per-item accessibility scans in the `accessibility_scans`
 * table (DDL in supabase/accessibility_scans.sql). Mirrors chat-logs: never
 * throws — if the table doesn't exist yet, reads return [] and writes no-op, so
 * the feature still works (scanning fresh) until the table is created.
 */

const TABLE = "accessibility_scans";

interface ScanRow {
  item_type: string;
  item_id: string;
  item_title: string;
  fingerprint: string;
  error_count: number;
  warning_count: number;
  suggestion_count: number;
  issues: Issue[];
}

function rowToItemScan(r: ScanRow): ItemScan {
  return {
    type: r.item_type as AccessibleItemType,
    id: r.item_id,
    title: r.item_title,
    fingerprint: r.fingerprint,
    errorCount: r.error_count,
    warningCount: r.warning_count,
    suggestionCount: r.suggestion_count,
    issues: Array.isArray(r.issues) ? r.issues : [],
  };
}

export async function getCachedScans(userId: string, institution: string, courseId: string): Promise<ItemScan[]> {
  try {
    const sb = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .from(TABLE)
      .select("item_type,item_id,item_title,fingerprint,error_count,warning_count,suggestion_count,issues")
      .eq("user_id", userId)
      .eq("institution", institution)
      .eq("course_id", courseId);
    if (error || !data) return [];
    return (data as ScanRow[]).map(rowToItemScan);
  } catch {
    return [];
  }
}

export async function upsertScans(
  userId: string,
  institution: string,
  courseId: string,
  items: ItemScan[]
): Promise<void> {
  if (items.length === 0) return;
  try {
    const sb = createServiceClient();
    const rows = items.map((it) => ({
      user_id: userId,
      institution,
      course_id: courseId,
      item_type: it.type,
      item_id: it.id,
      item_title: it.title,
      fingerprint: it.fingerprint,
      error_count: it.errorCount,
      warning_count: it.warningCount,
      suggestion_count: it.suggestionCount,
      issues: it.issues,
      scanned_at: new Date().toISOString(),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb as any).from(TABLE).upsert(rows, { onConflict: "user_id,institution,course_id,item_type,item_id" });
    if (error) console.error("[a11y-cache] upsert failed:", error.message);
  } catch (err) {
    console.error("[a11y-cache] upsert error:", err);
  }
}

export async function deleteScans(
  userId: string,
  institution: string,
  courseId: string,
  keys: Array<{ type: string; id: string }>
): Promise<void> {
  if (keys.length === 0) return;
  try {
    const sb = createServiceClient();
    for (const k of keys) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any)
        .from(TABLE)
        .delete()
        .eq("user_id", userId)
        .eq("institution", institution)
        .eq("course_id", courseId)
        .eq("item_type", k.type)
        .eq("item_id", k.id);
    }
  } catch {
    // ignore — stale rows are harmless
  }
}
