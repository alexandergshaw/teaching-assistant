import type { CourseFile } from "@/lib/canvas-modules";

export type LoadState = { status: "idle" | "loading" | "error"; message: string };

// ── Slide deck <-> plain text (for the "Add to each" .pptx generator) ─────────
// A deck is kept as editable plain text so it shares the one content textarea
// with documents: "# Presentation Title", then a "## Slide title" per slide with
// "- bullet" lines beneath it.
export type SlideDeck = { presentationTitle: string; slides: Array<{ title: string; bullets: string[] }> };

// One group of likely-duplicate files (same base name in the same folder). `keep`
// is the copy to retain (newest, since the latest edit lands on it); `strays` are
// the older copies that can be removed. Only groups with a real duplicate appear.
export interface DuplicateGroup {
  baseName: string;
  keep: CourseFile;
  strays: CourseFile[];
}
