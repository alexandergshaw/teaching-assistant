"use client";

import { useCallback, useRef, useState } from "react";
import styles from "../page.module.css";
import {
  CALENDAR_EVENT_TYPE_LABELS,
  categorizeEventType,
  isCalendarEventType,
  type CalendarEventType,
  type ParsedCalendarResult,
} from "@/lib/calendar-events";
import { getStoredProvider } from "@/lib/llm-provider";

export interface DeadlineEvent {
  id: string;
  title: string;
  date: string;
  /** End date for ranged events (e.g. finals week, spring break). ISO YYYY-MM-DD. */
  endDate?: string;
  /**
   * Coarse legacy category. Retained for badge coloring and backward
   * compatibility with any previously-stored events.
   */
  type: "deadline" | "event";
  /** Finer-grained event type extracted from a calendar/syllabus PDF. */
  eventType?: CalendarEventType;
  /** School / institution the event belongs to (parsed from the PDF). */
  school?: string;
  /** Specific course (e.g. "CS 106A"), when sourced from a syllabus. */
  courseName?: string;
  description?: string;
}

const STORAGE_KEY = "teaching-assistant-deadlines";

function loadEvents(): DeadlineEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is DeadlineEvent =>
        !!item &&
        typeof item === "object" &&
        typeof (item as DeadlineEvent).id === "string" &&
        typeof (item as DeadlineEvent).title === "string" &&
        typeof (item as DeadlineEvent).date === "string"
    );
  } catch {
    return [];
  }
}

