"use client";

import dynamic from "next/dynamic";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Autocomplete from "@mui/material/Autocomplete";
import PublishToCanvasPage from "../PublishToCanvasPage";
import CopilotChatPanel from "../CopilotChatPanel";
import { submitOnEnter } from "../ui/submitOnEnter";
import type { RepoTreeEntry } from "@/lib/github";
import type { useFilesTab } from "./useFilesTab";
import styles from "../../page.module.css";

// Monaco (the VS Code editor) is client-only; load it lazily with SSR disabled.
const MonacoFileEditor = dynamic(() => import("../MonacoFileEditor"), {
  ssr: false,
  loading: () => (
    <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-4)", fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: "var(--radius-round)",
          border: "2px solid color-mix(in srgb, var(--accent) 20%, transparent 80%)",
          borderTopColor: "var(--accent-ink)",
          animation: "ta-spin 0.8s linear infinite",
        }}
      />
      Loading editor...
    </div>
  ),
});

type FilesTabState = ReturnType<typeof useFilesTab>;

export function FilesTab({ branch, files }: { branch: string; files: FilesTabState }) {
  const {
    treeState,
    filter,
    setFilter,
    collapsedDirs,
    treeWidth,
    startTreeResize,
    selectedPath,
    setSelectedPath,
    fileContent,
    editContent,
    setEditContent,
    fileState,
    commitMessage,
    setCommitMessage,
    committing,
    commitMsg,
    showNewFile,
    setShowNewFile,
    newFilePath,
    setNewFilePath,
    newFileDest,
    setNewFileDest,
    newFileContent,
    setNewFileContent,
    newFileMsg,
    setNewFileMsg,
    creatingFile,
    newFileError,
    setNewFileError,
    showNewFolder,
    setShowNewFolder,
    newFolderPath,
    setNewFolderPath,
    newFolderDest,
    setNewFolderDest,
    newFolderMsg,
    setNewFolderMsg,
    creatingFolder,
    newFolderError,
    setNewFolderError,
    bulkFolders,
    setBulkFolders,
    folderStart,
    setFolderStart,
    folderCount,
    setFolderCount,
    newFolderResult,
    setNewFolderResult,
    selectedPaths,
    bulkBusy,
    bulkMsg,
    showMove,
    setShowMove,
    moveDest,
    setMoveDest,
    handleCommit,
    handleCreateFile,
    handleCreateFolder,
    toggleSelected,
    toggleCollapsedDir,
    collapseAllDirs,
    expandAllDirs,
    handleBulkDelete,
    handleBulkMove,
    clearSelection,
    folderOptions,
    collapseActive,
    entryList,
    allEntriesSelected,
    someEntriesSelected,
    toggleSelectAll,
  } = files;

  return (
    <>
      {showNewFile && (
        <div className={`${styles.ghPanel} ${styles.ghPanelStack}`} style={{ marginTop: "var(--space-2)" }}>
          <Autocomplete
            freeSolo
            options={folderOptions}
            inputValue={newFileDest}
            onInputChange={(_, v) => setNewFileDest(v)}
            renderInput={(params) => <TextField {...params} label="Destination folder (optional)" size="small" placeholder="empty = repo root" />}
            sx={{ "& .MuiInputBase-input": { fontFamily: "monospace", fontSize: "var(--font-size-sm)" } }}
          />
          <TextField
            size="small"
            fullWidth
            placeholder="File name or path, e.g. new.ts (relative to destination)"
            value={newFilePath}
            onChange={(e) => setNewFilePath(e.target.value)}
            disabled={creatingFile}
            sx={{ "& input": { fontFamily: "monospace", fontSize: "var(--font-size-sm)" } }}
          />
          <TextField
            multiline
            minRows={6}
            fullWidth
            placeholder="File contents (optional)"
            value={newFileContent}
            onChange={(e) => setNewFileContent(e.target.value)}
            disabled={creatingFile}
            sx={{ "& textarea": { fontFamily: "monospace", fontSize: "var(--font-size-sm)" } }}
          />
          <TextField
            size="small"
            fullWidth
            placeholder="Commit message (optional)"
            value={newFileMsg}
            onChange={(e) => setNewFileMsg(e.target.value)}
            onKeyDown={submitOnEnter(handleCreateFile)}
            disabled={creatingFile}
          />
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button variant="contained" size="small" disabled={creatingFile || !newFilePath.trim()} onClick={handleCreateFile}>
              {creatingFile ? "Creating..." : `Create file on ${branch}`}
            </Button>
            <Button variant="text" size="small" onClick={() => setShowNewFile(false)}>
              Cancel
            </Button>
          </div>
          {newFileError && <p className={styles.error}>{newFileError}</p>}
        </div>
      )}

      {showNewFolder && (
        <div className={`${styles.ghPanel} ${styles.ghPanelStack}`} style={{ marginTop: "var(--space-2)" }}>
          <FormControlLabel
            control={<Checkbox size="small" checked={bulkFolders} onChange={(e) => { setBulkFolders(e.target.checked); setNewFolderError(null); setNewFolderResult(null); }} />}
            label="Create multiple folders"
          />
          <Autocomplete
            freeSolo
            options={folderOptions}
            inputValue={newFolderDest}
            onInputChange={(_, v) => setNewFolderDest(v)}
            renderInput={(params) => <TextField {...params} label="Destination folder (optional)" size="small" placeholder="empty = repo root" />}
            sx={{ "& .MuiInputBase-input": { fontFamily: "monospace", fontSize: "var(--font-size-sm)" } }}
          />
          <TextField
            size="small"
            fullWidth
            placeholder={bulkFolders ? "Name pattern, e.g. Module {n}" : "Folder path, e.g. docs/guides"}
            value={newFolderPath}
            onChange={(e) => setNewFolderPath(e.target.value)}
            onKeyDown={submitOnEnter(handleCreateFolder)}
            disabled={creatingFolder}
            sx={{ "& input": { fontFamily: "monospace", fontSize: "var(--font-size-sm)" } }}
          />
          {bulkFolders && (
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <TextField
                size="small"
                type="number"
                label="Start"
                value={folderStart}
                onChange={(e) => setFolderStart(e.target.value)}
                disabled={creatingFolder}
                sx={{ width: 120 }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                size="small"
                type="number"
                label="Count"
                value={folderCount}
                onChange={(e) => setFolderCount(e.target.value)}
                disabled={creatingFolder}
                sx={{ width: 120 }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </div>
          )}
          <TextField
            size="small"
            fullWidth
            placeholder="Commit message (optional)"
            value={newFolderMsg}
            onChange={(e) => setNewFolderMsg(e.target.value)}
            onKeyDown={submitOnEnter(handleCreateFolder)}
            disabled={creatingFolder}
          />
          <p className={styles.fieldHint}>
            {bulkFolders
              ? "Use {n} in the pattern for the number (otherwise it is appended). Each folder gets a .gitkeep since Git does not track empty folders."
              : "Git does not track empty folders, so a .gitkeep file is added inside the new folder."}
          </p>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button variant="contained" size="small" disabled={creatingFolder || !newFolderPath.trim()} onClick={handleCreateFolder}>
              {creatingFolder ? "Creating..." : bulkFolders ? `Create folders on ${branch}` : `Create folder on ${branch}`}
            </Button>
            <Button variant="text" size="small" onClick={() => setShowNewFolder(false)}>
              Cancel
            </Button>
          </div>
          {newFolderError && <p className={styles.error}>{newFolderError}</p>}
          {newFolderResult && <p className={styles.fieldHint}>{newFolderResult}</p>}
        </div>
      )}

      {selectedPaths.size > 0 && (
        <div className={`${styles.ghPanel} ${styles.ghPanelStack}`} style={{ marginTop: "var(--space-2)" }}>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--font-size-md)", fontWeight: 500 }}>{selectedPaths.size} selected</span>
            <Button variant="outlined" size="small" color="error" disabled={bulkBusy} onClick={handleBulkDelete}>
              {bulkBusy ? "Working..." : "Delete"}
            </Button>
            <Button variant="outlined" size="small" disabled={bulkBusy} onClick={() => setShowMove((v) => !v)}>
              {showMove ? "Cancel move" : "Move to..."}
            </Button>
            <Button variant="text" size="small" onClick={clearSelection}>
              Clear
            </Button>
          </div>
          {showMove && (
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
              <Autocomplete
                freeSolo
                options={folderOptions}
                inputValue={moveDest}
                onInputChange={(_, v) => setMoveDest(v)}
                renderInput={(params) => <TextField {...params} label="Destination folder" size="small" placeholder="e.g. src/components (empty = repo root)" />}
                sx={{ minWidth: 260, "& .MuiInputBase-input": { fontFamily: "monospace", fontSize: "var(--font-size-sm)" } }}
              />
              <Button variant="contained" size="small" disabled={bulkBusy} onClick={handleBulkMove}>
                {bulkBusy ? "Moving..." : `Move ${selectedPaths.size} to ${moveDest.trim() ? moveDest.trim() : "root"}`}
              </Button>
            </div>
          )}
          {bulkMsg && (
            <p className={bulkMsg.kind === "error" ? styles.error : styles.fieldHint} style={{ margin: 0 }}>
              {bulkMsg.text}
            </p>
          )}
        </div>
      )}

      <div className={styles.ghSplit}>
        <div className={`${styles.ghPanel} ${styles.ghSplitTree}`} style={{ width: treeWidth }}>
          <div className={styles.ghPanelHead} style={{ marginBottom: "var(--space-2)" }}>
            <label className={styles.panelTitle}>Files</label>
            <div className={styles.ghPanelHeadRight}>
              <Button
                variant="text"
                size="small"
                onClick={() => { setShowNewFile((v) => !v); setShowNewFolder(false); setNewFileError(null); if (!showNewFile) { setNewFileDest(""); } }}
              >
                {showNewFile ? "Cancel" : "New file"}
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={() => { setShowNewFolder((v) => !v); setShowNewFile(false); setNewFolderError(null); setNewFolderResult(null); if (!showNewFolder) { setNewFolderDest(""); } }}
              >
                {showNewFolder ? "Cancel" : "New folder"}
              </Button>
            </div>
          </div>
          <TextField
            size="small"
            fullWidth
            placeholder="Filter files"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={treeState === "loading"}
          />
          {treeState === "ready" && entryList.length > 0 && (
            <>
              <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                <Button
                  variant="text"
                  size="small"
                  disabled={!collapseActive}
                  onClick={collapseAllDirs}
                  title={collapseActive ? "" : "Clear the search to fold folders"}
                >
                  Collapse all
                </Button>
                <Button
                  variant="text"
                  size="small"
                  disabled={!collapseActive || collapsedDirs.size === 0}
                  onClick={expandAllDirs}
                  title={collapseActive ? "" : "Clear the search to fold folders"}
                >
                  Expand all
                </Button>
              </div>
              <FormControlLabel
                sx={{ marginTop: "var(--space-1)", marginLeft: "calc(var(--space-1) * -1)" }}
                control={
                  <Checkbox
                    size="small"
                    checked={allEntriesSelected}
                    indeterminate={someEntriesSelected && !allEntriesSelected}
                    onChange={toggleSelectAll}
                    sx={{ padding: "var(--space-1)" }}
                  />
                }
                label={
                  <span className={styles.ghMeta}>
                    {allEntriesSelected ? "Deselect all" : "Select all"}
                    {filter.trim() ? " (filtered)" : ""} · {entryList.length}
                  </span>
                }
              />
            </>
          )}
          <div className={styles.ghTreeList}>
            {treeState === "loading" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--space-2)", padding: "var(--space-4)" }} role="status" aria-live="polite">
                <CircularProgress size={24} />
                <span style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>Loading files...</span>
              </div>
            )}
            {treeState === "error" && <p className={styles.error}>Failed to load files</p>}
            {treeState === "ready" &&
              entryList.map((entry: RepoTreeEntry) => {
                const depth = entry.path.split("/").length - 1;
                const name = entry.path.split("/").pop() || entry.path;
                const indent = depth * 14 + 8;
                const isCollapsed = collapsedDirs.has(entry.path);
                return (
                  <div
                    key={entry.path}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-1)",
                      backgroundColor: selectedPath === entry.path ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent",
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={selectedPaths.has(entry.path)}
                      onChange={() => toggleSelected(entry.path)}
                      sx={{ padding: "var(--space-1)" }}
                    />
                    {entry.type === "blob" ? (
                      <>
                        <div style={{ width: 24, display: "flex", justifyContent: "center" }} />
                        <Button
                          variant="text"
                          onClick={() => setSelectedPath(entry.path)}
                          title={entry.path}
                          sx={{
                            justifyContent: "flex-start",
                            textTransform: "none",
                            flex: 1,
                            minWidth: 0,
                            fontFamily: "monospace",
                            fontSize: "var(--font-size-sm)",
                            pl: `${indent}px`,
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%", textAlign: "left" }}>
                            {name}
                          </span>
                        </Button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCollapsedDir(entry.path);
                          }}
                          aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${name}`}
                          style={{
                            width: 24,
                            height: 24,
                            padding: 0,
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--text-secondary)",
                            fontSize: "var(--font-size-xs)",
                            lineHeight: "1em",
                          }}
                        >
                          {isCollapsed ? "▸" : "▾"}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCollapsedDir(entry.path);
                          }}
                          title={entry.path}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontFamily: "monospace",
                            fontSize: "var(--font-size-sm)",
                            fontWeight: 600,
                            color: "var(--text-secondary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            padding: "var(--space-1) var(--space-2)",
                            paddingLeft: `${indent}px`,
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          {name}/
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        <div
          className={styles.ghSplitDivider}
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize the file list"
          onPointerDown={startTreeResize}
        />

        <div style={{ flex: 1, minWidth: 0, display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "flex-start" }}>
          <div className={styles.ghPanel} style={{ flex: "2 1 400px", minWidth: 320 }}>
          {!selectedPath ? (
            <p className={styles.fieldHint} style={{ margin: 0 }}>Select a file to view and edit it.</p>
          ) : (
            <>
              <p className={`${styles.ghMeta} ${styles.ghMetaMono}`} style={{ marginTop: 0, marginBottom: "var(--space-2)" }}>
                {selectedPath}
              </p>
              {fileState === "loading" ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--space-2)", padding: "var(--space-4)" }} role="status" aria-live="polite">
                  <CircularProgress size={24} />
                  <span style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>Loading file...</span>
                </div>
              ) : (
                <>
                  <MonacoFileEditor
                    path={selectedPath}
                    value={editContent}
                    onChange={setEditContent}
                    height="60vh"
                  />
                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Commit message"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      onKeyDown={submitOnEnter(handleCommit)}
                      disabled={committing}
                      sx={{ flex: "1 1 200px" }}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      disabled={committing || !commitMessage.trim() || editContent === fileContent}
                      onClick={handleCommit}
                    >
                      {committing ? "Committing..." : `Commit to ${branch}`}
                    </Button>
                  </div>
                  {commitMsg && (
                    <p style={{ marginTop: "var(--space-2)", fontSize: "var(--font-size-md)", color: commitMsg.startsWith("Committed") ? "var(--success)" : "var(--danger)" }}>
                      {commitMsg}
                    </p>
                  )}
                  <div style={{ marginTop: "var(--space-3)" }}>
                    <PublishToCanvasPage filePath={selectedPath} content={editContent} />
                  </div>
                </>
              )}
            </>
          )}
          </div>
          {selectedPath && (
            <div style={{ flex: "1 1 300px", minWidth: 280 }}>
              <CopilotChatPanel filePath={selectedPath} fileContent={editContent} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
