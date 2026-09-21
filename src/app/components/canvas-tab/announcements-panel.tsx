"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import {
  listAnnouncementsAction,
  createAnnouncementAction,
  listCourseHubAction,
} from "../../actions";
import {
  getMostRecentAnnouncementExemplarAction,
  listAnnouncementExemplarsAction,
} from "@/app/actions/walkthrough-announcement";
import { draftPromptAnnouncementAction } from "@/app/actions/prompt-announcement-draft";
import { postPromptAnnouncementAction } from "@/app/actions/prompt-announcement-post";
import CoursePicker from "../CoursePicker";
import type { AnnouncementExemplarSummary } from "@/app/components/walkthrough-announcement/AnnouncementCourseFieldset";
import {
  EXEMPLAR_FETCH_TIMEOUT_MS,
  choiceId,
  defaultOptionLabel,
  savedFormatsStatusText,
  type LiveDefaults,
  type ResolvedTemplate,
  type SavedFormatsState,
  type TemplateChoice,
} from "@/app/components/walkthrough-announcement/announcement-draft-slots";
import { raceWithTimeout } from "@/lib/bounded-race";
import {
  optionsForChoice,
  posterFor,
  resolveHubCourseIdForCanvasUrl,
  browserLocalStorage,
  readStoredPrompt,
  writeStoredPrompt,
} from "./promptAnnouncementTemplate";
import { buildPromptDraftRequest, applyPromptDraftResult } from "./promptAnnouncementDraft";
import type { PromptDraftUiState } from "@/lib/prompt-announcement-types";
import type { CanvasAnnouncement } from "@/lib/canvas";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { useLlmProvider } from "@/lib/llm-provider";
import { useInstitutionSelection } from "@/lib/institutions";
import { PROMPT_ANNOUNCEMENT_MAX_CHARS } from "@/lib/prompt-announcement-prompt";
import styles from "../../page.module.css";
import { COURSE_URL_KEY, formatWhen, toDatetimeLocalValue } from "./utils";

