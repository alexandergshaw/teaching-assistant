/**
 * Owner allowlist check. Pure (only reads process.env + strings) so it is safe
 * to import from edge middleware and from server actions alike.
 *
 * OWNER_EMAILS is a comma-separated list of the email addresses allowed to use
 * the app. Fails closed: when unset, nobody is treated as the owner.
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  const allowed = (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length > 0 && !!email && allowed.includes(email.toLowerCase());
}
