"use client";

import { useState } from "react";
import type { LlmProvider } from "@/lib/llm";
import type { CanvasModule } from "@/lib/canvas-modules";
import { isConfirmArmed, selectionSignature } from "./confirmArming";
import { addContentToModuleDetailed } from "./moduleContentActions";
import { describeOrphans, type OrphanNote } from "./useBulkModuleActions";
import {
  readCourseDeadlineContextAction,
  generateCurrentEventsAssignmentsAction,
  type CurrentEventsGenerationRequest,
} from "@/app/actions/current-events-assignments";
import { planCurrentEventsAssignments } from "@/lib/current-events-assignment-plan";
import {
  CURRENT_EVENTS_POINTS,
  CURRENT_EVENTS_RECENCY_WINDOW,
  CURRENT_EVENTS_LENGTH_TARGET,
  buildCurrentEventsRequirementsBlock,
  describeCurrentEventsOutcome,
  type CurrentEventsOutcomeCounts,
} from "@/lib/current-events-assignment";

// The "Current events assignment" control's client-side orchestration
// (docs/current-events-assignment-from-modules-acceptance-criteria.md,
// section 3b is the final contract; D3 is this file's run order, D4 is why
// the deadline plan runs here rather than on a server action).
//
// This hook is the sole caller of 2B's planCurrentEventsAssignments - the
// only place in this whole chunk, other than that plan module itself, that
// may touch a Date derived from the course's own local wall-clock rule. It
// deliberately holds NO busy flag of its own: it drives the caller-supplied
// setOpBusy, and BulkModulesSection renders this control's group with
// announceBusy={false} so the bar-level live region stays the single
// announcer for this operation (entry 329's one-fact-one-region rule,
// satisfied by construction rather than by a later fix - two rounds of that
// exact bug were fixed in the previous chunk).
//
// Two-click arming reuses confirmArming.ts's existing idiom byte-for-byte
// (see useBulkModuleActions.ts's bulkDeleteModules): the armed state records
// WHAT IT WAS ARMED FOR (a signature of the selection at arm time), so any
// selection change invalidates the arm by construction - there is nothing to
// remember to reset, and no useEffect is needed (this repo's eslint rejects
// setState reached synchronously from an effect regardless).

export interface UseCurrentEventsAssignmentsReturn {
  confirmCurrentEvents: boolean;
  currentEventsLabel: string;
  runCurrentEventsAssignments: () => void;
}

// Step-11 regression finding: this group's `visible` predicate is driven by
// `facts.moduleCount`, which counts EVERY selected module key (live and
// export-sourced) - see buildBulkBarFacts.ts. `selectedModules` here is
// `selection.liveModuleIds` (ModulesView.tsx), live-only. On a selection made
// entirely of export-sourced modules the button still renders and still
// arms, but there is nothing this hook can act on. D9 (the AC's own doc)
// records the underlying source-discrimination gap as pre-existing and
// repo-wide, shared with `Add` and `Delete`, and explicitly out of scope
// here - this constant exists only to name the reason ONCE, through the
// existing setNote channel, instead of the silent `return` the regression
// pass caught (a dead click with no note at all, worse than `Add`/`Delete`
// failing loudly against Canvas).
const NO_LIVE_MODULES_NOTE = {
  kind: "error" as const,
  text: "This action needs live Canvas modules to create assignments in, and the current selection has none.",
};

