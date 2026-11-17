import { decodeStaticProjectText } from "./static-project-decoding";
import type { SubmittedFileInfo } from "./types";

/** Keep dataset bytes for execution while preventing a large CSV from hiding source. */
export function prioritizeModelContent(content: string, files: readonly SubmittedFileInfo[], limit: number): { content: string; datasetOmitted: boolean } {
  if (content.length <= limit) return { content, datasetOmitted: false };
  let result = content, datasetOmitted = false;
  for (const file of files) {
    if (!["csv", "tsv"].includes(file.extension.toLowerCase()) || !file.rawBase64 || file.rawBase64.length > 4_000_000) continue;
    let text: string;
    try {
      const bytes = Uint8Array.from(atob(file.rawBase64), (c) => c.charCodeAt(0));
      const decoded = decodeStaticProjectText(bytes);
      if (!decoded || decoded.assumedWindows1252) continue;
      text = decoded.text;
    } catch { continue; }
    if (text.length < 20_000) continue;
    const at = result.indexOf(text);
    if (at < 0 || at !== result.lastIndexOf(text)) continue;
    const notice = `[Dataset ${JSON.stringify(file.name)} was submitted; its full contents were not included in the model review.]`;
    result = result.slice(0, at) + notice + result.slice(at + text.length);
    datasetOmitted = true;
  }
  return { content: result, datasetOmitted };
}
