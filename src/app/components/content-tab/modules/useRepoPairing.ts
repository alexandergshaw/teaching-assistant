"use client";

// Repo pairing in Modules - the WIRING wave over the four pure foundations
// docs/REGRESSION.md entry 298 already shipped (repo-folder-tree.ts,
// repo-module-mapping.ts, the repo:/export: selection-key scheme, and
// useModuleSelection's repo arm). This hook is the only thing in this file
// set that talks to a network action - RepoFoldersSection.tsx (the render
// half) and repoPairingState.ts (the pure persistence half) both stay free
// of fetch/action calls, mirroring useVideoRepoPickers.ts's own hook/render
// split for the sibling in-Modules repo picker.
//
// STATE-RESET IDIOM (AC1-AC3): this repo's eslint rejects setState reached
// SYNCHRONOUSLY from inside a useEffect body. Every reset this hook needs
// when its inputs change (a new repo picked -> forget the old branch list and
// tree; a new branch picked, or the tree's own source inputs change -> forget
// the old tree) uses the "adjust state during render" idiom CoursePicker.tsx
// already established for its own institution-change reset (see that file's
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
// selection against" (`repoModuleRefs`, AC6 - fed straight into
// useModuleSelection's own `repoModules` param in ModulesView.tsx).

import { useEffect, useMemo, useState } from "react";
import type { GithubRepo } from "@/lib/github";
import {
  githubConfiguredAction,
  getRepoTreeAction,
  listGithubBranchesAction,
  listGithubReposAction,
} from "../../../actions";
import { buildRepoFolderTree, findAssignmentFolderLevel, type RepoFolderNode } from "@/lib/repo-folder-tree";
import {
  applyRepoModuleOverrides,
  mapRepoFoldersToModules,
  type RepoModuleMappingModule,
  type RepoModuleMappingResult,
  type RepoModuleOverrideMap,
} from "@/lib/repo-module-mapping";
import type { RepoModuleRefs } from "./useModuleSelection";
import { loadPairedRepo, loadRepoModuleOverrides, persistPairedRepo, persistRepoModuleOverrides } from "./repoPairingState";

/** Whether the GitHub token is configured at all (AC10's first degraded
 * case) - mirrors GithubRepoPicker.tsx's own three-plus-loading state
 * exactly, so an instructor who has seen that picker already reads this
 * one's states for free. "error" is listGithubReposAction failing for a
 * REASON OTHER than being unconfigured (a transient network failure, a
 * malformed token that still "is configured" by env-var presence, etc). */
export type GithubReposState = "loading" | "unconfigured" | "ready" | "error";

export type RepoTreeState = "idle" | "loading" | "ready" | "error";
export type RepoBranchesState = "idle" | "loading" | "ready";

export interface UseRepoPairingReturn {
  githubState: GithubReposState;
  repos: GithubRepo[];
  reposError: string | null;

  /** "owner/name", or "" for none selected. Persisted per course
   * (repoPairingState.ts). */
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

  /** Every folder mapped against `modules` (AC3), with any stored override
   * (AC4) already applied. Always a real result (never null) - folders.length
   * === 0 is what the caller checks for the "no pairing found" case, not this
   * being null. */
  mapping: RepoModuleMappingResult;
  overrides: RepoModuleOverrideMap;
  /** Sets (or, with `moduleId: null`, clears) one folder's override, and
   * persists the resulting map immediately (AC4). */
  setOverride: (folderPath: string, moduleId: string | null) => void;

  /** Reduced to exactly what useModuleSelection's pruning needs
   * (RepoModuleRefs, AC6) - null while no tree has been supplied yet (no
   * repo picked, or the tree hasn't finished loading/errored), which is the
   * deliberate "leave repo keys alone, nothing to confirm or refute them
   * against yet" signal pruneSelectionForModules's own doc comment
   * describes; a real (possibly empty) array once `treeState === "ready"`. */
  repoModuleRefs: RepoModuleRefs[] | null;
}

