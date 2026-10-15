import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("@/lib/llm", () => ({ callLlm: vi.fn() }));
import { callLlm } from "@/lib/llm";
import { abstractDocument, buildDocumentReview, validateDefinition } from "./abstract";
const paragraphs = [{ id: "p0", text: "Course Alpha", runs: [], style: "" }, { id: "p1", text: "Keep policy", runs: [], style: "" }];
const good = { version: 1 as const, fields: [{ key: "course", label: "Course" }], replacements: [{ id: "p0", text: "Course {{course}}" }] };
beforeEach(() => vi.resetAllMocks());
describe("closed document proposal", () => {
  it("accepts partial replacements and HTML-looking text as literal data", () => { expect(validateDefinition(good, paragraphs)).toEqual(good); expect(validateDefinition({ ...good, replacements: [{ id: "p0", text: "<b>{{course}}</b>" }] }, paragraphs).replacements[0].text).toBe("<b>{{course}}</b>"); });
  it.each([
    { ...good, fields: [] }, { ...good, replacements: [] },
    { ...good, fields: [...good.fields, ...good.fields] },
    { ...good, replacements: [...good.replacements, ...good.replacements] },
    { ...good, replacements: [{ id: "foreign", text: "{{course}}" }] },
    { ...good, replacements: [{ id: "p0", text: "{{unknown}}" }] },
    { ...good, replacements: [{ id: "p0", text: "{{course}" }] },
    { ...good, replacements: [{ id: "p0", text: "" }] },
    { ...good, replacements: [{ id: "p0", text: "No reusable fields" }] },
    { ...good, fields: [{ key: "__proto__", label: "Bad" }] },
    { ...good, fields: [{ key: "course", label: "x".repeat(121) }] },
  ])("rejects malformed, foreign, deleting, duplicate or no-field proposal %#", (value) => { expect(() => validateDefinition(value, paragraphs)).toThrow(); });
  it("calls the provider once with quoted source and bounded output, validating the answer", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: JSON.stringify(good), finishReason: "STOP" });
    expect(await abstractDocument(paragraphs)).toEqual(good); expect(callLlm).toHaveBeenCalledTimes(1);
    const req = vi.mocked(callLlm).mock.calls[0][0]; expect(req.generationConfig?.maxOutputTokens).toBe(8192); expect(JSON.stringify(req)).toContain("untrusted data");
  });
  it("refuses provider failure, model refusal, incomplete and malformed responses without retries", async () => {
    for (const result of [{ ok: false, status: 503, body: "secret" }, { ok: true, text: "I refuse" }, { ok: true, text: JSON.stringify(good), finishReason: "MAX_TOKENS" }, { ok: true, text: "x".repeat(24001) }]) {
      vi.mocked(callLlm).mockResolvedValue(result as Awaited<ReturnType<typeof callLlm>>); await expect(abstractDocument(paragraphs)).rejects.toThrow();
    }
    expect(callLlm).toHaveBeenCalledTimes(4);
  });
});

describe("round-two template proposal text and review", () => {
  it.each(["\u0000", "\u0001", "\u000b", "\ufffe", "\uffff", "\ud800", "\udfff"])("refuses XML-incompatible replacement %j", (character) => {
    expect(() => validateDefinition({ ...good, replacements: [{ id: "p0", text: "{{course}}" + character }] }, paragraphs)).toThrow(/characters/);
  });
  it("allows literal dollar/markup, tabs/newlines and valid supplementary Unicode", () => {
    const text = "{{course}} $& <b> café 漢字 \ud801\udc00\t\n";
    expect(validateDefinition({ ...good, replacements: [{ id: "p0", text }] }, paragraphs).replacements[0].text).toBe(text);
  });
  it("returns source-derived retained text and placeholders in source order", () => {
    expect(buildDocumentReview(paragraphs, good)).toEqual([
      { id: "p0", sourceText: "Course Alpha", templateText: "Course {{course}}", replaced: true },
      { id: "p1", sourceText: "Keep policy", templateText: "Keep policy", replaced: false },
    ]);
  });
});

