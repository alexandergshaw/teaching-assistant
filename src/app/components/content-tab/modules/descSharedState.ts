// S2 (docs/ux-audit-files-content.md): "Loaded the shared description - edits
// apply to all" used to be computed from only the fetches that SUCCEEDED.
// Select 10 assignments; 5 fetches fail (rate limit, a deleted quiz, a
// network blip); the surviving 5 share a description; the UI claimed it had
// read every item's current description and pre-filled the box with it.
// bulkSetDescription (useBulkItemActions.ts) is an unconfirmed, primary,
// fan-out write - pressing "Set description" then overwrote all 10,
// including the 5 the app never actually read and cannot know differed.
//
// Pulled out as a pure function (not left inline in the effect) so the
// partial-fetch path is exercised directly with frozen literals rather than
// only through the stateful hook - see descSharedState.test.ts.
export type DescSharedState = "idle" | "loading" | "same" | "mixed" | "partial";

export interface DescShareResult {
  state: DescSharedState;
  /** What to pre-fill the bulk description field with. Deliberately "" (not
   * one of the successfully-read values) whenever the read was incomplete
   * OR the successful subset disagrees - a plausible-looking pre-filled
   * value is exactly what would let a partial read feed an unconfirmed
   * overwrite. */
  description: string;
  /** How many selected gradables' current description could NOT be read
   * (failed fetch). Zero whenever `state` is not "partial". */
  uncheckedCount: number;
  /** Total selected gradables considered (checked + unchecked). */
  totalCount: number;
}

const IDLE_RESULT: Omit<DescShareResult, "totalCount"> = {
  state: "idle",
  description: "",
  uncheckedCount: 0,
};

/**
 * Classify the shared-description state from the descriptions that were
 * SUCCESSFULLY fetched, against the total number of gradables that were
 * selected (successes + failures). `descriptions` must contain only the
 * successful fetches' values - failures are represented purely by
 * `totalCount` being larger than `descriptions.length`, never by a
 * placeholder entry in the array.
 */
export function classifyDescriptionShare(
  descriptions: readonly string[],
  totalCount: number
): DescShareResult {
  const checkedCount = descriptions.length;
  const uncheckedCount = totalCount - checkedCount;

  if (checkedCount === 0) {
    return { ...IDLE_RESULT, totalCount };
  }

  // Some selected gradables' current description could not be read. The
  // successful subset might happen to share a value, but claiming "shared"
  // here would assert the app read every item's current text when it did
  // not - so this branch wins regardless of what the checked subset shows,
  // and the field is left blank rather than pre-filled from an incomplete
  // read.
  if (uncheckedCount > 0) {
    return { state: "partial", description: "", uncheckedCount, totalCount };
  }

  const allSame = descriptions.every((d) => d === descriptions[0]);
  return {
    state: allSame ? "same" : "mixed",
    description: allSame ? descriptions[0] : "",
    uncheckedCount: 0,
    totalCount,
  };
}
