"use client";
import { useEffect, useState } from "react";
import { Accordion, AccordionDetails, AccordionSummary } from "@mui/material";
import type { RecoverableGroup } from "@/lib/grade/large-zip-subset";
import { listPartialHandoffs, type PartialHandoffRecord } from "./partialHandoffLedger";

export function usePartialHandoffRecords(account: string | undefined) {
  const [omissions, setOmissions] = useState<readonly RecoverableGroup[]>([]), [records, setRecords] = useState<readonly PartialHandoffRecord[]>([]);
  useEffect(() => { let active = true; queueMicrotask(() => { if (!active) return; try { setRecords(account ? listPartialHandoffs(localStorage, account) : []); } catch { setRecords([]); } }); return () => { active = false; }; }, [account]);
  return { omissions, setOmissions, records, setRecords };
}

export function PartialHandoffNotice({ omissions, records }: { omissions: readonly RecoverableGroup[]; records: readonly PartialHandoffRecord[] }) {
  const omittedCount = records.reduce((count, record) => count + record.omitted.length, 0);
  const statuses = (["pending", "accepted", "refused", "unknown"] as const)
    .map((status) => ({ status, count: records.filter((record) => record.status === status).length }))
    .filter(({ count }) => count > 0).map(({ status, count }) => `${count} ${status}`).join(", ");
  return <>
    {records.length === 50 && <p role="status">Only the latest 50 saved partial intake records are displayed. Older records remain saved.</p>}
    {records.length > 0 && <Accordion disableGutters elevation={0}>
      <AccordionSummary expandIcon={<span aria-hidden="true">+</span>}>
        <span role="status">{`${records.length} prior partial archive ${records.length === 1 ? "record" : "records"} (${statuses}); ${omittedCount} omitted group ${omittedCount === 1 ? "entry" : "entries"} across records. Earlier attempts remain saved.`}</span>
      </AccordionSummary>
      <AccordionDetails>
        {records.map((record) => <p key={`${record.sourceDigest}:${record.subsetDigest}:${record.attemptId ?? "legacy"}`}>Prior partial archive ({record.status}; source {record.sourceDigest.slice(0, 12)}): omitted {record.omitted.map((group) => `${group.student} (${group.reason}): ${group.files.join(", ")}`).join("; ") || "none"}.</p>)}
      </AccordionDetails>
    </Accordion>}
    {omissions.length > 0 && <Accordion disableGutters elevation={0}>
      <AccordionSummary expandIcon={<span aria-hidden="true">+</span>}>
        <span role="status">{`Partial archive: ${omissions.length} ${omissions.length === 1 ? "group" : "groups"} not queued`}</span>
      </AccordionSummary>
      <AccordionDetails>{omissions.map((group, index) => <p key={`${group.sourceIdentifier}:${index}`}>{`${group.label} (${group.reason ?? "not selected"}): ${group.members.map((member) => member.path).join(", ")}`}</p>)}</AccordionDetails>
    </Accordion>}
  </>;
}
