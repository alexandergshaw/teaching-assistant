"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import {
  sendBulkCourseMessageAction,
  previewBulkCourseMessageAction,
} from "@/app/actions/bulk-course-message";
import { listCourseHubAction } from "@/app/actions/course-hub-core";
import { draftAnnouncementAction } from "@/app/actions/messaging";
import { useLlmProvider } from "@/lib/llm-provider";
import type { Course } from "@/lib/supabase/courses.types";
import styles from "../../page.module.css";
import {
  EMPTY_FIELDS,
  bannerText,
  confirmFromPreview,
  createSendLock,
  eligibleLiveCourses,
  outcomeNotice,
  reduceCompose,
  resolveSelectedCourse,
  stillMatchesConfirmed,
  type ComposeAction,
  type ConfirmedMessage,
  type NoticeTone,
} from "./bulk-message-model";
import {
  browserLocalStorage,
  readStoredCourse,
  readStoredDrafts,
  writeStoredCourse,
  writeStoredDraft,
  type DraftMap,
} from "./bulk-message-storage";

type Notice = { tone: NoticeTone; text: string };

function noticeStyle(tone: NoticeTone): React.CSSProperties {
  if (tone === "success") return { color: "var(--success-ink)" };
  if (tone === "warning") return { color: "var(--warning-ink)" };
  return {};
}

