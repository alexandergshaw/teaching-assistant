import { describe, it, expect } from "vitest";
import { normalizePptxTheme, PptxTheme } from "./pptx";

describe("normalizePptxTheme", () => {
  it("returns undefined when input is undefined", () => {
    const result = normalizePptxTheme(undefined);
    expect(result).toBeUndefined();
  });

  it("returns undefined when backgroundKind is classic", () => {
    const theme: PptxTheme = {
      backgroundKind: "classic",
      backgroundColor: "#1a2744",
      fontColor: "#ffffff",
    };
    const result = normalizePptxTheme(theme);
    expect(result).toBeUndefined();
  });

  it("returns theme unchanged when backgroundKind is solid", () => {
    const theme: PptxTheme = {
      backgroundKind: "solid",
      backgroundColor: "#ffffff",
      fontColor: "#000000",
    };
    const result = normalizePptxTheme(theme);
    expect(result).toEqual(theme);
  });

  it("returns theme unchanged when backgroundKind is gradient", () => {
    const theme: PptxTheme = {
      backgroundKind: "gradient",
      backgroundColor: "#ff0000",
      backgroundColor2: "#0000ff",
      fontColor: "#ffffff",
    };
    const result = normalizePptxTheme(theme);
    expect(result).toEqual(theme);
  });
});
