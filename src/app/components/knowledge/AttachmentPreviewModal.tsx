"use client";

// Preview window for a knowledge-base page's attachments (wired from
// AttachmentsPanel.tsx's "Preview" button). Fetches the same signed URL
// AttachmentsPanel.handleDownload already fetches for Download, and renders
// it according to attachmentPreviewMode's decision (image/pdf/text/
// unsupported - see src/lib/institution-page-attachments.ts for that
// contract).
//
// Deliberately a SIBLING of FilePreviewModal.tsx, not a reuse of it:
// FilePreviewModal is wired to grading (a `student` field,
// runSubmissionCodeAction, a RUNNABLE_EXTENSIONS code runner) that has no
// business in the knowledge base, and pulling it in would drag the code
// runner along for no reason.
//
// Adopts ModalShell (docs/modal-dismissal-focus-acceptance-criteria.md, wave
// C5) rather than hand-rolling the previewBackdrop/previewModal wrapper and
// its own Escape/initial-focus effects. This used to be the one preview
// modal in the app that managed its own focus, and it refused a trap on the
// stated grounds that "FilePreviewModal/CsvPreviewModal/etc. never trapped
// focus either" - waves 2 to 4 (commit f16c7aa and after) gave every one of
// those a trap, so that premise no longer holds. Adopting here is following
// that same reasoning to where it now points, not reversing it.
//
// `restoreFocusRef` threads AttachmentsPanel's own `previewTriggerRef`
// through to ModalShell, so this is also the first site in the app where
// AC4's focus-restoration half ships through the SHARED mechanism rather
// than a caller's own bespoke code - see AttachmentsPanel.tsx's
// `closePreview`, which used to do this restore itself and no longer does,
// to avoid two mechanisms restoring focus to the same element.
//
// Still reads the previewHeader/previewCloseButton/... class vocabulary
// directly from src/app/page.module.css (imported READ-ONLY - that file is
// owned by a concurrent change, per this feature's file-ownership rules);
// only previewBackdrop/previewModal themselves moved into ModalShell, which
// renders exactly that pair so this preview window keeps looking identical
// to the app's other preview modals (CsvPreviewModal, FilePreviewModal,
// ...) rather than inventing a fourth visual language for the same idea.

import { useEffect, useState, type RefObject } from "react";
import { getInstitutionPageAttachmentUrlAction } from "../../actions";
import {
  attachmentPreviewMode,
  attachmentFileExtension,
  formatByteSize,
  type InstitutionPageAttachment,
} from "@/lib/institution-page-attachments";
import { ModalShell } from "../ui/ModalShell";
import styles from "../../page.module.css";
import kbStyles from "../KnowledgeTab.module.css";

/**
 * Cap on how many characters of a text attachment get rendered into the
 * <pre>. Attachments can be up to MAX_ATTACHMENT_SIZE_BYTES (6 MB - see
 * institution-page-attachments.ts), and a 6 MB string in a single <pre>
 * makes the preview window slow to open and janky to scroll. Only the
 * RENDERED text is capped here - the fetched response is the real file end
 * to end, so Download (both the row's and this modal's) always gets the
 * whole thing, never a truncated copy.
 */
const TEXT_PREVIEW_CHAR_CAP = 200_000;

type FetchStatus = "loading" | "ready" | "error";

