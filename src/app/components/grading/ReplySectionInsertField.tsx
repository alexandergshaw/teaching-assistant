"use client";

import Button from "@mui/material/Button";
import styles from "../../page.module.css";
import { CANONICAL_REPLY_MARKER, isReplySectionMarker } from "@/lib/grade/rubric-reply-marker";

// A8 Wave C: authoring affordance for the two-axis (initial post / replies)
// discussion rubric. Inserts the reply-section marker on its own line at the
// end of the rubric text.
//
// The marker and its recognizer come from the dependency-free leaf
// src/lib/grade/rubric-reply-marker.ts (rubric.ts cannot be imported here: it
// reaches lib/supabase/server, which the client-boundary test forbids).
export function hasReplySectionMarker(rubric: string): boolean {
  return rubric.split(/\r?\n/).some((line) => isReplySectionMarker(line));
}

export function insertReplySectionMarker(rubric: string): string {
  if (hasReplySectionMarker(rubric)) return rubric;
  const base = rubric.replace(/\s+$/, "");
  return base ? `${base}\n\n${CANONICAL_REPLY_MARKER}\n` : `${CANONICAL_REPLY_MARKER}\n`;
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
