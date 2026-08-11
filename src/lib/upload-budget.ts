/**
 * The one place that knows how big an upload can be before it never reaches
 * our code at all.
 *
 * Vercel caps a serverless function's REQUEST BODY at roughly 4.5MB at the
 * platform layer. `bodySizeLimit` cannot raise it, and the cap applies to
 * Route Handlers exactly as it does to Server Actions. A request over the cap
 * is rejected by the platform BEFORE the function runs, so any size check
 * inside the action never executes and the user sees an opaque failure rather
 * than the friendly message the code carefully prepared.
 *
 * THE ERROR THIS MODULE EXISTS TO PREVENT: measuring the wrong bytes. A file
 * that is base64-encoded into a JSON body rides the wire at 4/3 its size on
 * disk. A cap written as `file.size > 4.5MB` therefore permits a ~6MB request
 * and does not protect the thing it guards. Every cap in this repo that was
 * wrong was wrong in exactly this way. Two units, named so they cannot be
 * confused:
 *
 *   FILE bytes  - what `File.size` reports, the bytes on disk.
 *   WIRE bytes  - what actually travels in the request body. For a base64
 *                 payload that is `base64.length`, i.e. FILE bytes * 4/3.
 *
 * The budget is set below the platform cap on purpose, leaving headroom for
 * the rest of the JSON body (field names, other form values, prior turns in a
 * transcript) so a request never fails opaquely against the platform limit
 * because of overhead nobody counted.
 *
 * Prior art: `src/lib/chat/attachments.ts` got this right first, budgeting
 * `attachment.base64.length` against 3.5MB. It is chat-scoped (it imports chat
 * message types), so the platform fact lives here instead and that module
 * takes its constant from this one - one owner, no drift. This module is
 * deliberately dependency-free so it is safe to import from a client
 * component, a server action or a Route Handler alike.
 */

/** Vercel's platform-layer request body cap. Informational: never budget
 * right up against it, because the body carries more than the file. */
export const VERCEL_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;

/** What a single request's uploaded content may occupy ON THE WIRE. */
export const UPLOAD_WIRE_BUDGET_BYTES = 3.5 * 1024 * 1024;

/** base64 expands binary by 4/3 (three bytes become four characters). */
export const BASE64_INFLATION = 4 / 3;

export function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * WIRE bytes a file will occupy once base64-encoded into a JSON body. Use this
 * whenever a check runs BEFORE encoding - a client-side pre-flight against
 * `File.size`, for instance - so the comparison happens in the same unit as
 * the platform's limit.
 */
export function wireBytesForFile(fileBytes: number): number {
  return Math.ceil(fileBytes * BASE64_INFLATION);
}

/**
 * The largest file-on-disk size that still fits a given wire budget. The
 * inverse of `wireBytesForFile`, for phrasing a limit to a user in the units
 * they see in their file manager.
 */
export function maxFileBytesForWireBudget(maxWireBytes: number = UPLOAD_WIRE_BUDGET_BYTES): number {
  return Math.floor(maxWireBytes / BASE64_INFLATION);
}

export interface UploadBudgetCheck {
  ok: boolean;
  /** User-facing refusal reason; set only when `ok` is false. */
  error?: string;
}

/**
 * Refuses a payload whose WIRE size exceeds the budget. `what` names the thing
 * being refused so the message reads naturally ("This PowerPoint is 5.2MB...").
 *
 * The message quotes the limit in FILE bytes, not wire bytes, because that is
 * the number the user can actually check against their own file.
 */
export function checkWireBudget(
  wireBytes: number,
  what: string,
  maxWireBytes: number = UPLOAD_WIRE_BUDGET_BYTES
): UploadBudgetCheck {
  if (wireBytes <= maxWireBytes) return { ok: true };
  return {
    ok: false,
    error:
      `${what} is too large to upload in one request ` +
      `(${formatMB(wireBytes / BASE64_INFLATION)}, limit ${formatMB(maxFileBytesForWireBudget(maxWireBytes))}).`,
  };
}

/**
 * The same refusal, expressed against a file's size on disk. Converts to wire
 * bytes first - the whole point, so a caller cannot accidentally compare disk
 * bytes to a wire limit.
 */
export function checkFileWireBudget(
  fileBytes: number,
  what: string,
  maxWireBytes: number = UPLOAD_WIRE_BUDGET_BYTES
): UploadBudgetCheck {
  return checkWireBudget(wireBytesForFile(fileBytes), what, maxWireBytes);
}

/**
 * Total WIRE bytes across several already-encoded payloads. Takes the base64
 * strings' lengths directly, since that string IS what rides in the body.
 */
export function sumBase64WireBytes(base64Strings: ReadonlyArray<string>): number {
  return base64Strings.reduce((total, b64) => total + b64.length, 0);
}
