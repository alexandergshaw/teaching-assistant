"use client";

// PRES-2 S6.7: a plain itemized findings list, reused for every stage that
// produces a "reviewed, no findings" style receipt - stage 7's Standard Check
// (CheckResult.violations), stage 11's Review: Info Flow and stage 12's
// Review: Visuals (both ChecklistResult.findings). Each caller maps its own
// result shape onto this generic {slideIndex, message} list rather than this
// component importing every result type - deck-standard/checklists.ts's
// ChecklistFinding and deck-standard/types.ts's StandardViolation differ in
// field names (itemId/rule) that this display does not need.
//
// S6.5 INFO-1 (docs/pres-2-s6-plan.md): an empty `items` array with
// `ranComplete` true is "reviewed, no findings", shown as a plain confirmation
// - never implying a guarantee, since the model reply may have been
// unparseable and the route already degrades that to an empty-but-valid
// result (pipeline route's own comment). `ranComplete` false (nothing has run
// yet) shows neither the confirmation nor a findings list.

import { Alert, List, ListItem, ListItemText } from "@mui/material";

export interface DisplayFinding {
  slideIndex?: number;
  message: string;
}

export default function ReviewFindings({
  items,
  ranComplete,
  emptyLabel = "No findings.",
}: {
  items: DisplayFinding[];
  ranComplete: boolean;
  emptyLabel?: string;
}) {
  if (!ranComplete) {
    return null;
  }

  if (items.length === 0) {
    return (
      <Alert severity="success" variant="outlined">
        {emptyLabel} (best-effort - a model-based review can still miss something; this is not a guarantee.)
      </Alert>
    );
  }

  return (
    <List dense>
      {items.map((item, idx) => (
        <ListItem key={idx} disableGutters>
          <ListItemText
            primary={item.message}
            secondary={typeof item.slideIndex === "number" ? `Slide ${item.slideIndex + 1}` : undefined}
          />
        </ListItem>
      ))}
    </List>
  );
}
