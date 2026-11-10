import { verifyMember, type RecoverableGroup } from "./large-zip-subset";

const decode = (text: string): string | null => {
  let invalid = false;
  const out = text.replace(/<[^>]*>/g, "").replace(/&([^;]+);/g, (_, code: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    if (named[code]) return named[code];
    const m = /^#(\d+)$|^#x([a-f\d]+)$/i.exec(code); const value = m ? Number.parseInt(m[1] ?? m[2], m[1] ? 10 : 16) : NaN;
    if (!Number.isInteger(value) || value <= 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) { invalid = true; return ""; }
    return String.fromCodePoint(value);
  });
  return invalid ? null : out.trim();
};

/** Cross-check index identities and every member filename against the same LMS group and name. */
export function indexNames(html: string, groups: readonly RecoverableGroup[]): Readonly<Record<string, string>> {
  const byLabel = new Map(groups.map((group) => [group.label, group]));
  const names = new Map<string, string>(), rows = new Map<string, string[]>(), invalid = new Set<string>(); let current: string | null = null;
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map((cell) => decode(cell[1]));
    if (cells.length === 1) { const name = cells[0]; current = name && name.length <= 200 && /^[^,\r\n]+,\s*[^,\r\n]+$/.test(name) ? name : null; continue; }
    if (cells.length !== 2 || !cells[0]) { current = null; continue; }
    const match = /^(\d+-\d+) - (.+)$/.exec(cells[0]), label = match?.[1]; if (!label || !byLabel.has(label)) continue;
    const groupRows = rows.get(label) ?? []; groupRows.push(match![2]); rows.set(label, groupRows);
    if (!current || (names.has(label) && names.get(label) !== current)) invalid.add(label); else names.set(label, current);
  }
  const canonical = (text: string) => text.normalize("NFKC").toLocaleLowerCase().trim().replace(/\s+/g, " ");
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const result: Record<string, string> = Object.create(null);
  for (const group of groups) {
    const name = names.get(group.label), parts = name?.split(",").map(canonical), groupRows = rows.get(group.label);
    if (!name || !parts || parts.length !== 2 || !parts[0] || !parts[1] || invalid.has(group.label) || groupRows?.length !== group.members.length) continue;
    const one = escape(parts[0]), two = escape(parts[1]);
    const starts = new RegExp(`^(?:${one}[\\s_-]+${two}|${two}[\\s_-]+${one})[\\s_-]+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\\s]+\\d{1,2},`, "i");
    const agrees = (value: string) => starts.test(canonical(value));
    if (!groupRows.every(agrees) || !group.members.every((member) => member.path.startsWith(`${group.label} - `) && agrees(member.path.slice(group.label.length + 3)))) continue;
    result[group.label] = name;
  }
  const used = new Map<string, string>();
  for (const [label, name] of Object.entries(result)) { const key = name.normalize("NFKC").toLocaleLowerCase(); if (used.has(key)) { delete result[label]; delete result[used.get(key)!]; } else used.set(key, label); }
  return result;
}

export async function inferArchiveNames(file: Blob, groups: readonly RecoverableGroup[]): Promise<Readonly<Record<string, string>>> {
  const index = groups.find((group) => group.reason === "unassigned index")?.members[0];
  const canvas = groups.filter((group) => /^\d+-\d+$/.test(group.label) === false && group.reason !== "unassigned index");
  const names: Record<string, string> = Object.assign(Object.create(null), Object.fromEntries(canvas.map((group) => [group.label, group.label])));
  if (!index || index.declaredBytes > 1024 * 1024 || index.compressedBytes > 1024 * 1024 || !await verifyMember(file, index)) return names;
  try {
    let stream = file.slice(index.dataOffset, index.dataOffset + index.compressedBytes).stream(); if (index.method === 8) stream = stream.pipeThrough(new DecompressionStream("deflate-raw"));
    const text = await new Response(stream).text(); Object.assign(names, indexNames(text, groups.filter((group) => /^\d+-\d+$/.test(group.label))));
  } catch { /* No verified index means no automatic numeric identity. */ }
  return names;
}
