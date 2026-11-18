import { expect, it } from "vitest";
import { parseNotebookObservations } from "./notebook-kernel-controller";
it("accepts a complete ordered set of cell observations", () => {
  expect(parseNotebookObservations(JSON.stringify({ ok: true, expected: [0, 2], observed: [0, 2], errors: [], outputs: [{ cell: 2, kind: "stream", text: "42" }], images: [] }), 0, [0, 2])).toMatchObject({ ok: true, outputs: [{ cell: 2, text: "42" }] });
});
it("accepts bounded PNG data and rejects an image assigned to an unexecuted cell", () => {
  const image = { cell: 2, base64: "aGVsbG8=" };
  const data = { ok: true, expected: [0, 2], observed: [0, 2], errors: [], outputs: [], images: [image] };
  expect(parseNotebookObservations(JSON.stringify(data), 0, [0, 2])).not.toBeNull();
  expect(parseNotebookObservations(JSON.stringify({ ...data, images: [{ ...image, cell: 1 }] }), 0, [0, 2])).toBeNull();
});
it.each([
  [{ ok: true, expected: [0, 2], observed: [0], errors: [] }, 0],
  [{ ok: true, expected: [0, 2], observed: [0, 0], errors: [] }, 0],
  [{ ok: true, expected: [0, 2], observed: [0, 2], errors: [2] }, 0],
  [{ ok: false, expected: [0, 2], observed: [0], error: "DeadKernelError" }, 1],
  [{ ok: false, expected: [0, 2], observed: [0], error: "CellTimeoutError" }, 1],
  [{ ok: true, expected: [0, 2], observed: [0, 2], errors: [] }, 1],
])("rejects incomplete or failed execution %j", (value, exitCode) => {
  expect(parseNotebookObservations(JSON.stringify(value), exitCode, [0, 2])).toBeNull();
});
