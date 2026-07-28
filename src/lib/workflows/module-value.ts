// The lmsModule picker's option values carry both the live LMS id and the
// module name ("<id>|<name>"), or mark an export-sourced module
// ("export|<name>"), so steps can fall back from the live LMS to the course
// export tile by name. Legacy persisted values are bare live ids. A third
// form, "name|<name>", names a module BY NAME with no source pinned - used
// when the only thing known is the module's name (e.g. course-progress's
// derived "Module 05: Loops", which never resolved a live id) and the
// consuming step should match that name in whichever source answers.

export interface LmsModuleValue {
  /** Live LMS module id, when the option came from the live connection. */
  liveId: string | null;
  /** Module name, when known (always for export/name-only options, newer live options). */
  name: string | null;
  /** True when the option was sourced from the course's LMS export. */
  fromExport: boolean;
  /** True for a "name|<name>" value: match this module by name in whichever
   * source answers, with no source or live id pinned. Defaults to false for
   * every other form. */
  byName: boolean;
}

export function parseLmsModuleValue(raw: string): LmsModuleValue {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { liveId: null, name: null, fromExport: false, byName: false };
  }
  if (trimmed.startsWith("export|")) {
    const name = trimmed.slice("export|".length).trim();
    return { liveId: null, name: name || null, fromExport: true, byName: false };
  }
  if (trimmed.startsWith("name|")) {
    const name = trimmed.slice("name|".length).trim();
    return { liveId: null, name: name || null, fromExport: false, byName: true };
  }
  const sep = trimmed.indexOf("|");
  if (sep === -1) {
    return { liveId: trimmed, name: null, fromExport: false, byName: false };
  }
  const name = trimmed.slice(sep + 1).trim();
  return { liveId: trimmed.slice(0, sep), name: name || null, fromExport: false, byName: false };
}

export function liveModuleValue(id: string | number, name: string): string {
  return `${id}|${name}`;
}

export function exportModuleValue(name: string): string {
  return `export|${name}`;
}

export function nameModuleValue(name: string): string {
  return `name|${name}`;
}

// Tolerant module-number matcher, used to target a Canvas module by NUMBER
// instead of by array position (the root cause of the "week 7 announcement
// described week 6 content" bug: a "Start Here"/"Course Information"/
// "Module 00" entry ahead of Module 01 shifts every later positional lookup
// by one). Extracts the first integer that follows a "module" or "week"
// token, case-insensitively - tolerant of zero-padding, a missing or
// different separator, and surrounding topic text, so "Module 07",
// "Module 7", "Module07", "Week 7", and "Module 07: Loops" all extract 7.
// Matches on the full captured number, so "Module 17" and "Module 70"
// extract 17 and 70 - never 7.
const MODULE_NUMBER_PATTERN = /(?:module|week)\s*0*(\d+)/i;

export function extractModuleNumber(name: string): number | null {
  const match = (name ?? "").match(MODULE_NUMBER_PATTERN);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

// Search a Canvas module list for a NAME match on module NUMBER - never by
// array position. Returns the first module whose extracted number equals
// targetNumber, or null when none matches; the caller falls back to position
// only then, and must record that fallback explicitly (see
// steps.rubrics.ts's "pull-current-materials" step) - a silent positional
// guess is what caused the bug this function exists to prevent.
export function findModuleByNumber(
  modules: Array<{ id: string | number; name: string }>,
  targetNumber: number
): { id: string | number; name: string } | null {
  for (const m of modules) {
    if (extractModuleNumber(m.name) === targetNumber) return m;
  }
  return null;
}
