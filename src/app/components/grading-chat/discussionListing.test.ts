import { describe, expect, it } from "vitest";
import { hasDiscussionResponseContent, parseDiscussionListing } from "./discussionListing";

const visible = (value: string) => value.replace(/\s/g, "");

describe("pasted discussion listings", () => {
  it.each([
    ["month date", "Ada Chen posted October 3, 2026 7:00 PM\nFirst answer\nGrace Vale posted October 4, 2026 9:00 AM\nSecond answer"],
    ["numeric date", "Ada Chen posted 10/3/2026\nFirst\nGrace Vale posted 2026-10-04\nSecond"],
    ["separate author and timestamp", "Ada Chen\nPosted Sep 3, 2026\nFirst\nGrace Vale\nPosted Sep 4, 2026\nSecond"],
    ["international names", "Marie-Claire D'Angelo posted Sep 3, 2026\nFirst\nJosé Núñez posted Sep 4, 2026\nSecond"],
    ["duplicate names", "Alex Kim posted 10/1/2026\nInitial\nAlex Kim posted 10/2/2026\nReply"],
    ["page furniture and replies", "Week 2 discussion\nUnread posts\nAda Chen posted Sep 3, 2026\nFirst\n\nSecond paragraph\n3 replies\nLast reply by Grace Vale\nGrace Vale posted Sep 4, 2026\nReply\nView profile"],
    ["malformed partial listing", "Discussion topic\nUnread post\nName without a timestamp\nBody remains here"],
    ["attachment and cut-off marker", "Discussion\nAda Chen posted Sep 3, 2026\nSee attached file\nRead more\nGrace Vale posted Sep 4, 2026\nVisible part only"],
    ["quoted headings", "Discussion\nAda Chen posted Sep 3, 2026\nName: this is quoted text\n---\nGrace Vale posted Sep 4, 2026\nAnswer"],
  ])("keeps all non-whitespace source text for review: %s", (_label, input) => {
    const result = parseDiscussionListing(input);
    expect(result.detected).toBe(true);
    expect(visible(result.rows.map((row) => row.content).join("\n"))).toBe(visible(input));
  });

  it("does not promote last-reply or profile metadata into student identities", () => {
    const result = parseDiscussionListing("Discussion\nAda Chen posted Sep 3, 2026\nAnswer\nLast reply posted Sep 4, 2026\nProfile\nPosted Sep 5, 2026\nMore");
    expect(result.rows.map((row) => row.student)).toEqual(["", "Ada Chen"]);
  });

  it("leaves ambiguous and missing-date records unassigned instead of making up authors", () => {
    const input = "Discussion\nUnread post\nTaylor\nPosted recently\nResponse";
    expect(parseDiscussionListing(input)).toEqual({ detected: true, rows: [{ student: "", content: input }] });
  });
  it("does not count several combined date headers and controls as a response", () => {
    expect(hasDiscussionResponseContent("Ada Chen posted Sep 3, 2026\n2 replies\n\n---\n\nAda Chen posted Sep 4, 2026\nView profile")).toBe(false);
    expect(hasDiscussionResponseContent("Ada Chen posted Sep 3, 2026\nWeek 4 Discussion")).toBe(false);
    expect(hasDiscussionResponseContent("Ada Chen posted Sep 3, 2026\nMy answer\n2 replies")).toBe(true);
  });

  it("does not interpret ordinary prose or a plain heading as a listing", () => {
    expect(parseDiscussionListing("The discussion of algorithms is interesting.\nA second paragraph follows.")).toEqual({ detected: false, rows: [] });
    expect(parseDiscussionListing("Student: Ada\nFirst response\nStudent: Grace\nSecond response")).toEqual({ detected: false, rows: [] });
  });
});

describe("Canvas copied metadata", () => {
  it("does not treat repeated names, dates and controls as response text", () => {
    expect(hasDiscussionResponseContent("Jordan Example\nJordan Example\nSep 6, 2026\nSep 6 at 10pm\nManage Discussion Entry")).toBe(false);
    expect(hasDiscussionResponseContent("Jordan Example\nJordan Example\nSep 6, 2026\nSep 6 at 10pm\nManage Discussion Entry\nReal synthetic reply")).toBe(true);
  });
});