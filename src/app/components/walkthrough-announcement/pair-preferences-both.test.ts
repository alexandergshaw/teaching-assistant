import { expect, it } from "vitest";
import { makeSlot } from "./announcement-draft-slots";
import { slotsForBothTemplate } from "./pair-preferences";

it("only offers the both shortcut when neither announcement has a selected format or draft", () => {
  const first = makeSlot("wta-slot-1", { kind: "unresolved" }, "beginning-of-week");
  const second = makeSlot("wta-slot-2", { kind: "unresolved" }, "midweek");
  expect(slotsForBothTemplate([first, second])).toEqual(["wta-slot-1", "wta-slot-2"]);
  expect(slotsForBothTemplate([first, { ...second, choice: { kind: "none" } }])).toEqual([]);
  expect(slotsForBothTemplate([first, { ...second, draft: { phase: "drafting", restore: null } }])).toEqual([]);
  expect(slotsForBothTemplate([first])).toEqual([]);
});
