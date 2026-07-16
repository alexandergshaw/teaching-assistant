"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  TextField,
  MenuItem,
  Select,
  FormControlLabel,
  Checkbox,
  Card,
  CardContent,
  Collapse,
  FormHelperText,
  CircularProgress,
} from "@mui/material";
import TabHeader from "./TabHeader";
import { useSupabase } from "@/context/SupabaseProvider";
import {
  listDeckTemplates,
  upsertDeckTemplate,
  deleteDeckTemplate,
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
  getSlideRole,
  SLIDE_ROLES,
  type DeckTemplate,
  type DeckSlide,
  type DeckLoopGroup,
  type SlideRole,
  type LoopSourceKind,
} from "@/lib/decks/types";
import { generateDeckFromTemplateAction, savePresentationDraftAction } from "@/app/actions";
import { buildSlidesPptx, type PptxSlide } from "@/lib/pptx";
import { saveRecordingFile } from "@/lib/recording-files";
import { getStoredProvider } from "@/lib/llm-provider";
import styles from "../page.module.css";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export default function PowerPointDesignTab() {
  const { supabase, user } = useSupabase();

  const pendingRef = useRef<DeckTemplate | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load custom templates on mount
  const [custom, setCustom] = useState<DeckTemplate[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // View control: selected template ID, persisted to localStorage
  const [selectedId, setSelectedId] = useState<string>(() => {
    if (typeof window === "undefined") return DECK_PRESETS[0].id;
    const saved = localStorage.getItem("ta-ppt-selected-id");
    if (saved) return saved;
    return DECK_PRESETS[0].id;
  });

  // Persist selectedId to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("ta-ppt-selected-id", selectedId);
    } catch {
      // Ignore storage failures
    }
  }, [selectedId]);

  // Deck settings section open/closed state
  const [settingsOpen, setSettingsOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("ta-ppt-settings-open");
    return saved ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    try {
      localStorage.setItem("ta-ppt-settings-open", JSON.stringify(settingsOpen));
    } catch {
      // Ignore storage failures
    }
  }, [settingsOpen]);

  // Generation state
  const [generatedDeck, setGeneratedDeck] = useState<{ presentationTitle: string; slides: PptxSlide[] } | null>(null);
  const [subject, setSubject] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-ppt-gen-subject") || "";
  });
  const [audience, setAudience] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-ppt-gen-audience") || "";
  });
  const [loopItems, setLoopItems] = useState<Record<string, string>>({});
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [editingSlideIdx, setEditingSlideIdx] = useState<number | null>(null);
  const [editedSlides, setEditedSlides] = useState<PptxSlide[]>([]);
  const [savingFile, setSavingFile] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftNote, setDraftNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Persist subject and audience
  useEffect(() => {
    try {
      localStorage.setItem("ta-ppt-gen-subject", subject);
    } catch {
      // Ignore
    }
  }, [subject]);

  useEffect(() => {
    try {
      localStorage.setItem("ta-ppt-gen-audience", audience);
    } catch {
      // Ignore
    }
  }, [audience]);

  // Persist loop items
  useEffect(() => {
    try {
      for (const [groupId, items] of Object.entries(loopItems)) {
        const key = `ta-ppt-gen-loop-${groupId}`;
        localStorage.setItem(key, items);
      }
    } catch {
      // Ignore
    }
  }, [loopItems]);

  // Load custom templates from Supabase on mount
  useEffect(() => {
    if (!user || !supabase) return;

    let cancelled = false;

    (async () => {
      try {
        const rows = await listDeckTemplates(supabase, user.id);
        if (!cancelled) {
          setCustom(rows);
        }
      } catch (err) {
        console.error("Failed to load deck templates:", err);
        if (!cancelled) {
          setLoadError("Failed to load templates");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  // Debounced autosave helper
  const commit = (next: DeckTemplate) => {
    setCustom((prev) => prev.map((t) => (t.id === next.id ? next : t)));

    if (user && supabase && !isPresetDeckId(next.id)) {
      pendingRef.current = next;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        if (pendingRef.current) {
          void upsertDeckTemplate(supabase, user.id, pendingRef.current).catch(
            console.error
          );
        }
        pendingRef.current = null;
      }, 800);
    }
  };

  // Combined list: presets + custom
  const allTemplates = useMemo(() => [...DECK_PRESETS, ...custom], [custom]);
  const selected = allTemplates.find((t) => t.id === selectedId) || DECK_PRESETS[0];

  // Sync loop items when selected template changes
  useEffect(() => {
    if (!selected || !selected.loops) return;

    const result: Record<string, string> = {};
    for (const group of selected.loops) {
      const key = `ta-ppt-gen-loop-${group.id}`;
      if (typeof window !== "undefined") {
        result[group.id] = localStorage.getItem(key) || "";
      }
    }
    // Intentionally syncing from external storage (localStorage) into state
    // when template changes, suppressing cascading render warning
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoopItems(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Create a new template
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

  // Duplicate a template
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

  // Delete a template (two-click confirm)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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

    // Switch to another template
    const nextId = allTemplates.find((t) => t.id !== id)?.id || DECK_PRESETS[0].id;
    setSelectedId(nextId);
  };

  // Update deck settings
  const handleUpdateField = (key: keyof DeckTemplate, value: string) => {
    if (!selected) return;
    const next = { ...selected, [key]: value };
    commit(next);
  };

  // Add a loop group
  const handleAddLoopGroup = () => {
    if (!selected) return;
    const newGroup = newDeckLoopGroup();
    const next = {
      ...selected,
      loops: [...selected.loops, newGroup],
    };
    commit(next);
  };

  // Update loop group
  const handleUpdateLoopGroup = (loopId: string, updates: Partial<DeckLoopGroup>) => {
    if (!selected) return;
    const next = {
      ...selected,
      loops: selected.loops.map((g) =>
        g.id === loopId ? { ...g, ...updates } : g
      ),
    };
    commit(next);
  };

  // Remove a loop group
  const handleRemoveLoopGroup = (loopId: string) => {
    if (!selected) return;
    const next = {
      ...selected,
      loops: selected.loops.filter((g) => g.id !== loopId),
      slides: selected.slides.map((s) =>
        s.loopGroupId === loopId ? { ...s, loopGroupId: null } : s
      ),
    };
    commit(next);
  };

  // Check if a loop group is contiguous
  const isLoopContiguous = (loopId: string): boolean => {
    if (!selected) return true;
    const indices = selected.slides
      .map((s, i) => (s.loopGroupId === loopId ? i : -1))
      .filter((i) => i !== -1);
    if (indices.length === 0) return true;
    for (let i = 0; i < indices.length - 1; i++) {
      if (indices[i + 1] !== indices[i] + 1) return false;
    }
    return true;
  };

  // Add a slide
  const handleAddSlide = (role: string = "concept") => {
    if (!selected) return;
    const slide = newDeckSlide(role as SlideRole);
    const next = {
      ...selected,
      slides: [...selected.slides, slide],
    };
    commit(next);
  };

  // Update a slide
  const handleUpdateSlide = (slideId: string, updates: Partial<DeckSlide>) => {
    if (!selected) return;
    const next = {
      ...selected,
      slides: selected.slides.map((s) =>
        s.id === slideId ? { ...s, ...updates } : s
      ),
    };
    commit(next);
  };

  // Remove a slide
  const handleRemoveSlide = (slideId: string) => {
    if (!selected) return;
    const next = {
      ...selected,
      slides: selected.slides.filter((s) => s.id !== slideId),
    };
    commit(next);
  };

  // Move a slide up or down
  const handleMoveSlide = (index: number, direction: "up" | "down") => {
    if (!selected) return;
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= selected.slides.length) return;

    const swapped = [...selected.slides];
    [swapped[index], swapped[newIndex]] = [swapped[newIndex], swapped[index]];

    const next = {
      ...selected,
      slides: swapped,
    };
    commit(next);
  };

  // Handle deck generation
  const handleGenerateDeck = async () => {
    if (!selected) return;
    setGenerateBusy(true);
    setGenerateError(null);

    try {
      const resolvedLoopItems: Record<string, string[]> = {};
      for (const group of selected.loops) {
        const items = loopItems[group.id] || "";
        resolvedLoopItems[group.id] = items
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
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

  // Handle slide edit
  const handleEditSlide = (idx: number, updates: Partial<PptxSlide>) => {
    const updated = [...editedSlides];
    updated[idx] = { ...updated[idx], ...updates };
    setEditedSlides(updated);
  };

  // Handle download
  const handleDownloadPptx = async () => {
    if (!generatedDeck) return;
    try {
      const buf = await buildSlidesPptx({
        presentationTitle: generatedDeck.presentationTitle,
        slides: editedSlides,
        author: user?.user_metadata?.full_name || undefined,
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

  // Handle save to Files
  const handleSaveToFiles = async () => {
    if (!generatedDeck || !user || !supabase) return;
    setSavingFile(true);
    try {
      const buf = await buildSlidesPptx({
        presentationTitle: generatedDeck.presentationTitle,
        slides: editedSlides,
        author: user?.user_metadata?.full_name || undefined,
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

  // Handle save as draft
  const handleSaveDraft = async () => {
    if (!generatedDeck) return;
    setSavingDraft(true);
    try {
      const payload = {
        presentationTitle: generatedDeck.presentationTitle,
        slides: editedSlides,
        templateName: selected.name,
        subject,
      };
      const res = await savePresentationDraftAction(
        `Presentation: ${generatedDeck.presentationTitle}`,
        payload
      );
      if ("error" in res) {
        setDraftNote({ kind: "error", text: res.error });
      } else {
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
        {/* LEFT COLUMN: Template list */}
        <div style={{ flex: "0 0 280px" }}>
          <div style={{ marginBottom: "1rem" }}>
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "0.95rem", fontWeight: 600 }}>
              Presets
            </h3>
            {DECK_PRESETS.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                style={{
                  padding: "0.75rem",
                  marginBottom: "0.5rem",
                  cursor: "pointer",
                  borderRadius: "4px",
                  border: selectedId === t.id ? "2px solid var(--accent)" : "1px solid var(--field-border)",
                  backgroundColor: selectedId === t.id ? "var(--accent)" : "transparent",
                  color: selectedId === t.id ? "white" : "inherit",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{t.name}</div>
                <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                  {t.slides.length} slides
                </div>
              </div>
            ))}
          </div>

          <div>
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "0.95rem", fontWeight: 600 }}>
              Your templates
            </h3>
            {custom.length === 0 ? (
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                No custom templates yet.
              </div>
            ) : (
              custom.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  style={{
                    padding: "0.75rem",
                    marginBottom: "0.5rem",
                    cursor: "pointer",
                    borderRadius: "4px",
                    border: selectedId === t.id ? "2px solid var(--accent)" : "1px solid var(--field-border)",
                    backgroundColor: selectedId === t.id ? "var(--accent)" : "transparent",
                    color: selectedId === t.id ? "white" : "inherit",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{t.name}</div>
                  <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                    {t.slides.length} slides
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <Button
              variant="contained"
              size="small"
              onClick={handleNewTemplate}
              sx={{ textTransform: "none" }}
            >
              New template
            </Button>
            {selected && !isPresetDeckId(selected.id) && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleDeleteTemplate(selected.id)}
                sx={{ textTransform: "none", color: deleteConfirm === selected.id ? "red" : "inherit" }}
              >
                {deleteConfirm === selected.id ? "Confirm delete" : "Delete"}
              </Button>
            )}
            {selected && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleDuplicateTemplate(selected)}
                sx={{ textTransform: "none" }}
              >
                Duplicate
              </Button>
            )}
          </div>

          {loadError && (
            <div style={{ marginTop: "1rem", padding: "0.75rem", backgroundColor: "rgba(255,0,0,0.1)", borderRadius: "4px", fontSize: "0.85rem", color: "red" }}>
              {loadError}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Editor */}
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

            {/* Deck settings */}
            <div style={{ marginBottom: "1.5rem" }}>
              <div
                onClick={() => setSettingsOpen(!settingsOpen)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  marginBottom: "0.5rem",
                  padding: "0.5rem",
                  borderRadius: "4px",
                }}
              >
                <span style={{ fontSize: "1rem", marginRight: "0.5rem" }}>
                  {settingsOpen ? ">" : "v"}
                </span>
                <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>
                  Deck settings
                </h3>
              </div>
              <Collapse in={settingsOpen}>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <TextField
                    label="Name"
                    value={selected.name}
                    onChange={(e) => handleUpdateField("name", e.target.value)}
                    disabled={isReadOnly}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Description"
                    value={selected.description}
                    onChange={(e) => handleUpdateField("description", e.target.value)}
                    disabled={isReadOnly}
                    fullWidth
                    multiline
                    rows={2}
                    size="small"
                  />
                  <TextField
                    label="Audience"
                    value={selected.audience}
                    onChange={(e) => handleUpdateField("audience", e.target.value)}
                    disabled={isReadOnly}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Tone"
                    value={selected.tone}
                    onChange={(e) => handleUpdateField("tone", e.target.value)}
                    disabled={isReadOnly}
                    fullWidth
                    size="small"
                  />
                </div>
              </Collapse>
            </div>

            {/* Loops panel */}
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ margin: "0 0 1rem 0", fontSize: "0.95rem", fontWeight: 600 }}>
                Loops (repeat a block of slides for a list)
              </h3>
              {selected.loops.length === 0 ? (
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                  No loop groups defined.
                </div>
              ) : (
                selected.loops.map((group) => (
                  <Card key={group.id} style={{ marginBottom: "1rem" }}>
                    <CardContent>
                      <TextField
                        label="Label"
                        value={group.label}
                        onChange={(e) => handleUpdateLoopGroup(group.id, { label: e.target.value })}
                        disabled={isReadOnly}
                        fullWidth
                        size="small"
                        style={{ marginBottom: "1rem" }}
                      />
                      <Select
                        value={group.source}
                        onChange={(e) => handleUpdateLoopGroup(group.id, { source: e.target.value as LoopSourceKind })}
                        disabled={isReadOnly}
                        fullWidth
                        size="small"
                        style={{ marginBottom: "1rem" }}
                      >
                        <MenuItem value="runtime">Ask at generate time</MenuItem>
                        <MenuItem value="literal">Fixed list</MenuItem>
                        <MenuItem value="courseTopics">Course topics</MenuItem>
                      </Select>

                      {group.source === "literal" && (
                        <TextField
                          label="Items (one per line)"
                          value={group.items.join("\n")}
                          onChange={(e) => handleUpdateLoopGroup(group.id, { items: e.target.value.split("\n").filter(Boolean) })}
                          disabled={isReadOnly}
                          fullWidth
                          multiline
                          rows={3}
                          size="small"
                          style={{ marginBottom: "1rem" }}
                        />
                      )}

                      {group.source === "runtime" && (
                        <TextField
                          label="Prompt label"
                          value={group.runtimeLabel || ""}
                          onChange={(e) => handleUpdateLoopGroup(group.id, { runtimeLabel: e.target.value })}
                          disabled={isReadOnly}
                          fullWidth
                          size="small"
                          style={{ marginBottom: "1rem" }}
                          placeholder="e.g., Concepts"
                        />
                      )}

                      {group.source === "courseTopics" && (
                        <FormHelperText style={{ marginBottom: "1rem" }}>
                          You will pick a course when you generate.
                        </FormHelperText>
                      )}

                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => handleRemoveLoopGroup(group.id)}
                        disabled={isReadOnly}
                        sx={{ textTransform: "none" }}
                      >
                        Remove group
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
              <Button
                variant="outlined"
                size="small"
                onClick={handleAddLoopGroup}
                disabled={isReadOnly}
                sx={{ textTransform: "none" }}
              >
                Add loop group
              </Button>
            </div>

            {/* Slides panel */}
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ margin: "0 0 1rem 0", fontSize: "0.95rem", fontWeight: 600 }}>
                Slides ({selected.slides.length})
              </h3>
              {selected.slides.map((slide, idx) => {
                const isLoopContiguousHere = isLoopContiguous(slide.loopGroupId ?? "");
                return (
                  <Card key={slide.id} style={{ marginBottom: "1rem" }}>
                    <CardContent>
                      <Select
                        value={slide.role}
                        onChange={(e) => handleUpdateSlide(slide.id, { role: e.target.value as SlideRole })}
                        disabled={isReadOnly}
                        fullWidth
                        size="small"
                        style={{ marginBottom: "1rem" }}
                      >
                        {SLIDE_ROLES.map((r) => (
                          <MenuItem key={r.role} value={r.role}>
                            {r.label}
                          </MenuItem>
                        ))}
                      </Select>

                      <TextField
                        label="Title (optional)"
                        value={slide.title}
                        onChange={(e) => handleUpdateSlide(slide.id, { title: e.target.value })}
                        disabled={isReadOnly}
                        fullWidth
                        size="small"
                        style={{ marginBottom: "1rem" }}
                      />

                      <TextField
                        label="Notes - what should be on this slide"
                        value={slide.notes}
                        onChange={(e) => handleUpdateSlide(slide.id, { notes: e.target.value })}
                        disabled={isReadOnly}
                        fullWidth
                        multiline
                        rows={3}
                        size="small"
                        style={{ marginBottom: "1rem" }}
                        placeholder={getSlideRole(slide.role)?.hint}
                      />

                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={slide.includeCode}
                            onChange={(e) => {
                              const willInclude = e.target.checked;
                              const lang = willInclude ? (slide.codeLanguage || "python") : "";
                              handleUpdateSlide(slide.id, {
                                includeCode: willInclude,
                                codeLanguage: lang,
                              });
                            }}
                            disabled={isReadOnly}
                          />
                        }
                        label="Include code"
                        style={{ marginBottom: "1rem" }}
                      />

                      {slide.includeCode && (
                        <TextField
                          label="Language"
                          value={slide.codeLanguage}
                          onChange={(e) => handleUpdateSlide(slide.id, { codeLanguage: e.target.value })}
                          disabled={isReadOnly}
                          fullWidth
                          size="small"
                          style={{ marginBottom: "1rem" }}
                          placeholder="python"
                        />
                      )}

                      <TextField
                        label="Max bullets"
                        type="number"
                        value={slide.maxBullets}
                        onChange={(e) => handleUpdateSlide(slide.id, { maxBullets: parseInt(e.target.value) || 0 })}
                        disabled={isReadOnly}
                        fullWidth
                        size="small"
                        style={{ marginBottom: "1rem" }}
                        slotProps={{ htmlInput: { min: 0 } }}
                        helperText={`Role default: ${getSlideRole(slide.role)?.maxBulletsDefault ?? "N/A"}`}
                      />

                      <Select
                        value={slide.loopGroupId || "none"}
                        onChange={(e) => handleUpdateSlide(slide.id, { loopGroupId: e.target.value === "none" ? null : e.target.value })}
                        disabled={isReadOnly}
                        fullWidth
                        size="small"
                        style={{ marginBottom: "1rem" }}
                      >
                        <MenuItem value="none">None</MenuItem>
                        {selected.loops.map((g) => (
                          <MenuItem key={g.id} value={g.id}>
                            {g.label}
                          </MenuItem>
                        ))}
                      </Select>

                      {slide.loopGroupId && !isLoopContiguousHere && (
                        <div style={{ padding: "0.75rem", backgroundColor: "rgba(255, 193, 7, 0.1)", borderRadius: "4px", fontSize: "0.85rem", marginBottom: "1rem", color: "var(--text-secondary)" }}>
                          Loop slides should be adjacent to repeat together.
                        </div>
                      )}

                      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleMoveSlide(idx, "up")}
                          disabled={isReadOnly || idx === 0}
                          sx={{ textTransform: "none" }}
                        >
                          Move up
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleMoveSlide(idx, "down")}
                          disabled={isReadOnly || idx === selected.slides.length - 1}
                          sx={{ textTransform: "none" }}
                        >
                          Move down
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleRemoveSlide(slide.id)}
                          disabled={isReadOnly}
                          sx={{ textTransform: "none" }}
                        >
                          Remove
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Add slide control */}
            <div style={{ marginBottom: "1.5rem", padding: "1rem", backgroundColor: "var(--field-bg)", borderRadius: "4px" }}>
              <h4 style={{ margin: "0 0 1rem 0", fontSize: "0.9rem" }}>Add slide</h4>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Select
                  defaultValue="concept"
                  disabled={isReadOnly}
                  size="small"
                  sx={{ flex: 1 }}
                  onChange={(e) => {
                    handleAddSlide(e.target.value);
                    (e.target as HTMLSelectElement).value = "concept";
                  }}
                >
                  {SLIDE_ROLES.map((r) => (
                    <MenuItem key={r.role} value={r.role}>
                      {r.label}
                    </MenuItem>
                  ))}
                </Select>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => handleAddSlide("concept")}
                  disabled={isReadOnly}
                  sx={{ textTransform: "none" }}
                >
                  Add slide
                </Button>
              </div>
            </div>

            {/* Generate panel */}
            <div style={{ padding: "1.5rem", backgroundColor: "var(--field-bg)", borderRadius: "4px", marginBottom: "1.5rem" }}>
              <h3 style={{ margin: "0 0 1rem 0", fontSize: "0.95rem", fontWeight: 600 }}>
                Generate Deck
              </h3>

              {!generatedDeck ? (
                <>
                  {/* Generate inputs */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
                    <TextField
                      label="Subject / topic"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      fullWidth
                      size="small"
                      placeholder={selected?.name || "e.g., Python Loops"}
                    />
                    <TextField
                      label="Audience"
                      value={audience}
                      onChange={(e) => setAudience(e.target.value)}
                      fullWidth
                      size="small"
                      placeholder={selected?.audience || "e.g., Intro CS undergraduates"}
                    />

                    {/* Loop items inputs */}
                    {selected && selected.loops.map((group) => (
                      <div key={group.id}>
                        {group.source === "literal" && (
                          <div style={{ padding: "0.75rem", backgroundColor: "rgba(0,0,0,0.02)", borderRadius: "4px" }}>
                            <div style={{ fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.5rem" }}>
                              {group.label}
                            </div>
                            {group.items.length > 0 ? (
                              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                                {group.items.map((item, i) => (
                                  <span key={i} style={{ backgroundColor: "rgba(0,0,0,0.1)", padding: "0.25rem 0.5rem", borderRadius: "3px" }}>
                                    {item}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                                No items defined
                              </div>
                            )}
                          </div>
                        )}

                        {group.source === "runtime" && (
                          <TextField
                            label={group.runtimeLabel || group.label}
                            value={loopItems[group.id] || ""}
                            onChange={(e) => setLoopItems({ ...loopItems, [group.id]: e.target.value })}
                            fullWidth
                            multiline
                            rows={3}
                            size="small"
                            placeholder="One item per line"
                            helperText="Enter items (one per line) to repeat the slides"
                          />
                        )}

                        {group.source === "courseTopics" && (
                          <div style={{ padding: "0.75rem", backgroundColor: "rgba(0,0,0,0.02)", borderRadius: "4px" }}>
                            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
                              Course topics not wired yet - type them here
                            </div>
                            <TextField
                              label={group.label}
                              value={loopItems[group.id] || ""}
                              onChange={(e) => setLoopItems({ ...loopItems, [group.id]: e.target.value })}
                              fullWidth
                              multiline
                              rows={3}
                              size="small"
                              placeholder="One topic per line"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {generateError && (
                    <div style={{ padding: "0.75rem", backgroundColor: "rgba(255,0,0,0.1)", borderRadius: "4px", fontSize: "0.85rem", color: "red", marginBottom: "1rem" }}>
                      {generateError}
                    </div>
                  )}

                  <Button
                    variant="contained"
                    onClick={handleGenerateDeck}
                    disabled={generateBusy || !subject}
                    sx={{ textTransform: "none" }}
                  >
                    {generateBusy ? (
                      <>
                        <CircularProgress size={16} sx={{ marginRight: "0.5rem" }} /> Generating...
                      </>
                    ) : (
                      "Generate deck"
                    )}
                  </Button>
                </>
              ) : (
                <>
                  {/* Preview slides */}
                  <div style={{ marginBottom: "1.5rem" }}>
                    <h4 style={{ margin: "0 0 1rem 0", fontSize: "0.9rem", fontWeight: 600 }}>
                      Preview ({editedSlides.length} slides)
                    </h4>
                    {editedSlides.map((slide, idx) => (
                      <Card key={idx} style={{ marginBottom: "1rem" }}>
                        <CardContent>
                          {editingSlideIdx === idx ? (
                            <>
                              <TextField
                                label="Title"
                                value={slide.title}
                                onChange={(e) => handleEditSlide(idx, { title: e.target.value })}
                                fullWidth
                                size="small"
                                style={{ marginBottom: "1rem" }}
                              />
                              <TextField
                                label="Bullets (one per line)"
                                value={slide.bullets.join("\n")}
                                onChange={(e) => handleEditSlide(idx, { bullets: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                                fullWidth
                                multiline
                                rows={3}
                                size="small"
                                style={{ marginBottom: "1rem" }}
                              />
                              {slide.code && (
                                <TextField
                                  label="Code"
                                  value={slide.code}
                                  onChange={(e) => handleEditSlide(idx, { code: e.target.value })}
                                  fullWidth
                                  multiline
                                  rows={4}
                                  size="small"
                                  style={{ marginBottom: "1rem", fontFamily: "monospace" }}
                                />
                              )}
                              <div style={{ display: "flex", gap: "0.5rem" }}>
                                <Button
                                  variant="contained"
                                  size="small"
                                  onClick={() => setEditingSlideIdx(null)}
                                  sx={{ textTransform: "none" }}
                                >
                                  Done
                                </Button>
                                <Button
                                  variant="outlined"
                                  size="small"
                                  onClick={() => {
                                    setEditingSlideIdx(null);
                                    setEditedSlides([...generatedDeck!.slides]);
                                  }}
                                  sx={{ textTransform: "none" }}
                                >
                                  Discard
                                </Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "0.75rem" }}>
                                <h5 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>{slide.title}</h5>
                                <Button
                                  variant="text"
                                  size="small"
                                  onClick={() => setEditingSlideIdx(idx)}
                                  sx={{ textTransform: "none" }}
                                >
                                  Edit
                                </Button>
                              </div>
                              {slide.bullets.length > 0 && (
                                <ul style={{ margin: "0.5rem 0", paddingLeft: "1.5rem", fontSize: "0.9rem" }}>
                                  {slide.bullets.map((bullet, i) => (
                                    <li key={i}>{bullet}</li>
                                  ))}
                                </ul>
                              )}
                              {slide.code && (
                                <div style={{ marginTop: "0.75rem", padding: "0.75rem", backgroundColor: "rgba(0,0,0,0.05)", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.8rem", overflow: "auto", maxHeight: "150px", color: "var(--text-secondary)" }}>
                                  {slide.codeLanguage && <div style={{ fontSize: "0.75rem", fontWeight: 500, marginBottom: "0.25rem" }}>{slide.codeLanguage.toUpperCase()}</div>}
                                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{slide.code}</pre>
                                </div>
                              )}
                            </>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Draft note */}
                  {draftNote && (
                    <div
                      style={{
                        padding: "0.75rem",
                        marginBottom: "1rem",
                        backgroundColor:
                          draftNote.kind === "error"
                            ? "rgba(220, 38, 38, 0.1)"
                            : "rgba(16, 185, 129, 0.1)",
                        color:
                          draftNote.kind === "error" ? "#991b1b" : "#065f46",
                        borderRadius: "4px",
                        fontSize: "0.9rem",
                      }}
                    >
                      {draftNote.text}
                    </div>
                  )}

                  {/* Export/save actions */}
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleDownloadPptx}
                      sx={{ textTransform: "none" }}
                    >
                      Download .pptx
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleSaveToFiles}
                      disabled={savingFile}
                      sx={{ textTransform: "none" }}
                    >
                      {savingFile ? "Saving..." : "Save to Files"}
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={savingDraft}
                      onClick={handleSaveDraft}
                      sx={{ textTransform: "none" }}
                    >
                      {savingDraft ? "Saving..." : "Save as draft"}
                    </Button>
                  </div>

                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setGeneratedDeck(null);
                      setEditedSlides([]);
                      setEditingSlideIdx(null);
                      setGenerateError(null);
                    }}
                    sx={{ textTransform: "none" }}
                  >
                    Regenerate
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
