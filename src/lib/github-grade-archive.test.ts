import { createHash } from "node:crypto";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indexGradeArchive, verifyGradeArchiveFiles } from "./github-grade-archive-zip";
import { confirmedGradeSourceCooldown, makePinnedArchiveReader } from "./github-grade-archive";
import { GithubGradeSourceRateLimitError } from "./github-http-error";

const sha = "a".repeat(40);
const prefix = "school-student-shortsha";
const apiUrl = `https://api.github.com/repos/school/student/zipball/${sha}`;
const download = `https://codeload.github.com/school/student/legacy.zip/${sha}`;

function blob(path: string, contents: string | Buffer, mode = "100644") {
  const size = Buffer.byteLength(contents);
  return { path, mode, size, type: "blob" as const, sha: createHash("sha1").update(`blob ${size}\0`).update(contents).digest("hex") };
}

async function zip(files: Array<[string, string | Buffer, number?]>) {
  const archive = new JSZip();
  for (const [path, contents, unixPermissions] of files) archive.file(`${prefix}/${path}`, contents, { unixPermissions });
  return archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE", platform: "UNIX" });
}

const signal = () => new AbortController().signal;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("pinned grading archive integrity", () => {
  it("reads exact case-sensitive member names, empty blobs, and UTF-8 without weakening byte verification", async () => {
    const archive = indexGradeArchive(await zip([["lab/a.py", "\ufeffprint('café')"], ["lab/b.py", ""], ["Lab/a.py", "other folder"]]));
    const verified = await verifyGradeArchiveFiles(archive, [blob("lab/a.py", "\ufeffprint('café')"), blob("lab/b.py", "")], signal());
    expect([...verified]).toEqual([["lab/a.py", "print('café')"], ["lab/b.py", ""]]);
  });

  it.each([
    { case: "Git export substitutions", expected: "hello", actual: "world" },
    { case: "invalid UTF-8", expected: Buffer.from([0xc3, 0x28]), actual: Buffer.from([0xc3, 0x28]) },
    { case: "NUL bytes", expected: "\0hello", actual: "\0hello" },
    { case: "an LFS pointer", expected: "version https://git-lfs.github.com/spec/v1\nsize 5\n", actual: "version https://git-lfs.github.com/spec/v1\nsize 5\n" },
    { case: "an archive symlink", expected: "hello", actual: "hello", unixMode: 0o120777 },
    { case: "a Git tree symlink", expected: "hello", actual: "hello", treeMode: "120000" },
  ])("refuses $case before returning text", async ({ expected, actual, unixMode, treeMode }) => {
    const archive = indexGradeArchive(await zip([["lab/a.py", actual, unixMode]]));
    await expect(verifyGradeArchiveFiles(archive, [blob("lab/a.py", expected, treeMode)], signal())).rejects.toThrow();
  });

  it("refuses traversal and duplicate ZIP paths before extracting any member", async () => {
    const badPath = await zip([["../outside.py", "no"]]);
    expect(() => indexGradeArchive(badPath)).toThrow();
    const archive = await zip([["lab/a.py", "one"], ["lab/b.py", "two"]]);
    const source = Buffer.from("lab/b.py");
    const duplicate = Buffer.from("lab/a.py");
    for (let position = archive.indexOf(source); position >= 0; position = archive.indexOf(source, position + source.length)) {
      duplicate.copy(archive, position);
    }
    expect(() => indexGradeArchive(archive)).toThrow();
  });

  it("bounds native inflation when both ZIP headers lie about output size", async () => {
    const archive = await zip([["a.py", "a".repeat(500_000)]]);
    const eocd = archive.length - 22;
    let directory = archive.readUInt32LE(eocd + 16);
    while (archive.readUInt16LE(directory + 28) !== `${prefix}/a.py`.length) {
      directory += 46 + archive.readUInt16LE(directory + 28) + archive.readUInt16LE(directory + 30) + archive.readUInt16LE(directory + 32);
    }
    const local = archive.readUInt32LE(directory + 42);
    archive.writeUInt32LE(1, directory + 24);
    archive.writeUInt32LE(1, local + 22);
    const indexed = indexGradeArchive(archive);
    await expect(verifyGradeArchiveFiles(indexed, [blob("a.py", "a")], signal())).rejects.toThrow();
  });
});

