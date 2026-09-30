// PRES-2 S6.7 gap closer: the pipeline's review stages (11/12) currently run
// only the LLM route-op (parseChecklistResponse), never
// runDeterministicChecklist (checklists.ts), so the two "deterministic" items
// per checklist (vocab-without-a-model, standalone-reconstructable) are never
// actually checked in the pipeline, only asked-about in the llm prompt's
// companion pass never runs. This leaf is the pure merge step that closes
// that gap: given one ChecklistResult from the deterministic pass and one
// from the parsed llm pass (same checklist), produce a single ChecklistResult
// that is a true completeness receipt for the whole checklist.
//
// Pure leaf: no IO, no callLlm, no fetch. Imports only the types and
// runDeterministicChecklist from checklists.ts (its own shipped S4 leaf) -
// no GeneratedDeck/PptxSlide, no other deck-standard file, matching the
// "self-contained leaf" policy stated in checklists.ts:29-30 and
// frame.ts:18-22.
//
// WIRING NOTE: making PipelineTab (or whichever review stage runs today)
// actually call runDeterministicChecklist and pass its result into
// mergeChecklistResults alongside the route's parsed llm result is a
// SEPARATE, tiny follow-up. This file only provides the pure merge function
// and does not change any caller.

import {
  type Checklist,
  type ChecklistDeckInput,
  type ChecklistFinding,
  type ChecklistResult,
  runDeterministicChecklist,
} from "./checklists";

/**
 * MERGE POLICY (implemented exactly as stated here):
 *
 * 1. Version: `deterministic` and `llm` are expected to be results for the
 *    SAME checklist, i.e. the same `checklistVersion`. This is asserted by
 *    inspection, never thrown on: if the two disagree, the merged result
 *    prefers the DETERMINISTIC checklistVersion, and a synthetic finding
 *    (checklistId "review-merge", itemId "checklist-version-mismatch") is
 *    appended noting both versions seen, so the mismatch is visible in the
 *    receipt rather than silently smoothed over or crashing the caller.
 *
 * 2. Findings: the merged findings array is `deterministic.findings` FIRST,
 *    then `llm.findings`, preserving each source's internal order. The two
 *    sources are NOT deduplicated against each other in general - a
 *    deterministic finding and an llm finding on the same itemId are
 *    different evidence and both are kept - EXCEPT when a finding is
 *    byte-identical (same checklistId + itemId + slideIndex + message) to
 *    one already kept from the other source, in which case only the first
 *    occurrence (the deterministic one, since it is placed first) is kept.
 *
 * 3. ranItemIds: the merged ranItemIds is the UNION of
 *    `deterministic.ranItemIds` and `llm.ranItemIds`, de-duplicated, in
 *    stable order (deterministic's own order first, then any llm ids not
 *    already present). This is the completeness receipt: a checklist item is
 *    "covered" if EITHER pass ran it, so a checklist whose deterministic
 *    items were run by the deterministic pass and whose llm items were run
 *    by the llm pass reports the WHOLE checklist as covered, not just
 *    whichever single pass a caller happened to run.
 */
export function mergeChecklistResults(
  deterministic: ChecklistResult,
  llm: ChecklistResult
): ChecklistResult {
  const mismatchFindings: ChecklistFinding[] = [];
  let checklistVersion = deterministic.checklistVersion;

  if (deterministic.checklistVersion !== llm.checklistVersion) {
    checklistVersion = deterministic.checklistVersion;
    mismatchFindings.push({
      checklistId: "review-merge",
      itemId: "checklist-version-mismatch",
      message: `Deterministic pass used checklistVersion "${deterministic.checklistVersion}" but llm pass used "${llm.checklistVersion}"; preferring the deterministic version.`,
    });
  }

  const findings: ChecklistFinding[] = [];
  const seen = new Set<string>();

  const addFinding = (finding: ChecklistFinding) => {
    const key = `${finding.checklistId}\u0000${finding.itemId}\u0000${finding.slideIndex ?? ""}\u0000${finding.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(finding);
  };

  for (const finding of deterministic.findings) addFinding(finding);
  for (const finding of llm.findings) addFinding(finding);
  for (const finding of mismatchFindings) addFinding(finding);

  const ranItemIds: string[] = [];
  const seenRan = new Set<string>();
  for (const itemId of [...deterministic.ranItemIds, ...llm.ranItemIds]) {
    if (seenRan.has(itemId)) continue;
    seenRan.add(itemId);
    ranItemIds.push(itemId);
  }

  return { checklistVersion, findings, ranItemIds };
}

/**
 * Convenience helper: run the deterministic pass for `checklist` against
 * `deck` and merge it with an already-parsed `llm` ChecklistResult (e.g. the
 * output of parseChecklistResponse). `mergeChecklistResults` itself stays the
 * pure, independently-testable core; this wrapper only adds the one
 * synchronous, side-effect-free call to runDeterministicChecklist.
 */
export function mergeWithDeterministicChecklist(
  checklist: Checklist,
  deck: ChecklistDeckInput,
  llm: ChecklistResult
): ChecklistResult {
  const deterministic = runDeterministicChecklist(checklist, deck);
  return mergeChecklistResults(deterministic, llm);
}
