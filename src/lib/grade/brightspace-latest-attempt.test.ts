import { expect, it } from "vitest";
import { latestBrightspaceAttempt } from "./brightspace-latest-attempt";

it("holds files with different upload times instead of treating them as separate attempts", () => {
  const old = "1-2 - Student-Nov 5, 2026 735 PM", latest = "1-2 - Student-Nov 15, 2026 735 PM";
  expect(latestBrightspaceAttempt([`${old}.zip`, `${latest}.zip`, `${latest}.docx`], [{ stem: old, submitted: "Nov 5, 2026 735 PM" }, { stem: latest, submitted: "Nov 15, 2026 735 PM" }])).toBeNull();
});

it("holds a project and companion uploaded four minutes apart", () => {
  const project = "1-2 - Student-Nov 12, 2026 703 PM", document = "1-2 - Student-Nov 12, 2026 707 PM";
  expect(latestBrightspaceAttempt([`${project}.zip`, `${document}.docx`], [{ stem: project, submitted: "Nov 12, 2026 703 PM" }, { stem: document, submitted: "Nov 12, 2026 707 PM" }])).toBeNull();
});

it("fails closed on unmatched files, conflicting rows and invalid dates", () => {
  expect(latestBrightspaceAttempt(["1-2 - work.zip"], [{ stem: "1-2 - other", submitted: "Nov 5, 2026 735 PM" }])).toBeNull();
  expect(latestBrightspaceAttempt(["1-2 - work.zip"], [{ stem: "1-2 - work", submitted: "Nov 5, 2026 735 PM" }, { stem: "1-2 - work", submitted: "Nov 6, 2026 735 PM" }])).toBeNull();
  expect(latestBrightspaceAttempt(["1-2 - work.zip"], [{ stem: "1-2 - work", submitted: "Feb 30, 2026 735 PM" }])).toBeNull();
});
