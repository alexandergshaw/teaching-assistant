"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, TextField } from "@mui/material";
import TabHeader from "./TabHeader";
import { useSupabase } from "@/context/SupabaseProvider";
import { listPendingMessageDrafts, deleteMessageDraft, type MessageDraft } from "@/lib/message-drafts";
import type { Course } from "@/lib/supabase/courses";
import {
  updateMessageDraftPayloadAction,
  postMessageDraftAction,
  sendMessageDraftByEmailAction,
  listCourseHubAction,
} from "../actions";
import TabShell from "./TabShell";
import { useDraftedGradesInbox } from "./DraftedGradesInbox";
import { isConfirmArmed } from "./content-tab/modules/confirmArming";
import {
  buildCourseRecipientIndex,
  describeMessageDraftRecipients,
  resolveMessageDraftSubject,
  messageDraftArmSignature,
  type MessageDraftAction,
} from "./message-drafts-helpers";
import styles from "../page.module.css";

export default function MessageDraftsTab({ onOpenWorkflow }: { onOpenWorkflow?: (id: string) => void }) {
  const { supabase, user } = useSupabase();
  const { refresh: refreshBadge } = useDraftedGradesInbox();

  // Data state
  const [drafts, setDrafts] = useState<MessageDraft[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  // B2: a single signature-based arm, replacing three bare draft ids
  // (confirmPost/confirmEmail/confirmDelete) that nothing ever cleared. See
  // message-drafts-helpers.ts's messageDraftArmSignature - the armed value
  // records WHAT it was armed for (draft id + action + current body/title),
  // so a reload, an edit, or arming a different draft's button all
  // invalidate a stale arm by construction rather than needing an explicit
  // reset at every call site that could touch a draft.
  const [armedFor, setArmedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // B1: courses loaded so an announcement's recipients can be named (course
  // + student-email count) before any send, in both the meta line and the
  // confirm banner - not just the email path, since a Canvas announcement
  // reaches the same whole class. A failed/slow load just leaves
  // courseIndex empty; describeMessageDraftRecipients degrades to a legible
  // "unrecognized course" fallback rather than crashing or blocking sends.
  const [courses, setCourses] = useState<Course[]>([]);

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

  // B1: courses loaded once, independent of the drafts load above - only
  // needed to resolve an announcement's hubCourseId into a name + count.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listCourseHubAction();
      if (!cancelled && !("error" in res)) {
        setCourses(res.courses);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const courseIndex = useMemo(() => buildCourseRecipientIndex(courses), [courses]);

  const reload = async () => {
    if (!user) return;
    // B2: an armed confirmation is a claim about the CURRENT draft content;
    // a reload can bring back different content (or a different set of
    // drafts entirely), so any pending arm is explicitly dropped here too -
    // on top of the fact that a changed payload would already invalidate
    // the signature on its own.
    setArmedFor(null);
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

  // B4: no optimistic removal - the row stays on screen, and Delete is
  // disabled (disabled={busy === draft.id}, wired below) for exactly the
  // window a send for this same draft could be in flight, so Delete can
  // never race a Send/Send-by-email to the same draft. Only removed from
  // local state once the server confirms the delete.
  const handleDelete = async (draft: MessageDraft) => {
    setArmedFor(null);
    setBusy(draft.id);
    try {
      await deleteMessageDraft(supabase, user!.id, draft.id);
      setDrafts((prev) => (prev ? prev.filter((d) => d.id !== draft.id) : null));
      refreshBadge();
      setNote({ kind: "success", text: "Drafted message deleted." });
    } catch (err) {
      setNote({
        kind: "error",
        text: err instanceof Error ? err.message : "Delete failed",
      });
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (draft: MessageDraft) => {
    setEditingId(draft.id);
    setEditBody(draft.payload.body);
    // B3: seed the Subject field the same way for EVERY kind, not just
    // announcements - the exact fallback the server applies for the email
    // path (messaging-outlook.ts:154), so the instructor sees precisely
    // what would otherwise go out unedited.
    setEditTitle(resolveMessageDraftSubject(draft.payload, draft.summary));
    setArmedFor(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditBody("");
    setEditTitle("");
  };

  const saveEdit = async (draft: MessageDraft) => {
    // B3: the Subject is now editable, and saved, for every kind - not just
    // announcements. coerceMessageDraftPayload (src/lib/message-drafts.ts)
    // already accepts an optional title on any kind; every send path that
    // reads it (Canvas announcement/message title, and the email subject
    // fallback payload.title || draft.summary) already treats an unset or
    // blank title as "no override", so this never changes reply/message
    // behavior for an instructor who leaves the field untouched.
    const newPayload = {
      ...draft.payload,
      body: editBody,
      title: editTitle,
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

  // B2: handlePost/handleSendByEmail/handleDelete (above) no longer arm
  // their own confirmation - they only ever run once armed and then
  // explicitly confirmed via the banner below (see armedActionFor /
  // runArmedAction), so a click on Send/Send by email/Delete itself only
  // ever arms, never sends. See message-drafts-helpers.ts for why this is
  // safe against a double click or a stray Enter/Space landing on the
  // still-focused first-click button: re-arming an already-armed action is
  // a harmless no-op, not a second confirmation.
  const handlePost = async (draft: MessageDraft) => {
    setArmedFor(null);
    setBusy(draft.id);
    try {
      const res = await postMessageDraftAction(draft.id);
      if ("error" in res) throw new Error(res.error);
      setDrafts((prev) => (prev ? prev.filter((d) => d.id !== draft.id) : null));
      refreshBadge();
      const successMsg =
        draft.payload.kind === "reply" ? "Reply sent." : draft.payload.kind === "message" ? "Message sent." : "Announcement posted.";
      setNote({ kind: "success", text: successMsg });
    } catch (err) {
      setNote({ kind: "error", text: err instanceof Error ? err.message : "Could not post the message." });
    } finally {
      setBusy(null);
    }
  };

  const handleSendByEmail = async (draft: MessageDraft) => {
    setArmedFor(null);
    setBusy(draft.id);
    try {
      const res = await sendMessageDraftByEmailAction(draft.id);
      if ("error" in res) throw new Error(res.error);
      setDrafts((prev) => (prev ? prev.filter((d) => d.id !== draft.id) : null));
      refreshBadge();
      setNote({ kind: "success", text: "Sent by email." });
    } catch (err) {
      setNote({ kind: "error", text: err instanceof Error ? err.message : "Could not send the message by email." });
    } finally {
      setBusy(null);
    }
  };

  // Which action (if any) is currently armed for this specific draft - at
  // most one is ever true across the whole tab, since armedFor is a single
  // shared value (arming a different draft's button, or a different action
  // on the same draft, overwrites it outright - B2's "clear whenever a
  // different draft's action is armed", satisfied by construction rather
  // than an explicit reset).
  const armedActionFor = (draft: MessageDraft): MessageDraftAction | null => {
    if (isConfirmArmed(armedFor, messageDraftArmSignature(draft, "post"))) return "post";
    if (isConfirmArmed(armedFor, messageDraftArmSignature(draft, "email"))) return "email";
    if (isConfirmArmed(armedFor, messageDraftArmSignature(draft, "delete"))) return "delete";
    return null;
  };

  // B1 + B2: the confirm banner's sentence - always names who a send
  // reaches (reusing the exact same describeMessageDraftRecipients the meta
  // line below uses, so the two can never say something different) and
  // always states irreversibility.
  const armedBannerText = (draft: MessageDraft, action: MessageDraftAction): string => {
    if (action === "delete") {
      return "Delete this drafted message? This does not affect anything already sent, and cannot be undone.";
    }
    const recipients = describeMessageDraftRecipients(draft.payload, courseIndex);
    const verb =
      action === "email"
        ? "Send by email"
        : draft.payload.kind === "announcement"
        ? "Post this announcement to Canvas"
        : draft.payload.kind === "reply"
        ? "Send this reply"
        : "Send this message";
    return `${verb} to ${recipients.text}. Sending cannot be undone.`;
  };

  const armedConfirmLabel = (action: MessageDraftAction): string =>
    action === "post" ? "Confirm send" : action === "email" ? "Confirm send by email" : "Confirm delete";

  const runArmedAction = (draft: MessageDraft, action: MessageDraftAction) => {
    if (action === "post") void handlePost(draft);
    else if (action === "email") void handleSendByEmail(draft);
    else void handleDelete(draft);
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
    <TabShell>
      <TabHeader
        eyebrow="Drafts"
        title="Drafted messages"
        subtitle="AI-drafted replies, messages, and announcements awaiting review. Edit and send them here; nothing is sent until you post."
      />

      {note && (
        <div className={note.kind === "error" ? styles.error : styles.fieldHint}>
          {note.text}
        </div>
      )}

      {status === "loading" && (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <div className={styles.spinner} />
          <div className={styles.loadingTitle}>Loading drafted messages...</div>
        </div>
      )}

      {status === "error" && (
        <div className={styles.error}>{error || "Failed to load drafted messages"}</div>
      )}

      {status === "ready" && drafts !== null && (
        <>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-4)" }}>
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
              {drafts.map((draft) => {
                const armedAction = armedActionFor(draft);
                const recipients = describeMessageDraftRecipients(draft.payload, courseIndex);
                const subject = resolveMessageDraftSubject(draft.payload, draft.summary);
                return (
                <div key={draft.id} className={styles.draftSection}>
                  <div className={styles.draftSectionHead}>
                    <div>
                      <div className={styles.draftSectionTitle}>
                        {draft.summary || (draft.payload.kind === "reply" ? "Drafted reply" : draft.payload.kind === "message" ? "Drafted message" : "Drafted announcement")}
                      </div>
                      <div className={styles.draftSectionMeta}>
                        {formatDateTime(draft.createdAt)} · {draft.payload.kind === "reply"
                          ? `reply to conversation ${draft.payload.conversationId ?? "?"}`
                          : draft.payload.kind === "message"
                          ? `message to ${draft.payload.recipientName || "student"}${draft.payload.recipientEmail ? ` (${draft.payload.recipientEmail})` : ""}`
                          : `announcement${draft.payload.title ? `: ${draft.payload.title}` : ""}`}
                      </div>
                      {/* B1: names who this reaches even before any send
                          button is touched - not only inside the confirm
                          banner - and B3: shows the subject a student
                          actually sees, without needing to click Edit. */}
                      <div className={styles.draftSectionMeta}>
                        Reaches {recipients.text} · Subject: {subject}
                      </div>
                      {draft.workflowId && draft.workflowName && onOpenWorkflow && (
                        <button
                          type="button"
                          className={styles.linkButton}
                          style={{ marginTop: "var(--space-1)" }}
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
                            disabled={busy === draft.id}
                            onClick={() => startEdit(draft)}
                          >
                            Edit
                          </Button>
                          {/* B2: this button's label never changes and it
                              never sends by itself - clicking it only arms
                              the confirm banner below (out from under this
                              button, and not occupying this button's own
                              pixels), so a double-click or a stray
                              Enter/Space landing here after the first click
                              just re-arms harmlessly instead of sending. */}
                          <Button
                            variant="contained"
                            size="small"
                            disabled={busy === draft.id}
                            onClick={() => setArmedFor(messageDraftArmSignature(draft, "post"))}
                          >
                            {busy === draft.id ? "Sending..." : "Send"}
                          </Button>
                          {(draft.payload.recipientEmail || (draft.payload.kind === "announcement" && draft.payload.hubCourseId)) && (
                            <Button
                              variant="outlined"
                              size="small"
                              disabled={busy === draft.id}
                              onClick={() => setArmedFor(messageDraftArmSignature(draft, "email"))}
                            >
                              {busy === draft.id ? "Sending..." : "Send by email"}
                            </Button>
                          )}
                          {/* B4: guarded the same way Send/Send by email
                              already are - a send in flight for this draft
                              (busy === draft.id) disables Delete, so Delete
                              can never race a send for the same draft. */}
                          <Button
                            variant="outlined"
                            size="small"
                            color="error"
                            disabled={busy === draft.id}
                            onClick={() => setArmedFor(messageDraftArmSignature(draft, "delete"))}
                          >
                            {busy === draft.id ? "Deleting..." : "Delete"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ padding: "var(--space-2) var(--space-4)" }}>
                    {editingId === draft.id ? (
                      <>
                        {/* B3: shown for every kind now, not only
                            announcements - seeded in startEdit from
                            resolveMessageDraftSubject, so an instructor
                            editing a reply's body can also see and change
                            the exact line a student's inbox will show. */}
                        <TextField
                          size="small"
                          label="Subject (what the student sees)"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          sx={{ width: "100%", marginBottom: 1 }}
                        />
                        <TextField
                          multiline
                          minRows={4}
                          label="Message"
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
                        <div className={styles.fieldHint} style={{ margin: 0, marginTop: "var(--space-3)" }}>
                          Original thread
                        </div>
                        {expanded.has(draft.id) ? (
                          <p className={styles.draftFeedback}>{draft.payload.context}</p>
                        ) : null}
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => toggleExpand(draft.id)}
                          style={{ marginTop: "var(--space-2)" }}
                        >
                          {expanded.has(draft.id) ? "Hide" : "Show"}
                        </Button>
                      </>
                    )}

                    {/* B2: the confirm banner - rendered BELOW the draft's
                        body/context, never in the action row above, so the
                        confirming click is never at the position the
                        arming click was. Reuses KnowledgeTab.tsx's
                        kbWarnBanner/kbWarnActions shell (its own delete
                        confirmation) rather than inventing a second one. */}
                    {armedAction && (
                      <div className={styles.kbWarnBanner} role="alertdialog" aria-label={armedConfirmLabel(armedAction)} style={{ marginTop: "var(--space-3)" }}>
                        <span>{armedBannerText(draft, armedAction)}</span>
                        <div className={styles.kbWarnActions}>
                          <Button
                            size="small"
                            variant="contained"
                            color={armedAction === "delete" ? "error" : "primary"}
                            disabled={busy === draft.id}
                            onClick={() => runArmedAction(draft, armedAction)}
                          >
                            {busy === draft.id ? "Working..." : armedConfirmLabel(armedAction)}
                          </Button>
                          <Button size="small" disabled={busy === draft.id} onClick={() => setArmedFor(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </TabShell>
  );
}
