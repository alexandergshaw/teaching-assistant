"use client";
import { useRef, useState } from "react";
import { Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import { type AnnouncementLibraryController, type LibraryState, importAnnouncementLibraryFiles } from "./announcement-library-controller";
import { useAnnouncementLibraryDeparture } from "./useAnnouncementLibrary";
import type { TemplateChoice } from "./announcement-draft-slots";
export default function AnnouncementLibrary({ controller, state, enabled, canAddDraft, addDraft, onRemoved }: {
  controller: AnnouncementLibraryController; state: LibraryState; enabled: boolean; canAddDraft: boolean;
  addDraft: (choice: TemplateChoice) => void; onRemoved: (id: string) => void;
}) {
  const departure = useAnnouncementLibraryDeparture(controller);
  const addButton = useRef<HTMLButtonElement>(null);
  const bodyInputs = useRef(new Map<string, HTMLTextAreaElement>());
  const [armed, setArmed] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  function add() { const id = controller.add(); requestAnimationFrame(() => { if (id) bodyInputs.current.get(id)?.focus(); }); }
  async function importFiles(files: FileList | null) {
    const result = await importAnnouncementLibraryFiles(controller, Array.from(files ?? []));
    if (!controller.isDisposed()) setImportErrors(result.errors);
  }

  async function remove(id: string) {
    if (await controller.remove(id)) { onRemoved(id); setArmed(null); addButton.current?.focus(); }
  }
  return <fieldset className={controls.section}>
    <legend className={controls.sectionLegend}>Announcement templates</legend>
    <Dialog open={departure.confirming} onClose={departure.stay} aria-labelledby="announcement-library-departure-title">
      <DialogTitle id="announcement-library-departure-title">Leave unsaved announcements?</DialogTitle>
      <DialogContent>Unsaved or unconfirmed changes may be lost. Stay to save or retry, or discard your local changes.</DialogContent>
      <DialogActions><Button onClick={departure.stay}>Stay</Button><Button onClick={departure.discard}>Discard changes</Button></DialogActions>
    </Dialog>
    <p>Paste a previous announcement into each template slot. Each slot saves automatically. Choose its label under Format to match in the drafts below.</p>
    <p>Each announcement: at most 16,000 characters and 32 KiB of text. Labels: at most 120 characters.</p>
    {!enabled ? <p>Select a course and sign in to edit its library.</p> : <>
      <div role="status" aria-live="polite">
        {state.load === "loading" && "Loading announcements..."}
        {state.load === "loaded" && state.cards.length === 0 && "No templates saved yet. Add a template slot to get started."}
        {state.load === "failed" && "Could not load announcements."}
        {state.load === "timedout" && "Loading is taking longer than expected."}
      </div>
      {(state.load === "failed" || state.load === "timedout") && <Button size="small" variant="outlined" type="button" onClick={() => void controller.load()}>Retry loading announcements</Button>}
      <Button size="small" variant="outlined" type="button" ref={addButton} onClick={add}>Add template slot</Button>
      <label>Import TXT or MD files <input type="file" accept=".txt,.md,text/plain,text/markdown" multiple onChange={e => { void importFiles(e.target.files); e.target.value = ""; }} /></label>
      {importErrors.map((error, index) => <p role="alert" key={index}>{error}</p>)}
      {state.cards.map((card, index) => <section className={`${styles.card} ${styles.form}`} key={card.id} aria-label={`Announcement ${index + 1}`}>
        <TextField fullWidth size="small" id={`library-label-${card.id}`} label={`Template ${index + 1} label`}
          value={card.label} disabled={card.deleting} onChange={e => controller.edit(card.id, "label", e.target.value)} />
        <TextField fullWidth size="small" multiline minRows={6} id={`library-body-${card.id}`} label={`Template ${index + 1} text`}
          value={card.exemplarText} disabled={card.deleting}
          inputRef={(node: HTMLTextAreaElement | null) => { if (node) bodyInputs.current.set(card.id, node); else bodyInputs.current.delete(card.id); }}
          onChange={e => controller.edit(card.id, "exemplarText", e.target.value)} />
        <p role="status" aria-live="polite">{card.deleting ? "Removing..." : card.status}</p>
        {card.error && <p role="alert">{card.error}</p>}
        {card.status === "Could not save" && <Button size="small" variant="outlined" type="button" disabled={card.deleting} onClick={() => void controller.retry(card.id)}>Retry saving announcement {index + 1}</Button>}
        <Button size="small" variant="outlined" type="button" aria-label={`Add a draft from this announcement ${index + 1}`} disabled={!canAddDraft || card.status !== "Saved" || card.deleting} onClick={() => {
          const entry = card.acknowledged; if (entry) addDraft({ kind: "saved", exemplarId: entry.id, label: entry.label || "Untitled announcement", outline: entry.outline });
        }}>Add a draft from this</Button>
        {armed === card.id ? <>
          <p>Remove this announcement from your saved library?</p>
          <Button size="small" variant="outlined" type="button" disabled={card.deleting} onClick={() => void remove(card.id)}>Confirm remove announcement {index + 1}</Button>
          <Button size="small" variant="outlined" type="button" disabled={card.deleting} onClick={() => setArmed(null)}>Cancel removal</Button>
        </> : <Button size="small" variant="outlined" type="button" disabled={card.deleting} onClick={() => setArmed(card.id)}>Remove announcement {index + 1}</Button>}
      </section>)}
    </>}
  </fieldset>;
}
