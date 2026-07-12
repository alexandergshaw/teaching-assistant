import { describe, it, expect } from "vitest";
import { parseCsvRows } from "./csv";

describe("parseCsvRows", () => {
  it("parses plain rows and columns", () => {
    expect(parseCsvRows("a,b,c\nd,e,f")).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    expect(parseCsvRows('1,"Loops, and more","He said ""hi"""')).toEqual([
      ["1", "Loops, and more", 'He said "hi"'],
    ]);
  });

  it("handles CRLF and LF row breaks", () => {
    expect(parseCsvRows("a,b\r\nc,d\ne,f")).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ]);
  });

  it("does not append a phantom row for a trailing newline", () => {
    expect(parseCsvRows("a,b\n")).toEqual([["a", "b"]]);
  });

  it("preserves newlines inside quoted fields", () => {
    expect(parseCsvRows('a,"line1\nline2"\nb,c')).toEqual([
      ["a", "line1\nline2"],
      ["b", "c"],
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseCsvRows("")).toEqual([]);
  });

  it("keeps empty cells", () => {
    expect(parseCsvRows("a,,c\n,,")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });
});
