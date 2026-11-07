import { Box, List, ListItem, Typography } from "@mui/material";
import type { RepoGradeCellEdit } from "./repoGradesCellEdits";
import { formatScorePercent, scorePercentValue } from "./repoGradeScoreDisplay";
import styles from "./repo-grades.module.css";
import { alignRubricScores } from "./rubricAlignment";

export default function RepoGradeRubricScores({ areas, label, criterionOrder }: {
  areas: readonly Pick<RepoGradeCellEdit["rubricAreas"][number], "area" | "score" | "comment">[];
  label: string;
  criterionOrder?: readonly string[];
}) {
  const slots = criterionOrder ? alignRubricScores(criterionOrder, areas) : areas;
  if (!slots.length) return null;
  return (
    <List aria-label={label} className={styles.rubricBreakdown} disablePadding dense>
      {slots.map((area, index) => {
        const percent = scorePercentValue(area.score) === null ? null : formatScorePercent(area.score);
        return (
          <ListItem key={index} disableGutters disablePadding className={styles.rubricBreakdownArea} data-rubric-index={index}
            sx={{ alignItems: "flex-start", justifyContent: "space-between", minHeight: `var(--rg-rubric-${index}, 2rem)` }}>
            <Box className={styles.rubricBreakdownContent} data-rubric-content>
              <Box className={styles.rubricBreakdownHeading}>
                <Typography component="span" variant="body2" className={styles.rubricBreakdownName}>{area.area}</Typography>
                <Typography component="span" variant="body2" className={styles.rubricBreakdownScore}>
                  {area.score.trim() || "Score unavailable"}{percent && ` (${percent})`}
                </Typography>
              </Box>
              {area.comment?.trim() && <Typography component="p" variant="body2" className={styles.rubricBreakdownComment}>{area.comment}</Typography>}
            </Box>
          </ListItem>
        );
      })}
    </List>
  );
}
