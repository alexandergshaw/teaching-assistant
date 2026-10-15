import { beforeEach, describe, it, expect, vi } from "vitest";
import { analyzeSlides, validateAssignments } from "./analysis";
import { absentRoles } from "./types";
const h = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("@/lib/llm", () => ({ callLlm: h.call }));
const source = [{ id: "ppt/slides/slide2.xml", ordinal: 1, text: "<b>Title</b>" }, { id: "ppt/slides/slide1.xml", ordinal: 2, text: "" }];
const valid = { slides: [{ id: source[0].id, role: "title" }, { id: source[1].id, role: "other" }] };
beforeEach(() => h.call.mockReset());
describe("closed classification boundary", () => {
  it("builds source-authoritative text and order; reports absent roles", () => {
    const definition = validateAssignments({ slides: [...valid.slides].reverse().map(s => ({ ...s, text: "forged" })) }, source);
    expect(definition.slides.map(s => s.text)).toEqual(["<b>Title</b>", ""]);
    expect(definition.slides[0].role).toBe("title");
    expect(absentRoles(definition)).toEqual(["section-divider", "content", "closing"]);
  });
  it("rejects duplicates, missing/foreign IDs, unknown roles and invented textless roles", () => {
    for (const raw of [null, {}, { slides: [] }, { slides: [valid.slides[0], valid.slides[0]] },
      { slides: [{ id: "foreign", role: "title" }, valid.slides[1]] },
      { slides: [{ ...valid.slides[0], role: "hero" }, valid.slides[1]] },
      { slides: [valid.slides[0], { ...valid.slides[1], role: "closing" }] }]) expect(() => validateAssignments(raw, source)).toThrow("PPT_MODEL");
  });
  it("uses one model call with bounded output and quoted source", async () => {
    h.call.mockResolvedValue({ ok: true, text: JSON.stringify(valid) });
    const result = await analyzeSlides(source);
    expect(result.slides[0].role).toBe("title");
    expect(h.call).toHaveBeenCalledTimes(1);
    expect(h.call.mock.calls[0][0].generationConfig.maxOutputTokens).toBe(10000);
    expect(JSON.parse(h.call.mock.calls[0][0].contents[0].parts[0].text)).toEqual(source);
  });
  it("refuses malformed JSON, provider failures, refusals and excess output without retry", async () => {
    for (const result of [{ ok: true, text: "no" }, { ok: false, body: "private" }, { ok: true, text: "{}" }, { ok: true, text: " ".repeat(24001) }]) {
      h.call.mockResolvedValue(result);
      await expect(analyzeSlides(source)).rejects.toMatchObject({ code: "PPT_MODEL" });
    }
    expect(h.call).toHaveBeenCalledTimes(4);
  });
});

it("refuses an over-budget quoted prompt before calling the provider", async () => {
  h.call.mockClear();
  await expect(analyzeSlides([{ id: "ppt/slides/slide1.xml", ordinal: 1, text: "x".repeat(24000) }])).rejects.toMatchObject({ code: "PPT_LIMIT" });
  expect(h.call).not.toHaveBeenCalled();
});