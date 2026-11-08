"use client";

import { Alert, Box, Button, Typography } from "@mui/material";
import type { GradeResult } from "@/lib/grade/types";

export function RegradeCandidate({ candidate, onAccept, onDiscard, disabled }: {
  candidate: GradeResult;
  disabled?: boolean;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  return <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1, mt: 1 }}>
    <Alert severity="info">Review this new grade before replacing your existing grade and edits.</Alert>
    <Typography variant="body2">{`New score: ${candidate.totalScore || "Not available"}`}</Typography>
    {candidate.rubricAreas.map((area, index) => <Box key={`${area.area}-${index}`}>
      <Typography variant="body2">{`${area.area}: ${area.score}`}</Typography>
      {area.comment && <Typography variant="body2">{area.comment}</Typography>}
    </Box>)}
    {candidate.overallComment && <Typography variant="body2">{candidate.overallComment}</Typography>}
    {candidate.strengths && <Typography variant="body2">{candidate.strengths}</Typography>}
    {candidate.improvements && <Typography variant="body2">{candidate.improvements}</Typography>}
    {candidate.resubmitNotice && <Typography variant="body2">{candidate.resubmitNotice}</Typography>}
    <Button size="small" variant="contained" disabled={disabled} onClick={onAccept}>Accept new grade</Button>
    <Button size="small" onClick={onDiscard}>Keep current grade</Button>
  </Box>;
}
