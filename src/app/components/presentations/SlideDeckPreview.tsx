"use client";

// On-page deck preview for the Presentations > Slide Deck Creation panel
// (PRES-1 wave 3). Renders PptxSlide[] as plain escaped React text - the same
// idiom as ppt-design/GeneratePanel.tsx's slide cards (title/bullets/code via
// ordinary JSX interpolation, never dangerouslySetInnerHTML). SEC-2 /
// in-house-only: this is the whole preview surface, never an external
// viewer/iframe/redirect.

import { Card, CardContent } from "@mui/material";
import type { PptxSlide } from "@/lib/pptx";
import styles from "./presentations.module.css";

export default function SlideDeckPreview({
  slides,
  startNumber,
}: {
  slides: PptxSlide[];
  startNumber?: number;
}) {
  if (slides.length === 0) {
    return <p className={styles.emptyPreview}>This deck has no slides yet.</p>;
  }

  return (
    <div className={styles.slidePreviewList}>
      {slides.map((slide, idx) => (
        <Card className={styles.slidePreviewCard} key={idx} variant="outlined">
          <CardContent className={styles.slidePreviewContent}>
            <div className={styles.slidePreviewHeading}>
              <h4 className={styles.slideTitle}>
                {(startNumber ?? 1) + idx}. {slide.title}
              </h4>
            </div>

            {slide.bullets.length > 0 && (
              <ul className={styles.slideBullets}>
                {slide.bullets.map((bullet, i) => (
                  <li key={i}>{bullet}</li>
                ))}
              </ul>
            )}

            {slide.code && (
              <div className={styles.slideCode}>
                {slide.codeLanguage && (
                  <div className={styles.slideCodeLanguage}>
                    {slide.codeLanguage.toUpperCase()}
                  </div>
                )}
                <pre className={styles.slideCodeText}>
                  {slide.code}
                </pre>
              </div>
            )}

            {slide.notes && (
              <p className={styles.slideNotes}>
                Speaker notes: {slide.notes}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
