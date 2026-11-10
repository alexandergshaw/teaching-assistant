"use client";
import { useState } from "react";
import { Button, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import { savedChatEdits, savedLegacyChatEdits } from "./chatEditScope";

export function ChatEditRecovery({ account }: { account: string | undefined }) {
  const [sharedOpen, setSharedOpen] = useState(false);
  const [scopedOpen, setScopedOpen] = useState(false);
  function download(shared: boolean) {
    try {
      const records = shared ? savedLegacyChatEdits(localStorage) : savedChatEdits(localStorage, account ?? "");
      const url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = shared ? "grading-chat-older-shared-edits.json" : "grading-chat-saved-edits.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setSharedOpen(false);
      setScopedOpen(false);
    } catch { window.alert("Saved edits could not be exported from this browser."); }
  }
  return <>
    {account && <Button variant="text" size="small" onClick={() => setScopedOpen(true)}>Export saved Chat edits</Button>}
    <Dialog open={scopedOpen} onClose={() => setScopedOpen(false)} aria-labelledby="scoped-export-title">
      <DialogTitle id="scoped-export-title">Export saved Chat edits</DialogTitle>
      <DialogContent>The download contains saved edits for this account and may include student names, feedback, and source URLs. Malformed records are included as raw text.</DialogContent>
      <DialogActions><Button onClick={() => setScopedOpen(false)}>Cancel</Button><Button onClick={() => download(false)}>Download edits</Button></DialogActions>
    </Dialog>
    <Button variant="text" size="small" onClick={() => setSharedOpen(true)}>Recover older shared edits</Button>
    <Dialog open={sharedOpen} onClose={() => setSharedOpen(false)} aria-labelledby="legacy-export-title">
      <DialogTitle id="legacy-export-title">Recover older shared edits</DialogTitle>
      <DialogContent>Older edits and edits made while signed out were shared by everyone using this browser and cannot be assigned to an account. The download may include student names, feedback, and source URLs from other users. Malformed records are included as raw text.</DialogContent>
      <DialogActions><Button onClick={() => setSharedOpen(false)}>Cancel</Button><Button onClick={() => download(true)}>Download shared edits</Button></DialogActions>
    </Dialog>
  </>;
}
