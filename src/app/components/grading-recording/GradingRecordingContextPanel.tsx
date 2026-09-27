"use client";

// Extracted from GradingRecordingPanel.tsx (wave 3a-ii, docs/a39-waves.md
// section 8.1), the same headroom-only move wave 3a-i already made on
// SnapshotGradingPanel.tsx under branch (a): a `.tsx` component with no
// oracle of its own - nothing renders under this repo's vitest (node-env,
// collects only src/**/*.test.ts). No hook moved with it - knowledgeContext
// and its setter stay owned by the panel; this leaf only renders the
// "Context" fieldset (the carried-Knowledge-Base-pages notice plus the
// always-mounted "add a page" control).
//
// AC3/4b (docs/knowledge-recording-handoff-acceptance-criteria.md section
// 4): <AddKnowledgePages> is rendered unconditionally, OUTSIDE the
// `knowledgeContext &&` gate above it - an instructor carrying nothing yet
// is this feature's primary case, not an edge case. This ordering is pinned
// by src/app/components/recording/AddKnowledgePages.test.ts, re-pointed at
// this file in the same commit that moved the markup here (RULING 34: an
// anchor an extraction crosses becomes part of the extraction's write set).

import type { Dispatch, SetStateAction } from "react";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import { returnToKnowledge } from "@/lib/knowledge-return";
import { returnTargetPageId } from "./grading-context-display";
import CarriedKnowledgePages from "../recording/CarriedKnowledgePages";
import AddKnowledgePages from "../recording/AddKnowledgePages";
import type { RecordingKnowledgeContext } from "@/lib/recording-launch";

interface GradingRecordingContextPanelProps {
  knowledgeContext: RecordingKnowledgeContext | null;
  setKnowledgeContext: Dispatch<SetStateAction<RecordingKnowledgeContext | null>>;
}

export default function GradingRecordingContextPanel({
  knowledgeContext,
  setKnowledgeContext,
}: GradingRecordingContextPanelProps) {
  return (
    <fieldset className={controls.section}>
      <legend className={controls.sectionLegend}>Context</legend>
      {/* AC2/AC3/AC4 of docs/knowledge-recording-handoff-acceptance-criteria.md:
          extends this existing notice (already the reference implementation
          the sibling "discussions" destination is matched against) with the
          carried pages, individually removable, and a way back to where they
          were selected - without touching the label sentence or its
          placement. `pages` is ALREADY filtered to only what the budget
          included (AC1 - KnowledgeTab.tsx's includedContextPages, before this
          ever launches); CarriedKnowledgePages.tsx re-derives inclusion fresh
          on every removal (never assumes the original filter still holds -
          see that file's own header). Renders nothing when knowledgeContext
          is null (AC2's "carrying nothing renders nothing") - unchanged. */}
      {knowledgeContext && (
        <div className={styles.field}>
          <p className={styles.fieldHint}>
            {`Grading with Knowledge Base context: ${knowledgeContext.label ?? "selected pages"}.`}{" "}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => returnToKnowledge(returnTargetPageId(knowledgeContext.pages))}
            >
              Back to Knowledge
            </button>
          </p>
          <CarriedKnowledgePages context={knowledgeContext} onChange={setKnowledgeContext} />
        </div>
      )}
      {/* AC3/4b: rendered OUTSIDE the `knowledgeContext &&` gate above -
          unlike the label/CarriedKnowledgePages block, this must still offer
          something when nothing is carried yet at all. */}
      <AddKnowledgePages context={knowledgeContext} onChange={setKnowledgeContext} />
    </fieldset>
  );
}
