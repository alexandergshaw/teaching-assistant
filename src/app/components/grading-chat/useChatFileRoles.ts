"use client";
import { useEffect, useState } from "react";
import { admitRoleFiles, isSetupRole, readRoleSetup, resolveRoleSetup, type ChatFileRole, type ChatRoleChoices, type ChatRoleDraft, type ChatRoleOptions, type ChatRoleRow, type ConfirmedRoleSetup } from "./chatFileRoles";
import type { SubmitOutcome } from "./useContinuousGradingRun";
import { recordChatFileRoleDiagnostic } from "./chatFileRoleDiagnostic";
import { lengthDeductionThresholdError } from "./chatLengthDeduction";
type Params = { epoch: string; locked: boolean; draft: ChatRoleDraft; options: ChatRoleOptions;
  start: (setup: ConfirmedRoleSetup, current: () => boolean) => Promise<boolean>;
  submit: (file: File, label: string | undefined, current: () => boolean) => Promise<SubmitOutcome>;
  applySetup: (setup: ChatRoleDraft) => void; canStage?: boolean;
};
export function createChatFileRolesController(initial: Params) {
  let params = initial, rows: ChatRoleRow[] = [], revision = 0, nextId = 0, busy = false, label: string | undefined;
  let error: string | null = null, phase = "preview", choices: ChatRoleChoices = { instructions: "draft", rubric: "draft" };
  let readQueue = Promise.resolve();
  let listener: (view: ReturnType<typeof snapshot>) => void = () => {};
  const emit = () => listener(snapshot());
  const resolve = () => {
    const resolved = resolveRoleSetup(rows, params.draft, choices, params.locked);
    const error = lengthDeductionThresholdError(params.options.applyLengthDeduction, params.options.lengthDeductionThresholdWords);
    return error ? { ...resolved, errors: [...resolved.errors, error] } : resolved;
  };
  const diagnostic = (operation: "stage" | "confirm", outcome: "success" | "failure", startedAtMs: number, failure?: "limits" | "pending-preview" | "setup-invalid" | "setup-refused" | "file-failed" | "canceled") => {
    try { recordChatFileRoleDiagnostic({ operation, outcome, startedAtMs, rows, failure }); } catch { /* Diagnostics cannot change intake. */ }
  };
  const cancel = () => { revision += 1; rows = []; busy = false; error = null; phase = "preview"; label = undefined; choices = { instructions: "draft", rubric: "draft" }; emit(); };
  const stage = (files: File[], nextLabel?: string): boolean => {
    const started = performance.now(), refusal = rows.length ? "Finish or cancel the current file preview before choosing another batch." : params.canStage === false ? "Finish the current submission before staging files." : admitRoleFiles(files);
    if (refusal) { error = refusal; diagnostic("stage", "failure", started, rows.length ? "pending-preview" : "limits"); emit(); return false; }
    revision += 1; label = files.length === 1 ? nextLabel : undefined; error = null;
    rows = files.map((file) => ({ id: ++nextId, name: file.name, size: file.size, file, role: "unassigned", status: "unassigned" }));
    diagnostic("stage", "success", started); emit(); return true;
  };
  const assign = (id: number, role: ChatFileRole): Promise<void> => {
    if (busy && phase !== "reading") return Promise.resolve();
    const row = rows.find((item) => item.id === id); if (!row?.file) return Promise.resolve();
    if (params.locked && isSetupRole(role)) { error = "Setup is locked. Start a New session to use a setup file."; emit(); return Promise.resolve(); }
    const token = ++revision; error = null;
    rows = rows.map((item) => item.id === id ? { ...item, role, text: undefined, error: undefined, status: role === "unassigned" ? "unassigned" : "ready" } : item);
    busy = rows.some((item) => isSetupRole(item.role) && item.text === undefined && item.file); phase = busy ? "reading" : "preview"; emit();
    readQueue = readQueue.then(async () => {
      for (const source of rows) {
        if (revision !== token) return;
        if (!isSetupRole(source.role) || source.text !== undefined || !source.file) continue;
        rows = rows.map((item) => item.id === source.id ? { ...item, status: "reading" } : item); emit();
        try { const text = await readRoleSetup(source.file); if (revision !== token) return; rows = rows.map((item) => item.id === source.id ? { ...item, text, status: "ready", error: undefined } : item); }
        catch (failure) { if (revision !== token) return; rows = rows.map((item) => item.id === source.id ? { ...item, status: "error", error: failure instanceof Error ? failure.message : "Setup text could not be read." } : item); }
      }
      if (revision === token) { busy = false; phase = "preview"; emit(); }
    });
    return readQueue;
  };
  const confirm = async (setupOnly = false): Promise<void> => {
    if (busy || !rows.length) return;
    const resolved = resolve(), submissions = rows.filter((row) => row.role === "submission" && row.file);
    if (resolved.errors.length || (!setupOnly && !submissions.length) || (setupOnly && rows.some((row) => row.role === "submission"))) { error = resolved.errors[0] ?? "Keep at least one submission, or use setup with setup-only files."; emit(); return; }
    const token = ++revision, epoch = params.epoch, setup: ConfirmedRoleSetup = Object.freeze({ ...resolved.effective, ...params.options });
    const current = () => revision === token && params.epoch === epoch;
    if (setupOnly) { params.applySetup(setup); cancel(); return; }
    rows = rows.map((row) => row.role === "submission" && row.file ? { ...row, status: "unattempted" } : row);
    busy = true; phase = "starting"; error = null; emit(); const started = performance.now();
    try {
      const ready = await params.start(setup, current); if (!current()) return;
      if (!ready) { error = "Session setup was refused. Correct the setup and confirm again; no files were submitted."; diagnostic("confirm", "failure", started, "setup-refused"); return; }
      params.applySetup(setup);
      rows = rows.map((row) => isSetupRole(row.role) ? { ...row, status: "accepted", file: null, text: undefined } : row);
      phase = "dispatching";
      for (const source of submissions) {
        if (!current()) return;
        let outcome: SubmitOutcome;
        try { outcome = await params.submit(source.file!, label, current); }
        catch { outcome = { kind: "refused", reason: "This file could not be prepared. Review it before retrying." }; }
        if (!current()) return;
        rows = rows.map((row) => row.id === source.id ? { ...row, status: outcome.kind === "accepted" ? "accepted" : outcome.kind === "partial" ? "partial" : "failed",
          file: outcome.kind === "refused" ? row.file : null, error: outcome.kind === "accepted" ? undefined : outcome.reason } : row); emit();
      }
      diagnostic("confirm", rows.some((row) => row.status === "failed") ? "failure" : "success", started, rows.some((row) => row.status === "failed") ? "file-failed" : undefined);
    } catch { if (current()) { error = "Session setup failed. Files remain available; confirm again after correcting setup."; diagnostic("confirm", "failure", started, "setup-refused"); } }
    finally { if (current()) { busy = false; phase = "settled"; emit(); } }
  };
  function snapshot() { return { rows, error, busy, phase, pending: rows.length > 0, choices,
    resolved: resolve(), locked: params.locked,
    stage, assign, confirm, cancel, isPending: () => rows.length > 0,
    choose(field: keyof ChatRoleDraft, value: "draft" | "file") { if (!busy) { choices = { ...choices, [field]: value }; error = null; emit(); } },
  }; }
  return { snapshot, sync(next: Params) { const changed = params.epoch !== next.epoch;
    const before = JSON.stringify([params.locked, params.draft, params.options]); params = next;
    if (changed) cancel(); else if (before !== JSON.stringify([params.locked, params.draft, params.options])) emit();
  }, subscribe(next: typeof listener) { listener = next; return () => { listener = () => {}; }; } };
}
export function useChatFileRoles(params: Params) {
  const [controller] = useState(() => createChatFileRolesController(params));
  const [view, setView] = useState(controller.snapshot);
  useEffect(() => controller.subscribe(setView), [controller]);
  useEffect(() => controller.sync(params), [controller, params]);
  return view;
}
