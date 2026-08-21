/**
 * Start a "push this cartridge into the live Canvas course" content migration
 * (docs/modules-cartridge-import-upload-acceptance-criteria.md AC11).
 *
 * This is the Canvas-facing half of the "Upload to Canvas" destination only -
 * it does NOT touch the browser's storage bucket, and it does NOT POST the
 * cartridge's bytes anywhere. It asks Canvas for a `content_migrations` row
 * PLUS a pre-signed upload ticket in the same request (`pre_attachment[*]`),
 * and hands that ticket back so the caller can run the browser-to-Canvas
 * upload described in AC13/AC13a. Keeping those two responsibilities apart
 * matters: the actual byte upload must happen from the browser (never a
 * server action - see AC13's body-size reasoning), so this function's job
 * stops at "here is where to send the bytes," not "the bytes are sent."
 *
 * Why `pre_attachment[*]` instead of the classic two-step upload
 * (`requestFileUpload` in files.ts): a `common_cartridge_importer` migration
 * accepts the file inline on creation. Sending `pre_attachment[name]` and
 * `pre_attachment[size]` on the SAME POST that creates the migration makes
 * Canvas fold the "ask for an upload ticket" step into the migration-create
 * response, so there is exactly one migration row and no separate
 * course-files entry to reconcile.
 */

import { resolveCourse } from "../canvas-core";
import { writeJson } from "./fetch-helpers";
import type { FileUploadTicket } from "./types";
import type { RawMigration } from "./raw-types";

/**
 * The pre_attachment block Canvas embeds in the content_migrations create
 * response when `pre_attachment[name]`/`pre_attachment[size]` were sent.
 * Documented at canvas.instructure.com/doc/api/content_migrations.html:
 * "if there is no upload_url then there was an attachment pre-processing
 * error, the error message will be in the message key." `upload_params` is
 * the same param bag `FileUploadTicket.uploadParams` already models (see
 * files.ts's `requestFileUpload`), so it is reused verbatim rather than
 * declared a second time.
 */
type RawPreAttachment = {
  upload_url?: string;
  upload_params?: Record<string, string>;
  message?: string;
};

/**
 * RawMigration (raw-types.ts) only declares `id`/`workflow_state`, because
 * copy.ts - its only other consumer - never reads anything else. Extending
 * locally rather than editing raw-types.ts keeps this addition scoped to the
 * one module that needs `pre_attachment`, matching the pattern migrations.ts
 * already established for its own migration-list fields.
 */
type RawCartridgeMigration = RawMigration & {
  pre_attachment?: RawPreAttachment;
};

/** Result of starting a cartridge-upload migration: enough for the caller to
 * both poll the migration (AC14) and perform the browser upload (AC13). */
export interface CartridgeMigrationResult {
  migrationId: number;
  /** Carried through so callers can drive getMigrationStateAction /
   * selectCopyTypesAction without re-deriving a course id of their own
   * (AC11's third bullet). */
  courseId: string;
  state: string;
  ticket: FileUploadTicket;
}

/**
 * Start a `common_cartridge_importer` migration on `courseUrl`'s course,
 * asking Canvas for an upload ticket for `file` in the same request.
 *
 * `opts.selective` pauses the migration at `waiting_for_select` so the caller
 * can choose content types afterward (via the existing `selectCopyTypes`);
 * `opts.overwriteQuizzes` maps to `settings[overwrite_quizzes]`, which
 * replaces quiz content that shares an identifier with what is already in
 * the live course - both are opt-in, so both params are omitted (not sent as
 * `false`) unless the caller turned them on.
 */
export async function createCartridgeMigration(
  courseUrl: string,
  file: { name: string; size: number },
  opts: { selective: boolean; overwriteQuizzes: boolean },
  code?: string
): Promise<CartridgeMigrationResult> {
  const ctx = resolveCourse(courseUrl, code);

  const params = new URLSearchParams();
  // VERIFIED 2026-08-21 against the Canvas content_migrations API docs: this
  // exact string, not "cc_importer" or any other name Canvas uses elsewhere
  // for Common Cartridge.
  params.append("migration_type", "common_cartridge_importer");
  // pre_attachment[name]/[size] are what makes Canvas return an upload ticket
  // on THIS response instead of requiring a separate course-files POST.
  params.append("pre_attachment[name]", file.name);
  params.append("pre_attachment[size]", String(file.size));
  if (opts.selective) params.append("selective_import", "true");
  if (opts.overwriteQuizzes) params.append("settings[overwrite_quizzes]", "true");

  const data = await writeJson<RawCartridgeMigration>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/content_migrations`,
    "POST",
    ctx,
    params
  );

  if (typeof data.id !== "number") {
    throw new Error("Canvas did not start the cartridge import.");
  }

  const preAttachment = data.pre_attachment;
  // "if there is no upload_url then there was an attachment pre-processing
  // error, the error message will be in the message key" - Canvas already
  // named the problem (a size cap, a disallowed content type, etc.), so
  // discarding that in favor of a generic sentence would turn a specific,
  // actionable Canvas error into "something went wrong." The generic
  // fallback below is used ONLY when Canvas did not supply a message.
  if (!preAttachment?.upload_url || !preAttachment.upload_params) {
    const canvasMessage = preAttachment?.message?.trim();
    throw new Error(
      canvasMessage ? canvasMessage : "Canvas did not return an upload URL for the cartridge."
    );
  }

  return {
    migrationId: data.id,
    courseId: ctx.courseId,
    state: data.workflow_state ?? "",
    ticket: { uploadUrl: preAttachment.upload_url, uploadParams: preAttachment.upload_params },
  };
}
