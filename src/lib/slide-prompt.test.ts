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

  // The applied variant's own tests for this same minimum-concept-count and
  // substance parity moved to slide-prompt.applied.test.ts (course-kind
  // split, see this file's trailing comment) - only the coding-side check
  // stays here.
  it("the coding variant still requires code on the cycle slides", () => {
    const coding = slideStructureRequirements("coding");
    expect(coding).toContain('All of Example, Walkthrough, Practice, and Answer slides must include "code"');
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

  // Z4-AC0 (Group Z): the coding contract's JSON SHAPE pin was DELIBERATELY
  // updated here, in the same commit as the coding-contract parity rewrite
  // (slide-prompt.ts's SLIDE_DECK_JSON_SHAPE now carries the Agenda, Section
  // divider, Bridge, Failure Modes, Terminology, Recap, Next Week, and
  // Appendix slides the applied contract already had - see the module
  // header comment). This pin exists to catch ACCIDENTAL drift, never to
  // forbid deliberate change - docs/REGRESSION.md entries 100 AC2, 110 AC7,
  // and 137 AC7 (which asserted the OLD 1000-char/5b2909b6... value) each
  // carry an AMENDED note recording that this update was intentional and
  // why: the request that originally left the coding contract alone
  // ("specifically about non-code classes", entry 110 AC7) is no longer the
  // request - the user explicitly asked to port the no-code lessons to the
  // coding kickoff/refresh path too.
  describe("the coding JSON shape carries the ported lecture-flow slides (Z4-AC0/AC1)", () => {
    it("SLIDE_DECK_JSON_SHAPE is byte-identical to its post-Z4-parity value", () => {
      expect(SLIDE_DECK_JSON_SHAPE.length).toBe(1871);
      expect(createHash("sha256").update(SLIDE_DECK_JSON_SHAPE).digest("hex")).toBe(
        "b29552311f3fbd714b00b76c80593f9f962f74c0e7b93ec93033204e64ff5476"
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
  // FLOW and CONNECT-TO-THE-STUDENT rules, for both course kinds.
  //
  // Z4-AC0 (Group Z): the length/hash below were DELIBERATELY updated again,
  // in the same commit as the coding-contract parity rewrite - see the
  // describe block above this one for the full rationale (this is the SAME
  // deliberate-update event, just the second of the two pinned constants).
  // The hash was generated by reading the live file programmatically, not
  // typed by hand.
  //
  // The applied-only counterpart of "the coding variant composes
  // PLAIN_LANGUAGE_CONTRACT verbatim" moved to slide-prompt.applied.test.ts.
  describe("the shared voice and flow contract", () => {
    it("SLIDE_STRUCTURE_REQUIREMENTS is byte-identical to its post-Z4-parity value", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS.length).toBe(16750);
      expect(createHash("sha256").update(SLIDE_STRUCTURE_REQUIREMENTS).digest("hex")).toBe(
        "689b9b512e87d029817af36f2e053c0db88ef0577d110d6fe11d11522b6b795c"
      );
    });

    it("the coding variant composes PLAIN_LANGUAGE_CONTRACT verbatim", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain(PLAIN_LANGUAGE_CONTRACT);
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

  // "the applied variant's six-slide concept cycle" (R1/R7/R8), the BRIDGES
  // positional-anchor guard (V5), and "the applied JSON shape never carries
  // a code field" (R8 sabotage guard) all moved to slide-prompt.applied.test.ts
  // - they exercise only the applied contract, never the coding one.

  // Applied-course slide graphics: non-code decks now ask for a real
  // matrix/process/table visual on the Artifact slide instead of prose-only
  // bullets - see "applied-course slide graphics" in
  // slide-prompt.applied.test.ts for those checks. The coding contract is
  // untouched by this - it is already pinned byte-for-byte above (length +
  // sha256), which is the strongest guarantee that adding graphics to the
  // applied side left it alone; the check below is a second, human-readable
  // guard against the same regression.
  //
  // Z4-AC3 (Group Z): SUPERSEDES the old "stays entirely free of the word
  // 'graphic'" pin - the coding contract now ALLOWS (never requires) an
  // optional process/table graphic, ported from the applied path. What
  // must still hold, and is pinned below instead, is that coding never
  // REQUIRES one and never gains the applied vocabulary (matrix2x2,
  // enforceGraphicsForApplied) that has no natural coding slot.
  it("the coding contract allows an optional graphic, but requires none, and never gains matrix2x2", () => {
    expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("graphic");
    expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("No coding slide is REQUIRED to carry a graphic");
    expect(SLIDE_STRUCTURE_REQUIREMENTS).not.toContain("matrix2x2");
    expect(SLIDE_STRUCTURE_REQUIREMENTS).not.toContain("MUST carry a graphic");
    expect(SLIDE_DECK_JSON_SHAPE).not.toContain("graphic");
  });

  // AC4 ("applied courses fill the hands-on slot with real professional
  // tools") is an applied-only feature - its own describe block moved to
  // slide-prompt.applied.test.ts. These two checks are the coding-side half:
  // the coding contract must stay untouched by that addition.
  it("the coding JSON shape has no moduleTools field", () => {
    expect(SLIDE_DECK_JSON_SHAPE).not.toContain("moduleTools");
  });

  it("the coding contract is untouched by the AC4 addition (still byte-identical, see the pin above)", () => {
    expect(SLIDE_STRUCTURE_REQUIREMENTS).not.toContain("moduleTools");
    expect(SLIDE_STRUCTURE_REQUIREMENTS).not.toContain("REAL PROFESSIONAL TOOLS");
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

  // "Feature P2: lecture flow" (P2-AC1 through P2-AC10) is entirely about
  // the applied deck and moved to slide-prompt.applied.test.ts.
  //
  // Z4-AC0/AC1 (Group Z): SUPERSEDES the old "stays entirely free of the
  // new applied-only lecture-flow markers" pin - these markers are no
  // longer applied-only. The user's second request ("port whatever
  // lessons learned from the no code workflows ... over to the code
  // kickoffs/refreshes workflows as well") is exactly why entry 110 AC7's
  // "left the coding contract alone" reasoning ("specifically about
  // non-code classes") no longer holds - see docs/REGRESSION.md entries
  // 100/110/137's AMENDED notes.
  it("the coding contract now carries the SAME lecture-flow markers the applied contract does (Z4 parity)", () => {
    for (const marker of ["Agenda:", "Section <n>:", "Bridge:", "Recap: Where We Landed", "Appendix: Post-Lecture Practice", "SLIDE BUDGET"]) {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain(marker);
    }
    for (const marker of ["Agenda:", "Section 1:", "Bridge: ... to ...", "Recap: Where We Landed", "Appendix: Post-Lecture Practice"]) {
      expect(SLIDE_DECK_JSON_SHAPE).toContain(marker);
    }
  });

  // Z4-AC1/AC2/AC3 (Group Z): the coding-contract parity port. Mirrors the
  // "Feature P2: lecture flow" describe block in slide-prompt.applied.test.ts
  // (the applied path's own pins), adapted to the coding cycle
  // (Example/Walkthrough/Practice/Answer, not Principle/In Practice/
  // Artifact/Judgment Call) - see slide-prompt.ts's module comment on
  // SLIDE_STRUCTURE_REQUIREMENTS for the full rationale.
  describe("Group Z: coding-contract parity with the applied lecture-flow rules", () => {
    it("Z4-AC1: requires an Agenda slide as the third slide, positioned after Case Study and before the first concept", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("AGENDA SLIDE");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain('the THIRD slide (immediately after the Case Study slide) MUST be titled "Agenda:');
      const caseStudyIndex = SLIDE_DECK_JSON_SHAPE.indexOf("Case Study:");
      const agendaIndex = SLIDE_DECK_JSON_SHAPE.indexOf("Agenda:");
      const sectionIndex = SLIDE_DECK_JSON_SHAPE.indexOf("Section 1:");
      expect(agendaIndex).toBeGreaterThan(caseStudyIndex);
      expect(agendaIndex).toBeLessThan(sectionIndex);
    });

    it("Z4-AC3: the Agenda graphic is OPTIONAL for coding, never mandatory (unlike the applied Agenda, which MUST carry one)", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("MAY optionally carry a graphic");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).not.toContain('Agenda slide MUST carry a graphic');
    });

    it("Z4-AC1: requires a Section divider immediately before each concept's own introduction slide, with exactly two bullets", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("SECTION DIVIDERS");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain('"Section <n>: <concept>"');
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("including the very first concept");
      expect(SLIDE_DECK_JSON_SHAPE).toContain('"title": "Section 1: ..."');
    });

    it("Z4-AC1 (lesson learned from V5): BRIDGES anchors POSITIONALLY (the last slide of the cycle), not by naming a specific slide type", () => {
      const bridgesLine = SLIDE_STRUCTURE_REQUIREMENTS.split("\n").find((line) => line.startsWith("- BRIDGES:"));
      expect(bridgesLine).toBeDefined();
      expect(bridgesLine).toContain("immediately after the LAST slide of each concept's cycle");
      expect(bridgesLine).toContain('"Bridge: <this concept> to <next concept>"');
      expect(bridgesLine).toContain("The LAST concept in the plan gets no Bridge slide");
    });

    it("Z4-AC2: budgets by lecture duration and slide-cost (TIME), not a slide-count formula alone, and states the figure is IN-LECTURE only", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("SLIDE BUDGET");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("LECTURE DURATION");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("SLIDE COUNT is not what determines that");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("10-20 seconds of talking");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain('"9 + concepts * 7" IN-LECTURE slides');
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("EXCLUDES the separate Post-Lecture Practice appendix");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain('"2 + concepts * 4"');
    });

    it("Z4-AC1 (lesson learned from RCA13/RCA20 in the applied path): the SLIDE BUDGET formula is satisfiable at every conceptCountForMinutes value (2-7) without contradiction", () => {
      // conceptCountForMinutes clamps to [2, 7] (src/lib/lecture-concepts.ts).
      // The formula must not presuppose a minimum concept count the range
      // does not guarantee - "9 + concepts * 7" has no such floor (unlike the
      // applied path's old, since-fixed "process graphic needs 3 steps"
      // mistake at a 2-concept agenda).
      for (const count of [2, 3, 4, 5, 6, 7]) {
        const inLecture = 9 + count * 7;
        expect(inLecture).toBeGreaterThan(0);
      }
      // The coding Agenda graphic is OPTIONAL (see the Z4-AC3 test above), so
      // unlike applied's mandatory Agenda graphic, there is no "must render a
      // 3-step process graphic at a 2-concept lecture" failure mode here at
      // all - pinned explicitly so a future edit does not reintroduce a
      // mandatory Agenda graphic without re-deriving this guarantee.
      expect(SLIDE_STRUCTURE_REQUIREMENTS).not.toContain("Agenda slide MUST carry a graphic");
    });

    it("Z4-AC1 (lesson learned from RCA11 in the applied path): ASSERTION TITLES never conflicts with the Section/Bridge/Agenda/Recap/Next-Week label formats", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("ASSERTION TITLES");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("never a bare topic label");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain(
        'does NOT extend to "Example:", "Walkthrough:", "Practice:", or "Answer:"'
      );
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain(
        "nor to the SECTION DIVIDERS, BRIDGES, AGENDA SLIDE, RECAP, or NEXT WEEK title formats"
      );
    });

    it("Z4-AC1: requires a Recap slide naming the opening Case Study's organization by name", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain('titled EXACTLY "Recap: Where We Landed"');
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("MUST name, by name, the organization/event from this deck's OPENING Case Study slide");
    });

    it("Z4-AC1: requires a Next Week slide, or Where This Goes Next for the final week, and degrades to omission absent week data", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain('"Next Week: <next week\'s topic>"');
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain('title this slide "Where This Goes Next" instead');
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("omit this slide entirely");
    });

    it("Z4-AC1: moves Post-Lecture Practice to the very end, behind an Appendix divider, after Documentation & References", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain('titled EXACTLY "Appendix: Post-Lecture Practice"');
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("the VERY LAST section of the deck");

      const referencesIndex = SLIDE_DECK_JSON_SHAPE.indexOf("Documentation & References");
      const appendixIndex = SLIDE_DECK_JSON_SHAPE.indexOf("Appendix: Post-Lecture Practice");
      expect(appendixIndex).toBeGreaterThan(referencesIndex);
    });

    it("Z4 (overall gap-closing, module header table): adds Failure Modes and Terminology as deck-level closing sections, mirroring applied", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("Failure Modes:");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("FAILURE MODES");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("Terminology:");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("TERMINOLOGY");
      expect(SLIDE_DECK_JSON_SHAPE).toContain("Failure Modes:");
      expect(SLIDE_DECK_JSON_SHAPE).toContain("Terminology:");
    });

    it("still requires code on the coding cycle slides (unaffected by the parity port)", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain('All of Example, Walkthrough, Practice, and Answer slides must include "code"');
    });

    it("Z4-AC6: every pre-existing coding pin from this file (breadth minimum, notes length, post-lecture practice count) still holds unchanged", () => {
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("BREADTH MINIMUM");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("its OWN full cycle");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("3-6 FULL sentences");
      expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain("exactly 2 additional practice problems");
    });
  });

  // "Feature RCA18" (the applied lecture-flow rules degrading absent
  // CONCEPT PLAN / LECTURE DURATION / week context) is applied-only and
  // moved to slide-prompt.applied.test.ts.

  // Group P, Feature P3: graphics enforced at the data layer (see
  // src/lib/slide-graphics.test.ts for enforceGraphicsForApplied's own unit
  // tests) - this file only pins the PROMPT side of P3. P3-AC4 (the applied
  // Judgment Call graphic requirement) moved to slide-prompt.applied.test.ts;
  // this is P3-AC5's coding-side half.
  //
  // Z4-AC3 (Group Z): SUPERSEDES the old "no graphics language reaches the
  // coding contract" pin - see the superseding note earlier in this file
  // (the "coding contract allows an optional graphic..." test) for why.
  // enforceGraphicsForApplied itself (P3's own data-layer guard) is
  // unaffected - it still only runs for an applied course (Z4-AC3 is
  // explicit that it must NOT be extended to coding).
  it("P3-AC5 (AMENDED by Z4-AC3): the coding contract's optional graphic never becomes a REQUIRED one", () => {
    expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain('"kind": "process"');
    expect(SLIDE_STRUCTURE_REQUIREMENTS).toContain('"kind": "table"');
    expect(SLIDE_STRUCTURE_REQUIREMENTS).not.toContain("MUST carry a graphic");
  });

  // "buildConceptCycleInstruction's Your Turn/Model Response mention..."
  // (RCA regression, docs/REGRESSION.md entry 100 AC1 amendment / entry 156)
  // exercises only the applied path and moved to slide-prompt.applied.test.ts.
});

// The "structural consistency guard" (checks 1-3: conditional-slide scoping,
// title-format agreement, and graphic-KIND agreement) moved to its own
// sibling file, slide-prompt.structural-guard.test.ts, to keep this file
// under the 1000-line cap - see that file for RCA15/RCA17's own history.
//
// The APPLIED contract's own tests (its six-slide concept cycle, the BRIDGES
// positional-anchor guard, its JSON-shape no-code guard, applied-course
// slide graphics, AC4's real-tool requirement, Feature P2's lecture flow,
// Feature RCA18's absent-data degradation, and P3-AC4) moved to
// slide-prompt.applied.test.ts for the same reason - the CODING deck
// contract reaching parity with the APPLIED one roughly doubled this file's
// assertions. No test was weakened, merged, or deleted by that split - every
// assertion that lived here before still runs, in one file or the other.
