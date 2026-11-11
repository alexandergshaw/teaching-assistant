import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/components/grading-chat/PartialHandoffNotice.tsx", "utf8");

describe("partial archive notice presentation", () => {
  it("keeps record totals and statuses in a collapsed MUI disclosure", () => {
    expect(source).toContain('import { Accordion, AccordionDetails, AccordionSummary } from "@mui/material"');
    expect(source).toContain('(["pending", "accepted", "refused", "unknown"] as const)');
    expect(source).toContain('records.reduce((count, record) => count + record.omitted.length, 0)');
    expect(source).toContain('Earlier attempts remain saved.');
    expect(source).toContain('omitted group ${omittedCount === 1 ? "entry" : "entries"} across records');
    expect(source.match(/<span role="status">/g)).toHaveLength(2);
    expect(source).not.toContain('defaultExpanded');
    expect(source.indexOf('<AccordionDetails>')).toBeLessThan(source.indexOf('records.map((record)'));
    expect(source).toContain('group.files.join(", ")');
    expect(source).toContain('group.members.map((member) => member.path).join(", ")');
    expect(source).toContain('Older records remain saved.');
    expect(source).toContain('record.attemptId ?? "legacy"');
    expect(source).not.toContain('block overlapping submissions');
  });
});
