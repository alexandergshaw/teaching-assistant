const GENERIC_REASON = "Grading could not be completed. Review the submission and retry.";

/** Provider errors can contain secrets. Reveal only the exact, structured
 * missing-data message produced by the notebook evidence guard. */
export function instructorHoldReason(message: string): string {
  const match = /^This submission could not be graded: The notebook references (data\/[A-Za-z0-9_.\-/]+\.csv), which was not found in the inspected repository snapshot\. It may be generated or supplied separately; review the data before grading\. No score was assigned\.$/.exec(message);
  if (!match || match[1].length > 512 || match[1].split("/").some((part) => !part || part === "." || part === "..")) return GENERIC_REASON;
  return `The notebook references ${match[1]}, which was not found in the inspected repository snapshot. It may be generated or supplied separately; review the data before grading. No score was assigned.`;
}
