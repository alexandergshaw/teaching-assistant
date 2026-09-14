// The multi-draft-slot seam for "Announcement from a walkthrough" (G2 of
// docs/announcement-from-walkthrough-acceptance-criteria.md). No React, no
// DOM, no "use server" - this file is the pure leaf every reducer, hook and
// component in this directory builds on. See docs/announcement-from-walkthrough-acceptance-criteria.md in five
// lines (section 3): one collection (`slots`), never empty; a slot's
// template choice (`TemplateChoice`) is owned entirely by the slot; a
// slot's draft is a three-variant union whose drafted variant carries the
// resolved template it was built from (`builtFrom`); Generate never
// overwrites a drafted slot; there is no batch server action.

import { EMPTY_ANNOUNCEMENT_OUTLINE, type AnnouncementOutline } from "@/lib/announcement-outline-types";

export const MAX_ANNOUNCEMENT_BATCH_SIZE = 3;
export const FIRST_SLOT_ID = "wta-slot-1";

/** What a slot is set to draft FROM, before a draft exists (or before a
 * Regenerate re-resolves it). "default" defers to the live default at
 * resolve time (pasted text, else the course's most recent saved
 * exemplar, else none) - see resolveChoice below. */
export type TemplateChoice =
  | { readonly kind: "default" }
  | { readonly kind: "pasted" }
  | { readonly kind: "saved"; readonly exemplarId: string; readonly label: string; readonly outline: AnnouncementOutline }
  | { readonly kind: "none" };

/** What a slot's EXISTING draft was actually built from - a fact about the
 * past, frozen at draft time, never re-resolved. "default" cannot appear
 * here: by the time a draft exists, the default has already been resolved
 * to one of these three. */
export type ResolvedTemplate =
  | { readonly kind: "pasted" }
  | { readonly kind: "saved"; readonly exemplarId: string; readonly label: string }
  | { readonly kind: "none" };

export interface Drafted {
  readonly title: string;
  readonly message: string;
  readonly builtFrom: ResolvedTemplate;
}

export type SlotDraft =
  | { readonly phase: "empty"; readonly error: string | null }
  | { readonly phase: "drafting"; readonly restore: Drafted | null }
  | { readonly phase: "drafted"; readonly draft: Drafted; readonly error: string | null };

export interface DraftSlot {
  readonly id: string;
  readonly choice: TemplateChoice;
  readonly draft: SlotDraft;
  readonly postArmedFor: string | null;
  readonly regenerateArmed: boolean;
  readonly posting: boolean;
  readonly postError: string | null;
  readonly postedTo: string | null;
  readonly copyError: string | null;
  /** True immediately after a successful Copy, cleared by the next edit,
   * template choice, regenerate, or copy attempt - a minor confirmation
   * mirroring `postedTo`'s own role="status" idiom below. */
  readonly copied: boolean;
}

export interface TemplateCandidate {
  readonly id: string;
  readonly label: string;
  readonly outline: AnnouncementOutline;
}

export interface TemplateOptionSource {
  readonly hasPastedText: boolean;
  readonly mostRecent: TemplateCandidate | null;
  readonly saved: readonly TemplateCandidate[];
  readonly savedLoading: boolean;
  readonly savedFailed: boolean;
}

export interface TemplateOption {
  readonly id: string;
  readonly label: string;
  readonly choice: TemplateChoice;
  readonly unavailable: boolean;
}

export function choiceId(choice: TemplateChoice): string {
  if (choice.kind === "saved") return `saved:${choice.exemplarId}`;
  return choice.kind;
}

export function builtFromId(t: ResolvedTemplate): string {
  if (t.kind === "saved") return `saved:${t.exemplarId}`;
  return t.kind;
}

export function defaultOptionLabel(src: TemplateOptionSource): string {
  if (src.hasPastedText) return "Default - the announcement pasted above";
  if (src.savedLoading) return "Default - checking your saved formats...";
  if (src.mostRecent) return `Default - your most recent ("${src.mostRecent.label}")`;
  return "Default - no saved format yet";
}

export function receiptLabel(t: ResolvedTemplate): string {
  if (t.kind === "saved") return `Drafted from "${t.label}"`;
  if (t.kind === "pasted") return "Drafted from the pasted announcement";
  return "Drafted without a format to match";
}

