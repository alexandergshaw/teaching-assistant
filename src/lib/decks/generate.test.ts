import { describe, it, expect } from "vitest";
import {
  roleTitlePrefix,
  buildDeckPrompt,
  scaffoldDeck,
  type DeckGenContext,
} from "./generate";
import {
  emptyDeckTemplate,
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
        },
        {
          role: "concept" as SlideRole,
          title: "",
          notes: "Understanding loops",
          includeCode: false,
          codeLanguage: "",
          maxBullets: 4,
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
        },
      ];
      const ctx: DeckGenContext = { subject: "Test", loopItems: {} };

      const result = scaffoldDeck(template, resolved, ctx);
      expect(result.slides[0].bullets.length).toBeGreaterThan(0);
    });
  });
});
