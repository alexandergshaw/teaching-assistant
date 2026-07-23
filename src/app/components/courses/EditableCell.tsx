"use client";

// A single click-to-edit table cell. Reuses the same TextField-based editors
// the tiles used (text/multiline/number/date), and the same save/cancel
// affordances - just laid out as a table cell instead of a card tile.
import { useState } from "react";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import styles from "../../page.module.css";

export type EditableCellKind = "text" | "multiline" | "number" | "date";

export interface EditableCellProps {
  kind: EditableCellKind;
  /** The raw string used to seed the editor (e.g. "" for unset, "15" for weeks). */
  rawValue: string;
  /** What to show when not editing; falls back to rawValue text when omitted. */
  display?: React.ReactNode;
  emptyLabel?: string;
  placeholder?: string;
  onSave: (rawValue: string) => Promise<boolean | null>;
}

export default function EditableCell({ kind, rawValue, display, emptyLabel = "Not set", placeholder, onSave }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rawValue);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(rawValue);
    setEditing(true);
  };

  const commit = async () => {
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok !== false && ok !== null) setEditing(false);
  };

  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <td data-cell-editing="true" style={{ minWidth: 180 }}>
        <div className={styles.tileEditor}>
          <TextField
            size="small"
            fullWidth
            autoFocus
            type={kind === "date" ? "date" : kind === "number" ? "number" : "text"}
            multiline={kind === "multiline"}
            minRows={kind === "multiline" ? 3 : undefined}
            placeholder={placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            slotProps={kind === "date" ? { inputLabel: { shrink: true } } : undefined}
            onKeyDown={(e) => {
              if (kind === "multiline") return;
              if (e.key === "Enter") void commit();
              if (e.key === "Escape") cancel();
            }}
          />
          <div className={styles.tileEditorActions}>
            <Button variant="contained" size="small" disabled={saving} onClick={() => void commit()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="text" size="small" disabled={saving} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      </td>
    );
  }

  return (
    <td onClick={startEdit} title="Click to edit" style={{ cursor: "pointer" }}>
      {display ?? (rawValue ? <span className={styles.courseResourceValue}>{rawValue}</span> : <span className={styles.courseResourceEmpty}>{emptyLabel}</span>)}
    </td>
  );
}
