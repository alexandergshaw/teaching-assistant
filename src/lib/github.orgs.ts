// Organization member and webhook management.

import { ghFetch, ghJson } from "./github.repos";

export interface OrgMember {
  login: string;
  role: "admin" | "member";
}

/** List an org's members with their org role (admin = owner). */
export async function listOrgMembers(org: string): Promise<OrgMember[]> {
  const collect = async (role: "admin" | "member"): Promise<OrgMember[]> => {
    const out: OrgMember[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const users = await ghJson<Array<{ login?: string }>>(
        `/orgs/${org}/members?role=${role}&per_page=100&page=${page}`
      );
      for (const u of users) if (u.login) out.push({ login: u.login, role });
      if (users.length < 100) break;
    }
    return out;
  };
  const [admins, members] = await Promise.all([collect("admin"), collect("member")]);
  return [...admins, ...members].sort((a, b) => a.login.localeCompare(b.login));
}

/** Invite a user to the org by username or email. `role`: "admin" (owner) or "member". */
export async function inviteOrgMember(org: string, invitee: string, role: "admin" | "member"): Promise<void> {
  const invitationRole = role === "admin" ? "admin" : "direct_member";
  const value = invitee.trim();
  if (!value) throw new Error("Enter a GitHub username or email to invite.");
  let body: Record<string, unknown>;
  if (value.includes("@")) {
    body = { email: value, role: invitationRole };
  } else {
    const user = await ghJson<{ id?: number }>(`/users/${encodeURIComponent(value)}`);
    if (typeof user.id !== "number") throw new Error(`GitHub user "${value}" was not found.`);
    body = { invitee_id: user.id, role: invitationRole };
  }
  await ghFetch(`/orgs/${org}/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Set an existing member's org role. */
export async function setOrgMemberRole(org: string, username: string, role: "admin" | "member"): Promise<void> {
  await ghFetch(`/orgs/${org}/memberships/${encodeURIComponent(username)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

export interface OrgHook {
  id: number;
  url: string;
  events: string[];
  active: boolean;
}

/** List an org's webhooks (needs the token's admin:org_hook scope). */
export async function listOrgHooks(org: string): Promise<OrgHook[]> {
  const hooks = await ghJson<Array<{ id?: number; active?: boolean; events?: string[]; config?: { url?: string } }>>(
    `/orgs/${org}/hooks?per_page=100`
  );
  return hooks
    .filter((h): h is { id: number; active?: boolean; events?: string[]; config?: { url?: string } } => typeof h.id === "number")
    .map((h) => ({ id: h.id, url: h.config?.url ?? "", events: h.events ?? [], active: h.active ?? false }));
}

/** Idempotently register an org-level push webhook that POSTs to `url`. If a hook
 * with the same payload url already exists, self-heals it (forces active, subscribed
 * to push, signed with the current secret) via PATCH instead of creating a duplicate.
 * `secret` is used by GitHub to sign each delivery (X-Hub-Signature-256); it is never
 * logged or returned. Needs the token's admin:org_hook scope. */
export async function createOrgPushHook(
  org: string,
  url: string,
  secret: string
): Promise<{ id: number; alreadyExisted: boolean }> {
  const config = { url, content_type: "json", secret, insecure_ssl: "0" };
  const existing = await listOrgHooks(org);
  const match = existing.find((h) => h.url === url);
  if (match) {
    // Self-heal: force the existing same-url hook to be active, subscribed to
    // push, and signed with the current secret (covers a previously disabled or
    // mis-scoped hook and secret rotation). PATCH rather than POST because GitHub
    // rejects a duplicate-url POST with 422.
    await ghFetch(`/orgs/${org}/hooks/${match.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true, events: ["push"], config }),
    });
    return { id: match.id, alreadyExisted: true };
  }
  const created = await ghJson<{ id?: number }>(`/orgs/${org}/hooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "web", active: true, events: ["push"], config }),
  });
  if (typeof created.id !== "number") throw new Error("GitHub did not return a webhook id.");
  return { id: created.id, alreadyExisted: false };
}
