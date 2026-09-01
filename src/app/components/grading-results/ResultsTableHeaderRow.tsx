"use client";

// The results table's <thead> row - moved out of GradingResults.tsx
// (originally :559-593) alongside useResultsSort.ts, its state/logic
// counterpart in this same folder. Pure MOVE, not a rewrite: same five
// sortable columns (Student, Files, one per rubric area, Total, Feedback),
// same Button variant/size/sx, same sort-arrow glyphs (via the `sortLabel`
// prop, computed by useResultsSort.ts exactly as it was computed inline
// before).
import Button from "@mui/material/Button";
import type { SortColumn } from "./gradingResultsHelpers";

export interface ResultsTableHeaderRowProps {
  rubricAreaNames: string[];
  onSort: (column: SortColumn) => void;
  sortLabel: (column: SortColumn) => string;
}

export function ResultsTableHeaderRow({ rubricAreaNames, onSort, sortLabel }: ResultsTableHeaderRowProps) {
  return (
    <tr>
      <th>
        <Button
          variant="text"
          size="small"
          onClick={() => onSort({ kind: "student" })}
          sx={{ minWidth: 0, textTransform: "none", color: "inherit", fontWeight: 600, p: "var(--space-1) var(--space-1)" }}
        >
          Student <span>{sortLabel({ kind: "student" })}</span>
        </Button>
      </th>
      <th>
        <Button
          variant="text"
          size="small"
          onClick={() => onSort({ kind: "files" })}
          sx={{ minWidth: 0, textTransform: "none", color: "inherit", fontWeight: 600, p: "var(--space-1) var(--space-1)" }}
        >
          Files <span>{sortLabel({ kind: "files" })}</span>
        </Button>
      </th>
      {rubricAreaNames.map((area) => (
        <th key={area}>
          <Button
            variant="text"
            size="small"
            onClick={() => onSort({ kind: "rubric", area })}
            sx={{ minWidth: 0, textTransform: "none", color: "inherit", fontWeight: 600, p: "var(--space-1) var(--space-1)" }}
          >
            {area} <span>{sortLabel({ kind: "rubric", area })}</span>
          </Button>
        </th>
      ))}
      <th>
        <Button
          variant="text"
          size="small"
          onClick={() => onSort({ kind: "total" })}
          sx={{ minWidth: 0, textTransform: "none", color: "inherit", fontWeight: 600, p: "var(--space-1) var(--space-1)" }}
        >
          Total <span>{sortLabel({ kind: "total" })}</span>
        </Button>
      </th>
      <th>
        <Button
          variant="text"
          size="small"
          onClick={() => onSort({ kind: "overall" })}
          sx={{ minWidth: 0, textTransform: "none", color: "inherit", fontWeight: 600, p: "var(--space-1) var(--space-1)" }}
        >
          Feedback <span>{sortLabel({ kind: "overall" })}</span>
        </Button>
      </th>
    </tr>
  );
}

export default ResultsTableHeaderRow;
