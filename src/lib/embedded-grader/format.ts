/**
 * Number formatting helpers for the embedded grader.
 */

/**
 * Round a number to 2 decimal places.
 */
export function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Format a number as a string, showing integers without decimals and
 * non-integers rounded to 2 decimal places.
 */
export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(roundTo2(value));
}
