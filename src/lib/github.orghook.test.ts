import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createOrgPushHook } from "./github";

const ok = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });

describe("GitHub org webhooks", () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = "test-token";
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
  });

  describe("createOrgPushHook", () => {
    it("creates a push hook when none exists", async () => {
      const calls: Array<{ url: string; init?: RequestInit }> = [];

      global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(url);
        calls.push({ url: urlStr, init });

        if (urlStr.includes("/orgs/myorg/hooks") && (!init || !init.method || init.method === "GET")) {
          return ok([]);
        }
        if (urlStr.includes("/orgs/myorg/hooks") && init?.method === "POST") {
          return ok({ id: 42 });
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const result = await createOrgPushHook("myorg", "https://x/api/github/webhook", "s3cret");

      expect(result).toEqual({ id: 42, alreadyExisted: false });
      expect(calls).toHaveLength(2);

      const getCall = calls[0];
      expect(getCall.url).toContain("/orgs/myorg/hooks");
      expect(getCall.init?.method).not.toBe("POST");

      const postCall = calls[1];
      expect(postCall.url).toContain("/orgs/myorg/hooks");
      expect(postCall.init?.method).toBe("POST");
      const body = JSON.parse(postCall.init?.body as string);
      expect(body.events).toEqual(["push"]);
      expect(body.config.url).toBe("https://x/api/github/webhook");
      expect(body.config.content_type).toBe("json");
      expect(body.config.secret).toBe("s3cret");
      expect(body.name).toBe("web");
      expect(body.active).toBe(true);
    });

    it("reactivates an existing same-url hook via PATCH instead of creating a duplicate", async () => {
      const calls: Array<{ url: string; init?: RequestInit }> = [];

      global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(url);
        calls.push({ url: urlStr, init });

        if (urlStr.includes("/orgs/myorg/hooks") && (!init || !init.method || init.method === "GET")) {
          return ok([{ id: 7, active: false, events: [], config: { url: "https://x/api/github/webhook" } }]);
        }
        if (urlStr.includes("/orgs/myorg/hooks/7") && init?.method === "PATCH") {
          return ok({});
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      });

      const result = await createOrgPushHook("myorg", "https://x/api/github/webhook", "s3cret");

      expect(result).toEqual({ id: 7, alreadyExisted: true });
      expect(calls).toHaveLength(2);

      const getCall = calls[0];
      expect(getCall.url).toContain("/orgs/myorg/hooks");
      expect(getCall.init?.method).not.toBe("POST");

      const patchCall = calls[1];
      expect(patchCall.url).toContain("/orgs/myorg/hooks/7");
      expect(patchCall.init?.method).toBe("PATCH");
      const patchBody = JSON.parse(patchCall.init?.body as string);
      expect(patchBody.active).toBe(true);
      expect(patchBody.events).toEqual(["push"]);
      expect(patchBody.config.secret).toBe("s3cret");
      expect(patchBody.config.url).toBe("https://x/api/github/webhook");
      expect(patchBody.config.content_type).toBe("json");

      const postCall = calls.find((c) => c.init?.method === "POST");
      expect(postCall).toBeUndefined();
    });
  });
});
