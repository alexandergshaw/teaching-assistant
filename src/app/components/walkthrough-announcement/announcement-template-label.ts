import { previousAnnouncementText } from "@/lib/announcement-library-rich-text";

/** Give unlabeled saved announcements a searchable, recognizable description. */
export function announcementTemplateLabel(entry: { label: string | null; createdAt: string; exemplarText: string }): string {
  const label = entry.label?.trim();
  if (label) return label;
  const excerpt = previousAnnouncementText(entry.exemplarText).replace(/\s+/g, " ").trim();
  const date = new Date(entry.createdAt).toLocaleDateString();
  return excerpt ? `${date}: ${Array.from(excerpt).slice(0, 80).join("")}` : date;
}

/** Disambiguate equal display labels without revealing internal identifiers. */
export function announcementTemplateLabels<T extends { id: string; label: string | null; createdAt: string; exemplarText: string }>(entries: readonly T[]): Map<string, string> {
  const bases = entries.map(entry => announcementTemplateLabel(entry));
  const counts = new Map<string, number>();
  for (const base of bases) counts.set(base, (counts.get(base) ?? 0) + 1);
  const used = new Map<string, number>();
  return new Map(entries.map((entry, index) => {
    const base = bases[index];
    if (counts.get(base) === 1) return [entry.id, base];
    const dated = `${base} (${new Date(entry.createdAt).toLocaleDateString()})`;
    const ordinal = (used.get(dated) ?? 0) + 1;
    used.set(dated, ordinal);
    return [entry.id, ordinal === 1 ? dated : `${dated} #${ordinal}`];
  }));
}
