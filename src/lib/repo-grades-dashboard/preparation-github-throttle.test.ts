import { describe, expect, it, vi } from "vitest";
import { preparationGithubThrottle } from "./preparation-github-throttle";

describe("preparation GitHub throttle classification", () => {
  it("distinguishes confirmed limits from permission failures and retains only timing", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    try {
      expect(preparationGithubThrottle(403, new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1200" }))?.rateLimit)
        .toEqual({ retryAtMs: 1_200_000, primary: true });
      expect(preparationGithubThrottle(429, new Headers({ "retry-after": "90" }))?.rateLimit)
        .toEqual({ retryAtMs: 1_090_000, primary: false });
      expect(preparationGithubThrottle(429, new Headers())?.rateLimit).toEqual({ retryAtMs: null, primary: false });
      expect(preparationGithubThrottle(429, new Headers({ "x-ratelimit-remaining": "10", "retry-after": "45" }))?.rateLimit)
        .toEqual({ retryAtMs: 1_045_000, primary: false });
      expect(preparationGithubThrottle(403, new Headers())).toBeUndefined();
      expect(preparationGithubThrottle(403, new Headers({ "x-ratelimit-remaining": "10" }))).toBeUndefined();
      expect(preparationGithubThrottle(403, new Headers({ "x-ratelimit-remaining": "10", "retry-after": "45" }))?.rateLimit)
        .toEqual({ retryAtMs: 1_045_000, primary: false });
      expect(preparationGithubThrottle(403, new Headers({ "retry-after": "Thu, 01 Jan 1970 00:20:00 GMT" }))?.rateLimit)
        .toEqual({ retryAtMs: 1_200_000, primary: false });
      expect(preparationGithubThrottle(403, new Headers({ "retry-after": "0" }))?.rateLimit)
        .toEqual({ retryAtMs: null, primary: false });
      expect(preparationGithubThrottle(403, new Headers({ "retry-after": "1.5" }))).toBeUndefined();
      expect(preparationGithubThrottle(403, new Headers({ "retry-after": "invalid" }))).toBeUndefined();
      expect(preparationGithubThrottle(403, new Headers({ "retry-after": "999999999999999999999999" }))).toBeUndefined();
      expect(preparationGithubThrottle(404, new Headers({ "retry-after": "45" }))).toBeUndefined();
    } finally { clock.mockRestore(); }
  });
});
