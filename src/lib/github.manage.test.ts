import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { inviteOrgMember, setBranchProtection, updateRepo, listOrgMembers } from "./github";

const ok = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
const empty = () => new Response("{}", { status: 200 });

describe("GitHub org + repo management", () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-token";
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
  });

  describe("inviteOrgMember", () => {
    it("invites a user by username (looks up by /users endpoint first)", async () => {
      const calls: Array<{ url: string; init?: RequestInit }> = [];

      global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(url);
        calls.push({ url: urlStr, init });

        if (urlStr.includes("/users/octocat")) {
          return ok({ id: 123456 });
        }
        if (urlStr.includes("/orgs/myorg/invitations")) {
          return empty();
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      await inviteOrgMember("myorg", "octocat", "admin");

      expect(calls).toHaveLength(2);

      const userCall = calls[0];
      expect(userCall.url).toContain("/users/octocat");

      const inviteCall = calls[1];
      expect(inviteCall.url).toContain("/orgs/myorg/invitations");
      expect(inviteCall.init?.method).toBe("POST");
      const body = JSON.parse(inviteCall.init?.body as string);
      expect(body.invitee_id).toBe(123456);
      expect(body.role).toBe("admin");
    });

    it("invites a user by email (no /users lookup)", async () => {
      const calls: Array<{ url: string; init?: RequestInit }> = [];

      global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(url);
        calls.push({ url: urlStr, init });

        if (urlStr.includes("/orgs/myorg/invitations")) {
          return empty();
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      await inviteOrgMember("myorg", "a@b.com", "member");

      expect(calls).toHaveLength(1);
      const inviteCall = calls[0];
      expect(inviteCall.url).toContain("/orgs/myorg/invitations");
      const body = JSON.parse(inviteCall.init?.body as string);
      expect(body.email).toBe("a@b.com");
      expect(body.role).toBe("direct_member");
    });
  });

  describe("setBranchProtection", () => {
    it("sets branch protection with the correct payload", async () => {
      let capturedBody: unknown = null;

      global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr.includes("/repos/owner/repo/branches/main/protection")) {
          capturedBody = JSON.parse(init?.body as string);
          return empty();
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const opts = {
        requirePullRequestReviews: true,
        requiredApprovingReviewCount: 2,
        requireStatusChecks: false,
        statusCheckContexts: [],
        strictStatusChecks: false,
        enforceAdmins: true,
        requireLinearHistory: true,
      };

      await setBranchProtection("owner", "repo", "main", opts);

      expect(capturedBody).not.toBeNull();
      const body = capturedBody as Record<string, unknown>;
      expect(body.required_pull_request_reviews).toEqual({
        required_approving_review_count: 2,
      });
      expect(body.required_status_checks).toBeNull();
      expect(body.enforce_admins).toBe(true);
      expect(body.required_linear_history).toBe(true);
      expect(body.restrictions).toBeNull();
    });
  });

  describe("updateRepo", () => {
    it("patches repo with only the specified fields", async () => {
      let capturedBody: unknown = null;

      global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr.includes("/repos/owner/repo") && init?.method === "PATCH") {
          capturedBody = JSON.parse(init?.body as string);
          return ok({
            name: "repo",
            owner: { login: "owner" },
            is_template: true,
            private: false,
            description: "A template repo",
            default_branch: "main",
            html_url: "https://github.com/owner/repo",
          });
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      await updateRepo("owner", "repo", { isTemplate: true, private: false });

      expect(capturedBody).not.toBeNull();
      const body = capturedBody as Record<string, unknown>;
      expect(body.is_template).toBe(true);
      expect(body.private).toBe(false);
      expect(body.description).toBeUndefined();
      expect(body.archived).toBeUndefined();
    });
  });

  describe("listOrgMembers", () => {
    it("fetches admins and members separately, then merges and sorts", async () => {
      const calls: string[] = [];

      global.fetch = vi.fn(async (url: RequestInfo | URL) => {
        const urlStr = String(url);
        calls.push(urlStr);

        if (urlStr.includes("role=admin")) {
          return ok([{ login: "alice" }]);
        }
        if (urlStr.includes("role=member")) {
          return ok([{ login: "bob" }]);
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const members = await listOrgMembers("myorg");

      expect(members).toEqual([
        { login: "alice", role: "admin" },
        { login: "bob", role: "member" },
      ]);
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(calls.some((c) => c.includes("role=admin"))).toBe(true);
      expect(calls.some((c) => c.includes("role=member"))).toBe(true);
    });
  });
});
