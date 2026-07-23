"use client";

import { useEffect, useState } from "react";
import { Button, TextField } from "@mui/material";
import TabHeader from "./TabHeader";
import { useSupabase } from "@/context/SupabaseProvider";
import {
  listPendingPresentationDrafts,
  deletePresentationDraft,
  type PresentationDraft,
} from "@/lib/presentation-drafts";
import {
  updatePresentationDraftPayloadAction,
  markPresentationDraftReviewedAction,
} from "../actions";
import { buildSlidesPptx, type PptxTheme } from "@/lib/pptx";
import type { DeckTheme } from "@/lib/decks/types";
import TabShell from "./TabShell";
import { useDraftedGradesInbox } from "./DraftedGradesInbox";
import styles from "../page.module.css";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function gradientPng(t: DeckTheme): string | undefined {
  if (t.backgroundKind === "classic" || t.backgroundKind !== "gradient" || typeof document === "undefined") return undefined;
  const c = document.createElement("canvas");
  c.width = 1280;
  c.height = 720;
  const ctx = c.getContext("2d");
  if (!ctx) return undefined;
  const rad = (t.gradientAngle * Math.PI) / 180;
  const x = Math.cos(rad);
  const y = Math.sin(rad);
  const g = ctx.createLinearGradient(
    640 - x * 640,
    360 - y * 360,
    640 + x * 640,
    360 + y * 360
  );
  g.addColorStop(0, t.backgroundColor);
  g.addColorStop(1, t.backgroundColor2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 720);
  return c.toDataURL("image/png");
}

