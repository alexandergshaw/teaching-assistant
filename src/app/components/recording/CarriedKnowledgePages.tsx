"use client";

// AC3 of docs/knowledge-recording-handoff-acceptance-criteria.md, section 4
// ("adjust from the recording side"): lets an instructor remove a carried
// Knowledge Base page from an in-flight recording/grading run without
// leaving this panel to go back to the Knowledge tab. Shared by
// DiscussionRepliesPanel.tsx and GradingRecordingPanel.tsx - the only two
// destinations a RecordingKnowledgeContext ever reaches (recording-launch.ts
// AC2's own "exactly two destinations" note).
//
// 4a's own correction: RecordingKnowledgeContext.text is an already-
// flattened, joined prompt string, and `pages` used to carry no `body` - so
// a remove control built on that shape could only ever lie (hide a title
// from the display while the model still received that page's content on
// the next batch) or do fragile string surgery on the flattened blob
// (breaks on duplicate titles or a body containing the header text). The
// fix: `pages` now carries `body` too (recording-launch.ts,
// knowledge-helpers.ts's SelectedContextPage) - zero extra fetches, since
// KnowledgeTab.tsx already holds every selected page's full body client-side
// before it ever launches. Removal is a pure, client-side recompute of
// buildKnowledgeContextBlock over the remaining pages - never a network
// call, never string surgery.
//
// AC1 still governs the result: the budget loop is not a prefix (`continue`,
// not `break` - knowledge-context.ts's own doc), so this recompute NEVER
// reuses a stale included/omitted flag from an earlier computation. It
// re-derives inclusion from a FRESH buildKnowledgeContextBlock call every
// time a page is removed or restored, via includedContextPages - the exact
// helper KnowledgeTab.tsx's own launch sites already use for the same
// reason.
//
// Recoverability (aesthetics pass - a removal needs no confirmation dialog,
// but must be undoable): the page just removed stays recoverable through an
// inline "Undo" line until either the instructor clicks it, or a genuinely
// NEW launch arrives from the Knowledge tab and replaces this run's whole
// context (a fresh selection invalidates the old undo history - restoring a
// page from a DIFFERENT selection into a NEW one would be surprising, not
// helpful). Removing the last remaining page clears the context entirely
// (RecordingKnowledgeContext's own "never empty when present" contract), so
// the pages list disappears along with it - AC2's "carrying nothing renders
// nothing" - but the "Undo" line stays up on its own, since it is reporting a
// completed action, not claiming anything is currently carried. Beyond the
// single-level Undo here, the instructor's other recovery path is the
// existing "Back to Knowledge" link (GradingRecordingPanel.tsx) / relaunching
// "Start recording" with the same selection - the pages came from that tab,
// so it is always the ultimate source of truth to re-select from.

import { useState } from "react";
import styles from "../../page.module.css";
import controls from "./RecordingControls.module.css";
import { buildKnowledgeContextBlock } from "@/lib/chat/knowledge-context";
import {
  includedContextPages,
  describeKnowledgeContextLabel,
  type SelectedContextPage,
} from "../knowledge/knowledge-helpers";
import type { RecordingKnowledgeContext } from "@/lib/recording-launch";

/**
 * Pure recompute (AC1's own rule, restated for this control): rebuild the
 * carried context from scratch over whatever pages remain, never carrying
 * forward a stale included/omitted flag. Returns null when nothing remains,
 * or when the budget itself renders an empty block (both mirror
 * buildKnowledgeContextBlock's/RecordingKnowledgeContext's own "absent, not
 * empty" contract) - the caller passes this straight to whatever setter
 * feeds the draft loop / grading pipeline.
 */
export function recomputeCarriedKnowledgeContext(
  remainingPages: SelectedContextPage[]
): RecordingKnowledgeContext | null {
  if (remainingPages.length === 0) return null;
  const block = buildKnowledgeContextBlock({
    pages: remainingPages.map((p) => ({ title: p.title, body: p.body })),
    attachments: [],
  });
  if (!block.text) return null;
  const contextPages = includedContextPages(remainingPages, block.pageResults);
  return {
    text: block.text,
    label: describeKnowledgeContextLabel(remainingPages.length, block.includedPages, block.omittedPages),
    ...(contextPages.length > 0 ? { pages: contextPages } : {}),
  };
}

