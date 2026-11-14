/** Upper-bound PostgreSQL jsonb's text size for a well-formed JSON value.
 * jsonb adds one space after each structural comma and colon. Counting those
 * outside strings avoids treating punctuation inside student text as structure. */
export function jsonbTextSizeUpperBound(value: unknown): number {
  const json = JSON.stringify(value);
  if (json === undefined) return Number.POSITIVE_INFINITY;
  let inString = false, escaped = false, separators = 0;
  for (const character of json) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') inString = true;
    else if (character === "," || character === ":") separators++;
  }
  return new TextEncoder().encode(json).byteLength + separators;
}

export function isBoundedJsonString(value: unknown, maxBytes: number): value is string {
  return typeof value === "string" && value.isWellFormed() && !value.includes("\u0000")
    && new TextEncoder().encode(JSON.stringify(value)).byteLength <= maxBytes;
}
