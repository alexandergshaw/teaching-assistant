import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { VersionedResultRow } from "../grading-chat/versionedResultProjection";

/** Read-only original criteria; this does not authorize editing or posting. */
export function VersionedResultDetails({ row }: { readonly row: VersionedResultRow }) {
  return <Box component="section" aria-label={`Original grading criteria for ${row.result.student}`} sx={{ mt: 1 }}>
    <Typography variant="caption" component="p">{row.setupVersion === null ? "Setup version unknown" : `Setup version ${row.setupVersion}`}</Typography>
    {row.areas.map((area, index) => <Box key={index} sx={{ mt: 0.5 }}>
      <Typography variant="body2"><strong>{area.area}</strong>{area.score ? `: ${area.score}` : ""}</Typography>
      {area.comment && <Typography variant="body2">{area.comment}</Typography>}
    </Box>)}
  </Box>;
}
