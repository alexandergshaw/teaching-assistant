"use client";

// "Upload to Canvas" - push a Common Cartridge into the LIVE Canvas course as
// a `common_cartridge_importer` content migration, and watch it until Canvas
// finishes (docs/modules-cartridge-import-upload-acceptance-criteria.md,
// section C - AC11-AC20). This file owns the ENTIRE phase machine and its
// persisted controls; CartridgeToCanvasModal.tsx is pure presentation over
// this hook's return value (AC15's own reasoning for that split).
//
// THE PURE HELPERS BELOW (`validateCartridgeFile`, `interpretMigrationState`,
// `pollMigrationUntilTerminal`) ARE EXPORTED DELIBERATELY, so
// useCartridgeToCanvas.test.ts can pin the phase machine's actual decisions -
// which Canvas workflow_state maps to which phase, the bounded-timeout
// branch, the AC17 pre-flight rejections - without rendering the hook itself.
// vitest here is node-env and collects only `src/**/*.test.ts` (this repo's
// own convention - see contentSourceGating.test.ts's header): nothing in this
// app is ever rendered by the test suite, so any behaviour worth pinning has
// to live in a function callable with no React runtime at all. The hook below
// is thin glue over these functions on purpose - every DECISION lives in a
// pure function, `useCartridgeToCanvas` only wires them to `useState`/timers.
//
// AC13a - THE STEP THAT CREATES ZOMBIES. Read `uploadCartridgeBytes`'s own
// header comment before touching the upload call it makes.
//
// AC14's phase vocabulary, matched exactly:
//   idle -> preparing (reading/locating the file) -> creating (asking Canvas
//   to start the migration) -> uploading (bytes to the ticket) -> processing
//   (Canvas is unpacking it) -> [selecting (only when selective)] -> done | failed
//
// AC19 - PERSISTED VS TRANSIENT STATE, the line this file draws and keeps:
//   PERSISTED (ta`-prefixed localStorage keys, unscoped by course - these are
//   personal defaults ["I usually pick specific types" / "I usually leave
//   quizzes alone"], not course-specific facts, the same posture
//   useBulkModuleActions.ts's own `ta-modules-bulkadd-stype` already takes for
//   an analogous default):
//     - source            ("device" | "export")
//     - selective         (AC18's "Choose what to import")
//     - overwriteQuizzes  (AC18's "Overwrite existing quizzes...")
//   TRANSIENT (reset by `close()`, never written to storage): the picked
//   File, phase, migration id/course id, chosen COURSE_COPY_TYPES keys, and
//   any error/timeout state.
import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { COURSE_COPY_TYPES, type FileUploadTicket } from "@/lib/canvas-modules";
import { downloadCourseZipBlob } from "@/lib/course-files";
import { latestSourceExportFile } from "@/lib/courses-table-helpers";
import type { Database } from "@/lib/supabase/types";
import type { CourseMaterialFile } from "@/lib/supabase/courses.types";
import {
  createCartridgeMigrationAction,
  getMigrationStateAction,
  resolveLmsCourseRowAction,
  selectCopyTypesAction,
} from "../../../actions";
import { describeCartridgeUploadOnExport, type ContentSourceContext } from "../contentSourceGating";

// ── AC17 - pre-flight, before any Canvas call ───────────────────────────────

/** The storage bucket's own ceiling (mirrors MAX_EXPORT_BYTES in
 * importCourseExportPipeline.ts / the former ImportCourseExportControl.tsx) -
 * both this upload path and the import-into-this-app path share the same
 * underlying Supabase Storage limit, so the same number applies to both,
 * independently declared here (this module never imports from the import
 * pipeline, which is a SEPARATE destination - see this feature's doc header). */
