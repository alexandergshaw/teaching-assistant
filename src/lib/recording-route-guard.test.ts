import { describe, expect, it } from "vitest";
import { allowRecordingRouteChange, registerRecordingRouteGuard } from "./recording-route-guard";

describe("recording route guard registry", () => {
  it("blocks pathname changes only while a mounted recording guard refuses", () => {
    let calls = 0;
    const remove = registerRecordingRouteGuard(() => { calls++; return false; });
    expect(allowRecordingRouteChange("/", "/")).toBe(true);
    expect(calls).toBe(0);
    expect(allowRecordingRouteChange("/", "/account/diagnostics")).toBe(false);
    expect(calls).toBe(1);
    remove();
    expect(allowRecordingRouteChange("/", "/account/diagnostics")).toBe(true);
  });
  it("allows navigation when every active guard accepts and removes only its own guard", () => {
    const removeA = registerRecordingRouteGuard(() => true);
    const removeB = registerRecordingRouteGuard(() => false);
    expect(allowRecordingRouteChange("/", "/knowledge")).toBe(false);
    removeB();
    expect(allowRecordingRouteChange("/", "/knowledge")).toBe(true);
    removeA();
  });
});
