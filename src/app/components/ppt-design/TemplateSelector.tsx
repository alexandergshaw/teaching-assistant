"use client";

import { Button } from "@mui/material";
import { DECK_PRESETS, isPresetDeckId } from "@/lib/decks/presets";
import type { DeckTemplate } from "@/lib/decks/types";

interface TemplateSelectorProps {
  custom: DeckTemplate[];
  selectedId: string;
  onSelectId: (id: string) => void;
  onNewTemplate: () => void;
  onDeleteTemplate: (id: string) => void;
  onDuplicateTemplate: (template: DeckTemplate) => void;
  deleteConfirm: string | null;
  loadError: string | null;
}

export default function TemplateSelector({
  custom,
  selectedId,
  onSelectId,
  onNewTemplate,
  onDeleteTemplate,
  onDuplicateTemplate,
  deleteConfirm,
  loadError,
}: TemplateSelectorProps) {
  const selected = [...DECK_PRESETS, ...custom].find((t) => t.id === selectedId);

  return (
    <div style={{ flex: "0 0 280px" }}>
      <div style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "0.95rem", fontWeight: 600 }}>
          Presets
        </h3>
        {DECK_PRESETS.map((t) => (
          <div
            key={t.id}
            onClick={() => onSelectId(t.id)}
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
              onClick={() => onSelectId(t.id)}
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
          onClick={onNewTemplate}
          sx={{ textTransform: "none" }}
        >
          New template
        </Button>
        {selected && !isPresetDeckId(selected.id) && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => onDeleteTemplate(selected.id)}
            sx={{ textTransform: "none", color: deleteConfirm === selected.id ? "red" : "inherit" }}
          >
            {deleteConfirm === selected.id ? "Confirm delete" : "Delete"}
          </Button>
        )}
        {selected && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => onDuplicateTemplate(selected)}
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
  );
}
