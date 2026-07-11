"use client";

import { useState } from "react";
import { updateRepoAction } from "../actions";
import type { GithubRepo } from "@/lib/github";
import type { UpdateRepoPatch } from "@/lib/github";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import styles from "../page.module.css";

export default function RepoSettingsPanel({ repo, onUpdated }: { repo: GithubRepo; onUpdated?: (repo: GithubRepo, previousFullName: string) => void }) {
  const [editName, setEditName] = useState(repo.name);
  const [editPrivate, setEditPrivate] = useState(repo.private);
  const [editTemplate, setEditTemplate] = useState(repo.isTemplate);
  const [editDescription, setEditDescription] = useState(repo.description);
  const [editArchived, setEditArchived] = useState(repo.archived);

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [prevFullName, setPrevFullName] = useState(repo.fullName);
  if (repo.fullName !== prevFullName) {
    setPrevFullName(repo.fullName);
    setEditName(repo.name);
    setEditPrivate(repo.private);
    setEditTemplate(repo.isTemplate);
    setEditDescription(repo.description);
    setEditArchived(repo.archived);
    setSaveMsg(null);
  }

  const isArchivedCurrent = repo.archived;

  const handleSave = async () => {
    const patch: UpdateRepoPatch = {};
    const trimmedName = editName.trim();
    if (trimmedName !== repo.name) {
      if (!/^[A-Za-z0-9._-]+$/.test(trimmedName)) {
        setSaveMsg("Repository names can only contain letters, numbers, hyphens, underscores, and dots.");
        return;
      }
      patch.name = trimmedName;
    }
    if (editPrivate !== repo.private) patch.private = editPrivate;
    if (editTemplate !== repo.isTemplate) patch.isTemplate = editTemplate;
    if (editDescription !== repo.description) patch.description = editDescription;
    if (editArchived !== repo.archived) patch.archived = editArchived;

    if (Object.keys(patch).length === 0) {
      setSaveMsg("No changes to save.");
      return;
    }

    setSaveBusy(true);
    setSaveMsg(null);
    const r = await updateRepoAction(repo.fullName, patch);
    setSaveBusy(false);

    if ("error" in r) {
      setSaveMsg(r.error);
    } else {
      setEditName(r.repo.name);
      setEditPrivate(r.repo.private);
      setEditTemplate(r.repo.isTemplate);
      setEditDescription(r.repo.description);
      setEditArchived(r.repo.archived);
      setSaveMsg("Saved.");
      // Pass the pre-save fullName so callers can reconcile after a rename.
      onUpdated?.(r.repo, repo.fullName);
    }
  };

  return (
    <div className={`${styles.field} ${styles.ghPanel}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={editPrivate}
              onChange={(e) => setEditPrivate(e.target.checked)}
              disabled={saveBusy || isArchivedCurrent}
              size="small"
            />
          }
          label="Private"
        />

        <FormControlLabel
          control={
            <Checkbox
              checked={editTemplate}
              onChange={(e) => setEditTemplate(e.target.checked)}
              disabled={saveBusy || isArchivedCurrent}
              size="small"
            />
          }
          label="Template repository"
        />

        <div>
          <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: 4 }}>
            Repository name
          </label>
          <TextField
            size="small"
            fullWidth
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            disabled={saveBusy || isArchivedCurrent}
            placeholder="repository-name"
          />
          {editName.trim() !== repo.name && (
            <p className={styles.fieldHint} style={{ marginTop: 4 }}>
              Renaming changes the repository URL; GitHub redirects the old name.
            </p>
          )}
        </div>

        <div>
          <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: 4 }}>
            Description
          </label>
          <TextField
            size="small"
            fullWidth
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            disabled={saveBusy || isArchivedCurrent}
            placeholder="Repository description"
          />
        </div>

        <FormControlLabel
          control={
            <Checkbox
              checked={editArchived}
              onChange={(e) => setEditArchived(e.target.checked)}
              disabled={saveBusy}
              size="small"
            />
          }
          label="Archived"
        />

        {isArchivedCurrent && (
          <p className={styles.fieldHint}>Unarchive and save to edit the other settings.</p>
        )}
      </div>

      <Button
        type="button"
        variant="contained"
        size="small"
        onClick={handleSave}
        disabled={saveBusy}
        sx={{ mt: 1.5 }}
      >
        {saveBusy ? "Saving..." : "Save changes"}
      </Button>

      {saveMsg && (
        saveMsg.startsWith("No changes") || saveMsg === "Saved." ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: 6 }}>{saveMsg}</p>
        ) : (
          <p className={styles.error}>{saveMsg}</p>
        )
      )}
    </div>
  );
}