export default function PresentationDraftsTab({
  onOpenWorkflow,
}: {
  onOpenWorkflow?: (id: string) => void;
}) {
  const { supabase, user } = useSupabase();
  const { refresh: refreshBadge } = useDraftedGradesInbox();

  // Data state
  const [drafts, setDrafts] = useState<PresentationDraft[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSlides, setEditSlides] = useState<
    Array<{ title: string; bullets: string[]; code?: string; codeLanguage?: string }>
  >([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Load drafts on mount and when user changes
  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    (async () => {
      setStatus("loading");
      setError(null);
      try {
        const loaded = await listPendingPresentationDrafts(supabase, user.id);
        if (!cancelled) {
          setDrafts(loaded);
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load presentation drafts"
          );
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  const reload = async () => {
    if (!user) return;
    setStatus("loading");
    try {
      const loaded = await listPendingPresentationDrafts(supabase, user.id);
      setDrafts(loaded);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reload failed");
      setStatus("error");
    }
  };

  const handleDelete = async (draft: PresentationDraft) => {
    if (confirmDelete !== draft.id) {
      setConfirmDelete(draft.id);
      return;
    }

    setConfirmDelete(null);
    setDrafts((prev) => (prev ? prev.filter((d) => d.id !== draft.id) : null));
    refreshBadge();

    try {
      await deletePresentationDraft(supabase, user!.id, draft.id);
      setNote({ kind: "success", text: "Presentation draft deleted." });
    } catch (err) {
      setNote({
        kind: "error",
        text: err instanceof Error ? err.message : "Delete failed",
      });
      void reload();
    }
  };

  const startEdit = (draft: PresentationDraft) => {
    setEditingId(draft.id);
    setEditTitle(draft.payload.presentationTitle);
    setEditSlides(draft.payload.slides);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
    setEditSlides([]);
  };

  const saveEdit = async (draft: PresentationDraft) => {
    const newPayload = {
      ...draft.payload,
      presentationTitle: editTitle,
      slides: editSlides,
    };
    setBusy(draft.id);
    try {
      const res = await updatePresentationDraftPayloadAction(draft.id, newPayload);
      if ("error" in res) throw new Error(res.error);
      setDrafts((prev) =>
        prev
          ? prev.map((d) => (d.id === draft.id ? { ...d, payload: newPayload } : d))
          : null
      );
      setNote({ kind: "success", text: "Draft updated." });
      cancelEdit();
    } catch (err) {
      setNote({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not save.",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleMarkReviewed = async (draft: PresentationDraft) => {
    setBusy(draft.id);
    try {
      const res = await markPresentationDraftReviewedAction(draft.id);
      if ("error" in res) throw new Error(res.error);
      setDrafts((prev) =>
        prev
          ? prev.map((d) =>
              d.id === draft.id ? { ...d, status: "reviewed" as const } : d
            )
          : null
      );
      setNote({ kind: "success", text: "Draft marked reviewed." });
    } catch (err) {
      setNote({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not update draft.",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async (draft: PresentationDraft) => {
    setDownloadingId(draft.id);
    try {
      const pptxTheme: PptxTheme | undefined = draft.payload.theme && draft.payload.theme.backgroundKind !== "classic"
        ? {
            backgroundKind: draft.payload.theme.backgroundKind,
            backgroundColor: draft.payload.theme.backgroundColor,
            backgroundColor2: draft.payload.theme.backgroundColor2,
            fontColor: draft.payload.theme.fontColor,
            backgroundImageData: gradientPng(draft.payload.theme),
          }
        : undefined;
      const arrayBuffer = await buildSlidesPptx({
        presentationTitle: draft.payload.presentationTitle,
        slides: draft.payload.slides,
        author: user?.email || "Teaching Assistant",
        theme: pptxTheme,
      });
      const blob = new Blob([arrayBuffer], { type: PPTX_MIME });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${draft.payload.presentationTitle || "presentation"}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setNote({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not download file.",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const formatDateTime = (iso: string): string => {
    const date = new Date(iso);
    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  return (
    <TabShell>
      <TabHeader
        eyebrow="Drafts"
        title="Drafted presentations"
        subtitle="AI-generated presentations awaiting review. Edit and download them here; nothing is sent until you review and export."
      />

      {note && (
        <div className={note.kind === "error" ? styles.error : styles.fieldHint}>
          {note.text}
        </div>
      )}

      {status === "loading" && (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <div className={styles.loadingTitle}>Loading presentations...</div>
        </div>
      )}

      {status === "error" && (
        <div className={styles.error}>
          {error || "Failed to load presentations"}
        </div>
      )}

      {status === "ready" && drafts !== null && (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
            <Button variant="outlined" size="small" onClick={() => void reload()}>
              Refresh
            </Button>
          </div>

          {drafts.length === 0 ? (
            <div className={styles.emptyState}>
              No presentation drafts yet. Generate presentations and save them as drafts
              to see them here.
            </div>
          ) : (
            <div className={styles.draftList}>
              {drafts.map((draft) => (
                <div key={draft.id} className={styles.draftSection}>
                  <div className={styles.draftSectionHead}>
                    <div>
                      <div className={styles.draftSectionTitle}>
                        {draft.summary || "Presentation draft"}
                      </div>
                      <div className={styles.draftSectionMeta}>
                        {formatDateTime(draft.createdAt)} ·{" "}
                        {draft.payload.slides.length} slides
                        {draft.payload.presentationTitle &&
                          ` · ${draft.payload.presentationTitle}`}
                      </div>
                      {draft.workflowId && draft.workflowName && onOpenWorkflow && (
                        <button
                          type="button"
                          className={styles.linkButton}
                          style={{ marginTop: 4 }}
                          onClick={() => onOpenWorkflow(draft.workflowId!)}
                        >
                          From workflow: {draft.workflowName}
                        </button>
                      )}
                    </div>
                    <div className={styles.draftSectionActions}>
                      {editingId === draft.id ? (
                        <>
                          <Button
                            variant="contained"
                            size="small"
                            disabled={busy === draft.id}
                            onClick={() => void saveEdit(draft)}
                          >
                            {busy === draft.id ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            disabled={busy === draft.id}
                            onClick={cancelEdit}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => startEdit(draft)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="contained"
                            size="small"
                            disabled={downloadingId === draft.id}
                            onClick={() => void handleDownload(draft)}
                          >
                            {downloadingId === draft.id
                              ? "Downloading..."
                              : "Download .pptx"}
                          </Button>
                          {draft.status === "pending" && (
                            <Button
                              variant="contained"
                              size="small"
                              disabled={busy === draft.id}
                              onClick={() => void handleMarkReviewed(draft)}
                            >
                              {busy === draft.id
                                ? "Marking..."
                                : "Mark reviewed"}
                            </Button>
                          )}
                          <Button
                            variant="outlined"
                            size="small"
                            color="error"
                            onClick={() => void handleDelete(draft)}
                          >
                            {confirmDelete === draft.id
                              ? "Confirm delete"
                              : "Delete"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ padding: "10px 16px" }}>
                    {editingId === draft.id ? (
                      <>
                        <TextField
                          label="Presentation title"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          fullWidth
                          size="small"
                          sx={{ marginBottom: 2 }}
                        />
                        {editSlides.map((slide, idx) => (
                          <div
                            key={idx}
                            style={{
                              marginBottom: 16,
                              padding: "12px",
                              backgroundColor: "var(--field-bg)",
                              borderRadius: "4px",
                            }}
                          >
                            <TextField
                              label="Slide title"
                              value={slide.title}
                              onChange={(e) => {
                                const newSlides = [...editSlides];
                                newSlides[idx] = {
                                  ...newSlides[idx],
                                  title: e.target.value,
                                };
                                setEditSlides(newSlides);
                              }}
                              fullWidth
                              size="small"
                              sx={{ marginBottom: 1 }}
                            />
                            <TextField
                              label="Bullets (one per line)"
                              value={slide.bullets.join("\n")}
                              onChange={(e) => {
                                const newSlides = [...editSlides];
                                newSlides[idx] = {
                                  ...newSlides[idx],
                                  bullets: e.target.value
                                    .split("\n")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                };
                                setEditSlides(newSlides);
                              }}
                              fullWidth
                              multiline
                              rows={3}
                              size="small"
                              sx={{ marginBottom: 1 }}
                            />
                            {slide.code && (
                              <>
                                <TextField
                                  label="Language"
                                  value={slide.codeLanguage || ""}
                                  onChange={(e) => {
                                    const newSlides = [...editSlides];
                                    newSlides[idx] = {
                                      ...newSlides[idx],
                                      codeLanguage: e.target.value,
                                    };
                                    setEditSlides(newSlides);
                                  }}
                                  fullWidth
                                  size="small"
                                  sx={{ marginBottom: 1 }}
                                />
                                <TextField
                                  label="Code"
                                  value={slide.code}
                                  onChange={(e) => {
                                    const newSlides = [...editSlides];
                                    newSlides[idx] = {
                                      ...newSlides[idx],
                                      code: e.target.value,
                                    };
                                    setEditSlides(newSlides);
                                  }}
                                  fullWidth
                                  multiline
                                  rows={4}
                                  size="small"
                                  sx={{
                                    marginBottom: 1,
                                    fontFamily: "monospace",
                                  }}
                                />
                              </>
                            )}
                          </div>
                        ))}
                      </>
                    ) : (
                      <div>
                        {expanded.has(draft.id) ? (
                          <div style={{ marginBottom: 12 }}>
                            {draft.payload.slides.map((slide, idx) => (
                              <div
                                key={idx}
                                style={{
                                  marginBottom: 12,
                                  paddingBottom: 12,
                                  borderBottom:
                                    idx < draft.payload.slides.length - 1
                                      ? "1px solid var(--border-color)"
                                      : "none",
                                }}
                              >
                                <h4 style={{ margin: "0 0 0.5rem 0" }}>
                                  {slide.title}
                                </h4>
                                {slide.bullets.length > 0 && (
                                  <ul
                                    style={{
                                      margin: "0.5rem 0",
                                      paddingLeft: "1.5rem",
                                      fontSize: "0.9rem",
                                    }}
                                  >
                                    {slide.bullets.map((bullet, i) => (
                                      <li key={i}>{bullet}</li>
                                    ))}
                                  </ul>
                                )}
                                {slide.code && (
                                  <div
                                    style={{
                                      marginTop: "0.75rem",
                                      padding: "0.75rem",
                                      backgroundColor: "rgba(0,0,0,0.05)",
                                      borderRadius: "4px",
                                      fontFamily: "monospace",
                                      fontSize: "0.8rem",
                                      overflow: "auto",
                                      maxHeight: "150px",
                                      color: "var(--text-secondary)",
                                    }}
                                  >
                                    {slide.codeLanguage && (
                                      <div
                                        style={{
                                          fontSize: "0.75rem",
                                          fontWeight: 500,
                                          marginBottom: "0.25rem",
                                        }}
                                      >
                                        {slide.codeLanguage.toUpperCase()}
                                      </div>
                                    )}
                                    <pre
                                      style={{
                                        margin: 0,
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "break-word",
                                      }}
                                    >
                                      {slide.code}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => toggleExpand(draft.id)}
                          style={{ marginTop: 8 }}
                        >
                          {expanded.has(draft.id)
                            ? "Hide slides"
                            : `Show ${draft.payload.slides.length} slides`}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </TabShell>
  );
}
