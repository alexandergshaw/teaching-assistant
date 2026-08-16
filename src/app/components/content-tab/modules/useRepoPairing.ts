"use client";

// Repo pairing in Modules - the WIRING wave over the four pure foundations
// docs/REGRESSION.md entry 298 already shipped (repo-folder-tree.ts,
// repo-module-mapping.ts, the repo:/export: selection-key scheme, and
// useModuleSelection's repo arm), NOW MADE DURABLE
// (docs/durable-repo-module-associations-acceptance-criteria.md) - the
// paired repo, its branch, and every folder/file-to-module association live
// in the database (course_hub.repo_module_pairing), keyed on the course_hub
// ROW ID rather than `courseUrl`, which is blank for every export-sourced
// course (the AC doc's "The bug is not a collision" section - this is the
// third instance of that same root cause, entries 274/300 in
// docs/REGRESSION.md). RepoFoldersSection.tsx (the render half) and
// repoPairingState.ts (now only the ONE-TIME legacy-localStorage migration
// reader, AC11 below) both stay free of fetch/action calls, mirroring
// useVideoRepoPickers.ts's own hook/render split for the sibling in-Modules
// repo picker.
//
// AC9 - THE CLIENT REACHES THE DATABASE ONLY THROUGH A SERVER ACTION. Every
// import here that touches Supabase is `import type` only
// (RepoModulePairing's shape); the actual read is a byproduct of
// resolveLmsCourseRowAction/resolveLmsCourseRowByIdAction (already the
// established live/export course-row resolution pair, entry 300) since
// `Course.repoModulePairing` rides along on the SAME row those already
// fetch, and the write is setCourseRepoPairingAction - both imported from
// the actions barrel, exactly like every other hook in this directory.
//
// AC3/AC4/AC5 - THE ACTIVATION MODEL. `pairing.associations` (this hook's
// single source of truth, mirrored 1:1 into the database on every change) is
// NEVER filtered before being stored - the mistake that made the old
// localStorage version delete a folder's association the moment a branch
// switch made it momentarily absent, permanently, for every device. Instead,
// `activateRepoModulePairing` (src/lib/repo-module-pairing.ts) computes
// which associations are ACTIVE right now at READ time, on every render,
// leaving the full stored list untouched; only `active.folderOverrides` (the
// activation filter's OWN output, reusing repo-module-mapping.ts's
// `filterRepoModuleOverrides` unmodified per AC4) is fed into
// `applyRepoModuleOverrides`, so every one of that function's four pairing
// states and every downstream consumer stays byte-identical to before this
// feature. AC5's gate - `readyFolderPaths`/`readyFilePaths` below - gets
// updated only on a completed ("ready") tree load, never mid-fetch, so a
// branch switch's transient empty folder list can never flip every
// association to "inactive" for the half-second the new tree is loading.
//
// STATE-RESET IDIOM: this repo's eslint rejects setState reached
// SYNCHRONOUSLY from inside a useEffect body. Every reset this hook needs
// when its inputs change (a new repo picked -> forget the old branch list and
// tree; a new branch picked, or the tree's own source inputs change -> forget
// the old tree; the tree finishing a load -> refresh the AC5 "ready" cache)
// uses the "adjust state during render" idiom CoursePicker.tsx already
// established for its own institution-change reset (see that file's
// `prevInstitution` block) and useModuleSelection.ts's `prunedFor` block use
// for the same class of problem: a `prevX`/derived-key comparison done DURING
// RENDER (not inside an effect) drives the reset, so the effect itself only
// ever needs a bare early `return` (no setState) before its async IIFE -
// exactly GithubRepoPicker.tsx's shape, minus that file's own
// eslint-disable comment, because nothing here calls setState before the
// first `await`.
//
// WHAT THIS HOOK DOES NOT DO: it never touches `selection.selected` /
// `selection.selectedModules` directly - RepoFoldersSection.tsx (the only
// consumer of this hook) owns those checkbox toggles itself, using the
// `repoModuleKey`/`repoItemKey` producers directly, the same way ModuleCard's
// own export-module branch toggles `setSelectedModules`/`setSelected`
// directly rather than through a hook-owned toggle function. This hook's job
// ends at "here is the tree, the mapping, and the folder refs to prune
// selection against" (`repoModuleRefs`, AC6 of the earlier repo-pairing
// feature - fed straight into useModuleSelection's own `repoModules` param
// in ModulesView.tsx).

