// The lmsModule picker's option values carry both the live LMS id and the
// module name ("<id>|<name>"), or mark an export-sourced module
// ("export|<name>"), so steps can fall back from the live LMS to the course
// export tile by name. Legacy persisted values are bare live ids.

export interface LmsModuleValue {
  /** Live LMS module id, when the option came from the live connection. */
  liveId: string | null;
  /** Module name, when known (always for export options, newer live options). */
  name: string | null;
  /** True when the option was sourced from the course's LMS export. */
  fromExport: boolean;
}

export function parseLmsModuleValue(raw: string): LmsModuleValue {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { liveId: null, name: null, fromExport: false };
  }
  if (trimmed.startsWith("export|")) {
    const name = trimmed.slice("export|".length).trim();
    return { liveId: null, name: name || null, fromExport: true };
  }
  const sep = trimmed.indexOf("|");
  if (sep === -1) {
    return { liveId: trimmed, name: null, fromExport: false };
  }
  const name = trimmed.slice(sep + 1).trim();
  return { liveId: trimmed.slice(0, sep), name: name || null, fromExport: false };
}

export function liveModuleValue(id: string | number, name: string): string {
  return `${id}|${name}`;
}

export function exportModuleValue(name: string): string {
  return `export|${name}`;
}
