/**
 * The status message shown after Canvas details are retrieved. Pure: moved out
 * of GradingTab.tsx verbatim (line-budget extraction), behavior unchanged.
 */
export function describeCanvasRetrieval(
  result: { description: string; rubricText: string },
  provider: string,
): string {
  const parts: string[] = [];
  if (result.description) parts.push("instructions");
  if (result.rubricText) parts.push("rubric");
  const base = parts.length
    ? `Retrieved ${parts.join(" + ")} from Canvas.`
    : "Retrieved from Canvas.";
  const noRubric = result.rubricText
    ? ""
    : " No rubric was found in Canvas; none will be synthesized. Grading uses the assignment instructions only (attach a rubric in Canvas for per-criterion scoring).";
  const caveat =
    provider === "other" && result.rubricText
      ? " Note: the deterministic grader needs a check-based CSV/JSON rubric; this Canvas rubric may not map to automated checks."
      : "";
  return base + noRubric + caveat;
}
