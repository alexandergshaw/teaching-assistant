"use client";

import { useCallback, useState } from "react";
import styles from "../page.module.css";

export interface DeadlineEvent {
  id: string;
  title: string;
  date: string;
  type: "deadline" | "event";
  description?: string;
}

const STORAGE_KEY = "teaching-assistant-deadlines";

function loadEvents(): DeadlineEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DeadlineEvent[]) : [];
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
            onClick={() => setShowAddForm((f) => !f)}
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
            Click + to add one.
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
                {event.type === "deadline" ? "Deadline" : "Event"}
              </span>
              <div className={styles.deadlineItemTitle}>{event.title}</div>
              <div className={styles.deadlineItemDate}>
                {formatDate(event.date)}
              </div>
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
