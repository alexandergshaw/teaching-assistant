"use client";

import { useEffect, useState } from "react";

export type RecordingDraftSnapshot = { subject: string; body: string; courseId: string };
export function recordingDraftIsUnsaved(current: RecordingDraftSnapshot, saved: RecordingDraftSnapshot | null, posted: boolean): boolean {
  if (posted) return false;
  if (!saved && !current.subject.trim() && !current.body.trim()) return false;
  return !saved || current.subject !== saved.subject || current.body !== saved.body || current.courseId !== saved.courseId;
}

/** Compare with the exact snapshot acknowledged by the save operation. */
export function useRecordingDraftGuard({ subject, body, courseId, posted, savingDraft, posting, isPostingNow }: RecordingDraftSnapshot & { posted: boolean; savingDraft: boolean; posting: boolean; isPostingNow: () => boolean }) {
  const [saved, setSaved] = useState<RecordingDraftSnapshot | null>(null);
  const current = { subject, body, courseId };
  const dirty = recordingDraftIsUnsaved(current, saved, posted);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || savingDraft || posting || isPostingNow()) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, savingDraft, posting, isPostingNow]);
  return {
    captureSnapshot: (): RecordingDraftSnapshot => ({ subject, body, courseId }),
    markSaved: (snapshot: RecordingDraftSnapshot) => setSaved(snapshot),
    confirmLeave: (): boolean => {
      if (posting || isPostingNow()) { window.alert("Wait for posting to finish before leaving."); return false; }
      if (savingDraft) { window.alert("Wait for the draft to finish saving before leaving."); return false; }
      return !dirty || window.confirm("This announcement has unsaved changes. Leave without saving?");
    },
    dirty,
  };
}