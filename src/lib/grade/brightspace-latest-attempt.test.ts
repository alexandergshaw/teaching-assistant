import { expect, it } from "vitest";
import { latestBrightspaceAttempt } from "./brightspace-latest-attempt";

it("groups files sharing the newest indexed attempt and retains older paths", () => {
  const old = "1-2 - Student-Nov 5, 2026 735 PM", latest = "1-2 - Student-Nov 15, 2026 735 PM";
  expect(latestBrightspaceAttempt([`${old}.zip`, `${latest}.zip`, `${latest}.docx`], [{ stem: old, submitted: "Nov 5, 2026 735 PM" }, { stem: latest, submitted: "Nov 15, 2026 735 PM" }])).toEqual({ latest: [`${latest}.zip`, `${latest}.docx`], earlier: [`${old}.zip`] });
});

it("fails closed on unmatched files, conflicting rows and invalid dates", () => {
  expect(latestBrightspaceAttempt(["1-2 - work.zip"], [{ stem: "1-2 - other", submitted: "Nov 5, 2026 735 PM" }])).toBeNull();
  expect(latestBrightspaceAttempt(["1-2 - work.zip"], [{ stem: "1-2 - work", submitted: "Nov 5, 2026 735 PM" }, { stem: "1-2 - work", submitted: "Nov 6, 2026 735 PM" }])).toBeNull();
  expect(latestBrightspaceAttempt(["1-2 - work.zip"], [{ stem: "1-2 - work", submitted: "Feb 30, 2026 735 PM" }])).toBeNull();
});
