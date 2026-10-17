"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Typography } from "@mui/material";
import {
  getPowerPointTemplateLibraryAction,
  listPowerPointTemplateLibrariesAction,
  reusePowerPointTemplateLibraryAction,
} from "@/app/actions/powerpoint-template-library";
import { listDeckTemplateFilesAction, type DeckTemplateFileMeta } from "@/app/actions/deck-template-files";
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
import DeckTemplatePicker from "../DeckTemplatePicker";
import {
  chooseRawTemplate,
  createTemplateChoiceGate,
  initialTemplateChoiceState,
  reduceTemplateChoice,
  resolveLibraryChoiceIfCurrent,
  type PipelineLibraryActions,
  type PipelineTemplateChoice,
  type TemplateChoiceState,
} from "./template-choice";
import type { LibraryMeta } from "@/lib/powerpoint-template-library/types";

type Props = {
  effectiveChoice: PipelineTemplateChoice;
  rawTemplateFileId: string;
  onRawTemplateFileIdChange: (id: string) => void;
  onChoiceChange: (choice: PipelineTemplateChoice) => void;
  onResolutionPendingChange: (pending: boolean) => void;
  disabled: boolean;
};

const libraryActions: PipelineLibraryActions = {
  getLibrary: getPowerPointTemplateLibraryAction,
  reuseLibrary: reusePowerPointTemplateLibraryAction,
};

function diagnostic(operation: string, outcome: "success" | "failure", code = ""): void {
  recordSessionDiagnosticEntry({
    at: new Date().toISOString(),
    surface: "templates",
    operation,
    label: operation === "pipeline_template_library_select" ? "Select saved PowerPoint library" : "Select pipeline PowerPoint template",
    institution: "",
    course: "",
    outcome,
    durationMs: 0,
    ...(code ? { error: code, code } : {}),
  });
}

function currentChoiceFromRaw(id: string, templates: DeckTemplateFileMeta[]): PipelineTemplateChoice {
  if (!id) return { kind: "own" };
  const match = templates.find((template) => template.id === id);
  return chooseRawTemplate(id, match?.name ?? "Uploaded PowerPoint");
}

