"use client";

// Attach/embed UI for one knowledge-base page (AC1/AC2/AC4/AC5 of the
// attach/embed feature). Pure persistence, cap enforcement and Storage
// cleanup already live in src/lib/institution-page-attachments.ts and
// src/app/actions/institution-page-attachments.ts (wave 1) - this component
// is only the list/upload/remove/insert UI wired to those actions, mirroring
// SyllabusUploadControl.tsx's upload shape (readFileBase64 -> { name,
// base64, mimeType }) and FileRow.tsx's two-click "Remove" confirm.
//
// "Insert" (embed) only appears while the page body is being edited - it
// writes an attachment://<id> reference into the draft body via the
// onInsert callback (see KnowledgeTab.tsx's insertAttachmentEmbed), which is
// the only thing that can actually place text into the textarea this
// component does not own.

import { useRef, useState } from "react";
import Button from "@mui/material/Button";
import {
  uploadInstitutionPageAttachmentAction,
  deleteInstitutionPageAttachmentAction,
  getInstitutionPageAttachmentUrlAction,
} from "../../actions";
import {
  exceedsAttachmentSizeCap,
  attachmentSizeCapMessage,
  attachmentCountCapMessage,
  formatByteSize,
  MAX_ATTACHMENTS_PER_PAGE,
  type InstitutionPageAttachment,
} from "@/lib/institution-page-attachments";
import { readFileBase64 } from "@/lib/courses-tab-helpers";
import styles from "../../page.module.css";
import kbStyles from "../KnowledgeTab.module.css";

interface AttachmentsPanelProps {
  pageId: string;
  /** null while the initial list is still loading. */
  attachments: InstitutionPageAttachment[] | null;
  loadError: string | null;
  onAttachmentsChange: (next: InstitutionPageAttachment[]) => void;
  open: boolean;
  onToggleOpen: () => void;
  /** Gates the "Insert" button - embedding writes into the draft body, which
   * only exists while the page is being edited. */
  editing: boolean;
  onInsert: (attachment: InstitutionPageAttachment) => void;
}

export default function AttachmentsPanel({
  pageId,
  attachments,
  loadError,
  onAttachmentsChange,
  open,
  onToggleOpen,
  editing,
  onInsert,
}: AttachmentsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const count = attachments?.length ?? 0;
  const atCap = count >= MAX_ATTACHMENTS_PER_PAGE;

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setActionError(null);
    setUploading(true);

    let working = attachments ?? [];
    for (const file of Array.from(fileList)) {
      if (working.length >= MAX_ATTACHMENTS_PER_PAGE) {
        setActionError(attachmentCountCapMessage());
        break;
      }
      if (exceedsAttachmentSizeCap(file.size)) {
        setActionError(attachmentSizeCapMessage(file.name, file.size));
        continue;
      }
      try {
        const base64 = await readFileBase64(file);
        const result = await uploadInstitutionPageAttachmentAction(pageId, {
          name: file.name,
          base64,
          mimeType: file.type || "application/octet-stream",
        });
        if ("error" in result) {
          setActionError(result.error);
          continue;
        }
        working = [...working, result.attachment];
        onAttachmentsChange(working);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : `Could not upload "${file.name}".`);
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownload = async (attachment: InstitutionPageAttachment) => {
    setActionError(null);
    setDownloadingId(attachment.id);
    try {
      const result = await getInstitutionPageAttachmentUrlAction(attachment.id);
      if ("error" in result) {
        setActionError(result.error);
        return;
      }
      const response = await fetch(result.url);
      if (!response.ok) {
        setActionError(`Could not download "${attachment.fileName}".`);
        return;
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = attachment.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Could not download "${attachment.fileName}".`);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleRemoveClick = (attachment: InstitutionPageAttachment) => {
    if (confirmRemoveId !== attachment.id) {
      setConfirmRemoveId(attachment.id);
      return;
    }
    void doRemove(attachment);
  };

  const doRemove = async (attachment: InstitutionPageAttachment) => {
    setActionError(null);
    setConfirmRemoveId(null);
    setRemovingId(attachment.id);
    const result = await deleteInstitutionPageAttachmentAction(attachment.id);
    setRemovingId(null);
    if ("error" in result) {
      setActionError(result.error);
      return;
    }
    onAttachmentsChange((attachments ?? []).filter((a) => a.id !== attachment.id));
  };

  return (
    <div className={kbStyles.attachmentsPanel}>
      <button
        type="button"
        className={kbStyles.attachmentsToggle}
        aria-expanded={open}
        onClick={onToggleOpen}
      >
        <span className={open ? kbStyles.attachmentsChevronOpen : kbStyles.attachmentsChevron} aria-hidden="true" />
        Attachments {attachments !== null ? `(${count})` : ""}
      </button>

      {open && (
        <div className={kbStyles.attachmentsBody}>
          <div className={kbStyles.attachmentsUploadRow}>
            <Button
              size="small"
              variant="outlined"
              disabled={uploading || atCap}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Uploading..." : "Attach files"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => void handleFiles(e.currentTarget.files)}
              disabled={uploading || atCap}
              style={{ display: "none" }}
            />
            <span className={styles.fieldHint} style={{ margin: 0 }}>
              Any file type, up to 6 MB each, {MAX_ATTACHMENTS_PER_PAGE} per page.
            </span>
          </div>

          {atCap && (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              {attachmentCountCapMessage()}
            </p>
          )}
          {loadError && <p className={styles.error}>{loadError}</p>}
          {actionError && <p className={styles.error}>{actionError}</p>}

          {attachments === null ? (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              Loading attachments...
            </p>
          ) : attachments.length === 0 ? (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              No files attached yet.
            </p>
          ) : (
            <ul className={kbStyles.attachmentsList}>
              {attachments.map((attachment) => (
                <li key={attachment.id} className={kbStyles.attachmentRow}>
                  <div className={kbStyles.attachmentInfo}>
                    <span className={kbStyles.attachmentName} title={attachment.fileName}>
                      {attachment.fileName}
                    </span>
                    <span className={kbStyles.attachmentMeta}>{formatByteSize(attachment.sizeBytes)}</span>
                  </div>
                  <div className={kbStyles.attachmentActions}>
                    {editing && (
                      <Button size="small" onClick={() => onInsert(attachment)}>
                        Insert
                      </Button>
                    )}
                    <Button
                      size="small"
                      onClick={() => void handleDownload(attachment)}
                      disabled={downloadingId === attachment.id}
                    >
                      {downloadingId === attachment.id ? "Downloading..." : "Download"}
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => handleRemoveClick(attachment)}
                      disabled={removingId === attachment.id}
                    >
                      {removingId === attachment.id
                        ? "Removing..."
                        : confirmRemoveId === attachment.id
                          ? "Confirm"
                          : "Remove"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
