import type { User } from "@supabase/supabase-js";

/**
 * Owner's display name, used as the default author when nothing more specific
 * is available so generated files read as this person's own work. Override per
 * deployment with NEXT_PUBLIC_DOC_AUTHOR.
 */
const DEFAULT_AUTHOR = "Alex Shaw";

/**
 * Resolve the human author name stamped into the core properties of every
 * generated document (.docx / .pptx) so a downloaded file reads as the user's
 * own work instead of carrying a tooling default such as "PptxGenJS" or
 * "Un-named".
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_DOC_AUTHOR - explicit override for the deployment owner.
 *   2. The signed-in user's profile name (full_name / name in user_metadata).
 *   3. DEFAULT_AUTHOR - the owner's name, so files are always attributed.
 */
export function resolveDocumentAuthor(
  user?: Pick<User, "email" | "user_metadata"> | null
): string {
  const override = process.env.NEXT_PUBLIC_DOC_AUTHOR?.trim();
  if (override) return override;

  const meta = user?.user_metadata as
    | { full_name?: unknown; name?: unknown }
    | undefined;
  for (const candidate of [meta?.full_name, meta?.name]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  return DEFAULT_AUTHOR;
}
