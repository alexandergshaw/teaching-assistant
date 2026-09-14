// Mechanical (not eyeballed) overlap check for two items' `owns` glob lists,
// used by wave.ts to build a group whose file sets provably do not intersect
// (backlog-automation.md section 6 / docs/loop/parallel-disjointness.md).
//
// `owns` entries are GLOBS, not exact paths, so a literal `sort | uniq -d`
// over the strings (parallel-disjointness.md's own recipe for exact paths)
// is not enough: "src/config/*" and "src/config/resolver.ts" never appear as
// the same string but plainly overlap. The rule here is deliberately
// conservative in the direction that is safe for this system: a false
// POSITIVE (flagging two globs as overlapping when they do not) only costs a
// smaller wave; a false NEGATIVE (missing a real overlap) is the B-class
// defect this whole tool exists to avoid. So:
//
//   1. Reduce each glob to its STATIC PREFIX - everything before the first
//      wildcard character (*, ?, [).
//   2. Two globs overlap if the prefixes are equal, or either is a prefix of
//      the other (directory/file containment in either direction).
//   3. A glob with an EMPTY static prefix (starts with a wildcard, e.g.
//      "*.ts") is treated as overlapping everything - it is unbounded, and
//      "assume it can touch anything" is the safe read of that.
function staticPrefix(glob: string): string {
  const m = glob.match(/[*?[]/);
  return m ? glob.slice(0, m.index) : glob;
}

export function globsOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  const prefixA = staticPrefix(a);
  const prefixB = staticPrefix(b);
  if (prefixA === "" || prefixB === "") return true;
  return prefixA.startsWith(prefixB) || prefixB.startsWith(prefixA);
}

/** True if any glob in `a` overlaps any glob in `b`, by globsOverlap above. Empty on either side never overlaps (an item that owns nothing touches nothing). */
export function ownsIntersect(a: string[], b: string[]): boolean {
  for (const globA of a) {
    for (const globB of b) {
      if (globsOverlap(globA, globB)) return true;
    }
  }
  return false;
}
