import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  listRepoInvitations,
  deleteRepoInvitation,
  invitationPermissionToRepoPermission,
} from "./github";

const ok = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
const noContent = () => new Response(null, { status: 204 });

const rawInvite = (over: Record<string, unknown> = {}) => ({
  id: 101,
  node_id: "MDEw",
  invitee: { login: "jsmith", id: 5 },
  inviter: { login: "prof", id: 1 },
  permissions: "write",
  created_at: "2026-08-10T12:00:00Z",
  expired: false,
  url: "https://api.github.com/user/repository_invitations/101",
  html_url: "https://github.com/my-org/cs101-smith-john/invitations",
  ...over,
});

describe("listRepoInvitations", () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-token";
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
  });

  it("GETs the repo's invitations endpoint with a full page size", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return ok([]);
    });

    await listRepoInvitations("my-org", "cs101-smith-john");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/repos/my-org/cs101-smith-john/invitations");
    // A class roster can exceed the default page size of 30.
    expect(calls[0].url).toContain("per_page=100");
    // Asserted as an explicit absence, not `method ?? "GET"` - that form also
    // passes for an implementation that forgot to pass `init` at all.
    expect(calls[0].init?.method).toBeUndefined();
  });

  it("maps the API's snake_case fields onto the app's shape", async () => {
    global.fetch = vi.fn(async () => ok([rawInvite()]));

    const [invitation] = await listRepoInvitations("my-org", "cs101-smith-john");

    expect(invitation.id).toBe(101);
    expect(invitation.inviteeLogin).toBe("jsmith");
    expect(invitation.createdAt).toBe("2026-08-10T12:00:00Z");
    expect(invitation.expired).toBe(false);
    expect(invitation.htmlUrl).toBe("https://github.com/my-org/cs101-smith-john/invitations");
  });

  it("reads the permission from the API's PLURAL `permissions` field", async () => {
    // The response field is `permissions` (plural) and carries the RESPONSE
    // spelling. An implementation that reads `raw.permission` (singular)
    // silently yields undefined for every invitation, and nothing else in
    // this suite would notice.
    global.fetch = vi.fn(async () => ok([rawInvite({ permissions: "admin" })]));
    const [invitation] = await listRepoInvitations("my-org", "r");
    expect(invitation.permission).toBe("admin");
  });

  it("keeps the raw response spelling on the wire object, unmapped", async () => {
    global.fetch = vi.fn(async () => ok([rawInvite({ permissions: "write" })]));
    const [invitation] = await listRepoInvitations("my-org", "r");
    expect(invitation.permission).toBe("write");
  });

  it("composes with the mapper to recover the request spelling end to end", async () => {
    // This is the round trip AC3.1a exists to protect: a listed invitation's
    // permission, fed back into a collaborator PUT, must come out as "push".
    global.fetch = vi.fn(async () => ok([rawInvite({ permissions: "write" })]));
    const [invitation] = await listRepoInvitations("my-org", "r");
    expect(invitationPermissionToRepoPermission(invitation.permission)).toBe("push");
  });

  it("defaults a missing permissions field to the least privilege once mapped", async () => {
    global.fetch = vi.fn(async () => ok([{ id: 1, invitee: { login: "jsmith" } }]));
    const [invitation] = await listRepoInvitations("my-org", "r");
    expect(invitationPermissionToRepoPermission(invitation.permission)).toBe("pull");
  });

  it("carries the expired flag through", async () => {
    global.fetch = vi.fn(async () => ok([rawInvite({ expired: true })]));
    const [invitation] = await listRepoInvitations("my-org", "r");
    expect(invitation.expired).toBe(true);
  });

  it("tolerates a null invitee (the API schema allows it) without throwing", async () => {
    global.fetch = vi.fn(async () => ok([rawInvite({ invitee: null })]));

    const [invitation] = await listRepoInvitations("my-org", "r");

    // Such a record can never be attributed to a student; it must surface as
    // a blank login rather than crash the whole status refresh.
    expect(invitation.inviteeLogin).toBe("");
  });

  it("tolerates missing optional fields", async () => {
    global.fetch = vi.fn(async () => ok([{ id: 7 }]));
    const [invitation] = await listRepoInvitations("my-org", "r");
    expect(invitation.id).toBe(7);
    expect(invitation.inviteeLogin).toBe("");
    expect(invitation.expired).toBe(false);
  });

  it("URL-encodes the owner and repo segments", async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return ok([]);
    });

    await listRepoInvitations("my org", "repo name");

    expect(calls[0]).not.toContain("my org");
    expect(calls[0]).not.toContain("repo name");
  });

  it("returns an empty array when the repo has no open invitations", async () => {
    global.fetch = vi.fn(async () => ok([]));
    expect(await listRepoInvitations("my-org", "r")).toEqual([]);
  });

  it("surfaces a GitHub error rather than returning an empty list", async () => {
    // A 403 must not look like "this student was never invited".
    global.fetch = vi.fn(async () => new Response("{}", { status: 403 }));
    await expect(listRepoInvitations("my-org", "r")).rejects.toThrow();
  });
});

describe("deleteRepoInvitation", () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-token";
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
  });

  it("DELETEs the invitation by id", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return noContent();
    });

    await deleteRepoInvitation("my-org", "cs101-smith-john", 101);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/repos/my-org/cs101-smith-john/invitations/101");
    expect(calls[0].init?.method).toBe("DELETE");
  });

  it("does not attempt to parse a body from the 204 response", async () => {
    // DELETE answers 204 No Content; calling .json() on it throws.
    global.fetch = vi.fn(async () => noContent());
    await expect(deleteRepoInvitation("my-org", "r", 1)).resolves.toBeUndefined();
  });

  it("surfaces a GitHub error", async () => {
    global.fetch = vi.fn(async () => new Response("{}", { status: 404 }));
    await expect(deleteRepoInvitation("my-org", "r", 1)).rejects.toThrow();
  });
});

describe("invitationPermissionToRepoPermission", () => {
  // The request and response spellings differ. PUT .../collaborators accepts
  // pull/triage/push/maintain/admin; the invitation object returns
  // read/write/triage/maintain/admin. Round-tripping without this mapping
  // silently downgrades or mis-labels a student's access.
  it("maps read to pull and write to push", () => {
    expect(invitationPermissionToRepoPermission("read")).toBe("pull");
    expect(invitationPermissionToRepoPermission("write")).toBe("push");
  });

  it("passes the three shared spellings through unchanged", () => {
    expect(invitationPermissionToRepoPermission("triage")).toBe("triage");
    expect(invitationPermissionToRepoPermission("maintain")).toBe("maintain");
    expect(invitationPermissionToRepoPermission("admin")).toBe("admin");
  });

  it("falls back to the least privilege for an unrecognised value", () => {
    // Organizations can define custom repository roles, so an unknown string
    // is reachable in production. Guessing high would misreport a student's
    // access as broader than it is.
    expect(invitationPermissionToRepoPermission("some-custom-role")).toBe("pull");
    expect(invitationPermissionToRepoPermission("")).toBe("pull");
  });

  it("is case-insensitive", () => {
    expect(invitationPermissionToRepoPermission("Write")).toBe("push");
  });
});