export const MAX_CARTRIDGE_BYTES = 100 * 1024 * 1024;

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * AC17: reject a file over 100 MB with the size named, and reject a file
 * whose name ends in neither `.imscc` nor `.zip` - BEFORE any Canvas call,
 * since "Canvas rejecting it later is a worse experience than refusing it
 * here." Pure - takes only the two fields it needs, so it is callable with a
 * plain `{name, size}` fixture in tests, never a real `File`/`Blob`. Returns
 * the rejection message, or null when the file is acceptable.
 */
export function validateCartridgeFile(file: { name: string; size: number }): string | null {
  if (file.size > MAX_CARTRIDGE_BYTES) {
    return `This cartridge is too large (${formatMb(file.size)} MB, max ${formatMb(MAX_CARTRIDGE_BYTES)} MB).`;
  }
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".imscc") && !lower.endsWith(".zip")) {
    return "Choose a Common Cartridge file (.imscc or .zip).";
  }
  return null;
}

// ── AC14 - Canvas workflow_state -> this hook's own phase vocabulary ───────

/**
 * The one place a raw Canvas `workflow_state` string is interpreted - every
 * caller reads this outcome, never the raw string itself, mirroring
 * contentSourceGating.ts's "one named function decides, everyone else reads
 * the decision" shape. `"completed"` -> done (terminal, proven success).
 * `"failed"` -> failed, carrying the raw state so the caller can name it
 * (AC14: "failed -> failed, with the Canvas state named").
 * `"waiting_for_select"` -> selecting (AC18's type picker). EVERY OTHER
 * state (`queued`/`pre_processing`/`exporting`/`importing`/`running`, and
 * anything Canvas adds later) -> continue: this deliberately does not
 * enumerate every in-progress state, because an unrecognised string is
 * exactly as "still working" as a recognised in-progress one, and treating
 * it as a failure would be exactly the "claim a failure we cannot prove"
 * AC14 forbids.
 */
export type MigrationPollOutcome =
  | { kind: "continue" }
  | { kind: "done" }
  | { kind: "failed"; canvasState: string }
  | { kind: "selecting" };

export function interpretMigrationState(state: string): MigrationPollOutcome {
  if (state === "completed") return { kind: "done" };
  if (state === "failed") return { kind: "failed", canvasState: state };
  if (state === "waiting_for_select") return { kind: "selecting" };
  return { kind: "continue" };
}

// ── AC14 - the bounded poll loop ────────────────────────────────────────────

/** ~4.5 minutes at the default interval - generous next to CourseCopyModal's
 * own 25 * 1500ms (~37s) for the smaller "waiting_for_select" wait, because a
 * cartridge's actual CONTENT import (this loop's real target state) routinely
 * runs far longer than that setup step ever did. */
export const CARTRIDGE_POLL_MAX_ATTEMPTS = 90;
export const CARTRIDGE_POLL_INTERVAL_MS = 3000;

export type PollLoopOutcome =
  | { kind: "done" }
  | { kind: "failed"; canvasState: string }
  | { kind: "selecting" }
  | { kind: "timeout" }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

/**
 * Poll `checkState` on a bounded interval until it reaches a terminal
 * outcome, `isCancelled()` goes true, or `maxAttempts` is exhausted. THE
 * TIMEOUT BRANCH NEVER CLAIMS FAILURE - AC14's own requirement - it returns
 * `{kind:"timeout"}`, a THIRD thing distinct from both `"done"` and
 * `"failed"`, so a caller can never collapse "we stopped watching" into "it
 * failed." `sleep`/`maxAttempts`/`intervalMs` are all injectable so this is
 * testable with zero real elapsed time and a scripted `checkState` sequence.
 */