export default function PipelineTemplatePicker({ effectiveChoice, rawTemplateFileId, onRawTemplateFileIdChange, onChoiceChange, onResolutionPendingChange, disabled }: Props) {
  const gate = useRef(createTemplateChoiceGate());
  const observedRawId = useRef(rawTemplateFileId);
  const [rawTemplates, setRawTemplates] = useState<DeckTemplateFileMeta[]>([]);
  const [libraries, setLibraries] = useState<LibraryMeta[]>([]);
  const [libraryListLoading, setLibraryListLoading] = useState(true);
  const [libraryListError, setLibraryListError] = useState<string | null>(null);
  const [choiceState, setChoiceState] = useState<TemplateChoiceState>(() => initialTemplateChoiceState(effectiveChoice));
  const choiceStateRef = useRef(choiceState);
  useEffect(() => { choiceStateRef.current = choiceState; }, [choiceState]);

  const dispatch = useCallback((event: Parameters<typeof reduceTemplateChoice>[1]) => {
    setChoiceState((previous) => reduceTemplateChoice(previous, event));
  }, []);

  useEffect(() => () => {
    gate.current.invalidate();
    onResolutionPendingChange(false);
  }, [onResolutionPendingChange]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listPowerPointTemplateLibrariesAction(), listDeckTemplateFilesAction()]).then(([libraryResult, rawResult]) => {
      if (cancelled) return;
      if ("error" in libraryResult) {
        setLibraryListError(libraryResult.error);
      } else {
        setLibraries(libraryResult.libraries);
        setLibraryListError(null);
      }
      if (!("error" in rawResult)) {
        setRawTemplates(rawResult.templates);
        const current = currentChoiceFromRaw(rawTemplateFileId, rawResult.templates);
        const active = choiceStateRef.current.choice;
        if (current.kind === "raw" && active.kind === "raw" && current.sourceFileId === active.sourceFileId && gate.current.current(choiceStateRef.current.generation)) {
          const generation = choiceStateRef.current.generation;
          dispatch({ type: "raw-selected", generation, sourceFileId: current.sourceFileId, name: current.name });
          onChoiceChange(current);
        }
      }
      setLibraryListLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setLibraryListError("Could not load saved PowerPoint libraries. Retry or keep using the current template choice.");
        setLibraryListLoading(false);
      }
    });
    return () => { cancelled = true; };
  // The list is loaded once. Selection callbacks are intentionally omitted so a later choice does not restart it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (rawTemplateFileId === observedRawId.current) return;
    observedRawId.current = rawTemplateFileId;
    const generation = gate.current.next();
    const choice = currentChoiceFromRaw(rawTemplateFileId, rawTemplates);
    dispatch({ type: "external-raw-changed", generation, sourceFileId: choice.kind === "raw" ? choice.sourceFileId : "", name: choice.kind === "raw" ? choice.name : "" });
    onChoiceChange(choice);
  }, [rawTemplateFileId, rawTemplates, dispatch, onChoiceChange]);

  async function selectLibrary(libraryId: string) {
    if (!libraryId) return;
    const generation = gate.current.next();
    onResolutionPendingChange(true);
    dispatch({ type: "begin-library-resolution", generation });
    try {
      await resolveLibraryChoiceIfCurrent(libraryId, libraryActions, gate.current, generation, (result) => {
        if ("error" in result) {
          dispatch({ type: "library-failed", generation, error: result.error });
          diagnostic("pipeline_template_library_select", "failure", result.error.code ?? "PPT_SELECTION");
          return;
        }
        observedRawId.current = "";
        onRawTemplateFileIdChange("");
        dispatch({ type: "library-resolved", generation, choice: result.choice });
        onChoiceChange(result.choice);
        diagnostic("pipeline_template_library_select", "success");
      }, libraries);
    } finally {
      if (gate.current.current(generation)) onResolutionPendingChange(false);
    }
  }

  function selectRaw(id: string) {
    const generation = gate.current.next();
    observedRawId.current = id;
    onRawTemplateFileIdChange(id);
    const choice = currentChoiceFromRaw(id, rawTemplates);
    dispatch({ type: "raw-selected", generation, sourceFileId: choice.kind === "raw" ? choice.sourceFileId : "", name: choice.kind === "raw" ? choice.name : "" });
    onResolutionPendingChange(false);
    onChoiceChange(choice);
    diagnostic("pipeline_template_raw_select", "success");
  }

  function clearChoice() {
    const generation = gate.current.invalidate();
    observedRawId.current = "";
    onRawTemplateFileIdChange("");
    dispatch({ type: "cleared", generation });
    onResolutionPendingChange(false);
    onChoiceChange({ kind: "own" });
  }

  // PipelineTab owns the effective selection across stage unmounts. The raw
  // file id alone cannot represent a saved-library choice because that choice
  // deliberately clears the raw id.
  const currentChoice = effectiveChoice;
  const selectedLibraryId = currentChoice.kind === "library" ? currentChoice.libraryId : "";
  const selectedLibrary = libraries.find((library) => library.id === selectedLibraryId);
  const sourceFile = selectedLibrary ? rawTemplates.find((item) => item.id === selectedLibrary.sourceFileId) : undefined;
  const effectiveLabel = currentChoice.kind === "own"
    ? "Generated deck design"
    : currentChoice.kind === "raw"
      ? `Uploaded PowerPoint: ${currentChoice.name}`
      : `Saved library: ${currentChoice.name}${sourceFile ? ` — ${sourceFile.fileName}` : ""}`;

  return (
    <fieldset disabled={disabled} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <Typography variant="subtitle2">Effective PowerPoint template</Typography>
      <Typography variant="body2" color="text.secondary" aria-live="polite">{effectiveLabel}</Typography>
      <DeckTemplatePicker selectedId={rawTemplateFileId} onSelectId={selectRaw} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
        <label htmlFor="pipeline-saved-library">Saved PowerPoint library</label>
        <select id="pipeline-saved-library" aria-label="Choose a saved PowerPoint library" value={selectedLibraryId} disabled={choiceState.libraryLoading} onChange={(event) => void selectLibrary(event.target.value)}>
          <option value="">Use no saved library</option>
          {libraries.map((library) => {
            const source = rawTemplates.find((item) => item.id === library.sourceFileId);
            return <option key={library.id} value={library.id}>{library.name}{source ? ` — ${source.fileName}` : ""}</option>;
          })}
        </select>
        {choiceState.libraryLoading && <Typography role="status">Checking saved library…</Typography>}
        {currentChoice.kind !== "own" && <Button size="small" onClick={clearChoice} sx={{ textTransform: "none" }}>Clear effective template</Button>}
      </div>
      {choiceState.libraryError && <Alert severity="error">{choiceState.libraryError.error}</Alert>}
      {libraryListError && <Alert severity="error">{libraryListError}</Alert>}
      {!libraryListLoading && !libraryListError && libraries.length === 0 && <Typography variant="body2" color="text.secondary">No saved libraries are available. Create one in PowerPoint Templates.</Typography>}
      </div>
    </fieldset>
  );
}