interface AttachmentPreviewModalProps {
  attachment: InstitutionPageAttachment;
  onClose: () => void;
  onDownload: () => void;
  downloading: boolean;
  /** The "Preview" button that opened this modal, captured by AttachmentsPanel
   * at click time (`previewTriggerRef`) and handed to ModalShell so focus
   * returns there on close - decision 9's exact precedent. Optional so a
   * future caller with no sensible opener to return to can omit it, matching
   * ModalShell's own `restoreFocusRef` prop. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
}

/** Human-readable label for the unsupported-file notice - prefers the
 * extension (`".docx" files`) since that is what an instructor recognizes at
 * a glance; falls back to the mime type, then a generic "This file" when
 * neither is usable. Mirrors attachmentPreviewMode's own mime-then-extension
 * precedence, just for display rather than for a routing decision. */
function describeUnsupportedFile(attachment: InstitutionPageAttachment): string {
  const extension = attachmentFileExtension(attachment.fileName);
  if (extension) return `".${extension}" files`;
  const mime = attachment.mimeType.split(";")[0]?.trim();
  if (mime) return `"${mime}" files`;
  return "This file";
}

export default function AttachmentPreviewModal({
  attachment,
  onClose,
  onDownload,
  downloading,
  restoreFocusRef,
}: AttachmentPreviewModalProps) {
  const mode = attachmentPreviewMode(attachment.mimeType, attachment.fileName);
  const needsFetch = mode !== "unsupported";

  const [status, setStatus] = useState<FetchStatus>(needsFetch ? "loading" : "ready");
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState("");
  const [textTruncated, setTextTruncated] = useState(false);

  // Fetch and render the attachment's bytes, matching
  // AttachmentsPanel.handleDownload's exact fetch-to-blob pattern. Skipped
  // entirely for "unsupported" - there is nothing to render, so fetching up
  // to 6 MB just to throw it away would be pure waste; the honest message
  // below needs only the file name/mime type, which are already props.
  // Every setState below happens after an `await`, never synchronously in
  // the effect body - the set-state-in-effect idiom (see AGENTS.md /
  // AiChatFab.tsx's tone-status effect for the same shape).
  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    let createdObjectUrl: string | null = null;

    (async () => {
      await Promise.resolve();
      try {
        const result = await getInstitutionPageAttachmentUrlAction(attachment.id);
        if (cancelled) return;
        if ("error" in result) {
          setError(result.error);
          setStatus("error");
          return;
        }

        const response = await fetch(result.url);
        if (cancelled) return;
        if (!response.ok) {
          setError(`Could not load "${attachment.fileName}".`);
          setStatus("error");
          return;
        }

        if (mode === "text") {
          const fullText = await response.text();
          if (cancelled) return;
          setTextTruncated(fullText.length > TEXT_PREVIEW_CHAR_CAP);
          setTextContent(fullText.slice(0, TEXT_PREVIEW_CHAR_CAP));
        } else {
          const blob = await response.blob();
          if (cancelled) return;
          createdObjectUrl = URL.createObjectURL(blob);
          setObjectUrl(createdObjectUrl);
        }
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : `Could not load "${attachment.fileName}".`);
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      // Revoke on every cleanup - covers both an attachment change under a
      // still-mounted instance and, most importantly, the modal closing
      // (AttachmentsPanel unmounts this component on close), matching
      // handleDownload's own revoke-after-use. An object URL left
      // un-revoked keeps its backing blob alive for the rest of the tab's
      // life; previewing a dozen attachments in one session would otherwise
      // leak a dozen multi-megabyte blobs.
      if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
    };
  }, [attachment.id, attachment.fileName, mode, needsFetch]);

  // Initial focus, the Escape listener, and the focus trap are all
  // ModalShell's job now (docs/modal-dismissal-focus-acceptance-criteria.md
  // decision 7, AC2, AC3) - see this file's header comment for why the two
  // effects that used to live here were removed rather than kept alongside
  // it. Returning focus to the triggering "Preview" button on close is
  // threaded through as `restoreFocusRef`, captured by AttachmentsPanel at
  // click time (`previewTriggerRef`, `event.currentTarget`) rather than
  // guessed from `document.activeElement` here - a button click does not
  // reliably move focus in every browser (Safari notably does not focus
  // buttons on click by default), which is exactly decision 9's reasoning.

  return (
    <ModalShell label={`Preview of ${attachment.fileName}`} onDismiss={onClose} restoreFocusRef={restoreFocusRef}>
      <div className={styles.previewHeader}>
        <div>
          <h3>{attachment.fileName}</h3>
          <p className={styles.previewMeta}>{formatByteSize(attachment.sizeBytes)}</p>
        </div>
        <div className={kbStyles.attachmentPreviewActions}>
          <button type="button" className={styles.previewCloseButton} onClick={onDownload} disabled={downloading}>
            {downloading ? "Downloading..." : "Download"}
          </button>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {mode === "unsupported" ? (
        <p className={kbStyles.attachmentPreviewUnsupported}>
          {describeUnsupportedFile(attachment)} cannot be shown in a preview here. Use Download above to open it in
          another application.
        </p>
      ) : status === "loading" ? (
        <p className={styles.previewMeta} role="status" aria-live="polite">Loading preview...</p>
      ) : status === "error" ? (
        <p className={styles.error}>{error}</p>
      ) : mode === "image" && objectUrl ? (
        <div className={styles.previewImageWrap}>
          {/* Plain img: the source is a client-side blob/object URL, which
              next/image cannot fetch or optimize (same reasoning as
              FilePreviewModal.tsx). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={objectUrl} alt={`Preview of ${attachment.fileName}`} className={styles.previewImage} />
        </div>
      ) : mode === "pdf" && objectUrl ? (
        <iframe src={objectUrl} className={styles.previewIframe} title={`Preview of ${attachment.fileName}`} />
      ) : mode === "text" ? (
        <>
          {textTruncated && (
            <p className={styles.previewNotice}>
              Showing only the first {TEXT_PREVIEW_CHAR_CAP.toLocaleString()} characters - this file is larger than
              that. Download to see the rest.
            </p>
          )}
          <pre className={styles.previewContent}>{textContent}</pre>
        </>
      ) : null}
    </ModalShell>
  );
}
