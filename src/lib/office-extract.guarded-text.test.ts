import { expect, it } from "vitest";
import { extractTextFromBuffer } from "./office-extract";
import { isStaticProjectText } from "./grade/static-project-text";
import { getMimeType } from "./grade/constants";

it.each(["user", "recipe", "log", "command"])("reads valid %s text and rejects opaque bytes", async (extension) => {
  const name = `student.${extension}`;
  expect(await extractTextFromBuffer(name, Buffer.from("valid\r\ntext", "utf8"))).toBe("valid\r\ntext");
  await expect(extractTextFromBuffer(name, Buffer.from([0xff, 0xfe]))).rejects.toThrow();
  await expect(extractTextFromBuffer(name, Buffer.from([0x61, 0, 0x62]))).rejects.toThrow();
  expect(isStaticProjectText(extension)).toBe(true);
  expect(getMimeType(extension)).toBe("text/plain");
});
