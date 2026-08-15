"use client";

// Repo pairing in Modules - AC1, AC9, AC10 (docs/repo-pairing-in-modules-
// acceptance-criteria.md). The render half of the feature; useRepoPairing.ts
// is the data half (all fetches/effects live there, none here), and
// repoPairingState.ts is the persistence half (pure, no React). This split
// mirrors useVideoRepoPickers.ts's own hook/render division for the sibling
// in-Modules repo picker.
//
// AC9 DECISION, RECORDED HERE AS THE ACCEPTANCE CRITERIA REQUIRE: this is a
// SEPARATE RENDER REGION, not merged into the module tree. `displayModules`
// (ModulesView.tsx:135) is an EITHER/OR choice - `canvasModulesToDisplay(modules)`
// OR `cartridgeModulesToDisplay(exportModules ?? [])`, never a merge of the
// two - and every consumer downstream of it (ModuleCard, ModuleItemRow) is
// typed against `DisplayModule`/`DisplayModuleItem`, whose `.raw` escape
// hatch (the exact live CanvasModule/CanvasModuleItem) is what every Canvas
// WRITE control in those two components calls through once
// contentSourceGating.ts has allowed it (display-module-tree.ts's own header
// comment, docs/REGRESSION.md entry 264 check 9). A repo folder/file is
// WRITE-INCAPABLE by construction (AC7/AC8 - it has no Canvas identity at
// all to write through), so threading it in as a third `DisplayModule`
// variant would force `.raw` to become optional everywhere it is currently
// guaranteed-present-for-canvas, reopening every one of ModuleCard's and
// ModuleItemRow's write branches to a case they must always refuse - for a
// component that only ever needs to reach the SAME selection Sets
// (`selected`/`selectedModules`) those two components already read, not
// their rendering machinery. A sibling region reaches those same Sets with
// its own small set of checkboxes instead, at zero risk to the hundreds of
// lines of existing Canvas-write logic those two components carry.
//
// AC10 - EVERY DEGRADED CASE STATES ITSELF IN VISIBLE TEXT, never a silent
// empty state: no GitHub token configured (`githubState === "unconfigured"`),
// the repo list itself failing to load (`githubState === "error"`), a tree
// fetch failing or being rate-limited (`treeState === "error"` -
// `treeError` is `getRepoTreeAction`'s own message, which already
// distinguishes a 401/403/429/404 - see github.repos.ts's `ghError` - so
// this component surfaces it verbatim rather than re-classifying it into a
// second, competing wording), a repo with no assignment folders at all
// (`folders.length === 0` once `treeState === "ready"` - rendered as an
// explicit "No pairing found" state, never as an empty successful list per
// AC10's own wording), and one folder mapping to nothing (`state ===
// "unbound"` - its own card still renders, with an honest "No module match"
// badge, never hidden). A folder holding only README.md/.gitkeep - the
// instructor's actual repo shape, see docs/REGRESSION.md entry 298 - is
// deliberately NOT one of these degraded cases: it renders as a completely
// normal, selectable folder card with its two boilerplate files listed like
// any other file, exactly as repo-folder-tree.ts's own header defends.

import type React from "react";
import { Button, Checkbox, MenuItem, TextField } from "@mui/material";
import styles from "../../../page.module.css";
import Typeahead, { type TypeaheadOption } from "../../ui/Typeahead";
import { formatBytes, repoItemKey, repoModuleKey } from "../utils";
import type { RepoFolderNode } from "@/lib/repo-folder-tree";
import type { RepoFolderPairing, RepoModuleMappingModule } from "@/lib/repo-module-mapping";
import type { UseRepoPairingReturn } from "./useRepoPairing";

export interface RepoFoldersSectionProps {
  repoPairing: UseRepoPairingReturn;
  /** The modules currently on screen (AC3's own "modules currently on
   * screen") - the SAME list ModulesView built for `useRepoPairing` itself,
   * passed again here only for the override <select>'s options, so this
   * component never has to re-derive it from `DisplayModule[]` on its own. */
  courseModules: RepoModuleMappingModule[];
  selected: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedModules: Set<string>;
  setSelectedModules: React.Dispatch<React.SetStateAction<Set<string>>>;
}

