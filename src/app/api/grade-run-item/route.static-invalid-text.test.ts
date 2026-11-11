import { expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import JSZip from "jszip";
const llm = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })) }));
vi.mock("@/lib/code-runner", () => ({ runSubmittedCode: vi.fn(async () => null) }));
vi.mock("@/lib/llm", async (original) => ({ ...await original<object>(), callLlm: llm }));
import { ingestZipEntries } from "@/lib/grade/extraction";
import { stripUnneededRawBase64 } from "@/app/components/grading/incrementalRunPlan";
import { POST } from "./route";

it("holds invalid UTF-8 code from actual ZIP extraction before any model call", async () => {
  const zip = new JSZip(); const path = "Synthetic_1_2_main.cpp"; zip.file(path, new Uint8Array([0x69, 0x6e, 0xff, 0x74]));
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const extracted = await ingestZipEntries(new Uint8Array(bytes).buffer, { requireSupportedFiles: true, reviewedMapping: { [path]: "Synthetic" } });
  expect(extracted.entries).toHaveLength(1);
  const entry = stripUnneededRawBase64({ ...extracted.entries[0], staticOnly: true });
  const request = { sourceIndex: 0, entry, assignmentInstructions: "Grade.", rubric: "Correctness (10 pts): Work.", provider: "gemini", pointsPossible: 10 };
  const response = await POST({ headers: new Headers({ "content-type": "application/json" }), json: async () => request } as NextRequest);
  expect(response.status).toBe(400); expect(llm).not.toHaveBeenCalled();
});
