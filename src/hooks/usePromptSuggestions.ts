"use client";

import { useCallback, useState } from "react";

const STORAGE_KEY = "ta_prompt_history";
const MAX_HISTORY = 100;
const MAX_SUGGESTIONS = 5;
/** Frecency decay rate: ~7-day half-life. */
const DECAY_RATE = 0.1;

interface PromptRecord {
  text: string;
  count: number;
  lastUsed: number; // Unix ms timestamp
}

/** Frecency score: balances frequency and recency. */
function frecencyScore(record: PromptRecord, now: number): number {
  const daysSince = (now - record.lastUsed) / 86_400_000;
  return record.count * Math.exp(-DECAY_RATE * daysSince);
}

function readHistory(): PromptRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PromptRecord[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(history: PromptRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Storage quota exceeded or private browsing — silently ignore.
  }
}

/**
 * Tracks messages sent to AI and returns ranked suggestions based on
 * frecency (frequency × recency decay).
 *
 * @param maxSuggestions - Number of suggestions to surface (default 5).
 */
export function usePromptSuggestions(maxSuggestions = MAX_SUGGESTIONS) {
  // Lazy initializer reads localStorage once on mount — avoids effect-in-setState lint error.
  const [suggestions, setSuggestions] = useState<string[]>(() => {
    const history = readHistory();
    const now = Date.now();
    return [...history]
      .sort((a, b) => frecencyScore(b, now) - frecencyScore(a, now))
      .slice(0, maxSuggestions)
      .map((r) => r.text);
  });

  /** Recompute suggestions from current localStorage state. */
  const refresh = useCallback(() => {
    const history = readHistory();
    const now = Date.now();
    const ranked = [...history]
      .sort((a, b) => frecencyScore(b, now) - frecencyScore(a, now))
      .slice(0, maxSuggestions)
      .map((r) => r.text);
    setSuggestions(ranked);
  }, [maxSuggestions]);

  /**
   * Record a prompt that was sent to the AI.
   * Increments its count, updates its timestamp, and refreshes suggestions.
   */
  const recordPrompt = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      let history = readHistory();
      const existing = history.find((r) => r.text === trimmed);

      if (existing) {
        existing.count += 1;
        existing.lastUsed = Date.now();
      } else {
        history.push({ text: trimmed, count: 1, lastUsed: Date.now() });
      }

      // Trim to max history size (remove lowest-scored entries first).
      if (history.length > MAX_HISTORY) {
        const now = Date.now();
        history = history
          .sort((a, b) => frecencyScore(b, now) - frecencyScore(a, now))
          .slice(0, MAX_HISTORY);
      }

      writeHistory(history);
      refresh();
    },
    [refresh]
  );

  return { suggestions, recordPrompt };
}
