import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import {
  SLIDE_DECK_JSON_SHAPE,
  SLIDE_STRUCTURE_REQUIREMENTS,
  slideDeckJsonShapeWith,
  slideDeckJsonShape,
  slideStructureRequirements,
  enforceNoCodeForApplied,
} from "./slide-prompt";
import { PLAIN_LANGUAGE_CONTRACT } from "./artifact-voice";
import { buildConceptCycleInstruction } from "./lecture-concepts";
import type { SlideData } from "@/app/actions-types";

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

  // Applied-course slide graphics: non-code decks now ask for a real
  // matrix/process/table visual on the Artifact slide instead of prose-only
  // bullets. The coding contract is untouched by this - it is already pinned
  // byte-for-byte above (length + sha256), which is the strongest guarantee
  // that adding graphics to the applied side left it alone; the checks below
  // add a second, human-readable guard against the same regression.
  describe("applied-course slide graphics", () => {
    const applied = slideStructureRequirements("applied");
    const appliedShape = slideDeckJsonShape("applied");

    it("shows the graphic field in the applied JSON shape", () => {
      expect(appliedShape).toContain('"graphic"');
    });

    it("requires every Artifact slide to carry a graphic", () => {
      expect(applied).toContain("EVERY Artifact slide MUST carry a graphic");
    });

    it("names all three graphic kinds and their exact field shapes", () => {
      expect(applied).toContain('"kind": "matrix2x2"');
      expect(applied).toContain('"kind": "process"');
      expect(applied).toContain('"kind": "table"');
      expect(applied).toContain('"xAxisLabel"');
      expect(applied).toContain('"quadrants"');
      expect(applied).toContain('"steps"');
      expect(applied).toContain('"headers"');
    });

    it("never offers a chart/plot kind", () => {
      expect(applied.toLowerCase()).not.toContain("bar chart");
      expect(applied.toLowerCase()).not.toContain("line chart");
      expect(applied.toLowerCase()).not.toContain("pie chart");
    });

    it("requires matrix2x2 or table for Judgment Call (P3-AC4: upgraded from SHOULD to MUST), and process as SHOULD/MAY (not mandatory) for Principle", () => {
      expect(applied).toContain('EVERY Judgment Call slide MUST use a "matrix2x2" or "table"');
      expect(applied).not.toContain("Judgment Call slides SHOULD use");
      expect(applied).toContain("Principle slides MAY use");
    });

    it("caps a graphic slide to one graphic and 2 bullets", () => {
      expect(applied).toContain("At most one graphic per slide");
      expect(applied).toContain('keeps its "bullets" to 2');
    });

    // RCA20 (RCA round 4): the Agenda slide used to be over-constrained -
    // AGENDA SLIDE requires its bullets to list EVERY concept (up to 7, and
    // at 7 concepts the bullets are what names the one the table's 6-row cap
    // can't hold), SLIDE GRAPHICS requires it to carry a graphic, the
    // general graphic-slide rule capped bullets at 2, and the shared bullet
    // rule requires each one to be a complete, self-explanatory sentence -
    // satisfiable only by cramming. Exempting the Agenda slide from the
    // 2-bullet cap (its bullet list, not the graphic, is the slide's
    // primary content) resolves this without touching the other three
    // requirements.
    it("RCA20: exempts the Agenda slide from the 2-bullet graphic cap, since its bullets (not the graphic) list every concept", () => {
      const graphicCapLine = applied.split("\n").find((l) => l.includes('keeps its "bullets" to 2'));
      expect(graphicCapLine).toBeDefined();
      expect(graphicCapLine).toContain("except the Agenda slide");
      expect(graphicCapLine!.toLowerCase()).toContain("exempt");
    });

    it("states the no-fabrication rule explicitly for graphics", () => {
      expect(applied).toContain("never invent figures, dates, statistics");
    });

    it("the coding contract stays entirely free of the word 'graphic'", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).not.toContain("graphic");
      expect(SLIDE_DECK_JSON_SHAPE).not.toContain("graphic");
    });
  });

  // AC4: the instructor's own words - "instead of asking students to code,
  // you should be identifying the relevant tech that students would need to
  // use ... and then having them work with free versions of that tech". The
  // existing "Modern Tech to Explore" CLOSING section is a deck-level recap,
  // not per-module hands-on work with a named tool - these checks pin the
  // NEW per-concept requirement, distinct from that closing section.
  describe("applied courses fill the hands-on slot with real professional tools (AC4)", () => {
    const applied = slideStructureRequirements("applied");
    const appliedShape = slideDeckJsonShape("applied");

    it("the applied JSON shape has a top-level moduleTools field", () => {
      expect(appliedShape).toContain('"moduleTools"');
    });

    it("the coding JSON shape has no moduleTools field", () => {
      expect(SLIDE_DECK_JSON_SHAPE).not.toContain("moduleTools");
    });

    it("requires a real, named tool per concept, never an invented product", () => {
      expect(applied).toContain("REAL PROFESSIONAL TOOLS");
      expect(applied).toContain("never invent a product");
    });

    it("requires the free way to access the tool, so no purchase is ever implied", () => {
      expect(applied.toLowerCase()).toContain("free tier");
      expect(applied.toLowerCase()).toContain("free trial");
      expect(applied.toLowerCase()).toContain("community edition");
      expect(applied).toContain("never asked to buy anything");
    });

    it("the Artifact slide must name the tool and introduce it", () => {
      const artifactLine = applied.split("\n").find((line) => line.includes("Artifact slide"));
      expect(artifactLine).toBeDefined();
      expect(artifactLine).toContain('Name the tool from "moduleTools"');
      expect(artifactLine).toContain("what practitioners use that tool for");
    });

    it("the Your Turn slide must require the SAME tool, in its free form", () => {
      const yourTurnLine = applied.split("\n").find((line) => line.includes("Your Turn slide"));
      expect(yourTurnLine).toBeDefined();
      expect(yourTurnLine).toContain("done IN the same tool named on the Artifact slide");
    });

    it("states tool continuity explicitly between Artifact and Your Turn", () => {
      expect(applied).toContain("TOOL CONTINUITY");
    });

    it("the coding contract is untouched by the AC4 addition (still byte-identical, see the pin above)", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).not.toContain("moduleTools");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).not.toContain("REAL PROFESSIONAL TOOLS");
    });
  });

  // AC2: the data-layer guard, independent of whatever the prompt says - the
  // whole point is that it holds even when a prompt regression reintroduces
  // code into an applied deck.
  describe("enforceNoCodeForApplied", () => {
    const codingSlide: SlideData = { title: "Example: loops", bullets: ["b"], code: "for x in y: pass", codeLanguage: "python" };
    const plainSlide: SlideData = { title: "Principle: risk", bullets: ["b"] };

    it("is a no-op for a coding course, even with code present", () => {
      const result = enforceNoCodeForApplied([codingSlide, plainSlide], "coding");
      expect(result.violations).toBe(0);
      expect(result.slides[0].code).toBe("for x in y: pass");
      expect(result.slides[0].codeLanguage).toBe("python");
    });

    it("strips code/codeLanguage from an applied slide and counts the violation", () => {
      const result = enforceNoCodeForApplied([codingSlide, plainSlide], "applied");
      expect(result.violations).toBe(1);
      expect(result.slides[0].code).toBeUndefined();
      expect(result.slides[0].codeLanguage).toBeUndefined();
      // Everything else on the slide survives - this is a targeted strip,
      // not a dropped slide.
      expect(result.slides[0].title).toBe("Example: loops");
      expect(result.slides[0].bullets).toEqual(["b"]);
    });

    it("a clean applied deck (no code anywhere) reports zero violations", () => {
      const result = enforceNoCodeForApplied([plainSlide], "applied");
      expect(result.violations).toBe(0);
      expect(result.slides).toEqual([plainSlide]);
    });

    it("never mutates the input slide objects", () => {
      const original = { ...codingSlide };
      enforceNoCodeForApplied([codingSlide], "applied");
      expect(codingSlide).toEqual(original);
    });
  });

  describe("slideDeckJsonShapeWith kind selection", () => {
    it("defaults to the coding shape when kind is omitted (every pre-existing call site)", () => {
      const result = slideDeckJsonShapeWith('"announcement": "text"');
      expect(result).not.toContain("moduleTools");
      expect(result.replace(/, "announcement": "text"\n}$/, "}")).toBe(SLIDE_DECK_JSON_SHAPE);
    });

    it("extends the applied shape when kind is 'applied'", () => {
      const result = slideDeckJsonShapeWith('"announcement": "text"', "applied");
      expect(result).toContain("moduleTools");
      expect(result).toContain('"announcement": "text"');
      const opens = (result.match(/\{/g) ?? []).length;
      const closes = (result.match(/\}/g) ?? []).length;
      expect(opens).toBe(closes);
    });
  });

  // Group P, Feature P2: the applied deck flows as a lecture instead of a
  // 42-slide skeleton - an audited 16-week course had no agenda, no section
  // dividers, no bridges between concepts, no recap, and 8 homework slides
  // sitting mid-lecture regardless of week or lecture length.
  describe("Feature P2: lecture flow", () => {
    const applied = slideStructureRequirements("applied");
    const appliedShape = slideDeckJsonShape("applied");

    it("P2-AC1: requires an Agenda slide as the third slide, carrying a graphic of this lecture's concepts", () => {
      expect(applied).toContain("AGENDA SLIDE");
      expect(applied).toContain('the THIRD slide (immediately after the Case Study slide) MUST be titled "Agenda:');
      expect(applied).toContain("MUST carry a graphic (see SLIDE GRAPHICS below) that maps the lecture");
      expect(appliedShape).toContain('"title": "Agenda: ..."');
      expect(appliedShape).toContain('"kind": "process"');
    });

    // RCA13 (RCA round 3): the Agenda's mandatory graphic used to always be
    // "process", which cannot render below PROCESS_MIN_STEPS (3) - impossible
    // at the 2-concept floor (a 20-minute lecture, entry 99 AC3) - and
    // silently truncated at the 7-concept ceiling (75+ minutes). The
    // requirement now names both a "process" case (3-6 concepts, unchanged)
    // and a "table" fallback (2 or 7 concepts, the only values outside 3-6
    // conceptCountForMinutes can produce) - see slide-graphics.test.ts's
    // "RCA13: the Agenda graphic is satisfiable at every concept count" for
    // the behavioral proof this is actually constructible and unflagged.
    it("P2-AC1 (RCA13): the Agenda requirement adapts its graphic shape to the concept count instead of always demanding process", () => {
      expect(applied).toContain('with 3 to 6 concepts, a "process" graphic');
      expect(applied).toContain("too few for \"process\"");
      expect(applied).toContain('with 2 concepts');
      expect(applied).toContain("7 concepts");
      expect(applied).toContain('a "table" graphic instead');
      expect(applied).toContain("Section");
      expect(applied).toContain("What You Will Be Able To Do");
    });

    it("P2-AC1 (RCA13): states explicitly that no concept is ever silently dropped from the Agenda, even at the 7-concept table cap", () => {
      expect(applied).toContain("no concept is ever silently dropped from the lecture's map");
    });

    it("P2-AC1: the Agenda slide appears after the Case Study slide and before the first Principle slide in the JSON shape", () => {
      const caseStudyIndex = appliedShape.indexOf("Case Study:");
      const agendaIndex = appliedShape.indexOf("Agenda:");
      const principleIndex = appliedShape.indexOf("Principle:");
      expect(agendaIndex).toBeGreaterThan(caseStudyIndex);
      expect(agendaIndex).toBeLessThan(principleIndex);
    });

    it("P2-AC2: requires a Section divider immediately before each concept's Principle slide, with exactly two bullets", () => {
      expect(applied).toContain("SECTION DIVIDERS");
      expect(applied).toContain('"Section <n>: <concept>"');
      expect(applied).toContain("immediately before each concept's Principle slide");
      expect(applied).toContain("including the very first concept");
      expect(appliedShape).toContain('"title": "Section 1: ..."');
    });

    it("P2-AC3: requires a Bridge slide after each concept's cycle except the last, naming the next concept", () => {
      expect(applied).toContain("BRIDGES");
      expect(applied).toContain('"Bridge: <this concept> to <next concept>"');
      expect(applied).toContain("EXCEPT THE LAST one in the plan");
      expect(applied).toContain("The LAST concept in the plan gets no Bridge slide");
      expect(appliedShape).toContain('"title": "Bridge: ... to ..."');
    });

    it("P2-AC4: requires a Recap slide that names the opening Case Study's organization and closes the loop", () => {
      expect(applied).toContain('titled EXACTLY "Recap: Where We Landed"');
      expect(applied).toContain("MUST name, by name, the organization from this deck's OPENING Case Study slide");
      expect(appliedShape).toContain('"title": "Recap: Where We Landed"');
    });

    it("P2-AC5: requires a Next Week slide, or Where This Goes Next for the final week", () => {
      expect(applied).toContain('"Next Week: <next week\'s topic>"');
      expect(applied).toContain('title this slide "Where This Goes Next" instead');
      expect(applied).toContain("For the course's FINAL week");
      expect(appliedShape).toContain('"title": "Next Week: ..."');
    });

    it("P2-AC6: moves Post-Lecture Practice to the very end, behind an Appendix divider, after Documentation & References", () => {
      expect(applied).toContain('titled EXACTLY "Appendix: Post-Lecture Practice"');
      expect(applied).toContain("the VERY LAST section of the deck");
      expect(applied).toContain('appearing AFTER "Documentation & References" above');

      const referencesIndex = appliedShape.indexOf("Documentation & References");
      const appendixIndex = appliedShape.indexOf("Appendix: Post-Lecture Practice");
      const postLecturePracticeIndex = appliedShape.lastIndexOf("Post-Lecture Practice: ...");
      expect(appendixIndex).toBeGreaterThan(referencesIndex);
      expect(postLecturePracticeIndex).toBeGreaterThan(appendixIndex);
    });

    it("P2-AC6: Failure Modes no longer sits directly before Post-Lecture Practice in the closing-sections prose", () => {
      const closingSections = applied.slice(applied.indexOf("CLOSING SECTIONS"));
      const failureModesIndex = closingSections.indexOf("A. FAILURE MODES");
      const documentationIndex = closingSections.indexOf("B. DOCUMENTATION - KEY CONCEPTS");
      const appendixIndex = closingSections.indexOf("H. APPENDIX - POST-LECTURE PRACTICE");
      expect(documentationIndex).toBeGreaterThan(failureModesIndex);
      // Post-Lecture Practice is now the LAST lettered section, not the
      // second one straight after Failure Modes.
      expect(appendixIndex).toBeGreaterThan(documentationIndex);
    });

    it("P2-AC7 is built by the caller from the schedule, not stated as static prose here (see course-planning-grounding.ts)", () => {
      // Nothing to pin in the static contract itself - documented so a
      // reader does not go looking for a "PRIOR WEEKS" string in here.
      expect(applied).not.toContain("PRIOR WEEKS");
    });

    it("P2-AC8: the module doc explains the case-study-reuse list is built at runtime, not static prose", () => {
      expect(applied).not.toContain("CASE STUDIES ALREADY USED");
    });

    it("P2-AC9: states an explicit slide budget derived from the concept count, capping in-lecture Your Turn pairs at 2", () => {
      expect(applied).toContain("SLIDE BUDGET");
      expect(applied).toContain("10 + concepts * 7");
      expect(applied).toContain("only the FIRST 2 concepts in the CONCEPT PLAN get their full in-lecture");
      expect(applied).toContain("Never produce more than 2 in-lecture");
    });

    // RCA8 (RCA round 2): the old "8 + concepts * 9" formula contradicted the
    // structure this same contract mandates (~43 slides at the documented
    // 50-minute/5-concept default, not ~53 - see slide-prompt.ts's SLIDE
    // BUDGET comment for the count), and it budgeted by the wrong metric
    // besides: a Section/Bridge/Agenda/Recap slide is seconds of talking,
    // while an in-lecture Your Turn task is several minutes, so slide COUNT
    // was never what made a deck deliverable. This pins that the rule now
    // budgets by TIME and states the signpost-vs-Your-Turn cost distinction
    // explicitly, rather than asserting a slide-count formula that
    // contradicts the rules above it.
    it("P2-AC9 (RCA8): budgets by lecture duration and slide-cost, not by a slide-count formula alone", () => {
      expect(applied).toContain("LECTURE DURATION");
      expect(applied).toContain("SLIDE COUNT is not what determines that");
      expect(applied).toContain("10-20 seconds of talking");
      expect(applied).toContain("several minutes of class time");
      expect(applied).not.toContain("8 + concepts * 9");
    });

    // RCA14 (RCA round 3): "10 + concepts * 7" was ambiguous about whether it
    // counted in-lecture slides only or the whole deck including the
    // ~22-slide Post-Lecture Practice appendix - entry 100 AC7's own
    // 85-slide-at-7-concepts derivation counts the TOTAL, so two artifacts
    // from the same RCA round stated incompatible numbers for the same
    // contract. The rule must now say explicitly which one "10 + concepts *
    // 7" counts, and give the appendix its own rough size instead of leaving
    // it to be confused with a whole-deck cap.
    it("P2-AC9 (RCA14): SLIDE BUDGET states explicitly that its figure counts IN-LECTURE slides only, excluding the Post-Lecture Practice appendix", () => {
      expect(applied).toContain('"10 + concepts * 7" IN-LECTURE slides');
      expect(applied).toContain("EXCLUDES the separate Post-Lecture Practice appendix");
      expect(applied).toContain('"2 + concepts * 4"');
      expect(applied).toContain("Never read this figure");
      expect(applied).toContain("cap on the in-lecture portion only");
    });

    it("P2-AC10: requires assertion titles - a short complete sentence after the colon, not a topic label", () => {
      expect(applied).toContain("ASSERTION TITLES");
      expect(applied).toContain("never a topic label");
      expect(applied).toContain("Scope creep kills a schedule before it touches the budget");
      expect(applied).toContain("never \"Principle: Managing Project Scope\"");
    });

    it("P2-AC10: the load-bearing slide prefixes are unchanged (Principle:/In Practice:/Artifact:/Judgment Call:/Your Turn:/Model Response:/Agenda:)", () => {
      for (const prefix of [
        "Principle:",
        "In Practice:",
        "Artifact:",
        "Judgment Call:",
        "Your Turn:",
        "Model Response:",
        "Agenda:",
      ]) {
        expect(applied).toContain(prefix);
      }
    });

    it("the coding contract stays entirely free of the new applied-only lecture-flow markers", () => {
      for (const marker of ["Agenda:", "Section 1:", "Bridge:", "Recap: Where We Landed", "Appendix: Post-Lecture Practice", "SLIDE BUDGET"]) {
        expect(SLIDE_STRUCTURE_REQUIREMENTS).not.toContain(marker);
        expect(SLIDE_DECK_JSON_SHAPE).not.toContain(marker);
      }
    });
  });

  // RCA18 (RCA round 4): generateLectureFromMaterialsAction
  // (src/app/actions/course-planning.ts) is a SECOND reachable builder of
  // this same applied prompt - the "prepare-lecture" workflow step exposes
  // it with courseKind "applied" - and it supplies NO CONCEPT PLAN, NO
  // LECTURE DURATION, and NO week context at all (unlike generateSlidesFromTopic
  // in course-planning-grounding.ts, which builds all three). The five P2
  // lecture-flow rules below all presuppose one of those, exactly the shape
  // RCA12 already fixed once for the NEXT WEEK slide on the OTHER builder -
  // this is that same defect surviving on a second path. Each rule must name
  // what to do absent the data, following the precedent BREADTH MINIMUM
  // already sets ("Absent a concept plan, ...", see above) - never leaving
  // the model to fabricate a concept plan, a duration, or a next week's
  // topic just to satisfy the letter of the rule.
  describe("Feature RCA18: lecture-flow rules degrade absent CONCEPT PLAN / LECTURE DURATION / week context", () => {
    const applied = slideStructureRequirements("applied");

    function bulletStartingWith(name: string): string {
      const bullet = applied.split(/\n(?=- )/).find((b) => b.trim().startsWith(`- ${name}`));
      expect(bullet, `a bullet named "${name}" exists`).toBeDefined();
      return bullet!;
    }

    it("AGENDA SLIDE names what to list, and how to pick the graphic shape, absent a CONCEPT PLAN", () => {
      const bullet = bulletStartingWith("AGENDA SLIDE:");
      expect(bullet).toContain("Absent a CONCEPT PLAN");
      expect(bullet).toContain("this deck's own material organizes itself into");
    });

    it("APPLIED CONCEPT CYCLE applies to every concept the deck itself organizes around, not only ones an external plan named", () => {
      const bullet = bulletStartingWith("APPLIED CONCEPT CYCLE:");
      expect(bullet).toContain("Absent a CONCEPT PLAN");
    });

    it("SECTION DIVIDERS numbers sections from the deck's own teaching order absent a CONCEPT PLAN", () => {
      const bullet = bulletStartingWith("SECTION DIVIDERS:");
      expect(bullet).toContain("Absent a CONCEPT PLAN");
      expect(bullet).toContain("this deck itself teaches its concepts");
    });

    it("SLIDE BUDGET sizes the deck to the material itself absent a stated LECTURE DURATION or CONCEPT PLAN, and still caps the in-lecture pair at 2", () => {
      const bullet = bulletStartingWith("SLIDE BUDGET:");
      expect(bullet).toContain("Absent a stated LECTURE DURATION or CONCEPT PLAN");
      expect(bullet).toContain("size the deck to the material itself");
      expect(bullet).toContain('cap in-lecture "Your Turn"/"Model Response" pairs at the first 2 concepts');
    });

    // The explicit callout from the RCA: NEXT WEEK must never be required to
    // invent a topic. Absent any week context, the slide is not produced at
    // all - neither "Next Week: ..." nor "Where This Goes Next".
    it("NEXT WEEK is omitted entirely - never invented - absent any week context", () => {
      expect(applied).toContain("E. NEXT WEEK:");
      const closingSections = applied.slice(applied.indexOf("CLOSING SECTIONS"));
      const nextWeekSection = closingSections.slice(
        closingSections.indexOf("E. NEXT WEEK:"),
        closingSections.indexOf("F. MODERN TECH")
      );
      expect(nextWeekSection).toContain("omit this slide entirely");
      expect(nextWeekSection).toContain("Absent any information about which week this is");
      expect(nextWeekSection.toLowerCase()).toContain("without that data");
    });

    // Non-vacuity: every rule this describe block exercises actually still
    // names the data it depends on - a rule that silently dropped its own
    // CONCEPT PLAN/LECTURE DURATION dependency would make the checks above
    // pass for the wrong reason (nothing left to scope).
    it("every rule checked above still actually names the dependency it is degrading for (not vacuously passing)", () => {
      expect(bulletStartingWith("AGENDA SLIDE:")).toContain("CONCEPT PLAN");
      expect(bulletStartingWith("APPLIED CONCEPT CYCLE:")).toContain("CONCEPT PLAN");
      expect(bulletStartingWith("SECTION DIVIDERS:")).toContain("CONCEPT PLAN");
      expect(bulletStartingWith("SLIDE BUDGET:")).toContain("LECTURE DURATION");
      const closingSections = applied.slice(applied.indexOf("CLOSING SECTIONS"));
      const nextWeekSection = closingSections.slice(
        closingSections.indexOf("E. NEXT WEEK:"),
        closingSections.indexOf("F. MODERN TECH")
      );
      expect(nextWeekSection).toContain("FINAL week");
    });
  });

  // Group P, Feature P3: graphics enforced at the data layer (see
  // src/lib/slide-graphics.test.ts for enforceGraphicsForApplied's own unit
  // tests) - this file only pins the PROMPT side of P3.
  describe("Feature P3: graphics prompt requirements", () => {
    const applied = slideStructureRequirements("applied");

    it("P3-AC4: Judgment Call slides MUST (not SHOULD) carry a matrix2x2 or table graphic", () => {
      expect(applied).toContain("EVERY Judgment Call slide MUST use a \"matrix2x2\" or \"table\"");
    });

    it("P3-AC5: no graphics language reaches the coding contract", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).not.toContain("graphic");
      expect(SLIDE_DECK_JSON_SHAPE).not.toContain("graphic");
    });
  });

  // RCA regression (docs/REGRESSION.md entry 100 AC1 amendment, entry 156):
  // buildConceptCycleInstruction("applied") and slideStructureRequirements
  // ("applied") are two independently-written blocks concatenated into ONE
  // prompt for every applied deck (course-planning-grounding.ts). They used
  // to disagree: buildConceptCycleInstruction demanded a Your Turn slide for
  // EVERY concept "without exception", while SLIDE BUDGET forbade one for
  // concepts past the first 2. buildConceptCycleInstruction itself (and this
  // specific cross-reference wording) lives in lecture-concepts.ts, out of
  // this RCA round's file scope - this pins its CURRENT, already-corrected
  // wording directly, a plain substring check rather than a parser, so a
  // future edit there that drops the scoping cannot silently regress.
  it("buildConceptCycleInstruction's Your Turn/Model Response mention is scoped to what the requirements below decide, never asserted unconditionally", () => {
    const concepts = ["Concept One", "Concept Two", "Concept Three", "Concept Four", "Concept Five"];
    const instruction = buildConceptCycleInstruction(concepts, "applied");
    expect(instruction).toContain("the in-lecture Your Turn / Model Response pair for the concepts the requirements below identify");

    // The cap itself must still be present in the composed prompt - fixing
    // the contradiction is not the same as silently dropping the
    // deliverability constraint that motivated it (the shipped decks ran
    // 40-43 slides for a 50-minute session with five in-lecture tool
    // exercises).
    const assembled = instruction + "\n" + slideStructureRequirements("applied");
    expect(assembled).toContain('Never produce more than 2 in-lecture "Your Turn"/"Model Response" pairs');
  });

});

// The "structural consistency guard" (checks 1-3: conditional-slide scoping,
// title-format agreement, and graphic-KIND agreement) moved to its own
// sibling file, slide-prompt.structural-guard.test.ts, to keep this file
// under the 1000-line cap - see that file for RCA15/RCA17's own history.
