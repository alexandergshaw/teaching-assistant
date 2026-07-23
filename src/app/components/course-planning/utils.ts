import type { RunSpan } from "@/lib/office-edit";

// Map an AI replacement string onto the paragraph's original formatting: if the
// replacement still starts with the original's leading bold label, keep that
// label bold and the rest plain; otherwise the whole replacement is plain. This
// preserves bold field labels without bolding the value the AI filled in.
export function boldLabelSpans(runs: RunSpan[], replacement: string): RunSpan[] {
  let prefix = "";
  for (const r of runs) {
    if (!r.bold) break;
    prefix += r.text;
  }
  if (prefix && replacement.startsWith(prefix) && replacement.length > prefix.length) {
    return [{ text: prefix, bold: true }, { text: replacement.slice(prefix.length) }];
  }
  return [{ text: replacement }];
}

export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const readFileBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
