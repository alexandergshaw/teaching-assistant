import { describe, expect, it } from "vitest";
import { codeRunDisplay } from "./code-run-display";

const clean = { language: "c++", files: ["main.cpp"], ran: true, exitCode: 0, stdout: "Menu\nGood bye.", stderr: "" };
describe("code execution display", () => {
  it("does not present an empty-input menu exit as verified behavior", () => {
    expect(codeRunDisplay({ ...clean, stdinReadSuspected: true })).toMatchObject({ label: expect.stringContaining("input-driven behavior not verified"), detail: expect.stringContaining("no input was supplied") });
  });
  it("keeps ordinary successes, failures and unavailable runs distinct", () => {
    expect(codeRunDisplay(clean)?.label).toBe("Code: ran cleanly");
    expect(codeRunDisplay({ ...clean, ran: false, exitCode: 1 })?.label).toBe("Code: errors");
    expect(codeRunDisplay({ ...clean, error: "unavailable" })?.label).toBe("Code: runner error");
    expect(codeRunDisplay({ ...clean, ran: false, neededStdin: true })?.label).toContain("no input available");
    expect(codeRunDisplay(null)).toBeNull();
  });
});
