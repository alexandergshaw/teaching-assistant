"use client";

import { Autocomplete, Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import type { CanvasModule } from "@/lib/canvas-modules";
import type { RecordingFile } from "@/lib/recording-files";
import styles from "../../../page.module.css";
import type { DisplayModule } from "../display-module-tree";
import { LIVE_CONTENT_SOURCE, gateOperation, type ContentSourceContext } from "../contentSourceGating";

export interface AddItemRowProps {
  /** The display view-model for this module (either source). Every control
   * below needs `m.raw` (the exact live CanvasModule, present only when
   * `m.source` is "canvas") - see this component's own gating check for why
   * an export-sourced module never reaches past it. */
  m: DisplayModule;
  busy: boolean;
  /** Which Course Content source is active - see contentSourceGating.ts.
   * Optional, defaulted to LIVE_CONTENT_SOURCE so every existing call site
   * (none of which pass this yet) is unaffected. */
  sourceContext?: ContentSourceContext;
  addType: Record<number, string>;
  setAddType: (v: Record<number, string> | ((p: Record<number, string>) => Record<number, string>)) => void;
  openVideoPicker: (m: CanvasModule) => Promise<void>;
  openRepoPicker: (m: CanvasModule) => Promise<void>;
  addFileFormat: Record<number, "docx" | "pptx">;
  setAddFileFormat: (v: Record<number, "docx" | "pptx"> | ((p: Record<number, "docx" | "pptx">) => Record<number, "docx" | "pptx">)) => void;
  addAiPrompt: Record<number, string>;
  setAddAiPrompt: (v: Record<number, string> | ((p: Record<number, string>) => Record<number, string>)) => void;
  addAiBusy: Record<number, boolean>;
  addAiGenerate: (m: CanvasModule) => Promise<void>;
  addFileContent: Record<number, string>;
  setAddFileContent: (v: Record<number, string> | ((p: Record<number, string>) => Record<number, string>)) => void;
  addUrl: Record<number, string>;
  setAddUrl: (v: Record<number, string> | ((p: Record<number, string>) => Record<number, string>)) => void;
  addTitle: Record<number, string>;
  setAddTitle: (v: Record<number, string> | ((p: Record<number, string>) => Record<number, string>)) => void;
  videoPickerModuleId: number | null;
  videoPickerLoading: boolean;
  videoPickerError: string | null;
  videoPickerFiles: RecordingFile[] | null;
  videoPickerBusy: boolean;
  addVideoFromLibrary: (m: CanvasModule, file: RecordingFile) => Promise<void>;
  closeVideoPicker: () => void;
  repoPickerModuleId: number | null;
  repoPickerLoading: boolean;
  repoPickerError: string | null;
  ownedRepos: string[] | null;
  addRepoValue: Record<number, string>;
  setAddRepoValue: (v: Record<number, string> | ((p: Record<number, string>) => Record<number, string>)) => void;
  addRepoTitle: Record<number, string>;
  setAddRepoTitle: (v: Record<number, string> | ((p: Record<number, string>) => Record<number, string>)) => void;
  repoPickerBusy: boolean;
  addRepoLink: (m: CanvasModule) => Promise<void>;
  closeRepoPicker: () => void;
  asgOf: (id: number) => { name: string; points: string; due: string; stype: string; publish: boolean };
  patchAsg: (id: number, patch: Partial<{ name: string; points: string; due: string; stype: string; publish: boolean }>) => void;
  addItem: (m: CanvasModule) => Promise<void>;
  canAdd: (m: CanvasModule) => boolean;
  handleModuleFiles: (m: CanvasModule, list: FileList | File[]) => Promise<void>;
  uploads: Record<number, Array<{ name: string; status: "uploading" | "done" | "error"; error?: string }>>;
}

// The per-module "Add item" row: type selector, the type-specific inputs
// (new assignment mini-form, external URL, text header, AI file generator,
// video-library / repo-link pickers), plus the drag/drop-or-choose file
// upload zone and each upload's status.
//
// An export-sourced module (no `m.raw`) never reaches past the gate check
// below - `addItem`/`handleModuleFiles` and every other handler here create
// a Canvas module item, and there is no Canvas identity on an export module
// to create one in (docs/REGRESSION.md entry 264 check 9).
export function AddItemRow({
  m,
  busy,
  sourceContext,
  addType,
  setAddType,
  openVideoPicker,
  openRepoPicker,
  addFileFormat,
  setAddFileFormat,
  addAiPrompt,
  setAddAiPrompt,
  addAiBusy,
  addAiGenerate,
  addFileContent,
  setAddFileContent,
  addUrl,
  setAddUrl,
  addTitle,
  setAddTitle,
  videoPickerModuleId,
  videoPickerLoading,
  videoPickerError,
  videoPickerFiles,
  videoPickerBusy,
  addVideoFromLibrary,
  closeVideoPicker,
  repoPickerModuleId,
  repoPickerLoading,
  repoPickerError,
  ownedRepos,
  addRepoValue,
  setAddRepoValue,
  addRepoTitle,
  setAddRepoTitle,
  repoPickerBusy,
  addRepoLink,
  closeRepoPicker,
  asgOf,
  patchAsg,
  addItem,
  canAdd,
  handleModuleFiles,
  uploads,
}: AddItemRowProps) {
  const ctx = sourceContext ?? LIVE_CONTENT_SOURCE;
  // GATED AS ONE UNIT, not per-field. The AI-drafting sub-step (prompt, the
  // "Generate with AI" button, and the drop zone for a direct file upload)
  // needs no Canvas access on its own, but every path this row offers ends
  // the same way: `addItem`/`handleModuleFiles` create a Canvas module item
  // in `m`. Offering the drafting step with no way to keep its result would
  // be exactly the silent no-op this gating work exists to prevent, so the
  // whole row is replaced by one explanation rather than disabling its ~10
  // inputs individually.
  const rowGate = gateOperation(ctx, "addItem");
  // `!m.raw` is the structural half of this gate: `rowGate.allowed` reflects
  // `sourceContext` (a prop, supplied by the caller), while `m.raw` reflects
  // the display module ITSELF (display-module-tree.ts). They should always
  // agree when correctly wired, but checking `m.raw` directly - rather than
  // trusting `sourceContext` alone - is what lets every `mc.*` read below be
  // real type-checked narrowing instead of a caller-supplied promise.
  if (!rowGate.allowed || !m.raw) {
    return (
      <div className={styles.ccAddRow}>
        <span className={styles.ccCount}>Add item</span>
        <span className={styles.ccHint}>
          {rowGate.reason ?? "This module has no Canvas identity to add an item to."}
        </span>
      </div>
    );
  }
  const mc = m.raw;

  return (
    <>
      <div className={styles.ccAddRow}>
        <span className={styles.ccCount}>Add item</span>
        <TextField
          select
          size="small"
          sx={{ maxWidth: 150 }}
          value={addType[mc.id] ?? "NewAssignment"}
          onChange={(e) => {
            const t = e.target.value;
            setAddType((p) => ({ ...p, [mc.id]: t }));
            if (t === "VideoLibrary") {
              void openVideoPicker(mc);
            }
            if (t === "RepoLink") {
              void openRepoPicker(mc);
            }
          }}
          disabled={busy}
          aria-label="Item type"
        >
          <MenuItem value="NewAssignment">Assignment</MenuItem>
          <MenuItem value="File">File (AI generated)</MenuItem>
          <MenuItem value="ExternalUrl">External URL</MenuItem>
          <MenuItem value="SubHeader">Text header</MenuItem>
          <MenuItem value="VideoLibrary">Video from Files library</MenuItem>
          <MenuItem value="RepoLink">Link to GitHub repo</MenuItem>
        </TextField>

        {addType[mc.id] === "File" && (
          <TextField
            select
            size="small"
            sx={{ maxWidth: 150 }}
            value={addFileFormat[mc.id] ?? "docx"}
            onChange={(e) =>
              setAddFileFormat((p) => ({ ...p, [mc.id]: e.target.value === "pptx" ? "pptx" : "docx" }))
            }
            disabled={busy}
            aria-label="Format of the generated file"
          >
            <MenuItem value="docx">Word (.docx)</MenuItem>
            <MenuItem value="pptx">PowerPoint (.pptx)</MenuItem>
          </TextField>
        )}

        {addType[mc.id] === "File" && (
          <>
            <TextField
              size="small"
              sx={{ flex: "1 1 200px", minWidth: 160 }}
              placeholder={
                (addFileFormat[mc.id] ?? "docx") === "pptx"
                  ? "Describe a deck to generate with AI"
                  : "Describe a document to generate with AI"
              }
              value={addAiPrompt[mc.id] ?? ""}
              onChange={(e) => setAddAiPrompt((p) => ({ ...p, [mc.id]: e.target.value }))}
              aria-label="AI prompt for the new file"
            />
            <Button
              variant="outlined"
              size="small"
              disabled={busy || !!addAiBusy[mc.id] || !(addAiPrompt[mc.id] ?? "").trim()}
              onClick={() => void addAiGenerate(mc)}
            >
              {addAiBusy[mc.id] ? "Generating…" : "Generate with AI"}
            </Button>
            {(addFileContent[mc.id] ?? "").trim() !== "" && (
              <>
                <TextField
                  multiline
                  minRows={4}
                  fullWidth
                  value={addFileContent[mc.id] ?? ""}
                  onChange={(e) => setAddFileContent((p) => ({ ...p, [mc.id]: e.target.value }))}
                  slotProps={{ htmlInput: { spellCheck: true } }}
                  aria-label="Generated file content"
                  size="small"
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setAddFileContent((p) => ({ ...p, [mc.id]: "" }))}
                >
                  Discard
                </Button>
              </>
            )}
          </>
        )}

        {addType[mc.id] === "ExternalUrl" && (
          <>
            <TextField
              type="url"
              size="small"
              sx={{ flex: "1 1 200px", maxWidth: 280 }}
              placeholder="https://example.com"
              value={addUrl[mc.id] ?? ""}
              onChange={(e) => setAddUrl((p) => ({ ...p, [mc.id]: e.target.value }))}
            />
            <TextField
              size="small"
              sx={{ flex: "1 1 140px", maxWidth: 200 }}
              placeholder="Link text (optional)"
              value={addTitle[mc.id] ?? ""}
              onChange={(e) => setAddTitle((p) => ({ ...p, [mc.id]: e.target.value }))}
            />
          </>
        )}

        {addType[mc.id] === "SubHeader" && (
          <TextField
            size="small"
            sx={{ flex: "1 1 200px", maxWidth: 280 }}
            placeholder="Header text"
            value={addTitle[mc.id] ?? ""}
            onChange={(e) => setAddTitle((p) => ({ ...p, [mc.id]: e.target.value }))}
          />
        )}

        {addType[mc.id] === "VideoLibrary" && videoPickerModuleId === mc.id && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", flex: "1 1 100%", maxWidth: "100%" }}>
            {videoPickerLoading && <span style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>Loading your library...</span>}
            {videoPickerError && <span style={{ fontSize: "var(--font-size-md)", color: "var(--danger)" }}>{videoPickerError}</span>}
            {!videoPickerLoading && videoPickerFiles && videoPickerFiles.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                {videoPickerFiles.map((file) => (
                  <div key={file.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-2)", border: "1px solid var(--border-soft)", borderRadius: "var(--radius-xs)" }}>
                    <div style={{ flex: "1 1 100%" }}>
                      <div style={{ fontWeight: 500, fontSize: "var(--font-size-md)" }}>{file.name}</div>
                      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)" }}>
                        {file.kind === "recording" ? "Recording" : "Captioned"} - {(file.sizeBytes / 1048576).toFixed(1)} MB - {new Date(file.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => void addVideoFromLibrary(mc, file)}
                      disabled={videoPickerBusy || busy}
                    >
                      {videoPickerBusy ? "Adding..." : "Add"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button variant="text" size="small" onClick={() => closeVideoPicker()} disabled={videoPickerBusy || busy}>
              Cancel
            </Button>
          </div>
        )}

        {addType[mc.id] === "RepoLink" && repoPickerModuleId === mc.id && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", flex: "1 1 100%", maxWidth: "100%" }}>
            {repoPickerLoading && <span style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>Loading your repositories...</span>}
            {repoPickerError && <span style={{ fontSize: "var(--font-size-md)", color: "var(--danger)" }}>{repoPickerError}</span>}
            {!repoPickerLoading && ownedRepos && (
              <>
                <Autocomplete
                  freeSolo
                  options={ownedRepos}
                  inputValue={addRepoValue[mc.id] ?? ""}
                  onInputChange={(_, v) => setAddRepoValue((p) => ({ ...p, [mc.id]: v }))}
                  onChange={(_, v) => {
                    if (v) {
                      const repoName = v.split("/")[1] || v;
                      setAddRepoValue((p) => ({ ...p, [mc.id]: v }));
                      setAddRepoTitle((p) => ({ ...p, [mc.id]: repoName }));
                    }
                  }}
                  renderInput={(params) => <TextField {...params} label="Repository" placeholder="owner/name" size="small" />}
                  disabled={repoPickerBusy || busy}
                  sx={{ flex: "1 1 100%" }}
                />
                <TextField
                  size="small"
                  label="Title"
                  placeholder={addRepoValue[mc.id] || "Link text"}
                  value={addRepoTitle[mc.id] ?? ""}
                  onChange={(e) => setAddRepoTitle((p) => ({ ...p, [mc.id]: e.target.value }))}
                  disabled={repoPickerBusy || busy}
                />
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => void addRepoLink(mc)}
                    disabled={repoPickerBusy || busy || !(addRepoValue[mc.id] ?? "").match(/^[^/\s]+\/[^/\s]+$/)}
                  >
                    {repoPickerBusy ? "Adding..." : "Add"}
                  </Button>
                  <Button variant="text" size="small" onClick={() => closeRepoPicker()} disabled={repoPickerBusy || busy}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {addType[mc.id] === "NewAssignment" && (
          <>
            <TextField size="small" placeholder="Assignment name" value={asgOf(mc.id).name} onChange={(e) => patchAsg(mc.id, { name: e.target.value })} disabled={busy} sx={{ flex: "1 1 180px" }} />
            <TextField size="small" type="number" label="Points" value={asgOf(mc.id).points} onChange={(e) => patchAsg(mc.id, { points: e.target.value })} disabled={busy} sx={{ width: 90 }} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="datetime-local" label="Due" value={asgOf(mc.id).due} onChange={(e) => patchAsg(mc.id, { due: e.target.value })} disabled={busy} sx={{ width: 200 }} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField select size="small" label="Type" value={asgOf(mc.id).stype} onChange={(e) => patchAsg(mc.id, { stype: e.target.value })} disabled={busy} sx={{ minWidth: 140 }}>
              <MenuItem value="online_text_entry">Text entry</MenuItem>
              <MenuItem value="online_upload">File upload</MenuItem>
              <MenuItem value="online_url">Website URL</MenuItem>
              <MenuItem value="on_paper">On paper</MenuItem>
              <MenuItem value="none">No submission</MenuItem>
            </TextField>
            <FormControlLabel control={<Checkbox size="small" checked={asgOf(mc.id).publish} onChange={(e) => patchAsg(mc.id, { publish: e.target.checked })} disabled={busy} />} label="Publish" />
          </>
        )}

        <Button
          variant="contained"
          size="small"
          onClick={() => void addItem(mc)}
          disabled={busy || !canAdd(mc)}
        >
          Add
        </Button>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleModuleFiles(mc, e.dataTransfer.files);
        }}
        className={styles.ccDrop}
      >
        <span className={styles.ccHint}>Drop files to add to this module, or</span>
        <label className={styles.ccBtn} style={{ cursor: "pointer" }}>
          choose files
          <input
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files) void handleModuleFiles(mc, e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {(uploads[mc.id] ?? []).length > 0 && (
        <div style={{ marginTop: "var(--space-1)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          {(uploads[mc.id] ?? []).map((row, idx) => (
            <span
              key={`${mc.id}-up-${idx}`}
              className={styles.ccHint}
              style={{ color: row.status === "error" ? "var(--danger)" : undefined }}
            >
              {row.name}:{" "}
              {row.status === "uploading"
                ? "uploading…"
                : row.status === "done"
                  ? "added"
                  : `failed (${row.error})`}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
