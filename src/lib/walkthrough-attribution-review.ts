/** Flag a narrow, observable risk; this does not establish factual correctness. */
export function possibleCrossActivityAttribution(materials: string, announcement: string): boolean {
  const sections = materials.split(/^##\s+/m).slice(1).map(section => {
    const newline = section.indexOf("\n");
    const heading = (newline < 0 ? section : section.slice(0, newline)).trim();
    const body = newline < 0 ? "" : section.slice(newline + 1);
    return { heading, optional: /\b(?:optional|extra[ -]credit|bonus)\b/i.test(`${heading}\n${body}`) };
  }).filter(section => section.heading.length >= 5 && section.heading.length <= 120);
  if (sections.length < 2) return false;
  const seen = new Set<string>();
  const unique = sections.filter(section => {
    const key = section.heading.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  const stem = (word: string) => word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
  const tokens = (heading: string) => heading.toLowerCase().match(/[a-z0-9]+/g)?.map(stem).filter(word => (word.length >= 4 || word === "log") && !["assignment", "activity", "module", "discussion", "overview", "week", "file", "credit", "extra", "optional"].includes(word)) ?? [];
  const distinct = unique.map(section => tokens(section.heading));
  const blocks = announcement.split(/\n\s*\n/);
  return blocks.some((current, index) => {
    const next = blocks[index + 1] ?? "";
    const block = /\b(?:optional|extra[ -]credit|bonus)\b/i.test(current) && /^\s*(?:[-*+]\s|\d+[.)]\s)/.test(next) ? `${current}\n${next}` : current;
    if (!/\b(?:optional|extra[ -]credit|bonus)\b/i.test(block)) return false;
    const normalized = block.toLocaleLowerCase();
    const words = new Set((normalized.match(/[a-z0-9]+/g) ?? []).map(stem));
    const mentioned = unique.filter((section, index) => normalized.includes(section.heading.toLocaleLowerCase()) || distinct[index].some(word => words.has(word) && distinct.every((other, otherIndex) => otherIndex === index || !other.includes(word))));
    return mentioned.some(section => section.optional) && mentioned.some(section => !section.optional);
  });
}
