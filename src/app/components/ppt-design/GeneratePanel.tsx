"use client";

import { TextField, Button, CircularProgress, Card, CardContent } from "@mui/material";
import type { PptxSlide } from "@/lib/pptx";
import type { DeckTemplate } from "@/lib/decks/types";
import { needsOnNavyFocusRing } from "@/lib/focus-ring-fill";

interface GeneratePanelProps {
  selected: DeckTemplate;
  subject: string;
  audience: string;
  loopItems: Record<string, string>;
  generatedDeck: { presentationTitle: string; slides: PptxSlide[] } | null;
  editedSlides: PptxSlide[];
  editingSlideIdx: number | null;
  generateBusy: boolean;
  generateError: string | null;
  savingFile: boolean;
  savingDraft: boolean;
  draftNote: { kind: "success" | "error"; text: string } | null;
  onSubjectChange: (value: string) => void;
  onAudienceChange: (value: string) => void;
  onLoopItemsChange: (groupId: string, value: string) => void;
  onGenerateDeck: () => void;
  onEditSlide: (idx: number, updates: Partial<PptxSlide>) => void;
  onDownloadPptx: () => void;
  onSaveToFiles: () => void;
  onSaveDraft: () => void;
  onRegenerate: () => void;
  onSetEditingSlideIdx: (idx: number | null) => void;
  onDiscardSlideEdit: (idx: number) => void;
}

