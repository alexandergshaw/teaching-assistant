// Persisted UI state for the Knowledge-tab Ask AI (KnowledgeAskAiPanel).
//
// Unlike knowledge-overview-storage.ts, these are SINGLE-VALUE ta- keys, not
// per-scope maps: the Ask AI is independent of which page is selected, so its
// composer draft and open flags must not change with navigation. The answer
// and history are institution-keyed server data, not stored here.
//
// Split into pure parse/serialize functions (unit-tested - vitest is node-env
// with no localStorage) and thin read/write wrappers.

const KB_ASKAI_QUESTION_KEY = "ta-kb-askai-question";
const KB_ASKAI_OPEN_KEY = "ta-kb-askai-open";
const KB_ASKAI_HISTORY_OPEN_KEY = "ta-kb-askai-history-open";

export function parseAskAiQuestion(raw: string | null): string {
  return typeof raw === "string" ? raw : "";
}

/** null clears the key (an empty draft is not persisted). */
export function serializeAskAiQuestion(question: string): string | null {
  return question ? question : null;
}

export function parseAskAiOpen(raw: string | null): boolean {
  return raw === "false" ? false : true;
}

export function parseAskAiHistoryOpen(raw: string | null): boolean {
  return raw === "true";
}

export interface AskAiUiState {
  question: string;
  open: boolean;
  historyOpen: boolean;
}

export function readAskAiUiState(): AskAiUiState {
  if (typeof window === "undefined") return { question: "", open: true, historyOpen: false };
  try {
    return {
      question: parseAskAiQuestion(localStorage.getItem(KB_ASKAI_QUESTION_KEY)),
      open: parseAskAiOpen(localStorage.getItem(KB_ASKAI_OPEN_KEY)),
      historyOpen: parseAskAiHistoryOpen(localStorage.getItem(KB_ASKAI_HISTORY_OPEN_KEY)),
    };
  } catch {
    return { question: "", open: true, historyOpen: false };
  }
}

function writeKey(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore storage write failures
  }
}

export function writeAskAiQuestion(question: string): void {
  writeKey(KB_ASKAI_QUESTION_KEY, serializeAskAiQuestion(question));
}
export function writeAskAiOpen(open: boolean): void {
  writeKey(KB_ASKAI_OPEN_KEY, String(open));
}
export function writeAskAiHistoryOpen(open: boolean): void {
  writeKey(KB_ASKAI_HISTORY_OPEN_KEY, String(open));
}
