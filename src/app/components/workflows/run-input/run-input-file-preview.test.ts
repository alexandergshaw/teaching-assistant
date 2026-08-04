import { describe, it, expect } from "vitest";
import { isTextLikeSubmissionFile, decodeSubmissionFileText } from "./run-input-file-preview";

describe("isTextLikeSubmissionFile", () => {
  it("treats any text/* mimeType as text-like regardless of extension", () => {
    expect(isTextLikeSubmissionFile("photo.bin", "text/plain")).toBe(true);
  });

  it("treats a recognized source-code extension as text-like even with a generic mimeType", () => {
    expect(isTextLikeSubmissionFile("main.py", "application/octet-stream")).toBe(true);
  });

  it("is case-insensitive about the extension", () => {
    expect(isTextLikeSubmissionFile("Main.PY", "application/octet-stream")).toBe(true);
  });

  it("treats an unrecognized extension with a non-text mimeType as binary", () => {
    expect(isTextLikeSubmissionFile("photo.png", "image/png")).toBe(false);
  });

  it("treats a file with no extension and a non-text mimeType as binary", () => {
    expect(isTextLikeSubmissionFile("Makefile-ish", "application/octet-stream")).toBe(false);
  });
});

describe("decodeSubmissionFileText", () => {
  it("decodes a valid base64 payload back to its original text", () => {
    const original = "hello world";
    const base64 = Buffer.from(original, "utf-8").toString("base64");
    expect(decodeSubmissionFileText(base64)).toBe(original);
  });

  it("falls back to a fixed error string for an undecodable payload", () => {
    expect(decodeSubmissionFileText("!!!not-base64!!!")).toBe("(Error decoding file)");
  });

  it("truncates text longer than 20000 characters and appends a truncation marker", () => {
    const long = "a".repeat(20001);
    const base64 = Buffer.from(long, "utf-8").toString("base64");
    const result = decodeSubmissionFileText(base64);
    expect(result.startsWith("a".repeat(20000))).toBe(true);
    expect(result.endsWith("\n... (truncated)")).toBe(true);
    expect(result.length).toBe(20000 + "\n... (truncated)".length);
  });

  it("does not truncate text at exactly 20000 characters", () => {
    const exact = "b".repeat(20000);
    const base64 = Buffer.from(exact, "utf-8").toString("base64");
    expect(decodeSubmissionFileText(base64)).toBe(exact);
  });
});
