"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/supabase/auth";


// ── Cartridge drops ──────────────────────────────────────────────────────
//
// Centralized submissions archive upload for closed/LMS-less courses.
// Workflow trigger fires when new drops appear; triggered workflow grades
// each drop and produces a gradebook CSV ready to upload, plus a reviewable
// grading draft. All actions require owner context.

/**
 * List all status='new' cartridge drop IDs for the owner.
 * Used by the trigger evaluator (both browser watcher and server runner).
 */
export async function listNewCartridgeDropIdsAction(): Promise<
  { ids: string[]; count: number } | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const { data: rows, error } = await (supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("cartridge_drops") as any)
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "new");

    if (error) {
      return { error: error.message };
    }

    const ids = (rows || []).map((r: { id: string }) => r.id);
    return { ids, count: ids.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list cartridge drops." };
  }
}

/**
 * List full cartridge_drops rows with status='new', oldest first.
 * Used by the grade-cartridge-submissions step.
 */
export async function listNewCartridgeDropsAction(
  limit: number
): Promise<Array<{
  id: string;
  name: string;
  courseLabel: string;
  assignmentLabel: string;
  pointsPossible: number | null;
  rubricText: string | null;
  lms: string;
  storagePath: string;
  sizeBytes: number;
}> | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const { data: rows, error } = await (supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("cartridge_drops") as any)
      .select("id, name, course_label, assignment_label, points_possible, rubric_text, lms, storage_path, size_bytes")
      .eq("user_id", user.id)
      .eq("status", "new")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      return { error: error.message };
    }

    return ((rows ?? []) as Array<{
      id: string;
      name: string;
      course_label: string;
      assignment_label: string;
      points_possible: number | null;
      rubric_text: string | null;
      lms: string;
      storage_path: string;
      size_bytes: number;
    }>).map((r) => ({
      id: r.id,
      name: r.name,
      courseLabel: r.course_label,
      assignmentLabel: r.assignment_label,
      pointsPossible: r.points_possible,
      rubricText: r.rubric_text,
      lms: r.lms,
      storagePath: r.storage_path,
      sizeBytes: r.size_bytes,
    }));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list cartridge drops." };
  }
}

/**
 * CAS status 'new' -> 'processing'; returns row + zip base64 downloaded from storage.
 * Enforces 8MB size cap on base64-safe encoding.
 * Used by the grade-cartridge-submissions step before grading.
 */
export async function takeCartridgeDropAction(id: string): Promise<{
  id: string;
  courseLabel: string;
  assignmentLabel: string;
  pointsPossible: number | null;
  rubricText: string | null;
  lms: string;
  zipBase64: string;
} | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    // CAS update: status='new' -> 'processing'
    const { data: rows, error: updateError } = await (supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("cartridge_drops") as any)
      .update({ status: "processing" })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("status", "new")
      .select("id, course_label, assignment_label, points_possible, rubric_text, lms, storage_path, size_bytes")
      .single();

    if (updateError || !rows) {
      return { error: updateError?.message || "Drop not found or already processing." };
    }

    // Download from storage
    const { data: blob, error: downloadError } = await supabase.storage
      .from("cartridge-drops")
      .download(rows.storage_path);

    if (downloadError || !blob) {
      return { error: downloadError?.message || "Could not download the cartridge." };
    }

    // Convert to base64
    const arrayBuffer = await blob.arrayBuffer();
    const zipBase64 = Buffer.from(arrayBuffer).toString("base64");

    // Size cap check (8MB base64-safe)
    const MAX_BASE64_SIZE = 8_000_000;
    if (zipBase64.length > MAX_BASE64_SIZE) {
      return { error: "The cartridge is too large to grade (exceeds 8 MB)." };
    }

    return {
      id: rows.id,
      courseLabel: rows.course_label,
      assignmentLabel: rows.assignment_label,
      pointsPossible: rows.points_possible,
      rubricText: rows.rubric_text,
      lms: rows.lms,
      zipBase64,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not take the cartridge drop." };
  }
}

/**
 * Mark a cartridge drop as graded (with CSV) or error.
 * Uploads CSV to storage at ${userId}/${id}-grades.csv.
 * Sets csv_storage_path, csv_name, graded_at, and status.
 * Used by the grade-cartridge-submissions step after grading.
 */
export async function finishCartridgeDropAction(
  id: string,
  outcome:
    | { status: "graded"; csvName: string; csvBase64: string }
    | { status: "error"; error: string }
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    if (outcome.status === "error") {
      const { error } = await (supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("cartridge_drops") as any)
        .update({
          status: "error",
          error: outcome.error,
        })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        return { error: error.message };
      }
      return { ok: true };
    }

    // Graded: upload CSV to storage
    const csvPath = `${user.id}/${id}-grades.csv`;
    const csvBlob = new Blob([Buffer.from(outcome.csvBase64, "base64")], {
      type: "text/csv",
    });

    const { error: uploadError } = await supabase.storage
      .from("cartridge-drops")
      .upload(csvPath, csvBlob, { contentType: "text/csv", upsert: true });

    if (uploadError) {
      return { error: uploadError.message };
    }

    // Update row with CSV metadata and status='graded'
    const { error: updateError } = await (supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("cartridge_drops") as any)
      .update({
        status: "graded",
        csv_storage_path: csvPath,
        csv_name: outcome.csvName,
        graded_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) {
      return { error: updateError.message };
    }

    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not finish the cartridge drop." };
  }
}

/** Count of the owner's PENDING message drafts. */
export async function countPendingMessageDrafts(): Promise<{ count: number }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("message_drafts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending");
    return { count: count ?? 0 };
  } catch {
    return { count: 0 };
  }
}

/** Count of the owner's PENDING presentation drafts. */
export async function countPendingPresentationDrafts(): Promise<{ count: number }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("presentation_drafts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending");
    return { count: count ?? 0 };
  } catch {
    return { count: 0 };
  }
}

/** Count workflow deliverable files saved since a given ISO timestamp. */
export async function countWorkflowDeliverablesSince(sinceIso: string): Promise<{ count: number }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("recording_files")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("origin", "unattended")
      .gt("created_at", sinceIso);

    return { count: count ?? 0 };
  } catch {
    return { count: 0 };
  }
}

/** Count of the owner's PENDING grading drafts (total, not since a time) -
 * powers the Drafts nav-tab badge. Defensive: any failure returns 0. */
export async function countPendingGradingDrafts(): Promise<{ count: number }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("grading_drafts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending");
    return { count: count ?? 0 };
  } catch {
    return { count: 0 };
  }
}
