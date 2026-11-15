function activityEvidence(materials: string) {
  const sections = materials.split(/^##\s+/m).slice(1).map(section => {
    const newline = section.indexOf("\n");
    const heading = (newline < 0 ? section : section.slice(0, newline)).trim();
    const body = newline < 0 ? "" : section.slice(newline + 1);
    return { heading, optional: /\b(?:optional|extra[ -]credit|bonus)\b/i.test(`${heading}\n${body}`) };
  }).filter(section => section.heading.length >= 5 && section.heading.length <= 120);
  const seen = new Set<string>();
  const unique = sections.filter(section => {
    const key = section.heading.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  const stem = (word: string) => word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
  const tokens = (heading: string) => heading.toLowerCase().match(/[a-z0-9]+/g)?.map(stem).filter(word => (word.length >= 4 || word === "log") && !["assignment", "activity", "module", "discussion", "overview", "week", "file", "credit", "extra", "optional"].includes(word)) ?? [];
  const distinct = unique.map(section => tokens(section.heading));
  return { unique, distinct, stem };
}

function implicatedActivities(materials: string, announcement: string): { terms: string[][]; indices: number[] } | null {
  const { unique, distinct, stem } = activityEvidence(materials);
  const blocks = announcement.split(/\n\s*\n/);
  for (let index = 0; index < blocks.length; index++) {
    const current = blocks[index];
    const next = blocks[index + 1] ?? "";
    const block = /\b(?:optional|extra[ -]credit|bonus)\b/i.test(current) && /:\s*$/.test(current) && /^\s*(?:[-*+]\s|\d+[.)]\s)/.test(next) ? `${current}\n${next}` : current;
    if (!/\b(?:optional|extra[ -]credit|bonus)\b/i.test(block)) continue;
    const normalized = block.toLocaleLowerCase();
    const words = new Set((normalized.match(/[a-z0-9]+/g) ?? []).map(stem));
    const mentioned = unique.map((section, i) => ({ section, terms: distinct[i].filter(word => words.has(word) && distinct.every((other, otherIndex) => otherIndex === i || !other.includes(word))) })).filter(item => item.terms.length);
    if (mentioned.some(item => item.section.optional) && mentioned.some(item => !item.section.optional)) return { terms: mentioned.map(item => item.terms), indices: block === current ? [index] : [index, index + 1] };
  }
  return null;
}

/** Flag a narrow, observable risk; this does not establish factual correctness. */
export function possibleCrossActivityAttribution(materials: string, announcement: string): boolean {
  return implicatedActivities(materials, announcement) !== null;
}

/** Avoid replacing a flagged draft with one that drops a named activity. */
export function preservesImplicatedActivityTerms(materials: string, original: string, candidate: string): boolean {
  const conflict = implicatedActivities(materials, original);
  if (!conflict) return false;
  const before = original.split(/\n\s*\n/), after = candidate.split(/\n\s*\n/);
  if (before.length !== after.length || before.some((block, index) => !conflict.indices.includes(index) && block !== after[index])) return false;
  const ignored = new Set(["the", "a", "an", "your", "you", "to", "of", "for", "and", "or", "using", "use", "please", "these", "steps", "successfully"]);
  const tokens = (text: string) => (text.toLowerCase().match(/https?:\/\/[^\s]+|[a-z0-9]+/g) ?? []).filter(word => !ignored.has(word));
  const originalTokens = tokens(conflict.indices.map(index => before[index]).join(" "));
  const remaining = tokens(conflict.indices.map(index => after[index]).join(" "));
  for (const token of originalTokens) { const index = remaining.indexOf(token); if (index < 0) return false; remaining.splice(index, 1); }
  return true;
}
