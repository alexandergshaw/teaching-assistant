"use client";

import { useEffect, useState } from "react";
import { Button, TextField } from "@mui/material";
import TabHeader from "./TabHeader";
import { useSupabase } from "@/context/SupabaseProvider";
import { listPendingMessageDrafts, deleteMessageDraft, type MessageDraft } from "@/lib/message-drafts";
import { updateMessageDraftPayloadAction, postMessageDraftAction } from "../actions";
import { useDraftedGradesInbox } from "./DraftedGradesInbox";
import styles from "../page.module.css";

export default function MessageDraftsTab({ onOpenWorkflow }: { onOpenWorkflow?: (id: string) => void }) {
  const { supabase, user } = useSupabase();
  const { refresh: refreshBadge } = useDraftedGradesInbox();

  // Data state
  const [drafts, setDrafts] = useState<MessageDraft[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmPost, setConfirmPost] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
        const loaded = await listPendingMessageDrafts(supabase, user.id);
        if (!cancelled) {
          setDrafts(loaded);
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load drafted messages");
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
      const loaded = await listPendingMessageDrafts(supabase, user.id);
      setDrafts(loaded);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reload failed");
      setStatus("error");
    }
  };

  const handleDelete = async (draft: MessageDraft) => {
    if (confirmDelete !== draft.id) {
      setConfirmDelete(draft.id);
      return;
    }

    setConfirmDelete(null);
    setDrafts((prev) => (prev ? prev.filter((d) => d.id !== draft.id) : null));
    refreshBadge();

    try {
      await deleteMessageDraft(supabase, user!.id, draft.id);
      setNote({ kind: "success", text: "Drafted message deleted." });
    } catch (err) {
      setNote({
        kind: "error",
        text: err instanceof Error ? err.message : "Delete failed",
      });
      void reload();
    }
  };

  const startEdit = (draft: MessageDraft) => {
    setEditingId(draft.id);
    setEditBody(draft.payload.body);
    setEditTitle(draft.payload.kind === "announcement" ? draft.payload.title ?? "" : "");
    setConfirmPost(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditBody("");
    setEditTitle("");
  };

  const saveEdit = async (draft: MessageDraft) => {
    const newPayload = {
      ...draft.payload,
      body: editBody,
      ...(draft.payload.kind === "announcement" ? { title: editTitle } : {}),
    };
    setBusy(draft.id);
    try {
      const res = await updateMessageDraftPayloadAction(draft.id, newPayload);
      if ("error" in res) throw new Error(res.error);
      setDrafts((prev) =>
        prev ? prev.map((d) => (d.id === draft.id ? { ...d, payload: newPayload } : d)) : null
      );
      setNote({ kind: "success", text: "Draft updated." });
      cancelEdit();
    } catch (err) {
      setNote({ kind: "error", text: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(null);
    }
  };

  const handlePost = async (draft: MessageDraft) => {
    if (confirmPost !== draft.id) {
      setConfirmPost(draft.id);
      return;
    }
    setConfirmPost(null);
    setBusy(draft.id);
    try {
      const res = await postMessageDraftAction(draft.id);
      if ("error" in res) throw new Error(res.error);
      setDrafts((prev) => (prev ? prev.filter((d) => d.id !== draft.id) : null));
      refreshBadge();
      const successMsg =
        draft.payload.kind === "reply" ? "Reply sent." : "Announcement posted.";
      setNote({ kind: "success", text: successMsg });
    } catch (err) {
      setNote({ kind: "error", text: err instanceof Error ? err.message : "Could not post the message." });
    } finally {
      setBusy(null);
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
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <section className={styles.card}>
      <TabHeader
        eyebrow="Drafts"
        title="Drafted messages"
        subtitle="AI-drafted replies and announcements awaiting review. Edit and send them here; nothing is sent until you post."
      />

      {note && (
        <div className={note.kind === "error" ? styles.error : styles.fieldHint}>
          {note.text}
        </div>
      )}

      {status === "loading" && (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <div className={styles.loadingTitle}>Loading drafted messages...</div>
        </div>
      )}

      {status === "error" && (
        <div className={styles.error}>{error || "Failed to load drafted messages"}</div>
      )}

      {status === "ready" && drafts !== null && (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => void reload()}
            >
              Refresh
            </Button>
          </div>

          {drafts.length === 0 ? (
            <div className={styles.emptyState}>No drafted messages yet. Run a workflow that ends in Save a message draft and they will appear here.</div>
          ) : (
            <div className={styles.draftList}>
              {drafts.map((draft) => (
                <div key={draft.id} className={styles.draftSection}>
                  <div className={styles.draftSectionHead}>
                    <div>
                      <div className={styles.draftSectionTitle}>
                        {draft.summary || (draft.payload.kind === "reply" ? "Drafted reply" : "Drafted announcement")}
                      </div>
                      <div className={styles.draftSectionMeta}>
                        {formatDateTime(draft.createdAt)} · {draft.payload.kind === "reply"
                          ? `reply to conversation ${draft.payload.conversationId ?? "?"}`
                          : `announcement${draft.payload.title ? `: ${draft.payload.title}` : ""}`}
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
                            disabled={busy === draft.id}
                            onClick={() => void handlePost(draft)}
                          >
                            {busy === draft.id ? "Sending..." : confirmPost === draft.id ? "Confirm send" : "Send"}
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            color="error"
                            onClick={() => void handleDelete(draft)}
                          >
                            {confirmDelete === draft.id ? "Confirm delete" : "Delete"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ padding: "10px 16px" }}>
                    {editingId === draft.id ? (
                      <>
                        {draft.payload.kind === "announcement" && (
                          <TextField
                            size="small"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            sx={{ width: "100%", marginBottom: 1 }}
                          />
                        )}
                        <TextField
                          multiline
                          minRows={4}
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          sx={{ width: "100%" }}
                        />
                      </>
                    ) : (
                      <p className={styles.draftFeedback}>{draft.payload.body}</p>
                    )}

                    {draft.payload.context && (
                      <>
                        <div className={styles.fieldHint} style={{ margin: 0, marginTop: 12 }}>
                          Original thread
                        </div>
                        {expanded.has(draft.id) ? (
                          <p className={styles.draftFeedback}>{draft.payload.context}</p>
                        ) : null}
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => toggleExpand(draft.id)}
                          style={{ marginTop: 8 }}
                        >
                          {expanded.has(draft.id) ? "Hide" : "Show"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
