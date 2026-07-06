"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import {
  listAnnouncementsAction,
  createAnnouncementAction,
  listConversationsAction,
  getConversationAction,
  replyToConversationAction,
  draftAnnouncementAction,
  draftMessageReplyAction,
  setConversationStateAction,
  getAvailableSlotsAction,
  draftMeetingReplyAction,
  createMeetingAction,
  detectMeetingRequestAction,
} from "../actions";
import WeekCalendar, { type CalendarEventBlock } from "./WeekCalendar";
import CoursePicker from "./CoursePicker";
import type {
  CanvasAnnouncement,
  CanvasConversationSummary,
  CanvasConversationDetail,
} from "@/lib/canvas";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { useLlmProvider } from "@/lib/llm-provider";
import { useInstitutionSelection } from "@/lib/institutions";
import { useSupabase } from "@/context/SupabaseProvider";
import { useInstitutionCounts } from "./InstitutionCounts";
import { formatRelative } from "../utils/time";
import styles from "../page.module.css";

const COURSE_URL_KEY = "ta-canvas-course-url";

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

// Format a Date as the local wall-clock value a datetime-local input expects
// ("YYYY-MM-DDTHH:mm"). Used for the scheduled-announcement field's min/value.
function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Curated time zones for the optional scheduling override. "" means the
// account's configured zone (the default — no override is applied).
const SCHEDULING_TIME_ZONES: Array<{ value: string; label: string }> = [
  { value: "", label: "Account default" },
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "UTC", label: "UTC" },
];

// Up to two initials from a display name, for inbox avatars.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── Announcements ───────────────────────────────────────────────────────────

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

  const [draftPrompt, setDraftPrompt] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  // Optional scheduled visibility (datetime-local string); blank = post now.
  const [visibleAt, setVisibleAt] = useState("");
  const [posting, setPosting] = useState(false);
  const [postNote, setPostNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [lastPosted, setLastPosted] = useState<CanvasAnnouncement | null>(null);

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
    const result = await createAnnouncementAction(
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
    setAnnouncements((prev) => [result.announcement, ...prev]);
  };

  // Any chosen visibility time means "schedule" for the button label; the input's
  // min blocks past times, and handlePost re-checks against the actual clock.
  const willSchedule = visibleAt.trim().length > 0;

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
        <p className={styles.fieldHint}>Loading announcements…</p>
      )}

      <div className={styles.field}>
        <label htmlFor="canvas-ann-draft">Draft with AI (optional)</label>
        <TextField
          id="canvas-ann-draft"
          type="text"
          size="small"
          fullWidth
          placeholder="e.g. Remind students project 2 is due Friday and office hours moved to 3pm"
          value={draftPrompt}
          onChange={(e) => setDraftPrompt(e.target.value)}
        />
        <Button
          variant="outlined"
          size="small"
          onClick={handleDraft}
          disabled={drafting || !draftPrompt.trim()}
          sx={{ alignSelf: "flex-start", marginTop: 1 }}
        >
          {drafting ? "Drafting…" : "Draft with AI"}
        </Button>
        <p className={styles.fieldHint}>
          Generates a title and message you can edit below. Nothing is posted until you click Post.
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
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inbox ─────────────────────────────────────────────────────────────────-

