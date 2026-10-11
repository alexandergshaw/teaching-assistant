// T1 (ops section 11): table-driven magic-byte verdicts. RED on a false accept
// AND on a false reject.
import { describe, it, expect } from "vitest";
import { sniffVideoContainer, VIDEO_HEAD_BYTES } from "./video-magic";

function bytes(...parts: Array<string | number[]>): Uint8Array {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === "string") for (const ch of part) out.push(ch.charCodeAt(0));
    else out.push(...part);
  }
  while (out.length < VIDEO_HEAD_BYTES) out.push(0);
  return Uint8Array.from(out);
}

/** An ISO BMFF head: size (big-endian uint32), "ftyp", major brand, padding. */
function ftyp(brand: string, size = 24, offset = 4): Uint8Array {
  const head = new Array<number>(VIDEO_HEAD_BYTES).fill(0);
  head[0] = Math.floor(size / 16777216) % 256;
  head[1] = Math.floor(size / 65536) % 256;
  head[2] = Math.floor(size / 256) % 256;
  head[3] = size % 256;
  const tag = "ftyp" + brand;
  for (let i = 0; i < tag.length; i += 1) head[offset + i] = tag.charCodeAt(i);
  return Uint8Array.from(head);
}

const EBML = [0x1a, 0x45, 0xdf, 0xa3];

describe("sniffVideoContainer - accepted", () => {
  const mp4Brands = [
    "isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "mp71",
    "avc1", "dash", "msdn", "M4V ", "M4VH", "M4VP",
  ];
  for (const brand of mp4Brands) {
    it(`accepts ftyp brand "${brand}" as video/mp4`, () => {
      expect(sniffVideoContainer(ftyp(brand))).toEqual({ ok: true, container: "mp4", mimeType: "video/mp4" });
    });
  }

  it('accepts brand "qt  " as video/quicktime (MIME from bytes, not the .mp4 name)', () => {
    expect(sniffVideoContainer(ftyp("qt  "), "mp4")).toEqual({
      ok: true,
      container: "quicktime",
      mimeType: "video/quicktime",
    });
  });

  it("accepts the largesize form (box size 1)", () => {
    expect(sniffVideoContainer(ftyp("isom", 1)).ok).toBe(true);
  });

  it("accepts a WebM EBML header with DocType webm", () => {
    expect(sniffVideoContainer(bytes(EBML, [0x42, 0x82, 0x84], "webm"))).toEqual({
      ok: true,
      container: "webm",
      mimeType: "video/webm",
    });
  });

  it("accepts a ftyp-less QuickTime only for a .mov extension", () => {
    const head = bytes([0, 0, 0, 8], "wide");
    expect(sniffVideoContainer(head, "mov")).toEqual({ ok: true, container: "quicktime", mimeType: "video/quicktime" });
    expect(sniffVideoContainer(head, "mp4")).toEqual({ ok: false });
    expect(sniffVideoContainer(head)).toEqual({ ok: false });
  });
});

describe("sniffVideoContainer - hostile and wrong inputs", () => {
  const rejected: Array<readonly [string, Uint8Array, string?]> = [
    ["a zip renamed .mp4", bytes([0x50, 0x4b, 0x03, 0x04]), "mp4"],
    ["a PNG", bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["a JPEG", bytes([0xff, 0xd8, 0xff, 0xe0])],
    ["html (doctype)", bytes("<!DOCTYPE html>")],
    ["html (tag)", bytes("<html><body>")],
    ["ftyp at offset 0 instead of 4", ftyp("isom", 24, 0)],
    ["a heic image (brand heic)", ftyp("heic")],
    ["a heix image", ftyp("heix")],
    ["an avif image", ftyp("avif")],
    ["audio-only M4A", ftyp("M4A ")],
    ["audio-only M4B", ftyp("M4B ")],
    ["mif1 image", ftyp("mif1")],
    ["box size under 16", ftyp("isom", 15)],
    ["box size over 4096", ftyp("isom", 4097)],
    ["matroska DocType (an mkv)", bytes(EBML, [0x42, 0x82, 0x88], "matroska")],
    ["EBML with no DocType", bytes(EBML)],
  ];
  for (const [label, head, extension] of rejected) {
    it(`rejects ${label}`, () => {
      expect(sniffVideoContainer(head, extension)).toEqual({ ok: false });
    });
  }

  it("rejects empty input and input shorter than 12 bytes", () => {
    expect(sniffVideoContainer(new Uint8Array(0))).toEqual({ ok: false });
    expect(sniffVideoContainer(Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), "mp4")).toEqual({ ok: false });
  });

  it("the extension alone never decides the container", () => {
    expect(sniffVideoContainer(bytes("not a video at all"), "mp4")).toEqual({ ok: false });
    expect(sniffVideoContainer(bytes("not a video at all"), "webm")).toEqual({ ok: false });
    expect(sniffVideoContainer(bytes("not a video at all"), "mov")).toEqual({ ok: false });
  });
});