/**
 * ALWAYS contains an option whose id === choiceId(slot.choice) - this is
 * what keeps the dropdown's displayed value truthful to `slot.choice` even
 * after the live source it was built from goes away (a saved exemplar
 * deleted elsewhere, or - H2 - the paste box cleared after "pasted" was
 * chosen). Without this, `AnnouncementDraftSlot.tsx`'s
 * `options.find(...) ?? options[0]` would silently fall back to the first
 * option (Default) while `slot.choice` stayed `pasted`/`saved`, so the
 * dropdown would show one format while `resolveChoice` drafts from another.
 *
 * `unavailable` is computed true for a `saved` choice absent from
 * `src.saved` ONLY once the saved-exemplar list finished loading
 * successfully (`!src.savedLoading && !src.savedFailed`) - "deleted," "not
 * loaded yet" and "failed to load" are three different facts, and only the
 * first one may claim the format is gone. While loading or after a failed
 * load, the synthetic option is still built (from the slot's own carried
 * label/outline, so the current value is never missing from the option
 * list) but flagged `unavailable: false` - the loading/failed window is
 * covered by the caller's own banner, not by this flag. For a `pasted`
 * choice with the paste box now empty (`!src.hasPastedText`), there is no
 * equivalent loading/failed window - the paste box is either populated or
 * not, synchronously - so that synthetic option is always flagged
 * `unavailable: true`. It shares its label with the live "pasted" option
 * (the two never coexist: this branch is only reached when no "pasted"
 * option was already pushed above), and the caller renders the
 * `unavailable` flag as a suffix so the two states still read differently.
 * The carried outline is used regardless of the flag in every case; this
 * function never disables drafting on an unavailable choice.
 */
export function optionsForSlot(slot: DraftSlot, src: TemplateOptionSource): readonly TemplateOption[] {
  const options: TemplateOption[] = [
    { id: "default", label: defaultOptionLabel(src), choice: { kind: "default" }, unavailable: false },
  ];
  if (src.hasPastedText) {
    options.push({ id: "pasted", label: "The announcement pasted above", choice: { kind: "pasted" }, unavailable: false });
  }
  for (const candidate of src.saved) {
    options.push({
      id: `saved:${candidate.id}`,
      label: candidate.label,
      choice: { kind: "saved", exemplarId: candidate.id, label: candidate.label, outline: candidate.outline },
      unavailable: false,
    });
  }
  options.push({ id: "none", label: "No format to match", choice: { kind: "none" }, unavailable: false });

  const currentId = choiceId(slot.choice);
  if (!options.some((o) => o.id === currentId)) {
    if (slot.choice.kind === "saved") {
      const listResolved = !src.savedLoading && !src.savedFailed;
      options.push({
        id: currentId,
        label: slot.choice.label,
        choice: slot.choice,
        unavailable: listResolved,
      });
    } else if (slot.choice.kind === "pasted") {
      options.push({
        id: currentId,
        label: "The announcement pasted above",
        choice: slot.choice,
        unavailable: true,
      });
    }
  }
  return options;
}

export interface LiveDefaults {
  readonly pastedOutline: AnnouncementOutline | null;
  readonly mostRecent: TemplateCandidate | null;
}

/** Precedence for a "default" choice: pasted text wins, then the course's
 * most recent saved exemplar, else none. A non-default choice resolves to
 * its own kind directly, carrying its own outline. */
export function resolveChoice(
  choice: TemplateChoice,
  live: LiveDefaults
): { readonly template: ResolvedTemplate; readonly outline: AnnouncementOutline } {
  if (choice.kind === "default") {
    if (live.pastedOutline) return { template: { kind: "pasted" }, outline: live.pastedOutline };
    if (live.mostRecent) {
      return {
        template: { kind: "saved", exemplarId: live.mostRecent.id, label: live.mostRecent.label },
        outline: live.mostRecent.outline,
      };
    }
    return { template: { kind: "none" }, outline: EMPTY_ANNOUNCEMENT_OUTLINE };
  }
  if (choice.kind === "pasted") {
    return { template: { kind: "pasted" }, outline: live.pastedOutline ?? EMPTY_ANNOUNCEMENT_OUTLINE };
  }
  if (choice.kind === "saved") {
    return { template: { kind: "saved", exemplarId: choice.exemplarId, label: choice.label }, outline: choice.outline };
  }
  return { template: { kind: "none" }, outline: EMPTY_ANNOUNCEMENT_OUTLINE };
}

export function makeSlot(id: string, choice: TemplateChoice): DraftSlot {
  return {
    id,
    choice,
    draft: { phase: "empty", error: null },
    postArmedFor: null,
    regenerateArmed: false,
    posting: false,
    postError: null,
    postedTo: null,
    copyError: null,
    copied: false,
  };
}

export function initialSlots(id: string): readonly DraftSlot[] {
  return [makeSlot(id, { kind: "default" })];
}

export function emptySlotIds(slots: readonly DraftSlot[]): readonly string[] {
  return slots.filter((s) => s.draft.phase === "empty").map((s) => s.id);
}

export type SlotsAction =
  | { type: "add"; id: string; choice: TemplateChoice }
  | { type: "remove"; id: string }
  | { type: "choose"; id: string; choice: TemplateChoice }
  | { type: "edit"; id: string; field: "title" | "message"; value: string }
  | { type: "generate-started"; ids: readonly string[] }
  | { type: "regenerate-started"; id: string }
  | { type: "result"; id: string; result: Drafted | { error: string } }
  | { type: "arm-post"; id: string; signature: string }
  | { type: "cancel-post"; id: string }
  | { type: "arm-regenerate"; id: string }
  | { type: "cancel-regenerate"; id: string }
  | { type: "posting"; id: string }
  | { type: "post-result"; id: string; result: { course: string } | { error: string } }
  | { type: "copy-result"; id: string; error: string | null };