import { useEffect, useMemo, useState } from "react";
import type { GithubRepo } from "@/lib/github";
import {
  githubConfiguredAction,
  getRepoTreeAction,
  listGithubBranchesAction,
  listGithubReposAction,
  resolveLmsCourseRowAction,
  resolveLmsCourseRowByIdAction,
  setCourseRepoPairingAction,
} from "../../../actions";
import { buildRepoFolderTree, findAssignmentFolderLevel, type RepoFolderNode } from "@/lib/repo-folder-tree";
import { applyRepoModuleOverrides, mapRepoFoldersToModules, type RepoModuleMappingModule, type RepoModuleMappingResult } from "@/lib/repo-module-mapping";
import {
  activateRepoModulePairing,
  coerceRepoModulePairing,
  emptyRepoModulePairing,
  upsertRepoModuleAssociation,
  type RepoAssociationKind,
  type RepoModuleAssociation,
  type RepoModulePairing,
} from "@/lib/repo-module-pairing";
import type { RepoModuleRefs } from "./useModuleSelection";
import { loadPairedRepo, loadRepoModuleOverrides } from "./repoPairingState";

/** Whether the GitHub token is configured at all (AC10's first degraded
 * case) - mirrors GithubRepoPicker.tsx's own three-plus-loading state
 * exactly, so an instructor who has seen that picker already reads this
 * one's states for free. "error" is listGithubReposAction failing for a
 * REASON OTHER than being unconfigured (a transient network failure, a
 * malformed token that still "is configured" by env-var presence, etc). */
export type GithubReposState = "loading" | "unconfigured" | "ready" | "error";

export type RepoTreeState = "idle" | "loading" | "ready" | "error";
export type RepoBranchesState = "idle" | "loading" | "ready";
export type PairingLoadState = "loading" | "ready" | "error";

export interface UseRepoPairingReturn {
  githubState: GithubReposState;
  repos: GithubRepo[];
  reposError: string | null;

  /** "loading" until the course_hub row (and its stored pairing) has
   * resolved - see this hook's own "resolve the course row" effect. Every
   * field below reads as empty/unpaired while this is "loading", exactly as
   * it would for a course with no pairing at all, so no caller needs a
   * separate branch for "not loaded yet" vs "genuinely nothing stored". */
  pairingLoadState: PairingLoadState;
  pairingError: string | null;
  /** Set when the most recent write to the database failed (AC9 - never
   * swallowed the way the old localStorage `catch {}` was). Cleared on the
   * next successful write. */
  persistError: string | null;

  /** "owner/name", or "" for none selected. Persisted on the course_hub row
   * (repo_module_pairing), keyed on the course's row id - see this file's
   * own header comment. */
  repoRef: string;
  setRepoRef: (value: string) => void;

  /** "" means "use the repo's default branch" - never resolved to a literal
   * branch name by this hook itself (see the module header's "branch
   * effect" comment); the caller displays the resolved default via
   * `branches[0]`/`branchesState` when `branch` is blank. */
  branch: string;
  setBranch: (value: string) => void;
  branches: string[];
  branchesState: RepoBranchesState;

  treeState: RepoTreeState;
  treeError: string | null;
  /** The assignment-level folders (docs/REGRESSION.md entry 298's
   * findAssignmentFolderLevel) - empty until a repo is selected and its tree
   * has loaded, and genuinely empty (not a loading placeholder) once
   * `treeState === "ready"` for a repo whose tree has no assignment folders
   * at all (AC10 - the caller renders that as "no pairing found", not as a
   * silent empty list). */
  folders: RepoFolderNode[];