const mutedHint: React.CSSProperties = { fontSize: "0.82rem", color: "var(--text-secondary)", margin: 0 };

/** One folder's pairing state, worded honestly for every one of the four
 * states (AC3/AC10) - never upgrading a suggestion or hiding an ambiguity. */
function pairingBadgeText(pairing: RepoFolderPairing | undefined): string {
  if (!pairing) return "";
  if (pairing.overridden) return `Paired with "${pairing.module?.moduleName ?? ""}" (set manually)`;
  switch (pairing.state) {
    case "confirmed":
      return `Paired with "${pairing.module?.moduleName ?? ""}"`;
    case "suggested":
      return `Suggested: "${pairing.module?.moduleName ?? ""}" (by name - no module number matched)`;
    case "ambiguous":
      return `Ambiguous - ${pairing.candidates.length} possible modules. Pick one below.`;
    case "unbound":
    default:
      return "No module match found";
  }
}

export function RepoFoldersSection({
  repoPairing,
  courseModules,
  selected,
  setSelected,
  selectedModules,
  setSelectedModules,
}: RepoFoldersSectionProps) {
  const {
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
  } = repoPairing;

  // Synthetic-option pattern (CoursePicker.tsx:238-267, AC1): a persisted
  // repo ref not (yet) present in the loaded list still renders as itself
  // rather than blanking the Typeahead. Simpler than CoursePicker's own case:
  // the persisted VALUE here ("owner/name") already IS the display label, so
  // there is no separate name to resolve or cache - the synthetic option's
  // label is just `repoRef` verbatim.
  const repoOptions: TypeaheadOption[] =
    repoRef && !repos.some((r) => r.fullName === repoRef)
      ? [
          ...repos.map((r) => ({ value: r.fullName, label: r.fullName, hint: r.private ? "Private" : undefined })),
          { value: repoRef, label: repoRef },
        ]
      : repos.map((r) => ({ value: r.fullName, label: r.fullName, hint: r.private ? "Private" : undefined }));

  const branchOptions: TypeaheadOption[] = branches.map((b, i) => ({ value: b, label: i === 0 ? `${b} (default)` : b }));

  const toggleFolderSelected = (folderPath: string) => {
    const key = repoModuleKey(folderPath);
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleFileSelected = (folderPath: string, filePath: string) => {
    const key = repoItemKey(folderPath, filePath);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllFilesInFolder = (folder: RepoFolderNode) => {
    const keys = folder.files.map((f) => repoItemKey(folder.path, f.path));
    if (keys.length === 0) return;
    const allOn = keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (allOn) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "18px 20px",
        border: "1px solid var(--card-border)",
        borderRadius: 16,
        background: "var(--card-background)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className={styles.panelTitle}>Paired repository</span>
        <p style={mutedHint}>
          Pick a code repo to pair with this course. Its assignment folders are matched to modules by number, and the
          matched folders/files can be added to the selection above (download and generation only - never a Canvas
          write; see this section&apos;s own header comment).
        </p>
      </div>

      {/* AC10: no GitHub token configured - the same wording
          GithubRepoPicker.tsx already uses for this exact case, so an
          instructor who has seen that picker recognizes this one instantly. */}
      {githubState === "unconfigured" && (
        <p style={mutedHint}>
          GitHub isn&apos;t configured. Set the <code>GITHUB_TOKEN</code> environment variable to enable repository
          pairing.
        </p>
      )}

      {/* AC10: the repo LIST itself failed to load - distinct from no repo
          being selected yet, and distinct from a per-repo tree failure
          below. */}
      {githubState === "error" && (
        <p style={{ ...mutedHint, color: "var(--danger)" }}>{reposError ?? "Could not load GitHub repositories."}</p>
      )}

      {(githubState === "ready" || githubState === "loading") && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 260px" }}>
            <Typeahead
              options={repoOptions}
              value={repoRef}
              onChange={setRepoRef}
              placeholder={githubState === "loading" ? "Loading repositories…" : "Select a repository…"}
              disabled={githubState === "loading"}
              loading={githubState === "loading"}
              noOptionsText="No repositories found"
            />
          </div>
          {repoRef.trim() && (
            <div style={{ flex: "0 1 200px" }}>
              <Typeahead
                options={branchOptions}
                value={branch}
                onChange={setBranch}
                placeholder={branchesState === "loading" ? "Loading branches…" : "Default branch"}
                disabled={branchesState !== "ready"}
                loading={branchesState === "loading"}
                noOptionsText="No branches found"
              />
            </div>
          )}
        </div>
      )}

      {repoRef.trim() && treeState === "loading" && <p style={mutedHint}>Loading repository contents…</p>}

      {/* AC10: the tree fetch failed or was rate-limited - `treeError` is
          getRepoTreeAction's own message, already status-differentiated (see
          this file's own header comment), surfaced verbatim rather than
          reclassified. */}
      {repoRef.trim() && treeState === "error" && (
        <p style={{ ...mutedHint, color: "var(--danger)" }}>{treeError ?? "Could not read the repository."}</p>
      )}

      {/* AC10: a repo that maps to nothing renders as an explicit "no
          pairing found", never as an empty successful state. */}
      {repoRef.trim() && treeState === "ready" && folders.length === 0 && (
        <p style={mutedHint}>No pairing found - this repository has no assignment folders to pair with modules.</p>
      )}

      {repoRef.trim() && treeState === "ready" && folders.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {folders.map((folder) => {
            const pairing = mapping.pairings.find((p) => p.folderPath === folder.path);
            const moduleKey = repoModuleKey(folder.path);
            const fileKeys = folder.files.map((f) => repoItemKey(folder.path, f.path));
            const allFilesSelected = fileKeys.length > 0 && fileKeys.every((k) => selected.has(k));

            return (
              <div key={folder.path} className={styles.ccModule}>
                <div className={styles.ccHead}>
                  <Checkbox
                    checked={selectedModules.has(moduleKey)}
                    onChange={() => toggleFolderSelected(folder.path)}
                    aria-label={`Select repo folder ${folder.path}`}
                    title="Select this folder"
                    size="small"
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => toggleAllFilesInFolder(folder)}
                    disabled={fileKeys.length === 0}
                    title={allFilesSelected ? "Deselect every file in this folder" : "Select every file in this folder"}
                  >
                    {allFilesSelected ? "Deselect files" : "Select files"}
                  </Button>
                  <span className={styles.ccName} title={folder.path}>
                    {folder.path}
                  </span>
                  <span className={styles.ccCount}>
                    {folder.files.length} file{folder.files.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className={styles.ccHint} style={{ padding: "0 6px 6px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span>{pairingBadgeText(pairing)}</span>
                  {courseModules.length > 0 && (
                    <TextField
                      select
                      size="small"
                      variant="standard"
                      value={overrides[folder.path] ?? ""}
                      onChange={(e) => setOverride(folder.path, e.target.value || null)}
                      label="Pair with"
                      style={{ minWidth: 180 }}
                    >
                      <MenuItem value="">Auto (use suggested pairing)</MenuItem>
                      {courseModules.map((m) => (
                        <MenuItem key={String(m.id)} value={String(m.id)}>
                          {m.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                </div>
                <div className={styles.ccItems}>
                  {folder.files.map((file) => {
                    const key = repoItemKey(folder.path, file.path);
                    return (
                      <div key={file.path} className={styles.ccItem}>
                        <Checkbox
                          checked={selected.has(key)}
                          onChange={() => toggleFileSelected(folder.path, file.path)}
                          aria-label={`Select repo file ${file.path}`}
                          title="Select this file"
                          size="small"
                        />
                        <span className={styles.ccType}>File</span>
                        <span className={styles.ccItemName}>{file.name}</span>
                        <span className={styles.ccCount}>{formatBytes(file.size)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* AC3: unmapped folders are visible above (every "unbound" card's
              own honest badge); unmapped MODULES are reported here so the
              symmetry AC3 requires is actually on screen, not just in the
              data. */}
          {mapping.unmappedModules.length > 0 && (
            <p style={mutedHint}>
              No repo folder maps to: {mapping.unmappedModules.map((m) => m.name).join(", ")}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
