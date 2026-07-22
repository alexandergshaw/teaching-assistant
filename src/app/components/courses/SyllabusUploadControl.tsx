"use client";

import { useRef, useState } from "react";
import { uploadSyllabusAction } from "@/app/actions";
import { readFileBase64 } from "@/lib/courses-tab-helpers";

interface SyllabusUploadControlProps {
  courseId: string;
  onUploaded: (syllabusId: string, name: string) => void;
}

export function SyllabusUploadControl({
  courseId,
  onUploaded,
}: SyllabusUploadControlProps): React.ReactNode {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    setError(null);
    setBusy(true);

    try {
      const base64 = await readFileBase64(file);
      const result = await uploadSyllabusAction(courseId, {
        name: file.name,
        base64,
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
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        style={{
          padding: "8px 12px",
          backgroundColor: "var(--accent)",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: busy ? "not-allowed" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Uploading..." : "Upload Syllabus"}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.pdf,.txt,.md"
        onChange={handleFileChange}
        disabled={busy}
        style={{ display: "none" }}
      />
      {error && (
        <div
          style={{
            color: "var(--danger)",
            fontSize: "14px",
            lineHeight: "1.5",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
