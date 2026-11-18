import { expect, it } from "vitest";
import { instructorHoldReason } from "./instructorHoldReason";
const reason = "This submission could not be graded: The notebook references data/soc_alert_data.csv, which was not found in the inspected repository snapshot. It may be generated or supplied separately; review the data before grading. No score was assigned.";
it("shows the curated missing-data path", () => expect(instructorHoldReason(reason)).toContain("data/soc_alert_data.csv"));
it.each(["HTTP 500 provider secret token", reason + " secret", reason.replace("data/soc_alert_data.csv", "data/../secret.csv"), reason.replace("data/soc_alert_data.csv", `data/${"x".repeat(513)}.csv`)])("hides untrusted failure text", (message) => {
  expect(instructorHoldReason(message)).toBe("Grading could not be completed. Review the submission and retry.");
});
