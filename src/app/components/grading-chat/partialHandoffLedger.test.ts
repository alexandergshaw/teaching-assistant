import { expect, it } from "vitest";
import { reservePartialHandoff, settlePartialHandoff, type LedgerStorage, type PartialHandoffRecord } from "./partialHandoffLedger";

it("persists omissions before dispatch and refuses a duplicate or mismatched settlement", () => {
  const records = new Map<string, string>();
  const storage: LedgerStorage = { get length() { return records.size; }, key: (index) => [...records.keys()][index] ?? null, getItem: (key) => records.get(key) ?? null, setItem: (key, value) => { records.set(key, value); } };
  const record: PartialHandoffRecord = { account: "account-a", sourceDigest: "a".repeat(64), subsetDigest: "b".repeat(64), selected: [{ student: "Student", files: ["work.txt"] }], omitted: [{ student: "Other", files: ["video.mp4"], reason: "member size" }], status: "pending" };
  expect(reservePartialHandoff(storage, record)).toBe(true);
  expect(JSON.parse([...records.values()][0]).omitted).toEqual(record.omitted);
  expect(reservePartialHandoff(storage, record)).toBe(false);
  expect(reservePartialHandoff(storage, { ...record, subsetDigest: "d".repeat(64), selected: [{ student: "Other", files: ["different.txt"] }] })).toBe(true);
  expect(reservePartialHandoff(storage, { ...record, subsetDigest: "e".repeat(64), selected: [{ student: "Other", files: ["work.txt", "new.txt"] }] })).toBe(false);
  expect(reservePartialHandoff(storage, { ...record, subsetDigest: "f".repeat(64), selected: [{ student: " sTuDeNt ", files: ["another.txt"] }] })).toBe(false);
  expect(settlePartialHandoff(storage, record.account, record.sourceDigest, "c".repeat(64), "accepted")).toBe(false);
  expect(settlePartialHandoff(storage, record.account, record.sourceDigest, record.subsetDigest, "unknown")).toBe(true);
  expect(reservePartialHandoff(storage, record)).toBe(false);
  expect(reservePartialHandoff(storage, { ...record, account: "account-b" })).toBe(true);
});
