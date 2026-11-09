import { describe, expect, it } from "vitest";
import { advanceRecordingImageScope } from "./useRecordingImageAccountFence";
describe("recording image account fence", () => {
  it("invalidates in-flight image work on account change and sign out", () => {
    const previous = { current: "owner-a" }, epoch = { current: 2 };
    expect(advanceRecordingImageScope(previous, "owner-a", epoch)).toBe(false);
    expect(epoch.current).toBe(2);
    expect(advanceRecordingImageScope(previous, "owner-b", epoch)).toBe(true);
    expect(epoch.current).toBe(3);
    expect(advanceRecordingImageScope(previous, "", epoch)).toBe(true);
    expect(epoch.current).toBe(4);
  });
});
