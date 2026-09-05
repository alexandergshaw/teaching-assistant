// Tolerant parsing for LLM JSON output. Models frequently emit almost-JSON:
// code fences, trailing commas, unquoted keys, curly quotes, or an array cut
// off mid-object by a token limit. Recover what is recoverable instead of
// surfacing a raw JSON.parse exception to the user.

/** Options for `parseLenientJsonArray`. */
export interface LenientJsonArrayOptions {
  /** Opt in to the truncated-element recovery at the foot of this file
   *  (docs/answers-in-the-reply-acceptance-criteria.md A8). DEFAULT FALSE,
   *  and deliberately so: this parser has 18 call sites, and the recovery
   *  turns "null" into "a partial array" for whichever ones enable it. A
   *  caller that reads null as "this batch failed, retry it" would instead
   *  proceed silently with fewer elements - a different and worse failure
   *  than the one being fixed. The discussion drafting call opts in because
   *  that is where the cost was measured and where a partial batch is
   *  strictly better than losing every reply in it; every other caller keeps
   *  byte-identical behaviour by doing nothing. */
  recoverTruncatedElements?: boolean;
}

export function parseLenientJsonArray(
  text: string,
  options: LenientJsonArrayOptions = {}
): unknown[] | null {
  // Strip code fences: remove ```[language]\n? patterns
  let candidate = text.replace(/```[a-z]*\n?/gi, "");

  // Keep the fence-stripped text around, untouched by the (possibly wrong)
  // slicing below. recoverByDepth needs to re-scan from here, not from
  // `candidate` after it has been sliced to the wrong "]" - see its comment.
  const fenceStripped = candidate;

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

  // Step 2: curly quotes replaced - EXCEPT THAT IT DOES NOTHING, and that is
  // now deliberate. Both character classes hold the same ASCII quote twice
  // (`['']` is just `'`), so each replace swaps a character for itself. Found
  // during the A8 truncation work
  // (docs/answers-in-the-reply-acceptance-criteria.md) and left alone on
  // purpose: making it live would be a silent CONTENT bug, not a fix. This
  // runs over the whole payload, string values included, so a working
  // version would rewrite every curly quote inside a drafted reply or a
  // student's quoted post into a straight one, changing text the user then
  // posts to Canvas. A real smart-quote repair has to skip string interiors,
  // which is a different function from this one. Do not "fix" this line
  // without that.
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

  // Every attempt above has now returned null, so nothing above is
  // changed by adding this: recoverByDepth only ever runs on an input the
  // rest of this function already gave up on. See its comment for why the
  // naive scans above can lose complete elements that ARE present. Gated on
  // the caller asking for it - see LenientJsonArrayOptions for why the
  // default is off.
  return options.recoverTruncatedElements ? recoverByDepth(fenceStripped) : null;
}

// Additive truncation recovery (GROUP F / A8): runs only when every attempt
// above returned null, so it can never change a result this function
// already produces today - it only has a chance to turn an existing null
// into something usable.
//
// The candidate-slicing at the top of parseLenientJsonArray picks the
// LAST "]" in the text as the end of the outer array. On a response cut
// off mid-element that last "]" almost always belongs to the CUT-OFF
// element's own inner array ("concepts" or "questions"), not the outer
// array - the outer "]" was never emitted. That slice then ends one
// character short of the PRECEDING element's closing "}" (that "}" sits
// right after the inner array's "]" in the source, but the slice stops AT
// the "]"). The walk-back further down tries to patch that by scanning
// backward for a "}", but it has no notion of string content or nesting
// depth: a reply that quotes code puts "{" and "}" characters INSIDE an
// already-complete, already-valid string value, and the naive scan cannot
// tell those apart from a real object boundary. It burns its (at most 5)
// backward attempts on brace characters that sit inside that string and
// gives up, discarding every element it saw - even ones that are intact,
// earlier in the text.
//
// This re-scans the RAW (fence-stripped, but otherwise un-sliced) text
// from its first "[", tracking two things a plain indexOf/lastIndexOf scan
// does not: whether the cursor is inside a quoted string (so bracket
// characters inside "..." are ignored, exactly the case above), and the
// nesting depth of {}/[] (so only a "}" that returns to depth 1 - closing
// an array element, not something nested inside one - counts as an
// element boundary). It keeps the position of the LAST such boundary seen
// before the text runs out, which is the end of the last fully-formed
// element the truncated response actually contained.
function recoverByDepth(text: string): unknown[] | null {
  const firstBracket = text.indexOf("[");
  if (firstBracket === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastElementEnd = -1;

  for (let i = firstBracket; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      // depth === 1 means "one level inside the outer array" - i.e. this
      // "}" closes an array element itself, not a structure nested inside
      // one (an inner "concepts"/"questions" array, or an object nested
      // deeper than one level).
      if (depth === 1 && ch === "}") {
        lastElementEnd = i;
      }
    }
  }

  if (lastElementEnd === -1) return null;

  const sliced = text.slice(firstBracket, lastElementEnd + 1) + "]";

  // RAW FIRST, repaired second - the same shape as the attempts list at the
  // top of this file, and the fix for a defect the first version of this
  // function shipped with. The depth scan above is string-aware, so the
  // slice it produces is usually ALREADY valid JSON; running the repairs
  // over it unconditionally then corrupts it, because the unquoted-key
  // rewrite below does not know about string interiors. A reply containing
  // ordinary prose - "There is one catch, though: the outer iterator
  // re-enters" - has `, though:` rewritten to `, "though":` inside the
  // string, JSON.parse throws, and the recovery silently returns null. That
  // case is exactly the one this function exists for, so it has to be tried
  // unrepaired before anything is done to it.
  const attempts = [
    sliced,
    sliced
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"')
      .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":')
      .replace(/,\s*([}\]])/g, "$1"),
  ];

  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Try the next attempt; if none parses the caller returns null exactly
      // as it did before this function existed.
    }
  }

  return null;
}
