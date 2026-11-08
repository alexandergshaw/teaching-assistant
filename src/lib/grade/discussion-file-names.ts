/** Preserve distinct labels for repeated discussion contributions. */
export function uniqueContributionName(base: string, used: Set<string>): string {
  if (!used.has(base)) { used.add(base); return base; }
  let n = 2;
  while (used.has(`${base} (${n})`)) n += 1;
  const unique = `${base} (${n})`;
  used.add(unique);
  return unique;
}

/** Do not let a participant's dotted name look like a submitted filename. */
export function dotFreeContributionName(name: string): string {
  return name.replace(/\./g, "");
}
