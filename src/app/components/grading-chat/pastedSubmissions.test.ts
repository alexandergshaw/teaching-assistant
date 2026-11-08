import { describe, expect, it } from "vitest";
import { parsePastedSubmissions } from "./pastedSubmissions";

describe("parsePastedSubmissions", () => {
  it("recognizes explicit names while preserving the submission text", () => {
    expect(parsePastedSubmissions("Student: Ada\r\nFirst\r\n\r\nsecond\r\nName: Bob\r\nAnswer")).toEqual([
      { student: "Ada", content: "Student: Ada\nFirst\n\nsecond" }, { student: "Bob", content: "Name: Bob\nAnswer" },
    ]);
  });
  it("holds separator-delimited work for names rather than guessing identities", () => {
    expect(parsePastedSubmissions("first\n---\nsecond")).toEqual([{ student: "", content: "first" }, { student: "", content: "second" }]);
  });
  it("recognizes numbered explicit student headings without treating numbered prose as people", () => {
    expect(parsePastedSubmissions("1. Student: Ada Lovelace\nFirst answer\n2. Student: Grace Hopper\nSecond answer")).toEqual([{ student: "Ada Lovelace", content: "1. Student: Ada Lovelace\nFirst answer" }, { student: "Grace Hopper", content: "2. Student: Grace Hopper\nSecond answer" }]);
    expect(parsePastedSubmissions("1. Introduction\nEssay text\n2. Conclusion\nMore text")).toEqual([]);
  });
  it("does not silently drop preamble, split ordinary prose, or accept empty separators", () => {
    expect(parsePastedSubmissions("Intro\nStudent: Ada\nA\nStudent: Bob\nB")).toEqual([]);
    expect(parsePastedSubmissions("ordinary text")).toEqual([]);
    expect(parsePastedSubmissions("first\n---\n")).toEqual([]);
  });
});
