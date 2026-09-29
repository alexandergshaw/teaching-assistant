// Seam types for the presentations-authoring feature (PRES-1).
//
// This module is TYPE-ONLY: no runtime code is emitted, so it is the one
// legal exception to "a wave must include the caller of every new export"
// (docs/loop/seats.md:163-165) - there is nothing to call.
//
// PptxSlide and GeneratedDeck are reused verbatim (docs/pres-1-architecture.md
// section 6.1): there is exactly ONE slide model in this app, and no local
// slide-shaped interface is declared here or anywhere under
// src/lib/presentations/ (see parse.test.ts for the guard).

import type { PptxSlide } from "@/lib/pptx";
import type { GeneratedDeck } from "@/lib/decks/generate";
import type { DeckSourceReceipt } from "@/lib/decks/deck-source";

export type ContentArtifactKind = "outline" | "activities" | "deck";

// The four independently-selectable artifacts (AC-4). `review` is not a
// fourth content kind: when true, each PRODUCED content artifact carries its
// own critique (AC-5 reconciliation,
// docs/pres-1-acceptance-criteria.md:194-199).
export interface ArtifactSelection {
  outline: boolean;
  activities: boolean;
  deck: boolean;
  review: boolean;
}

// The pasted context (AC-3: files AND text, in-house only). `sources` are the
// file receipts extracted server-side by extractDeckSourceFileAction; their
// TEXT (not raw bytes) feeds every prompt by code. PLURAL: AC-3 is "files AND
// text", and multiple uploaded files each become one PresentationSource -
// there is no singular-file seam (R-UX-8).
export interface PresentationSource {
  name: string;
  text: string;
}

export interface PresentationContext {
  text: string;
  sources: PresentationSource[];
}

export interface OutlineContent {
  markdown: string;
}

// 3-5 ideas is prompt/OWNER guidance (R-3), not a machine-enforced count.
export interface ActivitiesContent {
  ideas: string[];
}

// Deck content IS GeneratedDeck (reused): { presentationTitle; slides: PptxSlide[] }.
export type DeckContent = GeneratedDeck;

export interface Critique {
  text: string;
}

// Per-artifact keying is STRUCTURAL (AC-5): the critique lives INSIDE the
// produced artifact, so "a critique for a non-produced artifact" is
// unrepresentable, and "a produced-and-reviewed artifact with no critique" is
// exactly critique === null.
export type ProducedArtifact =
  | { kind: "outline"; content: OutlineContent; critique: Critique | null }
  | { kind: "activities"; content: ActivitiesContent; critique: Critique | null }
  | { kind: "deck"; content: DeckContent; critique: Critique | null };

// Exactly the selected content kinds; the client assembles this array from
// per-kind responses (docs/pres-1-architecture.md section 6.2). No server
// function returns this shape directly.
export interface GenerationResult {
  artifacts: ProducedArtifact[];
}

export interface RegenerateInput {
  kind: ContentArtifactKind;
  priorContext: PresentationContext; // folded in BY CODE (LEV-1/AC-7)
  priorCritique: Critique | null; // folded in BY CODE (LEV-1/AC-7)
  priorContent: ProducedArtifact["content"] | null; // the version being improved
  withReview: boolean; // re-run the critique after regeneration
}

// The persisted intake receipt reuses the existing shape; PptxSlide is
// re-exported so any presentations file that needs the slide type imports it
// from here without a second declaration.
export type { DeckSourceReceipt, PptxSlide };
