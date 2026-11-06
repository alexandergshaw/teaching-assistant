import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireAppOwner } from "@/lib/supabase/auth";
import { GET } from "./route";

vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn() }));

const ACCOUNT = "app-owner";
const TOKEN = "test-github-credential";
const NOW_MS = Date.UTC(2026, 10, 6, 12);
const RESET_MS = NOW_MS + 3_600_000;
const fetchGithub = vi.fn<typeof fetch>();
let caseId = 0;

function owner(id = ACCOUNT) {
  vi.mocked(requireAppOwner).mockResolvedValue({ id, email: "", role: "owner", status: "active" });
}

function request(account = ACCOUNT) {
  return new Request("https://teaching-assistant.example/api/repo-grades/github-quota", {
    headers: { "X-Repo-Grades-Account": account },
  });
}

function quota(remaining: number) {
  return Response.json({
    resources: { core: { limit: 5_000, remaining, reset: RESET_MS / 1_000 }, search: { limit: 30, remaining: 0 } },
  });
}

beforeEach(() => {
  caseId++;
  vi.stubEnv("GITHUB_TOKEN", `${TOKEN}-${caseId}`);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW_MS);
  fetchGithub.mockReset();
  vi.stubGlobal("fetch", fetchGithub);
  owner();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Repo Grades GitHub quota", () => {
  it("authenticates and matches the account before spending the configured credential, even with a warm cache", async () => {
    fetchGithub.mockResolvedValueOnce(quota(10));
    const good = await GET(request());
    expect(good.status).toBe(200);
    expect(good.headers.get("cache-control")).toBe("private, no-store");
    expect(fetchGithub).toHaveBeenCalledWith("https://api.github.com/rate_limit", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}-${caseId}` }),
      cache: "no-store",
      redirect: "error",
    }));

    const mismatched = await GET(request("another-account"));
    expect(mismatched.status).toBe(403);
    vi.mocked(requireAppOwner).mockRejectedValueOnce(new Error("untrusted account"));
    const denied = await GET(request());
    expect(denied.status).toBe(403);
    expect(denied.headers.get("cache-control")).toBe("private, no-store");
    expect(await denied.json()).toEqual({ status: "unavailable" });
    expect(fetchGithub).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent checks, returns the primary quota only, and rechecks after the cache expires", async () => {
    fetchGithub.mockResolvedValueOnce(quota(128));
    const [first, second] = await Promise.all([GET(request()), GET(request())]);
    const observed = {
      status: "observed", limit: 5_000, remaining: 128,
      resetAtMs: RESET_MS, observedAtMs: NOW_MS, staleAtMs: NOW_MS + 60_000,
    };
    expect(await first.json()).toEqual(observed);
    expect(await second.json()).toEqual(observed);
    expect(await (await GET(request())).json()).toEqual(observed);
    expect(fetchGithub).toHaveBeenCalledTimes(1);

    vi.setSystemTime(NOW_MS + 60_000);
    fetchGithub.mockResolvedValueOnce(quota(0));
    expect(await (await GET(request())).json()).toMatchObject({ status: "observed", remaining: 0 });
    vi.setSystemTime(NOW_MS + 120_000);
    expect(await (await GET(request())).json()).toMatchObject({ status: "observed", remaining: 0 });
    expect(fetchGithub).toHaveBeenCalledTimes(2);

    vi.setSystemTime(RESET_MS);
    fetchGithub.mockResolvedValueOnce(quota(5_000));
    expect(await (await GET(request())).json()).toMatchObject({ status: "observed", remaining: 5_000 });
    expect(fetchGithub).toHaveBeenCalledTimes(3);
  });

  it("keeps cache entries separate across viewing accounts and credential rotation", async () => {
    fetchGithub.mockResolvedValueOnce(quota(80)).mockResolvedValueOnce(quota(30)).mockResolvedValueOnce(quota(90));
    expect(await (await GET(request())).json()).toMatchObject({ remaining: 80 });
    owner("second-owner");
    expect(await (await GET(request("second-owner"))).json()).toMatchObject({ remaining: 30 });
    owner();
    vi.stubEnv("GITHUB_TOKEN", `${TOKEN}-rotated-${caseId}`);
    expect(await (await GET(request())).json()).toMatchObject({ remaining: 90 });
    expect(fetchGithub).toHaveBeenCalledTimes(3);
  });

  it("retains usable fields without presenting malformed counters or reset as known", async () => {
    fetchGithub.mockResolvedValueOnce(Response.json({
      resources: { core: { limit: 5_000, remaining: 6_000, reset: "soon" } },
    }));
    expect(await (await GET(request())).json()).toMatchObject({
      status: "observed", limit: 5_000, remaining: null, resetAtMs: null,
    });
  });

  it("reports a secondary throttle without inventing primary counts and honors retry-after", async () => {
    fetchGithub.mockResolvedValueOnce(new Response(TOKEN, {
      status: 429, headers: { "retry-after": "120", "x-ratelimit-resource": "core", "x-ratelimit-remaining": "40" },
    }));
    expect(await (await GET(request())).json()).toEqual({ status: "throttled" });
    vi.setSystemTime(NOW_MS + 90_000);
    expect(await (await GET(request())).json()).toEqual({ status: "throttled" });
    expect(fetchGithub).toHaveBeenCalledTimes(1);
  });

  it("can report an exhausted core bucket from a failed response's explicit core headers", async () => {
    fetchGithub.mockResolvedValueOnce(new Response(TOKEN, {
      status: 403,
      headers: {
        "x-ratelimit-resource": "core", "x-ratelimit-remaining": "0",
        "x-ratelimit-limit": "5000", "x-ratelimit-reset": String(RESET_MS / 1_000),
      },
    }));
    expect(await (await GET(request())).json()).toMatchObject({
      status: "observed", limit: 5_000, remaining: 0, resetAtMs: RESET_MS,
    });
  });

  it("does not use anonymous quota, echo upstream errors, or infer a throttle from a bare 403", async () => {
    vi.stubEnv("GITHUB_TOKEN", "  ");
    expect(await (await GET(request())).json()).toEqual({ status: "not-configured" });
    expect(fetchGithub).not.toHaveBeenCalled();

    vi.stubEnv("GITHUB_TOKEN", `${TOKEN}-${caseId}`);
    fetchGithub.mockResolvedValueOnce(new Response(TOKEN, { status: 403 }));
    expect(await (await GET(request())).json()).toEqual({ status: "unavailable" });
  });
});
