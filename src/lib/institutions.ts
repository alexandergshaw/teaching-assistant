import { useEffect, useState } from "react";

/**
 * Client-side registry of institution acronyms (MCC, MPCC, …) plus the single
 * "active" institution shared across the Live Feed and Communications tabs.
 *
 * The acronyms are managed in the Settings dropdown and drive the per-school env
 * vars on the server (<ACRONYM>_CANVAS_URL, _CANVAS_API_TOKEN, _LLM_URL,
 * _LLM_API). Only the list and the current selection live here; the secrets stay
 * server-side. Selection is shared so picking a school on one tab follows to the
 * other.
 */

const INSTITUTIONS_KEY = "ta-institutions";
const ACTIVE_KEY = "ta-active-institution";
// The storage event only fires in *other* tabs, so we also emit our own event
// to refresh listeners in the current tab when the registry/selection changes.
const CHANGE_EVENT = "ta-institutions-changed";

function emitChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

/** The registered acronyms (uppercased), read from localStorage. */
export function readInstitutions(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(INSTITUTIONS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .map((x) => x.trim().toUpperCase())
      )
    );
  } catch {
    return [];
  }
}

/** Persist the acronym list and notify listeners in this tab. */
export function writeInstitutions(list: string[]): void {
  if (typeof window === "undefined") return;
  const normalized = Array.from(
    new Set(list.map((x) => x.trim().toUpperCase()).filter(Boolean))
  );
  localStorage.setItem(INSTITUTIONS_KEY, JSON.stringify(normalized));
  emitChange();
}

export type ValidateNewInstitutionAcronymResult =
  | { ok: true; code: string }
  | { ok: false; reason: "blank" }
  | { ok: false; reason: "duplicate"; code: string };

/**
 * The single validation rule for adding a new acronym to the registry: trim,
 * uppercase, reject a blank result, reject a case-insensitive duplicate of an
 * already-registered acronym. Shared by every "add institution" control (the
 * Settings dropdown in TopBar.tsx and the Knowledge tab's own picker in
 * KnowledgeTab.tsx) so the two can never drift on what counts as a valid
 * acronym. Pure - callers still own writing the result via writeInstitutions
 * above and deciding what to do with a rejected result.
 */
export function validateNewInstitutionAcronym(
  raw: string,
  existing: string[]
): ValidateNewInstitutionAcronymResult {
  const code = raw.trim().toUpperCase();
  if (!code) return { ok: false, reason: "blank" };
  const isDuplicate = existing.some((x) => x.trim().toUpperCase() === code);
  if (isDuplicate) return { ok: false, reason: "duplicate", code };
  return { ok: true, code };
}

/** The stored active acronym (may be empty or no longer registered). */
export function readActiveInstitution(): string {
  if (typeof window === "undefined") return "";
  return (localStorage.getItem(ACTIVE_KEY) ?? "").trim().toUpperCase();
}

function writeActiveInstitution(code: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_KEY, code.trim().toUpperCase());
  emitChange();
}

/** Reactive list of registered acronyms (updates on edits and across tabs). */
export function useInstitutions(): string[] {
  const [list, setList] = useState<string[]>(() => readInstitutions());
  useEffect(() => {
    const update = () => setList(readInstitutions());
    window.addEventListener("storage", update);
    window.addEventListener(CHANGE_EVENT, update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener(CHANGE_EVENT, update);
    };
  }, []);
  return list;
}

/**
 * The shared institution selection. `active` is always a registered acronym (the
 * first one when nothing is selected or the stored choice is gone), or "" when
 * none are registered.
 */
export function useInstitutionSelection(): {
  institutions: string[];
  active: string;
  setActive: (code: string) => void;
} {
  const institutions = useInstitutions();
  const [stored, setStored] = useState<string>(() => readActiveInstitution());
  useEffect(() => {
    const update = () => setStored(readActiveInstitution());
    window.addEventListener("storage", update);
    window.addEventListener(CHANGE_EVENT, update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener(CHANGE_EVENT, update);
    };
  }, []);
  const active = institutions.includes(stored) ? stored : institutions[0] ?? "";
  const setActive = (code: string) => {
    setStored(code);
    writeActiveInstitution(code);
  };
  return { institutions, active, setActive };
}
