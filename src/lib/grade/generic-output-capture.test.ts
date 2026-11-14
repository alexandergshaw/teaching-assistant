import { expect, it } from "vitest";
import { createGenericOutputCapture, isBoundedGenericOutput } from "./generic-output-capture";

it("bounds escaped control output by JSON bytes and marks it truncated", () => {
  const capture = createGenericOutputCapture();
  capture.stream.write(Buffer.from("\u0001".repeat(1000)));
  const result = capture.result();
  expect(Buffer.byteLength(JSON.stringify(result.text), "utf8")).toBeLessThanOrEqual(4000);
  expect(result.truncated).toBe(true);
  expect(isBoundedGenericOutput(result.text)).toBe(true);
  expect(isBoundedGenericOutput("\u0001".repeat(1000))).toBe(false);
});

it("replaces NUL that PostgreSQL cannot store and records incomplete output", () => {
  const capture = createGenericOutputCapture();
  capture.stream.write(Buffer.from("before\0after"));
  expect(capture.result()).toEqual({ text: "before\ufffdafter", truncated: true });
});

it("preserves multibyte characters split across chunks", () => {
  const capture = createGenericOutputCapture();
  const bytes = Buffer.from("résumé", "utf8");
  capture.stream.write(bytes.subarray(0, 2));
  capture.stream.write(bytes.subarray(2));
  expect(capture.result()).toEqual({ text: "résumé", truncated: false });
});
