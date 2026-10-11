"use client";

// The messaging composer draft (subject + body), persisted to
// ta-live-messaging-draft. VIEW-LEVEL: it is read once on mount and is never
// keyed by institution, so an institution switch cannot clear it and a reload
// restores it. The selected students are NOT part of it.

import { useCallback, useEffect, useState } from "react";
import {
  EMPTY_MESSAGING_DRAFT,
  MESSAGING_DRAFT_KEY,
  parseDraft,
  serializeDraft,
  type MessagingDraft,
} from "@/lib/live-messaging/messaging-draft";

export function useMessagingDraft(): {
  draft: MessagingDraft;
  setDraft: (patch: Partial<MessagingDraft>) => void;
} {
  const [draft, setDraftState] = useState<MessagingDraft>(EMPTY_MESSAGING_DRAFT);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        setDraftState(parseDraft(localStorage.getItem(MESSAGING_DRAFT_KEY)));
      } catch {
        // Storage unavailable: the draft still works for this session.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setDraft = useCallback(
    (patch: Partial<MessagingDraft>) => {
      const next = { ...draft, ...patch };
      setDraftState(next);
      try {
        localStorage.setItem(MESSAGING_DRAFT_KEY, serializeDraft(next));
      } catch {
        // Storage unavailable: keep the in-memory draft.
      }
    },
    [draft]
  );

  return { draft, setDraft };
}
