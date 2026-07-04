"use client";

import { useEffect, useState } from "react";
import {
  bulkAssociateRubricAction,
  createRubricAction,
  getRubricAction,
  updateRubricAction,
} from "../../actions";
import type { RubricCriterionInput } from "@/lib/canvas-modules";
import styles from "../../page.module.css";
import type { EditCriterion, EditRating } from "./types";
import { defaultCriterion, nextRubricKey } from "./utils";

export function RubricBuilderModal({
  courseUrl,
  acronym,
  assignments,
  rubricId,
  onClose,
  onCreated,
}: {
  courseUrl: string;
  acronym?: string;
  assignments: Array<{ id: string; title: string; points: number | null }>;
  rubricId?: number;
  onClose: () => void;
  onCreated: (title: string, associated: number) => void;
}) {
  const editing = rubricId != null;
  const [title, setTitle] = useState("");
  // Percentage mode (default for new rubrics): criteria sum to 100% and are
  // scaled to each assignment's point total on apply. Editing loads raw points.
  const [mode, setMode] = useState<"percent" | "points">(editing ? "points" : "percent");
  const [criteria, setCriteria] = useState<EditCriterion[]>(() => (editing ? [] : [defaultCriterion(mode)]));
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const unit = mode === "percent" ? "%" : "pts";

  useEffect(() => {
    if (!editing || rubricId == null) return;
    let cancelled = false;
    (async () => {
      const result = await getRubricAction(courseUrl, rubricId, acronym);
      if (cancelled) return;
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        setLoading(false);
        return;
      }
      setTitle(result.rubric.title);
      setCriteria(
        result.rubric.criteria.map((c) => ({
          key: nextRubricKey(),
          description: c.description,
          points: c.points,
          ratings: c.ratings.map((r) => ({
            key: nextRubricKey(),
            description: r.description,
            longDescription: r.longDescription ?? "",
            points: r.points,
          })),
        }))
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, rubricId, courseUrl, acronym]);

  const patchCrit = (key: string, p: Partial<EditCriterion>) =>
    setCriteria((cs) => cs.map((c) => (c.key === key ? { ...c, ...p } : c)));
  const patchRating = (ck: string, rk: string, p: Partial<EditRating>) =>
    setCriteria((cs) => cs.map((c) => (c.key !== ck ? c : { ...c, ratings: c.ratings.map((r) => (r.key === rk ? { ...r, ...p } : r)) })));
  const addCriterion = () => setCriteria((cs) => [...cs, defaultCriterion(mode)]);
  const removeCriterion = (key: string) => setCriteria((cs) => (cs.length > 1 ? cs.filter((c) => c.key !== key) : cs));
  const addRating = (ck: string) =>
    setCriteria((cs) => cs.map((c) => (c.key === ck ? { ...c, ratings: [...c.ratings, { key: nextRubricKey(), description: "", longDescription: "", points: 0 }] } : c)));
  const removeRating = (ck: string, rk: string) =>
    setCriteria((cs) => cs.map((c) => (c.key !== ck ? c : { ...c, ratings: c.ratings.length > 1 ? c.ratings.filter((r) => r.key !== rk) : c.ratings })));

  // Rescale a criterion's rating tiers so its top tier equals `newPts` (others
  // scale proportionally; if all tiers are 0, the first tier takes the value).
  const scaleTiers = (c: EditCriterion, newPts: number): EditCriterion => {
    const oldMax = c.ratings.reduce((m, r) => Math.max(m, Number.isFinite(r.points) ? r.points : 0), 0);
    const ratings =
      oldMax > 0
        ? c.ratings.map((r) => ({ ...r, points: Math.round(((Number.isFinite(r.points) ? r.points : 0) * newPts) / oldMax) }))
        : c.ratings.map((r, i) => ({ ...r, points: i === 0 ? newPts : 0 }));
    return { ...c, points: newPts, ratings };
  };

  // Percentage mode: after a criterion's % is edited, scale its tiers to that %
  // and rebalance the other criteria proportionally so the rubric stays at 100%.
  const rebalanceCriterion = (key: string) =>
    setCriteria((cs) => {
      const target = cs.find((c) => c.key === key);
      if (!target) return cs;
      const clamped = Math.max(0, Math.min(100, Number.isFinite(target.points) ? target.points : 0));
      const others = cs.filter((c) => c.key !== key);
      const othersSum = others.reduce((s, c) => s + (Number.isFinite(c.points) ? c.points : 0), 0);
      const remaining = 100 - clamped;
      return cs.map((c) => {
        if (c.key === key) return scaleTiers(c, clamped);
        if (others.length === 0) return c;
        const share =
          othersSum > 0
            ? Math.round(((Number.isFinite(c.points) ? c.points : 0) * remaining) / othersSum)
            : Math.round(remaining / others.length);
        return scaleTiers(c, Math.max(0, share));
      });
    });

  const total = criteria.reduce((s, c) => s + (Number.isFinite(c.points) ? c.points : 0), 0);

  // Build criteria with the given numbers as points (rounded). `scale` converts a
  // percentage value to points for a specific assignment.
  const buildCriteria = (scale: (v: number) => number): RubricCriterionInput[] =>
    criteria.map((c) => ({
      description: c.description.trim() || "Criterion",
      points: scale(Number.isFinite(c.points) ? c.points : 0),
      ratings: c.ratings.map((r) => ({
        description: r.description.trim() || `${r.points}${unit}`,
        longDescription: r.longDescription.trim() || undefined,
        points: scale(Number.isFinite(r.points) ? r.points : 0),
      })),
    }));

  const handleCreate = async () => {
    if (!title.trim()) {
      setNote({ kind: "error", text: "Give the rubric a title." });
      return;
    }
    setSaving(true);
    setNote(null);

    // Editing: update the rubric's criteria/tiers in place (points as entered).
    if (editing && rubricId != null) {
      const result = await updateRubricAction(courseUrl, rubricId, { title: title.trim(), criteria: buildCriteria((v) => v) }, acronym);
      setSaving(false);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      onCreated(title.trim(), 0);
      return;
    }

    // Percentage mode with assignments: a per-assignment rubric scaled to that
    // assignment's point total, so different totals each get a correct rubric.
    if (mode === "percent" && assignments.length > 0) {
      let associated = 0;
      const failed: string[] = [];
      for (const a of assignments) {
        const total = a.points != null && a.points > 0 ? a.points : 100;
        const scaled = buildCriteria((pct) => Math.round((pct / 100) * total));
        const result = await createRubricAction(
          courseUrl,
          { title: title.trim(), criteria: scaled, associateAssignmentId: Number(a.id), useForGrading: true },
          acronym
        );
        if ("error" in result) failed.push(a.title);
        else associated += 1;
      }
      setSaving(false);
      if (associated === 0) {
        setNote({ kind: "error", text: `Could not create the rubric${failed.length ? `: ${failed[0]}` : "."}` });
        return;
      }
      onCreated(title.trim(), associated);
      return;
    }

    // Point mode, or percentage mode with no assignments: one rubric using the
    // entered numbers as points (percentages become an out-of-100 rubric).
    const result = await createRubricAction(courseUrl, { title: title.trim(), criteria: buildCriteria((v) => v) }, acronym);
    if ("error" in result) {
      setSaving(false);
      setNote({ kind: "error", text: result.error });
      return;
    }
    let associated = 0;
    if (assignments.length > 0) {
      const assoc = await bulkAssociateRubricAction(courseUrl, result.rubric.id, assignments.map((a) => a.id), acronym);
      if ("error" in assoc) {
        setSaving(false);
        setNote({ kind: "error", text: `Rubric created, but could not associate it: ${assoc.error}` });
        return;
      }
      associated = assoc.updated;
    }
    setSaving(false);
    onCreated(result.rubric.title, associated);
  };

  return (
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.previewModal} style={{ width: "min(760px, 95vw)", maxWidth: "none" }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.previewHeader}>
          <h3>{editing ? "Edit rubric" : "New rubric"}</h3>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "68vh", overflowY: "auto" }}>
          <div className={styles.field}>
            <label htmlFor="rubric-title">Title</label>
            <input id="rubric-title" type="text" className={styles.textInput} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Essay rubric" />
          </div>

          {loading && <p className={styles.fieldHint} style={{ margin: 0 }}>Loading rubric…</p>}

          {!editing && (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className={styles.bulkLabel} style={{ flex: "0 0 auto" }}>Mode</span>
                <button type="button" className={mode === "percent" ? styles.bulkBtnPrimary : styles.bulkBtn} onClick={() => setMode("percent")}>
                  Percentage
                </button>
                <button type="button" className={mode === "points" ? styles.bulkBtnPrimary : styles.bulkBtn} onClick={() => setMode("points")}>
                  Points
                </button>
              </div>

              <p className={styles.fieldHint} style={{ margin: 0 }}>
                {assignments.length > 0
                  ? mode === "percent"
                    ? `Criteria are percentages; on apply they are scaled to each of the ${assignments.length} selected assignment${assignments.length === 1 ? "'s" : "s'"} point total (one scaled rubric per assignment, so different totals are handled).`
                    : `Will be associated with ${assignments.length} selected assignment${assignments.length === 1 ? "" : "s"} and used for grading.`
                  : mode === "percent"
                    ? "No assignments selected — a single out-of-100 rubric will be created to associate later."
                    : "No assignments selected — the rubric will be created and available to associate later."}
              </p>
            </>
          )}

          {criteria.map((c, ci) => (
            <div key={c.key} style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className={styles.ccCount}>Criterion {ci + 1}</span>
                <span style={{ flex: 1 }} />
                <span className={styles.bulkField}>
                  <input
                    type="number"
                    className={styles.bulkInput}
                    style={{ width: 72 }}
                    value={c.points}
                    onChange={(e) => patchCrit(c.key, { points: Number(e.target.value) })}
                    onBlur={() => {
                      if (mode === "percent") rebalanceCriterion(c.key);
                    }}
                    aria-label={`Criterion ${ci + 1} ${mode === "percent" ? "percent" : "points"}`}
                  />
                  <span className={styles.ccCount}>{unit}</span>
                </span>
                {criteria.length > 1 && (
                  <button type="button" className={`${styles.ccBtn} ${styles.ccBtnDanger}`} onClick={() => removeCriterion(c.key)}>
                    Remove
                  </button>
                )}
              </div>
              <input
                type="text"
                className={styles.textInput}
                placeholder="What this criterion measures"
                value={c.description}
                onChange={(e) => patchCrit(c.key, { description: e.target.value })}
              />
              <span className={styles.ccCount}>Rating tiers</span>
              {c.ratings.map((r) => (
                <div key={r.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      className={styles.bulkInput}
                      style={{ flex: "1 1 200px", minWidth: 150 }}
                      placeholder="Tier label (e.g. Excellent)"
                      value={r.description}
                      onChange={(e) => patchRating(c.key, r.key, { description: e.target.value })}
                    />
                    <span className={styles.bulkField}>
                      <input
                        type="number"
                        className={styles.bulkInput}
                        style={{ width: 70 }}
                        value={r.points}
                        onChange={(e) => patchRating(c.key, r.key, { points: Number(e.target.value) })}
                        aria-label="Tier value"
                      />
                      <span className={styles.ccCount}>{unit}</span>
                    </span>
                    {c.ratings.length > 1 && (
                      <button type="button" className={styles.ccIconBtn} title="Remove tier" aria-label="Remove tier" onClick={() => removeRating(c.key, r.key)}>
                        &times;
                      </button>
                    )}
                  </div>
                  <textarea
                    className={styles.bulkInput}
                    style={{ width: "100%", minHeight: 40, resize: "vertical", padding: "6px 10px" }}
                    placeholder="Tier description (optional — the detail shown to students for this level)"
                    value={r.longDescription}
                    onChange={(e) => patchRating(c.key, r.key, { longDescription: e.target.value })}
                    aria-label="Tier description"
                  />
                </div>
              ))}
              <button type="button" className={styles.ccBtn} style={{ alignSelf: "flex-start" }} onClick={() => addRating(c.key)}>
                Add tier
              </button>
            </div>
          ))}

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className={styles.ccBtn} onClick={addCriterion}>
              Add criterion
            </button>
            <span className={styles.fieldHint} style={{ margin: 0 }}>
              Overall rubric: {total}{unit}{mode === "percent" ? " (aim for 100%)" : " (sum of criteria)"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid var(--card-border)" }}>
            <button type="button" className={styles.submitButton} onClick={() => void handleCreate()} disabled={saving || loading || !title.trim()}>
              {saving
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : assignments.length > 0
                    ? "Create & associate"
                    : "Create rubric"}
            </button>
          </div>
          {note && <p className={note.kind === "error" ? styles.error : styles.fieldHint}>{note.text}</p>}
        </div>
      </div>
    </div>
  );
}



// ── Module tree ────────────────────────────────────────────────────────────---