function InboxPanel() {
  const [provider] = useLlmProvider();
  const { active: activeInstitution } = useInstitutionSelection();
  const { refreshUnread } = useInstitutionCounts();
  const { user } = useSupabase();
  const [showCalendar, setShowCalendar] = useState(false);

  // Embed the owner's own Google Calendar. src defaults to the signed-in email
  // (their primary calendar); override with NEXT_PUBLIC_GOOGLE_CALENDAR_EMBED_SRC
  // if their Google calendar address differs from their login.
  const calendarSrc = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_EMBED_SRC || user?.email || "";
  const calendarTimeZone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "America/Chicago";
  const calendarEmbedUrl = calendarSrc
    ? `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarSrc)}&ctz=${encodeURIComponent(calendarTimeZone)}&mode=WEEK`
    : "";

  const [conversations, setConversations] = useState<CanvasConversationSummary[]>([]);
  const [inboxState, setInboxState] = useState<{ status: "loading" | "idle" | "error"; message: string }>({
    status: "loading",
    message: "",
  });
  const [search, setSearch] = useState("");
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [conversation, setConversation] = useState<CanvasConversationDetail | null>(null);
  const [threadState, setThreadState] = useState<{ status: "idle" | "loading" | "error"; message: string }>({
    status: "idle",
    message: "",
  });

  const [replyBody, setReplyBody] = useState("");
  const [replyInstr, setReplyInstr] = useState("");
  const [showSteer, setShowSteer] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyNote, setReplyNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Google Calendar scheduling: the week-view planner (open slots + busy events),
  // the slot the user picked, the booking-in-progress flag, an optional student
  // email to invite, and whether the thread looks like a request to meet.
  const [suggesting, setSuggesting] = useState(false);
  const [planner, setPlanner] = useState<
    | {
        slots: string[];
        slotLabels: string[];
        events: CalendarEventBlock[];
        timeZone: string;
        workStartHour: number;
        workEndHour: number;
        slotMinutes: number;
      }
    | null
  >(null);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  // Optional time-zone override for slots ("" = the account's configured zone).
  const [scheduleTz, setScheduleTz] = useState("");
  const [booking, setBooking] = useState(false);
  const [offering, setOffering] = useState(false);
  const [studentEmail, setStudentEmail] = useState("");
  const [meetingHint, setMeetingHint] = useState(false);

  // Show the loading screen the instant the institution changes (before the
  // effect refetches), clearing the previous school's inbox + open thread.
  const [prevInstitution, setPrevInstitution] = useState(activeInstitution);
  if (activeInstitution !== prevInstitution) {
    setPrevInstitution(activeInstitution);
    setInboxState({ status: "loading", message: "" });
    setConversations([]);
    setSelectedId(null);
    setConversation(null);
  }

  const loadInbox = useCallback(async () => {
    setInboxState({ status: "loading", message: "" });
    const result = await listConversationsAction(activeInstitution || undefined);
    if ("error" in result) {
      setInboxState({ status: "error", message: result.error });
      return;
    }
    setConversations(result.conversations);
    setInboxState({ status: "idle", message: "" });
  }, [activeInstitution]);

  // Load the inbox on mount and whenever the active institution changes
  // (await-first so the effect performs no synchronous setState).
  useEffect(() => {
    let active = true;
    (async () => {
      const result = await listConversationsAction(activeInstitution || undefined);
      if (!active) return;
      setSelectedId(null);
      setConversation(null);
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
  }, [activeInstitution]);

  const openConversation = async (id: number) => {
    setSelectedId(id);
    setConversation(null);
    setReplyBody("");
    setReplyInstr("");
    setShowSteer(false);
    setReplyNote(null);
    setPlanner(null);
    setPlannerOpen(false);
    setSelectedSlot(null);
    setStudentEmail("");
    setMeetingHint(false);
    setThreadState({ status: "loading", message: "" });
    const result = await getConversationAction(id, activeInstitution || undefined);
    if ("error" in result) {
      setThreadState({ status: "error", message: result.error });
      return;
    }
    setConversation(result.conversation);
    setThreadState({ status: "idle", message: "" });
    // Proactively flag whether the student is asking to meet, so the scheduler
    // can be highlighted. Fire-and-forget; a model hiccup just leaves it unset.
    const text = result.conversation.messages.map((m) => `${m.author}: ${m.body}`).join("\n\n");
    detectMeetingRequestAction(text, provider)
      .then((r) => setMeetingHint(r.isMeetingRequest))
      .catch(() => {});
    // Opening marks it read in Canvas; reflect that locally + in the badge.
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, workflowState: "read" } : c))
    );
    refreshUnread();
  };

  const changeState = async (id: number, state: "read" | "unread" | "archived") => {
    const result = await setConversationStateAction(id, state, activeInstitution || undefined);
    if ("error" in result) return;
    setConversations((prev) =>
      state === "archived"
        ? prev.filter((c) => c.id !== id)
        : prev.map((c) => (c.id === id ? { ...c, workflowState: state } : c))
    );
    if (state === "archived" && selectedId === id) {
      setSelectedId(null);
      setConversation(null);
    }
    refreshUnread();
  };

  const threadText = conversation
    ? conversation.messages.map((m) => `${m.author}: ${m.body}`).join("\n\n")
    : "";

  // Best-effort student name: the most recent message not written by me, else
  // the first listed participant. Used to title the calendar event.
  const studentName = conversation
    ? [...conversation.messages]
        .reverse()
        .find((m) => conversation.selfId == null || m.authorId !== conversation.selfId)?.author
      ?? conversation.participants.find(Boolean)
      ?? "student"
    : "student";

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

  // Load the week-view planner (open slots + busy events) in the given zone and
  // open it. Shared by the "Suggest times" button and the in-modal zone switcher.
  const loadPlanner = async (tz: string) => {
    if (!threadText) return;
    setSuggesting(true);
    setReplyNote(null);
    const result = await getAvailableSlotsAction(tz || undefined);
    setSuggesting(false);
    if ("error" in result) {
      setReplyNote({ kind: "error", text: result.error });
      return;
    }
    if (result.slots.length === 0) {
      setReplyNote({
        kind: "error",
        text: "No open times in your working hours over the next couple of weeks.",
      });
      return;
    }
    setPlanner(result);
    setSelectedSlot(null);
    setPlannerOpen(true);
  };

  const handleSuggestTimes = () => loadPlanner(scheduleTz);

  // Switch the slot time zone from inside the planner and reload in that zone.
  const handleTzChange = (tz: string) => {
    setScheduleTz(tz);
    void loadPlanner(tz);
  };

  // Label for the slot the user picked (for the confirmation + reply line).
  const selectedLabel =
    planner && selectedSlot
      ? planner.slotLabels[planner.slots.indexOf(selectedSlot)] ?? selectedSlot
      : null;
  // Readable name for the offer/booking copy ("student" is the fallback).
  const offerTarget = studentName && studentName !== "student" ? studentName : "the student";

  // Old flow: draft a reply offering all the open times for the student to pick.
  const handleOfferAll = async () => {
    if (!planner) return;
    setOffering(true);
    setReplyNote(null);
    const result = await draftMeetingReplyAction(threadText, planner.slots, provider, scheduleTz || undefined);
    setOffering(false);
    if ("error" in result) {
      setReplyNote({ kind: "error", text: result.error });
      return;
    }
    setReplyBody(result.body);
    setReplyNote({ kind: "success", text: "Drafted a reply offering these times. Edit and send when ready." });
    setPlannerOpen(false);
  };

  // Book the picked slot as a Google Meet and append the join link to the reply.
  const handleBookSelected = async () => {
    if (!selectedSlot) return;
    setBooking(true);
    setReplyNote(null);
    const result = await createMeetingAction(
      selectedSlot,
      studentName,
      studentEmail.trim() || undefined,
      scheduleTz || undefined
    );
    setBooking(false);
    if ("error" in result) {
      setReplyNote({ kind: "error", text: result.error });
      return;
    }
    if (result.meetLink) {
      const label = selectedLabel ?? "the scheduled time";
      setReplyBody((prev) => {
        const base = prev.trim();
        return `${base}${base ? "\n\n" : ""}I've set us up for ${label}. Join here: ${result.meetLink}`;
      });
      setReplyNote({ kind: "success", text: "Meeting booked. Google Meet link added to your reply." });
    } else {
      setReplyNote({ kind: "success", text: "Meeting booked, but no Meet link was returned." });
    }
    setPlannerOpen(false);
    setPlanner(null);
    setSelectedSlot(null);
  };

  const handleSendReply = async () => {
    if (selectedId === null || !replyBody.trim()) return;
    setSending(true);
    setReplyNote(null);
    const result = await replyToConversationAction(
      selectedId,
      replyBody.trim(),
      activeInstitution || undefined
    );
    setSending(false);
    if ("error" in result) {
      setReplyNote({ kind: "error", text: result.error });
      return;
    }
    setConversation(result.conversation);
    setReplyBody("");
    setReplyInstr("");
    setReplyNote({ kind: "success", text: "Reply sent." });
    void loadInbox();
    refreshUnread();
  };

  const visibleConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (readFilter === "unread" && c.workflowState !== "unread") return false;
      if (readFilter === "read" && c.workflowState === "unread") return false;
      if (!term) return true;
      return (
        c.subject.toLowerCase().includes(term) ||
        c.participants.join(" ").toLowerCase().includes(term) ||
        c.lastMessage.toLowerCase().includes(term)
      );
    });
  }, [conversations, search, readFilter]);

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* Conversation list */}
      <div style={{ flex: "1 1 300px", minWidth: 260, maxWidth: 460, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className={styles.resultsHeader} style={{ paddingTop: 0 }}>
          <h2>Inbox</h2>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              void loadInbox();
              refreshUnread();
            }}
            disabled={inboxState.status === "loading"}
          >
            {inboxState.status === "loading" ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <TextField
            type="search"
            size="small"
            style={{ flex: "1 1 160px", minWidth: 0 }}
            placeholder="Search messages"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <TextField
            select
            size="small"
            sx={{ minWidth: 130 }}
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value as "all" | "unread" | "read")}
            aria-label="Filter by read state"
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="unread">Unread</MenuItem>
            <MenuItem value="read">Read</MenuItem>
          </TextField>
        </div>

        {inboxState.status === "loading" && (
          <div className={styles.loadingState} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <div>
              <p className={styles.loadingTitle}>Loading inbox…</p>
            </div>
          </div>
        )}
        {inboxState.status === "error" && <p className={styles.error}>{inboxState.message}</p>}
        {inboxState.status === "idle" && conversations.length === 0 && (
          <p className={styles.emptyState}>No conversations in the inbox.</p>
        )}
        {inboxState.status === "idle" && conversations.length > 0 && visibleConversations.length === 0 && (
          <p className={styles.emptyState}>No conversations match.</p>
        )}

        {visibleConversations.map((c) => {
          const selected = c.id === selectedId;
          const unread = c.workflowState === "unread";
          const who = c.participants[0] ?? c.subject;
          return (
            <div
              key={c.id}
              className={`${styles.inboxItem}${selected ? ` ${styles.inboxItemSelected}` : ""}${unread ? ` ${styles.inboxItemUnread}` : ""}`}
            >
              <button type="button" className={styles.inboxItemMain} onClick={() => void openConversation(c.id)}>
                <span className={styles.inboxAvatar} aria-hidden="true">{initials(who)}</span>
                <span className={styles.inboxItemBody}>
                  <span className={styles.inboxItemTop}>
                    <span className={styles.inboxItemSubject} style={{ fontWeight: unread ? 800 : 600 }}>
                      {c.subject}
                    </span>
                    <span className={styles.inboxItemTime}>{formatRelative(c.lastMessageAt)}</span>
                  </span>
                  {c.participants.length > 0 && (
                    <span className={styles.inboxItemMeta}>{c.participants.join(", ")}</span>
                  )}
                  {c.lastMessage && <span className={styles.inboxItemPreview}>{c.lastMessage}</span>}
                </span>
              </button>
              <div className={styles.inboxItemActions}>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => void changeState(c.id, unread ? "read" : "unread")}
                >
                  {unread ? "Mark read" : "Mark unread"}
                </Button>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => void changeState(c.id, "archived")}
                >
                  Archive
                </Button>
              </div>
            </div>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {conversation.messages.map((m) => {
                const mine = conversation.selfId != null && m.authorId === conversation.selfId;
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: mine ? "flex-end" : "flex-start",
                      gap: 3,
                    }}
                  >
                    <span className={styles.fieldHint}>
                      {[mine ? "You" : m.author, formatRelative(m.createdAt)].filter(Boolean).join(" · ")}
                    </span>
                    <div className={mine ? styles.selectionChatUserMsg : styles.selectionChatAiMsg}>
                      {m.body}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.inboxReplyBox}>
              <div className={styles.field}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  <label htmlFor="canvas-reply-body" style={{ margin: 0 }}>Your reply</label>
                  {meetingHint && !plannerOpen && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: "#eff4ff",
                        color: "#2563eb",
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "3px 9px",
                        borderRadius: 999,
                      }}
                    >
                      Looks like a meeting request
                    </span>
                  )}
                </div>
                <TextField
                  id="canvas-reply-body"
                  multiline
                  minRows={4}
                  fullWidth
                  placeholder="Write your reply, or use an assist below."
                  value={replyBody}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setReplyBody(e.target.value)}
                />
              </div>

              {(showSteer || replyInstr) && (
                <TextField
                  type="text"
                  size="small"
                  fullWidth
                  sx={{ marginBottom: 1 }}
                  placeholder="Guidance for the draft, e.g. be encouraging and point them to office hours"
                  value={replyInstr}
                  onChange={(e) => setReplyInstr(e.target.value)}
                />
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleDraftReply}
                    disabled={drafting}
                  >
                    {drafting ? "Drafting…" : "Draft with AI"}
                  </Button>
                  {!showSteer && !replyInstr && (
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => setShowSteer(true)}
                    >
                      Add guidance
                    </Button>
                  )}
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleSuggestTimes}
                    disabled={suggesting}
                    sx={meetingHint ? { borderColor: "#2563eb", color: "#2563eb" } : {}}
                  >
                    {suggesting ? "Finding times…" : "Schedule a call"}
                  </Button>
                </div>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleSendReply}
                  disabled={sending || !replyBody.trim()}
                >
                  {sending ? "Sending…" : "Send reply"}
                </Button>
              </div>

              {replyNote && (
                <p className={replyNote.kind === "error" ? styles.error : styles.fieldHint}>
                  {replyNote.text}
                </p>
              )}
            </div>
          </>
        ) : null}
      </div>

      {plannerOpen && planner && (
        <div
          className={styles.previewBackdrop}
          role="dialog"
          aria-modal="true"
          onClick={() => setPlannerOpen(false)}
        >
          <div
            className={styles.previewModal}
            style={{ width: "min(640px, 92vw)", maxWidth: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.previewHeader}>
              <h3>{studentName && studentName !== "student" ? `Schedule a call with ${studentName}` : "Schedule a call"}</h3>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setShowCalendar(true)}
                >
                  Open full calendar
                </Button>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setPlannerOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>

            <p className={styles.fieldHint} style={{ marginTop: 0, marginBottom: 10 }}>
              Highlighted times are open. Offer them all for {offerTarget} to choose from, or click one
              to book it directly.
            </p>

            <div className={styles.field} style={{ marginBottom: 10, maxWidth: 280 }}>
              <label htmlFor="canvas-schedule-tz">Time zone</label>
              <TextField
                id="canvas-schedule-tz"
                select
                size="small"
                fullWidth
                value={scheduleTz}
                disabled={suggesting}
                onChange={(e) => handleTzChange(e.target.value)}
              >
                {SCHEDULING_TIME_ZONES.map((tz) => (
                  <MenuItem key={tz.value || "default"} value={tz.value}>
                    {tz.label}
                  </MenuItem>
                ))}
              </TextField>
            </div>

            <WeekCalendar
              timeZone={planner.timeZone}
              workStartHour={planner.workStartHour}
              workEndHour={planner.workEndHour}
              slotMinutes={planner.slotMinutes}
              slots={planner.slots}
              events={planner.events}
              selectedSlot={selectedSlot}
              onSelect={setSelectedSlot}
            />

            {selectedSlot && (
              <div className={styles.field} style={{ marginTop: 12 }}>
                <label htmlFor="canvas-student-email">Student email to invite (optional)</label>
                <TextField
                  id="canvas-student-email"
                  type="email"
                  size="small"
                  fullWidth
                  placeholder="name@example.com"
                  value={studentEmail}
                  onChange={(e) => setStudentEmail(e.target.value)}
                />
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px solid #e5e7eb",
                flexWrap: "wrap",
              }}
            >
              <Button
                variant="contained"
                size="small"
                onClick={handleOfferAll}
                disabled={offering || booking}
              >
                {offering ? "Drafting…" : `Offer these times to ${offerTarget}`}
              </Button>
              {selectedSlot ? (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleBookSelected}
                  disabled={booking || offering}
                  sx={{ borderColor: "#2563eb", color: "#2563eb" }}
                >
                  {booking ? "Booking…" : `Book ${selectedLabel}`}
                </Button>
              ) : (
                <span className={styles.fieldHint}>or click a highlighted time to book it directly</span>
              )}
              <Button size="small" variant="text" onClick={() => setPlannerOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {showCalendar && (
        <div
          className={styles.previewBackdrop}
          role="dialog"
          aria-modal="true"
          onClick={() => setShowCalendar(false)}
        >
          <div
            className={styles.previewModal}
            style={{ width: "min(1000px, 92vw)", maxWidth: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.previewHeader}>
              <h3>Your calendar</h3>
              <Button
                size="small"
                variant="text"
                onClick={() => setShowCalendar(false)}
              >
                Close
              </Button>
            </div>
            {calendarEmbedUrl ? (
              <iframe
                title="Google Calendar"
                src={calendarEmbedUrl}
                style={{ width: "100%", height: "70vh", border: 0 }}
              />
            ) : (
              <p className={styles.fieldHint}>
                No calendar address found. Sign in with the Google account whose calendar you want to
                see, or set NEXT_PUBLIC_GOOGLE_CALENDAR_EMBED_SRC.
              </p>
            )}
            <p className={styles.fieldHint} style={{ marginTop: 8 }}>
              Shows your Google Calendar when you are signed into Google in this browser.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab shell ───────────────────────────────────────────────────────────────

type CanvasView = "announcements" | "inbox";

// Announcements and Inbox are surfaced as their own subtabs under LMS
// Integration, so this renders a single panel chosen by `view` (the tab chrome
// and institution picker live in the parent).
export default function CanvasTab({ view }: { view: CanvasView }) {
  return view === "announcements" ? <AnnouncementsPanel /> : <InboxPanel />;
}
