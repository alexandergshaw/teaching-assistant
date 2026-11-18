/** Conservative language screen, not proof that feedback is fully grounded. */
export function notebookFeedbackClaimsRuntime(text: string): boolean {
  return /\b(?:reproduc(?:ed|ible|ibility)|execution\s+(?:was\s+)?(?:successful|succeeded|failed)|(?:notebook|program|code|script)\s+(?:(?:was|is|has been)\s+)?(?:ran|run|executed|runs?|executes?)\s+(?:successfully|without errors|correctly|as expected)|(?:tests?|test suite)\s+(?:all\s+)?(?:passed|succeeded|failed)|(?:i|we)\s+(?:ran|executed|tested)\b)/i.test(text);
}