function AnnouncementsPanel() {
  const [provider] = useLlmProvider();
  const { active: activeInstitution } = useInstitutionSelection();

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

  // AC-14: persisted across reloads under STORAGE_KEY_PROMPT, via the pure
  // leaf's read/write - not inlined here, so the storage logic stays
  // testable (docs/a21-instrument-notes.md section 8.3).
  const [draftPrompt, setDraftPromptState] = useState<string>(() => readStoredPrompt(browserLocalStorage));
  const setDraftPrompt = useCallback((next: string) => {
    setDraftPromptState(next.slice(0, PROMPT_ANNOUNCEMENT_MAX_CHARS));
  }, []);
  useEffect(() => {
    writeStoredPrompt(browserLocalStorage, draftPrompt);
  }, [draftPrompt]);

  const [drafting, setDrafting] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [lastResolved, setLastResolved] = useState<ResolvedTemplate | null>(null);
  const [receipt, setReceipt] = useState("");
  // Optional scheduled visibility (datetime-local string); blank = post now.
  const [visibleAt, setVisibleAt] = useState("");
  const [posting, setPosting] = useState(false);
  const [postNote, setPostNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [lastPosted, setLastPosted] = useState<CanvasAnnouncement | null>(null);

  // AC-12: the identity join between this panel's Canvas course URL and the
  // exemplar library's app Course row id. Fetched once and re-derived per
  // course/institution change - refuses to guess on ambiguity.
  const [hubCourses, setHubCourses] = useState<
    readonly { id: string; canvasUrl: string | null; institution: string | null }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listCourseHubAction();
      if (cancelled || "error" in result) return;
      setHubCourses(result.courses);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const hubCourseId = resolveHubCourseIdForCanvasUrl(hubCourses, courseUrl, activeInstitution);

  // Saved-exemplar template picker: choice + live defaults, matching the
  // shared vocabulary this panel reuses (announcement-draft-slots.ts). This
  // surface has no paste box, so `hasPastedText`/`pastedOutline` stay false/
  // null - "pasted" never appears as a picker option here.
  const [choice, setChoice] = useState<TemplateChoice>({ kind: "default" });
  const [mostRecentExemplar, setMostRecentExemplar] = useState<AnnouncementExemplarSummary | null>(null);
  const [savedExemplars, setSavedExemplars] = useState<AnnouncementExemplarSummary[]>([]);
  const [savedFormatsState, setSavedFormatsState] = useState<SavedFormatsState>("loaded");
  const exemplarRunId = useRef(0);

  useEffect(() => {
    const runId = ++exemplarRunId.current;
    const stale = () => exemplarRunId.current !== runId;
    void (async () => {
      await Promise.resolve();
      if (stale()) return;
      setMostRecentExemplar(null);
      setSavedExemplars([]);
      setSavedFormatsState("loaded");
      setChoice({ kind: "default" });
      if (!hubCourseId) return;
      setSavedFormatsState("loading");
      const outcome = await raceWithTimeout(
        Promise.all([
          getMostRecentAnnouncementExemplarAction(hubCourseId),
          listAnnouncementExemplarsAction(hubCourseId),
        ]),
        EXEMPLAR_FETCH_TIMEOUT_MS
      );
      if (stale()) return;
      if (outcome.kind === "timedout") {
        setSavedFormatsState("timedout");
        return;
      }
      if (outcome.kind === "failed") {
        setSavedFormatsState("failed");
        return;
      }
      const [mostRecentResult, listResult] = outcome.value;
      if (!("error" in mostRecentResult)) setMostRecentExemplar(mostRecentResult.exemplar);
      if ("error" in listResult) {
        setSavedFormatsState("failed");
      } else {
        setSavedExemplars(listResult.exemplars);
        setSavedFormatsState("loaded");
      }
    })();
    return () => {
      exemplarRunId.current += 1;
    };
  }, [hubCourseId]);

  // Clear loaded announcements + course list when the institution changes — they
  // belonged to the previous school.
  const [prevInstitution, setPrevInstitution] = useState(activeInstitution);
  if (activeInstitution !== prevInstitution) {
    setPrevInstitution(activeInstitution);
    setAnnouncements([]);
    setCourseName("");
    setCourseUrl("");
    setLoadState({ status: "idle", message: "" });
    setPostNote(null);
    setLastPosted(null);
  }

  const courseId = parseCanvasCourseId(courseUrl);

  const loadAnnouncements = async (url: string) => {
    const id = parseCanvasCourseId(url);
    if (!id) return;
    localStorage.setItem(COURSE_URL_KEY, url);
    setLoadState({ status: "loading", message: "" });
    const result = await listAnnouncementsAction(url, activeInstitution || undefined);
    if ("error" in result) {
      setAnnouncements([]);
      setCourseName("");
      setLoadState({ status: "error", message: result.error });
      return;
    }
    setCourseName(result.courseName);
    setAnnouncements(result.announcements);
    setLoadState({ status: "idle", message: "" });
  };

  // Pick a course from the shared picker: remember it and load its announcements.
  const handleSelectCourse = (url: string) => {
    setCourseUrl(url);
    setLoadState({ status: "idle", message: "" });
    void loadAnnouncements(url);
  };

  const liveDefaults: LiveDefaults = {
    pastedOutline: null,
    mostRecent: mostRecentExemplar
      ? { id: mostRecentExemplar.id, label: mostRecentExemplar.label || "Most recent", outline: mostRecentExemplar.outline }
      : null,
  };

  const handleDraft = async () => {
    if (!draftPrompt.trim()) return;
    setDrafting(true);
    setPostNote(null);
    const uiState: PromptDraftUiState = {
      promptText: draftPrompt,
      courseLabel: courseName || courseUrl,
      choice,
      live: liveDefaults,
      provider,
      title,
      message,
      lastResolved,
      receipt,
      error: null,
    };
    const request = buildPromptDraftRequest(uiState);
    const result = await draftPromptAnnouncementAction(request);
    const next = applyPromptDraftResult(uiState, result);
    setDrafting(false);
    if (!result.ok) {
      setPostNote({ kind: "error", text: next.error ?? "Could not draft the announcement." });
      return;
    }
    setTitle(next.title);
    setMessage(next.message);
    setLastResolved(next.lastResolved);
    setReceipt(next.receipt);
  };

  const handlePost = async () => {
    if (!courseId || !title.trim() || !message.trim()) return;

    // A future visibility time schedules the announcement; a blank or past time
    // posts immediately.
    let delayedPostAt: string | undefined;
    let scheduledLabel = "";
    if (visibleAt) {
      const when = new Date(visibleAt);
      if (Number.isNaN(when.getTime())) {
        setPostNote({ kind: "error", text: "Enter a valid date and time for when students can see this." });
        return;
      }
      if (when.getTime() > Date.now()) {
        delayedPostAt = when.toISOString();
        scheduledLabel = when.toLocaleString();
      }
    }

    setPosting(true);
    setPostNote(null);
    // AC-11/AC-20: the poster is chosen by provenance, so today's behaviour
    // (plain text) is byte-unchanged for a draft with no template applied.
    const result =
      posterFor(lastResolved) === "markdown"
        ? await postPromptAnnouncementAction(
            courseUrl.trim(),
            title.trim(),
            message.trim(),
            activeInstitution || undefined,
            delayedPostAt
          )
        : await createAnnouncementAction(
            courseUrl.trim(),
            title.trim(),
            message.trim(),
            activeInstitution || undefined,
            delayedPostAt
          );
    setPosting(false);
    if ("error" in result) {
      setPostNote({ kind: "error", text: result.error });
      return;
    }
    setPostNote({
      kind: "success",
      text: scheduledLabel
        ? `Announcement scheduled. Students will see it ${scheduledLabel}.`
        : "Announcement posted to Canvas.",
    });
    setLastPosted(result.announcement);
    setTitle("");
    setMessage("");
    setVisibleAt("");
    setDraftPrompt("");
    setLastResolved(null);
    setReceipt("");
    setAnnouncements((prev) => [result.announcement, ...prev]);
  };

  // Any chosen visibility time means "schedule" for the button label; the input's
  // min blocks past times, and handlePost re-checks against the actual clock.
  const willSchedule = visibleAt.trim().length > 0;

  const templateOptionSource = {
    hasPastedText: false,
    mostRecent: mostRecentExemplar
      ? { id: mostRecentExemplar.id, label: mostRecentExemplar.label || "Most recent", outline: mostRecentExemplar.outline }
      : null,
    saved: savedExemplars.map((e) => ({ id: e.id, label: e.label || "Untitled format", outline: e.outline })),
    savedState: savedFormatsState,
  };
  const templateOptions = optionsForChoice(choice, templateOptionSource);
  const statusText = savedFormatsStatusText(savedFormatsState, savedExemplars.length);

  return (
    <div className={styles.form}>
      <CoursePicker
        activeInstitution={activeInstitution}
        courseUrl={courseUrl}
        onSelect={handleSelectCourse}
        loadError={loadState.status === "error" ? loadState.message : null}
        courseName={courseName}
      />
      {loadState.status === "loading" && (
        <p className={styles.fieldHint} role="status" aria-live="polite">Loading announcements…</p>
      )}

      {courseUrl && (
        <div className={styles.results}>
          <div className={styles.resultsHeader}>
            <h2>{courseName ? `Announcements - ${courseName}` : "Announcements"}</h2>
            <Button
              variant="outlined"
              size="small"
              onClick={() => void loadAnnouncements(courseUrl)}
              disabled={loadState.status === "loading"}
            >
              {loadState.status === "loading" ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
          {announcements.length === 0 ? (
            loadState.status === "idle" ? (
              <p className={styles.fieldHint}>No announcements in this course yet.</p>
            ) : null
          ) : (
            announcements.map((a) => (
              <div key={a.id} className={styles.syllabusSectionCard}>
                <div className={styles.syllabusSectionTopRow}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: 1 }}>
                    {!a.postedAt && a.delayedPostAt && (
                      <span className={styles.navBadge}>Scheduled</span>
                    )}
                    <h3 className={styles.lessonSlideTitle}>{a.title}</h3>
                  </div>
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
                  {[
                    a.author,
                    a.postedAt
                      ? formatWhen(a.postedAt)
                      : a.delayedPostAt
                        ? `Scheduled for ${formatWhen(a.delayedPostAt)}`
                        : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {a.message && <p className={styles.syllabusSectionContent}>{a.message}</p>}
              </div>
            ))
          )}
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="canvas-ann-draft">Draft with AI (optional)</label>
        <TextField
          id="canvas-ann-draft"
          multiline
          minRows={3}
          fullWidth
          placeholder="e.g. Remind students project 2 is due Friday and office hours moved to 3pm"
          value={draftPrompt}
          onChange={(e) => setDraftPrompt(e.target.value)}
        />
        <label htmlFor="canvas-ann-template">Match a format (optional)</label>
        <Select
          id="canvas-ann-template"
          size="small"
          value={choiceId(choice)}
          onChange={(e) => {
            const next = templateOptions.find((o) => o.id === e.target.value);
            if (next) setChoice(next.choice);
          }}
          sx={{ alignSelf: "flex-start", minWidth: "220px" }}
        >
          {templateOptions.map((o) => (
            <MenuItem key={o.id} value={o.id}>
              {o.label}
              {o.unavailable ? " (no longer available)" : ""}
            </MenuItem>
          ))}
        </Select>
        {choice.kind === "default" && (
          <p className={styles.fieldHint}>{defaultOptionLabel(templateOptionSource)}</p>
        )}
        {statusText && <p className={styles.fieldHint}>{statusText}</p>}
        <Button
          variant="outlined"
          size="small"
          onClick={handleDraft}
          disabled={drafting || !draftPrompt.trim()}
          sx={{ alignSelf: "flex-start", marginTop: "var(--space-2)" }}
        >
          {drafting ? "Drafting…" : "Draft with AI"}
        </Button>
        <p className={styles.fieldHint}>
          Generates a title and message you can edit below. Nothing is posted until you click Post.
          {receipt && ` ${receipt}.`}
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="canvas-ann-title">Title</label>
        <TextField
          id="canvas-ann-title"
          type="text"
          size="small"
          fullWidth
          placeholder="Announcement title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            // Inlined (not the shared submitOnEnter) because handlePost reads
            // Date.now(); routing it through a render-time helper call trips the
            // react-hooks/purity lint. An inline event handler reads clean.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handlePost();
            }
          }}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="canvas-ann-message">Message</label>
        <TextField
          id="canvas-ann-message"
          multiline
          minRows={4}
          fullWidth
          placeholder="Write the announcement students will see."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="canvas-ann-visible">Visible to students (optional)</label>
        <TextField
          id="canvas-ann-visible"
          type="datetime-local"
          size="small"
          fullWidth
          value={visibleAt}
          onChange={(e) => setVisibleAt(e.target.value)}
          slotProps={{
            htmlInput: {
              min: toDatetimeLocalValue(new Date()),
            },
            inputLabel: { shrink: true },
          }}
        />
        <p className={styles.fieldHint}>
          Leave blank to post immediately. Pick a future date and time to schedule when students can see it.
          {visibleAt && (
            <>
              {" "}
              <Button size="small" onClick={() => setVisibleAt("")}>
                Clear
              </Button>
            </>
          )}
        </p>
      </div>

      {(title.trim() || message.trim()) && (
        <div className={styles.field}>
          <label>Preview</label>
          <div className={styles.announcementPreview}>
            {title.trim() && <h3 className={styles.lessonSlideTitle}>{title}</h3>}
            <p className={styles.syllabusSectionContent}>{message}</p>
          </div>
        </div>
      )}

      <Button
        variant="contained"
        size="small"
        onClick={handlePost}
        disabled={posting || !courseId || !title.trim() || !message.trim()}
      >
        {posting
          ? willSchedule
            ? "Scheduling…"
            : "Posting…"
          : willSchedule
            ? "Schedule announcement"
            : "Post announcement"}
      </Button>

      {postNote && (
        <p className={postNote.kind === "error" ? styles.error : styles.fieldHint}>
          {postNote.text}
          {postNote.kind === "success" && lastPosted?.htmlUrl && (
            <>
              {" "}
              <a href={lastPosted.htmlUrl} target="_blank" rel="noopener noreferrer">
                View in Canvas
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}

export default AnnouncementsPanel;
