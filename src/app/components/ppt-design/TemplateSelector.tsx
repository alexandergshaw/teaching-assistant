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

  const cardStyle = (isSelected: boolean): React.CSSProperties => ({
    padding: "var(--space-3)",
    marginBottom: "var(--space-2)",
    cursor: "pointer",
    borderRadius: "var(--radius-xs)",
    border: isSelected ? "1px solid var(--card-border)" : "1px solid var(--field-border)",
    boxShadow: isSelected ? "inset 0 0 0 2px var(--accent)" : "none",
    backgroundColor: isSelected ? "var(--accent-soft)" : "transparent",
    color: "inherit",
    transition: "border-color var(--transition-fast), box-shadow var(--transition-fast)",
  });

  return (
    <div style={{ flex: "0 0 280px" }}>
      <div style={{ marginBottom: "var(--space-4)" }}>
        <h3
          style={{
            marginTop: 0,
            marginBottom: "var(--space-2)",
            fontSize: "var(--font-size-2xs)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-secondary)",
          }}
        >
          Presets
        </h3>
        {DECK_PRESETS.map((t) => (
          <div
            key={t.id}
            onClick={() => onSelectId(t.id)}
            style={cardStyle(selectedId === t.id)}
          >
            <div style={{ fontWeight: 500, fontSize: "var(--font-size-md)" }}>{t.name}</div>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
              {t.slides.length} slides
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3
          style={{
            marginTop: 0,
            marginBottom: "var(--space-2)",
            fontSize: "var(--font-size-2xs)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-secondary)",
          }}
        >
          Your templates
        </h3>
        {custom.length === 0 ? (
          <div style={{ fontSize: "var(--font-size-md)", color: "var(--text-muted)", marginBottom: "var(--space-4)", textAlign: "center", padding: "var(--space-4) 0" }}>
            No custom templates yet.
          </div>
        ) : (
          custom.map((t) => (
            <div
              key={t.id}
              onClick={() => onSelectId(t.id)}
              style={cardStyle(selectedId === t.id)}
            >
              <div style={{ fontWeight: 500, fontSize: "var(--font-size-md)" }}>{t.name}</div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                {t.slides.length} slides
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
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
            sx={{ textTransform: "none", color: deleteConfirm === selected.id ? "var(--danger)" : "inherit" }}
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
        <div
          style={{
            marginTop: "var(--space-4)",
            padding: "var(--space-3)",
            backgroundColor: "var(--danger-surface)",
            border: "1px solid var(--danger-border)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--font-size-sm)",
            color: "var(--danger)",
          }}
        >
          {loadError}
        </div>
      )}
    </div>
  );
}
