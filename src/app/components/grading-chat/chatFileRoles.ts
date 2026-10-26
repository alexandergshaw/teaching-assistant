import { GRADING_ZIP_MAX_BYTES } from "@/lib/grade/grading-zip-transport";
import type { GradeHarshness } from "@/lib/grade/types";
export const ROLE_FILE_LIMIT = 40;
export const ROLE_BYTE_LIMIT = 2 * GRADING_ZIP_MAX_BYTES;
export const SETUP_RAW_BYTE_LIMIT = 80_000;
export const SETUP_CHARACTER_LIMIT = 20_000;
export type ChatFileRole = "unassigned" | "instructions" | "rubric" | "combined" | "submission" | "exclude";
export type ChatFileRoleStatus = "unassigned" | "ready" | "reading" | "error" | "accepted" | "partial" | "failed" | "unattempted";
export type ChatRoleRow = { id: number; name: string; size: number; file: File | null; role: ChatFileRole; status: ChatFileRoleStatus; text?: string; error?: string };
export type ChatRoleDraft = { instructions: string; rubric: string };
export type ChatRoleOptions = { harshness: GradeHarshness; feedbackWordTarget?: number; applyNamingDeduction: boolean; applyLengthDeduction: boolean };
export type ConfirmedRoleSetup = Readonly<ChatRoleDraft & ChatRoleOptions>;
export type ChatRoleChoices = { instructions: "draft" | "file"; rubric: "draft" | "file" };
export const isSetupRole = (role: ChatFileRole) => role === "instructions" || role === "rubric" || role === "combined";
export function admitRoleFiles(files: readonly File[]): string | null {
  if (!files.length || files.length > ROLE_FILE_LIMIT) return "Choose between 1 and 40 top-level files.";
  if (files.some((file) => !Number.isSafeInteger(file.size) || file.size < 0) || files.reduce((sum, file) => sum + file.size, 0) > ROLE_BYTE_LIMIT) return "This batch exceeds the staged file size limit. Choose a smaller batch.";
  return null;
}
export async function readRoleSetup(file: File): Promise<string> {
  if (!/\.(txt|md|markdown)$/i.test(file.name)) throw new Error("Setup files must be TXT, MD or Markdown. Export plain text or paste into the setup fields.");
  if (file.size > SETUP_RAW_BYTE_LIMIT) throw new Error("Setup text exceeds 80,000 raw bytes. Use a smaller text file; it will not be truncated.");
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > SETUP_RAW_BYTE_LIMIT) throw new Error("Setup text exceeds the raw byte limit.");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, ""); }
  catch { throw new Error("Setup text must use valid UTF-8 encoding."); }
  if (!text.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error("Setup text is empty or contains binary control characters.");
  if (text.length > SETUP_CHARACTER_LIMIT) throw new Error("Setup text exceeds 20,000 characters. It will not be truncated.");
  return text;
}
export function resolveRoleSetup(rows: readonly ChatRoleRow[], draft: ChatRoleDraft, choices: ChatRoleChoices, locked: boolean) {
  const errors: string[] = [];
  if (rows.some((row) => row.role === "unassigned")) errors.push("Assign a role to every file, or explicitly exclude it.");
  const sources: Partial<Record<keyof ChatRoleDraft, ChatRoleRow>> = {};
  const effective = { ...draft };
  for (const field of ["instructions", "rubric"] as const) {
    const designated = rows.filter((row) => (row.role === field || row.role === "combined") && row.status !== "accepted");
    if (designated.length > 1) errors.push(`More than one source is assigned to ${field}. Change or exclude competing sources.`);
    const source = designated[0]; sources[field] = source;
    if (source && locked) errors.push("Setup is locked. Start a New session before assigning setup files.");
    if (source && (source.text === undefined || source.status === "error" || source.status === "reading")) errors.push(`${source.name}: resolve the setup read error or wait for reading to finish.`);
    if (source?.text !== undefined && (!draft[field].trim() || draft[field] === source.text || choices[field] === "file")) effective[field] = source.text;
  }
  return { effective, sources, errors, generationNotice: effective.rubric.trim() === "" };
}
