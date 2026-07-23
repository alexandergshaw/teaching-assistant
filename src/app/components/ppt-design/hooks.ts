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
