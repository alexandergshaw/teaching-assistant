"use client";

// The deck-template picker's own state (the list of offerable templates, the
// selected id, and the read-on-init/write-on-change/reconcile-after-load
// cycle that backs it) - extracted out of useLmsGeneration.ts (969 of this
// repo's 1000-line ceiling) to keep that file under it, a STRUCTURAL split
// only, no behaviour change. Self-contained the same way
// useLmsGenerationDownload.ts's own header comment describes for the
// download concern: this state is read only by the deck template select and
// written only by its own onChange plus the one load effect below - nothing
// in useLmsGeneration.ts's generation lifecycle (generate/refine/saveEdit/
// post) reaches into it beyond passing `templateId` to
// resolveDeckTemplateSelection at the one call site inside `generate`'s own
// decks branch, which still reads it off this hook's return value the same
// way it always read the local state.
import { useEffect, useState } from "react";
import { listDeckTemplatesAction } from "@/app/actions";
import { resolveDeckTemplateId } from "@/lib/lms-generation/deck";
import { DECK_PRESETS } from "@/lib/decks/presets";
import type { DeckTemplate } from "@/lib/decks/types";
import { deckTemplateKey, readStored } from "./lmsGenerationKindHelpers";

export interface UseLmsGenerationDeckTemplatesReturn {
  templates: DeckTemplate[];
  templateId: string;
  setTemplateId: (v: string) => void;
}

export function useLmsGenerationDeckTemplates(courseUrl: string): UseLmsGenerationDeckTemplatesReturn {
  // Seeded synchronously with the built-in presets (DECK_PRESETS is a pure,
  // zero-network const), so the deck template picker is never empty even
  // before the effect below finishes loading this user's own saved
  // deck_templates rows - see resolveDeckTemplateSelection's own doc comment
  // (deck.ts) for the refusal path this feeds when nothing is selected.
  const [templates, setTemplates] = useState<DeckTemplate[]>(DECK_PRESETS);
  // Persisted per course, like scriptMinutes and useDiscussionCheckpoints in
  // useLmsGeneration.ts (AC9 gap closed 2026-08-23 - this select previously
  // persisted nothing and recorded no reason). Seeded from the stored value
  // WITHOUT validating it here on purpose: at this point only DECK_PRESETS
  // are known, and a remembered id naming one of the instructor's own
  // deck_templates rows would be wrongly discarded. Reconciliation against
  // the real list happens once the templates load - see resolveDeckTemplateId
  // in the effect below, and that function's own doc comment for the
  // staleness it handles.
  const [templateId, setTemplateId] = useState<string>(
    () => (readStored(deckTemplateKey(courseUrl)) ?? "").trim() || (DECK_PRESETS[0]?.id ?? "")
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(deckTemplateKey(courseUrl), templateId);
  }, [courseUrl, templateId]);

  // setState-in-effect idiom (this repo's own convention): an inline async
  // IIFE with a `cancelled` flag, setState only after the await - never a
  // synchronous setState reached directly from the effect body.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listDeckTemplatesAction();
      if (cancelled || "error" in result) return;
      const loaded = [...DECK_PRESETS, ...result.templates];
      setTemplates(loaded);
      // Now - and only now - is the real offer list known, so a remembered
      // template id can finally be checked against it. An updater keeps
      // templateId out of this effect's deps, so persisting a new selection
      // does not re-run the fetch.
      setTemplateId((prev) => resolveDeckTemplateId(prev, loaded));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { templates, templateId, setTemplateId };
}
