import { useState } from "react";
import type { PreviewTab } from "./types";

export function useLessonPlanPreviewState() {
  const [previewTab, setPreviewTab] = useState<PreviewTab>("intro");
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [editingLessonField, setEditingLessonField] = useState<string | null>(null);
  const [lessonFieldDraft, setLessonFieldDraft] = useState("");
  const [lockedLessonFields, setLockedLessonFields] = useState<Set<string>>(
    new Set()
  );
  const [selectedCourse, setSelectedCourse] = useState<{ id: string; name: string } | null>(null);

  const startEditLessonField = (key: string, value: string) => {
    setEditingLessonField(key);
    setLessonFieldDraft(value);
  };

  const cancelEditLessonField = () => {
    setEditingLessonField(null);
  };

  const saveLessonFieldEdit = (key: string, onSaveField: (key: string, draft: string) => void) => {
    onSaveField(key, lessonFieldDraft);
    setEditingLessonField(null);
  };

  const toggleLessonFieldLock = (key: string) => {
    setLockedLessonFields((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleRegenerate = async (
    revisionPromptValue: string,
    onRegenerate: (revisionPrompt: string) => Promise<boolean>
  ) => {
    setIsRegenerating(true);
    try {
      const didUpdate = await onRegenerate(revisionPromptValue);
      if (didUpdate) {
        setRevisionPrompt("");
      }
    } finally {
      setIsRegenerating(false);
    }
  };

  return {
    previewTab,
    setPreviewTab,
    revisionPrompt,
    setRevisionPrompt,
    isRegenerating,
    setIsRegenerating,
    editingLessonField,
    setEditingLessonField,
    lessonFieldDraft,
    setLessonFieldDraft,
    lockedLessonFields,
    setLockedLessonFields,
    selectedCourse,
    setSelectedCourse,
    startEditLessonField,
    cancelEditLessonField,
    saveLessonFieldEdit,
    toggleLessonFieldLock,
    handleRegenerate,
  };
}
