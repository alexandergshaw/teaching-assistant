import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import {
  SLIDE_DECK_JSON_SHAPE,
  SLIDE_STRUCTURE_REQUIREMENTS,
  slideDeckJsonShapeWith,
  slideDeckJsonShape,
  slideStructureRequirements,
} from "./slide-prompt";
import { PLAIN_LANGUAGE_CONTRACT } from "./artifact-voice";

describe("slide-prompt shared pedagogical contract", () => {
  describe("SLIDE_STRUCTURE_REQUIREMENTS", () => {
    it("contains the Case Study marker", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("Case Study:");
    });

    it("contains the Example marker", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("Example:");
    });

    it("contains the Walkthrough marker", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("Walkthrough:");
    });

    it("contains the Practice marker", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("Practice:");
    });

    it("contains the Answer marker", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("Answer:");
    });

    it("contains the Post-Lecture Practice marker", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("Post-Lecture Practice:");
    });

    it("contains Documentation & References marker", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("Documentation & References");
    });

    it("contains Modern Tech marker", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("Modern Tech:");
    });

    it("contains MODERN TECH TO EXPLORE section", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("MODERN TECH TO EXPLORE");
    });

    it("contains bullet limit requirement", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("Maximum 4 bullets");
    });

    it("contains breadth requirement", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("BREADTH");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("maximum breadth");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("Enumerate every subtopic");
    });

    it("contains minimum-difficulty in-lecture practice requirement", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("introductory and gently scaffolded");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("single skill, no tricks");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("mirrors the worked example closely");
    });

    it("contains POST-LECTURE PRACTICE section", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("POST-LECTURE PRACTICE");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("Post-Lecture Practice");
    });

    it("specifies exactly 2 post-lecture problems per concept", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("exactly 2 additional practice problems");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("increasing difficulty");
    });

    // A real generated deck met every requirement above with exactly ONE
    // concept and stopped - these pin the fix: an explicit minimum-concept
    // floor and a per-concept cycle requirement, in the shared contract both
    // course kinds pull from.
    it("states a minimum-concept-count floor, not just a breadth aspiration", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("BREADTH MINIMUM");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("never stop at a single concept");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("CONCEPT PLAN");
    });

    it("requires the full cycle to be applied to EVERY concept, not just the first", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("its OWN full cycle");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("do not stop after only the first");
    });

    it("requires concrete, checkable substance in bullets (not generic statements)", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("concrete and checkable");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain(
        "never a generic statement that could apply to any topic in the field"
      );
    });

    it("gives speaker notes a concrete length target, not just a sentence count", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("3-6 FULL sentences");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("60-120 words");
    });
  });

  describe("the minimum-concept-count and substance requirements apply to BOTH course kinds", () => {
    it("the applied variant states the same minimum-concept-count floor", () => {
      const applied = slideStructureRequirements("applied");
      expect(applied).toContain("BREADTH MINIMUM");
      expect(applied).toContain("never stop at a single concept");
      expect(applied).toContain("its OWN full cycle");
    });

    it("the applied variant requires the same concrete-substance grounding", () => {
      const applied = slideStructureRequirements("applied");
      expect(applied).toContain("concrete and checkable");
    });

    it("the applied variant requires the same speaker-notes length", () => {
      const applied = slideStructureRequirements("applied");
      expect(applied).toContain("3-6 FULL sentences");
      expect(applied).toContain("60-120 words");
    });

    it("the applied variant still forbids code even with the new requirements added", () => {
      const applied = slideStructureRequirements("applied");
      expect(applied).toContain('NEVER include a "code" or "codeLanguage" field');
    });

    it("the coding variant still requires code on the cycle slides", () => {
      const coding = slideStructureRequirements("coding");
      expect(coding).toContain('All of Example, Walkthrough, Practice, and Answer slides must include "code"');
    });
  });

  describe("SLIDE_DECK_JSON_SHAPE", () => {
    it("contains presentationTitle field", () => {
      expect(SLIDE_DECK_JSON_SHAPE).toContain("presentationTitle");
    });

    it("contains codeLanguage field", () => {
      expect(SLIDE_DECK_JSON_SHAPE).toContain("codeLanguage");
    });

    it("contains Practice example slide", () => {
      expect(SLIDE_DECK_JSON_SHAPE).toContain("Practice: ");
    });

    it("contains Answer example slide", () => {
      expect(SLIDE_DECK_JSON_SHAPE).toContain("Answer: ");
    });

    it("contains Modern Tech example slide", () => {
      expect(SLIDE_DECK_JSON_SHAPE).toContain("Modern Tech: ");
    });

    it("positions Modern Tech slide after Documentation: Key Concepts", () => {
      const keyConceptsIndex = SLIDE_DECK_JSON_SHAPE.indexOf("Documentation: Key Concepts");
      const modernTechIndex = SLIDE_DECK_JSON_SHAPE.indexOf("Modern Tech: ");
      expect(modernTechIndex).toBeGreaterThan(keyConceptsIndex);
    });

    it("positions Modern Tech slide before Documentation & References", () => {
      const modernTechIndex = SLIDE_DECK_JSON_SHAPE.indexOf("Modern Tech: ");
      const referencesIndex = SLIDE_DECK_JSON_SHAPE.indexOf("Documentation & References");
      expect(modernTechIndex).toBeLessThan(referencesIndex);
    });

    it("has balanced braces", () => {
      const openBraces = (SLIDE_DECK_JSON_SHAPE.match(/{/g) || []).length;
      const closeBraces = (SLIDE_DECK_JSON_SHAPE.match(/}/g) || []).length;
      expect(openBraces).toBe(closeBraces);
    });
  });

  describe("slideDeckJsonShapeWith", () => {
    it("injects the extra field before the closing brace", () => {
      const result = slideDeckJsonShapeWith('"test": "value"');
      expect(result).toContain(', "test": "value"\n}');
    });

    it("produces balanced braces", () => {
      const result = slideDeckJsonShapeWith('"announcement": "text"');
      const openBraces = (result.match(/{/g) || []).length;
      const closeBraces = (result.match(/}/g) || []).length;
      expect(openBraces).toBe(closeBraces);
    });

    it("preserves the presentationTitle and slides structure", () => {
      const result = slideDeckJsonShapeWith('"announcement": "text"');
      expect(result).toContain("presentationTitle");
      expect(result).toContain("slides");
      expect(result).toContain("announcement");
    });

    it("keeps braces balanced with the extra field injected", () => {
      const result = slideDeckJsonShapeWith('"announcement": "example announcement"');
      const opens = (result.match(/\{/g) ?? []).length;
      const closes = (result.match(/\}/g) ?? []).length;
      expect(opens).toBe(closes);
      // The extra field must land inside the object, before the final brace.
      expect(result.trimEnd().endsWith("}")).toBe(true);
      expect(result.indexOf('"announcement"')).toBeLessThan(result.lastIndexOf("}"));
    });
  });

  // R2/R8: the coding contract's JSON SHAPE (slide field names and slide
  // sequence) must stay byte-identical after the applied-course rewrite -
  // that pin still holds and is unaffected by the later voice/flow rewrite
  // below, since that rewrite only touches the prose REQUIREMENTS text, not
  // the JSON shape.
  describe("the coding JSON shape is untouched by the applied-course rewrite", () => {
    it("SLIDE_DECK_JSON_SHAPE is byte-identical to its pre-rewrite value", () => {
      expect(SLIDE_DECK_JSON_SHAPE.length).toBe(1000);
      expect(createHash("sha256").update(SLIDE_DECK_JSON_SHAPE).digest("hex")).toBe(
        "5b2909b68433cc836eddff9fd515c345ae948c752a759294474818d600f0452b"
      );
    });

    it("slideDeckJsonShape('coding') returns the exact SLIDE_DECK_JSON_SHAPE constant", () => {
      expect(slideDeckJsonShape("coding")).toBe(SLIDE_DECK_JSON_SHAPE);
    });

    it("slideStructureRequirements('coding') returns the exact SLIDE_STRUCTURE_REQUIREMENTS constant", () => {
      expect(slideStructureRequirements("coding")).toBe(SLIDE_STRUCTURE_REQUIREMENTS);
    });
  });

  // The instructor review of a real generated course (16-week MGT 422) found
  // slides reading as four parallel declaratives with no connective tissue
  // and no link to the student, in professional-register language ("the
  // levers of project success", "the social architecture of the project
  // environment"). This pins that SLIDE_STRUCTURE_REQUIREMENTS now composes
  // the shared voice contract (src/lib/artifact-voice.ts) and adds explicit
  // FLOW and CONNECT-TO-THE-STUDENT rules, for both course kinds - and pins
  // the exact length/hash of the coding constant post-rewrite so any future
  // drift here is deliberate, not accidental. The hash was generated by
  // reading the live file programmatically, not typed by hand.
  describe("the shared voice and flow contract", () => {
    it("SLIDE_STRUCTURE_REQUIREMENTS is byte-identical to its post-voice-rewrite value", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS.length).toBe(9189);
      expect(createHash("sha256").update(SLIDE_STRUCTURE_REQUIREMENTS).digest("hex")).toBe(
        "c28bda15e46f7212f538cb6ec1a96de18041bba96a8ede58f3c59eec0d4e0454"
      );
    });

    it("the coding variant composes PLAIN_LANGUAGE_CONTRACT verbatim", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain(PLAIN_LANGUAGE_CONTRACT);
    });

    it("the applied variant composes PLAIN_LANGUAGE_CONTRACT verbatim", () => {
      expect(slideStructureRequirements("applied")).toContain(PLAIN_LANGUAGE_CONTRACT);
    });

    it("both variants require slide bullets to read as a progression (FLOW)", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("FLOW:");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("progression");
      const applied = slideStructureRequirements("applied");
      expect(applied).toContain("FLOW:");
      expect(applied).toContain("progression");
    });

    it("both variants require the notes to hand off to the next slide by name or idea", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("names the next slide's topic or idea");
      const applied = slideStructureRequirements("applied");
      expect(applied).toContain("names the next slide's topic or idea");
    });

    it("both variants require grounding concepts in a situation the student has lived (CONNECT TO THE STUDENT)", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("CONNECT TO THE STUDENT:");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("group project");
      const applied = slideStructureRequirements("applied");
      expect(applied).toContain("CONNECT TO THE STUDENT:");
      expect(applied).toContain("group project");
    });

    it("CONNECT TO THE STUDENT is additive, not a replacement for the professional case study", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("IN ADDITION to the real-world case study");
      const applied = slideStructureRequirements("applied");
      expect(applied).toContain("IN ADDITION to the required Case Study and In Practice slides");
    });
  });

  // R1/R7/R8: the applied variant's six-slide concept cycle and its two new
  // deck-level sections (Failure Modes, Terminology).
  describe("the applied variant's six-slide concept cycle", () => {
    const applied = slideStructureRequirements("applied");
    const appliedShape = slideDeckJsonShape("applied");

    it("names all six cycle slide prefixes in the requirements text", () => {
      expect(applied).toContain("Principle:");
      expect(applied).toContain("In Practice:");
      expect(applied).toContain("Artifact:");
      expect(applied).toContain("Judgment Call:");
      expect(applied).toContain("Your Turn:");
      expect(applied).toContain("Model Response:");
    });

    it("names all six cycle slide prefixes in the JSON shape", () => {
      expect(appliedShape).toContain("Principle:");
      expect(appliedShape).toContain("In Practice:");
      expect(appliedShape).toContain("Artifact:");
      expect(appliedShape).toContain("Judgment Call:");
      expect(appliedShape).toContain("Your Turn:");
      expect(appliedShape).toContain("Model Response:");
    });

    it("requires the In Practice slide to name a real, documented case and never invent one", () => {
      expect(applied).toContain("In Practice:");
      expect(applied.toLowerCase()).toContain("never invent an organization");
    });

    it("requires the Artifact slide to show actual content, not describe it in the abstract", () => {
      const artifactLine = applied
        .split("\n")
        .find((line) => line.includes("Artifact slide"));
      expect(artifactLine).toBeDefined();
      expect(artifactLine).toContain("Do not describe the artifact in the abstract");
    });

    it("requires the Model Response slide to include both a strong and a weak response", () => {
      const modelResponseLine = applied
        .split("\n")
        .find((line) => line.includes("Model Response slide"));
      expect(modelResponseLine).toBeDefined();
      expect(modelResponseLine).toContain("STRONG response");
      expect(modelResponseLine).toContain("weak response");
    });

    it("requires the Failure Modes deck-level section", () => {
      expect(applied).toContain("Failure Modes:");
      expect(applied).toContain("FAILURE MODES");
    });

    it("requires the Terminology deck-level section", () => {
      expect(applied).toContain("Terminology:");
      expect(applied).toContain("TERMINOLOGY");
    });

    it("Failure Modes and Terminology appear in the JSON shape too", () => {
      expect(appliedShape).toContain("Failure Modes:");
      expect(appliedShape).toContain("Terminology:");
    });

    it("still forbids code on any applied slide", () => {
      expect(applied).toContain('NEVER include a "code" or "codeLanguage" field');
    });

    it("no longer describes the coding Walkthrough/Practice/Answer cycle", () => {
      expect(applied).not.toContain("Walkthrough slide");
      expect(applied).not.toContain("Answer slide -");
    });
  });

  // R8 sabotage guard: pins that the applied JSON shape never carries a
  // code/codeLanguage field anywhere, independent of the requirements text.
  describe("the applied JSON shape never carries a code field", () => {
    it("slideDeckJsonShape('applied') contains no 'code' or 'codeLanguage' key anywhere", () => {
      const appliedShape = slideDeckJsonShape("applied");
      expect(appliedShape).not.toContain('"code"');
      expect(appliedShape).not.toContain('"codeLanguage"');
    });
  });
});
