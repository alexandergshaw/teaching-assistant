import { describe, it, expect } from "vitest";
import { expandTemplate, getSlideRole, newDeckSlide, emptyDeckTemplate, coerceDeckTheme } from "./types";
import { DECK_PRESETS, isPresetDeckId } from "./presets";

describe("getSlideRole", () => {
  it("returns undefined for an unknown role", () => {
    expect(getSlideRole("unknown-role")).toBeUndefined();
  });

  it("returns a def for practice", () => {
    const def = getSlideRole("practice");
    expect(def).toBeDefined();
    expect(def?.role).toBe("practice");
    expect(def?.codeDefault).toBe(true);
  });
});

describe("expandTemplate", () => {
  it("returns one spec per slide for a template with no loops", () => {
    const template = emptyDeckTemplate("Test");
    if (!template.theme) template.theme = { backgroundKind: "solid", backgroundColor: "#ffffff", backgroundColor2: "#e2e8f0", gradientAngle: 135, fontColor: "#1e293b" };
    template.slides.push(newDeckSlide("concept"));
    template.slides.push(newDeckSlide("example"));

    const specs = expandTemplate(template, {});

    expect(specs).toHaveLength(3);
    expect(specs[0].role).toBe("title");
    expect(specs[1].role).toBe("concept");
    expect(specs[2].role).toBe("example");
    expect(specs[0].loopItem).toBeUndefined();
  });

  it("repeats a 3-slide loop block over two items, yielding 6 specs with loopItem cycling", () => {
    const template = emptyDeckTemplate("Test");
    if (!template.theme) template.theme = { backgroundKind: "solid", backgroundColor: "#ffffff", backgroundColor2: "#e2e8f0", gradientAngle: 135, fontColor: "#1e293b" };

    const loopGroupId = "loop-concepts";
    const loopGroup = {
      id: loopGroupId,
      label: "Concepts",
      source: "runtime" as const,
      items: [],
      runtimeLabel: "Concepts",
    };

    template.loops.push(loopGroup);

    // Add 3 slides in the loop block.
    const s1 = newDeckSlide("concept");
    s1.loopGroupId = loopGroupId;
    template.slides.push(s1);

    const s2 = newDeckSlide("example");
    s2.loopGroupId = loopGroupId;
    template.slides.push(s2);

    const s3 = newDeckSlide("practice");
    s3.loopGroupId = loopGroupId;
    template.slides.push(s3);

    // Expand with 2 items: A, B.
    const specs = expandTemplate(template, { [loopGroupId]: ["A", "B"] });

    // title (1) + 3 slides per item (2 items) = 7 specs
    expect(specs).toHaveLength(7);

    // First item (A).
    expect(specs[1].role).toBe("concept");
    expect(specs[1].loopItem).toBe("A");
    expect(specs[1].loopLabel).toBe("Concepts");

    expect(specs[2].role).toBe("example");
    expect(specs[2].loopItem).toBe("A");

    expect(specs[3].role).toBe("practice");
    expect(specs[3].loopItem).toBe("A");

    // Second item (B).
    expect(specs[4].role).toBe("concept");
    expect(specs[4].loopItem).toBe("B");

    expect(specs[5].role).toBe("example");
    expect(specs[5].loopItem).toBe("B");

    expect(specs[6].role).toBe("practice");
    expect(specs[6].loopItem).toBe("B");
  });

  it("emits a loop block once when the item list is empty", () => {
    const template = emptyDeckTemplate("Test");
    if (!template.theme) template.theme = { backgroundKind: "solid", backgroundColor: "#ffffff", backgroundColor2: "#e2e8f0", gradientAngle: 135, fontColor: "#1e293b" };

    const loopGroupId = "loop-empty";
    const loopGroup = {
      id: loopGroupId,
      label: "Topics",
      source: "runtime" as const,
      items: [],
      runtimeLabel: "Topics",
    };

    template.loops.push(loopGroup);

    const s1 = newDeckSlide("concept");
    s1.loopGroupId = loopGroupId;
    template.slides.push(s1);

    const s2 = newDeckSlide("practice");
    s2.loopGroupId = loopGroupId;
    template.slides.push(s2);

    // No items provided and loop group has no items.
    const specs = expandTemplate(template, {});

    // title (1) + 2 slides in the block (emitted once) = 3 specs
    expect(specs).toHaveLength(3);
    expect(specs[1].role).toBe("concept");
    expect(specs[1].loopItem).toBeUndefined();
    expect(specs[2].role).toBe("practice");
    expect(specs[2].loopItem).toBeUndefined();
  });
});

describe("coerceDeckTheme", () => {
  it("coerces classic kind and round-trips", () => {
    const theme = {
      backgroundKind: "classic",
      backgroundColor: "#1a2744",
      backgroundColor2: "#2563eb",
      gradientAngle: 135,
      fontColor: "#ffffff",
    };
    const coerced = coerceDeckTheme(theme);
    expect(coerced.backgroundKind).toBe("classic");
    expect(coerced.backgroundColor).toBe("#1a2744");
    expect(coerced.backgroundColor2).toBe("#2563eb");
  });

  it("coerces unknown kind to solid", () => {
    const theme = {
      backgroundKind: "unknown-kind",
      backgroundColor: "#ffffff",
      backgroundColor2: "#e2e8f0",
      gradientAngle: 135,
      fontColor: "#1e293b",
    };
    const coerced = coerceDeckTheme(theme);
    expect(coerced.backgroundKind).toBe("solid");
  });
});

describe("deck presets", () => {
  it("preset-classic-lecture exists with id, name, and classic kind", () => {
    const preset = DECK_PRESETS.find((p) => p.id === "preset-classic-lecture");
    expect(preset).toBeDefined();
    expect(preset?.name).toBe("Classic Lecture");
    expect(preset?.theme.backgroundKind).toBe("classic");
  });

  it("isPresetDeckId recognizes preset-classic-lecture", () => {
    expect(isPresetDeckId("preset-classic-lecture")).toBe(true);
  });

  it("preset-classic-lecture has the correct slide and loop structure", () => {
    const preset = DECK_PRESETS.find((p) => p.id === "preset-classic-lecture");
    expect(preset?.slides).toHaveLength(7);
    expect(preset?.slides[0].role).toBe("title");
    expect(preset?.slides[1].role).toBe("objectives");
    expect(preset?.slides[2].role).toBe("agenda");
    expect(preset?.slides[3].role).toBe("concept");
    expect(preset?.slides[3].loopGroupId).toBe("preset-classic-lecture-concepts");
    expect(preset?.slides[4].role).toBe("example");
    expect(preset?.slides[4].loopGroupId).toBe("preset-classic-lecture-concepts");
    expect(preset?.slides[5].role).toBe("practice");
    expect(preset?.slides[5].loopGroupId).toBe("preset-classic-lecture-concepts");
    expect(preset?.slides[6].role).toBe("summary");
    expect(preset?.loops).toHaveLength(1);
    expect(preset?.loops[0].id).toBe("preset-classic-lecture-concepts");
    expect(preset?.loops[0].runtimeLabel).toBe("Concepts");
  });
});
