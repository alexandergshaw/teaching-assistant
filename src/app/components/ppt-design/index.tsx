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
import { generateDeckFromTemplateAction, savePresentationDraftAction } from "@/app/actions";
import { buildSlidesPptx, type PptxTheme } from "@/lib/pptx";
import { saveRecordingFile } from "@/lib/recording-files";
import { getStoredProvider } from "@/lib/llm-provider";
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
} from "./hooks";
import { gradientPng } from "./utils";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

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

      const ctx = {
        subject: subject || selected.name,
        audience: audience || selected.audience,
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

  const handleDownloadPptx = async () => {
    if (!generatedDeck || !selected) return;
    try {
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
      const blob = new Blob([buf], { type: PPTX_MIME });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${generatedDeck.presentationTitle}.pptx`;
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
      const blob = new Blob([buf], { type: PPTX_MIME });
      await saveRecordingFile(supabase, user.id, blob, {
        name: `${generatedDeck.presentationTitle}.pptx`,
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
      const payload = {
        presentationTitle: generatedDeck.presentationTitle,
        slides: editedSlides,
        templateName: selected.name,
        subject,
        theme: selected.theme,
      };
      const res = await savePresentationDraftAction(
        `Presentation: ${generatedDeck.presentationTitle}`,
        payload
      );
      if ("error" in res) {
        setDraftNote({ kind: "error", text: res.error });
      } else {
        draftedGradesInbox.refresh();
        setDraftNote({
          kind: "success",
          text: "Saved to Drafts > Presentations",
        });
        setTimeout(() => setDraftNote(null), 3000);
      }
    } catch (err) {
      setDraftNote({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not save draft",
      });
    } finally {
      setSavingDraft(false);
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

      <div style={{ display: "flex", gap: "2rem", marginTop: "2rem" }}>
        <TemplateSelector
          custom={custom}
          selectedId={selected.id}
          onSelectId={setSelectedId}
          onNewTemplate={handleNewTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          onDuplicateTemplate={handleDuplicateTemplate}
          deleteConfirm={deleteConfirm}
          loadError={loadError}
        />

        {selected && (
          <div style={{ flex: 1, minHeight: "100vh" }}>
            {isReadOnly && (
              <div style={{
                padding: "1rem",
                marginBottom: "1.5rem",
                backgroundColor: "rgba(0,0,0,0.03)",
                borderRadius: "4px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                  This is a built-in preset. Duplicate it to edit.
                </span>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => handleDuplicateTemplate(selected)}
                  sx={{ textTransform: "none", marginLeft: "1rem" }}
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
              generatedDeck={generatedDeck}
              editedSlides={editedSlides}
              editingSlideIdx={editingSlideIdx}
              generateBusy={generateBusy}
              generateError={generateError}
              savingFile={savingFile}
              savingDraft={savingDraft}
              draftNote={draftNote}
              onSubjectChange={setSubject}
              onAudienceChange={setAudience}
              onLoopItemsChange={(groupId, value) => setLoopItems({ ...loopItems, [groupId]: value })}
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
