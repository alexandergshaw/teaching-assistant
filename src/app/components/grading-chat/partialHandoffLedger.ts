/** Persist reviewed partial intake before dispatch; an unresolved record is never retried automatically. */
export interface PartialHandoffRecord {
  readonly account: string;
  readonly sourceDigest: string;
  readonly subsetDigest: string;
  readonly selected: readonly { readonly student: string; readonly files: readonly string[] }[];
  readonly omitted: readonly { readonly student: string; readonly files: readonly string[]; readonly reason: string }[];
  readonly status: "pending" | "accepted" | "refused" | "unknown";
}
export type LedgerStorage = Pick<Storage, "getItem" | "setItem" | "key" | "length">;
const key = (account: string, digest: string, subset: string) => `partial-intake-v1:${encodeURIComponent(account)}:${digest}:${subset}`;

export function listPartialHandoffs(storage: Storage, account: string): PartialHandoffRecord[] {
  const prefix = `partial-intake-v1:${encodeURIComponent(account)}:`, records: PartialHandoffRecord[] = [];
  for (let index = 0; index < storage.length && records.length < 50; index++) {
    const itemKey = storage.key(index); if (!itemKey?.startsWith(prefix)) continue;
    try {
      const record = JSON.parse(storage.getItem(itemKey) ?? "null") as PartialHandoffRecord;
      if (record?.account === account && /^[a-f0-9]{64}$/.test(record.sourceDigest) && /^[a-f0-9]{64}$/.test(record.subsetDigest) && ["pending", "accepted", "refused", "unknown"].includes(record.status) && Array.isArray(record.omitted) && record.omitted.every((item) => item && typeof item.student === "string" && typeof item.reason === "string" && Array.isArray(item.files) && item.files.every((file: unknown) => typeof file === "string")) && Array.isArray(record.selected)) records.push(record);
    } catch { /* Malformed stored entries are not displayed. */ }
  }
  return records;
}

/** Caller must hold a cross-tab exclusive lock for this account and source. */
export function reservePartialHandoff(storage: LedgerStorage, record: PartialHandoffRecord): boolean {
  if (!record.account || !/^[a-f0-9]{64}$/.test(record.sourceDigest) || !/^[a-f0-9]{64}$/.test(record.subsetDigest) || record.status !== "pending" || !record.selected.length) return false;
  const prefix = `partial-intake-v1:${encodeURIComponent(record.account)}:${record.sourceDigest}`;
  const selected = new Set(record.selected.flatMap((group) => group.files));
  if (!selected.size || selected.size !== record.selected.reduce((count, group) => count + group.files.length, 0)) return false;
  const students = new Set(record.selected.map((group) => group.student.trim().normalize("NFKC").toLocaleLowerCase()));
  if (students.has("") || students.size !== record.selected.length) return false;
  for (let index = 0; index < storage.length; index++) {
    const existingKey = storage.key(index); if (!existingKey || (existingKey !== prefix && !existingKey.startsWith(`${prefix}:`))) continue;
    try {
      const existing = JSON.parse(storage.getItem(existingKey) ?? "null") as PartialHandoffRecord;
      if (!existing || !Array.isArray(existing.selected) || existing.selected.some((group) => typeof group.student !== "string" || students.has(group.student.trim().normalize("NFKC").toLocaleLowerCase()) || !Array.isArray(group.files) || group.files.some((file: unknown) => typeof file !== "string" || selected.has(file)))) return false;
    } catch { return false; }
  }
  const recordKey = key(record.account, record.sourceDigest, record.subsetDigest);
  if (storage.getItem(recordKey) !== null) return false;
  storage.setItem(recordKey, JSON.stringify(record));
  return storage.getItem(recordKey) !== null;
}

/** Retain uncertain outcomes so a later tab can warn instead of dispatching again. */
export function settlePartialHandoff(storage: LedgerStorage, account: string, sourceDigest: string, subsetDigest: string, status: Exclude<PartialHandoffRecord["status"], "pending">): boolean {
  const recordKey = key(account, sourceDigest, subsetDigest), raw = storage.getItem(recordKey);
  if (!raw) return false;
  try {
    const record = JSON.parse(raw) as PartialHandoffRecord;
    if (record.account !== account || record.sourceDigest !== sourceDigest || record.subsetDigest !== subsetDigest || record.status !== "pending") return false;
    storage.setItem(recordKey, JSON.stringify({ ...record, status }));
    return true;
  } catch { return false; }
}