interface CarriedKnowledgePagesState {
  /** The `pages` array this component last saw arrive from `context` -
   *  compared by REFERENCE against the current prop below to tell "a new
   *  launch replaced this run's context" (the arrays differ) apart from
   *  "our own onChange round-tripped back down as a prop" (same array,
   *  since neither this component nor either panel clones it). */
  lastSeenPages: SelectedContextPage[] | undefined;
  /** Removed-page history, most recent last - only ever popped by Undo, or
   *  cleared outright when `lastSeenPages` no longer matches (a fresh
   *  launch). */
  removed: SelectedContextPage[];
}

export interface CarriedKnowledgePagesProps {
  /** The run's currently carried context, or null when nothing is carried -
   *  the same value each panel already threads into its own "Drafting/
   *  Grading with Knowledge Base context" label line. Renders nothing when
   *  `pages` is absent even though `context` itself is not null - a launch
   *  can degrade `pages` away while keeping `text`/`label` (recording-
   *  launch.ts's sanitizer), and there is no per-page identity left to build
   *  a removal control on top of in that case. */
  context: RecordingKnowledgeContext | null;
  /** Replace the carried context wholesale. The caller owns applying this to
   *  whatever state actually feeds the draft loop / grading pipeline - this
   *  component never reaches into either directly. */
  onChange: (next: RecordingKnowledgeContext | null) => void;
}

export default function CarriedKnowledgePages({ context, onChange }: CarriedKnowledgePagesProps) {
  const pages = context?.pages;

  // "Adjust state during render" idiom (AGENTS.md's setState-in-effect rule;
  // mirrors knowledge-helpers.ts's useKbInstitutionSelection prevActive
  // pattern) rather than a useEffect - resets the undo history only when
  // `pages` changed identity from something other than what THIS component
  // itself last produced via onChange (see the state field's own comment).
  const [state, setState] = useState<CarriedKnowledgePagesState>(() => ({
    lastSeenPages: pages,
    removed: [],
  }));
  if (pages !== state.lastSeenPages) {
    setState({ lastSeenPages: pages, removed: [] });
  }

  const hasPages = !!pages && pages.length > 0;
  const lastRemoved = state.removed.length > 0 ? state.removed[state.removed.length - 1] : null;
  if (!hasPages && !lastRemoved) return null;

  const handleRemove = (id: string) => {
    if (!pages) return;
    const removedPage = pages.find((p) => p.id === id);
    if (!removedPage) return;
    const remaining = pages.filter((p) => p.id !== id);
    const next = recomputeCarriedKnowledgeContext(remaining);
    setState({ lastSeenPages: next?.pages, removed: [...state.removed, removedPage] });
    onChange(next);
  };

  const handleUndo = () => {
    if (!lastRemoved) return;
    const remaining = [...(pages ?? []), lastRemoved];
    const next = recomputeCarriedKnowledgeContext(remaining);
    setState({ lastSeenPages: next?.pages, removed: state.removed.slice(0, -1) });
    onChange(next);
  };

  return (
    // Fixer pass finding 1: controls.section is the fieldset reset (it also
    // carries the `.section + .section` hairline rule); this is a plain
    // grouping div rendered inside the discussions Context section beside
    // AddKnowledgePages - controls.stack instead, so no stray hairline and
    // 16px gap appear between the carried chips and the Add link.
    <div className={controls.stack}>
      {hasPages && (
        // Fixer pass finding 6: styles.attachmentChips (page.module.css:4394)
        // is the standalone attachment-tray idiom - it carries its OWN
        // padding and a shaded background because elsewhere it renders as a
        // self-contained tray. Here it sits inside a fieldset that already
        // supplies its own spacing/hairline, so the padded, shaded tray
        // look would double up against the surrounding section - the
        // inline override is a deliberate second authority stripping that
        // chrome back to bare chips for this context, not a redundant
        // duplicate of what the class already provides. Kept.
        <div className={styles.attachmentChips} style={{ padding: 0, background: "none" }}>
          {pages!.map((p) => {
            const title = p.title.trim() || "Untitled page";
            return (
              <span key={p.id} className={styles.attachmentChip} title={title}>
                <span className={styles.attachmentChipName}>{title}</span>
                <button
                  type="button"
                  className={styles.attachmentChipRemove}
                  onClick={() => handleRemove(p.id)}
                  aria-label={`Remove ${title} from this run`}
                  title="Remove from this run"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      {lastRemoved && (
        <p className={styles.fieldHint}>
          {`Removed "${lastRemoved.title.trim() || "Untitled page"}" from this run.`}{" "}
          <button type="button" className={styles.linkButton} onClick={handleUndo}>
            Undo
          </button>
        </p>
      )}
    </div>
  );
}
