import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadSourceRecording } from "./source-recording-download";

const dispatch = vi.hoisted(() => vi.fn());
vi.mock("../course-planning/utils", () => ({ triggerFileDownload: dispatch }));

afterEach(() => {
  vi.unstubAllGlobals();
  dispatch.mockReset();
});

describe("downloadSourceRecording", () => {
  it("dispatches the selected recording bytes with a usable name and media type", async () => {
    const bytes = new Uint8Array([7, 13, 42]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob([bytes], { type: "video/mp4" })));
    vi.stubGlobal("fetch", fetchMock);
    await downloadSourceRecording({ url: "blob:selected", name: "Week 2.mp4", mimeType: "video/mp4" });
    expect(fetchMock).toHaveBeenCalledWith("blob:selected");
    const [blob, name] = dispatch.mock.calls[0] as [Blob, string];
    expect(name).toBe("Week 2.mp4");
    expect(blob.type).toBe("video/mp4");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });

  it("retains the selected take media type when the response omits one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob(["audio"]))) );
    await downloadSourceRecording({ url: "blob:audio", name: "Lecture", mimeType: "audio/mpeg" });
    expect(dispatch.mock.calls[0][0].type).toBe("audio/mpeg");
    expect(dispatch.mock.calls[0][1]).toBe("Lecture.mp3");
  });

  it("uses the known take type over a generic response and does not guess unknown media as webm", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(new Blob(["source"], { type: "application/octet-stream" }))));
    await downloadSourceRecording({ url: "blob:mp4", name: "Lecture", mimeType: "video/mp4" });
    expect(dispatch.mock.calls[0][0].type).toBe("video/mp4");
    expect(dispatch.mock.calls[0][1]).toBe("Lecture.mp4");
    await downloadSourceRecording({ url: "blob:unknown", name: "Unknown", mimeType: "" });
    expect(dispatch.mock.calls[1][0].type).toBe("application/octet-stream");
    expect(dispatch.mock.calls[1][1]).toBe("Unknown.bin");
  });

  it("reports missing, failed, and empty recordings without dispatching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(downloadSourceRecording({ url: "", name: "x", mimeType: "video/webm" })).rejects.toThrow("no longer available");
    fetchMock.mockRejectedValueOnce(new Error("private storage details"));
    await expect(downloadSourceRecording({ url: "blob:x", name: "x", mimeType: "video/webm" })).rejects.toThrow("Please try again");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(downloadSourceRecording({ url: "blob:x", name: "x", mimeType: "video/webm" })).rejects.toThrow("Please try again");
    fetchMock.mockResolvedValueOnce(new Response(new Blob([])));
    await expect(downloadSourceRecording({ url: "blob:x", name: "x", mimeType: "video/webm" })).rejects.toThrow("empty or unavailable");
    expect(dispatch).not.toHaveBeenCalled();
  });
});
