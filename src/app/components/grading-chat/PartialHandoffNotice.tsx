"use client";
import { useEffect, useState } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Stack, Typography } from "@mui/material";
import type { RecoverableGroup } from "@/lib/grade/large-zip-subset";
import { listPartialHandoffs, type PartialHandoffRecord } from "./partialHandoffLedger";
import type { SupabaseAuthObserver } from "@/context/supabase-auth-observer";
import { StoredIndexActions } from "./StoredIndexActions";

export function usePartialHandoffRecords(account: string | undefined) {
  const [omissions, setOmissions] = useState<readonly RecoverableGroup[]>([]), [records, setRecords] = useState<readonly PartialHandoffRecord[]>([]);
  useEffect(() => { let active = true; queueMicrotask(() => { if (!active) return; try { setRecords(account ? listPartialHandoffs(localStorage, account) : []); } catch { setRecords([]); } }); return () => { active = false; }; }, [account]);
  return { omissions, setOmissions, records, setRecords };
}

export function PartialHandoffNotice({ omissions, records, observer }: { omissions: readonly RecoverableGroup[]; records: readonly PartialHandoffRecord[]; observer: SupabaseAuthObserver }) {
  const omittedCount = records.reduce((count, record) => count + record.omitted.length, 0);
  const statuses = (["pending", "accepted", "refused", "unknown"] as const)
    .map((status) => ({ status, count: records.filter((record) => record.status === status).length }))
    .filter(({ count }) => count > 0).map(({ status, count }) => `${count} ${status}`).join(", ");
  return <>
    {records.length === 50 && <Typography role="status">Only the latest 50 saved partial intake records are displayed. Older records remain saved.</Typography>}
    {records.length > 0 && <Accordion disableGutters elevation={0}>
      <AccordionSummary expandIcon={<Typography component="span" aria-hidden="true">+</Typography>}>
        <Typography component="span" role="status">{`${records.length} prior partial archive ${records.length === 1 ? "record" : "records"} (${statuses}); ${omittedCount} omitted group ${omittedCount === 1 ? "entry" : "entries"} across records. Earlier attempts remain saved.`}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {records.map((record) => <Stack key={`${record.sourceDigest}:${record.subsetDigest}:${record.attemptId ?? "legacy"}`}><Typography>Prior partial archive ({record.status}; source {record.sourceDigest.slice(0, 12)}): omitted {record.omitted.map((group) => `${group.student} (${group.reason}): ${group.files.join(", ")}`).join("; ") || "none"}. {record.indexDigest ? `Original index reference ${record.indexDigest.slice(0, 12)}; availability depends on browser storage. ` : ""}{record.pendingAtHandoff?.length ? `Later batches at this handoff: ${record.pendingAtHandoff.map((group) => `${group.student}: ${group.files.join(", ")}`).join("; ")}. Check later records for their outcomes.` : ""}</Typography>{record.indexDigest && <StoredIndexActions observer={observer} account={record.account} sourceDigest={record.sourceDigest} />}</Stack>)}
      </AccordionDetails>
    </Accordion>}
    {omissions.length > 0 && <Accordion disableGutters elevation={0}>
      <AccordionSummary expandIcon={<Typography component="span" aria-hidden="true">+</Typography>}>
        <Typography component="span" role="status">{`Partial archive: ${omissions.length} ${omissions.length === 1 ? "group" : "groups"} not queued`}</Typography>
      </AccordionSummary>
      <AccordionDetails>{omissions.map((group, index) => <Typography key={`${group.sourceIdentifier}:${index}`}>{`${group.label} (${group.reason ?? "not selected"}): ${group.members.map((member) => member.path).join(", ")}`}</Typography>)}</AccordionDetails>
    </Accordion>}
  </>;
}
