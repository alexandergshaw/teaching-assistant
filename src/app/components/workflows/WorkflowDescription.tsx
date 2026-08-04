"use client";

// A workflow's `description` (WorkflowDef.description, presets/*.ts) is
// plain author-written prose with no length limit - most presets keep it to
// a sentence or two, but Course Build's own description runs to several
// thousand characters as a single unbroken paragraph (that preset file is
// out of scope for this change - see the run-form cleanup's AC B8, which
// asks for a PRESENTATION-side fix here instead of trimming the source
// text). Rather than every workflow's header paying for the worst case,
// this clamps any description past CLAMP_LENGTH to a short preview with a
// "Show more" disclosure - reusing DisclosureToggle (the SAME collapsible-
// header idiom already used for Steps/Run history/Schedule & trigger on
// this page) rather than a differently-behaved control. A description at or
// under the clamp renders exactly as before: a plain paragraph, no
// disclosure at all.
import { useState } from "react";
import { DisclosureToggle } from "./DisclosureToggle";
import styles from "../../page.module.css";

const CLAMP_LENGTH = 220;

/** Truncates at the last whitespace at-or-before `maxLength`, so the preview
 * never cuts a word in half. Falls back to the raw cut when there is no
 * whitespace to break on within range (a single very long token). */
function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd();
}

export function WorkflowDescription({ description }: { description: string }) {
  const [open, setOpen] = useState(false);
  const trimmed = description.trim();
  if (!trimmed) return null;

  if (trimmed.length <= CLAMP_LENGTH) {
    return (
      <p className={styles.fieldHint} style={{ margin: "0 0 8px 0" }}>
        {trimmed}
      </p>
    );
  }

  const preview = truncateAtWordBoundary(trimmed, CLAMP_LENGTH);

  return (
    <div style={{ margin: "0 0 8px 0" }}>
      <p className={styles.fieldHint} style={{ margin: 0 }}>
        {open ? trimmed : `${preview}...`}
      </p>
      <DisclosureToggle open={open} onClick={() => setOpen(!open)}>
        {open ? "Show less" : "Show more"}
      </DisclosureToggle>
    </div>
  );
}