export function useCurrentEventsAssignments(
  courseUrl: string,
  acronym: string | undefined,
  exportCourseId: string | undefined,
  provider: LlmProvider,
  modules: CanvasModule[],
  selectedModules: Set<number>,
  setOpBusy: (b: boolean) => void,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  reload: () => void
): UseCurrentEventsAssignmentsReturn {
  const [armedFor, setArmedFor] = useState<string | null>(null);
  const selectionSig = selectionSignature(selectedModules);
  const confirmCurrentEvents = isConfirmArmed(armedFor, selectionSig);

  // AC4 / W4: the GROUP carries the noun ("Current events assignment"); this
  // label is the sentence the armed second click states in full, e.g.
  // "Create 4 assignments?" - counted off the SELECTION, not off the plan's
  // createCount, because arming happens on the first click, before the
  // deadline-context round trip or the idempotency plan have run at all.
  const currentEventsLabel = confirmCurrentEvents
    ? `Create ${selectedModules.size} assignment${selectedModules.size === 1 ? "" : "s"}?`
    : "Current events assignment";

  const runCurrentEventsAssignments = () => {
    // Step 0 (D3): first click ARMS and returns, writing nothing. Second
    // click with an unchanged selection signature proceeds. An all-export
    // selection is refused HERE, before arming: arming it would produce the
    // nonsensical "Create 0 assignments?" label (currentEventsLabel counts
    // this same selectedModules.size) and spend a second click confirming a
    // no-op. Saying why now, on the first click, is strictly earlier and
    // strictly cheaper than saying why after a second click commits to
    // nothing.
    if (!confirmCurrentEvents) {
      if (selectedModules.size === 0) {
        setNote(NO_LIVE_MODULES_NOTE);
        return;
      }
      setArmedFor(selectionSig);
      return;
    }
    setArmedFor(null);
    if (selectedModules.size === 0) {
      // Unreachable in normal flow once the arm-time refusal above is in
      // place - isConfirmArmed only returns true for a signature recorded
      // from a non-empty selectedModules, and selectionSignature changes the
      // instant the selection does. Kept anyway: a silent `return` here is
      // exactly the defect class this loop exists to catch, and a real
      // reason costs nothing to state even on a path that should not run.
      setNote(NO_LIVE_MODULES_NOTE);
      return;
    }

    void (async () => {
      // Step 1.
      setOpBusy(true);
      setNote(null);

      // Step 2: one round trip for the course's raw deadline columns. D4's
      // whole point - this hook, not any server action, is where those two
      // raw strings become a Date.
      const deadlineContext = await readCourseDeadlineContextAction(courseUrl, exportCourseId, acronym);
      const courseRowUnavailable = "error" in deadlineContext;
      const startDate = "error" in deadlineContext ? null : deadlineContext.startDate;
      const assignmentDueRule = "error" in deadlineContext ? null : deadlineContext.assignmentDueRule;

      // Step 3: the plan, IN THE BROWSER - the only place in this chunk
      // .toISOString() may run (see current-events-assignment-plan.ts's own
      // header comment for why that placement is load-bearing).
      const plan = planCurrentEventsAssignments({
        modules,
        selectedModuleIds: selectedModules,
        startDate,
        assignmentDueRule,
        courseRowUnavailable,
      });

      const toCreate = plan.entries.filter((entry) => entry.action === "create");

      // Step 4: the pre-check before any spend (D2). If every selected
      // module already has its assignment, report that and stop - no model
      // call, no Canvas write, no reload (nothing changed).
      if (toCreate.length === 0) {
        setOpBusy(false);
        const counts: CurrentEventsOutcomeCounts = {
          created: 0,
          skippedExisting: plan.skipCount,
          generationFailed: [],
          canvasFailed: [],
          noDeadline: [],
        };
        setNote(describeCurrentEventsOutcome(counts, ""));
        return;
      }

      // Step 5: one round trip, N calls inside, generation CONCURRENT.
      const requests: CurrentEventsGenerationRequest[] = toCreate.map((entry) => ({
        moduleId: entry.moduleId,
        moduleName: entry.moduleName,
        itemTitles: entry.itemTitles,
      }));
      const generated = await generateCurrentEventsAssignmentsAction(
        courseUrl,
        requests,
        provider,
        exportCourseId,
        acronym
      );

      if ("error" in generated) {
        // A top-level { error } means nothing was created at all.
        setOpBusy(false);
        setNote({ kind: "error", text: generated.error });
        return;
      }

      const outcomeByModuleId = new Map(generated.outcomes.map((outcome) => [outcome.moduleId, outcome]));

      // Step 6: Canvas writes STRICTLY SEQUENTIAL (Canvas throttles) - the
      // two phases (generate, then write) never interleave, and the two
      // failure lists (generationFailed, canvasFailed) stay genuinely
      // separate the whole way through.
      let created = 0;
      const generationFailed: string[] = [];
      const canvasFailed: string[] = [];
      const noDeadline: CurrentEventsOutcomeCounts["noDeadline"] = [];
      const orphans: OrphanNote[] = [];

      for (const entry of toCreate) {
        const outcome = outcomeByModuleId.get(entry.moduleId);
        if (!outcome || outcome.status !== "ok") {
          // AC13/AC15: a non-"ok" outcome is recorded and the loop CONTINUES
          // - it never aborts the rest of the selected modules.
          generationFailed.push(entry.moduleName);
          continue;
        }

        if (entry.deadlineReason !== "ok") {
          noDeadline.push({ moduleName: entry.moduleName, reason: entry.deadlineReason });
        }

        const description = [
          outcome.body,
          buildCurrentEventsRequirementsBlock({
            deadlineText: entry.deadlineText,
            pointsPossible: CURRENT_EVENTS_POINTS,
            recencyWindow: CURRENT_EVENTS_RECENCY_WINDOW,
            lengthTarget: CURRENT_EVENTS_LENGTH_TARGET,
          }),
        ].join("\n\n");

        const result = await addContentToModuleDetailed(courseUrl, acronym, "Assignment", entry.moduleId, entry.title, {
          dueAt: entry.dueAtIso,
          points: CURRENT_EVENTS_POINTS,
          description,
          submissionType: "online_text_entry",
        });

        if (result.status === "success") {
          created += 1;
        } else if (result.status === "orphaned") {
          canvasFailed.push(entry.moduleName);
          orphans.push({ kind: result.kind, title: result.title, contentId: result.contentId });
        } else {
          canvasFailed.push(entry.moduleName);
        }
      }

      // Step 7.
      setOpBusy(false);
      const counts: CurrentEventsOutcomeCounts = {
        created,
        skippedExisting: plan.skipCount,
        generationFailed,
        canvasFailed,
        noDeadline,
      };
      setNote(describeCurrentEventsOutcome(counts, describeOrphans(orphans)));
      reload();
    })();
  };

  return { confirmCurrentEvents, currentEventsLabel, runCurrentEventsAssignments };
}
