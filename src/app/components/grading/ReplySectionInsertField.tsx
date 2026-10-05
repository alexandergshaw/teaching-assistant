"use client";

import Button from "@mui/material/Button";
import styles from "../../page.module.css";

// A8 Wave C: authoring affordance for the two-axis (initial post / replies)
// discussion rubric. Inserts the reply-section marker on its own line at the
// end of the rubric text.
//
// This literal MIRRORS CANONICAL_REPLY_MARKER in src/lib/grade/rubric.ts. It
// cannot be imported: rubric.ts reaches lib/supabase/server through
// research/rubric-bank, which the client-boundary runtime-graph test forbids
// for a "use client" entry. replySectionMarker.wiring.test.ts pins equality
// with the parser's constant and recognizer, so drift fails loudly.
export const REPLY_SECTION_MARKER = "Reply section:";

export function hasReplySectionMarker(rubric: string): boolean {
  return rubric
    .split(/\r?\n/)
    .some((line) => line.trim().toLowerCase() === REPLY_SECTION_MARKER.toLowerCase());
}

export function insertReplySectionMarker(rubric: string): string {
  if (hasReplySectionMarker(rubric)) return rubric;
  const base = rubric.replace(/\s+$/, "");
  return base ? `${base}\n\n${REPLY_SECTION_MARKER}\n` : `${REPLY_SECTION_MARKER}\n`;
}

interface ReplySectionInsertFieldProps {
  rubric: string;
  onChange: (next: string) => void;
}

export default function ReplySectionInsertField({ rubric, onChange }: ReplySectionInsertFieldProps) {
  const present = hasReplySectionMarker(rubric);
  const hintId = "reply-section-insert-hint";
  return (
    <div>
      <Button
        variant="outlined"
        size="small"
        disabled={present}
        aria-describedby={hintId}
        onClick={() => onChange(insertReplySectionMarker(rubric))}
      >
        Add reply section
      </Button>
      <span id={hintId} className={styles.fieldHint}>
        {present
          ? " Criteria after the reply section line are scored against the replies."
          : " For discussions: criteria listed after this line are scored against the replies, the rest against the initial post."}
      </span>
    </div>
  );
}
