/** Stable hash of the exact JSON grading request, excluding only the
 * server-verified attempt reference added during the handoff. */
export async function notebookGradeBinding(request: unknown): Promise<string> {
  const plain = JSON.parse(JSON.stringify(request)) as unknown;
  if (!plain || typeof plain !== "object" || Array.isArray(plain)) throw new Error("Invalid grading request.");
  delete (plain as Record<string, unknown>).notebookAttempt;
  let nodes = 0;
  const canonical = (value: unknown, depth = 0): unknown => {
    if (++nodes > 100_000 || depth > 40) throw new Error("Grading request is too complex.");
    if (Array.isArray(value)) return value.map(item => canonical(item, depth + 1));
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key], depth + 1)]));
    return value;
  };
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(plain)));
  if (bytes.byteLength > 5_000_000) throw new Error("Grading request is too large.");
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
