"use client";

// Attachments panel state for the Knowledge tab (src/app/components/
// KnowledgeTab.tsx) - split out during the 1000-line-cap refactor. Owns the
// selected page's attachment list (attach/embed feature) and the panel's
// own open/closed persistence. Loaded independent of the edit session so
// the list, download, and remove controls in AttachmentsPanel.tsx work in
// view mode too.

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { listInstitutionPageAttachmentsAction } from "../../actions";
import type { InstitutionPageAttachment } from "@/lib/institution-page-attachments";
import { readAttachmentsPanelOpen, writeAttachmentsPanelOpen } from "./knowledge-helpers";

export interface UseKbAttachmentsReturn {
  /** null while the initial list for the selected page is still loading. */
  attachments: InstitutionPageAttachment[] | null;
  setAttachments: Dispatch<SetStateAction<InstitutionPageAttachment[] | null>>;
  attachmentsError: string | null;
  attachmentsOpen: boolean;
  toggleAttachmentsOpen: () => void;
}

export function useKbAttachments(selectedId: string | null): UseKbAttachmentsReturn {
  // ── Attachments (attach/embed feature) - loaded per selected page,
  //     independent of the edit session so the list, download and remove
  //     controls work in view mode too. ────────────────────────────────────
  const [attachments, setAttachments] = useState<InstitutionPageAttachment[] | null>(null);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [attachmentsOpen, setAttachmentsOpen] = useState<boolean>(() => readAttachmentsPanelOpen());

  // Reset attachments the instant the selected page changes (adjust state
  // during render, not an effect - AGENTS.md's set-state-in-effect idiom).
  // Resets to null (not []) so PageBody/AttachmentsPanel can tell "not
  // loaded yet" apart from "loaded, genuinely zero attachments" - see
  // PageBody.tsx's attachmentsLoaded prop.
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    setAttachments(null);
    setAttachmentsError(null);
  }

  // Load the selected page's attachments (AC1/AC2/AC3) - independent of the
  // page list load in useKbPageTree. The reset just above already cleared
  // state synchronously, so this effect does nothing before its first await
  // and never trips react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      const result = await listInstitutionPageAttachmentsAction(selectedId);
      if (cancelled) return;
      if ("error" in result) {
        setAttachmentsError(result.error);
        setAttachments([]);
        return;
      }
      setAttachmentsError(null);
      setAttachments(result.attachments);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Persist the attachments panel's open/closed state (AC3: new UI control
  // state must survive a reload) - plain side effect, no setState, so it is
  // unaffected by the set-state-in-effect idiom (mirrors WorkflowsTab.tsx's
  // ta-workflows-steps-open persistence).
  useEffect(() => {
    writeAttachmentsPanelOpen(attachmentsOpen);
  }, [attachmentsOpen]);

  return {
    attachments,
    setAttachments,
    attachmentsError,
    attachmentsOpen,
    toggleAttachmentsOpen: () => setAttachmentsOpen((prev) => !prev),
  };
}