// A29 W3: compose one Canvas Inbox message addressed to a whole course. The
// only route to a send is a server-issued ready preview (confirmFromPreview)
// followed by an explicit confirm. Zero props: the host only mounts it.
export default function BulkCourseMessagePanel() {
  const [provider] = useLlmProvider();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [storedCourseId, setStoredCourseId] = useState<string>(() => readStoredCourse(browserLocalStorage));
  const [drafts, setDrafts] = useState<DraftMap>(() => readStoredDrafts(browserLocalStorage));
  const [confirmed, setConfirmed] = useState<ConfirmedMessage | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  // Synchronous lock: claimed before any await, released in a finally. A state
  // flag alone has a stale window between two fast clicks.
  const sendLock = useRef(createSendLock());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listCourseHubAction();
      if (cancelled) return;
      if ("error" in result) setLoadError(result.error);
      else setCourses(result.courses);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const eligible = useMemo(() => (courses ? eligibleLiveCourses(courses) : []), [courses]);
  const selectedId = resolveSelectedCourse(storedCourseId || null, eligible);
  const fields = (selectedId ? drafts[selectedId] : undefined) ?? EMPTY_FIELDS;
  const armed = stillMatchesConfirmed(confirmed, selectedId, fields.subject, fields.body);
  const busy = reviewing || drafting || sending;

  useEffect(() => {
    if (!selectedId) return;
    writeStoredCourse(browserLocalStorage, selectedId);
    writeStoredDraft(browserLocalStorage, selectedId, fields);
  }, [selectedId, fields]);

  function compose(courseId: string, action: ComposeAction) {
    setDrafts((prev) => ({ ...prev, [courseId]: reduceCompose(prev[courseId] ?? EMPTY_FIELDS, action) }));
  }

  async function handleDraft(courseId: string) {
    setDrafting(true);
    setNotice(null);
    try {
      const result = await draftAnnouncementAction(fields.prompt, provider);
      compose(courseId, { kind: "drafted", result });
      if ("error" in result) setNotice({ tone: "error", text: result.error });
    } catch {
      setNotice({ tone: "error", text: "Could not draft a message." });
    } finally {
      setDrafting(false);
    }
  }

  async function handleReview(courseId: string) {
    setReviewing(true);
    setNotice(null);
    setConfirmed(null);
    try {
      const preview = await previewBulkCourseMessageAction(courseId);
      const next = confirmFromPreview(preview, courseId, fields.subject, fields.body);
      if (next) setConfirmed(next);
      else if (preview.status === "refused") setNotice({ tone: "error", text: preview.reason });
    } catch {
      setNotice({ tone: "error", text: "Could not check the class size. Nothing was posted." });
    } finally {
      setReviewing(false);
    }
  }

  async function runSend(message: ConfirmedMessage) {
    if (!sendLock.current.tryClaim()) return;
    setSending(true);
    try {
      const outcome = await sendBulkCourseMessageAction(message.courseId, message.subject, message.body);
      setNotice(outcomeNotice(outcome, message.courseName));
      if (outcome.status === "accepted") compose(message.courseId, { kind: "cleared-after-accept" });
      setConfirmed(null);
    } catch {
      setNotice({
        tone: "warning",
        text: "Canvas did not confirm the message. It may or may not have gone out. Check your Canvas Inbox before trying again, so it is not posted twice.",
      });
      setConfirmed(null);
    } finally {
      sendLock.current.release();
      setSending(false);
    }
  }

  const canReview = Boolean(selectedId && fields.subject.trim() && fields.body.trim());

  return (
    <section className={styles.draftSection} aria-labelledby="bulk-course-message-title" style={{ marginTop: "var(--space-4)" }}>
      <h2 id="bulk-course-message-title">Message your class</h2>
      <p className={styles.fieldHint}>
        Compose one Canvas Inbox message addressed to a whole course. It is not an announcement: nothing is posted on the course page.
      </p>

      {courses === null && !loadError ? <p className={styles.fieldHint}>Loading your courses...</p> : null}
      {loadError ? <p className={styles.error}>Could not load your courses. {loadError}</p> : null}
      {courses !== null && eligible.length === 0 ? (
        <p className={styles.emptyState}>
          No course is connected to Canvas yet. Link a course to Canvas and choose its institution to message its students.
        </p>
      ) : null}

      {selectedId || eligible.length > 0 ? (
        <>
          <div className={styles.adaptRow}>
            <TextField
              select
              size="small"
              label="Course"
              value={selectedId ?? ""}
              disabled={busy}
              onChange={(e) => setStoredCourseId(e.target.value)}
              sx={{ minWidth: 240 }}
            >
              {eligible.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          </div>

          {selectedId ? (
            <>
              <div className={styles.adaptRow}>
                <TextField
                  size="small"
                  label="What should the message say?"
                  value={fields.prompt}
                  disabled={busy}
                  onChange={(e) => compose(selectedId, { kind: "typed", field: "prompt", value: e.target.value })}
                  sx={{ flex: 1 }}
                />
                <Button
                  type="button"
                  size="small"
                  variant="outlined"
                  disabled={busy || !fields.prompt.trim()}
                  onClick={() => void handleDraft(selectedId)}
                >
                  {drafting ? "Drafting..." : "Draft"}
                </Button>
              </div>
              <p className={styles.fieldHint}>Draft with AI (optional)</p>

              <div className={styles.adaptRow}>
                <TextField
                  size="small"
                  label="Subject (what students see in their Canvas Inbox)"
                  value={fields.subject}
                  disabled={busy}
                  onChange={(e) => compose(selectedId, { kind: "typed", field: "subject", value: e.target.value })}
                  sx={{ width: "100%" }}
                />
              </div>
              <div className={styles.adaptRow}>
                <TextField
                  multiline
                  minRows={4}
                  label="Message"
                  value={fields.body}
                  disabled={busy}
                  onChange={(e) => compose(selectedId, { kind: "typed", field: "body", value: e.target.value })}
                  sx={{ width: "100%" }}
                />
              </div>
              <p className={styles.fieldHint}>Plain text only. Canvas Inbox does not render formatting.</p>

              <div className={styles.ghActions}>
                <Button
                  type="button"
                  size="small"
                  variant="contained"
                  disabled={busy || !canReview}
                  onClick={() => void handleReview(selectedId)}
                >
                  {reviewing ? "Checking class size..." : "Review message"}
                </Button>
              </div>
              {!canReview ? (
                <p className={styles.fieldHint}>Choose a course and add a subject and a message to review.</p>
              ) : null}

              {armed ? (
                <div
                  className={styles.kbWarnBanner}
                  role="group"
                  aria-label="Confirm the message to the whole class"
                  style={{ marginTop: "var(--space-3)" }}
                >
                  <span style={{ whiteSpace: "pre-wrap" }}>{bannerText(confirmed)}</span>
                  <div className={styles.kbWarnActions}>
                    <Button
                      type="button"
                      size="small"
                      variant="contained"
                      disabled={sending}
                      onClick={() => void runSend(confirmed)}
                    >
                      {sending ? "Sending..." : "Confirm send"}
                    </Button>
                    <Button type="button" size="small" disabled={sending} onClick={() => setConfirmed(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      <div role="status">
        {notice ? (
          <p className={notice.tone === "error" ? styles.error : undefined} style={noticeStyle(notice.tone)}>
            {notice.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}
