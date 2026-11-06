import { List, ListItem, Typography } from "@mui/material";
import type { RepoGradeCellEdit } from "./repoGradesCellEdits";
import { formatScorePercent, scorePercentValue } from "./repoGradeScoreDisplay";
import styles from "./repo-grades.module.css";

export default function RepoGradeRubricScores({ areas, label }: {
  areas: readonly Pick<RepoGradeCellEdit["rubricAreas"][number], "area" | "score">[];
  label: string;
}) {
  if (!areas.length) return null;
  return (
    <List aria-label={label} className={styles.rubricBreakdown} disablePadding dense>
      {areas.map((area, index) => {
        const percent = scorePercentValue(area.score) === null ? null : formatScorePercent(area.score);
        return (
          <ListItem key={index} disableGutters disablePadding className={styles.rubricBreakdownArea}
            sx={{ justifyContent: "space-between" }}>
            <Typography component="span" variant="body2" className={styles.rubricBreakdownName}>{area.area}</Typography>
            <Typography component="span" variant="body2" className={styles.rubricBreakdownScore}>
              {area.score.trim() || "Score unavailable"}{percent && ` (${percent})`}
            </Typography>
          </ListItem>
        );
      })}
    </List>
  );
}
