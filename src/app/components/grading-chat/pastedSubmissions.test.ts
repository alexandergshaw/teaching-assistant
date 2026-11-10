import { describe, expect, it } from "vitest";
import { parsePastedSubmissions } from "./pastedSubmissions";

describe("parsePastedSubmissions", () => {
  it("recognizes explicit names while preserving the submission text", () => {
    expect(parsePastedSubmissions("Student: Ada\r\nFirst\r\n\r\nsecond\r\nName: Bob\r\nAnswer")).toEqual([
      { student: "Ada", content: "Student: Ada\nFirst\n\nsecond" }, { student: "Bob", content: "Name: Bob\nAnswer" },
    ]);
  });
  it("preserves explicit and separator modes even when their prose mentions unread replies", () => {
    expect(parsePastedSubmissions("Student: Ada\nUnread replies are important\nStudent: Bob\nAnswer")).toEqual([{ student: "Ada", content: "Student: Ada\nUnread replies are important" }, { student: "Bob", content: "Student: Bob\nAnswer" }]);
    expect(parsePastedSubmissions("Discussion with unread replies\n---\nAnother response")).toEqual([{ student: "", content: "Discussion with unread replies\n---" }, { student: "", content: "\nAnother response" }]);
    expect(parsePastedSubmissions("Student: Ada\nMy friend Bob posted Sep 4\nStudent: Grace\nAnswer")).toEqual([{ student: "Ada", content: "Student: Ada\nMy friend Bob posted Sep 4" }, { student: "Grace", content: "Student: Grace\nAnswer" }]);
  });
  it("holds separator-delimited work for names rather than guessing identities", () => {
    expect(parsePastedSubmissions("first\n---\nsecond")).toEqual([{ student: "", content: "first\n---" }, { student: "", content: "\nsecond" }]);
  });
  it("recognizes numbered explicit student headings without treating numbered prose as people", () => {
    expect(parsePastedSubmissions("1. Student: Ada Lovelace\nFirst answer\n2. Student: Grace Hopper\nSecond answer")).toEqual([{ student: "Ada Lovelace", content: "1. Student: Ada Lovelace\nFirst answer" }, { student: "Grace Hopper", content: "2. Student: Grace Hopper\nSecond answer" }]);
    expect(parsePastedSubmissions("1. Introduction\nEssay text\n2. Conclusion\nMore text")).toEqual([]);
  });
  it("does not silently drop preamble, split ordinary prose, or accept empty separators", () => {
    expect(parsePastedSubmissions("Intro\nStudent: Ada\nA\nStudent: Bob\nB")).toEqual([{ student: "", content: "Intro" }, { student: "Ada", content: "Student: Ada\nA" }, { student: "Bob", content: "Student: Bob\nB" }]);
    expect(parsePastedSubmissions("ordinary text")).toEqual([]);
    expect(parsePastedSubmissions("first\n---\n")).toEqual([]);
  });
  it("keeps a single explicit student and arbitrary code or prose for review", () => {
    const text = "Student: Ada\n```js\nconst value = 42;\n```\nA reply about unread messages.";
    expect(parsePastedSubmissions(text)).toEqual([{ student: "Ada", content: text }]);
  });
  it("preserves preamble and duplicate headings as separate review rows", () => {
    expect(parsePastedSubmissions("Instructions\nName: Alex\nFirst\nName: Alex\nSecond")).toEqual([
      { student: "", content: "Instructions" }, { student: "Alex", content: "Name: Alex\nFirst" }, { student: "Alex", content: "Name: Alex\nSecond" },
    ]);
  });
  it("recognizes dated discussion authors and retains every unassigned and metadata line for review", () => {
    const text = "Week 4 Discussion\nUnread posts\nAda Lovelace posted Sep 3, 2026 10:32 AM\nFirst paragraph.\n\nSecond paragraph.\n2 replies\nLast post by Grace Hopper\nGrace Hopper\nPosted Sep 4, 2026 9:10 AM\nMy response.";
    expect(parsePastedSubmissions(text)).toEqual([
      { student: "", content: "Week 4 Discussion\nUnread posts" },
      { student: "Ada Lovelace", content: "Ada Lovelace posted Sep 3, 2026 10:32 AM\nFirst paragraph.\n\nSecond paragraph.\n2 replies\nLast post by Grace Hopper" },
      { student: "Grace Hopper", content: "Grace Hopper\nPosted Sep 4, 2026 9:10 AM\nMy response." },
    ]);
  });
  it("holds an unrecognized board as an unnamed review row instead of attributing it to one student", () => {
    const text = "Discussion board\nUnread post\nA partial entry without a date";
    expect(parsePastedSubmissions(text)).toEqual([{ student: "", content: text }]);
  });
  it("does not infer a last-reply author or split ordinary dated prose without a valid author", () => {
    const text = "Discussion\nLast reply posted Sep 3, 2026 3:00 PM\nUnread replies";
    expect(parsePastedSubmissions(text)).toEqual([{ student: "", content: text }]);
  });
  it("holds Canvas-style author and short timestamp entries for review", () => {
    const text = "Discussion\nJordan Example\nSep 6 at 10pm\nFirst response\nReply\nTaylor Example\nSep 7 at 9:30am\nA response to a classmate";
    expect(parsePastedSubmissions(text)).toEqual([
      { student: "", content: "Discussion" },
      { student: "Jordan Example", content: "Jordan Example\nSep 6 at 10pm\nFirst response\nReply" },
      { student: "Taylor Example", content: "Taylor Example\nSep 7 at 9:30am\nA response to a classmate" },
    ]);
  });
  it("holds a single Canvas-style timestamp as an inferred author requiring review", () => {
    expect(parsePastedSubmissions("Jordan Example\nSep 6, 2026 at 10pm\nSummary")).toEqual([{ student: "Jordan Example", content: "Jordan Example\nSep 6, 2026 at 10pm\nSummary" }]);
  });
  it("recognizes copied Canvas nested entries with duplicate names and two dates without losing controls", () => {
    const text = "Collapse Subdiscussion\nJordan Example\nJordan Example\nSep 6, 2026\nSep 6 at 10pm\nManage Discussion Entry\n\nFirst synthetic response\nCollapse Subdiscussion\nTaylor Example\nTaylor Example\nSep 7, 2026\nSep 7 at 9:30am\nManage Discussion Entry\n\nNested synthetic reply";
    const rows = parsePastedSubmissions(text);
    expect(rows.map((row) => row.student)).toEqual(["", "Jordan Example", "Taylor Example"]);
    expect(rows.map((row) => row.content).join("\n")).toBe(text);
  });
  it("keeps same-name posts separate until an instructor confirms they are the same student", () => {
    const text = "Alex Kim posted 10/1/2026\nInitial\nAlex Kim posted 10/2/2026\nReply";
    expect(parsePastedSubmissions(text)).toEqual([{ student: "Alex Kim", content: "Alex Kim posted 10/1/2026\nInitial" }, { student: "Alex Kim", content: "Alex Kim posted 10/2/2026\nReply" }]);
  });
});
