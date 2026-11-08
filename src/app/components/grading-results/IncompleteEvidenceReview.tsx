"use client";

import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import type { GradeResult } from "../../../lib/grade/types";
import { incompleteEvidenceReason } from "../../../lib/grade/evidence-review";

export function IncompleteEvidenceReview({ row, reviewed, onChange }: {
  row: GradeResult; reviewed: boolean; onChange: (value: boolean) => void;
}) {
  const reason = incompleteEvidenceReason(row);
  if (!reason) return null;
  return <div><span>{reason}</span><FormControlLabel control={<Checkbox checked={reviewed} onChange={(_, value) => onChange(value)} />} label="I reviewed this incomplete evidence" /></div>;
}
