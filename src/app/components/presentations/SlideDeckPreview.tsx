"use client";

// On-page deck preview for the Presentations > Slide Deck Creation panel
// (PRES-1 wave 3). Renders PptxSlide[] as plain escaped React text - the same
// idiom as ppt-design/GeneratePanel.tsx's slide cards (title/bullets/code via
// ordinary JSX interpolation, never dangerouslySetInnerHTML). SEC-2 /
// in-house-only: this is the whole preview surface, never an external
// viewer/iframe/redirect.

import { Card, CardContent } from "@mui/material";
import type { PptxSlide } from "@/lib/pptx";

export default function SlideDeckPreview({
  slides,
  startNumber,
}: {
  slides: PptxSlide[];
  startNumber?: number;
}) {
  if (slides.length === 0) {
    return <p style={{ color: "var(--text-secondary)" }}>This deck has no slides yet.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {slides.map((slide, idx) => (
        <Card key={idx} variant="outlined">
          <CardContent>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "start",
                marginBottom: "var(--space-2)",
              }}
            >
              <h5 style={{ margin: 0, fontSize: "var(--font-size-md)", fontWeight: 600 }}>
                {(startNumber ?? 1) + idx}. {slide.title}
              </h5>
            </div>

            {slide.bullets.length > 0 && (
              <ul
                style={{
                  margin: "var(--space-2) 0",
                  paddingLeft: "var(--space-6)",
                  fontSize: "var(--font-size-md)",
                }}
              >
                {slide.bullets.map((bullet, i) => (
                  <li key={i}>{bullet}</li>
                ))}
              </ul>
            )}

            {slide.code && (
              <div
                style={{
                  marginTop: "var(--space-3)",
                  padding: "var(--space-3)",
                  backgroundColor: "rgba(0,0,0,0.05)",
                  borderRadius: "var(--radius-xs)",
                  fontFamily: "monospace",
                  fontSize: "var(--font-size-sm)",
                  overflow: "auto",
                  maxHeight: "150px",
                  color: "var(--text-secondary)",
                }}
              >
                {slide.codeLanguage && (
                  <div
                    style={{
                      fontSize: "var(--font-size-xs)",
                      fontWeight: 500,
                      marginBottom: "var(--space-1)",
                    }}
                  >
                    {slide.codeLanguage.toUpperCase()}
                  </div>
                )}
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {slide.code}
                </pre>
              </div>
            )}

            {slide.notes && (
              <p
                style={{
                  marginTop: "var(--space-3)",
                  fontSize: "var(--font-size-sm)",
                  color: "var(--text-secondary)",
                  fontStyle: "italic",
                }}
              >
                Speaker notes: {slide.notes}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
