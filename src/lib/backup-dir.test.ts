import { describe, expect, it } from "vitest";
import { listBackupVideos, readBackupFile, type DirHandle } from "./backup-dir";

// Minimal stand-ins for the File System Access API, which does not exist in
// the node test environment. Only the surface backup-dir.ts touches is faked.
interface FakeFileInit {
  name: string;
  size: number;
  lastModified: number;
}

function makeFakeDir(files: FakeFileInit[], opts?: { permission?: string; grantOnRequest?: boolean; dirs?: string[] }) {
  const permission = opts?.permission ?? "granted";
  const entries = [
    ...files.map((f) => ({
      kind: "file" as const,
      name: f.name,
      getFile: async () => ({ name: f.name, size: f.size, lastModified: f.lastModified }),
    })),
    ...(opts?.dirs ?? []).map((name) => ({ kind: "directory" as const, name })),
  ];
  return {
    queryPermission: async () => permission,
    requestPermission: async () => (opts?.grantOnRequest ? "granted" : permission),
    values: () => ({
      async *[Symbol.asyncIterator]() {
        for (const e of entries) yield e;
      },
    }),
    getFileHandle: async (name: string) => {
      const found = entries.find((e) => e.kind === "file" && e.name === name);
      if (!found || found.kind !== "file") throw new DOMException("not found", "NotFoundError");
      return found;
    },
  } as unknown as DirHandle;
}

describe("listBackupVideos", () => {
  it("returns only video files, newest first", async () => {
    const dir = makeFakeDir(
      [
        { name: "old-take.webm", size: 100, lastModified: 1000 },
        { name: "notes.txt", size: 5, lastModified: 5000 },
        { name: "new-take.mp4", size: 200, lastModified: 3000 },
        { name: "clip.MOV", size: 300, lastModified: 2000 },
      ],
      { dirs: ["subfolder"] }
    );
    const videos = await listBackupVideos(dir);
    expect(videos.map((v) => v.name)).toEqual(["new-take.mp4", "clip.MOV", "old-take.webm"]);
    expect(videos[0]).toEqual({ name: "new-take.mp4", sizeBytes: 200, lastModified: 3000 });
  });

  it("requests permission when not yet granted and proceeds on grant", async () => {
    const dir = makeFakeDir([{ name: "a.webm", size: 1, lastModified: 1 }], {
      permission: "prompt",
      grantOnRequest: true,
    });
    const videos = await listBackupVideos(dir);
    expect(videos).toHaveLength(1);
  });

  it("throws a friendly error when permission is denied", async () => {
    const dir = makeFakeDir([{ name: "a.webm", size: 1, lastModified: 1 }], { permission: "denied" });
    await expect(listBackupVideos(dir)).rejects.toThrow("Backup folder permission was not granted.");
  });
});

describe("readBackupFile", () => {
  it("returns the file for a known name", async () => {
    const dir = makeFakeDir([{ name: "take.mp4", size: 42, lastModified: 9 }]);
    const file = await readBackupFile(dir, "take.mp4");
    expect(file.name).toBe("take.mp4");
    expect(file.size).toBe(42);
  });

  it("rejects for a missing name", async () => {
    const dir = makeFakeDir([]);
    await expect(readBackupFile(dir, "gone.mp4")).rejects.toThrow();
  });
});
