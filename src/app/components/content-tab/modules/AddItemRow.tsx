"use client";

import { Autocomplete, Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import type { CanvasModule } from "@/lib/canvas-modules";
import type { RecordingFile } from "@/lib/recording-files";
import styles from "../../../page.module.css";

export interface AddItemRowProps {
  m: CanvasModule;
  busy: boolean;
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
export function AddItemRow({
  m,
  busy,
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
  return (
    <>
      <div className={styles.ccAddRow}>
        <span className={styles.ccCount}>Add item</span>
        <TextField
          select
          size="small"
          sx={{ maxWidth: 150 }}
          value={addType[m.id] ?? "NewAssignment"}
          onChange={(e) => {
            const t = e.target.value;
            setAddType((p) => ({ ...p, [m.id]: t }));
            if (t === "VideoLibrary") {
              void openVideoPicker(m);
            }
            if (t === "RepoLink") {
              void openRepoPicker(m);
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

        {addType[m.id] === "File" && (
          <TextField
            select
            size="small"
            sx={{ maxWidth: 150 }}
            value={addFileFormat[m.id] ?? "docx"}
            onChange={(e) =>
              setAddFileFormat((p) => ({ ...p, [m.id]: e.target.value === "pptx" ? "pptx" : "docx" }))
            }
            disabled={busy}
            aria-label="Format of the generated file"
          >
            <MenuItem value="docx">Word (.docx)</MenuItem>
            <MenuItem value="pptx">PowerPoint (.pptx)</MenuItem>
          </TextField>
        )}

        {addType[m.id] === "File" && (
          <>
            <TextField
              size="small"
              sx={{ flex: "1 1 200px", minWidth: 160 }}
              placeholder={
                (addFileFormat[m.id] ?? "docx") === "pptx"
                  ? "Describe a deck to generate with AI"
                  : "Describe a document to generate with AI"
              }
              value={addAiPrompt[m.id] ?? ""}
              onChange={(e) => setAddAiPrompt((p) => ({ ...p, [m.id]: e.target.value }))}
              aria-label="AI prompt for the new file"
            />
            <Button
              variant="outlined"
              size="small"
              disabled={busy || !!addAiBusy[m.id] || !(addAiPrompt[m.id] ?? "").trim()}
              onClick={() => void addAiGenerate(m)}
            >
              {addAiBusy[m.id] ? "Generating…" : "Generate with AI"}
            </Button>
            {(addFileContent[m.id] ?? "").trim() !== "" && (
              <>
                <TextField
                  multiline
                  minRows={4}
                  fullWidth
                  value={addFileContent[m.id] ?? ""}
                  onChange={(e) => setAddFileContent((p) => ({ ...p, [m.id]: e.target.value }))}
                  slotProps={{ htmlInput: { spellCheck: true } }}
                  aria-label="Generated file content"
                  size="small"
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setAddFileContent((p) => ({ ...p, [m.id]: "" }))}
                >
                  Discard
                </Button>
              </>
            )}
          </>
        )}

        {addType[m.id] === "ExternalUrl" && (
          <>
            <TextField
              type="url"
              size="small"
              sx={{ flex: "1 1 200px", maxWidth: 280 }}
              placeholder="https://example.com"
              value={addUrl[m.id] ?? ""}
              onChange={(e) => setAddUrl((p) => ({ ...p, [m.id]: e.target.value }))}
            />
            <TextField
              size="small"
              sx={{ flex: "1 1 140px", maxWidth: 200 }}
              placeholder="Link text (optional)"
              value={addTitle[m.id] ?? ""}
              onChange={(e) => setAddTitle((p) => ({ ...p, [m.id]: e.target.value }))}
            />
          </>
        )}

        {addType[m.id] === "SubHeader" && (
          <TextField
            size="small"
            sx={{ flex: "1 1 200px", maxWidth: 280 }}
            placeholder="Header text"
            value={addTitle[m.id] ?? ""}
            onChange={(e) => setAddTitle((p) => ({ ...p, [m.id]: e.target.value }))}
          />
        )}

        {addType[m.id] === "VideoLibrary" && videoPickerModuleId === m.id && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 100%", maxWidth: "100%" }}>
            {videoPickerLoading && <span style={{ fontSize: "0.875rem", color: "var(--muted-text, #666)" }}>Loading your library...</span>}
            {videoPickerError && <span style={{ fontSize: "0.875rem", color: "var(--error, #b91c1c)" }}>{videoPickerError}</span>}
            {!videoPickerLoading && videoPickerFiles && videoPickerFiles.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {videoPickerFiles.map((file) => (
                  <div key={file.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, border: "1px solid var(--border-color, #ddd)", borderRadius: 4 }}>
                    <div style={{ flex: "1 1 100%" }}>
                      <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{file.name}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--muted-text, #666)" }}>
                        {file.kind === "recording" ? "Recording" : "Captioned"} - {(file.sizeBytes / 1048576).toFixed(1)} MB - {new Date(file.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => void addVideoFromLibrary(m, file)}
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

        {addType[m.id] === "RepoLink" && repoPickerModuleId === m.id && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 100%", maxWidth: "100%" }}>
            {repoPickerLoading && <span style={{ fontSize: "0.875rem", color: "var(--muted-text, #666)" }}>Loading your repositories...</span>}
            {repoPickerError && <span style={{ fontSize: "0.875rem", color: "var(--error, #b91c1c)" }}>{repoPickerError}</span>}
            {!repoPickerLoading && ownedRepos && (
              <>
                <Autocomplete
                  freeSolo
                  options={ownedRepos}
                  inputValue={addRepoValue[m.id] ?? ""}
                  onInputChange={(_, v) => setAddRepoValue((p) => ({ ...p, [m.id]: v }))}
                  onChange={(_, v) => {
                    if (v) {
                      const repoName = v.split("/")[1] || v;
                      setAddRepoValue((p) => ({ ...p, [m.id]: v }));
                      setAddRepoTitle((p) => ({ ...p, [m.id]: repoName }));
                    }
                  }}
                  renderInput={(params) => <TextField {...params} label="Repository" placeholder="owner/name" size="small" />}
                  disabled={repoPickerBusy || busy}
                  sx={{ flex: "1 1 100%" }}
                />
                <TextField
                  size="small"
                  label="Title"
                  placeholder={addRepoValue[m.id] || "Link text"}
                  value={addRepoTitle[m.id] ?? ""}
                  onChange={(e) => setAddRepoTitle((p) => ({ ...p, [m.id]: e.target.value }))}
                  disabled={repoPickerBusy || busy}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => void addRepoLink(m)}
                    disabled={repoPickerBusy || busy || !(addRepoValue[m.id] ?? "").match(/^[^/\s]+\/[^/\s]+$/)}
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

        {addType[m.id] === "NewAssignment" && (
          <>
            <TextField size="small" placeholder="Assignment name" value={asgOf(m.id).name} onChange={(e) => patchAsg(m.id, { name: e.target.value })} disabled={busy} sx={{ flex: "1 1 180px" }} />
            <TextField size="small" type="number" label="Points" value={asgOf(m.id).points} onChange={(e) => patchAsg(m.id, { points: e.target.value })} disabled={busy} sx={{ width: 90 }} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="datetime-local" label="Due" value={asgOf(m.id).due} onChange={(e) => patchAsg(m.id, { due: e.target.value })} disabled={busy} sx={{ width: 200 }} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField select size="small" label="Type" value={asgOf(m.id).stype} onChange={(e) => patchAsg(m.id, { stype: e.target.value })} disabled={busy} sx={{ minWidth: 140 }}>
              <MenuItem value="online_text_entry">Text entry</MenuItem>
              <MenuItem value="online_upload">File upload</MenuItem>
              <MenuItem value="online_url">Website URL</MenuItem>
              <MenuItem value="on_paper">On paper</MenuItem>
              <MenuItem value="none">No submission</MenuItem>
            </TextField>
            <FormControlLabel control={<Checkbox size="small" checked={asgOf(m.id).publish} onChange={(e) => patchAsg(m.id, { publish: e.target.checked })} disabled={busy} />} label="Publish" />
          </>
        )}

        <Button
          variant="contained"
          size="small"
          onClick={() => void addItem(m)}
          disabled={busy || !canAdd(m)}
        >
          Add
        </Button>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleModuleFiles(m, e.dataTransfer.files);
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
              if (e.target.files) void handleModuleFiles(m, e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {(uploads[m.id] ?? []).length > 0 && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
          {(uploads[m.id] ?? []).map((row, idx) => (
            <span
              key={`${m.id}-up-${idx}`}
              className={styles.ccHint}
              style={{ color: row.status === "error" ? "var(--error, #b91c1c)" : undefined }}
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
