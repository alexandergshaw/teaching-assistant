import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";

export function serializeUploadedSlideEditorRequest(body: Record<string, unknown>): string {
  const serialized = JSON.stringify(body);
  if (new TextEncoder().encode(serialized).byteLength > UPLOAD_WIRE_BUDGET_BYTES) {
    throw new Error("This PowerPoint request is too large. Reduce the deck or replacement image size.");
  }
  return serialized;
}

export function isUploadedSlideEditorRequestWithinBudget(byteLength: number): boolean {
  return Number.isSafeInteger(byteLength) && byteLength >= 0 && byteLength <= UPLOAD_WIRE_BUDGET_BYTES;
}
