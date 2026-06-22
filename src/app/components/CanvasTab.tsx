"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listAnnouncementsAction,
  createAnnouncementAction,
  listConversationsAction,
  getConversationAction,
  replyToConversationAction,
  draftAnnouncementAction,
  draftMessageReplyAction,
} from "../actions";
import type {
  CanvasAnnouncement,
  CanvasConversationSummary,
  CanvasConversationDetail,
} from "@/lib/canvas";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { useLlmProvider } from "@/lib/llm-provider";
import styles from "../page.module.css";

const COURSE_URL_KEY = "ta-canvas-course-url";
const VIEW_KEY = "ta-canvas-view";
const SAVED_COURSES_KEY = "ta-canvas-saved-courses";

/** A Canvas course the user pinned so they can jump back into it. */
interface SavedCourse {
  id: string;
  url: string;
  name: string;
}

function readSavedCourses(): SavedCourse[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_COURSES_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c): c is SavedCourse => !!c && typeof c.id === "string" && typeof c.url === "string")
      .map((c) => ({ id: c.id, url: c.url, name: typeof c.name === "string" && c.name ? c.name : `Course ${c.id}` }));
  } catch {
    return [];
  }
}

// Format a Canvas ISO timestamp for display; blank when absent.
function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── Announcements ───────────────────────────────────────────────────────────