export async function pollMigrationUntilTerminal(
  checkState: () => Promise<{ state: string } | { error: string }>,
  isCancelled: () => boolean,
  opts?: { maxAttempts?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> }
): Promise<PollLoopOutcome> {
  const maxAttempts = opts?.maxAttempts ?? CARTRIDGE_POLL_MAX_ATTEMPTS;
  const intervalMs = opts?.intervalMs ?? CARTRIDGE_POLL_INTERVAL_MS;
  const sleep = opts?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (isCancelled()) return { kind: "cancelled" };
    const result = await checkState();
    if ("error" in result) return { kind: "error", message: result.error };
    const outcome = interpretMigrationState(result.state);
    if (outcome.kind !== "continue") return outcome;
    if (isCancelled()) return { kind: "cancelled" };
    await sleep(intervalMs);
  }
  return { kind: "timeout" };
}

// ── AC13/AC13a - the browser-to-Canvas byte upload ─────────────────────────

/**
 * Steps 2 AND 3 of Canvas's three-step file-upload workflow, in one call:
 * POST the bytes to `ticket.uploadUrl` as `multipart/form-data` (every
 * `uploadParams` entry appended FIRST, `file` appended LAST - "must be posted
 * as the last parameter following all the others"), then follow whatever
 * redirect Canvas returns.
 *
 * AC13a - THE STEP THAT CREATES ZOMBIES: step 3 (following the redirect) is
 * NOT optional. "the application needs to perform a GET to this location in
 * order to complete the upload, otherwise the new file may not be marked as
 * available" (canvas.instructure.com/doc/api/file.file_uploads.html,
 * verified 2026-08-21). Skipping it leaves a migration waiting for a file
 * Canvas never marks available - exactly the unclearable `pre_processing`-
 * forever row docs/REGRESSION.md entry 318 check 5 calls `stuck-no-file`, and
 * which the Canvas API can neither cancel nor delete.
 *
 * `fetch`'s DEFAULT `redirect: "follow"` performs step 3 automatically, so
 * this is already correct as written - but that has to stay DELIBERATE:
 * NEVER pass `redirect: "manual"` or `redirect: "error"` on this call. If a
 * future change needs the raw redirect, it must perform the follow-up GET
 * itself rather than dropping this option silently - the failure mode is
 * invisible at the time it's introduced and only surfaces as an unclearable
 * stuck import days later.
 *
 * No Authorization header is sent (matches AC13a's "The access token is not
 * sent with this request" - `fetch` never adds one on its own, so there is
 * nothing to omit here, only nothing to add). This never tries to parse an
 * `id` out of the final response the way utils.ts's own `uploadFileToCanvas`
 * does for a plain course-file upload - a migration's pre_attachment upload
 * response has no such fixed shape, and the migration already has its own id
 * from AC11's create call, so there is nothing this function needs from the
 * body beyond "did it succeed."
 */
export async function uploadCartridgeBytes(ticket: FileUploadTicket, bytes: Blob, filename: string): Promise<void> {
  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.uploadParams)) form.append(key, value);
  form.append("file", bytes, filename);
  const response = await fetch(ticket.uploadUrl, { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(`Uploading the cartridge to Canvas failed (HTTP ${response.status}).`);
  }
}

// ── The hook ─────────────────────────────────────────────────────────────

export type CartridgeUploadSource = "device" | "export";

export type CartridgeUploadPhase =
  | "idle"
  | "preparing"
  | "creating"
  | "uploading"
  | "processing"
  | "selecting"
  | "done"
  | "failed";

interface MigrationInfo {
  migrationId: number;
  courseId: string;
}

const SOURCE_KEY = "ta-cartridge-upload-source";
const SELECTIVE_KEY = "ta-cartridge-upload-selective";
const OVERWRITE_QUIZZES_KEY = "ta-cartridge-upload-overwrite-quizzes";

export interface UseCartridgeToCanvasReturn {
  // AC19 - persisted controls.
  source: CartridgeUploadSource;
  setSource: (s: CartridgeUploadSource) => void;
  selective: boolean;
  setSelective: (v: boolean) => void;
  overwriteQuizzes: boolean;
  setOverwriteQuizzes: (v: boolean) => void;

