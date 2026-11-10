"use client";
import { useEffect, useState } from "react";
import type { RecoverableGroup } from "@/lib/grade/large-zip-subset";
import { listPartialHandoffs, type PartialHandoffRecord } from "./partialHandoffLedger";

export function usePartialHandoffRecords(account: string | undefined) {
  const [omissions, setOmissions] = useState<readonly RecoverableGroup[]>([]), [records, setRecords] = useState<readonly PartialHandoffRecord[]>([]);
  useEffect(() => { let active = true; queueMicrotask(() => { if (!active) return; try { setRecords(account ? listPartialHandoffs(localStorage, account) : []); } catch { setRecords([]); } }); return () => { active = false; }; }, [account]);
  return { omissions, setOmissions, records, setRecords };
}

export function PartialHandoffNotice({ omissions, records }: { omissions: readonly RecoverableGroup[]; records: readonly PartialHandoffRecord[] }) {
  return <>
    {records.length === 50 && <p role="status">Only the first 50 saved partial intake records are displayed. Earlier records still block overlapping submissions.</p>}
    {records.map((record) => <p key={`${record.sourceDigest}:${record.subsetDigest}`} role="status">Prior partial archive ({record.status}; source {record.sourceDigest.slice(0, 12)}): omitted {record.omitted.map((group) => `${group.student} (${group.reason}): ${group.files.join(", ")}`).join("; ") || "none"}. Check earlier results before retrying.</p>)}
    {omissions.length > 0 && <p role="status">Partial archive, not queued: {omissions.map((group) => `${group.label} (${group.reason ?? "not selected"}): ${group.members.map((member) => member.path).join(", ")}`).join("; ")}</p>}
  </>;
}
