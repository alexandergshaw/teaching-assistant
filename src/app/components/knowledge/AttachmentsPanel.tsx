"use client";

// Attach/embed UI for one knowledge-base page (AC1/AC2/AC4/AC5 of the
// attach/embed feature). Pure persistence, cap enforcement and Storage
// cleanup already live in src/lib/institution-page-attachments.ts and
// src/app/actions/institution-page-attachments.ts - this component is only
// the list/upload/remove/insert UI wired to those.
//
// Upload is direct-to-Storage: this component uploads with its own
// authenticated Supabase client (useSupabase()) straight into the existing
// private "institution-attachments" bucket via uploadInstitutionPageAttachment,
// then calls uploadInstitutionPageAttachmentAction with metadata only - the
// same transport TaskAttachmentsDialog.tsx uses for course_task_attachments
// and MiscFilesCell.tsx has always used for course misc files. Never
// readFileBase64 - a server action's request body is capped at 4.5 MB at
// the Vercel Functions platform layer, a limit no server-side setting can
// raise (see MAX_ATTACHMENT_SIZE_BYTES's own doc comment).
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
  uploadInstitutionPageAttachment,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_PAGE,
  INSTITUTION_ATTACHMENTS_BUCKET,
  type AttachmentStorageClient,
  type RecordInstitutionPageAttachmentRow,
  type InstitutionPageAttachment,
} from "@/lib/institution-page-attachments";
import { useSupabase } from "@/context/SupabaseProvider";
import AttachmentPreviewModal from "./AttachmentPreviewModal";
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
  const { supabase, user } = useSupabase();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  // The attachment currently shown in AttachmentPreviewModal, or null when
  // it is closed. previewTriggerRef holds the specific row's "Preview"
  // button that opened it (captured via event.currentTarget, not
  // document.activeElement - see AttachmentPreviewModal's header comment
  // for why). Passed straight through as AttachmentPreviewModal's
  // `restoreFocusRef` (which hands it to ModalShell/useModalDismiss) rather
  // than restored here directly - useModalDismiss captures this ref's
  // `.current` in a closure the moment the modal opens and restores from
  // that closure on close, so this component does not also need to call
  // `.focus()` itself; doing both would restore focus to the same button
  // twice (decision 9, docs/modal-dismissal-focus-acceptance-criteria.md).
  const [previewAttachment, setPreviewAttachment] = useState<InstitutionPageAttachment | null>(null);
  // Typed HTMLElement, not HTMLButtonElement, even though it only ever holds
  // a button: RefObject's `current` is mutable and therefore invariant (see
  // useModalDismiss.ts's own doc comment on the same trap), so a narrower
  // element type here would not assign to AttachmentPreviewModal's
  // `restoreFocusRef?: RefObject<HTMLElement | null>` prop without a cast.
  const previewTriggerRef = useRef<HTMLElement | null>(null);

  const count = attachments?.length ?? 0;
  const atCap = count >= MAX_ATTACHMENTS_PER_PAGE;

  // Adapter narrowing the real Storage bucket down to exactly the two calls
  // uploadInstitutionPageAttachment makes, matching its ordering/rollback
  // contract without re-implementing it - mirrors TaskAttachmentsDialog.tsx's
  // own storageAdapter for course-task-attachments.ts.
  const storageAdapter: AttachmentStorageClient = {
    async upload(path, file, options) {
      const { error } = await supabase.storage
        .from(INSTITUTION_ATTACHMENTS_BUCKET)
        .upload(path, file as Blob, { contentType: options?.contentType ?? undefined, upsert: options?.upsert });
      return { error };
    },
    async remove(paths) {
      const { error } = await supabase.storage.from(INSTITUTION_ATTACHMENTS_BUCKET).remove(paths);
      return { error };
    },
  };

  // Calls the server action AFTER this component has already uploaded the
  // object to Storage (see uploadInstitutionPageAttachment's own doc
  // comment for why the rollback-on-insert-failure lives there, in the
  // browser, rather than server-side).
  const recordRow: RecordInstitutionPageAttachmentRow = async (input) => {
    const result = await uploadInstitutionPageAttachmentAction(pageId, {
      id: input.id,
      name: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storagePath: input.storagePath,
    });
    if ("error" in result) return { ok: false, error: result.error };
    return { ok: true, attachment: result.attachment };
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setActionError(null);
    setUploading(true);

    if (!user) {
      setActionError("You must be signed in to upload files.");
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

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
        const result = await uploadInstitutionPageAttachment(storageAdapter, recordRow, {
          userId: user.id,
          pageId,
          attachmentId: crypto.randomUUID(),
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          file,
        });
        if (!result.ok) {
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

  const openPreview = (attachment: InstitutionPageAttachment, event: React.MouseEvent<HTMLButtonElement>) => {
    previewTriggerRef.current = event.currentTarget;
    setPreviewAttachment(attachment);
  };

  const closePreview = () => {
    setPreviewAttachment(null);
    // No restore call here - AttachmentPreviewModal's ModalShell already
    // restores focus to previewTriggerRef.current on unmount (see the ref's
    // own doc comment above). previewTriggerRef itself is left set, not
    // nulled: openPreview overwrites it on every subsequent open, and
    // useModalDismiss never re-reads `.current` at close time, only the
    // value it closed over when this modal opened.
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
              {uploading ? "Uploading…" : "Attach files"}
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
              Any file type, up to {formatByteSize(MAX_ATTACHMENT_SIZE_BYTES)} each, {MAX_ATTACHMENTS_PER_PAGE} per
              page.
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
              Loading attachments…
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
                    <Button size="small" onClick={(event) => openPreview(attachment, event)}>
                      Preview
                    </Button>
                    <Button
                      size="small"
                      onClick={() => void handleDownload(attachment)}
                      disabled={downloadingId === attachment.id}
                    >
                      {downloadingId === attachment.id ? "Downloading…" : "Download"}
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => handleRemoveClick(attachment)}
                      disabled={removingId === attachment.id}
                    >
                      {removingId === attachment.id
                        ? "Removing…"
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

      {previewAttachment && (
        <AttachmentPreviewModal
          attachment={previewAttachment}
          onClose={closePreview}
          onDownload={() => void handleDownload(previewAttachment)}
          downloading={downloadingId === previewAttachment.id}
          restoreFocusRef={previewTriggerRef}
        />
      )}
    </div>
  );
}
