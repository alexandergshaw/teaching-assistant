import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BRANDED_DECK_MIME } from "@/lib/institution-branded-decks";
import { downloadInstitutionDeckFile } from "./download-institution-deck";

const signedUrl = "https://storage.example.invalid/file?token=temporary";
const file = { name: "École & Lab #1%.potx", size: 4, extension: "potx" as const };
const errorMessage = "Could not open that slide deck. Try again.";
const anchor = { href: "", download: "", click: vi.fn() };
const body = { appendChild: vi.fn(), removeChild: vi.fn() };
const transfer = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", transfer);
  vi.stubGlobal("document", { createElement: vi.fn(() => anchor), body });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:https://app.example.invalid/local");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("downloads the bytes under the original name via a local object URL", async () => {
  const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  transfer.mockResolvedValue(new Response(bytes));
  await downloadInstitutionDeckFile(signedUrl, file, new AbortController().signal);
  expect(transfer).toHaveBeenCalledWith(signedUrl, {
    credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer", signal: expect.any(AbortSignal),
  });
  const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
  expect(blob.type).toBe(BRANDED_DECK_MIME.potx);
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  expect(anchor).toMatchObject({ href: "blob:https://app.example.invalid/local", download: file.name });
  expect(body.appendChild).toHaveBeenCalledWith(anchor);
  expect(anchor.click).toHaveBeenCalledOnce();
  expect(body.removeChild).toHaveBeenCalledWith(anchor);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(anchor.href);
});

it("shows the retry message on network failure without opening the signed URL", async () => {
  transfer.mockRejectedValue(new TypeError("Failed to fetch"));
  await expect(downloadInstitutionDeckFile(signedUrl, file, new AbortController().signal)).rejects.toThrow(errorMessage);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(anchor.click).not.toHaveBeenCalled();
});

it.each(["declared oversize", "streamed oversize", "truncated", "expired"] as const)("refuses a %s response without opening a download", async (kind) => {
  const responses = {
    "declared oversize": new Response(new Uint8Array(4), { headers: { "content-length": "5" } }),
    "streamed oversize": new Response(new Uint8Array(5)),
    truncated: new Response(new Uint8Array(3)),
    expired: new Response(new Uint8Array(4), { status: 403 }),
  };
  transfer.mockResolvedValue(responses[kind]);
  await expect(downloadInstitutionDeckFile(signedUrl, file, new AbortController().signal)).rejects.toThrow(errorMessage);
  expect(anchor.click).not.toHaveBeenCalled();
});

it("cancels a stalled body when the institution row unmounts", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({ cancel });
  const lifetime = new AbortController();
  transfer.mockResolvedValue(new Response(body));
  const pending = downloadInstitutionDeckFile(signedUrl, file, lifetime.signal);
  await Promise.resolve();
  lifetime.abort();
  await expect(pending).rejects.toThrow(errorMessage);
  expect(cancel).toHaveBeenCalledOnce();
  expect(anchor.click).not.toHaveBeenCalled();
});
