export function remainingGroups(selected: readonly string[], admitted: readonly string[]): string[] {
  const accepted = new Set(admitted);
  return selected.filter((label) => !accepted.has(label));
}

export function omittedGroups<T extends { label: string }>(groups: readonly T[], selected: readonly string[], admitted: readonly string[]): T[] {
  const accounted = new Set([...selected, ...admitted]);
  return groups.filter((group) => !accounted.has(group.label));
}

/** Check nested rebuilds sequentially before any batch is submitted. */
export async function preflightSingles<T>(labels: readonly string[], build: (labels: readonly string[]) => Promise<{ ok: true; value: T } | { ok: false; reason: string }>, current: () => boolean): Promise<void> {
  for (const [index, label] of labels.entries()) {
    if (!current()) throw new Error("The archive review was canceled before submission.");
    if (index && index % 32 === 0) { await new Promise<void>((resolve) => setTimeout(resolve, 0)); if (!current()) throw new Error("The archive review was canceled before submission."); }
    const result = await build([label]); if (!result.ok) throw new Error(`Archive could not be prepared: ${result.reason}.`);
  }
}

/** `fits` must be prefix-monotone. Find an exact minimum before dispatch;
 * fail closed if the bounded search cannot prove it. */
export async function minimumBatchPlan(labels: readonly string[], fits: (labels: readonly string[]) => string | null, current: () => boolean = () => true): Promise<string[][]> {
  if (!labels.length) throw new Error("No groups selected.");
  if (new Set(labels).size !== labels.length || labels.some((label) => label.includes("\0"))) throw new Error("Archive group identifiers are not unique.");
  if (!current()) throw new Error("The archive review was canceled before submission.");
  if (!fits(labels)) return [[...labels]];
  if (labels.length > 500) throw new Error("The minimum number of uploads could not be proven. Nothing was submitted.");
  const cache = new Map<string, string | null>(), positions = new Map(labels.map((label, index) => [label, index]));
  const check = (batch: readonly string[]) => { const key = batch.map((label) => positions.get(label)).join(","); if (cache.has(key)) return cache.get(key)!; const result = fits(batch); if (cache.size < 10_000) cache.set(key, result); return result; };
  const greedy: string[][] = [];
  for (const [index, label] of labels.entries()) {
    if (!current()) throw new Error("The archive review was canceled before submission.");
    if (index && index % 32 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const alone = check([label]); if (alone) throw new Error(`Archive could not be prepared: ${alone}.`);
    const target = greedy.find((batch) => !check([...batch, label])); if (target) target.push(label); else greedy.push([label]);
  }
  let best = greedy.map((batch) => [...batch]), visits = 0;
  const search = async (index: number, batches: string[][]): Promise<void> => {
    if (!current()) throw new Error("The archive review was canceled before submission.");
    if (++visits > 250_000) throw new Error("The minimum number of uploads could not be proven. Nothing was submitted.");
    if (visits % 512 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (index === labels.length) { if (batches.length < best.length) best = batches.map((batch) => [...batch]); return; }
    if (batches.length >= best.length) return;
    const label = labels[index];
    for (const batch of batches) if (!check([...batch, label])) { batch.push(label); await search(index + 1, batches); batch.pop(); }
    if (batches.length + 1 < best.length) { batches.push([label]); await search(index + 1, batches); batches.pop(); }
  };
  if (best.length > 1) await search(0, []);
  return best;
}

/** Exact planner for feasibility checks that may become valid after adding a group.
 * Nested extraction charges the outer archive before its children, so a later
 * outer member can change the cumulative compression ratio of an earlier child.
 * Never prune an incomplete batch solely because it currently fails `fits`.
 */
export async function minimumNonMonotoneBatchPlan(labels: readonly string[], fits: (labels: readonly string[]) => string | null, current: () => boolean = () => true): Promise<string[][]> {
  if (!labels.length) throw new Error("No groups selected.");
  if (new Set(labels).size !== labels.length || labels.some((label) => label.includes("\0"))) throw new Error("Archive group identifiers are not unique.");
  if (!current()) throw new Error("The archive review was canceled before submission.");
  if (!fits(labels)) return [[...labels]];
  // A feasible greedy partition is only an upper bound; it never rules out a
  // better partition that needs an initially invalid intermediate batch.
  let best: string[][] | undefined, visits = 0;
  const greedy: string[][] = []; let greedyValid = true;
  for (const [index, label] of labels.entries()) {
    if (!current()) throw new Error("The archive review was canceled before submission.");
    if (index && index % 32 === 0) { await new Promise<void>((resolve) => setTimeout(resolve, 0)); if (!current()) throw new Error("The archive review was canceled before submission."); }
    const target = greedy.find((batch) => !fits([...batch, label]));
    if (target) target.push(label);
    else if (!fits([label])) greedy.push([label]);
    else { greedyValid = false; break; }
  }
  if (greedyValid) best = greedy;
  // The full set was already rejected, so two is a proved minimum.
  if (best?.length === 2) return best;
  if (labels.length > 500) throw new Error("The minimum number of uploads could not be proven. Nothing was submitted.");
  const search = async (index: number, batches: string[][]): Promise<void> => {
    if (!current()) throw new Error("The archive review was canceled before submission.");
    if (best?.length === 2) return;
    if (++visits > 250_000) throw new Error("The minimum number of uploads could not be proven. Nothing was submitted.");
    if (visits % 512 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (best && batches.length >= best.length) return;
    if (index === labels.length) {
      if (batches.every((batch) => !fits(batch))) best = batches.map((batch) => [...batch]);
      return;
    }
    for (const batch of batches) { batch.push(labels[index]); await search(index + 1, batches); batch.pop(); }
    batches.push([labels[index]]); await search(index + 1, batches); batches.pop();
  };
  await search(0, []);
  if (!best) throw new Error("No valid grouping could be prepared. Nothing was submitted.");
  return best;
}

/** Plan from metadata, then build and submit one complete batch at a time. */
export async function submitBoundedGroups<T>(labels: readonly string[], fits: (labels: readonly string[]) => string | null, build: (labels: readonly string[]) => Promise<{ ok: true; value: T } | { ok: false; reason: string }>, submit: (value: T, count: number) => Promise<void>, current: () => boolean = () => true, nonMonotone = false): Promise<void> {
  const batches = await (nonMonotone ? minimumNonMonotoneBatchPlan : minimumBatchPlan)(labels, fits, current);
  for (const batch of batches) {
    if (!current()) throw new Error("The archive review was canceled before submission.");
    const result = await build(batch);
    if (!result.ok) throw new Error(`Archive could not be prepared: ${result.reason}.`);
    await submit(result.value, batch.length);
  }
}
