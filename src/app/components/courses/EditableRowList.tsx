"use client";

// Shared row-list editor for the Courses tab's small "Student | ..." table
// editors (RosterCell's roster editor and StudentReposCell's student-repos
// editor). Extracted so both share:
//   - stable per-row identity (`id`, minted once when a row is created) as
//     the React key, instead of `key={i}` - removing row i no longer
//     silently reuses that DOM node (and its focus) for the next student;
//   - the SAME two-state Remove/Confirm control: two literal JSX branches
//     (never a ternary label - that remounts the button and drops focus),
//     a row-scoped aria-label naming the student, disarm on blur, and a
//     role="status" line stating the armed state - copied from
//     grading-recording/GradingTableRow.tsx's own Remove/Confirm pair;
//   - accessible names on every TextField (a placeholder is not a name);
//   - row numbers in a fixed leading column;
//   - a focus target for the row that should receive it next (after Add
//     student, or after a removal moves focus to the next/previous row, or
//     to nothing when the caller wants focus to land elsewhere instead).
import { useEffect, useRef, useState, type ReactNode } from "react";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";
import rosterEditorStyles from "./RosterEditor.module.css";

export interface EditableRowListColumn<T> {
  key: keyof T & string;
  label: string;
  placeholder?: string;
  width?: number;
  /** Returns a validation message for this cell's current value, or null
   * when it is valid/not applicable. Rendered as a visible hint AND marks
   * the field `error` - never disables Save (AC2.1a's "never block on
   * this" principle applies here too: a bad handle is still saved as
   * typed, so the instructor can fix it later without losing the row). */
  hint?: (value: string) => string | null;
}

export interface EditableRowListProps<T extends { id: string }> {
  rows: T[];
  /** Indexes into `rows`, in the order to render - lets a caller filter the
   * DISPLAY (e.g. a search box) without touching row identity or the
   * numbering below, which always reflects a row's real position in
   * `rows`, never its position in this display list. */
  displayOrder?: number[];
  columns: EditableRowListColumn<T>[];
  onChangeRow: (id: string, patch: Partial<T>) => void;
  onRemoveRow: (id: string) => void;
  /** A short label for the row's subject, used in the Remove/Confirm
   * button's accessible name and its confirmation hint. */
  labelForRow: (row: T) => string;
  /** Extra content rendered under a row's own fields (e.g. a duplicate
   * warning). */
  rowExtra?: (row: T, index: number) => ReactNode;
  emptyMessage: string;
  /** The id of a row whose first field should be focused (and scrolled
   * into view) once it renders. Cleared by the caller via onFocusHandled
   * once applied, so the same id can be re-focused later if needed. */
  focusRowId?: string | null;
  onFocusHandled?: () => void;
}

export function EditableRowList<T extends { id: string }>({
  rows,
  displayOrder,
  columns,
  onChangeRow,
  onRemoveRow,
  labelForRow,
  rowExtra,
  emptyMessage,
  focusRowId,
  onFocusHandled,
}: EditableRowListProps<T>) {
  const [armedId, setArmedId] = useState<string | null>(null);
  const firstFieldRefs = useRef(new Map<string, HTMLInputElement | null>());

  useEffect(() => {
    if (!focusRowId) return;
    const el = firstFieldRefs.current.get(focusRowId);
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "nearest" });
    }
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRowId]);

  const order = displayOrder ?? rows.map((_, i) => i);

  return (
    <>
      <div className={tableStyles.editorHeadRow}>
        <span className={`${styles.ghMeta} ${rosterEditorStyles.rowNumberCol}`} aria-hidden="true">
          #
        </span>
        {columns.map((col) => (
          <span
            key={col.key}
            className={styles.ghMeta}
            style={col.width ? { width: col.width } : { flex: 1 }}
          >
            {col.label}
          </span>
        ))}
        <span style={{ width: 76 }} />
      </div>
      <div className={tableStyles.editorRowsScroll}>
        {order.map((rowIndex) => {
          const row = rows[rowIndex];
          if (!row) return null;
          const label = labelForRow(row) || `row ${rowIndex + 1}`;
          const armed = armedId === row.id;
          return (
            <div key={row.id} className={tableStyles.stackXs}>
              <div className={tableStyles.editorRow}>
                <span className={rosterEditorStyles.rowNumberCol} aria-hidden="true">
                  {rowIndex + 1}
                </span>
                {columns.map((col, colIdx) => {
                  const value = String(row[col.key] ?? "");
                  const hint = col.hint?.(value) ?? null;
                  return (
                    <TextField
                      key={col.key}
                      inputRef={
                        colIdx === 0
                          ? (el: HTMLInputElement | null) => {
                              firstFieldRefs.current.set(row.id, el);
                            }
                          : undefined
                      }
                      size="small"
                      value={value}
                      onChange={(e) => onChangeRow(row.id, { [col.key]: e.target.value } as Partial<T>)}
                      sx={col.width ? { width: col.width } : { flex: 1 }}
                      placeholder={col.placeholder}
                      error={Boolean(hint)}
                      slotProps={{ htmlInput: { "aria-label": `${col.label} for ${label}` } }}
                    />
                  );
                })}
                {armed ? (
                  <Button
                    size="small"
                    color="error"
                    aria-label={`Confirm removal of ${label}`}
                    onClick={() => {
                      onRemoveRow(row.id);
                      setArmedId(null);
                    }}
                    onBlur={() => setArmedId((cur) => (cur === row.id ? null : cur))}
                  >
                    Confirm
                  </Button>
                ) : (
                  <Button size="small" color="error" aria-label={`Remove ${label}`} onClick={() => setArmedId(row.id)}>
                    Remove
                  </Button>
                )}
              </div>
              {armed && (
                <p className={styles.fieldHint} role="status" aria-live="polite">
                  {`This removes ${label}'s row. Click Remove again to confirm.`}
                </p>
              )}
              {columns.map((col) => {
                const hint = col.hint?.(String(row[col.key] ?? "")) ?? null;
                return hint ? (
                  <p key={col.key} className={styles.fieldHint}>
                    {hint}
                  </p>
                ) : null;
              })}
              {rowExtra?.(row, rowIndex)}
            </div>
          );
        })}
        {order.length === 0 && <p className={styles.fieldHint}>{emptyMessage}</p>}
      </div>
    </>
  );
}