  /** Every folder mapped against `modules` (AC3), with every ACTIVE stored
   * folder association (AC4 of the durable-associations feature) already
   * applied. Always a real result (never null) - folders.length === 0 is
   * what the caller checks for the "no pairing found" case, not this being
   * null. */
  mapping: RepoModuleMappingResult;
  /** folderPath -> moduleId for every currently-ACTIVE folder association -
   * feeds the folder override <select>'s value the same way the pre-durable
   * `overrides` map did. */
  folderOverrides: Readonly<Record<string, string>>;
  /** filePath -> moduleId for every currently-ACTIVE file association (AC2
   * of the durable-associations feature - files are associable too). A file
   * absent from this map has no EXPLICIT association of its own and
   * inherits its folder's pairing for display purposes (RepoFoldersSection
   * decides the inherited label; this hook only reports what is explicit). */
  fileOverrides: Readonly<Record<string, string>>;
  /** Every stored association that is NOT currently active (AC6 - "inactive
   * associations are visible, never silent") - a branch switch, a rename, a
   * rate-limited tree fetch or an unpushed folder, never an instructor
   * decision (AC3). Never mutated out of storage; purely a read-time view. */
  inactiveAssociations: readonly RepoModuleAssociation[];
  /** Sets (or, with `moduleId: null`, clears - the ONE explicit-delete path,
   * AC3) one folder-or-file's association, and persists the resulting full
   * pairing to the database immediately. */
  setAssociation: (path: string, kind: RepoAssociationKind, moduleId: string | null) => void;

  /** Reduced to exactly what useModuleSelection's pruning needs
   * (RepoModuleRefs, AC6 of the earlier repo-pairing feature) - null while no
   * tree has been supplied yet (no repo picked, or the tree hasn't finished
   * loading/errored), which is the deliberate "leave repo keys alone,
   * nothing to confirm or refute them against yet" signal
   * pruneSelectionForModules's own doc comment describes; a real (possibly
   * empty) array once `treeState === "ready"`. */
  repoModuleRefs: RepoModuleRefs[] | null;
}

/**
 * Repo pairing in Modules, now durable
 * (docs/durable-repo-module-associations-acceptance-criteria.md AC1-AC11):
 * loads the GitHub repo list, the chosen repo's branch list and tree, and
 * derives the folder-to-module mapping, keeping the persisted pairing
 * (repo, branch, and every folder/file association) in sync with the
 * database. `courseUrl`/`exportCourseId` together resolve the course_hub row
 * this pairing belongs to - exactly the live/export pair
 * resolveLmsCourseRowAction/resolveLmsCourseRowByIdAction already
 * established (entry 300) - and `modules` is "the modules currently on
 * screen" - ModulesView.tsx passes it built from `displayModules` (live
 * Canvas or export, whichever is active - AC3's own "map folders to the
 * modules currently on screen").
 */
