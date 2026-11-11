"use client";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Stack } from "@mui/material";
import type { SupabaseAuthObserver } from "@/context/supabase-auth-observer";
import { createSingleZipBrowserAuthority } from "@/lib/grade/single-zip-browser-authority";
import { deleteStoredBrightspaceIndex, readStoredBrightspaceIndex } from "@/lib/grade/brightspace-index-store";

export function StoredIndexActions({ observer, account, sourceDigest }: { observer: SupabaseAuthObserver; account: string; sourceDigest: string }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const run = async (action: "download" | "delete") => {
    if (busy) return; setBusy(true); setMessage(""); const token = generation.current, authority = createSingleZipBrowserAuthority(observer);
    try {
      const lease = await authority.admit(); if (token !== generation.current || !lease || authority.resolve(lease) !== account) throw new Error("The owner session could not be verified.");
      const access = { authority, lease };
      if (action === "delete") { await deleteStoredBrightspaceIndex(access, sourceDigest); setMessage("The locally stored index was deleted."); return; }
      const bytes = await readStoredBrightspaceIndex(access, sourceDigest); if (token !== generation.current) return; if (!bytes) { setMessage("The original index is not available in this browser."); return; }
      const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: "text/plain" }));
      const link = document.createElement("a"); link.href = url; link.download = "brightspace-index.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { if (token === generation.current) setMessage("The original index could not be accessed for this session."); }
    finally { authority.close(); if (token === generation.current) setBusy(false); }
  };
  return <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}><Button disabled={busy} onClick={() => void run("download")}>Download original index</Button><Button disabled={busy} onClick={() => void run("delete")}>Delete local index</Button>{message && <Alert severity="info" role="status">{message}</Alert>}</Stack>;
}
