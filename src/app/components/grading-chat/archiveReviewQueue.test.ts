import { expect, it } from "vitest";
import { createArchiveReviewQueue } from "./archiveReviewQueue";

it("does not replace an archive while it is being processed", () => {
  const queue = createArchiveReviewQueue();
  const first = new File(["a"], "first.zip"), second = new File(["b"], "second.zip"), third = new File(["c"], "third.zip");
  expect(queue.enqueue(first, true)).toEqual({ file: first, autoSubmit: true });
  expect(queue.enqueue(second)).toBeNull();
  expect(queue.enqueue(third)).toBeNull();
  expect(queue.waitingNames()).toEqual(["second.zip", "third.zip"]);
  expect(queue.complete()).toEqual({ file: second, autoSubmit: false });
  expect(queue.complete()).toEqual({ file: third, autoSubmit: false });
  expect(queue.complete()).toBeNull();
  queue.reserve();
  expect(queue.enqueue(first)).toBeNull();
  expect(queue.complete()).toEqual({ file: first, autoSubmit: false });
  expect(queue.reset()).toEqual({ active: { file: first, autoSubmit: false }, wasActive: true, waiting: [] });
  expect(queue.enqueue(first)).toEqual({ file: first, autoSubmit: false });
  queue.reset();
  expect(queue.complete()).toBeNull();
});
