import { isLengthDeductionThresholdWords, LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT } from "@/lib/grade/length-deduction-policy";
import { recordGradingDiagnosticEntry } from "../grading/gradingDiagnosticLog";

export const LENGTH_THRESHOLD_ERROR = "Enter a whole number from 1 to 1,000,000 for the length deduction threshold.";
export function parseLengthDeductionThreshold(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return isLengthDeductionThresholdWords(value) ? value : null;
}
export function lengthDeductionThresholdError(enabled: boolean, value: number | undefined): string | null {
  return enabled && !isLengthDeductionThresholdWords(value ?? LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT) ? LENGTH_THRESHOLD_ERROR : null;
}
export function recordLengthDeductionThresholdChange(previous: string, next: string): void {
  const value = parseLengthDeductionThreshold(next);
  if (value === null || value === parseLengthDeductionThreshold(previous)) return;
  try {
    recordGradingDiagnosticEntry({ at: new Date().toISOString(), operation: "change_length_deduction_threshold", outcome: "success", durationMs: 0,
      lengthPolicyDetail: { thresholdWords: value } });
  } catch { /* Setting changes must survive diagnostic recorder failures. */ }
}