export default function GeneratePanel({
  selected,
  subject,
  audience,
  loopItems,
  generatedDeck,
  editedSlides,
  editingSlideIdx,
  generateBusy,
  generateError,
  savingFile,
  savingDraft,
  draftNote,
  onSubjectChange,
  onAudienceChange,
  onLoopItemsChange,
  onGenerateDeck,
  onEditSlide,
  onDownloadPptx,
  onSaveToFiles,
  onSaveDraft,
  onRegenerate,
  onSetEditingSlideIdx,
  onDiscardSlideEdit,
}: GeneratePanelProps) {
  return (
    <div style={{ padding: "var(--space-6)", backgroundColor: "var(--field-bg)", border: "1px solid var(--border-soft)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-6)" }}>
      <h3
        style={{
          margin: "0 0 var(--space-4) 0",
          fontSize: "var(--font-size-2xs)",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-secondary)",
        }}
      >
        Generate deck
      </h3>

      {!generatedDeck ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", marginBottom: "var(--space-6)" }}>
            <TextField
              label="Subject / topic"
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              fullWidth
              size="small"
              placeholder={selected?.name || "e.g., Python Loops"}
            />
            <TextField
              label="Audience"
              value={audience}
              onChange={(e) => onAudienceChange(e.target.value)}
              fullWidth
              size="small"
              placeholder={selected?.audience || "e.g., Intro CS undergraduates"}
            />

            {selected && selected.loops.map((group) => (
              <div key={group.id}>
                {group.source === "literal" && (
                  <div style={{ padding: "var(--space-3)", backgroundColor: "var(--surface-muted)", borderRadius: "var(--radius-xs)" }}>
                    <div style={{ fontSize: "var(--font-size-md)", fontWeight: 500, marginBottom: "var(--space-2)" }}>
                      {group.label}
                    </div>
                    {group.items.length > 0 ? (
                      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                        {group.items.map((item, i) => (
                          <span
                            key={i}
                            style={{
                              backgroundColor: "var(--field-background)",
                              border: "1px solid var(--border-soft)",
                              padding: "var(--space-1) var(--space-2)",
                              borderRadius: "var(--radius-xs)",
                            }}
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>
                        No items defined
                      </div>
                    )}
                  </div>
                )}

                {group.source === "runtime" && (
                  <TextField
                    label={group.runtimeLabel || group.label}
                    value={loopItems[group.id] || ""}
                    onChange={(e) => onLoopItemsChange(group.id, e.target.value)}
                    fullWidth
                    multiline
                    rows={3}
                    size="small"
                    placeholder="One item per line"
                    helperText="Enter items (one per line) to repeat the slides"
                  />
                )}

                {group.source === "courseTopics" && (
                  <div style={{ padding: "var(--space-3)", backgroundColor: "var(--surface-muted)", borderRadius: "var(--radius-xs)" }}>
                    <div style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)", marginBottom: "var(--space-3)" }}>
                      Course topics not wired yet - type them here
                    </div>
                    <TextField
                      label={group.label}
                      value={loopItems[group.id] || ""}
                      onChange={(e) => onLoopItemsChange(group.id, e.target.value)}
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
            <div
              style={{
                padding: "var(--space-3)",
                backgroundColor: "var(--danger-surface)",
                border: "1px solid var(--danger-border)",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--font-size-sm)",
                color: "var(--danger)",
                marginBottom: "var(--space-4)",
              }}
            >
              {generateError}
            </div>
          )}

          <Button
            variant="contained"
            onClick={onGenerateDeck}
            disabled={generateBusy || !subject}
            sx={{ textTransform: "none" }}
          >
            {generateBusy ? (
              <span role="status" aria-live="polite">
                <CircularProgress size={16} sx={{ marginRight: "var(--space-2)" }} /> Generating…
              </span>
            ) : (
              "Generate deck"
            )}
          </Button>
        </>
      ) : (
        <>
          <div style={{ marginBottom: "var(--space-6)" }}>
            <h4
              style={{
                margin: "0 0 var(--space-4) 0",
                fontSize: "var(--font-size-2xs)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-secondary)",
              }}
            >
              Preview ({editedSlides.length} slides)
            </h4>
            {editedSlides.map((slide, idx) => {
              // The three TextFields and three Buttons below render directly on
              // this fill. MuiButtonBase's focus-visible outline (theme.ts)
              // reads var(--focus-ring-color), which defaults to
              // --focus-ring-default (tuned for the app's own light/white
              // surfaces) - too low-contrast on a dark fill. The fill colour
              // here is user-configurable (backgroundColor/backgroundColor2 in
              // src/lib/decks/types.ts accept any hex), so a static
              // classic-only map isn't enough; needsOnNavyFocusRing derives it
              // from the actual colour(s) painted (checking both stops for a
              // gradient, since a control can sit anywhere along it).
              const classicFill = "var(--navy)";
              const fillColors =
                selected.theme.backgroundKind === "classic"
                  ? ["#1a2744"]
                  : selected.theme.backgroundKind === "gradient"
                    ? [selected.theme.backgroundColor, selected.theme.backgroundColor2]
                    : [selected.theme.backgroundColor];
              const focusRingColor = needsOnNavyFocusRing(fillColors)
                ? "var(--focus-ring-on-navy)"
                : "var(--focus-ring-default)";
              const slideStyle = selected.theme.backgroundKind === "classic"
                ? { background: classicFill, color: "var(--on-navy)", "--focus-ring-color": focusRingColor }
                : {
                    background: selected.theme.backgroundKind === "gradient"
                      ? `linear-gradient(${selected.theme.gradientAngle}deg, ${selected.theme.backgroundColor}, ${selected.theme.backgroundColor2})`
                      : selected.theme.backgroundColor,
                    color: selected.theme.fontColor,
                    "--focus-ring-color": focusRingColor,
                  };
              return (
              <Card key={idx} variant="outlined" style={{ marginBottom: "var(--space-4)", ...slideStyle }}>
                <CardContent>
                  {editingSlideIdx === idx ? (
                    <>
                      <TextField
                        label="Title"
                        value={slide.title}
                        onChange={(e) => onEditSlide(idx, { title: e.target.value })}
                        fullWidth
                        size="small"
                        style={{ marginBottom: "var(--space-4)" }}
                      />
                      <TextField
                        label="Bullets (one per line)"
                        value={slide.bullets.join("\n")}
                        onChange={(e) => onEditSlide(idx, { bullets: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                        fullWidth
                        multiline
                        rows={3}
                        size="small"
                        style={{ marginBottom: "var(--space-4)" }}
                      />
                      {slide.code && (
                        <TextField
                          label="Code"
                          value={slide.code}
                          onChange={(e) => onEditSlide(idx, { code: e.target.value })}
                          fullWidth
                          multiline
                          rows={4}
                          size="small"
                          style={{ marginBottom: "var(--space-4)", fontFamily: "monospace" }}
                        />
                      )}
                      <div style={{ display: "flex", gap: "var(--space-2)" }}>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => onSetEditingSlideIdx(null)}
                          sx={{ textTransform: "none" }}
                        >
                          Done
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => onDiscardSlideEdit(idx)}
                          sx={{ textTransform: "none" }}
                        >
                          Discard
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "var(--space-3)" }}>
                        <h5 style={{ margin: 0, fontSize: "var(--font-size-md)", fontWeight: 600 }}>{slide.title}</h5>
                        <Button
                          variant="text"
                          size="small"
                          onClick={() => onSetEditingSlideIdx(idx)}
                          sx={{ textTransform: "none" }}
                        >
                          Edit
                        </Button>
                      </div>
                      {slide.bullets.length > 0 && (
                        <ul style={{ margin: "var(--space-2) 0", paddingLeft: "var(--space-6)", fontSize: "var(--font-size-md)" }}>
                          {slide.bullets.map((bullet, i) => (
                            <li key={i}>{bullet}</li>
                          ))}
                        </ul>
                      )}
                      {slide.code && (
                        <div
                          style={{
                            marginTop: "var(--space-3)",
                            padding: "var(--space-3)",
                            // Overlay darken atop the slide's own (arbitrary,
                            // user-chosen) theme background - not page chrome,
                            // so no page surface token applies here. See report.
                            backgroundColor: "rgba(0,0,0,0.05)",
                            borderRadius: "var(--radius-xs)",
                            fontFamily: "monospace",
                            fontSize: "var(--font-size-sm)",
                            overflow: "auto",
                            maxHeight: "150px",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {slide.codeLanguage && <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 500, marginBottom: "var(--space-1)" }}>{slide.codeLanguage.toUpperCase()}</div>}
                          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{slide.code}</pre>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
              );
            })}
          </div>

          {draftNote && (
            <div
              style={{
                padding: "var(--space-3)",
                marginBottom: "var(--space-4)",
                backgroundColor:
                  draftNote.kind === "error"
                    ? "var(--danger-surface)"
                    : "var(--success-surface)",
                border: `1px solid ${draftNote.kind === "error" ? "var(--danger-border)" : "color-mix(in srgb, var(--success) 30%, var(--field-background))"}`,
                color:
                  draftNote.kind === "error" ? "var(--danger)" : "var(--success-ink)",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--font-size-md)",
              }}
            >
              {draftNote.text}
            </div>
          )}

          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
            <Button
              variant="contained"
              size="small"
              onClick={onDownloadPptx}
              sx={{ textTransform: "none" }}
            >
              Download .pptx
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={onSaveToFiles}
              disabled={savingFile}
              sx={{ textTransform: "none" }}
            >
              {savingFile ? "Saving…" : "Save to Files"}
            </Button>
            <Button
              variant="outlined"
              size="small"
              disabled={savingDraft}
              onClick={onSaveDraft}
              sx={{ textTransform: "none" }}
            >
              {savingDraft ? "Saving…" : "Save a copy to Files"}
            </Button>
          </div>

          <Button
            variant="outlined"
            size="small"
            onClick={onRegenerate}
            sx={{ textTransform: "none" }}
          >
            Regenerate
          </Button>
        </>
      )}
    </div>
  );
}
