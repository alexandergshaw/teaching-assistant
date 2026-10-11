import { describe, expect, it } from "vitest";
import { isSetupCollapsed, type SetupCollapseInput } from "./walkthrough-setup-collapse";

interface Row {
  readonly input: SetupCollapseInput;
  readonly collapsed: boolean;
}

const rows: readonly Row[] = [
  { input: { capturing: false, hasMaterial: false, manuallyExpanded: false }, collapsed: false },
  { input: { capturing: true, hasMaterial: false, manuallyExpanded: false }, collapsed: true },
  { input: { capturing: false, hasMaterial: true, manuallyExpanded: false }, collapsed: true },
  { input: { capturing: true, hasMaterial: true, manuallyExpanded: false }, collapsed: true },
  { input: { capturing: false, hasMaterial: false, manuallyExpanded: true }, collapsed: false },
  { input: { capturing: true, hasMaterial: false, manuallyExpanded: true }, collapsed: false },
  { input: { capturing: false, hasMaterial: true, manuallyExpanded: true }, collapsed: false },
  { input: { capturing: true, hasMaterial: true, manuallyExpanded: true }, collapsed: false },
];

describe("isSetupCollapsed", () => {
  it.each(rows)("capturing=$input.capturing hasMaterial=$input.hasMaterial manuallyExpanded=$input.manuallyExpanded -> $collapsed", ({ input, collapsed }) => {
    expect(isSetupCollapsed(input)).toBe(collapsed);
  });
});
