import { beforeEach, describe, expect, it, vi } from "vitest";
import { readRepoFeedbackReadiness } from "@/lib/supabase/repo-feedback-readiness";
import { REPO_FEEDBACK_READINESS_POLICY, type RepoFeedbackReadiness } from "@/lib/supabase/repo-feedback-readiness-contract";
import { POST } from "./route";

vi.mock("@/lib/supabase/repo-feedback-readiness", () => ({ readRepoFeedbackReadiness: vi.fn() }));

const ORIGIN = "https://teaching.example";
const PATH = "/auth/repo-feedback-readiness";
const readReadiness = vi.mocked(readRepoFeedbackReadiness);

function request(init: RequestInit = {}, path = PATH) {
  return new Request(ORIGIN + path, {
    method: "POST", headers: { Origin: ORIGIN, "Sec-Fetch-Site": "same-origin" }, ...init,
  });
}

beforeEach(() => readReadiness.mockReset());

describe("POST /auth/repo-feedback-readiness", () => {
  it("returns only the attested origin, policy and deadline with a server Date and no-store", async () => {
    const readiness: RepoFeedbackReadiness = {
      origin: "https://feedback.example", policy: REPO_FEEDBACK_READINESS_POLICY, expiresAt: Date.now() + 60_000,
    };
    readReadiness.mockReturnValue(readiness);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("date")).toBeTruthy();
    expect(await response.json()).toEqual(readiness);
  });

  it("returns a fixed unavailable result without cache or cookies when evidence is absent", async () => {
    readReadiness.mockReturnValue(null);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toEqual({ error: "Feedback sign-in is unavailable." });
  });

  it.each([
    [403, request({ headers: {} })],
    [403, request({ headers: { Origin: "https://other.example" } })],
    [403, request({ headers: { Origin: ORIGIN, "Sec-Fetch-Site": "cross-site" } })],
    [400, request({ method: "GET" })],
    [400, request({}, `${PATH}/`)],
    [400, request({}, `${PATH}?`)],
    [400, request({}, `${PATH}?project=other`)],
    [400, request({ body: "{}" })],
    [400, request({ headers: { Origin: ORIGIN, Authorization: "Bearer test" } })],
    [400, request({ headers: { Origin: ORIGIN, "Transfer-Encoding": "chunked" } })],
  ])("rejects malformed request with %s before reading policy", async (status, input) => {
    const response = await POST(input);
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(readReadiness).not.toHaveBeenCalled();
  });
});
