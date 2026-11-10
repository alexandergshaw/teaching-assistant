"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { compareZipCandidates } from "@/lib/grade/zip-duplicate-candidate";

/** Keep comparisons and file references in this mounted account session only. */
export function useZipDuplicateReview(ownerId: string | undefined) {
  const owner = useRef(ownerId);
  const history = useRef<File[]>([]), overflow = useRef(false), unknownHistory = useRef(false), pending = useRef<((approved: boolean) => void) | null>(null), checking = useRef(false), generation = useRef(0), mounted = useRef(false);
  const [open, setOpen] = useState(false), [openedFor, setOpenedFor] = useState(ownerId), [incomplete, setIncomplete] = useState(false), [possibleDuplicate, setPossibleDuplicate] = useState(false);
  useLayoutEffect(() => { if (owner.current !== ownerId) { generation.current++; history.current = []; overflow.current = false; unknownHistory.current = false; const done = pending.current; pending.current = null; done?.(false); } owner.current = ownerId; }, [ownerId]);
  const decide = (approved: boolean) => { const done = pending.current; pending.current = null; setOpen(false); done?.(approved); };
  useEffect(() => {
    mounted.current = true; history.current = []; overflow.current = false; unknownHistory.current = false;
    return () => { mounted.current = false; const done = pending.current; pending.current = null; done?.(false); history.current = []; overflow.current = false; unknownHistory.current = false; };
  }, [ownerId]);
  const check = async (files: readonly File[], current: () => boolean, uninspectableSource = false) => {
    const zips = files.filter((file) => /\.zip$/i.test(file.name));
    if (!zips.length && !uninspectableSource) return current();
    if (checking.current) return false;
    const account = owner.current, accountGeneration = generation.current;
    checking.current = true;
    try {
      const comparison = zips.length ? await compareZipCandidates(zips, history.current) : { possibleDuplicate: false, incomplete: false };
      if (!current() || owner.current !== account || generation.current !== accountGeneration) return false;
      const uncertain = comparison.incomplete || overflow.current || unknownHistory.current || uninspectableSource;
      setIncomplete(uncertain); setPossibleDuplicate(comparison.possibleDuplicate);
      if (!comparison.possibleDuplicate && !uncertain) return true;
      const approved = await new Promise<boolean>((resolve) => { pending.current = resolve; setOpenedFor(account); setOpen(true); });
      return approved && current() && owner.current === account && generation.current === accountGeneration;
    } finally { checking.current = false; if (mounted.current && pending.current === null) setOpen(false); }
  };
  const remember = (files: readonly File[]) => { const next = [...history.current, ...files.filter((file) => /\.zip$/i.test(file.name))]; if (next.length > 40) overflow.current = true; history.current = next.slice(-40); };
  return { check, remember, noteUnknown: () => setIncomplete(true), rememberUnknown: () => { unknownHistory.current = true; }, capture: () => generation.current, owns: (account: string | undefined, token: number) => owner.current === account && generation.current === token, cancel: () => decide(false), view: <>
    <Typography variant="body2">Possible duplicate ZIP checks cover recent submissions in this browser tab and reset when it reloads.</Typography>
    {incomplete && <Alert severity="warning">URL-based sources and some ZIP archives cannot be compared for possible duplicates. Check earlier results before grading them again.</Alert>}
    <Dialog open={open && openedFor === ownerId} onClose={() => decide(false)} aria-labelledby="possible-duplicate-zip-title">
      <DialogTitle id="possible-duplicate-zip-title">{possibleDuplicate ? "Possible duplicate ZIP archives" : "ZIP comparison needs review"}</DialogTitle>
      <DialogContent>{possibleDuplicate ? "These archives list matching member names, sizes, and checksums in their metadata. The file contents have not been compared, so this is not proof they are identical. " : "This source or some earlier submissions could not be compared for duplicate ZIP contents. "}Checks cover only recent submissions held in this browser tab and reset when it reloads. Check earlier results and the files before grading again.</DialogContent>
      <DialogActions><Button onClick={() => decide(false)}>Keep for later</Button><Button onClick={() => decide(true)}>I checked; grade anyway</Button></DialogActions>
    </Dialog>
  </> };
}
