/** One content block inside an `interactions` response step. */
interface InteractionsContentBlock {
  type?: string;
  data?: string;
  mime_type?: string;
  text?: string;
}

/** One step inside an `interactions` response's `steps` array. */
interface InteractionsStep {
  type?: string;
  content?: InteractionsContentBlock[];
  stop_reason?: string;
  finish_reason?: string;
}

/** Shape of a Gemini `interactions` response body (image generation). */
export interface InteractionsResponseBody {
  steps?: InteractionsStep[];
  output_image?: { data?: string; mime_type?: string };
  stop_reason?: string;
  finish_reason?: string;
}

/**
 * Find the generated image in an `interactions` response: the `output_image`
 * convenience property first (documented as the fast path), falling back to
 * scanning every step's `content` array for the first `type: "image"` block —
 * matching the response shape's own two-places-the-same-data documentation.
 */
export function findInteractionsImage(
  data: InteractionsResponseBody
): { data: string; mimeType: string } | undefined {
  if (typeof data.output_image?.data === "string" && data.output_image.data) {
    return { data: data.output_image.data, mimeType: data.output_image.mime_type || "image/png" };
  }

  for (const step of data.steps ?? []) {
    for (const block of step.content ?? []) {
      if (block.type === "image" && typeof block.data === "string" && block.data) {
        return { data: block.data, mimeType: block.mime_type || "image/png" };
      }
    }
  }

  return undefined;
}

/**
 * Collect every non-image content block's text across all steps. When the
 * model refuses or safety-blocks a prompt instead of returning an image, the
 * `interactions` schema's documented example only shows the success shape
 * (an image block) — there is no documented dedicated "refusal" field. The
 * defensible reading, matching how the legacy `:generateContent` shape put a
 * refusal's explanation in a text part alongside/instead of the image part,
 * is that a refusing `model_output` step's `content` array carries a `text`
 * block explaining why instead of an `image` block. This is what
 * describeEmptyLlmImage surfaces to the instructor as the real refusal
 * reason, so it is preferred over a generic message whenever present.
 */
export function collectInteractionsText(data: InteractionsResponseBody): string {
  const texts: string[] = [];
  for (const step of data.steps ?? []) {
    for (const block of step.content ?? []) {
      if (block.type !== "image" && typeof block.text === "string" && block.text) {
        texts.push(block.text);
      }
    }
  }
  return texts.join("");
}

/**
 * Best-effort finish/stop reason from an `interactions` response, checked at
 * both the top level and per-step since the documented example does not show
 * where (or whether) this schema surfaces one — unlike collectInteractionsText, whose text (when present) is the primary, always-real signal
 * describeEmptyLlmImage surfaces, this is only the fallback used when no text
 * is present at all, so an absent value here still degrades to the existing
 * bare "did not return an image" message rather than a wrong one.
 */
export function findInteractionsFinishReason(data: InteractionsResponseBody): string | undefined {
  if (typeof data.stop_reason === "string" && data.stop_reason) return data.stop_reason;
  if (typeof data.finish_reason === "string" && data.finish_reason) return data.finish_reason;

  for (const step of data.steps ?? []) {
    if (typeof step.stop_reason === "string" && step.stop_reason) return step.stop_reason;
    if (typeof step.finish_reason === "string" && step.finish_reason) return step.finish_reason;
  }

  return undefined;
}
