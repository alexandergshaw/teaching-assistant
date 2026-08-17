// Repo-level invitation management (list/delete) for the student-repo
// invitation status panel. Mirrors github.collab.ts's import shape.

import { ghFetch, ghJson } from "./github.repos";
import type { RepoPermission } from "./github.collab";

export interface RepoInvitation {
  id: number;
  inviteeLogin: string; // "" when the API's `invitee` is null or absent
  permission: string; // RAW response spelling from the API's `permissions` field
  createdAt: string; // "" when absent
  expired: boolean; // false when absent
  htmlUrl: string; // "" when absent
}

interface RawRepoInvitation {
  id?: number;
  invitee?: { login?: string } | null;
  permissions?: string;
  created_at?: string;
  expired?: boolean;
  html_url?: string;
}

/** List a repo's open invitations. GitHub's response field for the access
 * level is `permissions` (PLURAL) - reading `permission` (singular) would
 * silently yield undefined for every row. */
export async function listRepoInvitations(owner: string, repo: string): Promise<RepoInvitation[]> {
  const raw = await ghJson<RawRepoInvitation[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/invitations?per_page=100`
  );
  return raw.map((inv) => ({
    id: inv.id ?? 0,
    inviteeLogin: inv.invitee?.login ?? "",
    permission: inv.permissions ?? "",
    createdAt: inv.created_at ?? "",
    expired: inv.expired ?? false,
    htmlUrl: inv.html_url ?? "",
  }));
}

/** Cancel a pending repo invitation. Answers 204 No Content - never call
 * .json() on the response. */
export async function deleteRepoInvitation(owner: string, repo: string, invitationId: number): Promise<void> {
  await ghFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/invitations/${invitationId}`, {
    method: "DELETE",
  });
}

/** Bridges the invitation object's RESPONSE permission vocabulary
 * (read/write/triage/maintain/admin) to the collaborator PUT endpoint's
 * REQUEST vocabulary (pull/triage/push/maintain/admin): read -> pull,
 * write -> push, the three shared spellings pass through, and any
 * unrecognised value (orgs can define custom repository roles) falls back
 * to pull, the least privilege. Case-insensitive. */
export function invitationPermissionToRepoPermission(p: string): RepoPermission {
  switch (p.trim().toLowerCase()) {
    case "read":
      return "pull";
    case "write":
      return "push";
    case "triage":
      return "triage";
    case "maintain":
      return "maintain";
    case "admin":
      return "admin";
    default:
      return "pull";
  }
}
