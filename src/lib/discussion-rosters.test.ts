import { describe, expect, it } from "vitest";
import { discussionRosterNames, prepareDiscussionRoster } from "./discussion-rosters";

describe("course discussion rosters", () => {
  it("extracts names while retaining username rows verbatim on save", () => {
    const old = "Ada Lovelace | ada\nGrace Hopper | gh";
    expect(discussionRosterNames(old)).toEqual({ names: ["Ada Lovelace", "Grace Hopper"] });
    expect(prepareDiscussionRoster(old, ["Grace Hopper", "Ada Lovelace", "New Student"])).toEqual({ roster: "Grace Hopper | gh\nAda Lovelace | ada\nNew Student" });
  });
  it("refuses ambiguous source, duplicate names and edits that drop username data", () => {
    expect(discussionRosterNames("Alex\nＡＬＥＸ")).toHaveProperty("error");
    expect(discussionRosterNames("Name | one | two")).toHaveProperty("error");
    expect(prepareDiscussionRoster("Ada | ada", [])).toHaveProperty("error");
    expect(prepareDiscussionRoster("Ada | ada", ["ADA"])).toHaveProperty("error");
    expect(prepareDiscussionRoster(null, ["Ada", "ＡＤＡ"])).toHaveProperty("error");
  });
  it("rejects line or delimiter injection and allows an empty unlinked roster", () => {
    expect(prepareDiscussionRoster(null, ["Ada\nGrace"])).toHaveProperty("error");
    expect(prepareDiscussionRoster(null, ["Ada | user"])).toHaveProperty("error");
    expect(prepareDiscussionRoster("Ada", [])).toEqual({ roster: "" });
  });
});
