import { afterEach, describe, expect, it, vi } from "vitest";
import { notebookVisualsEnabled } from "./notebook-visuals-enabled";

describe("notebook visual feature flag", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(["1", "true"])("enables visual inspection for %s", (value) => {
    vi.stubEnv("GRADE_NOTEBOOK_VISUALS", value);
    expect(notebookVisualsEnabled()).toBe(true);
  });

  it.each(["", "0", "false", "TRUE", "yes"])("keeps the feature disabled for %s", (value) => {
    vi.stubEnv("GRADE_NOTEBOOK_VISUALS", value);
    expect(notebookVisualsEnabled()).toBe(false);
  });
});
