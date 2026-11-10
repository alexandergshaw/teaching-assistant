/** Detect explicit model-reported length penalties; silence is not proof of compliance. */
export function reportsLengthPenalty(text: string): boolean {
  const penalty = /\b(?:deduct(?:ed|ion|ions)?|penalt(?:y|ies)|subtract(?:ed|ion)?|lost\s+(?:\d+(?:\.\d+)?\s+)?points?|\d+(?:\.\d+)?\s+points?\s+off)\b/i;
  const length = /\b(?:word\s*count|character\s*count|page\s*count|length|too\s+short|(?:word|page|character|time)\s+(?:limit|minimum|requirement)|(?:under|below|fewer\s+than|less\s+than|only)\s+(?:the\s+)?\d+\s*(?:words?|characters?|pages?|minutes?|seconds?))\b/i;
  return text.split(/(?<!\d)\.(?!\d)|[!?\n]+/).some((sentence) => {
    if (!penalty.test(sentence) || !length.test(sentence)) return false;
    // Explicitly negated deductions are not evidence that a penalty was applied.
    if (/\b(?:no|without|never)\s+(?:length\s+|word\s+count\s+)?(?:deduction|penalty|points?\s+(?:were\s+)?deducted)\b/i.test(sentence) || /\b(?:did\s+not|didn.t|not)\s+(?:apply|make|take|deduct|subtract)\b/i.test(sentence)) return false;
    return true;
  });
}

/** Detect a shortfall on an explicitly length-only scored criterion. */
export function reportsLengthCriterionDeduction(area: string, score: string): boolean {
  if (!/^\s*(?:word\s*count|character\s*count|page\s*count|length|submission\s+length|word\s+limit|page\s+limit|character\s+limit)\s*$/i.test(area)) return false;
  const fraction = score.trim().match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  return !!fraction && Number(fraction[2]) > 0 && Number(fraction[1]) < Number(fraction[2]);
}
