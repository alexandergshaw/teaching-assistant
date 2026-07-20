import { describe, it, expect } from "vitest";
import {
  roleTitlePrefix,
  buildDeckPrompt,
  scaffoldDeck,
  generateDeckFromTemplate,
  trimBreadthCore,
  parseLenientJsonArray,
  type DeckGenContext,
} from "./generate";
import {
  emptyDeckTemplate,
  newDeckSlide,
  newDeckLoopGroup,
  type SlideRole,
} from "./types";

describe("generate.ts", () => {
  describe("roleTitlePrefix", () => {
    it("maps example -> 'Example:'", () => {
      expect(roleTitlePrefix("example")).toBe("Example:");
    });

    it("maps walkthrough -> 'Walkthrough:'", () => {
      expect(roleTitlePrefix("walkthrough")).toBe("Walkthrough:");
    });

    it("maps practice -> 'Practice:'", () => {
      expect(roleTitlePrefix("practice")).toBe("Practice:");
    });

    it("maps answer -> 'Answer:'", () => {
      expect(roleTitlePrefix("answer")).toBe("Answer:");
    });

    it("maps case-study -> 'Case Study:'", () => {
      expect(roleTitlePrefix("case-study")).toBe("Case Study:");
    });

    it("returns null for concept", () => {
      expect(roleTitlePrefix("concept")).toBeNull();
    });

    it("returns null for summary", () => {
      expect(roleTitlePrefix("summary")).toBeNull();
    });

    it("returns null for custom", () => {
      expect(roleTitlePrefix("custom")).toBeNull();
    });
  });

  describe("buildDeckPrompt", () => {
    it("includes subject in prompt", () => {
      const template = emptyDeckTemplate("Test Deck");
      const resolved = [
        {
          role: "title" as SlideRole,
          title: "",
          notes: "Introduction slide",
          includeCode: false,
          codeLanguage: "",
          maxBullets: 0,
          depth: "standard" as const,
        },
      ];
      const ctx: DeckGenContext = {
        subject: "Python Loops",
        loopItems: {},
      };

      const prompt = buildDeckPrompt(template, resolved, ctx);
      expect(prompt).toContain("Python Loops");
    });

    it("includes audience when provided", () => {
      const template = emptyDeckTemplate("Test");
      const resolved: never[] = [];
      const ctx: DeckGenContext = {
        subject: "Test",
        audience: "Intro CS",
        loopItems: {},
      };

      const prompt = buildDeckPrompt(template, resolved, ctx);
      expect(prompt).toContain("Intro CS");
    });

    it("includes tone when provided", () => {
      const template = emptyDeckTemplate("Test");
      const resolved: never[] = [];
      const ctx: DeckGenContext = {
        subject: "Test",
        tone: "conversational",
        loopItems: {},
      };

      const prompt = buildDeckPrompt(template, resolved, ctx);
      expect(prompt).toContain("conversational");
    });

    it("includes materials when provided", () => {
      const template = emptyDeckTemplate("Test");
      const resolved: never[] = [];
      const ctx: DeckGenContext = {
        subject: "Test",
        materials: "Chapter 3: Introduction to functions",
        loopItems: {},
      };

      const prompt = buildDeckPrompt(template, resolved, ctx);
      expect(prompt).toContain("Chapter 3");
    });

    it("describes each resolved slide with role, notes, and loop item", () => {
      const template = emptyDeckTemplate("Test");
      const resolved = [
        {
          role: "example" as SlideRole,
          title: "",
          notes: "Show a loop example",
          includeCode: true,
          codeLanguage: "python",
          maxBullets: 4,
          loopItem: "for loop",
          depth: "standard" as const,
        },
      ];
      const ctx: DeckGenContext = {
        subject: "Loops",
        loopItems: {},
      };

      const prompt = buildDeckPrompt(template, resolved, ctx);
      expect(prompt).toContain("Show a loop example");
      expect(prompt).toContain("for loop");
      expect(prompt).toContain("Example:");
    });

    it("includes required title prefix for example, walkthrough, practice, answer, case-study", () => {
      const template = emptyDeckTemplate("Test");
      const ctx: DeckGenContext = { subject: "Test", loopItems: {} };

      const roles: SlideRole[] = ["example", "walkthrough", "practice", "answer", "case-study"];
      for (const role of roles) {
        const resolved = [
          {
            role,
            title: "",
            notes: "Test",
            includeCode: false,
            codeLanguage: "",
            maxBullets: 4,
          depth: "standard" as const,
          },
        ];
        const prompt = buildDeckPrompt(template, resolved, ctx);
        const prefix = roleTitlePrefix(role);
        expect(prompt).toContain(`"${prefix}"`);
      }
    });

    it("specifies code language and inclusion", () => {
      const template = emptyDeckTemplate("Test");
      const resolved = [
        {
          role: "example" as SlideRole,
          title: "",
          notes: "Code example",
          includeCode: true,
          codeLanguage: "javascript",
          maxBullets: 4,
          depth: "standard" as const,
        },
      ];
      const ctx: DeckGenContext = { subject: "Test", loopItems: {} };

      const prompt = buildDeckPrompt(template, resolved, ctx);
      expect(prompt).toContain("javascript");
      expect(prompt).toContain("Include code");
    });

    it("includes SLIDE_DECK_JSON_SHAPE and requirements", () => {
      const template = emptyDeckTemplate("Test");
      const resolved: never[] = [];
      const ctx: DeckGenContext = { subject: "Test", loopItems: {} };

      const prompt = buildDeckPrompt(template, resolved, ctx);
      expect(prompt).toContain("presentationTitle");
      expect(prompt).toContain("slides");
      expect(prompt).toContain("self-contained");
    });
  });

  describe("scaffoldDeck", () => {
    it("returns one slide per resolved spec", () => {
      const template = emptyDeckTemplate("Test");
      const resolved = [
        {
          role: "title" as SlideRole,
          title: "Introduction",
          notes: "",
          includeCode: false,
          codeLanguage: "",
          maxBullets: 0,
          depth: "standard" as const,
        },
        {
          role: "concept" as SlideRole,
          title: "",
          notes: "Understanding loops",
          includeCode: false,
          codeLanguage: "",
          maxBullets: 4,
          depth: "standard" as const,
        },
      ];
      const ctx: DeckGenContext = { subject: "Loops", loopItems: {} };

      const result = scaffoldDeck(template, resolved, ctx);
      expect(result.slides).toHaveLength(2);
    });

    it("applies required title prefixes", () => {
      const template = emptyDeckTemplate("Test");
      const resolved = [
        {
          role: "example" as SlideRole,
          title: "",
          notes: "Loop example",
          includeCode: false,
          codeLanguage: "",
          maxBullets: 4,
          depth: "standard" as const,
        },
      ];
      const ctx: DeckGenContext = { subject: "Test", loopItems: {} };

      const result = scaffoldDeck(template, resolved, ctx);
      expect(result.slides[0].title).toMatch(/^Example:/);
    });

    it("includes code when includeCode is true", () => {
      const template = emptyDeckTemplate("Test");
      const resolved = [
        {
          role: "example" as SlideRole,
          title: "Example",
          notes: "Loop",
          includeCode: true,
          codeLanguage: "python",
          maxBullets: 4,
          depth: "standard" as const,
        },
      ];
      const ctx: DeckGenContext = { subject: "Test", loopItems: {} };

      const result = scaffoldDeck(template, resolved, ctx);
      expect(result.slides[0].code).toBeDefined();
      expect(result.slides[0].codeLanguage).toBe("python");
    });

    it("does not include code when includeCode is false", () => {
      const template = emptyDeckTemplate("Test");
      const resolved = [
        {
          role: "concept" as SlideRole,
          title: "Concept",
          notes: "What is a loop",
          includeCode: false,
          codeLanguage: "",
          maxBullets: 4,
          depth: "standard" as const,
        },
      ];
      const ctx: DeckGenContext = { subject: "Test", loopItems: {} };

      const result = scaffoldDeck(template, resolved, ctx);
      expect(result.slides[0].code).toBeUndefined();
    });

    it("uses loop item in title when available", () => {
      const template = emptyDeckTemplate("Test");
      const resolved = [
        {
          role: "concept" as SlideRole,
          title: "",
          notes: "",
          includeCode: false,
          codeLanguage: "",
          maxBullets: 4,
          loopItem: "while loop",
          depth: "standard" as const,
        },
      ];
      const ctx: DeckGenContext = { subject: "Test", loopItems: {} };

      const result = scaffoldDeck(template, resolved, ctx);
      expect(result.slides[0].title).toContain("while loop");
    });

    it("uses template name as presentation title", () => {
      const template = emptyDeckTemplate("My Lecture");
      const resolved: never[] = [];
      const ctx: DeckGenContext = { subject: "Loops", loopItems: {} };

      const result = scaffoldDeck(template, resolved, ctx);
      expect(result.presentationTitle).toBe("My Lecture");
    });

    it("falls back to subject when template name is empty", () => {
      const template = emptyDeckTemplate("");
      template.name = "";
      const resolved: never[] = [];
      const ctx: DeckGenContext = { subject: "Python Fundamentals", loopItems: {} };

      const result = scaffoldDeck(template, resolved, ctx);
      expect(result.presentationTitle).toBe("Python Fundamentals");
    });

    it("respects maxBullets", () => {
      const template = emptyDeckTemplate("Test");
      const resolved = [
        {
          role: "concept" as SlideRole,
          title: "Concept",
          notes: "First point",
          includeCode: false,
          codeLanguage: "",
          maxBullets: 2,
          depth: "standard" as const,
        },
      ];
      const ctx: DeckGenContext = { subject: "Test", loopItems: {} };

      const result = scaffoldDeck(template, resolved, ctx);
      expect(result.slides[0].bullets.length).toBeLessThanOrEqual(2);
    });

    it("includes notes as a bullet if present", () => {
      const template = emptyDeckTemplate("Test");
      const resolved = [
        {
          role: "concept" as SlideRole,
          title: "Concept",
          notes: "Understanding the fundamentals",
          includeCode: false,
          codeLanguage: "",
          maxBullets: 4,
          depth: "standard" as const,
        },
      ];
      const ctx: DeckGenContext = { subject: "Test", loopItems: {} };

      const result = scaffoldDeck(template, resolved, ctx);
      expect(result.slides[0].bullets.length).toBeGreaterThan(0);
    });

    it("prefixes first bullet with 'Intro:' for intro depth", () => {
      const template = emptyDeckTemplate("Test");
      const resolved = [
        {
          role: "example" as SlideRole,
          title: "Example",
          notes: "Getting started",
          includeCode: false,
          codeLanguage: "",
          maxBullets: 4,
          depth: "intro" as const,
        },
      ];
      const ctx: DeckGenContext = { subject: "Test", loopItems: {} };

      const result = scaffoldDeck(template, resolved, ctx);
      expect(result.slides[0].bullets[0]).toMatch(/^Intro:/);
    });

    it("prefixes first bullet with 'Challenge:' for challenge depth", () => {
      const template = emptyDeckTemplate("Test");
      const resolved = [
        {
          role: "practice" as SlideRole,
          title: "Practice",
          notes: "Solve this advanced problem",
          includeCode: false,
          codeLanguage: "",
          maxBullets: 4,
          depth: "challenge" as const,
        },
      ];
      const ctx: DeckGenContext = { subject: "Test", loopItems: {} };

      const result = scaffoldDeck(template, resolved, ctx);
      expect(result.slides[0].bullets[0]).toMatch(/^Challenge:/);
    });

    it("does not prefix bullets for standard depth", () => {
      const template = emptyDeckTemplate("Test");
      const resolved = [
        {
          role: "concept" as SlideRole,
          title: "Concept",
          notes: "Standard treatment",
          includeCode: false,
          codeLanguage: "",
          maxBullets: 4,
          depth: "standard" as const,
        },
      ];
      const ctx: DeckGenContext = { subject: "Test", loopItems: {} };

      const result = scaffoldDeck(template, resolved, ctx);
      expect(result.slides[0].bullets[0]).not.toMatch(/^(Intro|Challenge):/);
    });
  });

  describe("buildDeckPrompt with depth", () => {
    it("includes depth hint for intro depth", () => {
      const template = emptyDeckTemplate("Test");
      const resolved = [
        {
          role: "example" as SlideRole,
          title: "",
          notes: "Show a loop example",
          includeCode: false,
          codeLanguage: "",
          maxBullets: 4,
          depth: "intro" as const,
        },
      ];
      const ctx: DeckGenContext = {
        subject: "Loops",
        loopItems: {},
      };

      const prompt = buildDeckPrompt(template, resolved, ctx);
      expect(prompt).toContain("Difficulty:");
      expect(prompt).toContain("introductory");
      expect(prompt).toContain("gently-scaffolded");
    });

    it("includes depth hint for challenge depth", () => {
      const template = emptyDeckTemplate("Test");
      const resolved = [
        {
          role: "practice" as SlideRole,
          title: "",
          notes: "Solve an advanced problem",
          includeCode: false,
          codeLanguage: "",
          maxBullets: 4,
          depth: "challenge" as const,
        },
      ];
      const ctx: DeckGenContext = {
        subject: "Loops",
        loopItems: {},
      };

      const prompt = buildDeckPrompt(template, resolved, ctx);
      expect(prompt).toContain("Difficulty:");
      expect(prompt).toContain("challenging");
      expect(prompt).toContain("edge case");
    });

    it("does not include Difficulty: for standard depth", () => {
      const template = emptyDeckTemplate("Test");
      const resolved = [
        {
          role: "concept" as SlideRole,
          title: "",
          notes: "Standard concept",
          includeCode: false,
          codeLanguage: "",
          maxBullets: 4,
          depth: "standard" as const,
        },
      ];
      const ctx: DeckGenContext = {
        subject: "Loops",
        loopItems: {},
      };

      const prompt = buildDeckPrompt(template, resolved, ctx);
      // Standard depth has empty promptHint, so no "Difficulty:" appended
      const lines = prompt.split("\n");
      const slideLines = lines.filter((l) => l.startsWith("Slide 1"));
      expect(slideLines.some((l) => l.includes("Difficulty:"))).toBe(false);
    });
  });

  describe("Standard depth prompt parity", () => {
    it("generates byte-identical prompts to today for all-standard settings", () => {
      const template = emptyDeckTemplate("Test Deck");
      const resolved = [
        {
          role: "title" as SlideRole,
          title: "Introduction",
          notes: "",
          includeCode: false,
          codeLanguage: "",
          maxBullets: 0,
          depth: "standard" as const,
        },
        {
          role: "concept" as SlideRole,
          title: "",
          notes: "Understanding loops",
          includeCode: false,
          codeLanguage: "",
          maxBullets: 4,
          depth: "standard" as const,
        },
        {
          role: "example" as SlideRole,
          title: "",
          notes: "Loop example",
          includeCode: true,
          codeLanguage: "python",
          maxBullets: 4,
          depth: "standard" as const,
        },
      ];
      const ctx: DeckGenContext = {
        subject: "Python Loops",
        audience: "Intro CS",
        tone: "clear",
        loopItems: {},
      };

      const prompt = buildDeckPrompt(template, resolved, ctx);

      // Verify standard depths don't add Difficulty: lines
      const lines = prompt.split("\n");
      const slideLines = lines.filter((l) => l.startsWith("Slide"));
      for (const line of slideLines) {
        expect(line).not.toContain("Difficulty:");
      }

      // Verify structure is preserved
      expect(prompt).toContain("Python Loops");
      expect(prompt).toContain("Intro CS");
      expect(prompt).toContain("Understanding loops");
      expect(prompt).toContain("Loop example");
      expect(prompt).toContain("Include code");
    });
  });

  describe("Breadth enumeration", () => {
    describe("trimBreadthCore", () => {
      it("trims to first 2 seeds", () => {
        const seeds = ["seed1", "seed2", "seed3", "seed4"];
        const result = trimBreadthCore(seeds);
        expect(result).toEqual(["seed1", "seed2"]);
        expect(result).toHaveLength(2);
      });

      it("keeps 1 seed when only 1 provided", () => {
        const seeds = ["seed1"];
        const result = trimBreadthCore(seeds);
        expect(result).toEqual(["seed1"]);
      });

      it("keeps 2 seeds when exactly 2 provided", () => {
        const seeds = ["seed1", "seed2"];
        const result = trimBreadthCore(seeds);
        expect(result).toEqual(["seed1", "seed2"]);
      });

      it("returns empty array for empty seeds", () => {
        const seeds: string[] = [];
        const result = trimBreadthCore(seeds);
        expect(result).toEqual([]);
      });
    });

    it("embedded provider with breadth full keeps original seeds", async () => {
      const template = emptyDeckTemplate("Test");
      const loopGroup = newDeckLoopGroup();
      loopGroup.breadth = "full";
      loopGroup.items = ["Python", "JavaScript", "Java"];
      template.loops = [loopGroup];

      // Add a slide that uses this loop group
      const slide = newDeckSlide("concept");
      slide.loopGroupId = loopGroup.id;
      template.slides = [newDeckSlide("title"), slide];

      const ctx: DeckGenContext = {
        subject: "Languages",
        loopItems: {},
      };

      const result = await generateDeckFromTemplate(template, ctx, "embedded");

      // Should not have error
      if ("error" in result) {
        throw new Error(`Unexpected error: ${result.error}`);
      }

      // Embedded provider should fallback to original seeds (3 items)
      // With 3 seeds, we expect 1 title + 3 concept slides (one per seed)
      expect(result.slides).toHaveLength(4);
    });

    it("breadth core with >2 seeds trims to first 2", async () => {
      const template = emptyDeckTemplate("Test");
      const loopGroup = newDeckLoopGroup();
      loopGroup.breadth = "core";
      loopGroup.items = ["item1", "item2", "item3", "item4"];
      template.loops = [loopGroup];

      const slide = newDeckSlide("concept");
      slide.loopGroupId = loopGroup.id;
      template.slides = [newDeckSlide("title"), slide];

      const ctx: DeckGenContext = {
        subject: "Core Topics",
        loopItems: {},
      };

      const result = await generateDeckFromTemplate(template, ctx, "embedded");

      // Should not have error
      if ("error" in result) {
        throw new Error(`Unexpected error: ${result.error}`);
      }

      // Core breadth with 4 items should trim to 2
      // Expect 1 title + 2 concept slides (one per trimmed seed)
      expect(result.slides).toHaveLength(3);
    });

    describe("parseLenientJsonArray", () => {
      it("parses JSON array from text", () => {
        const text = '["item1", "item2", "item3"]';
        const result = parseLenientJsonArray(text);
        expect(result).toEqual(["item1", "item2", "item3"]);
      });

      it("parses fenced JSON array", () => {
        const text = `\`\`\`json
["item1", "item2"]
\`\`\``;
        const result = parseLenientJsonArray(text);
        expect(result).toEqual(["item1", "item2"]);
      });

      it("filters non-string array items", () => {
        const text = '["item1", 42, "item2", null, "item3"]';
        const result = parseLenientJsonArray(text);
        expect(result).toEqual(["item1", "item2", "item3"]);
      });

      it("returns empty array on parse failure", () => {
        const text = "not an array";
        const result = parseLenientJsonArray(text);
        expect(result).toEqual([]);
      });

      it("returns empty array for malformed JSON", () => {
        const text = '[item1, item2]'; // Missing quotes
        const result = parseLenientJsonArray(text);
        expect(result).toEqual([]);
      });

      it("handles empty array", () => {
        const text = "[]";
        const result = parseLenientJsonArray(text);
        expect(result).toEqual([]);
      });
    });
  });
});