  // AC16 - the "this course's stored export" option's own availability.
  exportSourceAvailable: boolean;
  /** Non-null exactly when `exportSourceAvailable` is false - AC16's "say
   * why in one sentence rather than hiding it." */
  exportSourceUnavailableReason: string | null;
  exportFileName: string | null;

  // Transient - never persisted (AC19).
  deviceFile: File | null;
  setDeviceFile: (f: File | null) => void;
  /** AC17's pre-flight verdict for whichever file `source` currently names -
   * the device file once picked, or the resolved export file. Null while
   * nothing is picked yet, or while the file is acceptable. */
  preflightError: string | null;

  phase: CartridgeUploadPhase;
  /** True once the bounded poll loop (AC14) has given up watching WITHOUT
   * Canvas having reported success or failure - phase stays "processing"
   * (never becomes "failed"), and this flag is the caller's cue to render
   * the "Canvas is still working" wording instead of a spinner. */
  timedOut: boolean;
  error: string | null;
  /** Set only on a PROVEN Canvas-reported failure (interpretMigrationState's
   * `"failed"` outcome) - the raw workflow_state, named per AC14. */
  failedCanvasState: string | null;

  // AC18 - the waiting_for_select type picker (type-level only; the
  // per-item SelectiveNode tree stays CourseCopyModal's own, per AC18).
  copyTypes: typeof COURSE_COPY_TYPES;
  chosenTypes: Set<string>;
  toggleType: (key: string) => void;
  submitSelectedTypes: () => void;

  /** AC4/AC20's expectation-setting sentence - null on the live source, so
   * the modal can render it unconditionally. */
  exportNote: string | null;

  canStart: boolean;
  start: () => void;
  /** AC14's cancellation: stops polling, tells the instructor Canvas keeps
   * working in the background when a migration was actually in flight, and
   * resets every TRANSIENT field (never the three persisted controls). Call
   * this from the modal's onDismiss - it is safe to call at any phase. */
  close: () => void;
}

