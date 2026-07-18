import { describe, it, expect } from "vitest";
import { getStepDefinition } from "./registry";

describe("compose-briefing step", () => {
  const def = getStepDefinition("compose-briefing");
  expect(def, "compose-briefing step exists").toBeTruthy();
  const run = def!.run;

  it("requires a non-empty title", async () => {
    await expect(run({ title: "" }, {} as never, () => {})).rejects.toThrow("Provide a title");
    await expect(run({ title: "   " }, {} as never, () => {})).rejects.toThrow("Provide a title");
  });

  it("composes sections with newline separators, skipping empty ones", async () => {
    const result = await run(
      { title: "T", section1: "a", section3: "b" },
      {} as never,
      () => {}
    );
    expect(result.outputs.briefing).toBe("# T\n\na\n\nb");
  });

  it("produces just the title when all sections are empty", async () => {
    const result = await run(
      { title: "T" },
      {} as never,
      () => {}
    );
    expect(result.outputs.briefing).toBe("# T");
  });

  it("includes all non-empty sections in order", async () => {
    const result = await run(
      { title: "Test", section1: "First", section2: "Second", section3: "Third", section4: "Fourth" },
      {} as never,
      () => {}
    );
    expect(result.outputs.briefing).toBe("# Test\n\nFirst\n\nSecond\n\nThird\n\nFourth");
  });
});