/**
 * Repo pairing in Modules (docs/repo-pairing-in-modules-acceptance-criteria.md
 * AC1-AC4, AC10): loads the GitHub repo list, the chosen repo's branch list
 * and tree, and derives the folder-to-module mapping, keeping a persisted
 * override map in sync. `courseUrl` keys persistence PER COURSE
 * (repoPairingState.ts); `modules` is "the modules currently on screen" -
 * ModulesView.tsx passes it built from `displayModules` (live Canvas or
 * export, whichever is active - AC3's own "map folders to the modules
 * currently on screen").
 */
export function useRepoPairing(courseUrl: string, modules: readonly RepoModuleMappingModule[]): UseRepoPairingReturn {
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

  // ── Persisted repo + branch choice (AC1) ──────────────────────────────────
  // Lazy-init from storage once (this component's own key is `courseUrl`;
  // ModulesView remounts on a course change - see useLmsSyllabusButtons.ts's
  // own doc comment on `modules` for why that means no "courseUrl changed
  // under a live hook" case exists to handle here), write-on-change effect
  // below - the same read-on-init/write-on-change split every other `ta-`
  // control in this tab uses (useLmsSyllabusButtons.ts:109-122).
  const initial = useMemo(() => loadPairedRepo(courseUrl), [courseUrl]);
  const [repoRef, setRepoRefState] = useState<string>(initial.repoRef);
  const [branch, setBranchState] = useState<string>(initial.branch);

  useEffect(() => {
    persistPairedRepo(courseUrl, { repoRef, branch });
  }, [courseUrl, repoRef, branch]);

  // Picking a new repo invalidates the old repo's branch choice - done here,
  // in the plain event-handler function exposed to the caller's Typeahead
  // onChange, NOT in an effect, so both setStates land in the same React
  // batch with no intermediate render where `branch` still names the
  // PREVIOUS repo's branch.
  const setRepoRef = (value: string) => {
    setRepoRefState(value);
    setBranchState("");
  };
  const setBranch = (value: string) => setBranchState(value);

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

  // ── Instructor overrides (AC4) ────────────────────────────────────────────
  const [overrides, setOverridesState] = useState<RepoModuleOverrideMap>(() =>
    loadRepoModuleOverrides(courseUrl, folderPaths, modules)
  );

  // Render-time reload, filtered against CURRENT reality (repoPairingState.ts's
  // loadRepoModuleOverrides), whenever the folder set or the module list
  // this override map is validated against actually changes reference -
  // mirrors useModuleSelection.ts's own multi-input `prunedFor`/
  // `prunedForExport`/`prunedForRepo` block for the identical "several
  // inputs, any of which invalidates cached derived state" shape.
  const [prevOverridesFolderRoot, setPrevOverridesFolderRoot] = useState(folderRoot);
  const [prevOverridesModules, setPrevOverridesModules] = useState(modules);
  if (folderRoot !== prevOverridesFolderRoot || modules !== prevOverridesModules) {
    setPrevOverridesFolderRoot(folderRoot);
    setPrevOverridesModules(modules);
    setOverridesState(loadRepoModuleOverrides(courseUrl, folderPaths, modules));
  }

  useEffect(() => {
    persistRepoModuleOverrides(courseUrl, overrides);
  }, [courseUrl, overrides]);

  const setOverride = (folderPath: string, moduleId: string | null) => {
    setOverridesState((prev) => {
      if (moduleId === null) {
        if (!(folderPath in prev)) return prev;
        const next = { ...prev };
        delete next[folderPath];
        return next;
      }
      if (prev[folderPath] === moduleId) return prev;
      return { ...prev, [folderPath]: moduleId };
    });
  };

  // ── Mapping (AC3 consumption + AC4 overlay) ───────────────────────────────
  const mapping = useMemo<RepoModuleMappingResult>(() => {
    const base = mapRepoFoldersToModules(folderPaths, modules);
    return applyRepoModuleOverrides(base, overrides, modules);
  }, [folderPaths, modules, overrides]);

  // ── Selection pruning refs (AC6) ──────────────────────────────────────────
  const repoModuleRefs: RepoModuleRefs[] | null = useMemo(() => {
    if (!folderRoot) return null; // no tree supplied yet - see this hook's own doc comment
    return folders.map((f) => ({ ref: f.path, itemRefs: f.files.map((file) => file.path) }));
  }, [folderRoot, folders]);

  return {
    githubState,
    repos,
    reposError,
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
    overrides,
    setOverride,
    repoModuleRefs,
  };
}
