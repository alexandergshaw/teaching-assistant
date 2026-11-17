import JSZip from "jszip";
import { GRADING_ZIP_MAX_BYTES } from "@/lib/grade/grading-zip-transport";

/** Preserve a Brightspace project ZIP and its same-attempt companion files
 * byte-for-byte in a review envelope. The returned original File references
 * remain available to the caller; nothing is uploaded or graded here. */
export async function createSingleProjectEnvelope(files: readonly File[], typedStudent = ""): Promise<{ ok: true; archive: File; originalFiles: readonly File[]; group: string; student: string } | { ok: false; reason: string }> {
  if (files.length < 2 || files.length > 20 || files.filter((file) => /\.zip$/i.test(file.name)).length !== 1) return { ok: false, reason: "Choose one project ZIP and its companion files." };
  const namePattern = /^(\d+-\d+) - (.+?)-([A-Za-z]+ \d{1,2}, \d{4} \d{3,4} [AP]M)(?:\(\d+\))?\.([a-z0-9]+)$/i;
  const parsed = files.map((file) => namePattern.exec(file.name));
  if (parsed.some((match) => !match)) return { ok: false, reason: "Companion files must identify the same Brightspace submission." };
  const first = parsed[0]!;
  if (parsed.some((match) => match![1] !== first[1] || match![2] !== first[2] || match![3] !== first[3])) return { ok: false, reason: "Files belong to different students or submission attempts." };
  const student = first[2].replace(/-/g, " ").trim();
  const tokens = (name: string) => name.normalize("NFKC").toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).sort().join(" ");
  if (typedStudent.trim() && tokens(typedStudent) !== tokens(student)) return { ok: false, reason: "The entered student does not match the Brightspace filenames." };
  const seen = new Set<string>();
  for (const file of files) {
    const key = file.name.normalize("NFKC").toLowerCase();
    if (seen.has(key) || file.name.includes("/") || file.name.includes("\\") || /[\x00-\x1f\x7f]/.test(file.name)) return { ok: false, reason: "File names are duplicated or invalid." };
    seen.add(key);
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (!Number.isSafeInteger(total) || total > 80 * 1024 * 1024) return { ok: false, reason: "These files exceed the project review staging limit." };
  const zip = new JSZip();
  for (const file of files) zip.file(file.name, await file.arrayBuffer(), { binary: true, createFolders: false });
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  if (bytes.byteLength > GRADING_ZIP_MAX_BYTES) return { ok: false, reason: "These files exceed the project review staging limit." };
  return { ok: true, archive: new File([new Uint8Array(bytes).buffer], `submission-${first[1]}.zip`, { type: "application/zip" }), originalFiles: files.slice(), group: first[1], student: typedStudent.trim() || student };
}
