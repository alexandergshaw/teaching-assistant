import { describe, expect, it } from "vitest";
import { discussionRosterNames } from "./discussion-rosters";

describe("course discussion rosters", () => {
  it("extracts names from username-bearing rows", () => {
    const old = "Ada Lovelace | ada\nGrace Hopper | gh";
    expect(discussionRosterNames(old)).toEqual({ names: ["Ada Lovelace", "Grace Hopper"] });
  });
  it("refuses ambiguous source and duplicate names", () => {
    expect(discussionRosterNames("Alex\nＡＬＥＸ")).toHaveProperty("error");
    expect(discussionRosterNames("Name | one | two")).toHaveProperty("error");
  });
});
