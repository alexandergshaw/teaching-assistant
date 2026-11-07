export type RubricScore = { area: string; score: string; comment?: string };

/** Stable saved-result order with empty slots where a student's rubric omits an area. */
export function alignRubricScores(order: readonly string[], areas: readonly RubricScore[]): RubricScore[] {
  const occurrences = new Map<string, number>();
  return order.map((name) => {
    const index = occurrences.get(name) ?? 0;
    occurrences.set(name, index + 1);
    return areas.filter((area) => area.area === name)[index] ?? { area: name, score: "" };
  });
}

export function collectRubricOrder(groups: readonly (readonly RubricScore[])[]): string[] {
  const names: string[] = [];
  const maximum = new Map<string, number>();
  for (const areas of groups) {
    const occurrences = new Map<string, number>();
    for (const area of areas) {
      const count = (occurrences.get(area.area) ?? 0) + 1;
      occurrences.set(area.area, count);
      if (count > (maximum.get(area.area) ?? 0)) {
        names.push(area.area);
        maximum.set(area.area, count);
      }
    }
  }
  return names;
}
