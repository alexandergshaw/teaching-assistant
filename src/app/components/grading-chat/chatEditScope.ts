/** A mount owns its edits; the counter distinguishes new sessions in that mount. */
export function newChatEditInstance(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function chatEditScope(instance: string, account: string | undefined, session: number): string {
  return `grading-chat-session-${instance}-${account ?? "signed-out"}-${session}`;
}

/** Export only explicitly account-scoped records; shared legacy keys have no owner. */
type SavedRecord = { key: string; edits?: unknown; malformedRaw?: string };

function readRecord(storage: Storage, key: string): SavedRecord | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  try { return { key, edits: JSON.parse(raw) }; } catch { return { key, malformedRaw: raw }; }
}

export function savedChatEdits(storage: Storage, account: string): SavedRecord[] {
  if (!account) return [];
  const records: SavedRecord[] = [];
  const marker = "::grading-chat-session-";
  const suffix = `-${account}-`;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith("ta-grading-results-edits:") || !key.includes(marker)) continue;
    const scope = key.slice(key.indexOf(marker) + marker.length);
    const position = scope.lastIndexOf(suffix);
    if (position <= 0 || !/^\d+$/.test(scope.slice(position + suffix.length))) continue;
    const record = readRecord(storage, key);
    if (record) records.push(record);
  }
  return records;
}

/** Legacy keys are shared on this browser and cannot be attributed to an account. */
export function savedLegacyChatEdits(storage: Storage): SavedRecord[] {
  const records: SavedRecord[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || (key !== "ta-grading-results-edits:" && !(key.startsWith("ta-grading-results-edits:") && (/::grading-chat-\d+$/.test(key) || /::grading-chat-session-.+-signed-out-\d+$/.test(key))))) continue;
    const record = readRecord(storage, key);
    if (record) records.push(record);
  }
  return records;
}
