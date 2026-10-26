/** Client-safe policy bounds shared by grading controls and request guards. */
export const LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT = 1;
export const LENGTH_DEDUCTION_THRESHOLD_WORDS_MAX = 1_000_000;
export function isLengthDeductionThresholdWords(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= LENGTH_DEDUCTION_THRESHOLD_WORDS_MAX;
}

/** Frozen grading instructions, not a deterministic word counter. */
export function lengthDeductionThresholdDirective(threshold: number): string {
  return `Length: use only an explicit, unambiguous assignment or rubric minimum word count R for the submission or discussion axis being graded. Let actualStudentWords be the words in that student's work for that scope and shortfall = R - actualStudentWords. Deduct for length only when shortfall >= ${threshold} words. A shortfall smaller than ${threshold} words must receive no length deduction; work at or above R must receive no length deduction. If the minimum word count is missing or ambiguous, do not invent a numeric minimum and do not deduct for length. Other rubric and content deductions remain unchanged. Name any qualifying shortfall in the feedback.`;
}
