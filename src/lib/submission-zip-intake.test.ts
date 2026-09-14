import { describe, it, expect } from "vitest";
import {
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_UNCOMPRESSED_BYTES,
  checkArchiveCaps,
  isUsableImageEntry,
  classifyEntries,
  decideZipIntake,
  describeZipIntakeDecision,
  type ArchiveEntryMeta,
} from "./submission-zip-intake";

function entry(name: string, uncompressedSize = 100, dir = false): ArchiveEntryMeta {
  return { name, dir, uncompressedSize };
}

describe("checkArchiveCaps", () => {
  it("empty input: no entries is ok", () => {
    expect(checkArchiveCaps([])).toEqual({ ok: true });
  });

  it("happy path: a normal handful of small entries is ok", () => {
    const entries = [entry("a.jpg", 1000), entry("b.png", 2000), entry("readme.txt", 50)];
    expect(checkArchiveCaps(entries)).toEqual({ ok: true });
  });

  it("boundary: exactly MAX_ARCHIVE_ENTRIES is ok, one more refuses", () => {
    const atLimit = Array.from({ length: MAX_ARCHIVE_ENTRIES }, (_, i) => entry(`f${i}.jpg`, 1));
    expect(checkArchiveCaps(atLimit)).toEqual({ ok: true });

    const overLimit = Array.from({ length: MAX_ARCHIVE_ENTRIES + 1 }, (_, i) => entry(`f${i}.jpg`, 1));
    expect(checkArchiveCaps(overLimit)).toEqual({
      ok: false,
      reason: "too-many-entries",
      entryCount: MAX_ARCHIVE_ENTRIES + 1,
      limit: MAX_ARCHIVE_ENTRIES,
    });
  });

  it("boundary: exactly MAX_ARCHIVE_UNCOMPRESSED_BYTES is ok, one more byte refuses", () => {
    const atLimit = [entry("a.jpg", MAX_ARCHIVE_UNCOMPRESSED_BYTES)];
    expect(checkArchiveCaps(atLimit)).toEqual({ ok: true });

    const overLimit = [entry("a.jpg", MAX_ARCHIVE_UNCOMPRESSED_BYTES + 1)];
    const result = checkArchiveCaps(overLimit);
    expect(result).toEqual({
      ok: false,
      reason: "too-large",
      uncompressedBytes: MAX_ARCHIVE_UNCOMPRESSED_BYTES + 1,
      limit: MAX_ARCHIVE_UNCOMPRESSED_BYTES,
    });
  });

  it("sums DECLARED sizes across entries, not just one entry's size (the zip-bomb shape)", () => {
    // Many small-looking entries whose declared sizes sum past the cap -
    // the hazard a zip bomb actually presents (a tiny archive on disk that
    // expands to something huge). This is the SABOTAGE CONTROL target: with
    // the `uncompressedBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES` check in
    // checkArchiveCaps removed, this assertion goes red because nothing else
    // in the function rejects a large summed total. Restoring the check
    // makes it pass again - verified by hand during implementation, not left
    // in the codebase as disabled code.
    const bigEntries = [
      entry("a.jpg", MAX_ARCHIVE_UNCOMPRESSED_BYTES),
      entry("b.jpg", 1),
    ];
    const result = checkArchiveCaps(bigEntries);
    expect(result.ok).toBe(false);
  });
});

describe("isUsableImageEntry", () => {
  it("empty input: an entry with no extension is not usable", () => {
    expect(isUsableImageEntry({ name: "README", dir: false })).toBe(false);
  });

  it("happy path: a .jpg file is usable", () => {
    expect(isUsableImageEntry({ name: "photo.jpg", dir: false })).toBe(true);
  });

  it("boundary: extension matching is case-insensitive, and directories are never usable even with an image-like name", () => {
    expect(isUsableImageEntry({ name: "PHOTO.JPG", dir: false })).toBe(true);
    expect(isUsableImageEntry({ name: "photo.jpg", dir: true })).toBe(false);
  });

  it("a document extension is not usable", () => {
    expect(isUsableImageEntry({ name: "essay.docx", dir: false })).toBe(false);
    expect(isUsableImageEntry({ name: "essay.pdf", dir: false })).toBe(false);
  });
});

