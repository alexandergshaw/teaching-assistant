"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@mui/material";
import TabHeader from "../TabHeader";
import { useSupabase } from "@/context/SupabaseProvider";
import { useDraftedGradesInbox } from "../DraftedGradesInbox";
import {
  deleteDeckTemplate,
  upsertDeckTemplate,
} from "@/lib/deck-templates";
import {
  DECK_PRESETS,
  isPresetDeckId,
} from "@/lib/decks/presets";
import {
  emptyDeckTemplate,
  newDeckSlide,
  newDeckLoopGroup,
  duplicateDeckTemplate,
  type DeckSlide,
  type DeckLoopGroup,
  type DeckTemplate,
  type SlideRole,
} from "@/lib/decks/types";
import { generateDeckFromTemplateAction, savePresentationFileAction } from "@/app/actions";
import { extractDeckSourceFileAction, extractDeckSourceRepoAction } from "@/app/actions/deck-source";
import {
  uploadDeckTemplateFileAction,
  deleteDeckTemplateFileAction,
  fillDeckTemplateFileAction,
} from "@/app/actions/deck-template-files";
import { buildSlidesPptx, type PptxTheme } from "@/lib/pptx";
import { saveRecordingFile } from "@/lib/recording-files";
import { getStoredProvider } from "@/lib/llm-provider";
import { deriveSubjectFromSource } from "@/lib/decks/deck-source";
import styles from "../../page.module.css";
import TemplateSelector from "./TemplateSelector";
import DeckSettingsPanel from "./DeckSettingsPanel";
import SlidesPanel from "./SlidesPanel";
import AddContentPanel from "./AddContentPanel";
import GeneratePanel from "./GeneratePanel";
import {
  useTemplates,
  useSelectedTemplate,
  useDeckSettingsOpen,
  usePendingTemplateSave,
  useGenerationState,
  useDeckSourceReceipt,
  useDeckSourceMaterials,
  useSelectedDeckTemplateFileId,
  useDeckTemplateFiles,
  useDeckAskDraft,
} from "./hooks";
import { gradientPng } from "./utils";
import { buildAskRequestBody, reduceAskResponse } from "./ask-response";

const ASK_DECK_URL = "/api/decks/ask";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

