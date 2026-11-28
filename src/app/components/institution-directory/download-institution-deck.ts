import { readBoundedZipStream } from "@/lib/grade/bounded-zip-stream";
import { BRANDED_DECK_MIME, MAX_INSTITUTION_DECK_BYTES, type InstitutionBrandedDeck } from "@/lib/institution-branded-decks";
import { triggerFileDownload } from "../course-planning/utils";

const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
const DOWNLOAD_ERROR = "Could not open that slide deck. Try again.";

export async function downloadInstitutionDeckFile(
  signedUrl: string,
  file: Pick<InstitutionBrandedDeck, "name" | "size" | "extension">,
  lifetime: AbortSignal,
): Promise<void> {
  try {
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_INSTITUTION_DECK_BYTES) throw new Error();
    const signal = AbortSignal.any([lifetime, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)]);
    signal.throwIfAborted();
    const response = await fetch(signedUrl, {
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal,
    });
    if (!response.body) throw new Error();
    if (!response.ok || Number(response.headers.get("content-length")) > file.size) {
      void response.body.cancel().catch(() => undefined);
      throw new Error();
    }
    const blob = await readBoundedZipStream(response.body, file.size, signal, DOWNLOAD_ERROR);
    signal.throwIfAborted();
    if (blob.size !== file.size) throw new Error();
    triggerFileDownload(blob.slice(0, blob.size, BRANDED_DECK_MIME[file.extension]), file.name);
  } catch {
    throw new Error(DOWNLOAD_ERROR);
  }
}
