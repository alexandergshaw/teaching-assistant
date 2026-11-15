const QUIZ = /\b(?:quiz(?:zes)?|knowledge\s+checks?)\b/i;
const NEGATED_QUIZ = /\b(?:no|without|not|never)\s+(?:an?\s+)?(?:quiz(?:zes)?|knowledge\s+checks?)(?:\s*#?\d+)?\b|\b(?:quiz(?:zes)?|knowledge\s+checks?)(?:\s*#?\d+)?\s+(?:(?:(?:is|are|was|were|will be)\s+)?(?:cancelled|canceled|unavailable|not\s+(?:available|scheduled|offered|assigned|held|happening|occurring|required|needed))|will\s+not\s+be\s+(?:held|offered|scheduled|assigned))\b/gi;

/** A bare negative statement is not evidence that a quiz exists. */
export function hasQuizEvidence(text: string): boolean {
  const withoutFiles = text.replace(/\b(?:quiz(?:zes)?|knowledge[ _-]+checks?)(?:[ _-]*\d+)?\.(?:pdf|docx?|xlsx?|pptx?|txt|md|csv|json|html?|js|ts|py|zip)\b/gi, "");
  return QUIZ.test(withoutFiles.replace(NEGATED_QUIZ, ""));
}

/** Only added or changed lines of an instructor-reviewed prompt may add facts. */
export function addedPromptLines(original: string, edited: string): string {
  const counts = new Map<string, number>();
  for (const line of original.split(/\r?\n/)) counts.set(line, (counts.get(line) ?? 0) + 1);
  return edited.split(/\r?\n/).filter(line => {
    const available = counts.get(line) ?? 0;
    if (available) { counts.set(line, available - 1); return false; }
    return true;
  }).join("\n");
}

/** An edited instruction about quizzes is not itself a course fact. */
export function hasExplicitPromptQuizFact(text: string): boolean {
  return text.split(/\r?\n/).some(line => !/\b(?:do not|don't|never)\s+(?:invent|mention|include|add|create|fabricate|assume|make up)\b/i.test(line) && hasQuizEvidence(line) &&
    /\b(?:quiz(?:zes)?|knowledge\s+checks?)\b.{0,60}\b(?:\d+|due|opens?|available|covers?|worth|points?|questions?|attempts?|deadline)\b/i.test(line));
}

/** Detect unsupported quiz-specific content without modifying generated prose. */
export function hasUnsupportedQuizContent(title: string, message: string, currentEvidence: string, editedPromptFacts = ""): boolean {
  if (hasQuizEvidence(currentEvidence) || hasExplicitPromptQuizFact(editedPromptFacts)) return false;
  const output = `${title}\n${message}`;
  return hasQuizEvidence(output);
}
