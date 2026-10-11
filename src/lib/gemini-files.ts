// VIDEO-GRADING W3 (docs/video-grading-chat-intake-ops.md section 7): the Gemini
// Files API client and the upload bracket. A video is far too large to ride
// inline, so at grade time one student's video is uploaded here, referenced by
// a `fileData` part, and deleted again.
//
// The wire protocol below (resumable upload, PROCESSING -> ACTIVE polling,
// DELETE, the 48h retention backstop, and whether the grading model accepts
// video at all) is RECALLED, never observed from this checkout: there is no
// key and no network here (ops R-1/R-2). It is validated by fakes plus the
// owner walk, not by a live call.
//
// PII / logging contract (ops 7.5): nothing in this file logs or embeds a
// filename, bytes, a file URI, a file name or a key in any thrown message.
// Every error is a GeminiFilesError carrying a fixed VideoFailureClass and a
// fixed sentence; provider response bodies are never copied into it.
import type { VideoFailureClass } from "./grade/video-failure";

const GEMINI_HOST = "https://generativelanguage.googleapis.com";
const FILE_URI_PREFIX = `${GEMINI_HOST}/v1beta/files/`;
const FILE_NAME_PATTERN = /^files\/[a-z0-9-]{1,40}$/;

/** Poll cadence while a freshly uploaded file is PROCESSING (ops 7.2). */
export const FILES_POLL_INTERVAL_MS = 1_000;

/** The ONLY displayName prefix this feature ever uploads under (ops 7.4). */
export const VIDEO_DISPLAY_NAME_PREFIX = "ta-grading-video-";

const MESSAGES: Record<"upload failed" | "timed out" | "model rejected", string> = {
  "upload failed": "The video could not be uploaded for grading.",
  "timed out": "The video did not finish preparing in time.",
  "model rejected": "The video could not be used by the grader.",
};

export class GeminiFilesError extends Error {
  readonly failure: VideoFailureClass;
  constructor(failure: "upload failed" | "timed out" | "model rejected") {
    super(MESSAGES[failure]);
    this.name = "GeminiFilesError";
    this.failure = failure;
  }
}

/** What a successful upload returns: the delete handle and the model-facing URI. */
export interface GeminiUploadedFile {
  readonly name: string;
  readonly uri: string;
}

/** Injected seam: tests hand the bracket a fake; production uses createGeminiFilesClient. */
export interface GeminiFilesClient {
  upload(input: {
    readonly bytes: Uint8Array;
    readonly mimeType: string;
    readonly displayName: string;
    readonly signal?: AbortSignal;
  }): Promise<GeminiUploadedFile>;
  /** Resolves when the file is ACTIVE; throws GeminiFilesError otherwise. */
  waitActive(name: string, opts: { readonly deadlineMs: number; readonly signal?: AbortSignal }): Promise<void>;
  delete(name: string): Promise<void>;
}

/** Strips a key and any URL out of a message before it can be surfaced. */
export function redactFilesError(message: string, apiKey?: string): string {
  let out = message;
  if (apiKey) out = out.split(apiKey).join("[redacted]");
  return out.replace(/https?:\/\/\S+/gi, "[redacted]");
}

export function isGeminiFileUri(uri: unknown): uri is string {
  return typeof uri === "string" && uri.startsWith(FILE_URI_PREFIX) && uri.length > FILE_URI_PREFIX.length && !/\s/.test(uri);
}

export function isGeminiFileName(name: unknown): name is string {
  return typeof name === "string" && FILE_NAME_PATTERN.test(name);
}

export interface GeminiFilesClientOptions {
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function abortedError(): GeminiFilesError {
  return new GeminiFilesError("timed out");
}

/**
 * The real client. Auth is the `x-goog-api-key` HEADER on every call (never a
 * `?key=` query, which would put the key in a URL that error text can echo).
 * At most ONE retry on 429/5xx (ops 7.6: the postGenerateContent retry policy
 * is deliberately NOT reused; it would burn the 25s window).
 */
export function createGeminiFilesClient(options: GeminiFilesClientOptions): GeminiFilesClient {
  const doFetch: typeof fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());
  const keyHeader = { "x-goog-api-key": options.apiKey };

