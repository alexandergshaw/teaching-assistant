"use client";

import type React from "react";
import { Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import type { CanvasModule } from "@/lib/canvas-modules";
import { listAssignmentGroupsAction } from "../../../actions";
import styles from "../../../page.module.css";

export interface NewAssignmentPanelProps {
  courseUrl: string;
  acronym?: string;
  modules: CanvasModule[];
  busy: boolean;
  newModuleName: string;
  setNewModuleName: (v: string) => void;
  handleAddModule: () => void;
  showNewAssignment: boolean;
  setShowNewAssignment: React.Dispatch<React.SetStateAction<boolean>>;
  naName: string;
  setNaName: (v: string) => void;
  naPoints: string;
  setNaPoints: (v: string) => void;
  naGrading: string;
  setNaGrading: (v: string) => void;
  naDue: string;
  setNaDue: (v: string) => void;
  naUnlock: string;
  setNaUnlock: (v: string) => void;
  naLock: string;
  setNaLock: (v: string) => void;
  naAttempts: string;
  setNaAttempts: (v: string) => void;
  naType: string;
  setNaType: (v: string) => void;
  naExtensions: string;
  setNaExtensions: (v: string) => void;
  naModuleId: string;
  setNaModuleId: (v: string) => void;
  naGroupId: string;
  setNaGroupId: (v: string) => void;
  naGroups: Array<{ id: number; name: string }> | null;
  setNaGroups: React.Dispatch<React.SetStateAction<Array<{ id: number; name: string }> | null>>;
  naPeer: boolean;
  setNaPeer: (v: boolean) => void;
  naOmit: boolean;
  setNaOmit: (v: boolean) => void;
  naPublish: boolean;
  setNaPublish: (v: boolean) => void;
  naDescription: string;
  setNaDescription: (v: string) => void;
  naDrafting: boolean;
  handleDraftDescription: () => void;
  naBusy: boolean;
  handleCreateAssignment: () => void;
}

// Top-of-page "Add a module" field, plus the collapsible "New assignment" form
// that creates a course assignment directly (optionally linked into a module).
export function NewAssignmentPanel({
  courseUrl,
  acronym,
  modules,
  busy,
  newModuleName,
  setNewModuleName,
  handleAddModule,
  showNewAssignment,
  setShowNewAssignment,
  naName,
  setNaName,
  naPoints,
  setNaPoints,
  naGrading,
  setNaGrading,
  naDue,
  setNaDue,
  naUnlock,
  setNaUnlock,
  naLock,
  setNaLock,
  naAttempts,
  setNaAttempts,
  naType,
  setNaType,
  naExtensions,
  setNaExtensions,
  naModuleId,
  setNaModuleId,
  naGroupId,
  setNaGroupId,
  naGroups,
  setNaGroups,
  naPeer,
  setNaPeer,
  naOmit,
  setNaOmit,
  naPublish,
  setNaPublish,
  naDescription,
  setNaDescription,
  naDrafting,
  handleDraftDescription,
  naBusy,
  handleCreateAssignment,
}: NewAssignmentPanelProps) {
  return (
    <>
      <div className={styles.field}>
        <label htmlFor="content-new-module">Add a module</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <TextField
            id="content-new-module"
            size="small"
            sx={{ flex: "1 1 240px" }}
            placeholder="New module name"
            value={newModuleName}
            onChange={(e) => setNewModuleName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddModule();
            }}
          />
          <Button
            variant="contained"
            size="small"
            onClick={handleAddModule}
            disabled={busy || !newModuleName.trim()}
          >
            Add module
          </Button>
        </div>
      </div>

      <div className={styles.field}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              setShowNewAssignment((v) => {
                const next = !v;
                if (next && naGroups === null) {
                  void (async () => {
                    const r = await listAssignmentGroupsAction(courseUrl, acronym);
                    if (!("error" in r)) setNaGroups(r.groups);
                  })();
                }
                return next;
              });
            }}
          >
            {showNewAssignment ? "Cancel assignment" : "New assignment"}
          </Button>
        </div>
        {showNewAssignment && (
          <div style={{ border: "1px solid var(--field-border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <TextField
                size="small"
                label="Assignment name"
                required
                value={naName}
                onChange={(e) => setNaName(e.target.value)}
                sx={{ flex: "1 1 220px" }}
              />
              <TextField
                size="small"
                type="number"
                label="Points"
                value={naPoints}
                onChange={(e) => setNaPoints(e.target.value)}
                sx={{ width: 100 }}
              />
              <TextField
                select
                size="small"
                label="Grading"
                value={naGrading}
                onChange={(e) => setNaGrading(e.target.value)}
                sx={{ minWidth: 130 }}
              >
                <MenuItem value="points">Points</MenuItem>
                <MenuItem value="percent">Percentage</MenuItem>
                <MenuItem value="pass_fail">Pass/fail</MenuItem>
                <MenuItem value="letter_grade">Letter grade</MenuItem>
                <MenuItem value="not_graded">Not graded</MenuItem>
              </TextField>
              <TextField
                size="small"
                type="datetime-local"
                label="Due"
                value={naDue}
                onChange={(e) => setNaDue(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 210 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <TextField
                size="small"
                type="datetime-local"
                label="Available from"
                value={naUnlock}
                onChange={(e) => setNaUnlock(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 200 }}
              />
              <TextField
                size="small"
                type="datetime-local"
                label="Until"
                value={naLock}
                onChange={(e) => setNaLock(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 200 }}
              />
              <TextField
                select
                size="small"
                label="Attempts"
                value={naAttempts}
                onChange={(e) => setNaAttempts(e.target.value)}
                sx={{ minWidth: 120 }}
              >
                <MenuItem value="unlimited">Unlimited</MenuItem>
                <MenuItem value="1">1</MenuItem>
                <MenuItem value="2">2</MenuItem>
                <MenuItem value="3">3</MenuItem>
                <MenuItem value="5">5</MenuItem>
              </TextField>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <TextField
                select
                size="small"
                label="Submission type"
                value={naType}
                onChange={(e) => setNaType(e.target.value)}
                sx={{ minWidth: 170 }}
              >
                <MenuItem value="online_text_entry">Text entry</MenuItem>
                <MenuItem value="online_upload">File upload</MenuItem>
                <MenuItem value="online_url">Website URL</MenuItem>
                <MenuItem value="on_paper">On paper</MenuItem>
                <MenuItem value="none">No submission</MenuItem>
              </TextField>
              {naType === "online_upload" && (
                <TextField
                  size="small"
                  label="Allowed extensions"
                  placeholder="pdf,docx"
                  value={naExtensions}
                  onChange={(e) => setNaExtensions(e.target.value)}
                  sx={{ width: 170 }}
                />
              )}
              <TextField
                select
                size="small"
                label="Add to module"
                value={naModuleId}
                onChange={(e) => setNaModuleId(e.target.value)}
                sx={{ minWidth: 200 }}
              >
                <MenuItem value="">No module</MenuItem>
                {modules.map((m) => (
                  <MenuItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Assignment group"
                value={naGroupId}
                onChange={(e) => setNaGroupId(e.target.value)}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="">{naGroups === null ? "Loading…" : "Default group"}</MenuItem>
                {(naGroups ?? []).map((g) => (
                  <MenuItem key={g.id} value={String(g.id)}>
                    {g.name}
                  </MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={<Checkbox size="small" checked={naPeer} onChange={(e) => setNaPeer(e.target.checked)} />}
                label="Peer reviews"
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={naOmit} onChange={(e) => setNaOmit(e.target.checked)} />}
                label="Omit from final grade"
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={naPublish} onChange={(e) => setNaPublish(e.target.checked)} />}
                label="Publish"
              />
            </div>
            <TextField
              multiline
              minRows={3}
              fullWidth
              label="Description (optional)"
              value={naDescription}
              onChange={(e) => setNaDescription(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Button
                variant="text"
                size="small"
                disabled={naDrafting || !naName.trim()}
                onClick={() => void handleDraftDescription()}
              >
                {naDrafting ? "Drafting…" : "Draft with AI"}
              </Button>
              <span style={{ fontSize: "0.875rem", color: "var(--text-secondary, rgba(0,0,0,0.6))" }}>
                Uses the assignment name plus whatever is already in the description as guidance.
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="contained"
                size="small"
                disabled={naBusy || !naName.trim()}
                onClick={handleCreateAssignment}
              >
                {naBusy ? "Creating..." : "Create assignment"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
