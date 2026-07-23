import type { Course, CourseStudentRepo } from "./supabase/courses";
import type { CardLayoutGroup } from "@/lib/card-layout";
import { DEFAULT_CARD_LAYOUT } from "@/lib/card-layout";
import type { InstitutionField } from "@/lib/institution-fields";
import { DEFAULT_INSTITUTION_FIELDS } from "@/lib/institution-fields";

export interface CourseForm {
  id: string | null;
  name: string;
  courseCode: string;
  term: string;
  institution: string;
  canvasUrl: string;
  repos: Array<{ repo: string; branch: string }>;
  githubOrg: string;
  textbook: string;
  syllabusId: string;
  integrations: Array<{ name: string; url: string }>;
  roster: string;
  notes: string;
  topics: string;
  startDate: string;
  description: string;
  weeks: string;
  tests: string;
  lms: string;
  dayTime: string;
  modality: string;
  topicOutline: string;
}

export type InlineField = "githubOrg" | "textbook" | "roster" | "repos" | "syllabusId" | "integrations" | "csv" | "startDate" | "description" | "weeks" | "tests" | "lms" | "dayTime" | "studentRepos" | "modality" | "topicOutline";

export const EMPTY_FORM: CourseForm = {
  id: null,
  name: "",
  courseCode: "",
  term: "",
  institution: "",
  canvasUrl: "",
  repos: [],
  githubOrg: "",
  textbook: "",
  syllabusId: "",
  integrations: [],
  roster: "",
  notes: "",
  topics: "",
  startDate: "",
  description: "",
  weeks: "",
  tests: "",
  lms: "",
  dayTime: "",
  modality: "",
  topicOutline: "",
};

export function formFromCourse(c: Course): CourseForm {
  return {
    id: c.id,
    name: c.name,
    courseCode: c.courseCode ?? "",
    term: c.term ?? "",
    institution: c.institution ?? "",
    canvasUrl: c.canvasUrl ?? "",
    repos: c.repos.map((r) => ({ repo: r.repo, branch: r.branch ?? "" })),
    githubOrg: c.githubOrg ?? "",
    textbook: c.textbook ?? "",
    syllabusId: c.syllabusId ?? "",
    integrations: c.integrations.map((i) => ({ name: i.name, url: i.url ?? "" })),
    roster: c.roster ?? "",
    notes: c.notes ?? "",
    topics: c.topics ?? "",
    startDate: c.startDate ?? "",
    description: c.description ?? "",
    weeks: c.weeks !== null ? String(c.weeks) : "",
    tests: c.tests !== null ? String(c.tests) : "",
    lms: c.lms ?? "",
    dayTime: c.dayTime ?? "",
    modality: c.modality ?? "",
    topicOutline: c.topicOutline ?? "",
  };
}

export function courseToInput(c: Course) {
  return {
    name: c.name,
    courseCode: c.courseCode ?? "",
    term: c.term ?? "",
    institution: c.institution ?? "",
    canvasUrl: c.canvasUrl ?? "",
    repos: c.repos.map((r) => ({ repo: r.repo, branch: r.branch })),
    githubOrg: c.githubOrg ?? "",
    textbook: c.textbook ?? "",
    syllabusId: c.syllabusId ?? "",
    integrations: c.integrations.map((i) => ({ name: i.name, url: i.url })),
    roster: c.roster ?? "",
    notes: c.notes ?? "",
    topics: c.topics ?? "",
    csvName: c.csvName ?? "",
    csvData: c.csvData ?? "",
    rubricName: c.rubricName ?? "",
    rubricData: c.rubricData ?? "",
    startDate: c.startDate ?? "",
    description: c.description ?? "",
    weeks: c.weeks,
    tests: c.tests,
    lms: c.lms ?? "",
    dayTime: c.dayTime ?? "",
    modality: c.modality ?? "",
    topicOutline: c.topicOutline ?? "",
    customTiles: c.customTiles,
    hiddenTiles: c.hiddenTiles,
    studentRepos: c.studentRepos,
  };
}

export const reposToText = (c: Course) => c.repos.map((r) => (r.branch ? `${r.repo}#${r.branch}` : r.repo)).join("\n");

