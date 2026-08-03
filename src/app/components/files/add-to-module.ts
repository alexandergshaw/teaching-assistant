// Download one library file and upload it into a Canvas module - pulled out
// of FilesTab.tsx's addOneToModule (kept that component under this project's
// 1000-line cap). Still has I/O side effects (storage download, Canvas
// upload), but no React state - a mechanical relocation, no behavior
// change. Throws on any failure; FilesTab.tsx's single-file and bulk add
// handlers each keep their own error handling around the call.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { downloadRecordingFile, extForFile, type RecordingFile } from "@/lib/recording-files";
import { requestFileUploadAction, createModuleItemAction } from "@/app/actions";

export async function addFileToModule(
  supabase: SupabaseClient<Database>,
  courseUrl: string,
  activeInstitution: string | null,
  file: RecordingFile,
  mId: number | string
): Promise<void> {
  // Download the file
  const blob = await downloadRecordingFile(supabase, file);

  // Prepare upload
  const fileName = `${file.name.replace(/[^a-z0-9 _-]/gi, "_")}.${extForFile(file)}`;
  const ticket = await requestFileUploadAction(
    courseUrl,
    {
      name: fileName,
      size: blob.size,
      contentType: file.mimeType,
      folderPath: "uploads",
    },
    activeInstitution || undefined
  );

  if ("error" in ticket) throw new Error(ticket.error);

  // Upload to Canvas
  const form = new FormData();
  for (const [k, v] of Object.entries(ticket.ticket.uploadParams)) {
    form.append(k, v);
  }
  form.append("file", blob, fileName);

  const up = await fetch(ticket.ticket.uploadUrl, {
    method: "POST",
    body: form,
  });

  if (!up.ok) {
    throw new Error(`Upload to Canvas failed (HTTP ${up.status}).`);
  }

  const uploaded = (await up.json().catch(() => null)) as { id?: number } | null;
  if (typeof uploaded?.id !== "number") {
    throw new Error("Canvas did not return the uploaded file id.");
  }

  // Add to module
  const result = await createModuleItemAction(
    courseUrl,
    Number(mId),
    { type: "File", contentId: uploaded.id, title: file.name },
    activeInstitution || undefined
  );

  if ("error" in result) throw new Error(result.error);
}