export function useRepoPairing(
  courseUrl: string,
  exportCourseId: string | undefined,
  modules: readonly RepoModuleMappingModule[]
): UseRepoPairingReturn {
  // ── GitHub configuration + repo list (mount-once) ─────────────────────────
  const [githubState, setGithubState] = useState<GithubReposState>("loading");
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [reposError, setReposError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await githubConfiguredAction();
      if (cancelled) return;
      if (!cfg.configured) {
        setGithubState("unconfigured");
        return;
      }
      const r = await listGithubReposAction();
      if (cancelled) return;
      if ("error" in r) {
        setReposError(r.error);
        setGithubState("error");
        return;
      }
      setRepos(r.repos);
      setGithubState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Resolve the course_hub row + its stored pairing (AC1/AC7/AC9) ────────
  const [courseRowId, setCourseRowId] = useState<string | null>(null);
  const [pairing, setPairingState] = useState<RepoModulePairing>(emptyRepoModulePairing());
  const [pairingLoadState, setPairingLoadState] = useState<PairingLoadState>("loading");
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [persistError, setPersistError] = useState<string | null>(null);

  // AC11 - one-time migration of legacy `ta-repo-pairing-*` localStorage
  // values, decided explicitly rather than left unsaid: an EXPORT course has
  // nothing to migrate (repoPairingState.ts's own guard blanked out for
  // every export course's empty courseUrl, so nothing was ever stored for
  // one - this feature's own bug report). A LIVE course's legacy repo+branch
  // choice is carried over the moment the database itself proves empty
  // (`dbPairing.repoRef === ""`); its legacy OVERRIDES are carried over too,
  // but only once the migrated repo's tree has actually loaded (this ref
  // flags that a folder-override migration is still owed), and only the
  // subset that STILL validates against the just-loaded tree/module list at
  // that moment (reusing loadRepoModuleOverrides's own
  // filterRepoModuleOverrides call, AC4's established restore-time filter) -
  // an override already stale under the OLD system is not resurrected here
  // either. AC3's "preserve forever, never auto-drop" guarantee begins only
  // AFTER this one-time carry-over, for every association made through the
  // new system.
  // A useState, not a useRef: this repo's eslint forbids reading/writing a
  // ref during render (react-hooks/refs), and the render-time reset idiom
  // below needs to both read and clear this flag during render.
  const [overridesMigrationOwed, setOverridesMigrationOwed] = useState(false);

  // Render-time reset (see module header): identifying a DIFFERENT course
  // resets pairingLoadState to "loading" BEFORE the effect below ever runs,
  // so that effect's own body never needs a synchronous setState before its
  // first await.
  const [prevPairingCourseUrl, setPrevPairingCourseUrl] = useState(courseUrl);
  const [prevPairingExportCourseId, setPrevPairingExportCourseId] = useState(exportCourseId);
  if (courseUrl !== prevPairingCourseUrl || exportCourseId !== prevPairingExportCourseId) {
    setPrevPairingCourseUrl(courseUrl);
    setPrevPairingExportCourseId(exportCourseId);
    setPairingLoadState("loading");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = exportCourseId
        ? await resolveLmsCourseRowByIdAction(exportCourseId)
        : courseUrl
          ? await resolveLmsCourseRowAction(courseUrl)
          : null;
      if (cancelled) return;

      if (!result) {
        // Neither identifier is known yet (e.g. this renders before
        // ContentTab has resolved a course) - nothing to load or persist
        // against.
        setCourseRowId(null);
        setPairingState(emptyRepoModulePairing());
        setPairingError(null);
        setPairingLoadState("ready");
        return;
      }
      if ("error" in result) {
        setCourseRowId(null);
        setPairingError(result.error);
        setPairingLoadState("error");
        return;
      }

      const dbPairing = coerceRepoModulePairing(result.course.repoModulePairing);
      setCourseRowId(result.course.id);
      setPairingError(null);

      if (dbPairing.repoRef === "" && courseUrl) {
        const legacy = loadPairedRepo(courseUrl);
        if (legacy.repoRef) {
          setOverridesMigrationOwed(true);
          setPairingState({ v: 1, repoRef: legacy.repoRef, branch: legacy.branch, associations: [] });
          setPairingLoadState("ready");
          return;
        }
      }

      setPairingState(dbPairing);
      setPairingLoadState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, exportCourseId]);

  // Persist every change to the database (AC1/AC9) - the sole write path,
  // covering repo/branch picks, every association edit below, AND the
  // one-time legacy migration above (which sets `pairing` the same way a
  // fresh instructor edit would). Cancellation-guarded; a failure is
  // surfaced via `persistError` rather than swallowed the way the old
  // localStorage `catch {}` was (AC9).
  useEffect(() => {
    if (!courseRowId || pairingLoadState !== "ready") return;
    let cancelled = false;
    (async () => {
      const result = await setCourseRepoPairingAction(courseRowId, pairing);
      if (cancelled) return;
      setPersistError("error" in result ? result.error : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseRowId, pairing, pairingLoadState]);

  const repoRef = pairing.repoRef;
  const branch = pairing.branch;

  // Picking a new repo invalidates the old repo's branch choice - one atomic
  // setState (both fields on the same object), so there is no intermediate
  // render where `branch` still names the PREVIOUS repo's branch.
  const setRepoRef = (value: string) => {
    setPairingState((prev) => ({ ...prev, repoRef: value, branch: "" }));
  };
  const setBranch = (value: string) => {
    setPairingState((prev) => ({ ...prev, branch: value }));
  };

  // ── Branch list for the chosen repo ───────────────────────────────────────
  const [branches, setBranches] = useState<string[]>([]);
  const [branchesState, setBranchesState] = useState<RepoBranchesState>(repoRef.trim() ? "loading" : "idle");

  // Render-time reset (see module header): a repo change resets the branch
  // list to "loading" (or "idle" for no repo) BEFORE the effect below ever
  // runs, so that effect's own body never needs a synchronous setState.
  const [prevRepoRefForBranches, setPrevRepoRefForBranches] = useState(repoRef);
  if (repoRef !== prevRepoRefForBranches) {
    setPrevRepoRefForBranches(repoRef);
    setBranches([]);
    setBranchesState(repoRef.trim() ? "loading" : "idle");
  }

  useEffect(() => {
    if (!repoRef.trim()) return;
    if (githubState !== "ready") return; // not configured, or still checking
    let cancelled = false;
    (async () => {
      const r = await listGithubBranchesAction(repoRef);
      if (cancelled) return;
      if ("error" in r) {
        setBranches([]);
        setBranchesState("idle");
        return;
      }
      setBranches(r.branches);
      setBranchesState("ready");
    })();
    return () => {
      cancelled = true;
    };
    // Deps include githubState (not just repoRef): a persisted repo ref
    // restored before the token-configured check resolves needs this fetch
    // to re-trigger once githubState flips "loading" -> "ready", which a
    // bare [repoRef] dependency list would miss.
  }, [repoRef, githubState]);

  // ── Repo tree (AC2 consumption) ───────────────────────────────────────────
  const [folderRoot, setFolderRoot] = useState<RepoFolderNode | null>(null);
  const [treeState, setTreeState] = useState<RepoTreeState>(repoRef.trim() ? "loading" : "idle");
  const [treeError, setTreeError] = useState<string | null>(null);

  // Same render-time reset idiom as the branch list above, keyed on the pair
  // that actually determines which tree is being fetched - either changing
  // invalidates whatever tree/error was loaded for the OLD pair.
  const [prevTreeRepoRef, setPrevTreeRepoRef] = useState(repoRef);
  const [prevTreeBranch, setPrevTreeBranch] = useState(branch);
  if (repoRef !== prevTreeRepoRef || branch !== prevTreeBranch) {
    setPrevTreeRepoRef(repoRef);
    setPrevTreeBranch(branch);
    setFolderRoot(null);
    setTreeError(null);
    setTreeState(repoRef.trim() ? "loading" : "idle");
  }

  useEffect(() => {
    if (!repoRef.trim()) return;
    let cancelled = false;
    (async () => {
      // branch === "" asks getRepoTreeAction for the repo's OWN default
      // branch (github.files.ts's getRepoTree: `ref || defaultBranch`) -
      // this hook never has to resolve "what is the default branch" itself
      // before it can fetch a tree.
      const r = await getRepoTreeAction(repoRef, branch.trim() || undefined);
      if (cancelled) return;
      if ("error" in r) {
        setTreeState("error");
        setTreeError(r.error);
        return;
      }
      setFolderRoot(buildRepoFolderTree(r.tree));
      setTreeState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [repoRef, branch]);

  // findAssignmentFolderLevel is pure and cheap (a single tree walk) - no
  // need to store its result in state, only to memoize it against the one
  // thing it actually depends on.
  const folders = useMemo<RepoFolderNode[]>(() => (folderRoot ? findAssignmentFolderLevel(folderRoot) : []), [folderRoot]);
  const folderPaths = useMemo(() => folders.map((f) => f.path), [folders]);
  const filePaths = useMemo(() => folders.flatMap((f) => f.files.map((file) => file.path)), [folders]);

  // ── AC5 - gate the activation recompute on a LOADED tree ──────────────────
  // `folderPaths`/`filePaths` above go transiently empty every time a new
  // tree starts loading (folderRoot is reset to null BEFORE the fetch, in
  // the render-time reset block above) - recomputing "which associations are
  // active" against that transient empty set would flag every stored
  // association inactive for the half-second an ordinary branch switch takes
  // to reload, which is exactly the flicker/false-signal AC5 forbids. These
  // two caches only ever update on the transition INTO "ready", so they hold
  // the LAST successfully loaded tree's paths the entire time a new one is
  // loading or erroring.
  const [readyFolderPaths, setReadyFolderPaths] = useState<readonly string[]>(folderPaths);
  const [readyFilePaths, setReadyFilePaths] = useState<readonly string[]>(filePaths);
  if (treeState === "ready" && (folderPaths !== readyFolderPaths || filePaths !== readyFilePaths)) {
    setReadyFolderPaths(folderPaths);
    setReadyFilePaths(filePaths);
  }

  // ── AC11 (continued) - migrate legacy overrides once the migrated repo's
  // tree has actually loaded, so filterRepoModuleOverrides has a real folder
  // list to validate against. Render-time (see module header), not an
  // effect: the flag is cleared the moment the check runs, whether or not
  // there was anything to migrate, so this can never run twice.
  if (overridesMigrationOwed && treeState === "ready") {
    setOverridesMigrationOwed(false);
    const legacyOverrides = loadRepoModuleOverrides(courseUrl, folderPaths, modules);
    const entries = Object.entries(legacyOverrides);
    if (entries.length > 0) {
      const boundAt = new Date().toISOString();
      setPairingState((prev) => {
        let next = prev.associations;
        for (const [path, moduleId] of entries) next = upsertRepoModuleAssociation(next, path, "folder", moduleId, boundAt);
        return { ...prev, associations: next };
      });
    }
  }

  // ── Activation (AC3/AC4) + mapping (AC3 consumption) ──────────────────────
  const active = useMemo(
    () => activateRepoModulePairing(pairing.associations, readyFolderPaths, readyFilePaths, modules),
    [pairing.associations, readyFolderPaths, readyFilePaths, modules]
  );

  const mapping = useMemo<RepoModuleMappingResult>(() => {
    const base = mapRepoFoldersToModules(folderPaths, modules);
    return applyRepoModuleOverrides(base, active.folderOverrides, modules);
  }, [folderPaths, modules, active.folderOverrides]);

  const setAssociation = (path: string, kind: RepoAssociationKind, moduleId: string | null) => {
    setPairingState((prev) => ({
      ...prev,
      associations: upsertRepoModuleAssociation(prev.associations, path, kind, moduleId, new Date().toISOString()),
    }));
  };

  // ── Selection pruning refs (AC6 of the earlier repo-pairing feature) ─────
  const repoModuleRefs: RepoModuleRefs[] | null = useMemo(() => {
    if (!folderRoot) return null; // no tree supplied yet - see this hook's own doc comment
    return folders.map((f) => ({ ref: f.path, itemRefs: f.files.map((file) => file.path) }));
  }, [folderRoot, folders]);

  return {
    githubState,
    repos,
    reposError,
    pairingLoadState,
    pairingError,
    persistError,
    repoRef,
    setRepoRef,
    branch,
    setBranch,
    branches,
    branchesState,
    treeState,
    treeError,
    folders,
    mapping,
    folderOverrides: active.folderOverrides,
    fileOverrides: active.fileOverrides,
    inactiveAssociations: active.inactive,
    setAssociation,
    repoModuleRefs,
  };
}