function saveEvents(events: DeadlineEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(start: string, end?: string): string {
  if (!end || end === start) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function badgeLabel(event: DeadlineEvent): string {
  if (event.eventType && isCalendarEventType(event.eventType)) {
    return CALENDAR_EVENT_TYPE_LABELS[event.eventType];
  }
  return event.type === "deadline" ? "Deadline" : "Event";
}

interface DeadlinesWindowProps {
  position: { x: number; y: number };
  onHeaderMouseDown: (e: React.MouseEvent) => void;
  onClose: () => void;
}

export default function DeadlinesWindow({
  position,
  onHeaderMouseDown,
  onClose,
}: DeadlinesWindowProps) {
  const [events, setEvents] = useState<DeadlineEvent[]>(loadEvents);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newType, setNewType] = useState<"deadline" | "event">("deadline");
  const [newDescription, setNewDescription] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<
    | { kind: "idle" }
    | { kind: "uploading"; fileName: string }
    | { kind: "parsing" }
    | { kind: "success"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const [showTextForm, setShowTextForm] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const handleAdd = useCallback(() => {
    if (!newTitle.trim() || !newDate) return;
    const newEvent: DeadlineEvent = {
      id: crypto.randomUUID(),
      title: newTitle.trim(),
      date: newDate,
      type: newType,
      description: newDescription.trim() || undefined,
    };
    const updated = [...events, newEvent];
    setEvents(updated);
    saveEvents(updated);
    setNewTitle("");
    setNewDate("");
    setNewType("deadline");
    setNewDescription("");
    setShowAddForm(false);
  }, [events, newTitle, newDate, newType, newDescription]);

  const handleDelete = useCallback(
    (id: string) => {
      const updated = events.filter((e) => e.id !== id);
      setEvents(updated);
      saveEvents(updated);
    },
    [events]
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const file = input.files?.[0];
      // Always reset the input so re-selecting the same file re-triggers change.
      input.value = "";
      if (!file) return;

      setUploadStatus({ kind: "uploading", fileName: file.name });

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("provider", getStoredProvider());

        const res = await fetch("/api/parse-calendar", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          let message = `Upload failed (HTTP ${res.status}).`;
          try {
            const errBody = (await res.json()) as { error?: string };
            if (errBody?.error) message = errBody.error;
          } catch {
            // Ignore JSON parse errors; keep generic message.
          }
          setUploadStatus({ kind: "error", message });
          return;
        }

        const data = (await res.json()) as ParsedCalendarResult;
        const parsedEvents = Array.isArray(data?.events) ? data.events : [];

        if (parsedEvents.length === 0) {
          setUploadStatus({
            kind: "error",
            message:
              "No events could be extracted from that PDF. Try a different file.",
          });
          return;
        }

        const school = data.school;
        const courseName = data.courseName;

        const newEvents: DeadlineEvent[] = parsedEvents.map((ev) => ({
          id: crypto.randomUUID(),
          title: ev.title,
          date: ev.date,
          endDate: ev.endDate,
          type: categorizeEventType(ev.type),
          eventType: ev.type,
          school,
          courseName,
          description: ev.description,
        }));

        const updated = [...events, ...newEvents];
        setEvents(updated);
        saveEvents(updated);

        const schoolSuffix = school ? ` from ${school}` : "";
        setUploadStatus({
          kind: "success",
          message: `Added ${newEvents.length} event${
            newEvents.length === 1 ? "" : "s"
          }${schoolSuffix}.`,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unexpected upload error.";
        setUploadStatus({ kind: "error", message });
      }
    },
    [events]
  );

  const handleTextParse = useCallback(async () => {
    const text = pasteText.trim();
    if (!text) return;

    setUploadStatus({ kind: "parsing" });
    setShowTextForm(false);
    setPasteText("");

    try {
      const res = await fetch("/api/parse-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, provider: getStoredProvider() }),
      });

      if (!res.ok) {
        let message = `Parse failed (HTTP ${res.status}).`;
        try {
          const errBody = (await res.json()) as { error?: string };
          if (errBody?.error) message = errBody.error;
        } catch {
          // Ignore JSON parse errors; keep generic message.
        }
        setUploadStatus({ kind: "error", message });
        return;
      }

      const data = (await res.json()) as ParsedCalendarResult;
      const parsedEvents = Array.isArray(data?.events) ? data.events : [];

      if (parsedEvents.length === 0) {
        setUploadStatus({
          kind: "error",
          message:
            "No events could be extracted from that text. Try including dates and event names.",
        });
        return;
      }

      const school = data.school;
      const courseName = data.courseName;

      const newEvents: DeadlineEvent[] = parsedEvents.map((ev) => ({
        id: crypto.randomUUID(),
        title: ev.title,
        date: ev.date,
        endDate: ev.endDate,
        type: categorizeEventType(ev.type),
        eventType: ev.type,
        school,
        courseName,
        description: ev.description,
      }));

      const updated = [...events, ...newEvents];
      setEvents(updated);
      saveEvents(updated);

      const schoolSuffix = school ? ` from ${school}` : "";
      setUploadStatus({
        kind: "success",
        message: `Added ${newEvents.length} event${
          newEvents.length === 1 ? "" : "s"
        }${schoolSuffix}.`,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unexpected error parsing text.";
      setUploadStatus({ kind: "error", message });
    }
  }, [events, pasteText]);

  const isUploading = uploadStatus.kind === "uploading" || uploadStatus.kind === "parsing";

  return (
    <div
      className={styles.selectionChatWindow}
      style={{ left: position.x, top: position.y, width: 380, height: 480 }}
      role="dialog"
      aria-label="Deadlines & Events"
    >
      {/* Header */}
      <div className={styles.selectionChatHeader} onMouseDown={onHeaderMouseDown}>
        <div className={styles.selectionChatHeaderLeft}>
          <CalendarIcon />
          <span>Deadlines &amp; Events</span>
        </div>
        <div className={styles.deadlinesHeaderActions}>
          <button
            className={styles.deadlinesAddIconBtn}
            onClick={handleUploadClick}
            aria-label="Upload calendar or syllabus PDF"
            title="Upload calendar/syllabus PDF"
            disabled={isUploading}
          >
            <UploadIcon />
          </button>
          <button
            className={styles.deadlinesAddIconBtn}
            onClick={() => {
              setShowTextForm((f) => !f);
              setShowAddForm(false);
            }}
            aria-label="Paste text to parse"
            title="Paste text to parse"
            disabled={isUploading}
          >
            <TextIcon />
          </button>
          <button
            className={styles.deadlinesAddIconBtn}
            onClick={() => {
              setShowAddForm((f) => !f);
              setShowTextForm(false);
            }}
            aria-label="Add event"
            title="Add event"
          >
            <PlusIcon />
          </button>
          <button
            className={styles.selectionChatClose}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleFileSelected}
        style={{ display: "none" }}
        aria-hidden="true"
      />

      {/* Upload status banner */}
      {uploadStatus.kind !== "idle" && (
        <div
          className={styles.deadlinesUploadStatus}
          data-kind={uploadStatus.kind}
          role="status"
        >
          {uploadStatus.kind === "uploading" && (
            <span>Parsing {uploadStatus.fileName}…</span>
          )}
          {uploadStatus.kind === "parsing" && (
            <span>Parsing text…</span>
          )}
          {uploadStatus.kind === "success" && <span>{uploadStatus.message}</span>}
          {uploadStatus.kind === "error" && (
            <span>Error: {uploadStatus.message}</span>
          )}
          {uploadStatus.kind !== "uploading" && uploadStatus.kind !== "parsing" && (
            <button
              className={styles.deadlinesUploadStatusClose}
              onClick={() => setUploadStatus({ kind: "idle" })}
              aria-label="Dismiss"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Paste text form */}
      {showTextForm && (
        <div className={styles.deadlinesAddForm}>
          <textarea
            className={`${styles.deadlinesInput} ${styles.deadlinesTextarea}`}
            placeholder="Paste syllabus or calendar text here…"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
          />
          <div className={styles.deadlinesFormActions}>
            <button
              className={styles.deadlinesCancelBtn}
              onClick={() => {
                setShowTextForm(false);
                setPasteText("");
              }}
            >
              Cancel
            </button>
            <button
              className={styles.deadlinesAddBtn}
              onClick={handleTextParse}
              disabled={!pasteText.trim()}
            >
              Parse
            </button>
          </div>
        </div>
      )}

      {/* Add event form */}
      {showAddForm && (
        <div className={styles.deadlinesAddForm}>
          <input
            className={styles.deadlinesInput}
            placeholder="Title *"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <div className={styles.deadlinesInputRow}>
            <input
              className={styles.deadlinesInput}
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              style={{ flex: 1 }}
            />
            <select
              className={styles.deadlinesInput}
              value={newType}
              onChange={(e) =>
                setNewType(e.target.value as "deadline" | "event")
              }
              style={{ flex: 1 }}
            >
              <option value="deadline">Deadline</option>
              <option value="event">Event</option>
            </select>
          </div>
          <input
            className={styles.deadlinesInput}
            placeholder="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
          <div className={styles.deadlinesFormActions}>
            <button
              className={styles.deadlinesCancelBtn}
              onClick={() => setShowAddForm(false)}
            >
              Cancel
            </button>
            <button
              className={styles.deadlinesAddBtn}
              onClick={handleAdd}
              disabled={!newTitle.trim() || !newDate}
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Events list */}
      <div className={styles.selectionChatMessages}>
        {sortedEvents.length === 0 && (
          <p className={styles.selectionChatEmpty}>
            No upcoming deadlines or events.
            <br />
            Click + to add one, or upload a calendar/syllabus PDF.
          </p>
        )}
        {sortedEvents.map((event) => (
          <div key={event.id} className={styles.deadlineItem}>
            <div className={styles.deadlineItemLeft}>
              <span
                className={`${styles.deadlineItemBadge} ${
                  event.type === "deadline"
                    ? styles.deadlineBadge
                    : styles.eventBadge
                }`}
              >
                {badgeLabel(event)}
              </span>
              <div className={styles.deadlineItemTitle}>{event.title}</div>
              <div className={styles.deadlineItemDate}>
                {formatDateRange(event.date, event.endDate)}
              </div>
              {(event.school || event.courseName) && (
                <div className={styles.deadlineItemSchool}>
                  {[event.courseName, event.school].filter(Boolean).join(" · ")}
                </div>
              )}
              {event.description && (
                <div className={styles.deadlineItemDesc}>
                  {event.description}
                </div>
              )}
            </div>
            <button
              className={styles.deadlineDeleteBtn}
              onClick={() => handleDelete(event.id)}
              aria-label="Delete"
              title="Delete"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M19 4h-1V2h-2v2H8V2H6v2H5C3.89 2 3 2.9 3 4v16c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H5V8h14v14z" />
      <path d="M7 10h5v5H7z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M19 13H13v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.5 4v3h5v12h3V7h5V4h-13zm19 5h-9v3h3v7h3v-7h3V9z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 20h14v-2H5v2zm7-18L5.33 8.67l1.41 1.41L11 5.83V16h2V5.83l4.26 4.25 1.41-1.41L12 2z" />
    </svg>
  );
}
