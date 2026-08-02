"use client";

// Add/remove institution controls for the Knowledge tab's own institution
// picker (src/app/components/KnowledgeTab.tsx) - split out during the
// 1000-line-cap refactor. Independent of the header's InstitutionSwitcher;
// see that file's module comment. Only needs the registered acronym list, a
// switchInstitution callback, and an unsaved-edits guard - it owns nothing
// the page list, edit session, attachments, or tree-management hooks need
// back.

import { useState } from "react";
import { writeInstitutions, validateNewInstitutionAcronym } from "@/lib/institutions";
import { confirmAndRemoveInstitution } from "@/lib/institution-removal";
import { getInstitutionDeletionImpactAction } from "../../actions";

export interface UseKbInstitutionPickerArgs {
  institutions: string[];
  active: string;
  /** KnowledgeTab.tsx's switchInstitution - guarded by confirmDiscard()
   *  itself, so this hook does not need to guard the switch a second time. */
  switchInstitution: (code: string) => void;
  confirmDiscard: () => boolean;
}

export interface UseKbInstitutionPickerReturn {
  newAcronym: string;
  setNewAcronym: (value: string) => void;
  addInstitutionError: string | null;
  setAddInstitutionError: (message: string | null) => void;
  addInstitution: () => void;
  removingInstitution: string | null;
  removeInstitutionError: string | null;
  removeInstitution: (code: string) => Promise<void>;
}

export function useKbInstitutionPicker({
  institutions,
  active,
  switchInstitution,
  confirmDiscard,
}: UseKbInstitutionPickerArgs): UseKbInstitutionPickerReturn {
  // ── Add institution, inline next to this tab's own picker ──────────────
  const [newAcronym, setNewAcronym] = useState("");
  const [addInstitutionError, setAddInstitutionError] = useState<string | null>(null);

  // ── Remove institution, from this same picker (AC4-AC6) ─────────────────
  const [removingInstitution, setRemovingInstitution] = useState<string | null>(null);
  const [removeInstitutionError, setRemoveInstitutionError] = useState<string | null>(null);

  // Add an institution from this tab (AC1-AC5). The registry write is global
  // and non-destructive, so it always happens on a valid, non-duplicate
  // acronym; only the follow-up SELECTION switch goes through switchInstitution's
  // confirmDiscard() guard (AC3), since that part - unlike the write - can
  // discard an open page's unsaved edits. Switching to the newly added
  // institution (rather than leaving the current one selected) is deliberate:
  // the reason to add one here is almost always to start writing its pages,
  // so landing on it immediately saves the extra click, and the guard means
  // it never costs an unsaved edit to do so.
  const addInstitution = () => {
    const result = validateNewInstitutionAcronym(newAcronym, institutions);
    if (!result.ok) {
      if (result.reason === "duplicate") {
        setAddInstitutionError(`${result.code} is already registered.`);
      }
      return;
    }
    setAddInstitutionError(null);
    writeInstitutions([...institutions, result.code]);
    setNewAcronym("");
    switchInstitution(result.code);
  };

  // Remove an institution from this tab's own picker (AC4-AC6). Shares
  // confirmAndRemoveInstitution with TopBar.tsx's Settings dropdown (AC4) -
  // it states the real page/tile counts before anything happens (AC1/AC2)
  // and never deletes a database row (AC3). Guarded by this tab's own
  // confirmDiscard() exactly when `code` is the institution currently open
  // here: removing it falls `active` out of the registry, which
  // resolveActiveKbInstitution (via useKbInstitutionSelection in page.tsx)
  // then resolves away from automatically - the same kind of selection
  // change switchInstitution already guards, so this must guard it too
  // rather than let it happen as a side effect with no prompt. Removing a
  // DIFFERENT institution than the one open here needs no such guard - it
  // cannot affect this tab's current selection or edit session.
  const removeInstitution = async (code: string) => {
    setRemoveInstitutionError(null);
    setRemovingInstitution(code);
    const result = await confirmAndRemoveInstitution(code, institutions, {
      fetchImpact: getInstitutionDeletionImpactAction,
      guardUnsavedEdits: () => code !== active || confirmDiscard(),
    });
    setRemovingInstitution(null);
    if (!result.removed && result.reason === "error") {
      setRemoveInstitutionError(result.message);
    }
  };

  return {
    newAcronym,
    setNewAcronym,
    addInstitutionError,
    setAddInstitutionError,
    addInstitution,
    removingInstitution,
    removeInstitutionError,
    removeInstitution,
  };
}
