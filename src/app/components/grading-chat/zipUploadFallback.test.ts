import { expect, it, vi } from "vitest";
import { zipUploadFallback } from "./zipUploadFallback";

it("uses the ordinary intake once after a pre-dispatch upload failure", async () => {
  const body = vi.fn(async () => ({ kind: "accepted" as const, entryCount: 1 }));
  expect(await zipUploadFallback("upload failed", true, () => true, body)).toEqual({ kind: "accepted", entryCount: 1 });
  expect(body).toHaveBeenCalledOnce();
});
it("does not dispatch after session/account invalidation or for an oversized ZIP", async () => {
  const body = vi.fn(async () => ({ kind: "accepted" as const, entryCount: 1 }));
  expect(await zipUploadFallback("upload failed", true, () => false, body)).toEqual({ kind: "refused", reason: "upload failed" });
  expect(await zipUploadFallback("upload failed", false, () => true, body)).toEqual({ kind: "refused", reason: "upload failed" });
  expect(body).not.toHaveBeenCalled();
});
