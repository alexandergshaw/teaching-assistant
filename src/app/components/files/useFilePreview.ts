"use client";

// Focus restoration (docs/modal-focus-restoration-acceptance-criteria.md,
// wave R3 slice B/E) - the ownership decision, and what actually shipped.
// This hook is FilesTab.tsx's exclusive caller (grep across src finds no
// other `useFilePreview(` call site), so a preview-trigger ref COULD live
// HERE, keeping it with the open/close lifecycle this hook already owns.
//
// It does not. `openPreview` below never receives the click: the button
// that opens FilePreviewModal is FileRow.tsx's Preview button, and the
// capture (`e.currentTarget`) happens in THAT button's own onClick, which
// calls the required `onPreviewTrigger` prop - a sibling capture callback,
// the same convention `ModuleItemRow.tsx` uses for
// `onPreviewAssignmentTrigger` - BEFORE calling `onPreview(file)`, which is
// FilesTab.tsx's `handleFilePreview` and only THEN reaches this hook's
// `openPreview`. FilesTab.tsx supplies FileRow with a callback IDENTITY,
// not the capture itself: `handlePreviewTrigger`, one function shared by all
// three FileRow render sites so the ref-write isn't duplicated three times
// (wave R3 bug report finding 2), but it only receives an already-captured
// element and writes it to `previewTriggerRef` - it never reads
// `e.currentTarget` itself. Moving the ref in here would eliminate no call
// site (FileRow's onClick still has to call something with the element it
// captured) and would give this hook a DOM concern it currently has none of:
// it never touches an element, only file/blob state.
// FilesTab.tsx wires FilePreviewModal with both `restoreFocusRef`
// (previewTriggerRef) and `fallbackFocusRefs`; see that render site's own
// comment.
import { useState, useCallback } from "react";
import type { RecordingFile } from "@/lib/recording-files";
import { downloadRecordingFile, extForFile } from "@/lib/recording-files";
import { getPreviewStrategy } from "@/lib/file-preview";
import { extractDocxTextAction, extractPptxSlidesAction } from "../../actions/media";
import type { PreviewFile } from "../FilePreviewModal";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import JSZip from "jszip";

interface UseFilePreviewState {
  file: PreviewFile | null;
  blobUrl: string | null;
  loading: boolean;
  error: string | null;
}

interface UseFilePreviewActions {
  openPreview: (file: RecordingFile, supabase: SupabaseClient<Database>) => Promise<void>;
  closePreview: () => void;
}

