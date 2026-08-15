// Repo pairing in Modules - AC1, AC4
// (docs/repo-pairing-in-modules-acceptance-criteria.md): PURE localStorage
// persistence for the three things a paired repo needs remembered across a
// reload - which repo, which branch, and which folder-to-module overrides an
// instructor has explicitly made. No React here (this file has no "use
// client" pragma and imports none) - useRepoPairing.ts is the only caller,
// exactly the load/persist-hook split repoGradesUiState.ts already
// established for the sibling Repo Grades view.
//
// PER-COURSE KEYS (AC1): follows useLmsSyllabusButtons.ts:46's precedent
// (`ta-syllabus-quiz-module-${courseUrl}`) rather than repoGradesUiState.ts's
// single global key - that view only ever has one course active on screen at
// a time and clears its own course picker on switch, but here `courseUrl` is
// a prop ModulesView already has for the course actually open, and a
// different course pairing a different repo (or the same repo to different
// modules) must not clobber another course's choice the moment either is
// opened. `courseUrl` is what resolveLmsCourseRowAction itself matches on, so
// no extra course-id round trip is needed just to namespace these keys - the
// exact justification useLmsSyllabusButtons.ts's own comment already gives
// for the same choice.
//
// FILTER-ON-RESTORE (AC4): a stored override naming a folder path or module
// id that no longer exists must be dropped, never resurrected as a confirmed
// pairing for content that isn't there. `repo-module-mapping.ts` already
// exports `filterRepoModuleOverrides` for exactly this (mirroring
// `filterRepoGradeAssignmentMapping` and `loadSelectedRepoIds` -
// repoGradesUiState.ts:120) - `loadRepoModuleOverrides` below calls it
// directly rather than this file growing a second, competing filter. That
// makes the filtering step itself part of "all persistence logic lives here"
// rather than something every caller has to remember to run afterward.
//
// Every read/write is `typeof window` guarded (safe to import from
// server-rendered code) and tolerates malformed JSON (a corrupted or
// hand-edited localStorage value degrades to "nothing stored", never a
// thrown exception), matching every other `ta-` state module in this
// codebase (repoGradesUiState.ts, tasksUiState.ts).

import {
  filterRepoModuleOverrides,
  EMPTY_REPO_MODULE_OVERRIDES,
  type RepoModuleMappingModule,
  type RepoModuleOverrideMap,
} from "@/lib/repo-module-mapping";

function repoPairingRepoKey(courseUrl: string): string {
  return `ta-repo-pairing-repo-${courseUrl}`;
}
function repoPairingBranchKey(courseUrl: string): string {
  return `ta-repo-pairing-branch-${courseUrl}`;
}
function repoPairingOverridesKey(courseUrl: string): string {
  return `ta-repo-pairing-overrides-${courseUrl}`;
}

/** The paired-repo half of this feature's persisted state: which repo
 * ("owner/name", the same string `listGithubReposAction`'s `fullName` and
 * `getRepoTreeAction`'s `repoRef` both use), and which branch. `branch: ""`
 * means "no explicit choice made yet" - the caller resolves that to the
 * repo's actual default branch itself (mirrors GithubRepoPicker.tsx's own
 * `onBranchChange(r.defaultBranch)` fallback), rather than this pure module
 * guessing at a default it has no way to know. */
export interface PairedRepoSelection {
  repoRef: string;
  branch: string;
}

const EMPTY_PAIRED_REPO: PairedRepoSelection = { repoRef: "", branch: "" };

/** Reads the persisted repo + branch for one course. SSR-safe (returns the
 * empty selection when `window` doesn't exist) and blank-courseUrl-safe (a
 * ModulesView that somehow renders before a course URL is known must not key
 * a read off `"ta-repo-pairing-repo-"`, a key every courseless render would
 * share). */
export function loadPairedRepo(courseUrl: string): PairedRepoSelection {
  if (typeof window === "undefined" || !courseUrl) return EMPTY_PAIRED_REPO;
  return {
    repoRef: localStorage.getItem(repoPairingRepoKey(courseUrl)) ?? "",
    branch: localStorage.getItem(repoPairingBranchKey(courseUrl)) ?? "",
  };
}

export function persistPairedRepo(courseUrl: string, selection: PairedRepoSelection): void {
  if (typeof window === "undefined" || !courseUrl) return;
  try {
    localStorage.setItem(repoPairingRepoKey(courseUrl), selection.repoRef);
    localStorage.setItem(repoPairingBranchKey(courseUrl), selection.branch);
  } catch {
    // localStorage can throw (private browsing, quota) - losing persistence
    // for one change is acceptable, crashing the tab is not. Matches
    // repoGradesUiState.ts's persistRepoGradesUiState.
  }
}

/** True only for a plain JSON object every one of whose values is a string -
 * the shape `RepoModuleOverrideMap` (folderPath -> moduleId, both strings)
 * requires. Mirrors repoGradesUiState.ts's own `isStringRecord`. */
function isOverrideRecord(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every((v) => typeof v === "string")
  );
}

/** Parses the raw stored override blob, tolerating anything that isn't
 * exactly the expected shape (missing key, malformed JSON, a JSON array, a
 * value that isn't a string) by degrading to "nothing stored" rather than
 * throwing - this is read UNFILTERED; `loadRepoModuleOverrides` below is the
 * one that applies `filterRepoModuleOverrides` before handing anything to a
 * caller. */
function parseStoredOverrides(raw: string | null): RepoModuleOverrideMap {
  if (!raw) return EMPTY_REPO_MODULE_OVERRIDES;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isOverrideRecord(parsed) ? parsed : EMPTY_REPO_MODULE_OVERRIDES;
  } catch {
    return EMPTY_REPO_MODULE_OVERRIDES;
  }
}

/**
 * Restores one course's instructor overrides, filtered against CURRENT
 * reality (AC4) - `folderPaths` is the paired repo's actual assignment-level
 * folder paths (`findAssignmentFolderLevel`'s output, mapped to `.path`) and
 * `modules` is the module list currently on screen. An override naming a
 * folder that no longer exists in the repo (the instructor switched repos
 * or branches) or a module that no longer exists (a module was deleted, or
 * the view is now showing a different course-content source) is dropped by
 * `filterRepoModuleOverrides` - reused rather than reimplemented, per this
 * file's own header comment. SSR-safe and blank-courseUrl-safe like
 * `loadPairedRepo`.
 */
export function loadRepoModuleOverrides(
  courseUrl: string,
  folderPaths: readonly string[],
  modules: readonly RepoModuleMappingModule[]
): RepoModuleOverrideMap {
  if (typeof window === "undefined" || !courseUrl) return EMPTY_REPO_MODULE_OVERRIDES;
  const raw = parseStoredOverrides(localStorage.getItem(repoPairingOverridesKey(courseUrl)));
  return filterRepoModuleOverrides(raw, folderPaths, modules);
}

/** Writes one course's full override map, replacing whatever was stored for
 * that course. The caller (useRepoPairing.ts) always calls this with the
 * in-memory map it built from an already-filtered load plus the instructor's
 * latest edit, so a stale entry dropped on load is naturally never written
 * back - no separate "clean up storage" pass is needed. */
export function persistRepoModuleOverrides(courseUrl: string, overrides: RepoModuleOverrideMap): void {
  if (typeof window === "undefined" || !courseUrl) return;
  try {
    localStorage.setItem(repoPairingOverridesKey(courseUrl), JSON.stringify(overrides));
  } catch {
    // best-effort persistence only, matching persistPairedRepo above.
  }
}
