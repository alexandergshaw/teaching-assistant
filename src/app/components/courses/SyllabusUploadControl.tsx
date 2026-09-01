"use client";

import { useRef, useState } from "react";
import { uploadSyllabusAction } from "@/app/actions";
import { useSupabase } from "@/context/SupabaseProvider";
import { validateFileUpload } from "@/lib/syllabus-upload-validation";
import { SYLLABUS_UPLOAD_BUCKET, syllabusUploadStoragePath } from "@/lib/syllabus-upload-source";
import tableStyles from "./CoursesTable.module.css";

interface SyllabusUploadControlProps {
  courseId: string;
  onUploaded: (syllabusId: string, name: string) => void;
}

export function SyllabusUploadControl({
  courseId,
  onUploaded,
}: SyllabusUploadControlProps): React.ReactNode {
  const { supabase, user } = useSupabase();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    setError(null);

    // AC2 item 12 (docs/upload-body-limit-acceptance-criteria.md): the size
    // (now 25 MB) and extension gate runs HERE, before a single byte is
    // uploaded - validateFileUpload is the exact same pure check the server
    // runs again after downloading (uploadSyllabusAction), so the two gates
    // can never disagree on what they accept.
    const validation = validateFileUpload(file.name, file.type, file.size);
    if (!validation.valid) {
      setError(validation.error);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (!user) {
      setError("You must be signed in to upload a syllabus.");
      return;
    }

    setBusy(true);

    try {
      // Direct-to-Storage upload (AC2 item 7): no base64, no server-action
      // body - the file goes straight from the browser to the existing
      // private "course-files" bucket. The user id must be the storage
      // path's FIRST segment or the bucket's RLS
      // (supabase/migrations/20260722000000_course_materials.sql) refuses
      // the write. "syllabus-uploads" is this feature's own path segment,
      // distinguishing it from a course zip or a Tasks-cell attachment,
      // which share the same bucket.
      const uploadId = crypto.randomUUID();
      const storagePath = syllabusUploadStoragePath(user.id, uploadId, validation.extension);

      const { error: uploadError } = await supabase.storage
        .from(SYLLABUS_UPLOAD_BUCKET)
        .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });

      if (uploadError) {
        setError(`Could not upload "${file.name}" - try again`);
        return;
      }

      const result = await uploadSyllabusAction(courseId, {
        name: file.name,
        storagePath,
        mimeType: file.type,
      });

      if ("error" in result) {
        setError(result.error);
      } else {
        onUploaded(result.syllabusId, result.syllabusName);
        setError(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={tableStyles.stackSm}>
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        className={tableStyles.primaryButton}
      >
        {busy ? "Uploading…" : "Upload Syllabus"}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.pdf,.txt,.md"
        onChange={handleFileChange}
        disabled={busy}
        className={tableStyles.hiddenInput}
      />
      {error && (
        <div className={tableStyles.errorTextPlain}>
          {error}
        </div>
      )}
    </div>
  );
}