// A43-T: fillDeckTemplateFileAction returns base64 (server actions return
// serialized JSON, not a Buffer/ArrayBuffer); buildSlidesPptx's ArrayBuffer
// needs no such conversion, so only this path needs the step.
function base64ToBytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export default function PowerPointDesignTab() {
  const { supabase, user } = useSupabase();
  const draftedGradesInbox = useDraftedGradesInbox();

  const { custom, setCustom, loadError } = useTemplates();
  const [selected, setSelectedId] = useSelectedTemplate(custom);
  const [settingsOpen, setSettingsOpen] = useDeckSettingsOpen();
  const commit = usePendingTemplateSave(user, supabase);

  const generationState = useGenerationState();
  const {
    generatedDeck,
    setGeneratedDeck,
    subject,
    setSubject,
    audience,
    setAudience,
    loopItems,
    setLoopItems,
    generateBusy,
    setGenerateBusy,
    generateError,
    setGenerateError,
    editingSlideIdx,
    setEditingSlideIdx,
    editedSlides,
    setEditedSlides,
    savingFile,
    setSavingFile,
    savingDraft,
    setSavingDraft,
    draftNote,
    setDraftNote,
  } = generationState;

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // A43-C wave C2: the conversational ask box's own state. askOutcome only
  // ever carries "refused"/"error" text - an "ok" outcome applies directly to
  // editedSlides and clears the draft, so there is nothing to display.
  const [askDraft, setAskDraft] = useDeckAskDraft();
  const [askBusy, setAskBusy] = useState(false);
  const [askOutcome, setAskOutcome] = useState<{ kind: "refused" | "error"; text: string; retryable?: boolean } | null>(null);

  const [sourceReceipt, setSourceReceipt] = useDeckSourceReceipt();
  const [sourceMaterials, setSourceMaterials] = useDeckSourceMaterials();
  const [sourceRepoText, setSourceRepoText] = useState("");
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  // A43-T (docs/a43-scope.md section 11.3): an owner-uploaded .pptx template,
  // selected independently of the structural DeckTemplate above. When set,
  // Download/Save-to-Files route the generated deck's content into this
  // file's own slides (src/lib/decks/office-template-fill.ts) instead of
  // building a fresh presentation with buildSlidesPptx.
  const [selectedFileId, setSelectedFileId] = useSelectedDeckTemplateFileId();
  const { templateFiles, loadError: templateFilesLoadError, refresh: refreshTemplateFiles } =
    useDeckTemplateFiles(user);
  const [fileUploadBusy, setFileUploadBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileDeleteConfirm, setFileDeleteConfirm] = useState<string | null>(null);

  const allTemplates = useMemo(() => [...DECK_PRESETS, ...custom], [custom]);

  useEffect(() => {
    if (!selected || !selected.loops) return;

    const result: Record<string, string> = {};
    for (const group of selected.loops) {
      const key = `ta-ppt-gen-loop-${group.id}`;
      if (typeof window !== "undefined") {
        result[group.id] = localStorage.getItem(key) || "";
      }
    }
    setLoopItems(result);
    setGeneratedDeck(null);
    setEditedSlides([]);
    setEditingSlideIdx(null);
    setGenerateError(null);
    // Intentionally syncing from external storage (localStorage) into state
    // when template changes, suppressing cascading render warning
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const handleUpdateFieldThenCommit = (key: keyof typeof selected, value: string) => {
    if (!selected) return;
    const next = { ...selected, [key]: value };
    commit(next, setCustom);
  };

  const handleUpdateSlideThenCommit = (slideId: string, updates: Partial<DeckSlide>) => {
    if (!selected) return;
    const next = {
      ...selected,
      slides: selected.slides.map((s) =>
        s.id === slideId ? { ...s, ...updates } : s
      ),
    };
    commit(next, setCustom);
  };

  const handleRemoveSlideThenCommit = (slideId: string) => {
    if (!selected) return;
    const next = {
      ...selected,
      slides: selected.slides.filter((s) => s.id !== slideId),
    };
    commit(next, setCustom);
  };

  const handleMoveSlideThemed = (index: number, direction: "up" | "down") => {
    if (!selected) return;
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= selected.slides.length) return;

    const slide = selected.slides[index];
    const adjacent = selected.slides[newIndex];

    if (slide.loopGroupId !== null) {
      if (adjacent.loopGroupId !== slide.loopGroupId) return;
    } else {
      if (adjacent.loopGroupId !== null) return;
    }

    const swapped = [...selected.slides];
    [swapped[index], swapped[newIndex]] = [swapped[newIndex], swapped[index]];

    const next = {
      ...selected,
      slides: swapped,
    };
    commit(next, setCustom);
  };

  const handleWrapSlideInLoopThenCommit = (slideId: string) => {
    if (!selected) return;
    const group = newDeckLoopGroup();
    const next = {
      ...selected,
      loops: [...selected.loops, group],
      slides: selected.slides.map((s) =>
        s.id === slideId ? { ...s, loopGroupId: group.id } : s
      ),
    };
    commit(next, setCustom);
  };

  const handleUpdateLoopGroupThenCommit = (loopId: string, updates: Partial<DeckLoopGroup>) => {
    if (!selected) return;
    const next = {
      ...selected,
      loops: selected.loops.map((g) =>
        g.id === loopId ? { ...g, ...updates } : g
      ),
    };
    commit(next, setCustom);
  };

  const handleAddSlideThenCommit = (role: string = "concept") => {
    if (!selected) return;
    const slide = newDeckSlide(role as SlideRole);
    const next = {
      ...selected,
      slides: [...selected.slides, slide],
    };
    commit(next, setCustom);
  };

  const handleAddSlideToLoopThenCommit = (gid: string) => {
    if (!selected) return;
    const s = newDeckSlide("concept");
    s.loopGroupId = gid;
    let lastIdx = -1;
    for (let i = selected.slides.length - 1; i >= 0; i--) {
      if (selected.slides[i].loopGroupId === gid) {
        lastIdx = i;
        break;
      }
    }
    const newSlides = [...selected.slides];
    newSlides.splice(lastIdx + 1, 0, s);
    const next = {
      ...selected,
      slides: newSlides,
    };
    commit(next, setCustom);
  };

  const handleMoveLoopThenCommit = (gid: string, dir: "up" | "down") => {
    if (!selected) return;
    let start = -1;
    let end = -1;
    for (let i = 0; i < selected.slides.length; i++) {
      if (selected.slides[i].loopGroupId === gid) {
        if (start === -1) start = i;
        end = i + 1;
      } else if (start !== -1) {
        break;
      }
    }
    if (start === -1) return;

    const newSlides = [...selected.slides];
    if (dir === "up") {
      if (start === 0) return;
      const pEnd = start;
      let pStart = start - 1;
      if (selected.slides[pStart].loopGroupId === null) {
        pStart = pEnd - 1;
      } else {
        const pGid = selected.slides[pStart].loopGroupId;
        while (pStart > 0 && selected.slides[pStart - 1].loopGroupId === pGid) {
          pStart--;
        }
      }
      const pBlock = newSlides.splice(pStart, pEnd - pStart);
      newSlides.splice(start - (pEnd - pStart), 0, ...pBlock);
    } else {
      if (end === selected.slides.length) return;
      const nStart = end;
      let nEnd = end + 1;
      if (selected.slides[nStart].loopGroupId === null) {
        nEnd = nStart + 1;
      } else {
        const nGid = selected.slides[nStart].loopGroupId;
        while (nEnd < selected.slides.length && selected.slides[nEnd].loopGroupId === nGid) {
          nEnd++;
        }
      }
      const nBlock = newSlides.splice(nStart, nEnd - nStart);
      newSlides.splice(start, 0, ...nBlock);
    }
    const next = {
      ...selected,
      slides: newSlides,
    };
    commit(next, setCustom);
  };

  const handleUngroupLoopThenCommit = (gid: string) => {
    if (!selected) return;
    const next = {
      ...selected,
      loops: selected.loops.filter((g) => g.id !== gid),
      slides: selected.slides.map((s) =>
        s.loopGroupId === gid ? { ...s, loopGroupId: null } : s
      ),
    };
    commit(next, setCustom);
  };

  const handleNewTemplate = async () => {
    const template = emptyDeckTemplate("Untitled deck");
    setCustom((prev) => [...prev, template]);
    setSelectedId(template.id);

    if (user && supabase) {
      try {
        await upsertDeckTemplate(supabase, user.id, template);
      } catch (err) {
        console.error("Failed to create template:", err);
      }
    }
  };

  const handleDuplicateTemplate = (template: DeckTemplate) => {
    const copy = duplicateDeckTemplate(template, template.name + " copy");
    setCustom((prev) => [...prev, copy]);
    setSelectedId(copy.id);

    if (user && supabase) {
      try {
        void upsertDeckTemplate(supabase, user.id, copy);
      } catch (err) {
        console.error("Failed to duplicate template:", err);
      }
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      return;
    }

    setDeleteConfirm(null);

    if (supabase) {
      try {
        await deleteDeckTemplate(supabase, id);
      } catch (err) {
        console.error("Failed to delete template:", err);
      }
    }

    setCustom((prev) => prev.filter((t) => t.id !== id));
    const nextId = allTemplates.find((t) => t.id !== id)?.id || DECK_PRESETS[0].id;
    setSelectedId(nextId);
  };

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // "data:<mime>;base64,<payload>" - keep only the payload.
        const comma = result.indexOf(",");
        resolve(comma === -1 ? result : result.slice(comma + 1));
      };
      reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
      reader.readAsDataURL(file);
    });

  const handlePickSourceFile = async (file: File) => {
    setSourceBusy(true);
    setSourceError(null);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await extractDeckSourceFileAction(file.name, base64);
      if ("error" in result) {
        setSourceError(result.error);
      } else {
        setSourceReceipt(result.receipt);
        setSourceMaterials(result.materials);
      }
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setSourceBusy(false);
    }
  };

  const handleResolveSourceRepo = async () => {
    const ref = sourceRepoText.trim();
    if (!ref || sourceReceipt) return;
    setSourceBusy(true);
    setSourceError(null);
    try {
      const result = await extractDeckSourceRepoAction(ref);
      if ("error" in result) {
        setSourceError(result.error);
      } else {
        setSourceReceipt(result.receipt);
        setSourceMaterials(result.materials);
        setSourceRepoText("");
      }
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : "Could not read that repository.");
    } finally {
      setSourceBusy(false);
    }
  };

  const handleClearSource = () => {
    setSourceReceipt(null);
    setSourceMaterials("");
    setSourceRepoText("");
    setSourceError(null);
  };

  const handleSelectTemplateFileId = (id: string) => {
    setSelectedFileId(id);
    setFileDeleteConfirm(null);
    setFileError(null);
  };

  const handleUploadTemplateFile = async (file: File) => {
    setFileUploadBusy(true);
    setFileError(null);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await uploadDeckTemplateFileAction(file.name.replace(/\.pptx$/i, ""), file.name, base64);
      if ("error" in result) {
        setFileError(result.error);
      } else {
        await refreshTemplateFiles();
        setSelectedFileId(result.template.id);
      }
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Could not upload that template.");
    } finally {
      setFileUploadBusy(false);
    }
  };

  const handleDeleteTemplateFile = async (id: string) => {
    if (fileDeleteConfirm !== id) {
      setFileDeleteConfirm(id);
      return;
    }
    setFileDeleteConfirm(null);
    try {
      const result = await deleteDeckTemplateFileAction(id);
      if ("error" in result) {
        setFileError(result.error);
        return;
      }
      await refreshTemplateFiles();
      if (selectedFileId === id) setSelectedFileId("");
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Could not delete that template.");
    }
  };

  const handleGenerateDeck = async () => {
    if (!selected) return;
    setGenerateBusy(true);
    setGenerateError(null);

    try {
      const resolvedLoopItems: Record<string, string[]> = {};
      for (const group of selected.loops) {
        if (group.source === "literal") {
          resolvedLoopItems[group.id] = group.items;
        } else {
          const items = loopItems[group.id] || "";
          resolvedLoopItems[group.id] = items
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }

      // A43-S/C2: a subject the instructor typed always wins; otherwise a
      // present source's own filename/first heading fills it in - Generate
      // must succeed with no subject typed, source or no source.
      const derivedSubject = sourceMaterials
        ? deriveSubjectFromSource(sourceReceipt?.name ?? "", sourceMaterials)
        : "";

      const ctx = {
        subject: subject || derivedSubject || selected.name,
        audience: audience || selected.audience,
        materials: sourceMaterials || undefined,
        loopItems: resolvedLoopItems,
      };

      const result = await generateDeckFromTemplateAction(selected, ctx, getStoredProvider());

      if ("error" in result) {
        setGenerateError(result.error);
      } else {
        setGeneratedDeck(result);
        setEditedSlides([...result.slides]);
        setEditingSlideIdx(null);
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setGenerateBusy(false);
    }
  };

  // A43-T: routes to the file-backed writer when a template is uploaded
  // (docs/a43-scope.md 11.3), else buildSlidesPptx. Shared by download and
  // save-to-Files so the two paths never drift apart.
  const buildOutputPptx = async (): Promise<{ bytes: ArrayBuffer; name: string } | { error: string }> => {
    if (!generatedDeck || !selected) return { error: "Generate a deck first." };
    if (selectedFileId) {
      const result = await fillDeckTemplateFileAction(selectedFileId, {
        presentationTitle: generatedDeck.presentationTitle,
        slides: editedSlides,
      });
      if ("error" in result) return result;
      return { bytes: base64ToBytes(result.base64), name: result.name };
    }
    const pptxTheme: PptxTheme | undefined = selected.theme && selected.theme.backgroundKind !== "classic"
      ? {
          backgroundKind: selected.theme.backgroundKind,
          backgroundColor: selected.theme.backgroundColor,
          backgroundColor2: selected.theme.backgroundColor2,
          fontColor: selected.theme.fontColor,
          backgroundImageData: gradientPng(selected.theme),
        }
      : undefined;
    const buf = await buildSlidesPptx({
      presentationTitle: generatedDeck.presentationTitle,
      slides: editedSlides,
      author: user?.user_metadata?.full_name || undefined,
      theme: pptxTheme,
    });
    return { bytes: buf, name: generatedDeck.presentationTitle };
  };

  const handleDownloadPptx = async () => {
    if (!generatedDeck || !selected) return;
    try {
      const out = await buildOutputPptx();
      if ("error" in out) {
        setGenerateError(out.error);
        return;
      }
      const blob = new Blob([out.bytes], { type: PPTX_MIME });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${out.name}.pptx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  const handleSaveToFiles = async () => {
    if (!generatedDeck || !user || !supabase || !selected) return;
    setSavingFile(true);
    try {
      const out = await buildOutputPptx();
      if ("error" in out) {
        setGenerateError(out.error);
        return;
      }
      const blob = new Blob([out.bytes], { type: PPTX_MIME });
      await saveRecordingFile(supabase, user.id, blob, {
        name: `${out.name}.pptx`,
        kind: "file",
        mimeType: PPTX_MIME,
        durationSec: null,
        fileExt: "pptx",
        source: null,
        origin: "manual",
      });
      setGenerateError(null);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Could not save file");
    } finally {
      setSavingFile(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!generatedDeck || !selected) return;
    setSavingDraft(true);
    try {
      const res = await savePresentationFileAction({
        presentationTitle: generatedDeck.presentationTitle,
        slides: editedSlides,
        theme: selected.theme,
        author: user?.user_metadata?.full_name || undefined,
      });
      if ("error" in res) {
        setDraftNote({ kind: "error", text: res.error });
      } else {
        draftedGradesInbox.refresh();
        setDraftNote({
          kind: "success",
          text: "Saved to Files",
        });
        setTimeout(() => setDraftNote(null), 3000);
      }
    } catch (err) {
      setDraftNote({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not save to Files",
      });
    } finally {
      setSavingDraft(false);
    }
  };

  // A43-C wave C2 (docs/a43-c-scope.md section 10-11): the CALLER of
  // /api/decks/ask (C3). Posts the current editedSlides + the instruction; on
  // { status: "ok" } sets editedSlides to the returned slides - the SAME
  // state onEditSlide already writes, so the preview and Download/Save both
  // pick it up unchanged. On "refused" the deck is left untouched and the
  // reason is shown; on error/partial the reducer's message is shown.
  const handleAskDeck = async () => {
    if (!generatedDeck || !askDraft.trim() || askBusy) return;
    setAskBusy(true);
    setAskOutcome(null);
    try {
      const res = await fetch(ASK_DECK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAskRequestBody(askDraft, editedSlides)),
      });
      const body = await res.json().catch(() => undefined);
      const outcome = reduceAskResponse(res.status, body);
      if (outcome.phase === "ok") {
        setEditedSlides(outcome.slides);
        setAskDraft("");
      } else if (outcome.phase === "refused") {
        setAskOutcome({ kind: "refused", text: outcome.reason });
      } else {
        setAskOutcome({ kind: "error", text: outcome.message, retryable: outcome.retryable });
      }
    } catch {
      setAskOutcome({
        kind: "error",
        text: "Could not reach the server. Check your connection and try again.",
        retryable: true,
      });
    } finally {
      setAskBusy(false);
    }
  };

  const isReadOnly = selected && isPresetDeckId(selected.id);

  return (
    <div className={styles.tabContainer}>
      <TabHeader
        eyebrow="Design"
        title="PowerPoint Design"
        subtitle="Build a reusable slide template - tag each slide with a role and let the assistant fill the specifics later."
      />

      <div style={{ display: "flex", gap: "var(--space-8)", marginTop: "var(--space-8)" }}>
        <TemplateSelector
          custom={custom}
          selectedId={selected.id}
          onSelectId={setSelectedId}
          onNewTemplate={handleNewTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          onDuplicateTemplate={handleDuplicateTemplate}
          deleteConfirm={deleteConfirm}
          loadError={loadError}
          templateFiles={templateFiles}
          selectedFileId={selectedFileId}
          onSelectFileId={handleSelectTemplateFileId}
          onUploadTemplateFile={handleUploadTemplateFile}
          onDeleteTemplateFile={handleDeleteTemplateFile}
          fileUploadBusy={fileUploadBusy}
          fileError={fileError ?? templateFilesLoadError}
          fileDeleteConfirm={fileDeleteConfirm}
        />

        {selected && (
          <div style={{ flex: 1, minHeight: "100vh" }}>
            {isReadOnly && (
              <div style={{
                padding: "var(--space-4)",
                marginBottom: "var(--space-6)",
                backgroundColor: "var(--surface-muted)",
                border: "1px solid var(--border-soft)",
                borderRadius: "var(--radius-md)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <span style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>
                  This is a built-in preset. Duplicate it to edit.
                </span>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => handleDuplicateTemplate(selected)}
                  sx={{ textTransform: "none", marginLeft: "var(--space-4)" }}
                >
                  Duplicate
                </Button>
              </div>
            )}

            <DeckSettingsPanel
              selected={selected}
              settingsOpen={settingsOpen}
              onSettingsOpenChange={setSettingsOpen}
              onUpdateField={handleUpdateFieldThenCommit}
              onUpdateTheme={(updates) => {
                const next = { ...selected, theme: { ...selected.theme, ...updates } };
                commit(next, setCustom);
              }}
              isReadOnly={isReadOnly}
            />

            <SlidesPanel
              selected={selected}
              isReadOnly={isReadOnly}
              onUpdateSlide={handleUpdateSlideThenCommit}
              onRemoveSlide={handleRemoveSlideThenCommit}
              onMoveSlide={handleMoveSlideThemed}
              onWrapSlideInLoop={handleWrapSlideInLoopThenCommit}
              onUpdateLoopGroup={handleUpdateLoopGroupThenCommit}
              onAddSlideToLoop={handleAddSlideToLoopThenCommit}
              onMoveLoop={handleMoveLoopThenCommit}
              onUngroupLoop={handleUngroupLoopThenCommit}
            />

            <AddContentPanel
              isReadOnly={isReadOnly}
              onAddSlide={handleAddSlideThenCommit}
              onAddLoop={() => {
                if (!selected) return;
                const group = newDeckLoopGroup();
                const s = newDeckSlide("concept");
                s.loopGroupId = group.id;
                const next = {
                  ...selected,
                  loops: [...selected.loops, group],
                  slides: [...selected.slides, s],
                };
                commit(next, setCustom);
              }}
            />

            <GeneratePanel
              selected={selected}
              subject={subject}
              audience={audience}
              loopItems={loopItems}
              sourceReceipt={sourceReceipt}
              sourceRepoText={sourceRepoText}
              sourceBusy={sourceBusy}
              sourceError={sourceError}
              generatedDeck={generatedDeck}
              editedSlides={editedSlides}
              editingSlideIdx={editingSlideIdx}
              generateBusy={generateBusy}
              generateError={generateError}
              savingFile={savingFile}
              savingDraft={savingDraft}
              draftNote={draftNote}
              askDraft={askDraft}
              askBusy={askBusy}
              askOutcome={askOutcome}
              onAskDraftChange={setAskDraft}
              onAskDeck={handleAskDeck}
              onSubjectChange={setSubject}
              onAudienceChange={setAudience}
              onLoopItemsChange={(groupId, value) => setLoopItems({ ...loopItems, [groupId]: value })}
              onSourceRepoTextChange={setSourceRepoText}
              onResolveSourceRepo={handleResolveSourceRepo}
              onPickSourceFile={handlePickSourceFile}
              onClearSource={handleClearSource}
              onGenerateDeck={handleGenerateDeck}
              onEditSlide={(idx, updates) => {
                const updated = [...editedSlides];
                updated[idx] = { ...updated[idx], ...updates };
                setEditedSlides(updated);
              }}
              onDownloadPptx={handleDownloadPptx}
              onSaveToFiles={handleSaveToFiles}
              onSaveDraft={handleSaveDraft}
              onRegenerate={() => {
                setGeneratedDeck(null);
                setEditedSlides([]);
                setEditingSlideIdx(null);
                setGenerateError(null);
              }}
              onSetEditingSlideIdx={setEditingSlideIdx}
              onDiscardSlideEdit={(idx) => {
                setEditedSlides((prev) =>
                  prev.map((s, i) => (i === idx ? generatedDeck!.slides[idx] : s))
                );
                setEditingSlideIdx(null);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
