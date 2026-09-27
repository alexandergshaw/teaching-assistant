"use client";

import { useRef } from "react";
import { Button } from "@mui/material";
import { DECK_PRESETS, isPresetDeckId } from "@/lib/decks/presets";
import type { DeckTemplate } from "@/lib/decks/types";
import type { DeckTemplateFileMeta } from "@/app/actions/deck-template-files";

interface TemplateSelectorProps {
  custom: DeckTemplate[];
  selectedId: string;
  onSelectId: (id: string) => void;
  onNewTemplate: () => void;
  onDeleteTemplate: (id: string) => void;
  onDuplicateTemplate: (template: DeckTemplate) => void;
  deleteConfirm: string | null;
  loadError: string | null;
  /**
   * A43-T (docs/a43-scope.md section 11.3): the owner's uploaded .pptx
   * templates - a second, independent selection from the structural
   * DeckTemplate list above. Selecting one of these does not change
   * `selectedId`; index.tsx (the caller) tracks it separately
   * (ta-ppt-template-file-id) and routes generation to the file-backed
   * writer instead of buildSlidesPptx when it is set.
   */
  templateFiles: DeckTemplateFileMeta[];
  selectedFileId: string;
  onSelectFileId: (id: string) => void;
  onUploadTemplateFile: (file: File) => void;
  onDeleteTemplateFile: (id: string) => void;
  fileUploadBusy: boolean;
  fileError: string | null;
  fileDeleteConfirm: string | null;
}

export default function TemplateSelector({
  custom,
  selectedId,
  onSelectId,
  onNewTemplate,
  onDeleteTemplate,
  onDuplicateTemplate,
  deleteConfirm,
  loadError,
  templateFiles,
  selectedFileId,
  onSelectFileId,
  onUploadTemplateFile,
  onDeleteTemplateFile,
  fileUploadBusy,
  fileError,
  fileDeleteConfirm,
}: TemplateSelectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selected = [...DECK_PRESETS, ...custom].find((t) => t.id === selectedId);

  const cardStyle = (isSelected: boolean): React.CSSProperties => ({
    padding: "var(--space-3)",
    marginBottom: "var(--space-2)",
    cursor: "pointer",
    borderRadius: "var(--radius-xs)",
    border: isSelected ? "1px solid var(--card-border)" : "1px solid var(--field-border)",
    boxShadow: isSelected ? "inset 0 0 0 2px var(--accent)" : "none",
    backgroundColor: isSelected ? "var(--accent-soft)" : "transparent",
    color: "inherit",
    transition: "border-color var(--transition-fast), box-shadow var(--transition-fast)",
  });

  return (
    <div style={{ flex: "0 0 280px" }}>
      <div style={{ marginBottom: "var(--space-4)" }}>
        <h3
          style={{
            marginTop: 0,
            marginBottom: "var(--space-2)",
            fontSize: "var(--font-size-2xs)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-secondary)",
          }}
        >
          Presets
        </h3>
        {DECK_PRESETS.map((t) => (
          <div
            key={t.id}
            onClick={() => onSelectId(t.id)}
            style={cardStyle(selectedId === t.id)}
          >
            <div style={{ fontWeight: 500, fontSize: "var(--font-size-md)" }}>{t.name}</div>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
              {t.slides.length} slides
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3
          style={{
            marginTop: 0,
            marginBottom: "var(--space-2)",
            fontSize: "var(--font-size-2xs)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-secondary)",
          }}
        >
          Your templates
        </h3>
        {custom.length === 0 ? (
          <div style={{ fontSize: "var(--font-size-md)", color: "var(--text-muted)", marginBottom: "var(--space-4)", textAlign: "center", padding: "var(--space-4) 0" }}>
            No custom templates yet.
          </div>
        ) : (
          custom.map((t) => (
            <div
              key={t.id}
              onClick={() => onSelectId(t.id)}
              style={cardStyle(selectedId === t.id)}
            >
              <div style={{ fontWeight: 500, fontSize: "var(--font-size-md)" }}>{t.name}</div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                {t.slides.length} slides
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <Button
          variant="contained"
          size="small"
          onClick={onNewTemplate}
          sx={{ textTransform: "none" }}
        >
          New template
        </Button>
        {selected && !isPresetDeckId(selected.id) && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => onDeleteTemplate(selected.id)}
            sx={{ textTransform: "none", color: deleteConfirm === selected.id ? "var(--danger)" : "inherit" }}
          >
            {deleteConfirm === selected.id ? "Confirm delete" : "Delete"}
          </Button>
        )}
        {selected && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => onDuplicateTemplate(selected)}
            sx={{ textTransform: "none" }}
          >
            Duplicate
          </Button>
        )}
      </div>

      {loadError && (
        <div
          style={{
            marginTop: "var(--space-4)",
            padding: "var(--space-3)",
            backgroundColor: "var(--danger-surface)",
            border: "1px solid var(--danger-border)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--font-size-sm)",
            color: "var(--danger)",
          }}
        >
          {loadError}
        </div>
      )}

      <div style={{ marginTop: "var(--space-6)" }}>
        <h3
          style={{
            marginTop: 0,
            marginBottom: "var(--space-2)",
            fontSize: "var(--font-size-2xs)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-secondary)",
          }}
        >
          Your PowerPoint templates
        </h3>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginBottom: "var(--space-2)" }}>
          Upload your own .pptx. Generated content is written into its existing slides and formatting -
          nothing else in the file changes.
        </div>
        {templateFiles.length === 0 ? (
          <div style={{ fontSize: "var(--font-size-md)", color: "var(--text-muted)", marginBottom: "var(--space-2)", textAlign: "center", padding: "var(--space-4) 0" }}>
            No uploaded templates yet.
          </div>
        ) : (
          templateFiles.map((t) => (
            <div key={t.id} onClick={() => onSelectFileId(t.id)} style={cardStyle(selectedFileId === t.id)}>
              <div style={{ fontWeight: 500, fontSize: "var(--font-size-md)" }}>{t.name}</div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>{t.fileName}</div>
            </div>
          ))
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUploadTemplateFile(file);
            e.target.value = "";
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <Button
            variant="outlined"
            size="small"
            disabled={fileUploadBusy}
            onClick={() => fileInputRef.current?.click()}
            sx={{ textTransform: "none" }}
          >
            {fileUploadBusy ? "Uploading..." : "Upload .pptx template"}
          </Button>
          {selectedFileId && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => onDeleteTemplateFile(selectedFileId)}
              sx={{ textTransform: "none", color: fileDeleteConfirm === selectedFileId ? "var(--danger)" : "inherit" }}
            >
              {fileDeleteConfirm === selectedFileId ? "Confirm delete" : "Remove uploaded template"}
            </Button>
          )}
          {selectedFileId && (
            <Button variant="text" size="small" onClick={() => onSelectFileId("")} sx={{ textTransform: "none" }}>
              Use the deck&apos;s own design instead
            </Button>
          )}
        </div>
        {fileError && (
          <div
            style={{
              marginTop: "var(--space-2)",
              padding: "var(--space-3)",
              backgroundColor: "var(--danger-surface)",
              border: "1px solid var(--danger-border)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-sm)",
              color: "var(--danger)",
            }}
          >
            {fileError}
          </div>
        )}
      </div>
    </div>
  );
}
