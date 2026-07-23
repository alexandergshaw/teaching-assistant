"use client";

import { TextField, Button, CircularProgress, Card, CardContent } from "@mui/material";
import type { PptxSlide } from "@/lib/pptx";
import type { DeckTemplate } from "@/lib/decks/types";

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
    <div style={{ padding: "1.5rem", backgroundColor: "var(--field-bg)", borderRadius: "4px", marginBottom: "1.5rem" }}>
      <h3 style={{ margin: "0 0 1rem 0", fontSize: "0.95rem", fontWeight: 600 }}>
        Generate Deck
      </h3>

      {!generatedDeck ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
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
                  <div style={{ padding: "0.75rem", backgroundColor: "rgba(0,0,0,0.02)", borderRadius: "4px" }}>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
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
            <div style={{ padding: "0.75rem", backgroundColor: "rgba(255,0,0,0.1)", borderRadius: "4px", fontSize: "0.85rem", color: "red", marginBottom: "1rem" }}>
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
          <div style={{ marginBottom: "1.5rem" }}>
            <h4 style={{ margin: "0 0 1rem 0", fontSize: "0.9rem", fontWeight: 600 }}>
              Preview ({editedSlides.length} slides)
            </h4>
            {editedSlides.map((slide, idx) => {
              const slideStyle = selected.theme.backgroundKind === "classic"
                ? { background: "#1a2744", color: "#ffffff" }
                : {
                    background: selected.theme.backgroundKind === "gradient"
                      ? `linear-gradient(${selected.theme.gradientAngle}deg, ${selected.theme.backgroundColor}, ${selected.theme.backgroundColor2})`
                      : selected.theme.backgroundColor,
                    color: selected.theme.fontColor,
                  };
              return (
              <Card key={idx} style={{ marginBottom: "1rem", ...slideStyle }}>
                <CardContent>
                  {editingSlideIdx === idx ? (
                    <>
                      <TextField
                        label="Title"
                        value={slide.title}
                        onChange={(e) => onEditSlide(idx, { title: e.target.value })}
                        fullWidth
                        size="small"
                        style={{ marginBottom: "1rem" }}
                      />
                      <TextField
                        label="Bullets (one per line)"
                        value={slide.bullets.join("\n")}
                        onChange={(e) => onEditSlide(idx, { bullets: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
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
                          onChange={(e) => onEditSlide(idx, { code: e.target.value })}
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
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "0.75rem" }}>
                        <h5 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>{slide.title}</h5>
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
              );
            })}
          </div>

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

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
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
              {savingFile ? "Saving..." : "Save to Files"}
            </Button>
            <Button
              variant="outlined"
              size="small"
              disabled={savingDraft}
              onClick={onSaveDraft}
              sx={{ textTransform: "none" }}
            >
              {savingDraft ? "Saving..." : "Save a copy to Files"}
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