  async function send(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    let last: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (signal?.aborted) throw abortedError();
      let response: Response;
      try {
        response = await doFetch(url, { ...init, signal });
      } catch {
        if (signal?.aborted) throw abortedError();
        if (attempt === 1) throw new GeminiFilesError("upload failed");
        continue;
      }
      if (!isRetryableStatus(response.status)) return response;
      last = response;
    }
    if (last) return last;
    throw new GeminiFilesError("upload failed");
  }

  return {
    async upload({ bytes, mimeType, displayName, signal }) {
      const start = await send(
        `${GEMINI_HOST}/upload/v1beta/files`,
        {
          method: "POST",
          headers: {
            ...keyHeader,
            "Content-Type": "application/json",
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
            "X-Goog-Upload-Header-Content-Type": mimeType,
          },
          body: JSON.stringify({ file: { display_name: displayName } }),
        },
        signal
      );
      if (!start.ok) throw new GeminiFilesError("upload failed");
      const uploadUrl = start.headers.get("x-goog-upload-url");
      // A foreign origin here would send the student's bytes (and our key) away.
      if (!uploadUrl || !uploadUrl.startsWith(`${GEMINI_HOST}/`)) throw new GeminiFilesError("upload failed");

      const finish = await send(
        uploadUrl,
        {
          method: "POST",
          headers: {
            ...keyHeader,
            "Content-Length": String(bytes.byteLength),
            "X-Goog-Upload-Offset": "0",
            "X-Goog-Upload-Command": "upload, finalize",
          },
          body: bytes as unknown as BodyInit,
        },
        signal
      );
      if (!finish.ok) throw new GeminiFilesError("upload failed");
      let json: unknown;
      try {
        json = await finish.json();
      } catch {
        throw new GeminiFilesError("upload failed");
      }
      const file = (typeof json === "object" && json !== null ? (json as { file?: unknown }).file : undefined) as
        | { name?: unknown; uri?: unknown }
        | undefined;
      if (!file || !isGeminiFileName(file.name) || !isGeminiFileUri(file.uri)) {
        throw new GeminiFilesError("upload failed");
      }
      return { name: file.name, uri: file.uri };
    },

    async waitActive(name, { deadlineMs, signal }) {
      if (!isGeminiFileName(name)) throw new GeminiFilesError("upload failed");
      for (;;) {
        if (signal?.aborted) throw abortedError();
        if (now() >= deadlineMs) throw new GeminiFilesError("timed out");
        const response = await send(`${GEMINI_HOST}/v1beta/${name}`, { method: "GET", headers: keyHeader }, signal);
        if (!response.ok) throw new GeminiFilesError("upload failed");
        let state: unknown;
        try {
          state = ((await response.json()) as { state?: unknown }).state;
        } catch {
          throw new GeminiFilesError("upload failed");
        }
        if (state === "ACTIVE") return;
        if (state === "FAILED") throw new GeminiFilesError("model rejected");
        await sleep(FILES_POLL_INTERVAL_MS);
      }
    },

    async delete(name) {
      if (!isGeminiFileName(name)) return;
      const response = await doFetch(`${GEMINI_HOST}/v1beta/${name}`, { method: "DELETE", headers: keyHeader });
      if (!response.ok) throw new GeminiFilesError("upload failed");
    },
  };
}

/** The model-facing handle the bracket hands to `consume`. */
export interface UploadedVideo {
  readonly fileUri: string;
  readonly mimeType: string;
}

/**
 * Upload -> wait ACTIVE -> consume -> delete (ops 7.2 / 7.4).
 *
 *  - `readBytes` is called once; the buffer is not retained by the bracket, so
 *    several nested brackets do not each pin a full video.
 *  - The delete runs in `finally` whenever the upload returned a name: on
 *    success, on a `consume` throw, on an ACTIVE-wait failure, and on abort.
 *  - `raceWithTimeout` cannot cancel its loser (ops O-4), so `consume` is
 *    raced against `signal`: when the route aborts at its own deadline the
 *    bracket stops waiting for the (non-cancellable) model call, rejects with
 *    a `timed out` GeminiFilesError, and the finally-delete fires NOW rather
 *    than after the model call eventually settles.
 *  - A failed delete is swallowed (best effort); the provider's 48h TTL and the
 *    Storage sweep are the stated backstops.
 */
export async function withUploadedGeminiVideo<V>(
  client: GeminiFilesClient,
  input: {
    readonly readBytes: () => Promise<Uint8Array>;
    readonly mimeType: string;
    readonly displayName: string;
    readonly deadlineMs: number;
    readonly signal?: AbortSignal;
  },
  consume: (video: UploadedVideo) => Promise<V>
): Promise<V> {
  let uploaded: GeminiUploadedFile | null = null;
  try {
    uploaded = await client.upload({
      bytes: await input.readBytes(),
      mimeType: input.mimeType,
      displayName: input.displayName,
      signal: input.signal,
    });
    await client.waitActive(uploaded.name, { deadlineMs: input.deadlineMs, signal: input.signal });
    const work = consume({ fileUri: uploaded.uri, mimeType: input.mimeType });
    const signal = input.signal;
    if (!signal) return await work;
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      if (signal.aborted) {
        reject(abortedError());
        return;
      }
      onAbort = () => reject(abortedError());
      signal.addEventListener("abort", onAbort, { once: true });
    });
    // The abandoned loser must never surface as an unhandled rejection.
    work.catch(() => undefined);
    try {
      return await Promise.race([work, aborted]);
    } finally {
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  } finally {
    if (uploaded) {
      try {
        await client.delete(uploaded.name);
      } catch {
        // best effort; see the backstops above
      }
    }
  }
}
