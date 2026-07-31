// Sibling of slide-prompt.test.ts (split out to keep that file under the
// 1000-line cap - see docs/REGRESSION.md's line-count discipline, and the
// same pattern steps.content-lectures.prepare.ts already uses for the same
// reason). This file hosts ONLY the "structural consistency guard" - the
// mechanical checker that parses APPLIED_STRUCTURE_REQUIREMENTS's own
// authorial structure (top-level "- RULE NAME: ..." bullets) instead of
// natural-language sentences, so a rule presupposing a slide that does not
// always exist, two rules mandating incompatible title formats for the same
// prefix, or two rules mandating incompatible graphic KINDS for the same
// slide are all caught mechanically rather than by a human re-reading the
// whole contract. See slide-prompt.test.ts for every other check on the
// shared pedagogical contract (SLIDE_STRUCTURE_REQUIREMENTS/
// APPLIED_STRUCTURE_REQUIREMENTS, the JSON shapes, the coding-contract hash
// pins, RCA18's absent-data clauses, RCA20's Agenda bullet-cap exemption).

import { describe, it, expect } from "vitest";
import { slideStructureRequirements, APPLIED_CONDITIONAL_SLIDE_PREFIXES } from "./slide-prompt";

describe("slide-prompt shared pedagogical contract", () => {
  // RCA regression (docs/REGRESSION.md entry 156, RCA round 3 / RCA15 -
  // "make the consistency guard structural, not textual"): the guard THIS
  // REPLACES was a regex over sentences (split on `/(?<=[.:])\s+/`). Three
  // separate gate passes each found a NEW instance of the same defect class
  // it exists to catch - a rule presupposes a slide some concepts do not have
  // (Your Turn:/Model Response:, capped to the first 2 concepts by SLIDE
  // BUDGET; Bridge:, absent for the last concept), or two rules mandate
  // incompatible title formats for the same prefix (RCA11: ASSERTION TITLES
  // demanded a full sentence for "Section <n>:"/"Bridge:" while SECTION
  // DIVIDERS/BRIDGES mandate a fixed label for them). The sentence-regex
  // missed every one of these because it parses ENGLISH: it fragments on
  // colons/"e.g."/"vs."/numbered list items, it could not see a rule spread
  // across a bullet's own sub-clauses, and each fix required widening it
  // again - three times, with no sign of converging.
  //
  // This guard parses STRUCTURE instead of sentences. APPLIED_STRUCTURE_
  // REQUIREMENTS's top-level "- RULE NAME: ..." bullets are a reliable
  // delimiter - an authorial convention this contract already uses
  // consistently, not natural-language punctuation - so the contract is
  // split there, never on a sentence boundary. Two checks:
  //   1. Every MENTION of a conditional slide (APPLIED_CONDITIONAL_SLIDE_
  //      PREFIXES, slide-prompt.ts) must have a scoping phrase (from an
  //      explicit allowlist) in its own CLAUSE - the text inside its nearest
  //      enclosing parentheses if it sits inside one, otherwise the
  //      " - "-delimited segment containing it (also this contract's own
  //      consistent convention for setting off a sub-clause). Checking the
  //      whole BULLET rather than the mention's own clause would have missed
  //      the historical BRIDGES bug below - "except the last" and the
  //      unscoped "Model Response" mention sat in the same bullet, just in
  //      different clauses.
  //   2. The reverse: any prefix given a LABEL-format mandate elsewhere
  //      (`titled "X: <placeholder>"` - a fill-in-the-blank template,
  //      recognized by the literal "<...>" placeholder token, never a fixed
  //      string like `titled EXACTLY "Recap: Where We Landed"`) must NOT
  //      also appear in ASSERTION TITLES's full-sentence-format prefix list.
  //      This is exactly RCA11, caught mechanically instead of by a human
  //      reading 209 sentences.
  //
  // HONESTY (RCA15 step 4): this verifies scoping-phrase presence (in the
  // mention's own clause) and title-format agreement. It CANNOT verify the
  // prose is semantically consistent overall - a clause-level check is far
  // more precise than a whole-bullet one, but it is still pattern matching,
  // not comprehension. Three separate gate passes each found a new instance
  // of this defect class before this guard existed; a green run here is
  // evidence, not proof, that the contract is internally consistent.
  describe("structural consistency guard: conditional slides are always scoped, and title formats never conflict", () => {
    const applied = slideStructureRequirements("applied");

    /** Split on top-level "- RULE NAME: ..." bullets - the one delimiter in
     * this contract that is authorial structure, not natural-language
     * punctuation, so splitting on it (unlike a sentence-regex) cannot
     * fragment mid-rule. */
    function splitIntoBullets(text: string): string[] {
      return text
        .split(/\n(?=- )/)
        .map((bullet) => bullet.trim())
        .filter(Boolean);
    }

    function bulletName(bullet: string): string {
      const match = bullet.match(/^- ([A-Z][A-Z0-9 /]*):/);
      return match ? match[1] : bullet.slice(0, 40);
    }

    // Every phrase below is copied verbatim from the CURRENT, already-fixed
    // contract text (slide-prompt.ts) - an inventory of the honest scoping
    // language the contract already uses, closed by construction: a NEW
    // paraphrase failing here is the signal to add the concept's real
    // wording to the contract (and then here), never to loosen the check
    // into matching more paraphrases speculatively.
    const SCOPING_ALLOWLIST: RegExp[] = [
      /for the concepts that have one/i,
      /wherever that task appears/i,
      /first 2/i,
      /except the last/i,
      /for a concept that had one/i,
      /gets no [^.]*slide/i,
      /concepts the (slide budget rule( below)?|requirements below) identif/i,
      // A Post-Lecture Practice appendix Model Response is a DIFFERENT,
      // unconditionally-present slide (every concept gets one there,
      // regardless of whether it got the in-lecture pair) - a mention inside
      // that context is not the conditional in-lecture claim this guard
      // exists to scope, so naming the appendix is itself the honest scoping
      // signal for that context.
      /Post-Lecture Practice/i,
    ];

    /** The clause containing the mention at [mentionIndex, mentionIndex +
     * mentionLength): the interior of its nearest enclosing parentheses when
     * it sits inside one (a parenthetical is a self-contained aside - this
     * is what correctly separates an unconditional mention INSIDE parens
     * from a scoping phrase that sits outside them in the main clause,
     * exactly the historical BRIDGES shape below), otherwise the
     * " - "-delimited segment containing it. */
    function clauseContaining(bullet: string, mentionIndex: number, mentionLength: number): string {
      const openBefore = bullet.lastIndexOf("(", mentionIndex);
      const closeAfter = bullet.indexOf(")", mentionIndex + mentionLength);
      if (openBefore !== -1 && closeAfter !== -1) {
        const closeBeforeMention = bullet.indexOf(")", openBefore);
        const stillInsideThatParen = closeBeforeMention === -1 || closeBeforeMention >= mentionIndex;
        if (stillInsideThatParen) return bullet.slice(openBefore + 1, closeAfter);
      }
      const segments = bullet.split(" - ");
      let offset = 0;
      for (const segment of segments) {
        const segmentEnd = offset + segment.length;
        if (mentionIndex >= offset && mentionIndex < segmentEnd) return segment;
        offset = segmentEnd + 3; // " - ".length
      }
      return bullet;
    }

    /** Every (bullet, conditional-slide) pair where the slide is mentioned at
     * least once, but NONE of its mentions in that bullet has a scoping
     * phrase in its own clause - i.e. the bullet never once scopes that
     * slide anywhere near where it names it. This is deliberately not "every
     * mention must be individually scoped": a bullet is allowed to name a
     * slide once in passing and scope it properly the next time (TOOL
     * CONTINUITY does exactly this - "leave that concept's Your Turn task
     * tool-agnostic", then "its Your Turn task wherever that task appears" a
     * clause later) - what must never happen is naming the slide with NO
     * scoping anywhere in the bullet, which is the actual historical shape
     * of both sabotage cases below. */
    function findOffendingMentions(
      text: string,
      conditionalPrefixes: readonly string[]
    ): Array<{ bullet: string; slide: string }> {
      const bullets = splitIntoBullets(text);
      const offenses: Array<{ bullet: string; slide: string }> = [];
      for (const bullet of bullets) {
        for (const prefix of conditionalPrefixes) {
          const slideWord = prefix.replace(/:$/, "");
          const mentionRegex = new RegExp(`\\b${slideWord}\\b`, "gi");
          const clauses: string[] = [];
          let match: RegExpExecArray | null;
          while ((match = mentionRegex.exec(bullet))) {
            clauses.push(clauseContaining(bullet, match.index, match[0].length));
          }
          if (clauses.length === 0) continue;
          const anyClauseScoped = clauses.some((clause) => SCOPING_ALLOWLIST.some((phrase) => phrase.test(clause)));
          if (!anyClauseScoped) {
            offenses.push({ bullet: bulletName(bullet), slide: prefix });
          }
        }
      }
      return offenses;
    }

    /** The prefix list ASSERTION TITLES declares must be a full sentence -
     * the text between "ASSERTION TITLES: every " and " title" (optionally
     * followed by a parenthetical aside) "keeps its required prefix" only, so
     * a LATER exclusion clause naming a prefix (to EXCLUDE it) cannot itself
     * get counted as re-including it. */
    function assertionTitlesPrefixes(text: string): string[] {
      const match = text.match(/ASSERTION TITLES: every (.+?) title(?: \([^)]*\))? keeps its required prefix/);
      if (!match) return [];
      return [...match[1].matchAll(/"([^"]+:)"/g)].map((m) => m[1]);
    }

    /** Every prefix mandated a fill-in-the-blank LABEL elsewhere in the
     * contract - `titled "X: <placeholder>"`, recognized by a "<...>" token
     * inside the quoted title, which marks it as a template rather than a
     * fixed string (contrast `titled EXACTLY "Recap: Where We Landed"`,
     * which has no placeholder and is not a title-FORMAT rule at all). */
    function labelMandatedPrefixes(text: string): string[] {
      const matches = [...text.matchAll(/titled\s+(?:EXACTLY\s+)?"([^"]+)"/g)];
      const prefixes: string[] = [];
      for (const m of matches) {
        const title = m[1];
        if (!/<[^>]+>/.test(title)) continue; // a fixed string, not a label template
        const colonIndex = title.indexOf(":");
        if (colonIndex === -1) continue;
        prefixes.push(title.slice(0, colonIndex + 1).trim());
      }
      return prefixes;
    }

    it("the real contract: every conditional-slide mention scopes itself in its own clause", () => {
      const offending = findOffendingMentions(applied, APPLIED_CONDITIONAL_SLIDE_PREFIXES);
      expect(offending).toEqual([]);
    });

    it("assertionTitlesPrefixes extracts the six real prefixes (the guard above is not vacuously passing)", () => {
      expect(assertionTitlesPrefixes(applied)).toEqual([
        "Principle:",
        "In Practice:",
        "Artifact:",
        "Judgment Call:",
        "Your Turn:",
        "Model Response:",
      ]);
    });

    it("labelMandatedPrefixes extracts the real label-format prefixes (the reverse check below is not vacuously passing)", () => {
      expect(labelMandatedPrefixes(applied)).toEqual(
        expect.arrayContaining(["Agenda:", "Section <n>:", "Bridge:", "Next Week:"])
      );
    });

    it("the real contract: no prefix mandated a label elsewhere also appears in ASSERTION TITLES's full-sentence list (RCA11, caught mechanically)", () => {
      const assertionPrefixes = new Set(assertionTitlesPrefixes(applied));
      const conflicts = labelMandatedPrefixes(applied).filter((prefix) => assertionPrefixes.has(prefix));
      expect(conflicts).toEqual([]);
    });

    // ── Check 3 (RCA17, RCA round 4): graphic-KIND agreement ───────────────
    // Checks 1 and 2 above catch a rule presupposing a slide that does not
    // always exist, and two rules mandating incompatible TITLE FORMATS for
    // the same prefix - but neither one parses graphic KINDS at all, so
    // neither caught FAIL 1: AGENDA SLIDE (above) picks the Agenda slide's
    // graphic kind by concept count (process at 3-6, table at 2 or 7), while
    // SLIDE GRAPHICS used to separately, unconditionally restate "process"
    // for the same slide - two independently-written rules governing the
    // same slide's graphic, exactly the shape check 2 already treats for
    // title formats, just in a new dimension. This is that same defect
    // class, not a new one, so it gets the same treatment: parse structure,
    // not sentences, and sabotage-check against the historical wording.
    //
    // Extraction granularity: a bullet whose own RULE NAME already names one
    // slide unambiguously (AGENDA SLIDE names the Agenda slide throughout,
    // including its own concept-count-conditioned clause, which never
    // repeats "Agenda slide" by name) contributes every graphic-kind token
    // found anywhere in it. SLIDE GRAPHICS is different in kind: ONE bullet
    // packs independent per-slide mandates into separate sentences (Artifact,
    // Judgment Call, Agenda, Principle each get their own), so attribution
    // there is per-SENTENCE, keyed on the slide being named IN that sentence
    // - the one place in this guard sentence-splitting is actually the right
    // grain, unlike the historical sentence-regex guard checks 1/2 replaced
    // (RCA15 above), because SLIDE GRAPHICS's own sentences never fragment a
    // single mandate the way natural prose can.
    const GRAPHIC_KIND_TOKENS = ["matrix2x2", "process", "table"] as const;

    /** A bullet whose RULE NAME already identifies exactly one slide, so
     * every graphic-kind token anywhere in it belongs to that slide without
     * needing to re-name it in every sentence (unlike SLIDE GRAPHICS, a
     * multi-slide bullet - see GRAPHIC_MANDATE_SLIDE_PHRASES below). */
    const SINGLE_TOPIC_BULLET_SLIDE: Record<string, string> = {
      "AGENDA SLIDE": "Agenda:",
    };

    /** Prose phrases (not JSON title prefixes) this check looks for to
     * attribute a graphic-kind SENTENCE to a slide, inside a multi-slide
     * bullet. */
    const GRAPHIC_MANDATE_SLIDE_PHRASES: Record<string, string> = {
      "Agenda slide": "Agenda:",
      "Artifact slide": "Artifact:",
      "Judgment Call slide": "Judgment Call:",
      "Principle slide": "Principle:",
    };

    interface GraphicKindMandate {
      slide: string;
      kinds: string[];
    }

    /** Real sentence boundaries (period + whitespace + capital letter) -
     * deliberately NOT the colon-splitting regex the RCA15 framing note
     * above warns fragments mid-rule (a quoted title like "Agenda:
     * <lecture topic>" carries a colon that is not a sentence boundary). */
    function splitIntoSentences(text: string): string[] {
      return text
        .split(/\.\s+(?=[A-Z])/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    function findGraphicKindMandates(text: string): GraphicKindMandate[] {
      const mandates: GraphicKindMandate[] = [];
      for (const bullet of splitIntoBullets(text)) {
        const name = bulletName(bullet);
        const singleTopicSlide = SINGLE_TOPIC_BULLET_SLIDE[name];
        if (singleTopicSlide) {
          const kinds = GRAPHIC_KIND_TOKENS.filter((k) => bullet.includes(`"${k}"`));
          if (kinds.length > 0) mandates.push({ slide: singleTopicSlide, kinds });
          continue;
        }
        for (const sentence of splitIntoSentences(bullet)) {
          if (!/\bMUST\b/.test(sentence)) continue;
          for (const [phrase, slide] of Object.entries(GRAPHIC_MANDATE_SLIDE_PHRASES)) {
            if (!sentence.includes(phrase)) continue;
            const kinds = GRAPHIC_KIND_TOKENS.filter((k) => sentence.includes(`"${k}"`));
            if (kinds.length > 0) mandates.push({ slide, kinds });
          }
        }
      }
      return mandates;
    }

    /** For each slide prefix with 2+ graphic-kind mandates (from different
     * rule bullets, or different sentences of the same multi-slide bullet),
     * FAIL when their kind sets are not identical - two rules governing the
     * same slide's graphic that name different kinds for it. */
    function findGraphicKindConflicts(text: string): Array<{ slide: string; kindSets: string[][] }> {
      const bySlide = new Map<string, string[][]>();
      for (const mandate of findGraphicKindMandates(text)) {
        const list = bySlide.get(mandate.slide) ?? [];
        list.push([...mandate.kinds].sort());
        bySlide.set(mandate.slide, list);
      }
      const conflicts: Array<{ slide: string; kindSets: string[][] }> = [];
      for (const [slide, kindSets] of bySlide) {
        const distinct = new Set(kindSets.map((k) => k.join(",")));
        if (distinct.size > 1) conflicts.push({ slide, kindSets });
      }
      return conflicts;
    }

    it("the real contract: no slide's graphic kind is mandated inconsistently by two different rules", () => {
      expect(findGraphicKindConflicts(applied)).toEqual([]);
    });

    it("findGraphicKindMandates is not vacuously empty - it finds the real Artifact/Judgment Call/Agenda mandates", () => {
      const slides = new Set(findGraphicKindMandates(applied).map((m) => m.slide));
      expect(slides.has("Artifact:")).toBe(true);
      expect(slides.has("Judgment Call:")).toBe(true);
      expect(slides.has("Agenda:")).toBe(true);
    });

    // SABOTAGE (RCA17): restore SLIDE GRAPHICS's old, unconditional "The
    // Agenda slide (above) MUST carry a 'process' graphic ..." wording and
    // confirm the NEW graphic-kind check (and only it - a generic sabotage
    // proves nothing about THIS check specifically) fails on it. AGENDA
    // SLIDE's own rule still mandates process-at-3-6/table-at-2-or-7 for the
    // same slide, so the two now disagree exactly as they did before the fix.
    it("SABOTAGE (RCA17): restoring SLIDE GRAPHICS's unconditional 'process' wording for the Agenda slide conflicts with AGENDA SLIDE's concept-count-dependent rule", () => {
      const sabotaged = applied.replace(
        'The Agenda slide MUST carry a graphic too, but which KIND is decided entirely by the AGENDA SLIDE rule above (process at 3-6 concepts, table at 2 or 7) - never restate a specific kind for it here, since the two rules would then have to agree on every concept count instead of one rule simply deciding.',
        'The Agenda slide (above) MUST carry a "process" graphic listing this lecture\'s concepts as steps.'
      );
      // Guard the sabotage input itself: if this replace silently no-ops
      // (e.g. the live wording drifted), the test below would pass for the
      // wrong reason - assert the injection actually landed.
      expect(sabotaged).not.toBe(applied);

      const conflicts = findGraphicKindConflicts(sabotaged);
      expect(conflicts.some((c) => c.slide === "Agenda:")).toBe(true);

      // The FIXED contract itself must NOT trip this same check - proves the
      // check discriminates the historical bug from the actual fix, rather
      // than just reacting to the word "process" appearing anywhere.
      expect(findGraphicKindConflicts(applied).some((c) => c.slide === "Agenda:")).toBe(false);
    });

    // ── Sabotage checks ────────────────────────────────────────────────────
    // Each historical defect this guard exists to catch, reconstructed from
    // the RCA record (git history for this file predates this feature; the
    // defect is documented in this file's own prior comments and
    // docs/REGRESSION.md) rather than copied from a live diff - faithful to
    // the DEFECT SHAPE described, which is what the guard must reject
    // regardless of the exact original prose.

    it("SABOTAGE - old BRIDGES wording: an unconditional 'Model Response' mention inside a parenthetical, with 'except the last' present only in the OUTER clause, still fails", () => {
      // Reproduces the shape the RCA5 note above (this file's prior version)
      // quoted verbatim: "after each concept's cycle ends (its own Model
      // Response slide) ... for every concept EXCEPT THE LAST one". The
      // parenthetical is the actual defect - "except the last" scopes the
      // Bridge-insertion clause, never the Model Response mention sitting
      // inside the aside, so a check that only asked "does the BULLET
      // contain ANY scoping phrase" would have missed this; this guard
      // requires the phrase in the mention's OWN clause instead.
      const oldBridges = `- BRIDGES: after each concept's cycle ends (its own Model Response slide), for every concept EXCEPT THE LAST one in the plan, insert a slide titled "Bridge: <this concept> to <next concept>" with exactly two "bullets".`;
      const offending = findOffendingMentions(oldBridges, APPLIED_CONDITIONAL_SLIDE_PREFIXES);
      expect(offending.some((o) => o.slide === "Model Response:")).toBe(true);
    });

    it("SABOTAGE - old TOOL CONTINUITY wording: an unconditional 'Your Turn' mention with no scoping anywhere in the bullet fails", () => {
      // Reproduces TOOL CONTINUITY before it gained "wherever that task
      // appears - in the lecture or in the Post-Lecture Practice appendix" -
      // the sibling defect from the same round that widened the old regex
      // guard (RCA15's framing note above this describe block).
      const oldToolContinuity = `- TOOL CONTINUITY: never name a tool on a concept's Artifact slide and then leave that concept's Your Turn task tool-agnostic - each concept's own "moduleTools" entry is the one tool its Artifact slide and its Your Turn task both use, so a student always knows exactly which software to open.`;
      const offending = findOffendingMentions(oldToolContinuity, APPLIED_CONDITIONAL_SLIDE_PREFIXES);
      expect(offending.some((o) => o.slide === "Your Turn:")).toBe(true);
    });

    it("SABOTAGE - the current (RCA11) ASSERTION TITLES list including \"Section <n>:\" and \"Bridge:\" fails the reverse title-format check", () => {
      const buggyAssertionTitles = applied.replace(
        'ASSERTION TITLES: every "Principle:", "In Practice:", "Artifact:", "Judgment Call:", "Your Turn:", and "Model Response:" title',
        'ASSERTION TITLES: every "Principle:", "In Practice:", "Artifact:", "Judgment Call:", "Your Turn:", "Model Response:", "Section <n>:", and "Bridge:" title'
      );
      // Guard the sabotage input itself: if this replace silently no-ops
      // (e.g. the live wording drifted), the test below would pass for the
      // wrong reason - assert the injection actually landed.
      expect(buggyAssertionTitles).not.toBe(applied);

      const assertionPrefixes = new Set(assertionTitlesPrefixes(buggyAssertionTitles));
      const conflicts = labelMandatedPrefixes(buggyAssertionTitles).filter((prefix) => assertionPrefixes.has(prefix));
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts).toEqual(expect.arrayContaining(["Section <n>:", "Bridge:"]));
    });
  });
});
