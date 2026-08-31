import { describe, expect, it } from "vitest";
import { BUBBLE_SIZE_FRACTIONS, bubbleRect, coverCrop } from "./bubble-geometry";

describe("BUBBLE_SIZE_FRACTIONS", () => {
  it("pins the three size fractions to a frozen literal, not re-derived from the source", () => {
    // Deliberately hand-written, not imported from anywhere else - if this
    // drifts from the source constant the test is doing its job.
    expect(BUBBLE_SIZE_FRACTIONS).toEqual({ sm: 0.16, md: 0.22, lg: 0.30 });
  });
});

describe("coverCrop", () => {
  it("crops a 1280x720 (landscape) video to its centred square - AC10's worked example", () => {
    expect(coverCrop(1280, 720)).toEqual({ sx: 280, sy: 0, sSide: 720 });
  });

  it("crops a 720x1280 (portrait) video to its centred square - AC10's worked example", () => {
    expect(coverCrop(720, 1280)).toEqual({ sx: 0, sy: 280, sSide: 720 });
  });

  it("crops a square video to itself", () => {
    expect(coverCrop(500, 500)).toEqual({ sx: 0, sy: 0, sSide: 500 });
  });

  it("returns an all-zero crop for a zero width", () => {
    expect(coverCrop(0, 720)).toEqual({ sx: 0, sy: 0, sSide: 0 });
  });

  it("returns an all-zero crop for a zero height", () => {
    expect(coverCrop(1280, 0)).toEqual({ sx: 0, sy: 0, sSide: 0 });
  });

  it("returns an all-zero crop for a NaN width", () => {
    expect(coverCrop(NaN, 720)).toEqual({ sx: 0, sy: 0, sSide: 0 });
  });

  it("returns an all-zero crop for a NaN height", () => {
    expect(coverCrop(1280, NaN)).toEqual({ sx: 0, sy: 0, sSide: 0 });
  });

  it("returns an all-zero crop for an Infinity dimension", () => {
    expect(coverCrop(Infinity, 720)).toEqual({ sx: 0, sy: 0, sSide: 0 });
  });

  it("returns an all-zero crop for a negative dimension", () => {
    expect(coverCrop(1280, -10)).toEqual({ sx: 0, sy: 0, sSide: 0 });
  });
});

describe("bubbleRect", () => {
  // 1280x720 canvas, "md" (0.22) size fraction: size = round(1280*0.22) = 282,
  // margin = round(1280*0.02) = 26. Hand-computed, not re-derived from the
  // implementation.
  const canvasW = 1280;
  const canvasH = 720;
  const sizeFraction = BUBBLE_SIZE_FRACTIONS.md;

  it("places the bubble in the bottom-right corner", () => {
    expect(bubbleRect(canvasW, canvasH, "br", sizeFraction)).toEqual({ x: 972, y: 412, size: 282 });
  });

  it("places the bubble in the bottom-left corner", () => {
    expect(bubbleRect(canvasW, canvasH, "bl", sizeFraction)).toEqual({ x: 26, y: 412, size: 282 });
  });

  it("places the bubble in the top-right corner", () => {
    expect(bubbleRect(canvasW, canvasH, "tr", sizeFraction)).toEqual({ x: 972, y: 26, size: 282 });
  });

  it("places the bubble in the top-left corner", () => {
    expect(bubbleRect(canvasW, canvasH, "tl", sizeFraction)).toEqual({ x: 26, y: 26, size: 282 });
  });

  it("returns an all-zero rect for a zero canvas width", () => {
    expect(bubbleRect(0, canvasH, "br", sizeFraction)).toEqual({ x: 0, y: 0, size: 0 });
  });

  it("returns an all-zero rect for a NaN canvas height", () => {
    expect(bubbleRect(canvasW, NaN, "br", sizeFraction)).toEqual({ x: 0, y: 0, size: 0 });
  });

  it("returns an all-zero rect for a non-positive size fraction", () => {
    expect(bubbleRect(canvasW, canvasH, "br", 0)).toEqual({ x: 0, y: 0, size: 0 });
  });
});
