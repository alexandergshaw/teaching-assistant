import { prepareNotebookVisuals } from "./notebook-visuals";
import type { NotebookObservations } from "./notebook-kernel-controller";

/** Decode and validate generated PNGs before storing or sending to a model. */
export async function validateNotebookOutputImages(observations: NotebookObservations): Promise<{ name: string; mimeType: string; base64: string }[] | null> {
  if (!observations.images.length) return [];
  const notebook = { nbformat: 4, nbformat_minor: 5, cells: observations.images.map(image => ({ cell_type: "code", source: "", outputs: [{ output_type: "display_data", data: { "image/png": image.base64 } }] })) };
  const result = await prepareNotebookVisuals(JSON.stringify(notebook), false);
  if (result.status !== "complete" || result.parts.length !== observations.images.length) return null;
  return result.parts.map((part, index) => ({ ...part, name: `Observed cell ${observations.images[index].cell + 1} output` }));
}
