"use client";

import styles from "../page.module.css";

export type PreviewFile = {
  student: string;
  name: string;
  extension: string;
  content: string;
  truncated: boolean;
  rawBase64?: string;
  mimeType?: string;
};

type FilePreviewModalProps = {
  selectedPreview: PreviewFile;
  previewBlobUrl: string | null;
  onClose: () => void;
};

export default function FilePreviewModal({
  selectedPreview,
  previewBlobUrl,
  onClose,
}: FilePreviewModalProps) {
  return (
    <div className={styles.previewBackdrop} onClick={onClose}>
      <section
        className={styles.previewModal}
        role="dialog"
        aria-modal="true"
        aria-label={`Preview for ${selectedPreview.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <div>
            <p className={styles.previewMeta}>Student: {selectedPreview.student}</p>
            <h3>{selectedPreview.name}</h3>
            <p className={styles.previewMeta}>Type: {selectedPreview.extension}</p>
          </div>
          <button
            type="button"
            className={styles.previewCloseButton}
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {previewBlobUrl && selectedPreview.mimeType === "application/pdf" ? (
          <iframe
            src={previewBlobUrl}
            className={styles.previewIframe}
            title={`Preview of ${selectedPreview.name}`}
          />
        ) : previewBlobUrl && selectedPreview.mimeType?.startsWith("image/") ? (
          <div className={styles.previewImageWrap}>
            <img
              src={previewBlobUrl}
              alt={`Preview of ${selectedPreview.name}`}
              className={styles.previewImage}
            />
          </div>
        ) : (
          <>
            {selectedPreview.truncated && (
              <p className={styles.previewNotice}>
                Showing a partial preview because the extracted file content is large.
              </p>
            )}
            <pre className={styles.previewContent}>{selectedPreview.content}</pre>
          </>
        )}
      </section>
    </div>
  );
}
