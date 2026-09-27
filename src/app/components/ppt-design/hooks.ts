import { useEffect, useState, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { useSupabase } from "@/context/SupabaseProvider";
import {
  listDeckTemplates,
  upsertDeckTemplate,
} from "@/lib/deck-templates";
import { DECK_PRESETS, isPresetDeckId } from "@/lib/decks/presets";
import type { DeckTemplate } from "@/lib/decks/types";
import type { PptxSlide } from "@/lib/pptx";
import type { DeckSourceReceipt } from "@/lib/decks/deck-source";
import { listDeckTemplateFilesAction, type DeckTemplateFileMeta } from "@/app/actions/deck-template-files";

export function useLocalStorageState<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    const saved = localStorage.getItem(key);
    if (!saved) return defaultValue;
    try {
      return JSON.parse(saved) as T;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage failures
    }
  }, [key, value]);

  return [value, setValue];
}

export function useTemplates() {
  const { supabase, user } = useSupabase();
  const [custom, setCustom] = useState<DeckTemplate[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !supabase) return;

    let cancelled = false;

    (async () => {
      try {
        const rows = await listDeckTemplates(supabase, user.id);
        if (!cancelled) {
          setCustom(rows);
        }
      } catch (err) {
        console.error("Failed to load deck templates:", err);
        if (!cancelled) {
          setLoadError("Failed to load templates");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  return { custom, setCustom, loadError };
}

export function useSelectedTemplate(
  custom: DeckTemplate[]
): [DeckTemplate, (id: string) => void] {
  const [selectedId, setSelectedId] = useLocalStorageState("ta-ppt-selected-id", DECK_PRESETS[0].id);
  const allTemplates = [...DECK_PRESETS, ...custom];
  const selected = allTemplates.find((t) => t.id === selectedId) || DECK_PRESETS[0];

  return [selected, setSelectedId];
}

export function useDeckSettingsOpen() {
  return useLocalStorageState("ta-ppt-settings-open", true);
}

export function usePendingTemplateSave(user: User | null, supabase: SupabaseClient | null) {
  const pendingRef = useRef<DeckTemplate | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = (next: DeckTemplate, setCustom: (fn: (prev: DeckTemplate[]) => DeckTemplate[]) => void) => {
    setCustom((prev) => prev.map((t) => (t.id === next.id ? next : t)));

    if (user && supabase && !isPresetDeckId(next.id)) {
      pendingRef.current = next;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        if (pendingRef.current) {
          void upsertDeckTemplate(supabase, user.id, pendingRef.current).catch(
            console.error
          );
        }
        pendingRef.current = null;
      }, 800);
    }
  };

  return commit;
}

/**
 * A43-S: the dropped/pasted source persists across a reload (this repo's
 * standing ta- persistence rule) - a term-long choice, same as the template
 * pick above, not something the instructor should have to redo per deck.
 * Two keys, matching the existing ta-ppt-gen-* split of related fields into
 * separate storage entries rather than one bag.
 */
export function useDeckSourceReceipt() {
  return useLocalStorageState<DeckSourceReceipt | null>("ta-ppt-source-receipt", null);
}

export function useDeckSourceMaterials() {
  return useLocalStorageState<string>("ta-ppt-source-materials", "");
}

/**
 * A43-T (docs/a43-scope.md section 11.3): which uploaded .pptx template, if
 * any, is selected. A term-long choice like the structural template pick
 * above (ta-ppt-selected-id), so it persists the same way (C4, section
 * 12.1) - the empty string means "no file-backed template selected", i.e.
 * generation stays on the structural buildSlidesPptx path.
 */
export function useSelectedDeckTemplateFileId() {
  return useLocalStorageState<string>("ta-ppt-template-file-id", "");
}

/**
 * The owner's uploaded deck template files (metadata only). `refresh` is
 * exposed so a caller can re-fetch after an upload or delete without a full
 * page reload.
 */
export function useDeckTemplateFiles(user: User | null) {
  const [templateFiles, setTemplateFiles] = useState<DeckTemplateFileMeta[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = async () => {
    if (!user) {
      setTemplateFiles([]);
      return;
    }
    try {
      const result = await listDeckTemplateFilesAction();
      if ("error" in result) {
        setLoadError(result.error);
      } else {
        setLoadError(null);
        setTemplateFiles(result.templates);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load uploaded templates.");
    }
  };

  // Inline async IIFE + cancelled flag: setState only happens after the
  // await, never synchronously within the effect body itself.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        if (!cancelled) setTemplateFiles([]);
        return;
      }
      try {
        const result = await listDeckTemplateFilesAction();
        if (cancelled) return;
        if ("error" in result) {
          setLoadError(result.error);
        } else {
          setLoadError(null);
          setTemplateFiles(result.templates);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load uploaded templates.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { templateFiles, loadError, refresh };
}

export function useGenerationState() {
  const [generatedDeck, setGeneratedDeck] = useState<{ presentationTitle: string; slides: PptxSlide[] } | null>(null);
  const [subject, setSubject] = useLocalStorageState("ta-ppt-gen-subject", "");
  const [audience, setAudience] = useLocalStorageState("ta-ppt-gen-audience", "");
  const [loopItems, setLoopItems] = useState<Record<string, string>>({});
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [editingSlideIdx, setEditingSlideIdx] = useState<number | null>(null);
  const [editedSlides, setEditedSlides] = useState<PptxSlide[]>([]);
  const [savingFile, setSavingFile] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftNote, setDraftNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    try {
      for (const [groupId, items] of Object.entries(loopItems)) {
        const key = `ta-ppt-gen-loop-${groupId}`;
        localStorage.setItem(key, items);
      }
    } catch {
      // Ignore
    }
  }, [loopItems]);

  return {
    generatedDeck,
    setGeneratedDeck,
    subject,
    setSubject,
    audience,
    setAudience,
    loopItems,
    setLoopItems,
    generateBusy,
    setGenerateBusy,
    generateError,
    setGenerateError,
    editingSlideIdx,
    setEditingSlideIdx,
    editedSlides,
    setEditedSlides,
    savingFile,
    setSavingFile,
    savingDraft,
    setSavingDraft,
    draftNote,
    setDraftNote,
  };
}
