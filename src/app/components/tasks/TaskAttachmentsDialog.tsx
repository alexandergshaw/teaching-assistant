"use client";

// The single, tab-level dialog for "attach files as notes for each cell"
// (docs/task-cell-attachments-acceptance-criteria.md AC5). Rendered exactly
// once by TasksTab.tsx (item 23) - never one per cell, never inside a
// `<td>` - matching MUI Dialog's use in this same directory's own
// ManageTasksDialog.tsx: the focus trap, the inert background and the
// scroll lock a hand-rolled overlay would not bring.
//
// This component owns every byte-moving decision the acceptance criteria
// assign to it and nothing more: the upload/delete ORDERING and the size
// cap both live in the tested pure module (src/lib/course-task-
// attachments.ts's uploadTaskAttachment/deleteTaskAttachment) and are never
// re-implemented here (AC2 items 11-12); only the PER-CELL COUNT cap is
// enforced in this file, because only this file (via its own local copy of
// the cell's attachment list) knows how many are already loaded.
import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import { useSupabase } from "@/context/SupabaseProvider";
import {
  uploadTaskAttachment,
  deleteTaskAttachment,
  MAX_ATTACHMENTS_PER_CELL,
  taskAttachmentCountCapMessage,
  type TaskAttachment,
  type TaskAttachmentStorageClient,
  type RecordTaskAttachmentRow,
  type DeleteTaskAttachmentRow,
} from "@/lib/course-task-attachments";
import { createTaskAttachmentAction, deleteTaskAttachmentAction } from "@/app/actions/course-task-attachments";
import { terminated } from "@/lib/course-tasks-view";
import { formatBytes } from "../content-tab/utils";
import styles from "./taskAttachments.module.css";

// AC2 item 7: the EXISTING private "course-files" bucket - no new bucket,
// no storage migration. Matches src/lib/course-files.ts's own literal.
const ATTACHMENTS_BUCKET = "course-files";

// AC5 item 30: a signed URL is valid for one hour, matching
// src/lib/course-files.ts's getCourseZipUrl - long enough to cover a slow
// connection's fetch without leaving an unreasonably long-lived link.
const SIGNED_URL_TTL_SECONDS = 3600;

// Accessibility review fix 1: the visible/announced status region's tone -
// "error" only changes its COLOR (styles.attachmentsStatus[data-tone]); it
// is still the exact same single role="status" node either way, still
// polite, never assertive.
type StatusTone = "info" | "error";

// Accessibility review fix 2: what to focus once a removed row's own
// button has actually left the DOM - resolved BEFORE the removal (while
// the current order is still known) and committed from a layout effect
// once the DOM has caught up, mirroring TasksGrid.tsx's own
// pendingFocusRef/pendingReorderFocusRef idiom for the identical "the
// focused element is about to disappear" problem.
type PendingFocusTarget = { kind: "row"; id: string } | { kind: "chooseFiles" };

export interface TaskAttachmentsDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Accessibility review fix 6: fires once the Dialog's own EXIT transition
   * has fully finished (MUI's Fade `onExited`, chained through
   * `slotProps.transition` - see node_modules/@mui/material/Modal/
   * useModal.js's getTransitionProps, which composes this with the
   * component's own internal `handleExited`). `disableRestoreFocus` below
   * turns off MUI's own internal restore-focus-on-close entirely (it would
   * otherwise fire synchronously the instant `open` flips to false, mid
   * exit-transition, racing whatever the caller's own onClose handler does
   * in the same tick) - so this callback, which only ever fires after the
   * trap is fully gone, is the ONE deliberate place focus gets moved back
   * to the grid. See TasksTab.tsx's handleAttachmentsExited.
   */
  onExited?: () => void;
  courseId: string;
  courseName: string;
  taskId: string;
  taskLabel: string;
  /**
   * This cell's attachments, already loaded once per Tasks tab mount (AC4
   * item 18) and resolved by the caller via taskAttachmentsAt. Copied into
   * this component's own local state on open (the same "resync on open"
   * pattern TaskCell.tsx's note/instruction drafts already use) so every
   * upload/remove below can update the visible list immediately, without
   * waiting on a full tab reload - see onChanged below for how the shared
   * index catches up afterwards.
   */
  attachments: TaskAttachment[];
  /**
   * Fired after every successful upload or removal, so the caller can
   * refresh the shared attachment index (useCourseTasksData's `reload`) and
   * keep the grid's own corner mark and count in sync with what this
   * dialog just did.
   */
  onChanged: () => void;
}