describe("pinned grading archive transport", () => {
  const files = [blob("a.py", "a"), blob("b.py", "b"), blob("c.py", "c")];

  it("reports confirmed credential cooldown without a request, and clears it at expiry", async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv("GITHUB_TOKEN", "confirmed-cooldown-token");
      const fetcher = vi.fn(async () => new Response(null, { status: 429, headers: { "Retry-After": "120" } }));
      vi.stubGlobal("fetch", fetcher);
      const retryAtMs = Date.now() + 120_000;
      await expect(makePinnedArchiveReader({ accountId: "cooldown-test", owner: "school", repo: "student", sha })(files))
        .rejects.toThrow(GithubGradeSourceRateLimitError);
      expect(confirmedGradeSourceCooldown()).toEqual({ retryAtMs, primary: false });
      expect(fetcher).toHaveBeenCalledOnce();
      vi.stubEnv("GITHUB_TOKEN", "different-token");
      expect(confirmedGradeSourceCooldown()).toBeNull();
      vi.stubEnv("GITHUB_TOKEN", "confirmed-cooldown-token");
      vi.advanceTimersByTime(120_000);
      expect(confirmedGradeSourceCooldown()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    { status: 403, location: "api", header: "X-RateLimit-Remaining", value: "25" },
    { status: 429, location: "codeload", header: "Retry-After", value: "120" },
    { status: 503, location: "codeload", header: "Retry-After", value: "120" },
  ])("prevents repeated requests after $location HTTP $status", async ({ status, location, header, value }) => {
    vi.stubEnv("GITHUB_TOKEN", `cooldown-token-${status}`);
    const fetcher = vi.fn(async (url: string) => {
      if (url === apiUrl && location === "codeload") return new Response(null, { status: 302, headers: { Location: download } });
      return new Response(null, { status, headers: { [header]: value } });
    });
    vi.stubGlobal("fetch", fetcher);
    const reader = makePinnedArchiveReader({ accountId: "cooldown-test", owner: "school", repo: "student", sha });
    const expected = status === 429 ? GithubGradeSourceRateLimitError : "The pinned GitHub repository archive could not be read.";
    await expect(reader(files)).rejects.toThrow(expected);
    await expect(reader(files)).rejects.toThrow(expected);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(location === "api" ? [apiUrl] : [apiUrl, download]);
    expect(confirmedGradeSourceCooldown()).toEqual(status === 429
      ? { retryAtMs: expect.any(Number), primary: false } : null);
  });

  it.each(["https://codeload.github.com.example.test/zip", "https://user@codeload.github.com/zip", "http://codeload.github.com/zip"])(
    "does not forward credentials or fall back after a rejected redirect: %s", async (location) => {
      vi.stubEnv("GITHUB_TOKEN", "test-pat");
      const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { Location: location } }));
      vi.stubGlobal("fetch", fetcher);
      await expect(makePinnedArchiveReader({ accountId: "redirect-test", owner: "school", repo: "student", sha })(files)).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledExactlyOnceWith(apiUrl, expect.objectContaining({ redirect: "manual" }));
    },
  );

  it("cancels a stalled codeload body on caller cancellation and does not fan out", async () => {
    vi.stubEnv("GITHUB_TOKEN", "test-pat");
    const cancellation = new AbortController();
    const cancelBody = vi.fn();
    const stream = new ReadableStream({ cancel: cancelBody });
    const getReader = vi.spyOn(stream, "getReader");
    const fetcher = vi.fn(async (url: string) => url === apiUrl
      ? new Response(null, { status: 302, headers: { Location: download } }) : new Response(stream));
    vi.stubGlobal("fetch", fetcher);
    const result = makePinnedArchiveReader({ accountId: "cancellation-test", owner: "school", repo: "student", sha })(files, cancellation.signal);
    await vi.waitFor(() => expect(getReader).toHaveBeenCalled());
    cancellation.abort();
    await expect(result).rejects.toThrow();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([apiUrl, download]);
    expect(cancelBody).toHaveBeenCalledOnce();
  });
});
