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
} from "@/app/actions/walkthrough-announcement";
import type { gatherWalkthroughResourcesAction as gatherWalkthroughResourcesServerAction } from "@/app/actions/walkthrough-announcement";
import { readActionRouteResponse } from "@/lib/action-route-response";
import type { WtaCourseOption } from "./AnnouncementCourseFieldset";
import type { ResearchNotice, ResourceOutcome } from "./announcement-draft-slots";
import type { AnnouncementDraftRequestContext, AnnouncementDraftDispatchContext } from "./useAnnouncementDraftSlots";

// G4 Wave 3b: the research call goes through a Route Handler that declares a
// ceiling and races the work against an elapsed-aware budget, so a slow model
// comes back as a worded failure (504) instead of a raw transport failure.
// Same signature and result shape as the Server Action it wraps. A route-level
// { error } (timeout, auth, bad response) is mapped to the action's own
// { kind: "failed", reason } outcome so the caller sees one shape.
const gatherWalkthroughResourcesAction: typeof gatherWalkthroughResourcesServerAction = async (...args) => {
  try {
    const res = await fetch("/api/walkthrough-resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args }),
    });
    const parsed = await readActionRouteResponse<ResourceOutcome>(res);
    if ("error" in parsed) return { kind: "failed", reason: parsed.error };
    return parsed;
  } catch (err) {
    return { kind: "failed", reason: err instanceof Error ? err.message : "Could not research resources." };
  }
};

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
        revision: ctx.revision,
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
          return {
            error: `Canvas did not confirm the announcement - ${result.error}. Check the course's announcements in Canvas before posting again.`,
          };
        }
        return { course: selectedCourse.name };
      });
    },
    [selectedCourse]
  );

  return { fetchResources, researchFingerprint, draftOne, postDraft };
}
