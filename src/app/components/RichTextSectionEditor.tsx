"use client";

import type { CSSProperties, ReactNode } from "react";
import { Fragment } from "react";
import type { RunSpan } from "@/lib/office-edit";
import { RichTextEditor, FormattingToolbar } from "./RichTextEditor";
import styles from "../page.module.css";

/** A button shown to the right of a section's field (e.g. regenerate / delete). */
export interface RichTextSectionAction {
  /** Stable key for the button. */
  key: string;
  /** Button content (text or a small glyph). */
  label: ReactNode;
  /** Tooltip / accessible title. */
  title: string;
  onClick: () => void;
  disabled?: boolean;
  /** Colour accent for the glyph. */
  tone?: "default" | "accent" | "danger";
  /** Extra inline style (e.g. dimming a busy button). */
  style?: CSSProperties;
}

/** One editable section in the list. */
export interface RichTextSection {
  /** Stable React key. */
  key: string;
  /** Current content as formatted spans. */
  spans: RunSpan[];
  /** Optional full-width heading above this section (e.g. "Slide 2"). */
  heading?: string;
  /** Optional small uppercase field label above the editor. */
  label?: string;
  /** Tint the field to flag it as changed. */
  changed?: boolean;
  /** Placeholder shown when the field is empty. */
  placeholder?: string;
  /** Accessible label for the editor. */
  ariaLabel?: string;
  /** Optional action buttons stacked to the right of the field. */
  actions?: RichTextSectionAction[];
}

const TONE_CLASS: Record<NonNullable<RichTextSectionAction["tone"]>, string> = {
  default: "",
  accent: styles.rteSectionActionBtnAccent,
  danger: styles.rteSectionActionBtnDanger,
};

/**
 * A scrollable list of rich-text fields with one shared formatting toolbar —
 * the common editor behind both the syllabus section editor and the in-place
 * Office (.docx/.pptx) file editor. Each section is fully controlled by the
 * parent: it owns the spans and reports edits through {@link onChange}.
 */
export function RichTextSectionEditor({
  sections,
  onChange,
  maxHeight = "60vh",
  bordered = false,
  style,
}: {
  sections: RichTextSection[];
  onChange: (key: string, spans: RunSpan[]) => void;
  /** Max height before the list scrolls. */
  maxHeight?: string;
  /** Wrap the list in a bordered card (the syllabus editor's look). */
  bordered?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`${styles.rteSectionList}${bordered ? ` ${styles.rteSectionListBordered}` : ""}`}
      style={{ maxHeight, ...style }}
    >
      <FormattingToolbar />
      {sections.map((s) => (
        <Fragment key={s.key}>
          {s.heading && <p className={styles.rteSectionHeading}>{s.heading}</p>}
          <div className={styles.rteSectionRow}>
            <div className={styles.rteSectionMain}>
              {s.label && <div className={styles.rteSectionLabel}>{s.label}</div>}
              <RichTextEditor
                value={s.spans}
                onChange={(spans) => onChange(s.key, spans)}
                changed={s.changed}
                placeholder={s.placeholder}
                ariaLabel={s.ariaLabel}
              />
            </div>
            {s.actions && s.actions.length > 0 && (
              <div className={styles.rteSectionActions}>
                {s.actions.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    title={a.title}
                    onClick={a.onClick}
                    disabled={a.disabled}
                    className={`${styles.rteSectionActionBtn} ${TONE_CLASS[a.tone ?? "default"]}`.trim()}
                    style={a.style}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