export default function TaskAttachmentsDialog({
  open,
  onClose,
  onExited,
  courseId,
  courseName,
  taskId,
  taskLabel,
  attachments,
  onChanged,
}: TaskAttachmentsDialogProps) {
  const { supabase, user } = useSupabase();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chooseFilesButtonRef = useRef<HTMLButtonElement | null>(null);
  const rowButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const pendingFocusRef = useRef<PendingFocusTarget | null>(null);
  const dragDepthRef = useRef(0);

  const registerRowButtonRef = (id: string, el: HTMLButtonElement | null) => {
    if (el) rowButtonRefs.current.set(id, el);
    else rowButtonRefs.current.delete(id);
  };

  // Accessibility review fix 2: commits the focus target `pendingFocusRef`
  // was armed with (by handleRemove, below) once the DOM has actually
  // caught up with a row's removal - no dependency array, cleared
  // unconditionally before the lookup, matching TasksGrid.tsx's own two
  // analogous effects exactly.
  useLayoutEffect(() => {
    const target = pendingFocusRef.current;
    pendingFocusRef.current = null;
    if (!target) return;
    if (target.kind === "chooseFiles") {
      chooseFilesButtonRef.current?.focus();
      return;
    }
    rowButtonRefs.current.get(target.id)?.focus();
  });

  // course-task-attachments.ts's TaskAttachmentStorageClient interface is
  // deliberately WIDER than the real Supabase storage API (it also accepts
  // a bare `{ name }` object, purely so that module's own tests can feed a
  // fake without constructing a real Blob/File - see its doc comment), so
  // the real bucket cannot be passed to uploadTaskAttachment/
  // deleteTaskAttachment directly: TypeScript correctly rejects it, since a
  // real File is all this dialog ever uploads. This thin adapter narrows
  // back down to exactly the two calls this feature makes, matching the
  // ordering/rollback contract without re-implementing it.
  const storageAdapter: TaskAttachmentStorageClient = {
    async upload(path, file, options) {
      const { error } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .upload(path, file as Blob, { contentType: options?.contentType ?? undefined, upsert: options?.upsert });
      return { error };
    },
    async remove(paths) {
      const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove(paths);
      return { error };
    },
  };

  const [localAttachments, setLocalAttachments] = useState<TaskAttachment[]>(attachments);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState<StatusTone>("info");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Resyncs the local list, the status region and the pending remove-
  // confirmation every time the dialog transitions closed -> open - the
  // "adjusting state during rendering" pattern React's own docs recommend
  // (https://react.dev/learn/you-might-not-need-an-effect), matching
  // TaskCell.tsx's note/instruction draft resync exactly, rather than a
  // useEffect that calls setState synchronously (which this repo's lint
  // config forbids).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setLocalAttachments(attachments);
      setStatusMessage("");
      setStatusTone("info");
      setConfirmRemoveId(null);
      // Defensive: a dialog closed mid-operation (e.g. the Escape path)
      // must never carry a stale busy/drag state into its next open. The
      // ref mutation happens INSIDE the setState updater (this repo's own
      // hubCache idiom, useCourseTasksData.ts) rather than as a bare
      // statement here - eslint's react-hooks/refs rule forbids touching a
      // ref directly in the render body.
      setBusy(() => {
        busyRef.current = false;
        return false;
      });
      setDragActive(() => {
        dragDepthRef.current = 0;
        return false;
      });
    }
  }

  const recordRow: RecordTaskAttachmentRow = async (attachment) => {
    const result = await createTaskAttachmentAction({
      id: attachment.id,
      courseId: attachment.courseId,
      taskId: attachment.taskId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      storagePath: attachment.storagePath,
    });
    if ("error" in result) return { ok: false, error: result.error };
    return { ok: true };
  };

  // AC2 items 11-12: the size cap and the upload/rollback ordering both
  // live inside uploadTaskAttachment itself - this function only enforces
  // the PER-CELL count cap (MAX_ATTACHMENTS_PER_CELL), which the pure
  // module deliberately does not know how to check on its own, and only
  // this dialog's own local list can answer.
  //
  // AC5 item 28: the input is `multiple`, so several files at once is the
  // normal case, and the single status region can only ever hold one
  // message. Outcomes are therefore accumulated through the loop and
  // announced as ONE summary at the end, rather than overwritten per file -
  // a per-file setStatusMessage inside the loop would let a later file's
  // success or failure erase an earlier file's failure, which is exactly
  // the bug this function used to have.
  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    // Accessibility review fix 2: a re-entry GUARD (ref, checked before any
    // state changes) rather than a `disabled` attribute on the control the
    // user just activated - disabling a focused control drops focus to
    // <body>, which MUI's FocusTrap then yanks back to the dialog,
    // silently bouncing the user to the top of it.
    if (busyRef.current) {
      setStatusMessage("Please wait for the current operation to finish.");
      setStatusTone("info");
      return;
    }
    if (!user) {
      setStatusMessage("You must be signed in to upload files.");
      setStatusTone("error");
      return;
    }

    const files = Array.from(fileList);
    busyRef.current = true;
    setBusy(true);
    setStatusMessage(`Uploading ${files.length} file${files.length === 1 ? "" : "s"}…`);
    setStatusTone("info");

    const succeeded: string[] = [];
    const failed: string[] = [];
    let cappedEarly = false;

    let count = localAttachments.length;
    for (const file of files) {
      if (count >= MAX_ATTACHMENTS_PER_CELL) {
        cappedEarly = true;
        break;
      }

      const result = await uploadTaskAttachment(storageAdapter, recordRow, {
        userId: user.id,
        courseId,
        taskId,
        attachmentId: crypto.randomUUID(),
        fileName: file.name,
        sizeBytes: file.size,
        mimeType: file.type || null,
        createdAt: new Date().toISOString(),
        file,
      });

      if (result.ok) {
        count += 1;
        succeeded.push(file.name);
        setLocalAttachments((prev) => [...prev, result.attachment]);
      } else {
        // Not every helper message names the file on its own (the size-cap
        // and empty-file messages do not, only the generic upload-failed
        // one does) - so the file name is prepended whenever the message
        // does not already carry it, guaranteeing every failure in the
        // summary can be traced back to a specific file.
        failed.push(result.error.includes(file.name) ? result.error : `"${file.name}": ${result.error}`);
      }
    }

    // Accessibility review fix 11: each fragment is independently
    // terminated (via the shared terminated() helper this repo already
    // owns - never hand-rolled punctuation) BEFORE being joined, so
    // "Uploaded 2 files." and "You can only attach up to 20 files..." and
    // each failure read as separate sentences rather than one run-on.
    const summaryParts: string[] = [];
    if (succeeded.length === 1) {
      summaryParts.push(terminated(`Uploaded "${succeeded[0]}"`));
    } else if (succeeded.length > 1) {
      summaryParts.push(terminated(`Uploaded ${succeeded.length} files`));
    }
    if (cappedEarly) {
      summaryParts.push(terminated(taskAttachmentCountCapMessage()));
    }
    if (failed.length > 0) {
      summaryParts.push(...failed.map((f) => terminated(f)));
    }
    setStatusMessage(summaryParts.join(" "));
    setStatusTone(failed.length > 0 ? "error" : "info");

    busyRef.current = false;
    setBusy(false);
    // A reload is only warranted when this dialog actually changed
    // something the grid needs to catch up on - firing it unconditionally
    // forced a full tab reload even on a run where every file failed.
    if (succeeded.length > 0) {
      onChanged();
    }
  };

  const handleRemove = async (attachment: TaskAttachment) => {
    if (busyRef.current) {
      setStatusMessage("Please wait for the current operation to finish.");
      setStatusTone("info");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setStatusMessage(`Removing "${attachment.fileName}"…`);
    setStatusTone("info");

    const deleteRow: DeleteTaskAttachmentRow = async () => {
      const result = await deleteTaskAttachmentAction(attachment.id);
      if ("error" in result) return { ok: false, error: result.error };
      return { ok: true };
    };

    const result = await deleteTaskAttachment(storageAdapter, deleteRow, attachment);
    busyRef.current = false;
    setBusy(false);

    if (!result.ok) {
      setStatusMessage(terminated(`Could not remove "${attachment.fileName}" - try again`));
      setStatusTone("error");
      return;
    }

    // Accessibility review fix 2: this row's own button (the one the user
    // just activated) is about to unmount - decide where DOM focus goes
    // NEXT while the current order is still known, and commit it from the
    // layout effect above once React has actually removed the row. Falls
    // back to the Choose-files button when the removed row was the last
    // one (no "next" row exists).
    const index = localAttachments.findIndex((a) => a.id === attachment.id);
    const next = localAttachments[index + 1];
    pendingFocusRef.current = next ? { kind: "row", id: next.id } : { kind: "chooseFiles" };

    setLocalAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
    setStatusMessage(`Removed "${attachment.fileName}".`);
    setStatusTone("info");
    onChanged();
  };

  // AC5 item 27: two-click confirmation, the files/FileRow.tsx precedent -
  // the first click only arms `confirmRemoveId`, the second (while still
  // armed for the SAME attachment) actually removes it.
  //
  // Accessibility review fix 3: arming announces itself through the status
  // region (a screen-reader user hears no change otherwise, since the
  // button's accessible name is the only other thing that changes, and
  // that is only useful to someone re-reading the button).
  const handleRemoveClick = (attachment: TaskAttachment) => {
    if (confirmRemoveId !== attachment.id) {
      setConfirmRemoveId(attachment.id);
      setStatusMessage(`Press Confirm to remove "${attachment.fileName}".`);
      setStatusTone("info");
      return;
    }
    setConfirmRemoveId(null);
    void handleRemove(attachment);
  };

  // Accessibility review fix 3: disarms on blur (silently - moving focus
  // elsewhere is itself the user's signal, nothing to announce) and on
  // Escape (announced, and see the button's own onKeyDown below for why
  // the FIRST Escape disarms rather than closing the whole dialog).
  const disarmRemove = (attachment: TaskAttachment, announce: boolean) => {
    setConfirmRemoveId((prev) => (prev === attachment.id ? null : prev));
    if (announce) {
      setStatusMessage(`Removal of "${attachment.fileName}" cancelled.`);
      setStatusTone("info");
    }
  };

  // AC5 item 30: fetches the signed URL into a Blob and triggers
  // `a.download` via a fresh object URL - NEVER assigns the signed URL
  // itself to `.href`, opens it in a new window, or navigates to it. The
  // signed URL is on the Supabase origin, so `download` would be ignored
  // cross-origin there and an attached `.svg`/`.html` would render instead
  // of downloading.
  const handleDownload = async (attachment: TaskAttachment) => {
    setStatusMessage(`Preparing "${attachment.fileName}" for download…`);
    setStatusTone("info");
    try {
      const { data, error } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .createSignedUrl(attachment.storagePath, SIGNED_URL_TTL_SECONDS);
      if (error || !data) {
        setStatusMessage(terminated(`Could not download "${attachment.fileName}" - try again`));
        setStatusTone("error");
        return;
      }

      const response = await fetch(data.signedUrl);
      if (!response.ok) {
        setStatusMessage(terminated(`Could not download "${attachment.fileName}" - try again`));
        setStatusTone("error");
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = attachment.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setStatusMessage(`Downloaded "${attachment.fileName}".`);
      setStatusTone("info");
    } catch {
      setStatusMessage(terminated(`Could not download "${attachment.fileName}" - try again`));
      setStatusTone("error");
    }
  };

  // Cheap fix: drag-enter/leave feedback. A depth counter (not a plain
  // boolean) because dragenter/dragleave fire once per CHILD boundary the
  // pointer crosses (the drop zone has children - the hint text and the
  // Choose-files button) - a boolean would flicker `dragActive` off the
  // instant the pointer passed over any child.
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current += 1;
    if (dragDepthRef.current === 1) {
      setDragActive(true);
      setStatusMessage("Drop to upload.");
      setStatusTone("info");
    }
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    void handleFiles(e.dataTransfer.files);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      // Accessibility review fix 6: see this component's own onExited prop
      // doc comment above - MUI's internal restore-focus-on-close is
      // disabled here entirely, in favor of the caller's OWN deliberate
      // restoration, deferred to onExited.
      disableRestoreFocus
      slotProps={{ transition: { onExited: () => onExited?.() } }}
    >
      <DialogTitle>
        Attachments - {taskLabel}, {courseName}
      </DialogTitle>
      {/* Cheap fix: aria-busy while an upload/removal is in flight. */}
      <DialogContent aria-busy={busy}>
        {/* Accessibility review fix 1 (WCAG 3.3.1 Error Identification):
            ONE status region, both visible AND announced through the SAME
            node's role="status" - upload start, every per-file completion,
            removal, download and every error path above writes to it.
            Never assertive: several files uploading in sequence would
            otherwise interrupt each other mid-announcement. Stays mounted
            (unconditionally rendered, only its text/tone vary) whether or
            not it currently holds a message. */}
        <div role="status" aria-live="polite" data-tone={statusTone} className={styles.attachmentsStatus}>
          {statusMessage}
        </div>

        {/* AC5 item 26: a real <input type="file" multiple>, driven by a
            visible button (the GOV.UK pattern) - never a custom widget.
            Files may also be dropped anywhere on this drop zone. */}
        <div
          className={styles.attachmentsDropZone}
          data-drag-active={dragActive ? "true" : undefined}
          onDragEnter={handleDragEnter}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <span className={styles.attachmentsDropHint}>Drag files here, or</span>
          <Button
            ref={chooseFilesButtonRef}
            variant="outlined"
            size="small"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose files
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {localAttachments.length === 0 ? (
          <p className={styles.attachmentsEmpty}>No files attached yet.</p>
        ) : (
          // Accessibility review fix 12: role="list"/"listitem" restore the
          // semantics `list-style: none` below strips in WebKit/VoiceOver -
          // the item count is exactly the orientation a screen-reader user
          // wants here.
          <ul className={styles.attachmentList} role="list">
            {localAttachments.map((a) => {
              const armed = confirmRemoveId === a.id;
              return (
                <li key={a.id} className={styles.attachmentRow} role="listitem">
                  <span className={styles.attachmentName} title={a.fileName}>
                    {a.fileName}
                  </span>
                  <span className={styles.attachmentMeta}>{formatBytes(a.sizeBytes)}</span>
                  <span className={styles.attachmentMeta}>
                    {new Date(a.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                  </span>
                  <div className={styles.attachmentActions}>
                    {/* Accessibility review fix 10: named after its own
                        file, exactly like Remove already was - previously
                        every Download button shared the one accessible
                        name "Download". */}
                    <Button size="small" aria-label={`Download "${a.fileName}"`} onClick={() => void handleDownload(a)}>
                      Download
                    </Button>
                    {/* AC5 item 27: the accessible name is built HERE, inside
                        the list's own map, so every row gets one that names
                        its own file - never a single shared "Remove" label.
                        Accessibility review fix 3: the accessible name now
                        TRACKS the armed state (WCAG 2.5.3 Label in Name -
                        the visible label is contained in the accessible
                        name in both states), disarms on blur and on Escape
                        (stopPropagation while armed, so the FIRST Escape
                        disarms rather than closing the whole dialog), and
                        no longer carries `disabled={busy}` - fix 2, see
                        handleRemove's own re-entry guard instead. Two
                        literal branches (not one Button with a ternary
                        aria-label) so React reconciles them as updates to
                        the SAME underlying button (same element type, same
                        position - no remount, no focus loss arming or
                        disarming) while each state's accessible name and
                        handlers stay simple to read. */}
                    {armed ? (
                      <Button
                        size="small"
                        color="error"
                        ref={(el) => registerRowButtonRef(a.id, el)}
                        aria-label={`Confirm removal of "${a.fileName}"`}
                        onClick={() => handleRemoveClick(a)}
                        onBlur={() => disarmRemove(a, false)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            disarmRemove(a, true);
                          }
                        }}
                      >
                        Confirm
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        color="error"
                        ref={(el) => registerRowButtonRef(a.id, el)}
                        aria-label={`Remove "${a.fileName}"`}
                        onClick={() => handleRemoveClick(a)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