export function useCartridgeToCanvas(
  courseUrl: string,
  acronym: string | undefined,
  courseName: string | undefined,
  ctx: ContentSourceContext,
  supabase: SupabaseClient<Database>,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  reload: () => void
): UseCartridgeToCanvasReturn {
  const [source, setSource] = useState<CartridgeUploadSource>(() => {
    if (typeof window === "undefined") return "device";
    return localStorage.getItem(SOURCE_KEY) === "export" ? "export" : "device";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(SOURCE_KEY, source);
  }, [source]);

  const [selective, setSelective] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SELECTIVE_KEY) === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(SELECTIVE_KEY, selective ? "1" : "0");
  }, [selective]);

  const [overwriteQuizzes, setOverwriteQuizzes] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(OVERWRITE_QUIZZES_KEY) === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(OVERWRITE_QUIZZES_KEY, overwriteQuizzes ? "1" : "0");
  }, [overwriteQuizzes]);

  // AC16 - resolve this SAME live course's own stored export, so it can be
  // offered as an upload source alongside a device file. setState-in-effect
  // idiom (this repo's own convention, AGENTS.md/CLAUDE.md): an inline async
  // IIFE with a `cancelled` flag, setState only after each await, so a
  // stale response from a courseUrl this component has since moved on from
  // can never overwrite a newer one (see set-state-in-effect-idiom memory).
  // The FULL stored row (never just {name,size}) - downloadCourseZipBlob
  // needs `path`/`parts` to actually fetch the bytes (AC16); a trimmed view
  // is derived below wherever only the display/pre-flight fields are needed.
  const [exportFile, setExportFile] = useState<CourseMaterialFile | null>(null);
  const [exportUnavailableReason, setExportUnavailableReason] = useState<string | null>(
    "This course has no stored export to upload - only a file from your device."
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!courseUrl.trim()) {
        if (!cancelled) {
          setExportFile(null);
          setExportUnavailableReason("There is no live Canvas course linked, so there is no course to check for a stored export.");
        }
        return;
      }
      const resolved = await resolveLmsCourseRowAction(courseUrl, acronym);
      if (cancelled) return;
      if ("error" in resolved) {
        setExportFile(null);
        setExportUnavailableReason("Could not check this course for a stored export: " + resolved.error);
        return;
      }
      const file = latestSourceExportFile(resolved.course);
      if (!file) {
        setExportFile(null);
        setExportUnavailableReason("This course has no stored export to upload - only a file from your device.");
        return;
      }
      setExportFile(file);
      setExportUnavailableReason(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, acronym]);

  const [deviceFile, setDeviceFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<CartridgeUploadPhase>("idle");
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedCanvasState, setFailedCanvasState] = useState<string | null>(null);
  const [migrationInfo, setMigrationInfo] = useState<MigrationInfo | null>(null);
  const [chosenTypes, setChosenTypes] = useState<Set<string>>(new Set());

  // Cancellation (AC14): read inside the running async flow, never as a
  // React state value - it must take effect the instant `close()` is called,
  // with no re-render round trip in between.
  const cancelledRef = useRef(false);
  // The file name in flight, captured at `start()` time - `close()` needs it
  // for the "Canvas keeps importing X in the background" message AFTER it
  // has already cleared `deviceFile`/`exportFile`-derived transient state.
  const activeFileNameRef = useRef<string | null>(null);

  const activeFileMeta: { name: string; size: number } | null =
    source === "device" ? (deviceFile ? { name: deviceFile.name, size: deviceFile.size } : null) : exportFile;
  const preflightError = activeFileMeta ? validateCartridgeFile(activeFileMeta) : null;
  const idlePhase = phase === "idle" || phase === "done" || phase === "failed";
  const canStart = idlePhase && activeFileMeta !== null && preflightError === null;

  const toggleType = (key: string) => {
    setChosenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const runPollAndAdvance = async (migrationId: number, canvasCourseId: string) => {
    setPhase("processing");
    setTimedOut(false);
    const outcome = await pollMigrationUntilTerminal(
      () => getMigrationStateAction(courseUrl, canvasCourseId, migrationId, acronym),
      () => cancelledRef.current
    );
    if (cancelledRef.current) return;

    if (outcome.kind === "done") {
      setPhase("done");
      const name = activeFileNameRef.current ?? "the cartridge";
      setNote({ kind: "success", text: `Uploaded "${name}" to ${courseName || "the live course"} on Canvas.` });
      reload();
      return;
    }
    if (outcome.kind === "failed") {
      setPhase("failed");
      setFailedCanvasState(outcome.canvasState);
      setError(`Canvas reported the import failed (state: ${outcome.canvasState}).`);
      return;
    }
    if (outcome.kind === "selecting") {
      setPhase("selecting");
      return;
    }
    if (outcome.kind === "timeout") {
      // AC14: never claim a failure we cannot prove - phase stays
      // "processing"; `timedOut` is the caller's cue to reword the status
      // line rather than pretend nothing changed.
      setTimedOut(true);
      return;
    }
    if (outcome.kind === "error") {
      setPhase("failed");
      setError(
        `Could not check the import's status: ${outcome.message}. This does not mean Canvas failed - it may still be working.`
      );
      return;
    }
    // "cancelled" - close() already reset every transient field; nothing
    // further to do here.
  };

  const run = async () => {
    setPhase("preparing");
    setError(null);
    setFailedCanvasState(null);
    setTimedOut(false);

    let fileMeta: { name: string; size: number };
    let bytes: Blob;
    try {
      if (source === "device") {
        if (!deviceFile) throw new Error("Choose a cartridge file first.");
        const rejection = validateCartridgeFile(deviceFile);
        if (rejection) throw new Error(rejection);
        fileMeta = { name: deviceFile.name, size: deviceFile.size };
        bytes = deviceFile;
      } else {
        if (!exportFile) throw new Error("This course has no stored export to upload.");
        const rejection = validateCartridgeFile(exportFile);
        if (rejection) throw new Error(rejection);
        fileMeta = exportFile;
        // AC16: bytes come from downloadCourseZipBlob, which brings its own
        // retry - never a hand-rolled fetch of the storage object.
        bytes = await downloadCourseZipBlob(supabase, exportFile);
      }
    } catch (err) {
      if (cancelledRef.current) return;
      setPhase("failed");
      setError(err instanceof Error ? err.message : "Could not read the cartridge file.");
      return;
    }
    if (cancelledRef.current) return;
    activeFileNameRef.current = fileMeta.name;

    setPhase("creating");
    const created = await createCartridgeMigrationAction(courseUrl, fileMeta, { selective, overwriteQuizzes }, acronym);
    if (cancelledRef.current) return;
    if ("error" in created) {
      setPhase("failed");
      setError(created.error);
      return;
    }

    setPhase("uploading");
    try {
      await uploadCartridgeBytes(created.ticket, bytes, fileMeta.name);
    } catch (err) {
      if (cancelledRef.current) return;
      setPhase("failed");
      setError(err instanceof Error ? err.message : "Could not upload the cartridge to Canvas.");
      return;
    }
    if (cancelledRef.current) return;

    setMigrationInfo({ migrationId: created.migrationId, courseId: created.courseId });
    await runPollAndAdvance(created.migrationId, created.courseId);
  };

  const start = () => {
    if (!canStart) return;
    cancelledRef.current = false;
    void run();
  };

  const submitSelectedTypes = () => {
    if (!migrationInfo) return;
    if (chosenTypes.size === 0) {
      setError("Choose at least one content type to import.");
      return;
    }
    void (async () => {
      setError(null);
      const result = await selectCopyTypesAction(
        courseUrl,
        migrationInfo.courseId,
        migrationInfo.migrationId,
        [...chosenTypes],
        acronym
      );
      if (cancelledRef.current) return;
      if ("error" in result) {
        setError(result.error);
        return;
      }
      await runPollAndAdvance(migrationInfo.migrationId, migrationInfo.courseId);
    })();
  };

  // AC14 - a migration actually exists in Canvas (and may be receiving
  // bytes, or being unpacked) once "creating" starts. Closing before that is
  // a plain local cancel with nothing to tell the instructor about.
  const IN_FLIGHT_WITH_CANVAS: ReadonlySet<CartridgeUploadPhase> = new Set(["creating", "uploading", "processing", "selecting"]);

  const close = () => {
    const wasInFlight = IN_FLIGHT_WITH_CANVAS.has(phase);
    const name = activeFileNameRef.current;
    cancelledRef.current = true;
    if (wasInFlight) {
      setNote({
        kind: "success",
        text: `Canvas is still importing "${name ?? "the cartridge"}" into ${
          courseName || "the course"
        } in the background - closing this window does not stop it.`,
      });
    }
    setPhase("idle");
    setError(null);
    setFailedCanvasState(null);
    setTimedOut(false);
    setDeviceFile(null);
    setMigrationInfo(null);
    setChosenTypes(new Set());
    activeFileNameRef.current = null;
  };

  return {
    source,
    setSource,
    selective,
    setSelective,
    overwriteQuizzes,
    setOverwriteQuizzes,
    exportSourceAvailable: exportFile !== null,
    exportSourceUnavailableReason: exportUnavailableReason,
    exportFileName: exportFile?.name ?? null,
    deviceFile,
    setDeviceFile,
    preflightError,
    phase,
    timedOut,
    error,
    failedCanvasState,
    copyTypes: COURSE_COPY_TYPES,
    chosenTypes,
    toggleType,
    submitSelectedTypes,
    exportNote: describeCartridgeUploadOnExport(ctx),
    canStart,
    start,
    close,
  };
}
