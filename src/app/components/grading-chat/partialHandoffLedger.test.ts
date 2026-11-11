import { expect, it } from "vitest";
import { reservePartialHandoff, settlePartialHandoff, listPartialHandoffs, type LedgerStorage, type PartialHandoffRecord } from "./partialHandoffLedger";

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
it("keeps explicit repeat submissions in separate records without replacing an uncertain earlier attempt", () => {
 const records = new Map<string,string>(); const storage: LedgerStorage = { get length(){return records.size},key:(i)=>[...records.keys()][i]??null,getItem:(k)=>records.get(k)??null,setItem:(k,v)=>{records.set(k,v)} };
 const base: PartialHandoffRecord = {account:"owner",sourceDigest:"a".repeat(64),subsetDigest:"b".repeat(64),selected:[{student:"Student",files:["work.txt"]}],omitted:[],status:"pending"};
 const first={...base,attemptId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},second={...base,attemptId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"};
 expect(reservePartialHandoff(storage,first)).toBe(true);expect(settlePartialHandoff(storage,first.account,first.sourceDigest,first.subsetDigest,"unknown",first.attemptId)).toBe(true);expect(reservePartialHandoff(storage,second)).toBe(true);expect(reservePartialHandoff(storage,second)).toBe(false);expect(settlePartialHandoff(storage,second.account,second.sourceDigest,second.subsetDigest,"accepted",second.attemptId)).toBe(true);expect([...records.values()].map((v)=>JSON.parse(v).status)).toEqual(["unknown","accepted"]);
});
it("shows the newest retained attempt when the display limit is reached", () => {
 const records=new Map<string,string>();const storage={get length(){return records.size},key:(i:number)=>[...records.keys()][i]??null,getItem:(k:string)=>records.get(k)??null,setItem:(k:string,v:string)=>{records.set(k,v)}};
 for(let i=0;i<55;i++){const attemptId=`00000000-0000-4000-8000-${i.toString().padStart(12,"0")}`;expect(reservePartialHandoff(storage,{account:"owner",sourceDigest:"a".repeat(64),subsetDigest:"b".repeat(64),attemptId,selected:[{student:"Student",files:["work.txt"]}],omitted:[],status:"pending"})).toBe(true)}
 const list=listPartialHandoffs(storage as Storage,"owner");expect(list).toHaveLength(50);expect(list[0].attemptId).toBe("00000000-0000-4000-8000-000000000054");
});