describe("classifyEntries", () => {
  it("empty input: no entries yields no images and no ignored names", () => {
    expect(classifyEntries([])).toEqual({ images: [], ignoredNames: [] });
  });

  it("happy path: splits images from unusable files", () => {
    const entries = [entry("a.jpg"), entry("notes.pdf"), entry("b.png")];
    const { images, ignoredNames } = classifyEntries(entries);
    expect(images.map((e) => e.name)).toEqual(["a.jpg", "b.png"]);
    expect(ignoredNames).toEqual(["notes.pdf"]);
  });

  it("boundary: directory entries are excluded from both lists, not reported as ignored", () => {
    const entries = [entry("folder/", 0, true), entry("folder/a.jpg")];
    const { images, ignoredNames } = classifyEntries(entries);
    expect(images.map((e) => e.name)).toEqual(["folder/a.jpg"]);
    expect(ignoredNames).toEqual([]);
  });
});

describe("decideZipIntake", () => {
  it("empty input: no entries at all is reported as empty, not refused", () => {
    expect(decideZipIntake([], 12)).toEqual({ status: "empty", ignoredNames: [] });
  });

  it("happy path: images within budget are accepted and unusable entries are reported", () => {
    const entries = [entry("a.jpg"), entry("notes.pdf"), entry("b.png")];
    const decision = decideZipIntake(entries, 12);
    expect(decision.status).toBe("ok");
    if (decision.status === "ok") {
      expect(decision.images.map((e) => e.name)).toEqual(["a.jpg", "b.png"]);
      expect(decision.ignoredNames).toEqual(["notes.pdf"]);
    }
  });

  it("boundary: exactly remainingSlots images is accepted, one more is refused with both numbers", () => {
    const twoImages = [entry("a.jpg"), entry("b.jpg")];
    expect(decideZipIntake(twoImages, 2).status).toBe("ok");

    const threeImages = [entry("a.jpg"), entry("b.jpg"), entry("c.jpg")];
    const refused = decideZipIntake(threeImages, 2);
    expect(refused).toEqual({
      status: "refused-over-budget",
      archiveImageCount: 3,
      remainingSlots: 2,
      ignoredNames: [],
    });
  });

  it("an archive with only unusable entries is empty, not ok with zero images", () => {
    const entries = [entry("notes.pdf"), entry("essay.docx")];
    expect(decideZipIntake(entries, 12)).toEqual({
      status: "empty",
      ignoredNames: ["notes.pdf", "essay.docx"],
    });
  });

  it("caps are enforced before the budget check - an over-cap archive never reaches refused-over-budget", () => {
    const overLimit = Array.from({ length: MAX_ARCHIVE_ENTRIES + 1 }, (_, i) => entry(`f${i}.jpg`, 1));
    const decision = decideZipIntake(overLimit, 0);
    expect(decision.status).toBe("too-many-entries");
  });
});

describe("describeZipIntakeDecision", () => {
  it("empty input: an empty archive with nothing ignored reads plainly", () => {
    const text = describeZipIntakeDecision({ status: "empty", ignoredNames: [] }, "sub.zip");
    expect(text).toBe('"sub.zip" has no images in it.');
  });

  it("happy path: an accepted archive names the count", () => {
    const decision = decideZipIntake([entry("a.jpg"), entry("b.png")], 12);
    const text = describeZipIntakeDecision(decision, "sub.zip");
    expect(text).toContain("Added 2 image(s)");
    expect(text).toContain("sub.zip");
  });

  it("boundary: a refusal at the budget states BOTH numbers", () => {
    const decision = decideZipIntake([entry("a.jpg"), entry("b.jpg"), entry("c.jpg")], 2);
    const text = describeZipIntakeDecision(decision, "sub.zip");
    expect(text).toContain("3 image(s)");
    expect(text).toContain("2 submission slot(s)");
  });

  it("a too-large refusal names the archive as not read, distinctly from an empty archive", () => {
    const text = describeZipIntakeDecision(
      { status: "too-large", uncompressedBytes: 999, limit: 500 },
      "sub.zip"
    );
    expect(text).toContain("too large to read");
    expect(text).toContain("was not read");
  });
});
