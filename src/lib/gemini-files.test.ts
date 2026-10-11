// VIDEO-GRADING W3 (ops T9): the Files API client and the upload bracket, driven
// entirely by injected fakes. The client is handed a fake `fetchImpl`; nothing
// here touches the network, and the real protocol is owner-walk (ops R-1).
import { describe, it, expect, vi } from "vitest";
import {
  GeminiFilesError,
  createGeminiFilesClient,
  isGeminiFileName,
  isGeminiFileUri,
  redactFilesError,
  withUploadedGeminiVideo,
  type GeminiFilesClient,
} from "./gemini-files";

const KEY = "sk-test-KEY-123456";
const HOST = "https://generativelanguage.googleapis.com";
const GOOD_URI = `${HOST}/v1beta/files/abc-123`;

interface Call {
  url: string;
  init: RequestInit;
}

function headerOf(call: Call, name: string): string | undefined {
  const h = call.init.headers as Record<string, string>;
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? h[key] : undefined;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function scripted(responses: Array<Response | Error>): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (next instanceof Error) throw next;
    return next.clone();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const UPLOAD_OK = [
  json({}, 200, { "x-goog-upload-url": `${HOST}/upload/v1beta/files/session-1` }),
  json({ file: { name: "files/abc-123", uri: GOOD_URI, state: "PROCESSING" } }),
];

describe("createGeminiFilesClient: auth and protocol (T9)", () => {
  it("sends x-goog-api-key on every call and never puts the key in a URL", async () => {
    const { fetchImpl, calls } = scripted([...UPLOAD_OK, json({ state: "PROCESSING" }), json({ state: "ACTIVE" }), json({})]);
    const client = createGeminiFilesClient({ apiKey: KEY, fetchImpl, sleep: async () => undefined, now: () => 0 });
    const file = await client.upload({ bytes: new Uint8Array([1, 2, 3]), mimeType: "video/mp4", displayName: "ta-grading-video-x" });
    expect(file).toEqual({ name: "files/abc-123", uri: GOOD_URI });
    await client.waitActive(file.name, { deadlineMs: 10_000 });
    await client.delete(file.name);
    expect(calls).toHaveLength(5);
    for (const call of calls) {
      expect(headerOf(call, "x-goog-api-key")).toBe(KEY);
      expect(call.url).not.toContain(KEY);
      expect(call.url).not.toContain("key=");
    }
    expect(calls[0].url).toBe(`${HOST}/upload/v1beta/files`);
    expect(headerOf(calls[0], "X-Goog-Upload-Command")).toBe("start");
    expect(headerOf(calls[0], "X-Goog-Upload-Header-Content-Length")).toBe("3");
    expect(headerOf(calls[1], "X-Goog-Upload-Command")).toBe("upload, finalize");
    expect(calls[4].init.method).toBe("DELETE");
  });

  it("delivers the exact bytes to the upload POST", async () => {
    const { fetchImpl, calls } = scripted(UPLOAD_OK);
    const client = createGeminiFilesClient({ apiKey: KEY, fetchImpl });
    const bytes = new Uint8Array([9, 8, 7, 6]);
    await client.upload({ bytes, mimeType: "video/mp4", displayName: "ta-grading-video-x" });
    expect(calls[1].init.body).toBe(bytes);
  });

  it("refuses an upload URL on a foreign origin (bytes and key stay home)", async () => {
    const { fetchImpl, calls } = scripted([json({}, 200, { "x-goog-upload-url": "https://evil.example.com/steal" })]);
    const client = createGeminiFilesClient({ apiKey: KEY, fetchImpl });
    await expect(
      client.upload({ bytes: new Uint8Array(4), mimeType: "video/mp4", displayName: "d" })
    ).rejects.toMatchObject({ failure: "upload failed" });
    expect(calls).toHaveLength(1);
  });

  it("refuses a response whose name or uri is not in the expected shape", async () => {
    for (const file of [
      { name: "files/../x", uri: GOOD_URI },
      { name: "files/abc-123", uri: "https://evil.example.com/v1beta/files/abc" },
      { name: "files/ABC", uri: GOOD_URI },
    ]) {
      const { fetchImpl } = scripted([UPLOAD_OK[0], json({ file })]);
      const client = createGeminiFilesClient({ apiKey: KEY, fetchImpl });
      await expect(client.upload({ bytes: new Uint8Array(4), mimeType: "video/mp4", displayName: "d" })).rejects.toBeInstanceOf(
        GeminiFilesError
      );
    }
  });

  it("retries once on 5xx then succeeds, and gives up after one retry", async () => {
    const ok = scripted([json({}, 503), ...UPLOAD_OK]);
    const client = createGeminiFilesClient({ apiKey: KEY, fetchImpl: ok.fetchImpl });
    await expect(client.upload({ bytes: new Uint8Array(1), mimeType: "video/mp4", displayName: "d" })).resolves.toBeDefined();
    expect(ok.calls).toHaveLength(3);

    const bad = scripted([json({}, 503)]);
    const client2 = createGeminiFilesClient({ apiKey: KEY, fetchImpl: bad.fetchImpl });
    await expect(client2.upload({ bytes: new Uint8Array(1), mimeType: "video/mp4", displayName: "d" })).rejects.toMatchObject({
      failure: "upload failed",
    });
    expect(bad.calls).toHaveLength(2);
  });

  it("waitActive: FAILED -> model rejected; never ACTIVE by the deadline -> timed out", async () => {
    const failed = scripted([json({ state: "FAILED" })]);
    await expect(
      createGeminiFilesClient({ apiKey: KEY, fetchImpl: failed.fetchImpl, now: () => 0 }).waitActive("files/abc-123", { deadlineMs: 10_000 })
    ).rejects.toMatchObject({ failure: "model rejected" });

    let t = 0;
    const slow = scripted([json({ state: "PROCESSING" })]);
    const client = createGeminiFilesClient({
      apiKey: KEY,
      fetchImpl: slow.fetchImpl,
      sleep: async () => {
        t += 1_000;
      },
      now: () => t,
    });
    await expect(client.waitActive("files/abc-123", { deadlineMs: 3_000 })).rejects.toMatchObject({ failure: "timed out" });
  });

  it("waitActive stops at once when the signal is already aborted", async () => {
    const polled = scripted([json({ state: "PROCESSING" })]);
    const controller = new AbortController();
    controller.abort();
    const client = createGeminiFilesClient({ apiKey: KEY, fetchImpl: polled.fetchImpl, now: () => 0 });
    await expect(client.waitActive("files/abc-123", { deadlineMs: 10_000, signal: controller.signal })).rejects.toMatchObject({
      failure: "timed out",
    });
    expect(polled.calls).toHaveLength(0);
  });

  it("a network error message with the key and a URL in it is never surfaced", async () => {
    const boom = new Error(`connect failed ${HOST}/upload?key=${KEY}`);
    const { fetchImpl } = scripted([boom]);
    const client = createGeminiFilesClient({ apiKey: KEY, fetchImpl });
    const error = await client.upload({ bytes: new Uint8Array(1), mimeType: "video/mp4", displayName: "d" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GeminiFilesError);
    const text = `${(error as Error).message} ${String((error as Error).stack)}`;
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("googleapis");
  });

  it("delete ignores a malformed name (no request is made)", async () => {
    const { fetchImpl, calls } = scripted([json({})]);
    await createGeminiFilesClient({ apiKey: KEY, fetchImpl }).delete("files/../../x");
    expect(calls).toHaveLength(0);
  });
});

describe("validators and redaction", () => {
  it("redactFilesError strips a key and any URL", () => {
    const out = redactFilesError(`bad ${KEY} at https://x.test/a?b=1 done`, KEY);
    expect(out).not.toContain(KEY);
    expect(out).not.toContain("x.test");
  });
  it("isGeminiFileUri / isGeminiFileName are strict", () => {
    expect(isGeminiFileUri(GOOD_URI)).toBe(true);
    expect(isGeminiFileUri(`${HOST}/v1beta/files/`)).toBe(false);
    expect(isGeminiFileUri("https://evil.example.com/v1beta/files/a")).toBe(false);
    expect(isGeminiFileName("files/abc-123")).toBe(true);
    expect(isGeminiFileName("files/ABC")).toBe(false);
    expect(isGeminiFileName("abc")).toBe(false);
  });
});

function fakeClient(over: Partial<GeminiFilesClient> = {}): GeminiFilesClient & {
  upload: ReturnType<typeof vi.fn>;
  waitActive: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  return {
    upload: vi.fn(async () => ({ name: "files/fake-1", uri: GOOD_URI })),
    waitActive: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    ...over,
  } as never;
}

const INPUT = {
  readBytes: async () => new Uint8Array([1, 2, 3]),
  mimeType: "video/mp4",
  displayName: "ta-grading-video-t",
  deadlineMs: 1_000,
};

describe("withUploadedGeminiVideo (T9)", () => {
  it("success: consume gets the uri, delete is called with the uploaded name", async () => {
    const client = fakeClient();
    const seen: unknown[] = [];
    const value = await withUploadedGeminiVideo(client, INPUT, async (v) => {
      seen.push(v);
      return 42;
    });
    expect(value).toBe(42);
    expect(seen).toEqual([{ fileUri: GOOD_URI, mimeType: "video/mp4" }]);
    expect(client.delete).toHaveBeenCalledWith("files/fake-1");
  });

  it("delete still runs when consume throws", async () => {
    const client = fakeClient();
    await expect(
      withUploadedGeminiVideo(client, INPUT, async () => {
        throw new Error("model blew up");
      })
    ).rejects.toThrow("model blew up");
    expect(client.delete).toHaveBeenCalledWith("files/fake-1");
  });

  it("delete runs when the ACTIVE wait times out", async () => {
    const client = fakeClient({
      waitActive: vi.fn(async () => {
        throw new GeminiFilesError("timed out");
      }),
    });
    const consume = vi.fn(async () => 1);
    await expect(withUploadedGeminiVideo(client, INPUT, consume)).rejects.toMatchObject({ failure: "timed out" });
    expect(consume).not.toHaveBeenCalled();
    expect(client.delete).toHaveBeenCalledWith("files/fake-1");
  });

  it("delete is NOT called when the upload returned no name", async () => {
    const client = fakeClient({
      upload: vi.fn(async () => {
        throw new GeminiFilesError("upload failed");
      }),
    });
    await expect(withUploadedGeminiVideo(client, INPUT, async () => 1)).rejects.toBeInstanceOf(GeminiFilesError);
    expect(client.delete).not.toHaveBeenCalled();
  });

  it("an abort while the (non-cancellable) model call is in flight deletes the file NOW", async () => {
    const client = fakeClient();
    const controller = new AbortController();
    let release: () => void = () => undefined;
    const neverSettlesUntilReleased = new Promise<number>((resolve) => {
      release = () => resolve(1);
    });
    const pending = withUploadedGeminiVideo(client, { ...INPUT, signal: controller.signal }, () => neverSettlesUntilReleased);
    // let upload + waitActive resolve and consume begin
    await new Promise((r) => setTimeout(r, 0));
    expect(client.delete).not.toHaveBeenCalled();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ failure: "timed out" });
    expect(client.delete).toHaveBeenCalledWith("files/fake-1");
    release();
  });

  it("a delete that throws is swallowed and does not mask the result", async () => {
    const client = fakeClient({
      delete: vi.fn(async () => {
        throw new Error("delete failed");
      }),
    });
    await expect(withUploadedGeminiVideo(client, INPUT, async () => "ok")).resolves.toBe("ok");
  });

  it("the thrown error text contains neither a key nor a URL", async () => {
    const client = fakeClient({
      upload: vi.fn(async () => {
        throw new GeminiFilesError("upload failed");
      }),
    });
    const error = (await withUploadedGeminiVideo(client, INPUT, async () => 1).catch((e: unknown) => e)) as Error;
    expect(error.message).not.toMatch(/https?:|key|googleapis/i);
  });
});
