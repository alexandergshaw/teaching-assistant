import { BRANDED_DECK_MIME } from "@/lib/institution-branded-decks";
import { MAX_BRANDED_RECORDING_PPTX_BYTES, recordingBrandFit, type RecordingBrandSlide } from "@/lib/decks/recording-brand-fit";
import { readBoundedZipStream } from "@/lib/grade/bounded-zip-stream";

export type LectureDeckBranding = { acronym: string; fileId: string; fileName: string };

const transferError = "Could not prepare the branded PowerPoint. Try again.";

export async function openLectureDeckBrand(account: string, branding: LectureDeckBranding, lifetime: AbortSignal) {
  const template = { account, acronym: branding.acronym, fileId: branding.fileId };
  async function request(mode: "inspect" | "fill", slides?: RecordingBrandSlide[]) {
    const signal = AbortSignal.any([lifetime, AbortSignal.timeout(120_000)]);
    const response = await fetch("/api/recording-branded-deck", {
      method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store", signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...template, mode, slides }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(typeof payload?.error === "string" ? payload.error : transferError);
    }
    return { response, signal };
  }
  const { response } = await request("inspect");
  const { fit } = await response.json();
  if (!recordingBrandFit(fit)) throw new Error(transferError);
  return {
    fit,
    async fill(slides: RecordingBrandSlide[]) {
      const { response, signal } = await request("fill", slides);
      if (!response.body || response.headers.get("content-type") !== BRANDED_DECK_MIME.pptx) {
        void response.body?.cancel().catch(() => undefined);
        throw new Error(transferError);
      }
      const blob = await readBoundedZipStream(response.body, MAX_BRANDED_RECORDING_PPTX_BYTES, signal, transferError);
      if (!blob.size) throw new Error(transferError);
      return blob.slice(0, blob.size, BRANDED_DECK_MIME.pptx);
    },
  };
}
