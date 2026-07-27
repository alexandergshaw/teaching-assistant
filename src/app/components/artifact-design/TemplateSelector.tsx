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
        padding: "0.75rem",
        marginBottom: "0.5rem",
        cursor: "pointer",
        borderRadius: "4px",
        border: selected ? "2px solid var(--accent)" : "1px solid var(--field-border)",
        backgroundColor: selected ? "var(--accent)" : "transparent",
        color: selected ? "white" : "inherit",
        transition: "all 0.2s",
      }}
    >
      <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{template.name || "Untitled"}</div>
      {template.description && (
        <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>{template.description}</div>
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
      <div style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "0.95rem", fontWeight: 600 }}>
          Presets
        </h3>
        {presets.length === 0 ? (
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
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
        <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "0.95rem", fontWeight: 600 }}>
          Your templates
        </h3>
        {loading ? (
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
            Loading...
          </div>
        ) : custom.length === 0 ? (
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
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

      <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <Button variant="contained" size="small" onClick={onNewTemplate} sx={{ textTransform: "none" }}>
          New template
        </Button>
        {selected && !isPresetArtifactTemplateId(selected.id) && (
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
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem",
            backgroundColor: "rgba(255,0,0,0.1)",
            borderRadius: "4px",
            fontSize: "0.85rem",
            color: "red",
          }}
        >
          {loadError}
        </div>
      )}
    </div>
  );
}
