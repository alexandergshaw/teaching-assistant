"use client";

import { useEffect, useState } from "react";
import { listPersonalReposAction, updateRepoAction } from "../actions";
import type { GithubRepo } from "@/lib/github";
import type { UpdateRepoPatch } from "@/lib/github";
import Typeahead from "./ui/Typeahead";
import styles from "../page.module.css";

export default function RepoSettingsPanel() {
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [reposState, setReposState] = useState<"loading" | "ready" | "error">("loading");
  const [reposError, setReposError] = useState<string | null>(null);

  const [selectedFullName, setSelectedFullName] = useState("");
  const [editPrivate, setEditPrivate] = useState(false);
  const [editTemplate, setEditTemplate] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editArchived, setEditArchived] = useState(false);

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    let cancelled = false;
    setReposState("loading");
    setReposError(null);
    (async () => {
      const r = await listPersonalReposAction();
      if (cancelled) return;
      if ("error" in r) {
        setReposState("error");
        setReposError(r.error);
        return;
      }
      setRepos(r.repos);
      setReposState("ready");
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const selectedRepo = repos.find((r) => r.fullName === selectedFullName);

  const handleRepoSelect = (fullName: string) => {
    setSelectedFullName(fullName);
    setSaveMsg(null);
    if (fullName) {
      const repo = repos.find((r) => r.fullName === fullName);
      if (repo) {
        setEditPrivate(repo.private);
        setEditTemplate(repo.isTemplate);
        setEditDescription(repo.description);
        setEditArchived(repo.archived);
      }
    }
  };

  const handleSave = async () => {
    if (!selectedRepo) return;

    const patch: UpdateRepoPatch = {};
    if (editPrivate !== selectedRepo.private) patch.private = editPrivate;
    if (editTemplate !== selectedRepo.isTemplate) patch.isTemplate = editTemplate;
    if (editDescription !== selectedRepo.description) patch.description = editDescription;
    if (editArchived !== selectedRepo.archived) patch.archived = editArchived;

    if (Object.keys(patch).length === 0) {
      setSaveMsg("No changes to save.");
      return;
    }

    setSaveBusy(true);
    setSaveMsg(null);
    const r = await updateRepoAction(selectedRepo.fullName, patch);
    setSaveBusy(false);

    if ("error" in r) {
      setSaveMsg(r.error);
    } else {
      setRepos(repos.map((repo) => (repo.fullName === selectedRepo.fullName ? r.repo : repo)));
      setEditPrivate(r.repo.private);
      setEditTemplate(r.repo.isTemplate);
      setEditDescription(r.repo.description);
      setEditArchived(r.repo.archived);
      setSaveMsg("Saved.");
    }
  };

  const isArchivedCurrent = selectedRepo?.archived ?? false;

  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ margin: "0 0 4px" }}>Your repositories</h3>
      <p className={styles.fieldHint}>Manage the repositories you personally own.</p>

      <div className={styles.field}>
        <Typeahead
          options={repos.map((repo) => ({ value: repo.fullName, label: repo.name }))}
          value={selectedFullName}
          onChange={(fullName) => handleRepoSelect(fullName)}
          placeholder={reposState === "loading" ? "Loading repositories..." : "Select a repository..."}
          disabled={reposState !== "ready"}
          loading={reposState === "loading"}
          noOptionsText="No repositories"
        />
      </div>

      {reposState === "error" && reposError && <p className={styles.error}>{reposError}</p>}

      {selectedRepo && (
        <div className={styles.field} style={{ border: "1px solid var(--field-border)", borderRadius: 10, padding: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", color: "var(--text-secondary)", fontWeight: "normal", textTransform: "none", letterSpacing: "0" }}>
              <input
                type="checkbox"
                checked={editPrivate}
                onChange={(e) => setEditPrivate(e.target.checked)}
                disabled={saveBusy || isArchivedCurrent}
              />
              Private
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", color: "var(--text-secondary)", fontWeight: "normal", textTransform: "none", letterSpacing: "0" }}>
              <input
                type="checkbox"
                checked={editTemplate}
                onChange={(e) => setEditTemplate(e.target.checked)}
                disabled={saveBusy || isArchivedCurrent}
              />
              Template repository
            </label>

            <div>
              <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: 4 }}>
                Description
              </label>
              <input
                type="text"
                className={styles.textInput}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={saveBusy || isArchivedCurrent}
                placeholder="Repository description"
              />
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", color: "var(--text-secondary)", fontWeight: "normal", textTransform: "none", letterSpacing: "0" }}>
              <input
                type="checkbox"
                checked={editArchived}
                onChange={(e) => setEditArchived(e.target.checked)}
                disabled={saveBusy}
              />
              Archived
            </label>

            {isArchivedCurrent && (
              <p className={styles.fieldHint}>Unarchive and save to edit the other settings.</p>
            )}
          </div>

          <button
            type="button"
            className={styles.submitButton}
            onClick={handleSave}
            disabled={saveBusy}
            style={{ marginTop: 12 }}
          >
            {saveBusy ? "Saving..." : "Save changes"}
          </button>

          {saveMsg && (
            saveMsg.startsWith("No changes") || saveMsg === "Saved." ? (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: 6 }}>{saveMsg}</p>
            ) : (
              <p className={styles.error}>{saveMsg}</p>
            )
          )}
        </div>
      )}
    </div>
  );
}
