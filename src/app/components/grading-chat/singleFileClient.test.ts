// LARGE-SINGLE-FILE W2: the browser-side seams (upload path, prepare POST,
// cleanup on a refused submit) and the panel/driver wiring, source-pinned.
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GradingZipStorage } from "@/lib/grade/grading-zip-transport";
import { postPrepareSingleFile, submitStoragedFile, uploadGradingSingleFile } from "./singleFileClient";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function fakeStorage(uploadError: { message: string } | null = null): { storage: GradingZipStorage; uploaded: string[] } {
  const uploaded: string[] = [];
  const storage: GradingZipStorage = {
    from: () => ({
      upload: async (path) => {
        uploaded.push(path);
        return { error: uploadError };
      },
      remove: async () => ({ error: null }),
    }),
  };
  return { storage, uploaded };
}

function docx(): File {
  return new File([new Uint8Array(4)], "Essay.DOCX");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadGradingSingleFile", () => {
  it("stages under the user's grading-uploads segment with the file's own extension", async () => {
    const { storage, uploaded } = fakeStorage();
    const result = await uploadGradingSingleFile(storage, "u1", docx(), "abc");
    expect(result).toEqual({ ok: true, storagePath: "u1/grading-uploads/abc.docx" });
    expect(uploaded).toEqual(["u1/grading-uploads/abc.docx"]);
  });

  it("a storage error is a worded refusal", async () => {
    const { storage } = fakeStorage({ message: "nope" });
    const result = await uploadGradingSingleFile(storage, "u1", docx(), "abc");
    expect(result.ok).toBe(false);
  });
});

describe("submitStoragedFile", () => {
  it("refuses when signed out and uploads nothing", async () => {
    const { storage, uploaded } = fakeStorage();
    const submit = vi.fn();
    const out = await submitStoragedFile({ file: docx(), userId: null, storage, submit });
    expect(out.kind).toBe("refused");
    expect(uploaded).toEqual([]);
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits a storaged-file input and keeps the object on acceptance", async () => {
    const { storage } = fakeStorage();
    const submit = vi.fn().mockResolvedValue({ kind: "accepted", entryCount: 1 });
    const remove = vi.fn().mockResolvedValue(undefined);
    const out = await submitStoragedFile({
      file: docx(), label: "Sam", userId: "u1", storage, submit, remove,
      upload: async () => ({ ok: true, storagePath: "u1/grading-uploads/x.docx" }),
    });
    expect(out.kind).toBe("accepted");
    expect(submit).toHaveBeenCalledWith({ kind: "storaged-file", storagePath: "u1/grading-uploads/x.docx", name: "Essay.DOCX", label: "Sam" });
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes the staged object when the submit is refused or throws", async () => {
    const { storage } = fakeStorage();
    const remove = vi.fn().mockResolvedValue(undefined);
    const upload = async () => ({ ok: true as const, storagePath: "u1/grading-uploads/x.docx" });
    await submitStoragedFile({ file: docx(), userId: "u1", storage, remove, upload, submit: async () => ({ kind: "refused", reason: "r" }) });
    expect(remove).toHaveBeenCalledTimes(1);
    await expect(
      submitStoragedFile({ file: docx(), userId: "u1", storage, remove, upload, submit: async () => { throw new Error("x"); } })
    ).rejects.toThrow("x");
    expect(remove).toHaveBeenCalledTimes(2);
  });
});

describe("postPrepareSingleFile", () => {
  it("returns the entry on 200 and posts the path, name, provider and label", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ entry: { student: "A", content: "c", mergedFileCount: 1, submittedFiles: [] } }) });
    vi.stubGlobal("fetch", fetchMock);
    const out = await postPrepareSingleFile("u1/grading-uploads/x.docx", "e.docx", "gemini", "Sam");
    expect(out.kind).toBe("entry");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/grade-submission-file");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ storagePath: "u1/grading-uploads/x.docx", name: "e.docx", provider: "gemini", label: "Sam" });
  });

  it("surfaces the server's worded error and never throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "too long" }) }));
    expect(await postPrepareSingleFile("p", "n", "gemini")).toEqual({ kind: "refused", reason: "too long" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net")));
    expect((await postPrepareSingleFile("p", "n", "gemini")).kind).toBe("refused");
  });
});

describe("wiring", () => {
  it("the panel consults the zip transport for zips and the single-file transport otherwise, after the video decision", () => {
    const panel = read("src/app/components/grading-chat/GradingChatPanel.tsx");
    expect(panel.indexOf("submitLooseVideo(")).toBeLessThan(panel.indexOf("chooseSingleFileTransport(file)"));
    expect(panel).toContain("chooseZipTransport(file)");
    expect(panel).toContain("submitStoragedSingleFile(file, fileLabel)");
  });

  it("the driver handles storaged-file and the client leaf never imports the office extractor", () => {
    const driver = read("src/app/components/grading-chat/useContinuousGradingRun.ts");
    expect(driver).toContain('input.kind === "storaged-file"');
    expect(driver).toContain("prepareSingleFile(");
    const client = read("src/app/components/grading-chat/singleFileClient.ts");
    expect(client).toContain("/api/grade-submission-file");
    expect(client).not.toMatch(/office-extract|single-file-entry/);
  });
});
