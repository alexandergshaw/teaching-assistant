// Frozen oracle for isUnusableStudentName. The axes are literal tables, not
// derived from the generic-word set in the implementation. The hardest axis is
// the real-name negatives: matching is on the WHOLE token set, never a
// substring, so "Jordan Lee - reflection" must stay usable. The non-Latin rows
// are built with String.fromCodePoint so this source file stays pure ASCII; at
// runtime they are the real names (CJK, Cyrillic, Arabic), which must NOT be
// flagged just because they carry no Latin letters.
import { describe, it, expect } from "vitest";
import { isUnusableStudentName } from "./single-file-entry";

const liLei = String.fromCodePoint(0x674e, 0x96f7); // CJK given name
const vladimirPetrov =
  String.fromCodePoint(0x0412, 0x043b, 0x0430, 0x0434, 0x0438, 0x043c, 0x0438, 0x0440) +
  " " +
  String.fromCodePoint(0x041f, 0x0435, 0x0442, 0x0440, 0x043e, 0x0432); // Cyrillic
const muhammadAli =
  String.fromCodePoint(0x0645, 0x062d, 0x0645, 0x062f) +
  " " +
  String.fromCodePoint(0x0639, 0x0644, 0x064a); // Arabic

describe("isUnusableStudentName oracle", () => {
  it.each([
    "Jordan Lee",
    "Jordan Lee - reflection",
    "lee_jordan_essay",
    "Maria Garcia-Lopez",
    "smith",
    "Aiden O'Connor homework 3",
    "owner/repo",
    liLei,
    vladimirPetrov,
    `${liLei} - reflection`,
    muhammadAli,
  ])("keeps %j usable", (stem) => {
    expect(isUnusableStudentName(stem)).toBe(false);
  });

  it.each([
    "submission",
    "Document",
    "essay",
    "reflection",
    "Final Draft",
    "untitled",
    "Uploaded submission",
    "homework (2)",
    "scan_2",
    "IMG",
    "photo-3",
  ])("flags generic stem %j", (stem) => {
    expect(isUnusableStudentName(stem)).toBe(true);
  });

  it.each(["", "   ", "1048576", "2024-10-08", "12_34", "---"])("flags empty or numeric stem %j", (stem) => {
    expect(isUnusableStudentName(stem)).toBe(true);
  });

  it.each([
    "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    "3F2504E04F8911D39A0C0305E82C3301",
    "d41d8cd98f00b204e9800998ecf8427e",
  ])("flags uuid or hash stem %j", (stem) => {
    expect(isUnusableStudentName(stem)).toBe(true);
  });
});
