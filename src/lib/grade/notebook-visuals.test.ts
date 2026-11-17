import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { prepareNotebookVisuals } from "./notebook-visuals";
import { collectInlineVisualEvidence } from "./inline-visuals";

const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const notebook = (data: object) => JSON.stringify({ cells: [{ cell_type: "code", outputs: [{ output_type: "display_data", data }] }] });

describe("notebook visual evidence", () => {
  it("attaches the exact bounded image bytes from the complete notebook", async () => {
    vi.stubEnv("GRADE_NOTEBOOK_VISUALS", "1");
    try {
      const result = await collectInlineVisualEvidence([{ name: "work.ipynb", extension: "ipynb", previewContent: notebook({ "image/png": image }), previewTruncated: false }]);
      expect(result.documents[0].coverage.status).toBe("complete");
      expect(result.parts).toEqual([{ name: "work.ipynb (cell 1 output 1)", mimeType: "image/png", base64: image }]);
    } finally { vi.unstubAllEnvs(); }
  });
  it("fails closed on truncation, malformed bytes and unsupported rich output", async () => {
    expect((await prepareNotebookVisuals(notebook({ "image/png": image }), true)).status).toBe("failed");
    expect((await prepareNotebookVisuals(notebook({ "image/png": "AAAA" }), false)).status).toBe("failed");
    expect((await prepareNotebookVisuals(notebook({ "text/html": "<img>" }), false)).status).toBe("failed");
    expect((await prepareNotebookVisuals(notebook({ "image/png": image, "text/html": "<img>" }), false)).status).toBe("failed");
  });
  it("holds malformed images, unknown MIME and markdown image sources", async () => {
    const invalid = Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4]).toString("base64");
    expect((await prepareNotebookVisuals(notebook({ "image/png": invalid }), false)).status).toBe("failed");
    expect((await prepareNotebookVisuals(notebook({ "application/pdf": "data" }), false)).status).toBe("failed");
    expect((await prepareNotebookVisuals(JSON.stringify({ cells: [{ cell_type: "markdown", source: "![plot](attachment:x.png)", attachments: { "x.png": {} } }] }), false)).status).toBe("failed");
    expect((await prepareNotebookVisuals(JSON.stringify({ cells: [{ cell_type: "markdown", source: "![plot](https://example.com/x.png)" }] }), false)).status).toBe("failed");
  });
  it("accepts inert HTML tables and fails closed on active or visually ambiguous HTML", async () => {
    expect((await prepareNotebookVisuals(notebook({ "text/html": "<table><tbody><tr><td>42</td></tr></tbody></table>", "text/plain": "42" }), false)).status).toBe("complete");
    for (const html of ["<script>alert(1)</script>", "<img src='https://example.com/a'>", "<table><tr style='display:none'><td>42</td></tr></table>"]) {
      expect((await prepareNotebookVisuals(notebook({ "text/html": html }), false)).status).toBe("failed");
    }
  });
  it("accepts alignment-only pandas tables and preserves column span markup", async () => {
    const html = "<div><style type='text/css'>.dataframe tbody tr th:only-of-type { vertical-align: middle; } .dataframe thead th { text-align: right; }</style><table border='1' class='dataframe' id='T_1'><thead><tr style='text-align: right;'><th colspan='2' halign='left'>A</th></tr></thead><tbody><tr><td>42</td></tr></tbody></table></div>";
    expect((await prepareNotebookVisuals(notebook({ "text/html": html }), false)).status).toBe("complete");
    expect((await prepareNotebookVisuals(notebook({ "text/html": html.replace("text-align: right", "display:none") }), false)).status).toBe("failed");
    expect((await prepareNotebookVisuals(notebook({ "text/html": html.replace("vertical-align: middle", "background:url(https://evil)") }), false)).status).toBe("failed");
  });
  it("holds markdown reference images and embedded visual markup", async () => {
    for (const source of ["![plot][image]", "<svg></svg>", "<picture></picture>", "<video></video>"]) {
      expect((await prepareNotebookVisuals(JSON.stringify({ cells: [{ cell_type: "markdown", source }] }), false)).status).toBe("failed");
      expect((await prepareNotebookVisuals(notebook({ "text/markdown": source }), false)).status).toBe("failed");
    }
  });
  it("holds a truncated JPEG and a missing display bundle", async () => {
    const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: "red" } }).jpeg().toBuffer();
    const truncated = Buffer.concat([jpeg.subarray(0, jpeg.length - 22), Buffer.from([255, 217])]).toString("base64");
    expect((await prepareNotebookVisuals(notebook({ "image/jpeg": truncated }), false)).status).toBe("failed");
    expect((await prepareNotebookVisuals(JSON.stringify({ cells: [{ cell_type: "code", outputs: [{ output_type: "display_data" }] }] }), false)).status).toBe("failed");
  });
  it("holds compressed images that exceed the cumulative decoded budget", async () => {
    const large = (await sharp({ create: { width: 2048, height: 2048, channels: 4, background: "white" } }).png().toBuffer()).toString("base64");
    const text = JSON.stringify({ cells: [{ cell_type: "code", outputs: Array.from({ length: 3 }, () => ({ output_type: "display_data", data: { "image/png": large } })) }] });
    expect((await prepareNotebookVisuals(text, false)).status).toBe("failed");
  });
  it("fails closed above the image count limit", async () => {
    const text = JSON.stringify({ cells: [{ cell_type: "code", outputs: Array.from({ length: 17 }, () => ({ output_type: "display_data", data: { "image/png": image } })) }] });
    expect((await prepareNotebookVisuals(text, false)).status).toBe("failed");
  });
});
