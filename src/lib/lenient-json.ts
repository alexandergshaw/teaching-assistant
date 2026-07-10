// Tolerant parsing for LLM JSON output. Models frequently emit almost-JSON:
// code fences, trailing commas, unquoted keys, curly quotes, or an array cut
// off mid-object by a token limit. Recover what is recoverable instead of
// surfacing a raw JSON.parse exception to the user.

export function parseLenientJsonArray(text: string): unknown[] | null {
  // Strip code fences: remove ```[language]\n? patterns
  let candidate = text.replace(/```[a-z]*\n?/gi, "");

  // Locate the candidate: first "[" through last "]"
  const firstBracket = candidate.indexOf("[");
  const lastBracket = candidate.lastIndexOf("]");

  if (firstBracket !== -1 && lastBracket > firstBracket) {
    candidate = candidate.slice(firstBracket, lastBracket + 1);
  } else if (firstBracket !== -1 && lastBracket === -1) {
    // Found "[" but no closing "]"; keep from first "[" onward for truncation recovery
    candidate = candidate.slice(firstBracket);
  } else if (firstBracket === -1) {
    // No array brackets; check if there's a {...} that we can wrap
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      candidate = "[" + candidate.slice(firstBrace, lastBrace + 1) + "]";
    } else {
      return null;
    }
  } else {
    return null;
  }

  // Build progressively repaired strings and try JSON.parse on each
  const attempts: string[] = [];

  // Step 1: candidate as-is
  attempts.push(candidate);

  // Step 2: curly quotes replaced
  const step2 = candidate.replace(/['']/g, "'").replace(/[""]/g, '"');
  attempts.push(step2);

  // Step 3: unquoted keys quoted
  const step3 = step2.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":');
  attempts.push(step3);

  // Step 4: trailing commas removed
  const step4 = step3.replace(/,\s*([}\]])/g, "$1");
  attempts.push(step4);

  // Try each attempt
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Continue to next attempt
    }
  }

  // Truncation recovery: if all failed, find the last "}" and try progressively
  // earlier occurrences (up to 5 times), working backward
  if (step4.startsWith("[")) {
    let searchPos = step4.length - 1;
    let attempts_truncation = 0;
    while (attempts_truncation < 5) {
      const lastBrace = step4.lastIndexOf("}", searchPos);
      if (lastBrace <= 0) break;

      let truncated = step4.slice(0, lastBrace + 1) + "]";
      // Remove trailing commas from the truncated string
      truncated = truncated.replace(/,\s*([}\]])/g, "$1");
      try {
        const parsed = JSON.parse(truncated);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        // Continue to earlier brace
      }

      searchPos = lastBrace - 1;
      attempts_truncation++;
    }
  }

  return null;
}
