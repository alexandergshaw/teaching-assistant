/** Python controller for a disposable sandbox. The kernel is untrusted; its
 * replies are classroom observations, not tamper-resistant attestation. */
export const NOTEBOOK_CONTROLLER = String.raw`
import json, sys
from pathlib import Path
import nbformat
from nbclient import NotebookClient
from nbclient.exceptions import CellExecutionError, CellTimeoutError

path = sys.argv[1]
nb = nbformat.read(path, as_version=4)
expected = [i for i, cell in enumerate(nb.cells) if cell.cell_type == "code"]
if not expected or len(expected) > 200:
    raise ValueError("Unsupported notebook cell count")
observed = []
def completed(cell, cell_index, **kwargs):
    if cell.cell_type == "code":
        observed.append(cell_index)
client = NotebookClient(nb, timeout=30, kernel_name="python3", allow_errors=False, on_cell_complete=completed, resources={"metadata": {"path": str(Path(path).parent)}})
try:
    client.execute()
    errors = [i for i, cell in enumerate(nb.cells) if cell.cell_type == "code" and any(o.get("output_type") == "error" for o in cell.get("outputs", []))]
    outputs = []
    images = []
    unsupported = False
    for i, cell in enumerate(nb.cells):
        if cell.cell_type != "code":
            continue
        for item in cell.get("outputs", []):
            kind = item.get("output_type")
            data = item.get("data", {})
            if kind == "stream":
                text = item.get("text", "")
            elif kind in ("display_data", "execute_result") and isinstance(data, dict) and all(k in ("text/plain", "text/html", "image/png") for k in data):
                text = data.get("text/plain", "")
                if "image/png" in data:
                    image = data["image/png"]
                    if isinstance(image, list):
                        image = "".join(image)
                    if not isinstance(image, str):
                        unsupported = True
                    else:
                        images.append({"cell": i, "base64": "".join(image.split())})
                elif "text/plain" not in data:
                    unsupported = True
            else:
                unsupported = True
                continue
            if isinstance(text, list):
                text = "".join(text)
            if not isinstance(text, str):
                unsupported = True
                continue
            outputs.append({"cell": i, "kind": kind, "text": text})
    if len(outputs) > 200 or sum(len(o["text"]) for o in outputs) > 12000 or len(images) > 4 or sum(len(o["base64"]) for o in images) > 1000000:
        unsupported = True
    ok = observed == expected and not errors and not unsupported
    print(json.dumps({"ok": ok, "expected": expected, "observed": observed, "errors": errors, "outputs": outputs if ok else [], "images": images if ok else []}))
    sys.exit(0 if ok else 1)
except (CellExecutionError, CellTimeoutError, Exception) as exc:
    print(json.dumps({"ok": False, "expected": expected, "observed": observed, "error": type(exc).__name__}))
    sys.exit(1)
`;

export interface NotebookObservations { ok: boolean; expected: number[]; observed: number[]; errors?: number[]; error?: string; outputs: Array<{ cell: number; kind: string; text: string }>; images: Array<{ cell: number; base64: string }> }
/** Validate all cells, uniqueness, bounds and terminal status before accepting a result. */
export function parseNotebookObservations(stdout: string, exitCode: number, expectedCells: readonly number[]): NotebookObservations | null {
  if (stdout.length > 1_100_000 || !Number.isSafeInteger(exitCode)) return null;
  try {
    const value = JSON.parse(stdout) as NotebookObservations;
    const same = (a: unknown, b: readonly number[]) => Array.isArray(a) && a.length === b.length && a.every((n, i) => Number.isSafeInteger(n) && n === b[i]);
    if (exitCode !== 0 || value.ok !== true || !same(value.expected, expectedCells) || !same(value.observed, expectedCells) || !Array.isArray(value.errors) || value.errors.length !== 0 || !Array.isArray(value.outputs) || value.outputs.length > 200 || value.outputs.some(item => !item || !expectedCells.includes(item.cell) || !["stream", "display_data", "execute_result"].includes(item.kind) || typeof item.text !== "string") || value.outputs.reduce((sum, item) => sum + item.text.length, 0) > 12_000 || !Array.isArray(value.images) || value.images.length > 4 || value.images.some(image => !image || !expectedCells.includes(image.cell) || typeof image.base64 !== "string" || image.base64.length === 0 || image.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.base64)) || value.images.reduce((sum, image) => sum + image.base64.length, 0) > 1_000_000) return null;
    return value;
  } catch { return null; }
}
