import { afterEach, expect, it, vi } from "vitest";
import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "./client";

vi.mock("@supabase/ssr", () => ({ createBrowserClient: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("extends only the signed institution deck upload timeout", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response());
  vi.stubGlobal("fetch", fetch);
  const timeout = vi.spyOn(AbortSignal, "timeout");
  createClient();
  const boundedFetch = vi.mocked(createBrowserClient).mock.calls.at(-1)?.[2]?.global?.fetch;
  if (!boundedFetch) throw new Error("Supabase browser client did not receive a bounded fetch.");
  const storage = "https://example.invalid/storage/v1";
  await boundedFetch(`${storage}/object/upload/sign/institution-directory-decks/staging/safe-key?token=temporary`, { method: "PUT" });
  await boundedFetch(`${storage}/object/upload/sign/institution-directory-decks/files/safe-key`, { method: "PUT" });
  await boundedFetch(`${storage}/object/upload/sign/another-bucket/staging/safe-key`, { method: "PUT" });
  await boundedFetch(`${storage}/object/upload/sign/institution-directory-decks/staging/safe-key`, { method: "GET" });
  expect(timeout.mock.calls).toEqual([[300_000], [18_000], [18_000], [18_000]]);
  expect(fetch).toHaveBeenCalledTimes(4);
});
