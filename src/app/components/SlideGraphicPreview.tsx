"use client";

import type { SlideGraphic } from "@/lib/slide-graphics";
import styles from "./SlideGraphicPreview.module.css";

/**
 * On-screen mirror of the .pptx graphic rendering (buildSlidesPptx in
 * src/lib/pptx.ts): same three graphic kinds, same source data, rendered as
 * plain HTML/CSS instead of pptxgenjs shapes/tables. The instructor should
 * never have to download the deck to see whether a slide's graphic is any
 * good.
 */
export default function SlideGraphicPreview({ graphic }: { graphic: SlideGraphic }) {
  if (graphic.kind === "matrix2x2") {
    const quadrants = [
      graphic.quadrants.topLeft,
      graphic.quadrants.topRight,
      graphic.quadrants.bottomLeft,
      graphic.quadrants.bottomRight,
    ];
    return (
      <div className={styles.graphic}>
        <p className={styles.axisCaption}>
          {graphic.yAxisLabel} vs. {graphic.xAxisLabel}
        </p>
        <div className={styles.matrixGrid}>
          {quadrants.map((quadrant, i) => (
            <div key={i} className={styles.matrixQuadrant}>
              <p className={styles.matrixQuadrantLabel}>{quadrant.label}</p>
              {quadrant.items.length > 0 && (
                <ul className={styles.matrixQuadrantItems}>
                  {quadrant.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (graphic.kind === "process") {
    return (
      <div className={styles.graphic}>
        <div className={styles.processRow}>
          {graphic.steps.map((step, i) => (
            <div key={i} className={styles.processStep}>
              <p className={styles.processStepLabel}>
                {i + 1}. {step.label}
              </p>
              {step.caption && <p className={styles.processStepCaption}>{step.caption}</p>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.graphic}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {graphic.headers.map((header, i) => (
                <th key={i}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {graphic.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
