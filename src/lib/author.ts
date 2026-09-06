import type { User } from "@supabase/supabase-js";

/**
 * Neutral fallback for the document author field when no per-user name is
 * available from any source. Deliberately NOT a person's name: this used to
 * be `DEFAULT_AUTHOR = "Alex Shaw"` (the deployment owner's own name), which
 * meant every second person's generated .docx/.pptx was silently stamped
 * with the OWNER's name the moment nothing more specific resolved. A
 * multi-user deployment has no single real person a document without a
 * known author can honestly be attributed to, so this names no one.
 */
const NEUTRAL_AUTHOR = "Teaching Assistant";

/**
 * Resolve the human author name stamped into the core properties of every
 * generated document (.docx / .pptx) so a downloaded file reads as the
 * SIGNED-IN user's own work - never a different person's.
 *
 * Resolution order (each step runs only if every step before it produced
 * nothing usable):
 *   1. `displayName` - a name for the CALLER'S OWN account, supplied by the
 *      caller (e.g. that account's app_users.display_name row, looked up by
 *      the caller's own verified id - never a client-supplied value passed
 *      straight through). This is the only source that names a SPECIFIC
 *      person with certainty the caller can vouch for, so it wins over
 *      everything else.
 *   2. `user`'s own auth metadata (`full_name`, then `name`) - used when the
 *      caller has a real Supabase `User` object to hand (some callers do;
 *      an impersonation/unattended path may not).
 *   3. `NEXT_PUBLIC_DOC_AUTHOR` - a deployment-wide override. This USED TO
 *      run FIRST, ahead of the signed-in user's own name, which meant a
 *      single env var silently overwrote every real person's name the
 *      moment more than one person used the app. It now only applies once
 *      neither per-user source above produced anything.
 *   4. `NEUTRAL_AUTHOR` - see its own comment above for why this can never
 *      be a hardcoded person's name.
 *
 * Pure: reads only its own arguments and `process.env.NEXT_PUBLIC_DOC_AUTHOR`;
 * no IO, never throws.
 */
export function resolveDocumentAuthor(
  user?: Pick<User, "email" | "user_metadata"> | null,
  displayName?: string | null
): string {
  if (typeof displayName === "string" && displayName.trim()) {
    return displayName.trim();
  }

  const meta = user?.user_metadata as
    | { full_name?: unknown; name?: unknown }
    | undefined;
  for (const candidate of [meta?.full_name, meta?.name]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  const override = process.env.NEXT_PUBLIC_DOC_AUTHOR?.trim();
  if (override) return override;

  return NEUTRAL_AUTHOR;
}
