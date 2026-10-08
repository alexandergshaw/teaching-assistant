// FIX-1 (docs/zip-upload-lag-scope.md): the pure client-side size pre-flight
// for the grading file inputs. A too-large upload is rejected by the framework
// before the server action runs, so without this the browser transmits the
// whole file and then fails opaquely. Dependency-free apart from the budget
// helpers, so it is safe to import from a client component and executable
// under vitest. Mirrors describePictureRejection (gradingPictureIngest.ts).

import { checkFileWireBudget, formatMB, maxFileBytesForWireBudget } from "@/lib/upload-budget";

/** The minimal File surface the pre-flight needs (a real File satisfies it). */
export interface UploadFileLike {
  name: string;
  size: number;
}

export type UploadPreflightResult = { ok: true } | { ok: false; message: string };

/**
 * Accepts the file, or rejects it with a worded message that names the size
 * and the limit in MB and says what to do. `what` names the thing refused
 * ("The student submissions file", "This file").
 *
 * Current-transport guard: the file rides the Server Action body, so it is
 * budgeted against the wire limit. When the bulk-zip Storage path lands the zip
 * goes off-body and callers will relax this check for the zip input.
 */
export function preflightUploadFile(file: UploadFileLike, what: string): UploadPreflightResult {
  const budget = checkFileWireBudget(file.size, what);
  if (budget.ok) return { ok: true };
  return {
    ok: false,
    message:
      `${budget.error} Nothing was uploaded. Split the archive into parts under ` +
      `${formatMB(maxFileBytesForWireBudget())} each, or remove large attachments, then try again.`,
  };
}