export function useFilePreview(): UseFilePreviewState & UseFilePreviewActions {
  const [state, setState] = useState<UseFilePreviewState>({
    file: null,
    blobUrl: null,
    loading: false,
    error: null,
  });

  const closePreview = useCallback(() => {
    setState((prev) => {
      if (prev.blobUrl) {
        URL.revokeObjectURL(prev.blobUrl);
      }
      return { file: null, blobUrl: null, loading: false, error: null };
    });
  }, []);

  const openPreview = useCallback(
    async (file: RecordingFile, supabase: SupabaseClient<Database>) => {
      setState((prev) => {
        if (prev.blobUrl) {
          URL.revokeObjectURL(prev.blobUrl);
        }
        return { file: null, blobUrl: null, loading: true, error: null };
      });

      try {
        const blob = await downloadRecordingFile(supabase, file);
        const strategy = getPreviewStrategy(file.mimeType, extForFile(file));

        if (strategy === "media-play") {
          setState({
            file: {
              student: "",
              name: file.name,
              extension: extForFile(file),
              content: "Media files are played using the Play button.",
              truncated: false,
            },
            blobUrl: null,
            loading: false,
            error: "This file plays via the Play button, not inline preview.",
          });
          return;
        }

        if (strategy === "pdf" || strategy === "image") {
          const blobUrl = URL.createObjectURL(blob);
          setState({
            file: {
              student: "",
              name: file.name,
              extension: extForFile(file),
              content: "",
              truncated: false,
              mimeType: file.mimeType,
            },
            blobUrl,
            loading: false,
            error: null,
          });
          return;
        }

        if (strategy === "text") {
          const text = await blob.text();
          const cap = 200 * 1024; // 200 KB
          const truncated = text.length > cap;
          const content = truncated ? text.slice(0, cap) : text;

          setState({
            file: {
              student: "",
              name: file.name,
              extension: extForFile(file),
              content,
              truncated,
            },
            blobUrl: null,
            loading: false,
            error: null,
          });
          return;
        }

        if (strategy === "docx") {
          const base64 = await blobToBase64(blob);
          const result = await extractDocxTextAction(base64);

          if ("error" in result) {
            setState({
              file: {
                student: "",
                name: file.name,
                extension: "docx",
                content: `Error: ${result.error}`,
                truncated: false,
              },
              blobUrl: null,
              loading: false,
              error: result.error,
            });
            return;
          }

          setState({
            file: {
              student: "",
              name: file.name,
              extension: "docx",
              content: `Text extracted from docx for preview:\n\n${result.text}`,
              truncated: false,
            },
            blobUrl: null,
            loading: false,
            error: null,
          });
          return;
        }

        if (strategy === "pptx") {
          const base64 = await blobToBase64(blob);
          const result = await extractPptxSlidesAction(base64);

          if ("error" in result) {
            setState({
              file: {
                student: "",
                name: file.name,
                extension: "pptx",
                content: `Error: ${result.error}`,
                truncated: false,
              },
              blobUrl: null,
              loading: false,
              error: result.error,
            });
            return;
          }

          const text = result.slides
            .map((s) => `## ${s.title}\n\n${s.text}`)
            .join("\n\n");

          setState({
            file: {
              student: "",
              name: file.name,
              extension: "pptx",
              content: `Text extracted from pptx for preview:\n\n${text}`,
              truncated: false,
            },
            blobUrl: null,
            loading: false,
            error: null,
          });
          return;
        }

        if (strategy === "zip") {
          try {
            const zip = await JSZip.loadAsync(blob);
            // jszip's public typed API exposes no synchronous uncompressed-size accessor (only per-entry async reads), so the listing shows names + (dir) markers per the documented-deviation clause.
            const entries = Object.keys(zip.files).map((path) => {
              const entry = zip.files[path];
              if (entry.dir) {
                return `${entry.name} (dir)`;
              }
              return entry.name;
            }).join("\n");

            setState({
              file: {
                student: "",
                name: file.name,
                extension: "zip",
                content: `Archive contents:\n\n${entries || "(empty)"}`,
                truncated: false,
              },
              blobUrl: null,
              loading: false,
              error: null,
            });
            return;
          } catch {
            setState({
              file: {
                student: "",
                name: file.name,
                extension: "zip",
                content: "Could not read archive contents.",
                truncated: false,
              },
              blobUrl: null,
              loading: false,
              error: "Could not read archive contents.",
            });
            return;
          }
        }

        // strategy === "none"
        setState({
          file: {
            student: "",
            name: file.name,
            extension: extForFile(file),
            content: "No inline preview is available for this file type.",
            truncated: false,
          },
          blobUrl: null,
          loading: false,
          error: null,
        });
      } catch (err) {
        setState({
          file: {
            student: "",
            name: file.name,
            extension: extForFile(file),
            content: `Error loading file: ${err instanceof Error ? err.message : "Unknown error"}`,
            truncated: false,
          },
          blobUrl: null,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load file",
        });
      }
    },
    []
  );

  return {
    file: state.file,
    blobUrl: state.blobUrl,
    loading: state.loading,
    error: state.error,
    openPreview,
    closePreview,
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        const base64 = result.split(",")[1] || "";
        resolve(base64);
      } else {
        reject(new Error("Failed to read blob"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
