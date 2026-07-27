import { useEffect, useState, useRef } from "react";
import {
  listArtifactTemplatesAction,
  saveArtifactTemplateAction,
} from "@/app/actions";
import { isPresetArtifactTemplateId } from "@/lib/artifact-templates/presets";
import type { ArtifactTemplate, ArtifactTemplateKind } from "@/lib/artifact-templates/types";

/**
 * localStorage-backed state, so every control on this page survives a reload
 * (the app-wide rule for new UI controls). Keyed under the "ta-" namespace the
 * rest of the app uses.
 */
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
      // Ignore storage failures (private mode, quota).
    }
  }, [key, value]);

  return [value, setValue];
}

/**
 * The user's templates of one kind.
 *
 * Unlike the deck-template page - which talks to Supabase directly from the
 * browser - the artifact template store is reached through server actions:
 * they run `requireOwner()` and a service-role client, so there is no
 * browser-side equivalent to call.
 *
 * The action returns presets AND user rows merged; presets are filtered out
 * here because the page lists them from code separately (they are not editable
 * rows and the store's upsert refuses their ids).
 */
export function useArtifactTemplates(kind: ArtifactTemplateKind) {
  const [custom, setCustom] = useState<ArtifactTemplate[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Which kind the loaded rows belong to. `loading` is DERIVED from this
  // rather than being its own state: the lint rule forbids a setState reached
  // synchronously from an effect, so there is no setLoading(true) to make.
  const [loadedKind, setLoadedKind] = useState<ArtifactTemplateKind | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await listArtifactTemplatesAction(kind);
      if (cancelled) return;
      if ("error" in result) {
        setCustom([]);
        setLoadError(result.error);
      } else {
        setCustom(result.templates.filter((t) => !isPresetArtifactTemplateId(t.id)));
        setLoadError(null);
      }
      setLoadedKind(kind);
    })();

    return () => {
      cancelled = true;
    };
  }, [kind]);

  return { custom, setCustom, loadError, setLoadError, loading: loadedKind !== kind };
}

/**
 * Debounced autosave, 800 ms after the last edit - the same cadence the deck
 * builder uses, so a burst of typing is one write rather than one per
 * keystroke. Preset ids are SKIPPED: presets are code, not rows, and
 * saveArtifactTemplateAction rejects them outright.
 */
export function usePendingArtifactSave() {
  const pendingRef = useRef<ArtifactTemplate | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return function commit(
    next: ArtifactTemplate,
    setCustom: (fn: (prev: ArtifactTemplate[]) => ArtifactTemplate[]) => void,
    onError?: (message: string) => void
  ) {
    setCustom((prev) => prev.map((t) => (t.id === next.id ? next : t)));

    if (isPresetArtifactTemplateId(next.id)) return;

    pendingRef.current = next;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending) return;
      void saveArtifactTemplateAction(pending).then((result) => {
        if (result && "error" in result && onError) onError(result.error);
      });
    }, 800);
  };
}
