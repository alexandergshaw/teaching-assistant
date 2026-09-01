"use client";

import { useState } from "react";
import { TextField, MenuItem } from "@mui/material";
import TabHeader from "../TabHeader";
import styles from "../../page.module.css";
import TemplateSelector from "./TemplateSelector";
import AssignmentSpecEditor from "./AssignmentSpecEditor";
import TestSpecEditor from "./TestSpecEditor";
import ClassSessionSpecEditor from "./ClassSessionSpecEditor";
import { useArtifactTemplates, useLocalStorageState, usePendingArtifactSave } from "./hooks";
import {
  saveArtifactTemplateAction,
  deleteArtifactTemplateAction,
} from "@/app/actions";
import { isPresetArtifactTemplateId, presetsForKind } from "@/lib/artifact-templates/presets";
import {
  ARTIFACT_TEMPLATE_KINDS,
  ARTIFACT_TEMPLATE_KIND_LABELS,
  coerceAssignmentSpec,
  coerceTestSpec,
  coerceClassSessionSpec,
  duplicateArtifactTemplate,
  emptyArtifactTemplate,
  type ArtifactTemplate,
  type ArtifactTemplateKind,
} from "@/lib/artifact-templates/types";

// Kinds whose spec has actually been designed. The remaining kinds are stored
// and listed, but have no fields to edit yet - the editor says so rather than
// pretending to be empty.
const EDITABLE_KINDS: ArtifactTemplateKind[] = ["assignment", "test", "class-session"];

export default function ArtifactDesignTab() {
  const [kind, setKind] = useLocalStorageState<ArtifactTemplateKind>(
    "ta-artifact-kind",
    "assignment"
  );
  const [selectedId, setSelectedId] = useLocalStorageState("ta-artifact-selected-id", "");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { custom, setCustom, loadError, setLoadError, loading } = useArtifactTemplates(kind);
  const commit = usePendingArtifactSave();

  const presets = presetsForKind(kind);
  const all = [...presets, ...custom];
  // Fall back to the first available template whenever the stored selection is
  // for a different kind (or was deleted).
  const selected = all.find((t) => t.id === selectedId) ?? all[0];
  const isReadOnly = !!selected && isPresetArtifactTemplateId(selected.id);

  const update = (next: ArtifactTemplate) => commit(next, setCustom, setLoadError);

  const handleNewTemplate = async () => {
    const template = emptyArtifactTemplate(kind, crypto.randomUUID());
    template.name = `Untitled ${ARTIFACT_TEMPLATE_KIND_LABELS[kind].toLowerCase()}`;
    setCustom((prev) => [...prev, template]);
    setSelectedId(template.id);

    const result = await saveArtifactTemplateAction(template);
    if ("error" in result) setLoadError(result.error);
  };

  const handleDuplicateTemplate = async (template: ArtifactTemplate) => {
    const copy = duplicateArtifactTemplate(template, crypto.randomUUID());
    setCustom((prev) => [...prev, copy]);
    setSelectedId(copy.id);

    const result = await saveArtifactTemplateAction(copy);
    if ("error" in result) setLoadError(result.error);
  };

  const handleDeleteTemplate = async (id: string) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      return;
    }
    setDeleteConfirm(null);

    const result = await deleteArtifactTemplateAction(id);
    if ("error" in result) {
      setLoadError(result.error);
      return;
    }
    setCustom((prev) => prev.filter((t) => t.id !== id));
    setSelectedId("");
  };

  return (
    <div className={styles.tabContainer}>
      <TabHeader
        eyebrow="Design"
        title="Artifact Templates"
        subtitle="Build the reusable templates the workflow steps generate from - an assignment, a test, or a whole class session - described once and turned into real documents and LMS items per course and per week."
      />

      <div style={{ marginTop: "var(--space-6)", maxWidth: 280 }}>
        <TextField
          select
          label="Template kind"
          size="small"
          fullWidth
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as ArtifactTemplateKind);
            // The selection belongs to the old kind; clearing it lets the
            // fallback pick the new kind's first template.
            setSelectedId("");
            setDeleteConfirm(null);
          }}
        >
          {ARTIFACT_TEMPLATE_KINDS.map((k) => (
            <MenuItem key={k} value={k}>
              {ARTIFACT_TEMPLATE_KIND_LABELS[k]}
              {EDITABLE_KINDS.includes(k) ? "" : " (not designed yet)"}
            </MenuItem>
          ))}
        </TextField>
      </div>

      <div style={{ display: "flex", gap: "var(--space-8)", marginTop: "var(--space-6)" }}>
        <TemplateSelector
          kind={kind}
          custom={custom}
          selectedId={selected?.id ?? ""}
          onSelectId={setSelectedId}
          onNewTemplate={handleNewTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          onDuplicateTemplate={handleDuplicateTemplate}
          deleteConfirm={deleteConfirm}
          loadError={loadError}
          loading={loading}
        />

        <div style={{ flex: 1 }}>
          {!EDITABLE_KINDS.includes(kind) ? (
            <div style={{ fontSize: "var(--font-size-md)", color: "var(--text-muted)", textAlign: "center", padding: "var(--space-6) 0" }}>
              {ARTIFACT_TEMPLATE_KIND_LABELS[kind]} templates are stored but have no editable fields
              yet - discussion and quiz specs exist only as legs of a Class Session template.
              Assignment, Test, and Class Session templates are ready to build.
            </div>
          ) : !selected ? (
            <div style={{ fontSize: "var(--font-size-md)", color: "var(--text-muted)", textAlign: "center", padding: "var(--space-6) 0" }}>
              Select a template, or create a new one.
            </div>
          ) : (
            <>
              {isReadOnly && (
                <div
                  style={{
                    marginBottom: "var(--space-4)",
                    padding: "var(--space-3)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-soft)",
                    backgroundColor: "var(--surface-muted)",
                    fontSize: "var(--font-size-sm)",
                    color: "var(--text-secondary)",
                  }}
                >
                  This is a built-in template and cannot be edited. Duplicate it to make your own.
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
                <TextField
                  label="Template name"
                  size="small"
                  fullWidth
                  disabled={isReadOnly}
                  value={selected.name}
                  onChange={(e) => update({ ...selected, name: e.target.value })}
                />
                <TextField
                  label="Description"
                  size="small"
                  fullWidth
                  disabled={isReadOnly}
                  value={selected.description}
                  onChange={(e) => update({ ...selected, description: e.target.value })}
                  helperText="Shown in the template picker on a workflow's run form."
                />
              </div>

              {/* Keyed on the template id so switching templates remounts the
                  editor. ListFieldEditor holds its raw text locally and has no
                  effect syncing it back from props, so a remount is what gives
                  it the newly selected template's lines. */}
              {kind === "assignment" ? (
                <AssignmentSpecEditor
                  key={selected.id}
                  spec={coerceAssignmentSpec(selected.spec)}
                  disabled={isReadOnly}
                  onChange={(spec) => update({ ...selected, spec })}
                />
              ) : kind === "test" ? (
                <TestSpecEditor
                  key={selected.id}
                  spec={coerceTestSpec(selected.spec)}
                  disabled={isReadOnly}
                  onChange={(spec) => update({ ...selected, spec })}
                />
              ) : (
                <ClassSessionSpecEditor
                  key={selected.id}
                  spec={coerceClassSessionSpec(selected.spec)}
                  disabled={isReadOnly}
                  onChange={(spec) => update({ ...selected, spec })}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
