import type { User } from "@supabase/supabase-js";

/**
 * Resolve the human author name stamped into the core properties of every
 * generated document (.docx / .pptx) so a downloaded file reads as the user's
 * own work instead of carrying a tooling default such as "PptxGenJS" or
 * "Un-named".
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_DOC_AUTHOR - explicit override for the deployment owner.
 *   2. The signed-in user's profile name (full_name / name in user_metadata).
 *   3. A readable name derived from the email local part.
 *   4. Empty string - the file then records no author at all, which is still a
 *      normal state for a hand-made document (and never names a tool).
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

  const local = user?.email?.split("@")[0]?.trim();
  if (local) {
    return local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return "";
}
