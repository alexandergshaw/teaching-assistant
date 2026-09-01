/**
 * Upload a base64-encoded image into a course's Files so it can be
 * referenced from an announcement's HTML body (createAnnouncementAction,
 * src/app/actions/canvas-inbox.ts). Canvas does not accept an inline
 * base64/data-URL image in a discussion_topics message - a file has to be
 * uploaded first, then referenced by the URL Canvas hands back.
 *
 * This is the SAME three-step handshake this repo already ships and relies
 * on in two independent, already-working call sites - not a new, unverified
 * guess:
 *   - src/lib/canvas-modules/files.ts's uploadFileToModule (server-side,
 *     also base64-in / Canvas-module-item-out, used by the syllabus-to-
 *     module and course-engine-upload paths)
 *   - src/app/components/content-tab/utils.ts's uploadFileToModule (browser
 *     side of the same handshake, used by the Files/Modules bulk-upload UI)
 * Both do: (1) POST name/size/content_type/parent_folder_path to
 * `${courseId}/files` to get back `{ upload_url, upload_params }`
 * (Canvas's "Step 1" - the file exists in a pending state with no content
 * yet); (2) POST the file bytes as multipart form data, carrying
 * upload_params unmodified, straight to upload_url ("Step 2"); (3) read the
 * created file's `id`/`url` off that response.
 *
 * Per Canvas's own file-upload documentation
 * (https://canvas.instructure.com/doc/api/file.file_uploads.html), step 2's
 * response is EITHER a 201 Created with the file JSON already in the body
 * (upload complete, no further step - Canvas: "A 201 Created response code
 * indicates that the file has completed uploading."), OR a 3xx redirect
 * that the docs say the caller "needs to perform a GET to ... in order to
 * complete the upload" (Canvas's own "Step 3"). `fetch`'s default
 * `redirect: "follow"` behavior already performs that GET transparently in
 * the 3xx case, landing on the same final JSON body either way - which is
 * exactly the assumption the two existing call sites above already ship
 * under. No new assumption is introduced here.
 */

import { canvasError, resolveCourse } from "../canvas-core";
import { courseFileDownloadUrl } from "../canvas-url";

export interface AnnouncementImageUploadResult {
  fileId: number;
  /** The uploaded file's own URL, as returned by Canvas - used directly as
   * the posted announcement's <img src>. */
  url: string;
}

/**
 * Upload a base64-encoded image into the course's Files ("uploads" folder)
 * and return the created file's id and URL. Throws on any failure - the
 * caller (createAnnouncementAction) is responsible for catching this and
 * treating it as non-fatal to the announcement post itself (the image is
 * additive; the announcement must still post as text-only on an upload
 * failure).
 */
export async function uploadAnnouncementImage(
  courseUrl: string,
  base64: string,
  fileName: string,
  contentType: string,
  code?: string
): Promise<AnnouncementImageUploadResult> {
  const ctx = resolveCourse(courseUrl, code);
  const buffer = Buffer.from(base64, "base64");

  // Step 1: tell Canvas about the incoming file, get a pre-signed upload
  // ticket back.
  const params = new URLSearchParams();
  params.append("name", fileName);
  params.append("size", String(buffer.byteLength));
  params.append("content_type", contentType);
  params.append("parent_folder_path", "uploads");
  params.append("on_duplicate", "rename");

  const presign = await fetch(`${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!presign.ok) {
    throw canvasError(presign.status, ctx.institution);
  }
  const ticket = (await presign.json()) as {
    upload_url?: string;
    upload_params?: Record<string, string>;
  };
  if (!ticket.upload_url || !ticket.upload_params) {
    throw new Error("Canvas did not return an upload URL for the image.");
  }

  // Step 2 (+ transparent step 3 via fetch's redirect-follow, see header):
  // POST the bytes to the pre-signed URL, carrying upload_params unmodified.
  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.upload_params)) form.append(key, value);
  form.append("file", new Blob([new Uint8Array(buffer)], { type: contentType }), fileName);

  const upload = await fetch(ticket.upload_url, { method: "POST", body: form });
  if (!upload.ok) {
    throw new Error(`Uploading the image to Canvas failed (HTTP ${upload.status}).`);
  }
  const uploaded = (await upload.json().catch(() => null)) as { id?: number; url?: string } | null;
  if (typeof uploaded?.id !== "number") {
    throw new Error("Canvas did not return the uploaded image's file id.");
  }
  if (!uploaded.url) {
    throw new Error("Canvas did not return a URL for the uploaded image.");
  }

  return { fileId: uploaded.id, url: uploaded.url };
}

/** An uploaded companion image, resolved to a <img src> Canvas will
 * actually render for a student (courseFileDownloadUrl), plus the alt text
 * the caller supplied. */
export interface ResolvedAnnouncementImage {
  image?: { url: string; altText: string };
  imageError?: string;
}

/**
 * Upload the announcement's companion image (uploadAnnouncementImage above)
 * and resolve it to a course-scoped src - never Canvas's raw upload `url`,
 * which needs this app's own bearer token and 401s for a student's browser
 * (see courseFileDownloadUrl, ../canvas-url.ts, for why). Never throws: an
 * upload failure resolves to `imageError` instead, so the caller
 * (createAnnouncementAction, src/app/actions/canvas-inbox.ts) can still post
 * the announcement as text-only rather than failing the whole post.
 */
export async function resolveAnnouncementImage(
  courseUrl: string,
  image: { base64: string; mimeType: string; altText: string; fileName?: string },
  code?: string
): Promise<ResolvedAnnouncementImage> {
  try {
    const uploaded = await uploadAnnouncementImage(
      courseUrl,
      image.base64,
      image.fileName?.trim() || "announcement-image",
      image.mimeType,
      code
    );
    const src = courseFileDownloadUrl(courseUrl, uploaded.fileId) ?? uploaded.url;
    return { image: { url: src, altText: image.altText } };
  } catch (err) {
    return {
      imageError: `Could not attach the image - ${err instanceof Error ? err.message : "the upload to Canvas failed"}. The announcement posted as text only.`,
    };
  }
}