function AnnouncementsPanel() {
  const [provider] = useLlmProvider();

  // Restore the last course URL so the tab reopens where it left off.
  const [courseUrl, setCourseUrl] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem(COURSE_URL_KEY) ?? "" : ""
  );
  const [courseName, setCourseName] = useState("");
  const [announcements, setAnnouncements] = useState<CanvasAnnouncement[]>([]);
  const [loadState, setLoadState] = useState<{ status: "idle" | "loading" | "error"; message: string }>({
    status: "idle",
    message: "",
  });

  const [savedCourses, setSavedCourses] = useState<SavedCourse[]>(() => readSavedCourses());

  const [draftPrompt, setDraftPrompt] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const [postNote, setPostNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const courseId = parseCanvasCourseId(courseUrl);
  const isSaved = !!courseId && savedCourses.some((c) => c.id === courseId);

  const persistSavedCourses = (next: SavedCourse[]) => {
    setSavedCourses(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(SAVED_COURSES_KEY, JSON.stringify(next));
    }
  };

  const loadAnnouncements = async (url: string) => {
    const id = parseCanvasCourseId(url);
    if (!id) return;
    localStorage.setItem(COURSE_URL_KEY, url);
    setLoadState({ status: "loading", message: "" });
    const result = await listAnnouncementsAction(url);
    if ("error" in result) {
      setAnnouncements([]);
      setCourseName("");
      setLoadState({ status: "error", message: result.error });
      return;
    }
    setCourseName(result.courseName);
    setAnnouncements(result.announcements);
    setLoadState({ status: "idle", message: "" });
    // Keep a saved course's label fresh once we know its real name.
    if (savedCourses.some((c) => c.id === id)) {
      persistSavedCourses(
        savedCourses.map((c) => (c.id === id ? { ...c, name: result.courseName, url } : c))
      );
    }
  };

  const saveCurrentCourse = () => {
    if (!courseId || isSaved) return;
    persistSavedCourses([
      ...savedCourses,
      { id: courseId, url: courseUrl.trim(), name: courseName || `Course ${courseId}` },
    ]);
  };

  const openSavedCourse = (course: SavedCourse) => {
    setCourseUrl(course.url);
    setLoadState({ status: "idle", message: "" });
    void loadAnnouncements(course.url);
  };

  const removeSavedCourse = (id: string) => {
    persistSavedCourses(savedCourses.filter((c) => c.id !== id));
  };

  const handleDraft = async () => {
    if (!draftPrompt.trim()) return;
    setDrafting(true);
    setPostNote(null);
    const result = await draftAnnouncementAction(draftPrompt.trim(), provider);
    setDrafting(false);
    if ("error" in result) {
      setPostNote({ kind: "error", text: result.error });
      return;
    }
    setTitle(result.title);
    setMessage(result.message);
  };

  const handlePost = async () => {
    if (!courseId || !title.trim() || !message.trim()) return;
    setPosting(true);
    setPostNote(null);
    const result = await createAnnouncementAction(courseUrl.trim(), title.trim(), message.trim());
    setPosting(false);
    if ("error" in result) {
      setPostNote({ kind: "error", text: result.error });
      return;
    }
    setPostNote({ kind: "success", text: "Announcement posted to Canvas." });
    setTitle("");
    setMessage("");
    setDraftPrompt("");
    setAnnouncements((prev) => [result.announcement, ...prev]);
  };

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="canvas-course-url">Canvas course URL</label>
        <input
          id="canvas-course-url"
          type="url"
          className={styles.textInput}
          placeholder="Paste a course link (.../courses/123)"
          value={courseUrl}
          onChange={(e) => {
            setCourseUrl(e.target.value);
            setLoadState({ status: "idle", message: "" });
          }}
        />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className={styles.downloadButton}
            onClick={() => void loadAnnouncements(courseUrl.trim())}
            disabled={loadState.status === "loading" || !courseId}
          >
            {loadState.status === "loading" ? "Loading…" : "Load announcements"}
          </button>
          <button
            type="button"
            className={styles.downloadButton}
            onClick={saveCurrentCourse}
            disabled={!courseId || isSaved}
          >
            {isSaved ? "Saved" : "Save course"}
          </button>
        </div>
        <p className={styles.fieldHint}>
          {courseId
            ? `Detected course ${courseId}. Load its recent announcements, save it for quick access, or post a new one below.`
            : courseUrl.trim()
              ? "Unrecognized URL. Expecting a link like .../courses/123."
              : "Paste any link from the course (a course home, announcements, or assignment URL works)."}
        </p>
        {loadState.status === "error" && <p className={styles.error}>{loadState.message}</p>}
      </div>

      {savedCourses.length > 0 && (
        <div className={styles.field}>
          <label>Saved courses</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {savedCourses.map((c) => (
              <span
                key={c.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  borderRadius: 999,
                  border: "1px solid var(--field-border)",
                  background: "var(--field-background)",
                  paddingLeft: 4,
                }}
              >
                <button
                  type="button"
                  onClick={() => openSavedCourse(c)}
                  style={{
                    font: "inherit",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    background: "transparent",
                    border: "none",
                    borderRadius: 999,
                    padding: "5px 8px",
                    cursor: "pointer",
                  }}
                >
                  {c.name}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${c.name}`}
                  title="Remove"
                  onClick={() => removeSavedCourse(c.id)}
                  style={{
                    font: "inherit",
                    fontSize: "1rem",
                    lineHeight: 1,
                    color: "var(--text-secondary)",
                    background: "transparent",
                    border: "none",
                    borderRadius: 999,
                    padding: "4px 9px 4px 2px",
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="canvas-ann-draft">Draft with AI (optional)</label>
        <input
          id="canvas-ann-draft"
          type="text"
          className={styles.textInput}
          placeholder="e.g. Remind students project 2 is due Friday and office hours moved to 3pm"
          value={draftPrompt}
          onChange={(e) => setDraftPrompt(e.target.value)}
        />
        <button
          type="button"
          className={styles.downloadButton}
          onClick={handleDraft}
          disabled={drafting || !draftPrompt.trim()}
          style={{ alignSelf: "flex-start" }}
        >
          {drafting ? "Drafting…" : "Draft with AI"}
        </button>
        <p className={styles.fieldHint}>
          Generates a title and message you can edit below. Nothing is posted until you click Post.
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="canvas-ann-title">Title</label>
        <input
          id="canvas-ann-title"
          type="text"
          className={styles.textInput}
          placeholder="Announcement title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="canvas-ann-message">Message</label>
        <textarea
          id="canvas-ann-message"
          placeholder="Write the announcement students will see."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      <button
        type="button"
        className={styles.submitButton}
        onClick={handlePost}
        disabled={posting || !courseId || !title.trim() || !message.trim()}
      >
        {posting ? "Posting…" : "Post announcement"}
      </button>

      {postNote && (
        <p className={postNote.kind === "error" ? styles.error : styles.fieldHint}>{postNote.text}</p>
      )}

      {announcements.length > 0 && (
        <div className={styles.results}>
          <div className={styles.resultsHeader}>
            <h2>{courseName ? `Recent announcements — ${courseName}` : "Recent announcements"}</h2>
          </div>
          {announcements.map((a) => (
            <div key={a.id} className={styles.syllabusSectionCard}>
              <div className={styles.syllabusSectionTopRow}>
                <h3 className={styles.lessonSlideTitle}>{a.title}</h3>
                {a.htmlUrl && (
                  <a
                    className={styles.downloadButton}
                    href={a.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open in Canvas
                  </a>
                )}
              </div>
              <p className={styles.fieldHint}>
                {[a.author, formatWhen(a.postedAt)].filter(Boolean).join(" · ")}
              </p>
              {a.message && <p className={styles.syllabusSectionContent}>{a.message}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inbox ─────────────────────────────────────────────────────────────────-

function InboxPanel() {
  const [provider] = useLlmProvider();

  const [conversations, setConversations] = useState<CanvasConversationSummary[]>([]);
  const [inboxState, setInboxState] = useState<{ status: "loading" | "idle" | "error"; message: string }>({
    status: "loading",
    message: "",
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [conversation, setConversation] = useState<CanvasConversationDetail | null>(null);
  const [threadState, setThreadState] = useState<{ status: "idle" | "loading" | "error"; message: string }>({
    status: "idle",
    message: "",
  });

  const [replyBody, setReplyBody] = useState("");
  const [replyInstr, setReplyInstr] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyNote, setReplyNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const loadInbox = useCallback(async () => {
    setInboxState({ status: "loading", message: "" });
    const result = await listConversationsAction();
    if ("error" in result) {
      setInboxState({ status: "error", message: result.error });
      return;
    }
    setConversations(result.conversations);
    setInboxState({ status: "idle", message: "" });
  }, []);

  // Load the inbox on mount. The initial state is already "loading", and the
  // fetch is started without a synchronous setState so this stays a pure
  // external-system sync (no cascading renders).
  useEffect(() => {
    let active = true;
    (async () => {
      const result = await listConversationsAction();
      if (!active) return;
      if ("error" in result) {
        setInboxState({ status: "error", message: result.error });
      } else {
        setConversations(result.conversations);
        setInboxState({ status: "idle", message: "" });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const openConversation = async (id: number) => {
    setSelectedId(id);
    setConversation(null);
    setReplyBody("");
    setReplyInstr("");
    setReplyNote(null);
    setThreadState({ status: "loading", message: "" });
    const result = await getConversationAction(id);
    if ("error" in result) {
      setThreadState({ status: "error", message: result.error });
      return;
    }
    setConversation(result.conversation);
    setThreadState({ status: "idle", message: "" });
  };

  const threadText = conversation
    ? conversation.messages.map((m) => `${m.author}: ${m.body}`).join("\n\n")
    : "";

  const handleDraftReply = async () => {
    if (!threadText) return;
    setDrafting(true);
    setReplyNote(null);
    const result = await draftMessageReplyAction(threadText, replyInstr.trim(), provider);
    setDrafting(false);
    if ("error" in result) {
      setReplyNote({ kind: "error", text: result.error });
      return;
    }
    setReplyBody(result.body);
  };

  const handleSendReply = async () => {
    if (selectedId === null || !replyBody.trim()) return;
    setSending(true);
    setReplyNote(null);
    const result = await replyToConversationAction(selectedId, replyBody.trim());
    setSending(false);
    if ("error" in result) {
      setReplyNote({ kind: "error", text: result.error });
      return;
    }
    setConversation(result.conversation);
    setReplyBody("");
    setReplyInstr("");
    setReplyNote({ kind: "success", text: "Reply sent." });
    // Reflect the new last message in the list.
    void loadInbox();
  };

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* Conversation list */}
      <div style={{ flex: "1 1 280px", minWidth: 260, maxWidth: 440, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className={styles.resultsHeader} style={{ paddingTop: 0 }}>
          <h2>Inbox</h2>
          <button
            type="button"
            className={styles.downloadButton}
            onClick={() => void loadInbox()}
            disabled={inboxState.status === "loading"}
          >
            {inboxState.status === "loading" ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {inboxState.status === "error" && <p className={styles.error}>{inboxState.message}</p>}
        {inboxState.status === "idle" && conversations.length === 0 && (
          <p className={styles.emptyState}>No conversations in the inbox.</p>
        )}

        {conversations.map((c) => {
          const selected = c.id === selectedId;
          const unread = c.workflowState === "unread";
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => void openConversation(c.id)}
              className={styles.syllabusSectionCard}
              style={{
                textAlign: "left",
                cursor: "pointer",
                gap: 4,
                borderColor: selected ? "var(--accent)" : undefined,
                background: selected
                  ? "color-mix(in srgb, var(--field-background) 86%, var(--accent) 14%)"
                  : undefined,
              }}
            >
              <span
                className={styles.deadlineItemTitle}
                style={{ fontWeight: unread ? 800 : 600 }}
              >
                {unread ? "• " : ""}
                {c.subject}
              </span>
              {c.participants.length > 0 && (
                <span className={styles.fieldHint}>{c.participants.join(", ")}</span>
              )}
              {c.lastMessage && (
                <span
                  className={styles.fieldHint}
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {c.lastMessage}
                </span>
              )}
              <span className={styles.fieldHint}>{formatWhen(c.lastMessageAt)}</span>
            </button>
          );
        })}
      </div>

      {/* Thread + reply */}
      <div style={{ flex: "2 1 360px", minWidth: 280, display: "flex", flexDirection: "column", gap: 14 }}>
        {selectedId === null ? (
          <p className={styles.emptyState}>Select a conversation to read and reply.</p>
        ) : threadState.status === "loading" ? (
          <div className={styles.loadingState}>
            <span className={styles.spinner} aria-hidden="true" />
            <div>
              <p className={styles.loadingTitle}>Loading conversation…</p>
            </div>
          </div>
        ) : threadState.status === "error" ? (
          <p className={styles.error}>{threadState.message}</p>
        ) : conversation ? (
          <>
            <h2 className={styles.lessonSlideTitle}>{conversation.subject}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {conversation.messages.map((m) => (
                <div key={m.id} className={styles.syllabusSectionCard} style={{ gap: 6 }}>
                  <p className={styles.fieldHint}>
                    {[m.author, formatWhen(m.createdAt)].filter(Boolean).join(" · ")}
                  </p>
                  <p className={styles.syllabusSectionContent}>{m.body}</p>
                </div>
              ))}
            </div>

            <div className={styles.field}>
              <label htmlFor="canvas-reply-draft">Draft reply with AI (optional)</label>
              <input
                id="canvas-reply-draft"
                type="text"
                className={styles.textInput}
                placeholder="Optional steer, e.g. be encouraging and point them to office hours"
                value={replyInstr}
                onChange={(e) => setReplyInstr(e.target.value)}
              />
              <button
                type="button"
                className={styles.downloadButton}
                onClick={handleDraftReply}
                disabled={drafting}
                style={{ alignSelf: "flex-start" }}
              >
                {drafting ? "Drafting…" : "Draft reply with AI"}
              </button>
            </div>

            <div className={styles.field}>
              <label htmlFor="canvas-reply-body">Your reply</label>
              <textarea
                id="canvas-reply-body"
                placeholder="Write your reply."
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
              />
            </div>

            <button
              type="button"
              className={styles.submitButton}
              onClick={handleSendReply}
              disabled={sending || !replyBody.trim()}
            >
              {sending ? "Sending…" : "Send reply"}
            </button>

            {replyNote && (
              <p className={replyNote.kind === "error" ? styles.error : styles.fieldHint}>
                {replyNote.text}
              </p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── Tab shell ───────────────────────────────────────────────────────────────

type CanvasView = "announcements" | "inbox";

export default function CanvasTab() {
  // Remember which sub-tab was last open across reloads.
  const [view, setViewState] = useState<CanvasView>(() =>
    typeof window !== "undefined" && localStorage.getItem(VIEW_KEY) === "inbox"
      ? "inbox"
      : "announcements"
  );
  const setView = (next: CanvasView) => {
    setViewState(next);
    if (typeof window !== "undefined") localStorage.setItem(VIEW_KEY, next);
  };

  return (
    <div className={styles.card}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Communications</span>
        <h1>Announcements & Inbox</h1>
        <p>
          Post course announcements and reply to Canvas messages without leaving the teaching
          assistant. Drafting is optional — nothing is sent to Canvas until you post.
        </p>
      </header>

      <div className={styles.lessonInnerTabs}>
        <button
          type="button"
          className={`${styles.lessonInnerTab} ${view === "announcements" ? styles.lessonInnerTabActive : ""}`}
          onClick={() => setView("announcements")}
        >
          Announcements
        </button>
        <button
          type="button"
          className={`${styles.lessonInnerTab} ${view === "inbox" ? styles.lessonInnerTabActive : ""}`}
          onClick={() => setView("inbox")}
        >
          Inbox
        </button>
      </div>

      {/* Both panels stay mounted so the inbox keeps its loaded state when
          switching sub-tabs; only the active one is shown. */}
      <div style={{ display: view === "announcements" ? "block" : "none" }}>
        <AnnouncementsPanel />
      </div>
      <div style={{ display: view === "inbox" ? "block" : "none" }}>
        <InboxPanel />
      </div>
    </div>
  );
}
