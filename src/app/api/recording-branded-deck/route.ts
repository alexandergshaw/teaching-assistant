import { requireUser } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { normalizeInstitutionAcronym } from "@/lib/institution-directory";
import { BRANDED_DECK_MIME, INSTITUTION_BRANDED_DECKS_BUCKET, MAX_INSTITUTION_DECK_BYTES } from "@/lib/institution-branded-decks";
import { getInstitutionDeckRow, institutionDeckPath } from "@/lib/institution-branded-decks-storage";
import { readBoundedZipStream } from "@/lib/grade/bounded-zip-stream";
import { MAX_BRANDED_RECORDING_PPTX_BYTES, recordingBrandSlides } from "@/lib/decks/recording-brand-fit";
import { prepareRecordingBrandTemplate, RecordingBrandTemplateError } from "@/lib/decks/recording-brand-template";

export const runtime = "nodejs";
export const maxDuration = 120;

const inputLimit = 64 * 1024;
const badRequest = "Choose a saved institution template and a valid slide draft.";
const noStore = { "Cache-Control": "private, no-store" };

function failure(error: string, status: number) {
  return Response.json({ error }, { status, headers: noStore });
}

function streamPptx(bytes: Buffer) {
  let offset = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) { controller.close(); return; }
      const end = Math.min(offset + 256 * 1024, bytes.length);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    },
  }), { headers: { ...noStore, "Content-Type": BRANDED_DECK_MIME.pptx, "X-Content-Type-Options": "nosniff" } });
}

export async function POST(request: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) return failure("Sign in to use a saved institution template.", 401);
  let input: Record<string, unknown>;
  try {
    if (!request.body || request.headers.get("content-type")?.split(";")[0].trim() !== "application/json"
      || Number(request.headers.get("content-length")) > inputLimit) return failure(badRequest, 400);
    const body = await readBoundedZipStream(request.body, inputLimit, request.signal, badRequest);
    const parsed: unknown = JSON.parse(await body.text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return failure(badRequest, 400);
    input = parsed as Record<string, unknown>;
  } catch {
    return failure(badRequest, 400);
  }
  if (input.account !== user.id) return failure("Sign in to use a saved institution template.", 403);
  const acronym = typeof input.acronym === "string" ? normalizeInstitutionAcronym(input.acronym) : "";
  const { fileId, mode, slides } = input;
  if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(acronym) || typeof fileId !== "string"
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(fileId)
    || (mode !== "inspect" && mode !== "fill") || (mode === "fill" && !recordingBrandSlides(slides))) {
    return failure(badRequest, 400);
  }
  try {
    const client = createServiceClient();
    const row = await getInstitutionDeckRow(client, user.id, acronym, fileId);
    if (!row) return failure("That institution template is no longer available. Choose a different file.", 404);
    if (!Number.isSafeInteger(row.size_bytes) || row.size_bytes < 1 || row.size_bytes > MAX_INSTITUTION_DECK_BYTES) {
      return failure("The saved institution template exceeds the supported file limit.", 422);
    }
    const path = institutionDeckPath("files", user.id, acronym, row.id, row.extension);
    const { data, error } = await client.storage.from(INSTITUTION_BRANDED_DECKS_BUCKET).download(path);
    if (error || !data || data.size !== row.size_bytes) return failure("Could not read the saved institution template.", 502);
    const template = await prepareRecordingBrandTemplate(Buffer.from(await data.arrayBuffer()), row.extension);
    request.signal.throwIfAborted();
    if (mode === "inspect") return Response.json({ fit: template.fit }, { headers: noStore });
    if (!recordingBrandSlides(slides)) return failure(badRequest, 400);
    const bytes = await template.fill(slides);
    request.signal.throwIfAborted();
    if (!bytes.length || bytes.length > MAX_BRANDED_RECORDING_PPTX_BYTES) {
      return failure("The filled PowerPoint is too large. Use a lighter institution template.", 422);
    }
    return streamPptx(bytes);
  } catch (cause) {
    if (cause instanceof RecordingBrandTemplateError) return failure(cause.message, 422);
    return failure("Could not prepare the branded PowerPoint. Try again.", 502);
  }
}