export const integrationsToText = (c: Course) => c.integrations.map((i) => (i.url ? `${i.name} | ${i.url}` : i.name)).join("\n");

export const parseRepoLines = (text: string) =>
  text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [repo, branch] = l.split("#").map((p) => p.trim());
    return { repo, branch: branch || null };
  }).filter((r) => r.repo);

export const parseIntegrationLines = (text: string) =>
  text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, url] = l.split("|").map((p) => p.trim());
    return { name: name ?? "", url: url || null };
  }).filter((i) => i.name || i.url);

export function rosterStats(roster: string): { students: number; withUsernames: number } {
  const lines = roster.split("\n").map((l) => l.trim()).filter(Boolean);
  return { students: lines.length, withUsernames: lines.filter((l) => l.includes("|") && l.split("|").pop()!.trim()).length };
}

export function rosterToRows(text: string): Array<{ student: string; username: string }> {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((row) => {
    const idx = row.lastIndexOf("|");
    if (idx === -1) return { student: row, username: "" };
    return { student: row.slice(0, idx).trim(), username: row.slice(idx + 1).trim() };
  });
}

export function rowsToRoster(rows: Array<{ student: string; username: string }>): string {
  return rows
    .filter((r) => r.student.trim() || r.username.trim())
    .map((r) => (r.username.trim() ? `${r.student.trim()} | ${r.username.trim()}` : r.student.trim()))
    .join("\n");
}

export function studentReposToRows(text: string): Array<{ student: string; canvasUserId: string; repo: string }> {
  return text.split("\n").map((line) => {
    const parts = line.split("|");
    return {
      student: (parts[0] ?? "").trim(),
      canvasUserId: (parts[1] ?? "").trim(),
      repo: (parts[2] ?? "").trim(),
    };
  }).filter((r) => r.student || r.canvasUserId || r.repo);
}

export function rowsToStudentReposText(rows: Array<{ student: string; canvasUserId: string; repo: string }>): string {
  return rows.map((r) => `${r.student} | ${r.canvasUserId} | ${r.repo}`).join("\n");
}

/**
 * Merge every org repo not already present (case-insensitive, trimmed match on
 * the repo field) into existingRows as new unassigned rows (student left blank).
 * Existing rows are preserved verbatim and never reordered or overwritten; the
 * incoming org list is also deduped against itself. Pure - no I/O.
 */
export function mergeOrgReposIntoStudentRepos(
  existingRows: CourseStudentRepo[],
  orgRepoFullNames: string[]
): CourseStudentRepo[] {
  const seen = new Set(existingRows.map((r) => r.repo.trim().toLowerCase()).filter(Boolean));
  const merged = [...existingRows];
  for (const fullName of orgRepoFullNames) {
    const trimmed = fullName.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    merged.push({ student: "", canvasUserId: null, repo: trimmed, username: null, email: null });
  }
  return merged;
}

export function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsText(file);
  });
}

export function downloadDocx(base64: string, fileName: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function mergeCardLayout(saved: CardLayoutGroup[]): CardLayoutGroup[] {
  if (saved.length === 0) return DEFAULT_CARD_LAYOUT.map((g) => ({ ...g, tiles: [...g.tiles] }));
  const present = new Set(saved.flatMap((g) => g.tiles));
  const groups = saved.map((g) => ({ ...g, tiles: [...g.tiles] }));
  for (const def of DEFAULT_CARD_LAYOUT) {
    for (const key of def.tiles) {
      if (present.has(key)) continue;
      const home = groups.find((g) => g.id === def.id);
      if (home) home.tiles.push(key);
      else groups.push({ id: def.id, label: def.label, tiles: [key] });
    }
  }
  return groups;
}

export function mergeInstitutionFields(saved: InstitutionField[]): InstitutionField[] {
  const byId = new Map(saved.map((f) => [f.id, f]));
  const merged = DEFAULT_INSTITUTION_FIELDS.map((d) => {
    const saved_ = byId.get(d.id);
    return saved_ ? { ...d, value: saved_.value, lms: saved_.lms ?? d.lms } : { ...d };
  });
  const extras = saved.filter((f) => !DEFAULT_INSTITUTION_FIELDS.some((d) => d.id === f.id));
  return [...merged, ...extras];
}
