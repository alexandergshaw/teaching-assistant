"use client";

import { useEffect, useState } from "react";
import TopBar from "../components/TopBar";
import ProblemsPanel from "../components/ProblemsPanel";
import { listUnverifiedKnowledgeAction, reviewKnowledgeEntryAction } from "../actions";
import type { KnowledgeRow } from "@/lib/research/db";
import styles from "./knowledge.module.css";

type Edits = { lesson: string; organization: string; year: string };

/**
 * Owner curation for learned knowledge: entries the research loop retrieved
 * (unverified, with provenance) are reviewed here. Verifying promotes an entry
 * so retrieval trusts it; a case study given organization, year, and a lesson
 * becomes deck-grade material. Discarding deletes it.
 */
export default function KnowledgeReviewPage() {
  const [entries, setEntries] = useState<KnowledgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Edits>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await listUnverifiedKnowledgeAction();
      if (!active) return;
      if ("error" in result) setError(result.error);
      else setEntries(result.entries);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const editFor = (id: string): Edits => edits[id] ?? { lesson: "", organization: "", year: "" };

  const setEdit = (id: string, patch: Partial<Edits>) =>
    setEdits((prev) => ({ ...prev, [id]: { ...editFor(id), ...patch } }));

  const review = async (entry: KnowledgeRow, decision: "verify" | "discard") => {
    setBusyId(entry.id);
    setError(null);
    const edit = editFor(entry.id);
    const year = Number(edit.year);
    const result = await reviewKnowledgeEntryAction(entry.id, decision, {
      lesson: edit.lesson.trim() || undefined,
      organization: edit.organization.trim() || undefined,
      year: Number.isFinite(year) && edit.year.trim() ? year : undefined,
    });
    setBusyId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
  };

  return (
    <>
      <TopBar />
      <main className={styles.page}>
        <ProblemsPanel />

        <h1 className={styles.title}>Knowledge review</h1>
        <p className={styles.subtitle}>
          Entries the research loop has learned but no one has checked yet. Verify an entry to let
          retrieval trust it; give a case study its organization, year, and a lesson connection to
          make it deck-grade. Discard anything not worth keeping.
        </p>

        {error && <p className={styles.error}>{error}</p>}

        {loading ? (
          <p className={styles.status}>Loading learned entries…</p>
        ) : entries.length === 0 && !error ? (
          <p className={styles.status}>
            Nothing awaiting review. New entries appear here as the research loop learns topics.
          </p>
        ) : (
          <ul className={styles.list}>
            {entries.map((entry) => {
              const edit = editFor(entry.id);
              const busy = busyId === entry.id;
              return (
                <li key={entry.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h2 className={styles.cardTitle}>{entry.title}</h2>
                    <span className={`${styles.badge} ${styles.badgeSource}`}>{entry.source}</span>
                    <span className={styles.badge}>{entry.kind.replace("_", " ")}</span>
                  </div>
                  <p className={styles.summary}>{entry.summary}</p>
                  <p className={styles.meta}>
                    Topics: {entry.topics.join(", ") || "none"}
                    {entry.url && (
                      <>
                        {" · "}
                        <a href={entry.url} target="_blank" rel="noreferrer">
                          source
                        </a>
                      </>
                    )}
                  </p>

                  {entry.kind === "case_study" && (
                    <div className={styles.editRow}>
                      <p className={styles.editHint}>
                        To make this deck-grade, add the lesson it teaches (and the organization and
                        year when known). Leave blank to verify for retrieval only.
                      </p>
                      <input
                        className={styles.input}
                        type="text"
                        placeholder="Lesson connection (e.g. Validate numeric ranges when reusing code.)"
                        value={edit.lesson}
                        onChange={(e) => setEdit(entry.id, { lesson: e.target.value })}
                        disabled={busy}
                      />
                      <div className={styles.inputPair}>
                        <input
                          className={styles.input}
                          type="text"
                          placeholder="Organization"
                          value={edit.organization}
                          onChange={(e) => setEdit(entry.id, { organization: e.target.value })}
                          disabled={busy}
                        />
                        <input
                          className={styles.input}
                          type="text"
                          inputMode="numeric"
                          placeholder="Year"
                          value={edit.year}
                          onChange={(e) => setEdit(entry.id, { year: e.target.value })}
                          disabled={busy}
                        />
                      </div>
                    </div>
                  )}

                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.verify}
                      onClick={() => void review(entry, "verify")}
                      disabled={busy}
                    >
                      {busy ? "Saving…" : "Verify"}
                    </button>
                    <button
                      type="button"
                      className={styles.discard}
                      onClick={() => void review(entry, "discard")}
                      disabled={busy}
                    >
                      Discard
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
