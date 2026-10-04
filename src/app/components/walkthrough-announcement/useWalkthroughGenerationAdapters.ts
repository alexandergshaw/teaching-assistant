"use client";

// The generation adapters of "Announcement from a walkthrough" - the research
// call, its fingerprint, the per-slot draft call and the post call - extracted
// from WalkthroughAnnouncementPanel.tsx (SMOOTH-WALKTHROUGH W3, R-AC16) so the
// panel stays well under its size target. Every literal server-action call of
// the drafting path now lives in THIS file and is handed to
// useAnnouncementDraftSlots as an injected adapter by the panel. Moved
// verbatim; no behavior change.

import { useCallback } from "react";
import { fnv1aHash } from "@/lib/lms-generation/generation-diag";
import type { AnnouncementOutline } from "@/lib/announcement-outline-types";
import {
  draftWalkthroughAnnouncementAction,
  postWalkthroughAnnouncementAction,
  gatherWalkthroughResourcesAction,
} from "@/app/actions/walkthrough-announcement";
import type { WtaCourseOption } from "./AnnouncementCourseFieldset";
import type { ResearchNotice, ResourceOutcome } from "./announcement-draft-slots";
import type { AnnouncementDraftRequestContext, AnnouncementDraftDispatchContext } from "./useAnnouncementDraftSlots";

export function useWalkthroughGenerationAdapters(selectedCourse: WtaCourseOption | null) {
  // G3 Ruling 2/9: the actual research call - the only site (per blocker 5)
  // that may call a server action directly. gatherWalkthroughResourcesAction
  // never rejects on its own known failure paths, but the hook's own
  // in-flight handling still treats a thrown error as "failed" as an outer
  // belt (mirroring useReplyResources.ts's own shape).
  const fetchResources = useCallback(
    (ctx: AnnouncementDraftRequestContext): Promise<ResourceOutcome> =>
      gatherWalkthroughResourcesAction(ctx.materialsText, ctx.courseLabel, ctx.provider),
    []
  );

  // G3 Ruling 17/33: a control-character-free fingerprint over every input
  // the research result depends on - course, module, a hash+length of the
  // materials text (never the full text itself, which can run to tens of
  // thousands of characters), and researchOn. JSON.stringify's own quoting
  // keeps the fields unambiguous without a literal delimiter character.
  const researchFingerprint = useCallback((ctx: AnnouncementDraftRequestContext): string => {
    return JSON.stringify([
      ctx.courseLabel,
      ctx.moduleLabel ?? "",
      ctx.materialsText.length,
      fnv1aHash(ctx.materialsText),
      ctx.researchOn,
    ]);
  }, []);

  const draftOne = useCallback(
    async (
      ctx: AnnouncementDraftDispatchContext,
      outline: AnnouncementOutline
    ): Promise<{ title: string; message: string; researchNotice: ResearchNotice } | { error: string }> => {
      // G3 Ruling 9/M3.3: the derivation from the once-per-Generate research
      // OUTCOME to the RAW resource list the composer/enforcer actually
      // consume - any outcome other than "found" contributes zero citable
      // resources.
      const researchedResources = ctx.researchOutcome.kind === "found" ? ctx.researchOutcome.links : [];
      const result = await draftWalkthroughAnnouncementAction({
        courseLabel: ctx.courseLabel,
        moduleLabel: ctx.moduleLabel,
        materialsText: ctx.materialsText,
        outline,
        coverageBlock: ctx.coverageBlock,
        notes: ctx.notes,
        provider: ctx.provider,
        emojiPolicy: ctx.emojiOn ? "requested" : "forbidden",
        researchedResources,
        researchOutcome: ctx.researchOutcome,
        timing: ctx.timing,
      });
      if ("error" in result) return { error: result.error };
      return { title: result.title, message: result.message, researchNotice: result.researchNotice };
    },
    []
  );

  const postDraft = useCallback(
    (title: string, message: string, delayedPostAt?: string) => {
      if (!selectedCourse) return null;
      return postWalkthroughAnnouncementAction(
        selectedCourse.canvasUrl,
        title,
        message,
        selectedCourse.institution ?? undefined,
        delayedPostAt
      ).then((result) => {
        if ("error" in result) {
          return { error: `Canvas refused the announcement - ${result.error}. Nothing was posted.` };
        }
        return { course: selectedCourse.name };
      });
    },
    [selectedCourse]
  );

  return { fetchResources, researchFingerprint, draftOne, postDraft };
}
