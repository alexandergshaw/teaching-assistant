import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

const { createServerClient, getUser } = vi.hoisted(() => ({ createServerClient: vi.fn(), getUser: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient }));

beforeEach(() => {
  createServerClient.mockReset().mockReturnValue({ auth: { getUser } });
  getUser.mockReset().mockResolvedValue({ data: { user: null }, error: null });
});

function request(method: string, pathname: string) {
  return new NextRequest(`https://teaching.example${pathname}`, {
    method,
    headers: {
      Authorization: "Bearer exact.jwt.value",
      Cookie: "sb-auth-token=other-account",
      "x-ta-access-decision": "owner",
    },
  });
}

describe("feedback session proxy boundary", () => {
  it("passes only the endpoint POST through before cookie auth and strips the spoofed decision", async () => {
    const response = await proxy(request("POST", "/auth/repo-feedback-session"));
    expect(createServerClient).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-request-authorization")).toBe("Bearer exact.jwt.value");
    expect(response.headers.get("x-middleware-override-headers")?.split(",")).not.toContain("x-ta-access-decision");
    expect(response.headers.get("x-middleware-request-x-ta-access-decision")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("bypasses cookie auth on the exact readiness POST and strips cookie and spoofed access decision", async () => {
    const response = await proxy(request("POST", "/auth/repo-feedback-readiness"));
    expect(createServerClient).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-override-headers")?.split(",")).not.toContain("cookie");
    expect(response.headers.get("x-middleware-override-headers")?.split(",")).not.toContain("x-ta-access-decision");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    ["GET", "/auth/repo-feedback-session"],
    ["OPTIONS", "/auth/repo-feedback-session"],
    ["POST", "/auth/repo-feedback-session/"],
    ["POST", "/auth/repo-feedback-session/child"],
    ["POST", "/auth/repo-feedback-session-extra"],
    ["GET", "/auth/repo-feedback-readiness"],
    ["OPTIONS", "/auth/repo-feedback-readiness"],
    ["POST", "/auth/repo-feedback-readiness/"],
    ["POST", "/auth/repo-feedback-readiness/child"],
    ["POST", "/auth/repo-feedback-readiness-extra"],
    ["POST", "/auth/repo-feedback-readiness?extra=1"],
    ["POST", "/auth/another-route"],
    ["POST", "/api/grade-run-item"],
  ])("keeps cookie auth on %s %s", async (method, pathname) => {
    await proxy(request(method, pathname));
    expect(createServerClient).toHaveBeenCalledOnce();
    expect(getUser).toHaveBeenCalledExactlyOnceWith();
  });
});
