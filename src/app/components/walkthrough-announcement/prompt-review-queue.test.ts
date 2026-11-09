import { describe, expect, it } from "vitest";
import { takeDisplayedRequest } from "./prompt-review-queue";

describe("prompt review queue", () => {
  it("ignores a repeated approval instead of consuming the next unseen prompt", () => {
    const first = { prompt: "first" }, second = { prompt: "second" };
    const queue = [first, second];
    expect(takeDisplayedRequest(queue, first)).toBe(first);
    expect(takeDisplayedRequest(queue, first)).toBeUndefined();
    expect(queue).toEqual([second]);
    expect(takeDisplayedRequest(queue, second)).toBe(second);
  });
});
