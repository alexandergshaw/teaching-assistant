"use client";

import { useState } from "react";
import {
  getAssignmentSyncStateAction,
  syncAssignmentToRepoAction,
  syncAssignmentFromRepoAction,
} from "../actions";
import GithubRepoPicker from "./GithubRepoPicker";
import styles from "../page.module.css";

type Loaded = { title: string; canvasMarkdown: string; repoMarkdown: string | null; path: string };

/**
 * Keep a Canvas assignment's instructions and a repo file in sync. Paste an
 * assignment URL, pick a repo, load both sides, then push Canvas -> repo
 * (Markdown) or pull repo -> Canvas (HTML). One canonical file, explicit
 * direction — no silent merge.
 */
export default function GithubSyncPanel({ acronym }: { acronym?: string }) {
  const [assignmentUrl, setAssignmentUrl] = useState("");
  const [repoRef, setRepoRef] = useState("");
  const [branch, setBranch] = useState("");
  const [path, setPath] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState<"" | "load" | "push" | "pull">("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = async () => {
    setBusy("load");
    setError(null);
    setNote(null);
    setLoaded(null);
    const r = await getAssignmentSyncStateAction(assignmentUrl.trim(), repoRef.trim(), path, acronym, branch || undefined);
    setBusy("");
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setLoaded(r);
    setPath(r.path);
  };

  const push = async () => {
    setBusy("push");
    setError(null);
    setNote(null);
    const r = await syncAssignmentToRepoAction(assignmentUrl.trim(), repoRef.trim(), path, acronym, branch || undefined);
    setBusy("");
    if ("error" in r) setError(r.error);
    else {
      setNote(`Pushed Canvas instructions to ${r.path}.`);
      void load();
    }
  };

  const pull = async () => {
    setBusy("pull");
    setError(null);
    setNote(null);
    const r = await syncAssignmentFromRepoAction(assignmentUrl.trim(), repoRef.trim(), path, acronym, branch || undefined);
    setBusy("");
    if ("error" in r) setError(r.error);
    else {
      setNote("Updated the Canvas assignment from the repo file.");
      void load();
    }
  };

  const ready = !!assignmentUrl.trim() && !!repoRef.trim();

  return (
    <>
      <p style={{ marginTop: 0, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        Keep an assignment&apos;s instructions in sync between Canvas and a repo file. Load both sides, then push
        Canvas to the repo (as Markdown) or pull the repo file into Canvas.
      </p>

      <div className={styles.field}>
        <label>Canvas assignment URL</label>
        <input
          type="text"
          value={assignmentUrl}
          placeholder="https://…/courses/123/assignments/456"
          onChange={(e) => setAssignmentUrl(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--field-border, #cbd5e1)", borderRadius: 8, fontSize: "0.9rem" }}
        />
      </div>
      <div className={styles.field}>
        <label>Repository</label>
        <GithubRepoPicker value={repoRef} onChange={setRepoRef} disabled={!!busy} branch={branch} onBranchChange={setBranch} />
      </div>
      <div className={styles.field}>
        <label>Repo file path</label>
        <input
          type="text"
          value={path}
          placeholder="assignments/<slug>/README.md (auto if blank)"
          onChange={(e) => setPath(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--field-border, #cbd5e1)", borderRadius: 8, fontSize: "0.9rem" }}
        />
      </div>

      <button type="button" className={styles.submitButton} onClick={load} disabled={!ready || busy === "load"}>
        {busy === "load" ? "Loading…" : "Load both sides"}
      </button>

      {error && <p className={styles.error}>{error}</p>}
      {note && <p style={{ fontSize: "0.85rem", color: "#16a34a" }}>{note}</p>}

      {loaded && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
            <div style={{ flex: "1 1 280px", minWidth: 0 }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>Canvas — {loaded.title}</label>
              <textarea
                readOnly
                value={loaded.canvasMarkdown}
                rows={16}
                style={{ width: "100%", fontFamily: "monospace", fontSize: "0.8rem", padding: 10, border: "1px solid var(--field-border, #cbd5e1)", borderRadius: 8 }}
              />
            </div>
            <div style={{ flex: "1 1 280px", minWidth: 0 }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>Repo — {loaded.path}</label>
              <textarea
                readOnly
                value={loaded.repoMarkdown ?? "(file does not exist yet)"}
                rows={16}
                style={{ width: "100%", fontFamily: "monospace", fontSize: "0.8rem", padding: 10, border: "1px solid var(--field-border, #cbd5e1)", borderRadius: 8, color: loaded.repoMarkdown == null ? "#94a3b8" : undefined }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" className={styles.submitButton} onClick={push} disabled={!!busy}>
              {busy === "push" ? "Pushing…" : "Push Canvas → Repo"}
            </button>
            <button type="button" className={styles.submitButton} onClick={pull} disabled={!!busy || loaded.repoMarkdown == null}>
              {busy === "pull" ? "Pulling…" : "Pull Repo → Canvas"}
            </button>
          </div>
        </>
      )}
    </>
  );
}
