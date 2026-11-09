"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { fillRoleAwarePowerPointAction } from "@/app/actions/powerpoint-role-fill";
import { getPowerPointTemplateLibraryAction } from "@/app/actions/powerpoint-template-library";
import { SLIDE_ROLES, type SlideRole } from "@/lib/powerpoint-template-library/types";
import type { PptxSlide } from "@/lib/pptx";
import { useSupabase } from "@/context/SupabaseProvider";
import { ROLE_LIBRARY_CHANGED, SELECTED_ROLE_LIBRARY_KEY } from "../powerpoint-templates/panel-logic";

function subscribeSelection(callback: () => void) {
  const storage = (event: StorageEvent) => { if (!event.key || event.key === SELECTED_ROLE_LIBRARY_KEY) callback(); };
  window.addEventListener("storage", storage);
  window.addEventListener(ROLE_LIBRARY_CHANGED, callback);
  return () => { window.removeEventListener("storage", storage); window.removeEventListener(ROLE_LIBRARY_CHANGED, callback); };
}
function selectionSnapshot() {
  try { return localStorage.getItem(SELECTED_ROLE_LIBRARY_KEY) ?? ""; } catch { return ""; }
}
function serverSelectionSnapshot() { return ""; }

export default function RoleAwareTemplateFill({ sourceFileId, title, slides, disabled, onStart, onEnd }: {
  sourceFileId: string; title: string; slides: readonly PptxSlide[]; disabled?: boolean; onStart: () => boolean; onEnd: () => void;
}) {
  const { user, loading } = useSupabase();
  if (loading || !user || !sourceFileId) return null;
  return <VerifyLibrary key={`${user.id}:${sourceFileId}`} sourceFileId={sourceFileId} title={title} slides={slides} disabled={disabled} onStart={onStart} onEnd={onEnd} />;
}

function VerifyLibrary({ sourceFileId, title, slides, disabled, onStart, onEnd }: { sourceFileId: string; title: string; slides: readonly PptxSlide[]; disabled?: boolean; onStart: () => boolean; onEnd: () => void }) {
  const selected = useSyncExternalStore(subscribeSelection, selectionSnapshot, serverSelectionSnapshot);
  const [library, setLibrary] = useState<{ id: string; name: string; selected: string } | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const choice: unknown = selected ? JSON.parse(selected) : null;
        if (!choice || typeof choice !== "object") return;
        const saved = choice as { libraryId?: unknown; sourceFileId?: unknown };
        if (typeof saved.libraryId !== "string" || saved.sourceFileId !== sourceFileId) return;
        const result = await getPowerPointTemplateLibraryAction(saved.libraryId);
        if (active && "library" in result && result.library.sourceFileId === sourceFileId) setLibrary({ id: result.library.id, name: result.library.name, selected });
      } catch { /* No verified library selection is available. */ }
    })();
    return () => { active = false; };
  }, [sourceFileId, selected]);
  if (!library || library.selected !== selected) return null;
  return <RoleSelector key={JSON.stringify({ selected, sourceFileId, title, slides })} libraryId={library.id} libraryName={library.name} selection={selected} sourceFileId={sourceFileId} title={title} slides={slides} disabled={disabled} onStart={onStart} onEnd={onEnd} />;
}

/** Remount when deck content or library identity changes to discard old role choices. */
function RoleSelector({ libraryId, libraryName, selection, sourceFileId, title, slides, disabled, onStart, onEnd }: {
  libraryName: string; selection: string; disabled?: boolean; onStart: () => boolean; onEnd: () => void;
  libraryId: string; sourceFileId: string; title: string; slides: readonly PptxSlide[];
}) {
  const [roles, setRoles] = useState<Array<SlideRole | "">>(() => slides.map(() => ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const alive = useRef(true);
  const revision = useRef(0);
  const [initialSignature] = useState(() => JSON.stringify({ libraryId, sourceFileId, title, slides }));
  const currentSignature = JSON.stringify({ libraryId, sourceFileId, title, slides });
  const stale = initialSignature !== currentSignature;
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; if (lock.current) onEnd(); }; }, [onEnd]);
  useEffect(() => { if (initialSignature !== currentSignature) revision.current++; }, [initialSignature, currentSignature]);
  async function download() {
    if (disabled || lock.current || stale || roles.length !== slides.length || roles.some((role) => !role) || !onStart()) return;
    lock.current = true; setBusy(true); setError(""); const started = revision.current;
    try {
      const result = await fillRoleAwarePowerPointAction(libraryId, sourceFileId, { presentationTitle: title, slides: slides.map((slide, index) => ({ ...slide, role: roles[index] })) });
      if (!alive.current || started !== revision.current || selectionSnapshot() !== selection) return;
      if ("error" in result) { setError(result.error); return; }
      const bytes = Uint8Array.from(atob(result.base64), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }));
      try { const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${result.name}.pptx`; anchor.click(); }
      finally { URL.revokeObjectURL(url); }
    } catch { if (alive.current && started === revision.current && selectionSnapshot() === selection) setError("Could not prepare the role-aware PowerPoint. Try again."); }
    finally { lock.current = false; if (alive.current) { onEnd(); setBusy(false); } }
  }
  return <Stack spacing={1}>
    <Typography variant="h6">Match slides by role: {libraryName}</Typography>
    <Typography variant="body2">Choose a role for every generated slide. Each must match one unused source slide with exactly the needed editable text slots. No slides are added or removed.</Typography>
    <Alert severity="info">Each matched slide&apos;s editable text is replaced in source order, including any labels, footers or attribution. Original template graphics, notes and other non-text content remain in the exported file. This option refuses generated slides with notes, code or graphics because it cannot preserve them. Review the finished deck before sharing.</Alert>
    {stale && <Alert severity="warning">The deck or template changed. Reopen role matching to review it again.</Alert>}
    {slides.map((slide, index) => <TextField key={index} select size="small" label={`Role for slide ${index + 1}: ${slide.title}`} value={roles[index] ?? ""} disabled={disabled || busy || stale} onChange={(event) => setRoles((previous) => previous.map((role, i) => i === index ? event.target.value as SlideRole : role))}>
      <MenuItem value="">Choose a role</MenuItem>{SLIDE_ROLES.map((role) => <MenuItem key={role} value={role}>{role}</MenuItem>)}
    </TextField>)}
    {error && <Alert severity="error">{error}</Alert>}
    <Button variant="outlined" onClick={() => void download()} disabled={disabled || busy || stale || !slides.length || roles.some((role) => !role)}>{busy ? "Preparing..." : "Download with matched roles"}</Button>
  </Stack>;
}
