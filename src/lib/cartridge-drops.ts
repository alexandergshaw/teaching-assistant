// Client-side persistence for cartridge drops; browser talks to Supabase
// Storage directly for upload, server actions for grading and CSV retrieval.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

export interface CartridgeDrop {
  id: string;
  name: string;
  courseLabel: string;
  assignmentLabel: string;
  pointsPossible: number | null;
  rubricText: string | null;
  lms: "canvas" | "brightspace" | "blackboard" | "moodle";
  status: "new" | "processing" | "graded" | "error";
  error: string | null;
  storagePath: string;
  csvStoragePath: string | null;
  csvName: string | null;
  sizeBytes: number;
  gradedAt: string | null;
  createdAt: string;
}

export async function saveCartridgeDrop(
  supabase: SupabaseClient<Database>,
  userId: string,
  file: File,
  meta: {
    courseLabel: string;
    assignmentLabel: string;
    pointsPossible: number | null;
    rubricText: string | null;
    lms: "canvas" | "brightspace" | "blackboard" | "moodle";
  }
): Promise<CartridgeDrop> {
  const id = crypto.randomUUID();
  const path = `${userId}/${id}.zip`;

  const { error: uploadError } = await supabase.storage
    .from("cartridge-drops")
    .upload(path, file, { contentType: "application/zip", upsert: false });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data: row, error: insertError } = await (supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("cartridge_drops") as any)
    .insert({
      id,
      user_id: userId,
      name: file.name,
      course_label: meta.courseLabel,
      assignment_label: meta.assignmentLabel,
      points_possible: meta.pointsPossible,
      rubric_text: meta.rubricText,
      lms: meta.lms,
      status: "new",
      storage_path: path,
      size_bytes: file.size,
    })
    .select()
    .single();

  if (insertError) {
    // Best effort: attempt to remove the uploaded object
    await supabase.storage.from("cartridge-drops").remove([path]).catch(() => {});
    throw new Error(insertError.message);
  }

  return mapCartridgeDrop(row);
}

export async function listCartridgeDrops(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<CartridgeDrop[]> {
  const { data: rows, error } = await supabase
    .from("cartridge_drops")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (rows || []).map(mapCartridgeDrop);
}

export async function deleteCartridgeDrop(
  supabase: SupabaseClient<Database>,
  drop: CartridgeDrop
): Promise<void> {
  // Remove storage object first (ignore "not found" style errors)
  await supabase.storage
    .from("cartridge-drops")
    .remove([drop.storagePath])
    .catch(() => {});

  // Delete row
  const { error } = await supabase.from("cartridge_drops").delete().eq("id", drop.id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getCartridgeDropCsvUrl(
  supabase: SupabaseClient<Database>,
  drop: CartridgeDrop,
  expiresInSeconds = 3600
): Promise<string> {
  if (!drop.csvStoragePath) {
    throw new Error("No CSV available for this drop.");
  }

  const { data, error } = await supabase.storage
    .from("cartridge-drops")
    .createSignedUrl(drop.csvStoragePath, expiresInSeconds);

  if (error) {
    throw new Error(error.message);
  }

  return data.signedUrl;
}

function mapCartridgeDrop(row: Database["public"]["Tables"]["cartridge_drops"]["Row"]): CartridgeDrop {
  return {
    id: row.id,
    name: row.name,
    courseLabel: row.course_label,
    assignmentLabel: row.assignment_label,
    pointsPossible: row.points_possible,
    rubricText: row.rubric_text,
    lms: row.lms,
    status: row.status,
    error: row.error,
    storagePath: row.storage_path,
    csvStoragePath: row.csv_storage_path,
    csvName: row.csv_name,
    sizeBytes: row.size_bytes,
    gradedAt: row.graded_at,
    createdAt: row.created_at,
  };
}
