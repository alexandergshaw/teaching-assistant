/** Split only recognized aggregate-limit refusals; never skip a bad group. */
export async function submitBoundedGroups<T>(labels: readonly string[], build: (labels: readonly string[]) => Promise<{ ok: true; value: T } | { ok: false; reason: string }>, submit: (value: T, count: number) => Promise<void>): Promise<void> {
  if (!labels.length) throw new Error("No groups selected.");
  const result = await build(labels);
  if (result.ok) { await submit(result.value, labels.length); return; }
  if (labels.length > 1 && /^batch exceeds (?:grading|transport|compression ratio) limits?$/i.test(result.reason)) {
    const middle = Math.floor(labels.length / 2); await submitBoundedGroups(labels.slice(0, middle), build, submit); await submitBoundedGroups(labels.slice(middle), build, submit); return;
  }
  throw new Error(`Archive could not be prepared: ${result.reason}.`);
}