// 14 members. See announcement-draft-slots.test.ts - the C1 guard there is
// an exhaustive `Record<SlotsAction["type"], true>` literal, which tsc
// refuses to compile if a 15th member is added here without a matching key
// there ("property is missing"). A plain `SlotsAction["type"][]` array only
// checks that each listed element IS a member, never that every member is
// listed, so it cannot catch an addition - only the Record form can.

function updateSlot(state: readonly DraftSlot[], id: string, fn: (slot: DraftSlot) => DraftSlot): readonly DraftSlot[] {
  let changed = false;
  const next = state.map((slot) => {
    if (slot.id !== id) return slot;
    const updated = fn(slot);
    if (updated !== slot) changed = true;
    return updated;
  });
  return changed ? next : state;
}

export function slotsReducer(state: readonly DraftSlot[], action: SlotsAction): readonly DraftSlot[] {
  switch (action.type) {
    case "add": {
      if (state.length >= MAX_ANNOUNCEMENT_BATCH_SIZE) return state;
      return [...state, makeSlot(action.id, action.choice)];
    }
    case "remove": {
      if (state.length <= 1) return state;
      if (!state.some((s) => s.id === action.id)) return state;
      return state.filter((s) => s.id !== action.id);
    }
    case "choose": {
      return updateSlot(state, action.id, (slot) => ({ ...slot, choice: action.choice, regenerateArmed: false }));
    }
    case "edit": {
      return updateSlot(state, action.id, (slot) => {
        if (slot.draft.phase !== "drafted") return slot;
        const draft = { ...slot.draft.draft, [action.field]: action.value };
        return {
          ...slot,
          draft: { ...slot.draft, draft },
          postArmedFor: null,
          regenerateArmed: false,
          copyError: null,
          copied: false,
        };
      });
    }
    case "generate-started": {
      const idSet = new Set(action.ids);
      let changed = false;
      const next = state.map((slot) => {
        if (!idSet.has(slot.id)) return slot;
        if (slot.draft.phase !== "empty") return slot;
        changed = true;
        return { ...slot, draft: { phase: "drafting" as const, restore: null } };
      });
      return changed ? next : state;
    }
    case "regenerate-started": {
      return updateSlot(state, action.id, (slot) => {
        if (slot.draft.phase !== "drafted") return slot;
        return { ...slot, draft: { phase: "drafting", restore: slot.draft.draft }, regenerateArmed: false };
      });
    }
    case "arm-regenerate": {
      return updateSlot(state, action.id, (slot) => {
        if (slot.draft.phase !== "drafted") return slot;
        if (slot.regenerateArmed) return slot;
        return { ...slot, regenerateArmed: true };
      });
    }
    case "cancel-regenerate": {
      return updateSlot(state, action.id, (slot) => {
        if (!slot.regenerateArmed) return slot;
        return { ...slot, regenerateArmed: false };
      });
    }
    case "result": {
      return updateSlot(state, action.id, (slot) => {
        if (slot.draft.phase !== "drafting") return slot;
        if ("error" in action.result) {
          const restore = slot.draft.restore;
          return {
            ...slot,
            draft:
              restore !== null
                ? { phase: "drafted", draft: restore, error: action.result.error }
                : { phase: "empty", error: action.result.error },
          };
        }
        return {
          ...slot,
          draft: { phase: "drafted", draft: action.result, error: null },
          postArmedFor: null,
          postedTo: null,
          postError: null,
          copyError: null,
          copied: false,
          posting: false,
        };
      });
    }
    case "arm-post": {
      return updateSlot(state, action.id, (slot) => {
        if (slot.postArmedFor === action.signature) return slot;
        return { ...slot, postArmedFor: action.signature };
      });
    }
    case "cancel-post": {
      return updateSlot(state, action.id, (slot) => {
        if (slot.postArmedFor === null) return slot;
        return { ...slot, postArmedFor: null };
      });
    }
    case "posting": {
      return updateSlot(state, action.id, (slot) => ({ ...slot, posting: true, postError: null }));
    }
    case "post-result": {
      return updateSlot(state, action.id, (slot) => {
        if ("error" in action.result) {
          return { ...slot, posting: false, postError: action.result.error };
        }
        return { ...slot, posting: false, postedTo: action.result.course, postArmedFor: null };
      });
    }
    case "copy-result": {
      return updateSlot(state, action.id, (slot) => {
        const copied = action.error === null;
        if (slot.copyError === action.error && slot.copied === copied) return slot;
        return { ...slot, copyError: action.error, copied };
      });
    }
    default:
      return state;
  }
}
