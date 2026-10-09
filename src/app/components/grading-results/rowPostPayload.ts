// The one-row gradebook payload shared by the bulk and per-row Post paths in
// GradingResults.tsx (extracted verbatim to keep that file under the ceiling).

import { parseEarnedPoints, type GradeRow, type RowEdit } from "./gradingResultsHelpers";

export interface RowPostPayload {
  userId: number;
  grade: string;
  comment: string;
  rubricAreas: { area: string; score: string; comment: string }[];
}

export function buildRowPostPayload(row: GradeRow, userId: number, edit: RowEdit): RowPostPayload {
  return {
    userId,
    grade: parseEarnedPoints(edit.total),
    comment: edit.overall,
    rubricAreas: row.rubricAreas.map((a) => {
      const ae = edit.areas[a.area] ?? { score: a.score };
      return { area: a.area, score: ae.score, comment: "" };
    }),
  };
}
