import { describe, it, expect } from "vitest";
import {
  supportsSinkId,
  resolveSinkId,
  describeApplyResult,
  DEFAULT_SINK_ID,
  type OutputDevice,
} from "./audio-output";

describe("supportsSinkId", () => {
  it("reports unsupported when the element has no setSinkId at all", () => {
    expect(supportsSinkId({})).toBe(false);
  });

  it("reports unsupported for a null/undefined element", () => {
    expect(supportsSinkId(null)).toBe(false);
    expect(supportsSinkId(undefined)).toBe(false);
  });

  it("reports supported when setSinkId is a function", () => {
    expect(supportsSinkId({ setSinkId: async () => {} })).toBe(true);
  });

  it("does not treat a non-function setSinkId property as supported", () => {
    // @ts-expect-error - deliberately wrong shape to prove the guard checks type
    expect(supportsSinkId({ setSinkId: "nope" })).toBe(false);
  });
});

describe("resolveSinkId", () => {
  const devices: OutputDevice[] = [
    { deviceId: "speaker-1", label: "Built-in speakers" },
    { deviceId: "speaker-2", label: "USB headset" },
  ];

  it("falls back to the system default when nothing was stored", () => {
    expect(resolveSinkId(devices, null)).toBe(DEFAULT_SINK_ID);
    expect(resolveSinkId(devices, undefined)).toBe(DEFAULT_SINK_ID);
  });

  it("keeps a stored id that is still among the available devices", () => {
    expect(resolveSinkId(devices, "speaker-2")).toBe("speaker-2");
  });

  it("falls back to the system default when the stored id has vanished (device unplugged)", () => {
    expect(resolveSinkId(devices, "speaker-unplugged")).toBe(DEFAULT_SINK_ID);
  });

  it("falls back to the system default when the device list is empty", () => {
    expect(resolveSinkId([], "speaker-2")).toBe(DEFAULT_SINK_ID);
  });

  it("falls back to the system default for an empty device list and no stored id", () => {
    expect(resolveSinkId([], null)).toBe(DEFAULT_SINK_ID);
  });
});

describe("describeApplyResult", () => {
  it("reports applied with the sinkId that was set", () => {
    const result = describeApplyResult("applied", "speaker-2");
    expect(result.status).toBe("applied");
    expect(result.sinkId).toBe("speaker-2");
    expect(result.reason).toBeNull();
  });

  it("reports unsupported with a null sinkId and a non-empty reason", () => {
    const result = describeApplyResult("unsupported", "speaker-2");
    expect(result.status).toBe("unsupported");
    expect(result.sinkId).toBeNull();
    expect(typeof result.reason).toBe("string");
    expect((result.reason ?? "").length).toBeGreaterThan(0);
  });

  it("reports failed with a null sinkId and the underlying error message", () => {
    const result = describeApplyResult({ failed: new Error("device busy") }, "speaker-2");
    expect(result.status).toBe("failed");
    expect(result.sinkId).toBeNull();
    expect(result.reason).toBe("device busy");
  });

  it("reports failed with a generic reason when the thrown value is not an Error", () => {
    const result = describeApplyResult({ failed: "boom" }, "speaker-2");
    expect(result.status).toBe("failed");
    expect(result.sinkId).toBeNull();
    expect(typeof result.reason).toBe("string");
    expect((result.reason ?? "").length).toBeGreaterThan(0);
  });

  it("keeps applied, unsupported, and failed as three distinguishable statuses", () => {
    const statuses = new Set([
      describeApplyResult("applied", "x").status,
      describeApplyResult("unsupported", "x").status,
      describeApplyResult({ failed: new Error("x") }, "x").status,
    ]);
    expect(statuses.size).toBe(3);
  });
});
