"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { registerRecordingRouteGuard } from "@/lib/recording-route-guard";

export type RecordingDraftSnapshot = { subject: string; body: string; courseId: string };
export function recordingDraftIsUnsaved(current: RecordingDraftSnapshot, saved: RecordingDraftSnapshot | null, posted: boolean, hasUnsavedSetup = false): boolean {
  if (posted) return false;
  if (hasUnsavedSetup) return true;
  if (!saved && !current.subject.trim() && !current.body.trim()) return false;
  return !saved || current.subject !== saved.subject || current.body !== saved.body || current.courseId !== saved.courseId;
}

/** The synchronous lock covers the interval before React publishes saving state. */
export function recordingSavePending(savingDraft: boolean, isSavingNow: () => boolean): boolean {
  return savingDraft || isSavingNow();
}

/** Compare with the exact snapshot acknowledged by the save operation. */
export function useRecordingDraftGuard({ subject, body, courseId, posted, savingDraft, posting, isPostingNow, isSavingNow, hasUnsavedSetup = false }: RecordingDraftSnapshot & { posted: boolean; savingDraft: boolean; posting: boolean; isPostingNow: () => boolean; isSavingNow: () => boolean; hasUnsavedSetup?: boolean }) {
  const [saved, setSaved] = useState<RecordingDraftSnapshot | null>(null);
  const current = { subject, body, courseId };
  const dirty = recordingDraftIsUnsaved(current, saved, posted, hasUnsavedSetup);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || recordingSavePending(savingDraft, isSavingNow) || posting || isPostingNow()) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, savingDraft, posting, isPostingNow, isSavingNow]);
  useLayoutEffect(() => registerRecordingRouteGuard(() => {
    if (posting || isPostingNow()) { window.alert("Wait for posting to finish before leaving."); return false; }
    if (recordingSavePending(savingDraft, isSavingNow)) { window.alert("Wait for the draft to finish saving before leaving."); return false; }
    return !dirty || window.confirm("This announcement has unsaved changes. Leave without saving?");
  }), [dirty, savingDraft, posting, isPostingNow, isSavingNow]);
  return {
    captureSnapshot: (): RecordingDraftSnapshot => ({ subject, body, courseId }),
    markSaved: (snapshot: RecordingDraftSnapshot) => setSaved(snapshot),
    confirmLeave: (): boolean => {
      if (posting || isPostingNow()) { window.alert("Wait for posting to finish before leaving."); return false; }
      if (recordingSavePending(savingDraft, isSavingNow)) { window.alert("Wait for the draft to finish saving before leaving."); return false; }
      return !dirty || window.confirm("This announcement has unsaved changes. Leave without saving?");
    },
    dirty,
  };
}