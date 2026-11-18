import { expect, it } from "vitest";
import { validateNotebookOutputImages } from "./notebook-output-images";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
it("preserves valid observed PNG bytes with the source cell label", async () => {
  const parts = await validateNotebookOutputImages({ ok: true, expected: [2], observed: [2], errors: [], outputs: [], images: [{ cell: 2, base64: png }] });
  expect(parts).toEqual([{ name: "Observed cell 3 output", mimeType: "image/png", base64: png }]);
});
it("rejects corrupt image data rather than silently dropping it", async () => {
  expect(await validateNotebookOutputImages({ ok: true, expected: [0], observed: [0], errors: [], outputs: [], images: [{ cell: 0, base64: Buffer.from("not png").toString("base64") }] })).toBeNull();
});
