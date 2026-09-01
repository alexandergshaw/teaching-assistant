"use client";

import { Button } from "@mui/material";
import { isPresetArtifactTemplateId, presetsForKind } from "@/lib/artifact-templates/presets";
import type { ArtifactTemplate, ArtifactTemplateKind } from "@/lib/artifact-templates/types";

interface TemplateSelectorProps {
  kind: ArtifactTemplateKind;
  custom: ArtifactTemplate[];
  selectedId: string;
  onSelectId: (id: string) => void;
  onNewTemplate: () => void;
  onDeleteTemplate: (id: string) => void;
  onDuplicateTemplate: (template: ArtifactTemplate) => void;
  deleteConfirm: string | null;
  loadError: string | null;
  loading: boolean;
}

function TemplateRow({
  template,
  selected,
  onSelect,
}: {
  template: ArtifactTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        padding: "var(--space-3)",
        marginBottom: "var(--space-2)",
        cursor: "pointer",
        borderRadius: "var(--radius-xs)",
        border: selected ? "1px solid var(--card-border)" : "1px solid var(--field-border)",
        boxShadow: selected ? "inset 0 0 0 2px var(--accent)" : "none",
        backgroundColor: selected ? "var(--accent-soft)" : "transparent",
        color: "inherit",
        transition: "border-color var(--transition-fast), box-shadow var(--transition-fast)",
      }}
    >
      <div style={{ fontWeight: 500, fontSize: "var(--font-size-md)" }}>{template.name || "Untitled"}</div>
      {template.description && (
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>{template.description}</div>
      )}
    </div>
  );
}

export default function TemplateSelector({
  kind,
  custom,
  selectedId,
  onSelectId,
  onNewTemplate,
  onDeleteTemplate,
  onDuplicateTemplate,
  deleteConfirm,
  loadError,
  loading,
}: TemplateSelectorProps) {
  const presets = presetsForKind(kind);
  const selected = [...presets, ...custom].find((t) => t.id === selectedId);

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
        {presets.length === 0 ? (
          <div style={{ fontSize: "var(--font-size-md)", color: "var(--text-muted)", marginBottom: "var(--space-4)", textAlign: "center", padding: "var(--space-4) 0" }}>
            No built-in templates for this kind yet.
          </div>
        ) : (
          presets.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              selected={selectedId === t.id}
              onSelect={() => onSelectId(t.id)}
            />
          ))
        )}
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
        {loading ? (
          <div style={{ fontSize: "var(--font-size-md)", color: "var(--text-muted)", marginBottom: "var(--space-4)", textAlign: "center", padding: "var(--space-4) 0" }}>
            Loading…
          </div>
        ) : custom.length === 0 ? (
          <div style={{ fontSize: "var(--font-size-md)", color: "var(--text-muted)", marginBottom: "var(--space-4)", textAlign: "center", padding: "var(--space-4) 0" }}>
            No custom templates yet.
          </div>
        ) : (
          custom.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              selected={selectedId === t.id}
              onSelect={() => onSelectId(t.id)}
            />
          ))
        )}
      </div>

      <div style={{ marginTop: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <Button variant="contained" size="small" onClick={onNewTemplate} sx={{ textTransform: "none" }}>
          New template
        </Button>
        {selected && !isPresetArtifactTemplateId(selected.id) && (
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
