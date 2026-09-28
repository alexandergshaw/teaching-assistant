"use client";

// A39 incremental-fill W5 (docs/a39-fill-waves.md; docs/a39-incremental-fill-
// architecture.md section 10): extracted out of GradingTab.tsx to keep that
// file under its -le 620 bound after this wave's merged mount. A
// self-contained, pure render of one value (`generatedRubric`) with no other
// dependency on GradingTab's own state - named as the sanctioned cut rather
// than taken speculatively (the design's own words: "if it lands above 620,
// the extraction is named and it is not a judgement call").
import { parseGeneratedRubric } from "../../utils/rubric";
import styles from "../../page.module.css";

export default function GeneratedRubricCard({ generatedRubric }: { generatedRubric: string }) {
  const rows = parseGeneratedRubric(generatedRubric);
  return (
    <details className={styles.generatedRubricCard}>
      <summary>Rubric was auto-generated from assignment instructions</summary>
      {rows ? (
        <table className={styles.generatedRubricTable}>
          <thead>
            <tr>
              <th>Criterion</th>
              <th>Weight</th>
              <th>Performance Levels</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.area}>
                <td>{row.area}</td>
                <td>{row.weight.endsWith("%") ? row.weight : `${row.weight}%`}</td>
                <td>
                  {row.subcategories.length > 0 ? (
                    <ul className={styles.rubricSubcategoryList}>
                      {row.subcategories.map((sub) => (
                        <li key={sub.label}><strong>{sub.label}:</strong> {sub.description}</li>
                      ))}
                    </ul>
                  ) : row.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <pre className={styles.generatedRubricBody}>{generatedRubric}</pre>
      )}
    </details>
  );
}
