export type RubricSubcategory = { label: string; description: string };
export type RubricRow = {
  area: string;
  weight: string;
  description: string;
  subcategories: RubricSubcategory[];
};

export function parseGeneratedRubric(text: string): RubricRow[] | null {
  const lines = text.split("\n");
  const rows: RubricRow[] = [];
  let current: RubricRow | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    if (/^\s/.test(line)) {
      if (!current) continue;

      const subLine = line.trim().replace(/^[-•]\s*/, "");
      const subMatch = subLine.match(/^(.+?)\s*:\s*(.+)$/);
      if (subMatch) {
        current.subcategories.push({
          label: subMatch[1].trim(),
          description: subMatch[2].trim(),
        });
      }

      continue;
    }

    const match = line.trim().match(/^(.+?)\s*\((\d+(?:\.\d+)?\s*%?)\)\s*:\s*(.*)$/);
    if (!match) continue;

    if (current) rows.push(current);
    current = {
      area: match[1].trim(),
      weight: match[2].trim(),
      description: match[3].trim(),
      subcategories: [],
    };
  }

  if (current) rows.push(current);

  return rows.length > 0 ? rows : null;
}
