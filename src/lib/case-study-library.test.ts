import { describe, it, expect } from "vitest";
import { APPLIED_CASE_STUDIES, matchCaseStudyLibraryEntry } from "./case-study-library";

describe("APPLIED_CASE_STUDIES", () => {
  it("every entry has a non-year-baked-in organization, a period, at least one topic tag, summary, and a lesson", () => {
    for (const entry of APPLIED_CASE_STUDIES) {
      expect(entry.id.trim()).not.toBe("");
      expect(entry.organization.trim()).not.toBe("");
      expect(entry.period.trim()).not.toBe("");
      expect(entry.topics.length).toBeGreaterThan(0);
      expect(entry.summary.length).toBeGreaterThan(0);
      expect(entry.lesson.trim()).not.toBe("");
    }
  });

  it("every id is unique", () => {
    const ids = APPLIED_CASE_STUDIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // V2: the audit's own evidence - Denver's failure was 1994-95, not 2002 or
  // 2011 (both of which shipped on real decks). The curated entry must carry
  // the verified period, not a single disputed year presented as fact.
  it("the Denver entry states the verified 1994-1995 period, not 2002 or 2011", () => {
    const denver = APPLIED_CASE_STUDIES.find((e) => e.id === "denver-baggage");
    expect(denver).toBeDefined();
    expect(denver!.period).toContain("1994");
    expect(denver!.period).not.toMatch(/\b2002\b/);
    expect(denver!.period).not.toMatch(/\b2011\b/);
  });

  it("the FBI VCF entry is dated to its 2005 cancellation, not 2011 (which belongs to Sentinel)", () => {
    const vcf = APPLIED_CASE_STUDIES.find((e) => e.id === "fbi-vcf");
    expect(vcf).toBeDefined();
    expect(vcf!.period).toContain("2005");
  });

  it("the Berlin Brandenburg entry states both the planned (2011) and actual (2020) dates", () => {
    const ber = APPLIED_CASE_STUDIES.find((e) => e.id === "berlin-brandenburg");
    expect(ber).toBeDefined();
    expect(ber!.period).toContain("2011");
    expect(ber!.period).toContain("2020");
  });
});

describe("matchCaseStudyLibraryEntry", () => {
  // B3 fix (docs/REGRESSION.md entry 201's "UNRECORDED BEHAVIOUR 1", see
  // case-study-match.ts's GENERIC_TAG_MIN_DF): the original fixture here
  // ("Scope Management" / "Controlling vendor management and schedule
  // risk.") matched denver-baggage on FOUR entirely generic, cross-industry
  // words - scope, vendor management, schedule, risk - none of them specific
  // to an airport baggage system, the exact shape of evidence this fix
  // exists to reject. It coincidentally cleared the old floor (evidence 6:
  // 1+3+1+1 with vendor management's un-discounted phrase bonus) and so this
  // test passed for the wrong reason. After the fix (vendor management is
  // tagged on 7 of 12 entries - not case-specific evidence for any one of
  // them - so its phrase bonus is capped) that same generic-only text now
  // correctly returns null. The fixture below adds one genuinely
  // Denver-specific phrase ("systems integration", from Denver's own
  // write-up) so this test again demonstrates a REAL match rather than a
  // coincidental one - see the "still selects Denver's baggage system"
  // test further down for the same principle with a fuller fixture.
  it("matches a week whose topic/summary shares tag words with a curated entry", () => {
    const entry = matchCaseStudyLibraryEntry(
      "Scope Management",
      "Controlling vendor management, schedule risk, and systems integration for the project."
    );
    expect(entry?.id).toBe("denver-baggage");
  });

  it("returns null when nothing matches", () => {
    const entry = matchCaseStudyLibraryEntry("Zzyzx Nonsense Topic", "");
    expect(entry).toBeNull();
  });

  it("returns null for blank topic and summary", () => {
    expect(matchCaseStudyLibraryEntry("", "")).toBeNull();
  });

  it("excludes an entry whose id is already claimed", () => {
    const first = matchCaseStudyLibraryEntry("Scope creep and vendor management", "systems integration testing schedule risk");
    expect(first).not.toBeNull();
    const excluded = new Set([first!.id]);
    const second = matchCaseStudyLibraryEntry("Scope creep and vendor management", "systems integration testing schedule risk", excluded);
    expect(second?.id).not.toBe(first!.id);
  });

  it("prefers the entry with the most matching tags when several match", () => {
    // "government" + "requirements" + "software" + "waterfall" + "contracts"
    // all point at fbi-vcf specifically, more strongly than a single shared
    // tag would. This match hits 5 of fbi-vcf's tags with zero phrase-tag
    // evidence (evidence score 5, from 5 single-word hits) - comfortably
    // above QUALIFY_FLOOR (src/lib/case-study-match.ts), which is exactly
    // the point: broad single-word coverage alone, with no phrase hit at
    // all, is real evidence and this match must keep working under the
    // recalibrated floor, not just under phrase-backed matches.
    const entry = matchCaseStudyLibraryEntry(
      "Government IT procurement",
      "requirements churn, waterfall contracts, and software delivered late"
    );
    expect(entry?.id).toBe("fbi-vcf");
  });

  it("is deterministic - the same input always yields the same output", () => {
    // AC5: matchBestByTopics' tiebreak (evidence score desc, then raw
    // matched-tag count desc, then the library's own declared order) is
    // total, so repeated calls with identical arguments can never disagree -
    // there is no hidden randomness, Date, or I/O anywhere in this pure
    // function. See case-study-match.ts's matchBestByTopics doc comment for
    // the full three-step tiebreak.
    const topic = "Vendor Integration";
    const summary = "Dozens of contractors handled vendor management and integration testing separately, so quality assurance before the public government rollout caught nothing.";
    const first = matchCaseStudyLibraryEntry(topic, summary);
    const second = matchCaseStudyLibraryEntry(topic, summary);
    const third = matchCaseStudyLibraryEntry(topic, summary);
    expect(first?.id).toBe(second?.id);
    expect(second?.id).toBe(third?.id);
  });
});

// REGRESSION SUITE for the "score first, gate second" fix (see the root
// cause this fix responds to: hasDistinctiveEvidence used to run as a
// PRE-FILTER over every candidate before ranking, so it could only ever
// REMOVE candidates - which let it eliminate the correct, higher-scoring
// entry while a coincidentally-phrase-matching, lower-scoring WRONG entry
// won by default). This is a DATA-DRIVEN test: it loops the real,
// production APPLIED_CASE_STUDIES array rather than hand-written fixture
// cases, because the defect above was invisible to hand-written tests (this
// file's own tests all passed while the real library silently mismatched
// 10 of its 12 own entries) - only feeding each entry the library's own
// real text reproduces it.
describe("matchCaseStudyLibraryEntry: self-match against the library's own real text (data-driven)", () => {
  // Feed every curated entry its OWN organization + summary + lesson text -
  // the actual production content, not a synthetic stand-in - and record
  // what the matcher resolves it to.
  const selfMatchResults = APPLIED_CASE_STUDIES.map((entry) => {
    const topic = entry.organization;
    const summary = `${entry.summary.join(" ")} ${entry.lesson}`;
    return { entry, result: matchCaseStudyLibraryEntry(topic, summary) };
  });

  // AC1's bar was "at least 11 of 12" when the library held 12 entries; B4
  // added 3 cybersecurity entries (docs/REGRESSION.md, this session) without
  // touching any of the original 12 or their tags, so the bar is restated
  // relative to the library's actual current size rather than a stale literal
  // "12" - citytime remains the one documented, accepted miss either way (see
  // the dedicated test below).
  it("self-matches all but at most one of the curated entries (AC1, restated for the library's current size)", () => {
    const selfMatchedIds = selfMatchResults
      .filter(({ entry, result }) => result?.id === entry.id)
      .map(({ entry }) => entry.id);
    expect(selfMatchedIds.length).toBeGreaterThanOrEqual(APPLIED_CASE_STUDIES.length - 1);
  });

  it("never resolves an entry's own text to a DIFFERENT curated entry - zero cross-contamination (AC2)", () => {
    // A miss (null) is tolerated (see the test above and the one below for
    // exactly how many/which); a WRONG entry - the actual reported defect -
    // is not tolerated for even one.
    const wrongMatches = selfMatchResults
      .filter(({ entry, result }) => result !== null && result.id !== entry.id)
      .map(({ entry, result }) => `${entry.id} -> ${result!.id}`);
    expect(wrongMatches).toEqual([]);
  });

  it("citytime is the one documented miss, not a fabricated cross-match", () => {
    // See the comment on citytime's own topics list in
    // case-study-library.ts for why: its write-up genuinely does not reuse
    // enough of its own tag vocabulary to clear QUALIFY_FLOOR, and it was
    // deliberately left that way rather than padding its tags solely to
    // force a passing self-match. If this test starts failing because some
    // OTHER entry also misses, that is a real regression (AC1 requires
    // 11/12, not 10/12); if it fails because citytime itself stops missing,
    // that's fine - update this test, no acceptance criterion requires
    // citytime specifically to miss, only that at most one entry does.
    const missedIds = selfMatchResults.filter(({ result }) => result === null).map(({ entry }) => entry.id);
    expect(missedIds).toEqual(["citytime"]);
  });
});

// The "off-domain case study" fix. APPLIED_CASE_STUDIES pools case studies
// from many unrelated industries (aerospace, government web services,
// airport logistics, ...) under one shared vocabulary of generic
// project-management/engineering words. Before this fix, a week from ANY
// technical field could coincidentally out-score every genuinely relevant
// entry just by using ordinary technical English - this is the exact
// mechanism that put the Challenger disaster, the Mars Climate Orbiter,
// Healthcare.gov, and Denver's baggage system into a real generated
// cybersecurity course's case-study rotation. Each test below reproduces
// one of those four with a concrete week (deliberately including the real
// "Web Application Security" week title from the BIT 320: Ethical Hacking
// fixture, course-planning-grounding.test.ts) that:
//   1. Only coincidentally shares 2 single-word tags with the wrong entry
//      (verified by hand against every OTHER entry in the library too -
//      each wrong entry was the UNIQUE top scorer, or tied for it, under
//      the pre-fix score-only rule, so this is a faithful reproduction of
//      the actual defect, not a strawman).
//   2. Now correctly returns null - matchCaseStudyLibraryEntry declines
//      rather than assert a weak, coincidental match, so the caller
//      (planCourseCaseStudies) falls through to its LLM pass for that week,
//      which DOES see the course's own description and can propose an
//      actually on-domain case.
describe("matchCaseStudyLibraryEntry: the four off-domain cases reported for a real business-IT/security course", () => {
  it("no longer selects the Space Shuttle Challenger from two coincidental generic words (risk, communication)", () => {
    const entry = matchCaseStudyLibraryEntry(
      "Incident Communication",
      "This week discusses managing communication risk during a technical incident."
    );
    expect(entry).toBeNull();
  });

  it("no longer selects the Mars Climate Orbiter from two coincidental generic words (interfaces, requirements)", () => {
    const entry = matchCaseStudyLibraryEntry(
      "System Interfaces",
      "This week covers interface requirements between components."
    );
    expect(entry).toBeNull();
  });

  it("no longer selects Healthcare.gov from two coincidental generic words (web, launch) - the real 'Web Application Security' week title", () => {
    const entry = matchCaseStudyLibraryEntry(
      "Web Application Security",
      "This week covers the public launch of a new web application."
    );
    expect(entry).toBeNull();
  });

  it("no longer selects Denver's baggage system from two coincidental generic words (testing, risk)", () => {
    const entry = matchCaseStudyLibraryEntry(
      "Vulnerability Testing",
      "This week assesses risk through hands-on testing techniques."
    );
    expect(entry).toBeNull();
  });
});

// AC3 of the "score first, gate second" fix, and the exact eight inputs the
// regression gate uses to check off-domain rejection - EVERY one built from
// a REALISTIC, NON-EMPTY week summary of the kind a real week actually
// carries (planCourseCaseStudies, src/app/actions/case-study-plan.ts, always
// calls this with `week.topic, week.summary ?? ""`, and a real week's
// summary is essentially never empty - an empty string is the DEGENERATE
// case, not the normal one).
//
// WHY THIS MATTERS (Defect 2 of the RCA this describe block responds to):
// an earlier version of this file's off-domain suite tested two of these
// same topics with an EMPTY summary. That is a tautological test: with an
// empty summary, a lone matched PHRASE tag scores exactly PHRASE_WEIGHT (3),
// which is below both the current floor (5) and the prior one (4) on its
// own - so the assertion passes for a reason that has nothing to do with
// whether the matcher correctly rejects a REAL week's coincidental overlap;
// it would pass identically even with no gating at all, as long as the tag
// stayed a lone phrase hit. Add one ordinary corroborating word - exactly
// what a real week's summary supplies - and three of them used to FLIP to a
// wrong curated match:
//   ("Quality assurance basics", "unit testing") -> denver-baggage
//   ("Sprint planning and iterative delivery", "The team writes software in sprints.") -> fbi-sentinel
//   ("Web Application Security", "This week covers the public launch of a new web application and its quality assurance.") -> healthcare-gov
// All three below now correctly return null - which took a rise in
// QUALIFY_FLOOR itself (4 to 5), not just the ranking/gate unification, to
// achieve; see case-study-match.ts's QUALIFY_FLOOR doc comment for exactly
// what evidence score each of these tops out at and why 4 was not enough.
describe("matchCaseStudyLibraryEntry: AC3 off-domain rejection (realistic, non-empty summaries)", () => {
  it('returns null for "Web Application Security" with a launch + quality-assurance summary (Defect 2: flips true at floor 4 with a realistic summary)', () => {
    const entry = matchCaseStudyLibraryEntry(
      "Web Application Security",
      "This week covers the public launch of a new web application and its quality assurance."
    );
    expect(entry).toBeNull();
  });

  it('returns null for "Cybersecurity: threat modeling" / a risk-management-and-quality-assurance summary (Defect 1: the two-generic-phrase-tags stress case that motivated the floor 4 -> 5 recalibration)', () => {
    // Before deepwater-horizon's "risk management" tag was retuned (Defect
    // 3 in the RCA - see that entry's topics list), this specific input hit
    // evidence 6 on deepwater-horizon (two matched phrase tags: "risk
    // management" + "quality assurance") - well clear of even the
    // recalibrated floor of 5, and a DIFFERENT wrong entry than the
    // originally-reported denver-baggage false positive on this exact text.
    // Retuning that one tag, not the floor alone, is what makes this null.
    const entry = matchCaseStudyLibraryEntry(
      "Cybersecurity: threat modeling",
      "Students build a threat model and a risk management plan for a web app, with quality assurance."
    );
    expect(entry).toBeNull();
  });

  it('returns null for "Sprint planning and iterative delivery" / a realistic one-sentence summary (Defect 2: the empty-summary version of this test was tautological)', () => {
    const entry = matchCaseStudyLibraryEntry(
      "Sprint planning and iterative delivery",
      "The team writes software in sprints."
    );
    expect(entry).toBeNull();
  });

  it('returns null for "Quality assurance basics" / "unit testing" (Defect 2: the empty-summary version of this test was tautological)', () => {
    const entry = matchCaseStudyLibraryEntry("Quality assurance basics", "unit testing");
    expect(entry).toBeNull();
  });

  it('returns null for "Call center operations" (Defect 3: london-ambulance-cad\'s now-removed "operations" tag combined with its "call volume" tag to false-positive here)', () => {
    // Before london-ambulance-cad's "operations" tag was removed, this text
    // matched BOTH "call volume" (phrase, 3) and "operations" (word, 1) for
    // evidence 4 - which cleared the OLD floor of 4 exactly. "operations"
    // never appears in london-ambulance-cad's own write-up (only the
    // singular "operation" does - a whole-word match requires the exact
    // plural), so removing it costs that entry nothing on its own
    // self-match while closing this false positive.
    const entry = matchCaseStudyLibraryEntry(
      "Call center operations",
      "Managing call volume, staffing, and service levels in operations."
    );
    expect(entry).toBeNull();
  });

  it('returns null for "Code review practices" (Defect 3: mars-climate-orbiter-pm\'s now-removed "requirements" and "communication" tags combined with "review process" to false-positive here)', () => {
    // Before those two tags were removed, this text matched "review
    // process" (phrase, 3) + "requirements" (word, 1) + "communication"
    // (word, 1) for evidence 5. Neither "requirements" nor "communication"
    // appears anywhere in mars-climate-orbiter-pm's own write-up, so
    // removing them costs that entry nothing on its own self-match (which
    // still clears the floor via "units" + "handoff" + "review process")
    // while closing this false positive.
    const entry = matchCaseStudyLibraryEntry(
      "Code review practices",
      "Adopt a review process for requirements and communication between teams."
    );
    expect(entry).toBeNull();
  });

  it('returns null for "Introduction to Python" (no vocabulary overlap with any curated entry at all)', () => {
    const entry = matchCaseStudyLibraryEntry(
      "Introduction to Python",
      "Students write their first Python programs and run them."
    );
    expect(entry).toBeNull();
  });

  it('returns null for "Object Oriented Programming" (no vocabulary overlap with any curated entry at all)', () => {
    const entry = matchCaseStudyLibraryEntry(
      "Object Oriented Programming",
      "Students define classes, objects, and inheritance in code."
    );
    expect(entry).toBeNull();
  });
});

// AC4 of this fix, on the real library: the exact reported disagreement -
// denver-baggage (raw count 2, evidence 4) beating deepwater-horizon (raw
// count also 2, evidence 6) on the same "Cybersecurity: threat modeling"
// text - no longer occurs, because deepwater-horizon's "risk management"
// tag (its half of that coincidental raw-count tie) was retuned away as
// part of Defect 3 (see the AC3 test above, and deepwater-horizon's topics
// list in case-study-library.ts). The mechanism-level guarantee that makes
// this kind of disagreement structurally impossible REGARDLESS of which
// specific tags any one entry carries - ranking and gating always read the
// exact same evidence number - is covered directly, with hand-built
// fixtures immune to future tag retuning, in case-study-match.test.ts's
// "evidence, not raw count, decides the winner (AC4)" describe block.

// Guard against the opposite failure: a fix that just makes the matcher
// reject everything is worse than no fix (AC3 of the off-domain fix). None
// of the four entries above is banned by name or id - each is still fully
// reachable when a week's text gives REAL evidence (either a phrase-tag hit,
// or near-total single-word-tag coverage), proving the gate reacts to the
// STRENGTH of the evidence, not to which entry it is.
describe("matchCaseStudyLibraryEntry: previously-flagged entries remain reachable given real evidence", () => {
  it("still selects Challenger given comprehensive, phrase-level evidence (safety culture, schedule pressure, decision making)", () => {
    const entry = matchCaseStudyLibraryEntry(
      "Safety Culture and Schedule Pressure",
      "How schedule pressure and a weak safety culture can distort decision making under risk."
    );
    expect(entry?.id).toBe("challenger");
  });

  it("still selects the Mars Climate Orbiter given comprehensive, phrase-level evidence (integration testing, quality assurance, vendor management)", () => {
    const entry = matchCaseStudyLibraryEntry(
      "Interface Handoffs",
      "A units mismatch across team interfaces caused a handoff failure that integration testing and quality assurance should have caught, straining vendor management."
    );
    expect(entry?.id).toBe("mars-climate-orbiter-pm");
  });

  it("still selects Healthcare.gov given comprehensive, phrase-level evidence (vendor management, integration testing, quality assurance)", () => {
    const entry = matchCaseStudyLibraryEntry(
      "Vendor Integration",
      "Dozens of contractors handled vendor management and integration testing separately, so quality assurance before the public government rollout caught nothing."
    );
    expect(entry?.id).toBe("healthcare-gov");
  });

  it("still selects Denver's baggage system given comprehensive, phrase-level evidence (systems integration, complex systems, vendor management)", () => {
    const entry = matchCaseStudyLibraryEntry(
      "Scope and Systems Integration",
      "Uncontrolled scope growth forced late systems integration, and skipped quality assurance across complex systems strained vendor management."
    );
    expect(entry?.id).toBe("denver-baggage");
  });

  it("still selects a genuinely on-domain entry (fbi-sentinel) for a comprehensive agile/government-software match, unaffected by the fix", () => {
    const entry = matchCaseStudyLibraryEntry(
      "Agile Transformation",
      "This government program switched to iterative delivery after its original vendor management approach failed, tightening its own software requirements along the way."
    );
    expect(entry?.id).toBe("fbi-sentinel");
  });
});

// Boundary behavior: a week that gives the matcher little or no domain
// signal must degrade sanely - return null, never throw, and never force a
// low-confidence guess - so the caller's LLM fallback (which DOES see the
// course's own description) can take over for that week. This is the same
// contract planCourseCaseStudies (src/app/actions/case-study-plan.ts)
// already documents for "no confident match": absent from the returned map,
// not a fatal error and not a fabricated pick.
describe("matchCaseStudyLibraryEntry: boundary behavior with little or no domain signal", () => {
  it("returns null, without throwing, for a topic/summary that shares no vocabulary with any curated entry", () => {
    expect(() => matchCaseStudyLibraryEntry("Underwater Basket Weaving", "")).not.toThrow();
    expect(matchCaseStudyLibraryEntry("Underwater Basket Weaving", "")).toBeNull();
  });

  it("returns null, without throwing, for a completely blank week", () => {
    expect(() => matchCaseStudyLibraryEntry("", "")).not.toThrow();
    expect(matchCaseStudyLibraryEntry("", "")).toBeNull();
  });

  it("degrades to null rather than a coincidental guess when only weak, generic overlap exists (the same four cases above)", () => {
    // Restated explicitly as a boundary-behavior assertion, not just a
    // regression assertion: this IS what "little domain signal" looks like
    // in practice for this matcher - a couple of ordinary technical words
    // with no deeper tie to any one curated entry - and null is the correct,
    // sane degradation, not a defect to work around.
    const entry = matchCaseStudyLibraryEntry("Web Application Security", "A public launch of a new web application.");
    expect(entry).toBeNull();
  });
});

// B3 (docs/REGRESSION.md entry 201's "UNRECORDED BEHAVIOUR 1") - the defect
// this session fixes. Reproduced against the shipped matcher BEFORE the fix:
// matchCaseStudyLibraryEntry("Secure software development lifecycle",
// "Integrating security requirements, code review, and quality assurance
// into each phase of delivery, including a pre-launch security gate before
// rollout.") returned healthcare-gov at evidence 6 (rollout(1) +
// requirements(1) + launch(1) + quality assurance(3)) - none of those four
// terms specific to Healthcare.gov. "quality assurance" is tagged on 8 of
// the original 12 entries (see the document-frequency test below), so its
// PHRASE_WEIGHT bonus was never earned evidence for any one of them.
describe("matchCaseStudyLibraryEntry: B3 fix - a security week no longer reaches an off-domain case", () => {
  it('the exact reported input no longer resolves to healthcare-gov (or any other off-domain project-management entry) - it now resolves to the on-domain B4 entry', () => {
    const entry = matchCaseStudyLibraryEntry(
      "Secure software development lifecycle",
      "Integrating security requirements, code review, and quality assurance into each phase of delivery, including a pre-launch security gate before rollout."
    );
    expect(entry?.id).not.toBe("healthcare-gov");
    // B3's fix alone (voiding "quality assurance"'s phrase bonus) is enough
    // to make this null; B4 then supplies a genuinely on-domain entry
    // (microsoft-trustworthy-computing) that legitimately outscores every
    // remaining project-management candidate on real evidence - see the
    // "B4: cybersecurity entries" describe block below for that entry's own
    // self-match and tag-literalness coverage.
    expect(entry?.id).toBe("microsoft-trustworthy-computing");
  });

  it("library-wide tag document frequency: quality assurance and vendor management are exactly why GENERIC_TAG_MIN_DF is calibrated at 4", () => {
    // Grounds case-study-match.ts's GENERIC_TAG_MIN_DF doc comment in an
    // actual measurement over the real library rather than an assumed
    // number - this is the same style of verification QUALIFY_FLOOR's own
    // doc comment uses.
    const df = new Map<string, number>();
    for (const entry of APPLIED_CASE_STUDIES) {
      const seen = new Set<string>();
      for (const tag of entry.topics) {
        const key = tag.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        df.set(key, (df.get(key) ?? 0) + 1);
      }
    }
    // The two phrase tags actually responsible for the B3 leak (and the
    // "Scope Management" leak fixed alongside it) are both well above the
    // threshold...
    expect(df.get("quality assurance")).toBeGreaterThanOrEqual(4);
    expect(df.get("vendor management")).toBeGreaterThanOrEqual(4);
    // ...while a genuinely corroborating phrase tag (matched healthcare-gov
    // AND mars-climate-orbiter-pm's own real integration-testing stories)
    // sits below it, so it is NOT capped - proving the fix is selective, not
    // a blanket phrase-weight removal.
    expect(df.get("integration testing")).toBeLessThan(4);
  });
});

// B4 (docs/REGRESSION.md entry 190's original Limits, restated through
// entries 199-201): the curated library had zero cybersecurity entries, so a
// security-flavored week always fell through to the LLM fallback - never a
// wrong pick, but never an on-domain curated one either. These tests pin
// that a security week now reaches a genuinely on-domain entry.
describe("matchCaseStudyLibraryEntry: B4 - cybersecurity entries close the content gap", () => {
  it("a patch/vulnerability-management week resolves to the Equifax breach", () => {
    const entry = matchCaseStudyLibraryEntry(
      "Vulnerability Management",
      "Understanding patch management and how unpatched vulnerabilities lead to breaches."
    );
    expect(entry?.id).toBe("equifax-breach");
  });

  it("a third-party/vendor-risk week resolves to the Target breach", () => {
    const entry = matchCaseStudyLibraryEntry(
      "Third-Party Risk",
      "Evaluating third-party vendor access and network segmentation for vendor risk."
    );
    expect(entry?.id).toBe("target-breach");
  });

  it("a secure-SDLC week resolves to Microsoft's Trustworthy Computing initiative", () => {
    const entry = matchCaseStudyLibraryEntry(
      "Secure SDLC",
      "Building security requirements and code review into the software development lifecycle."
    );
    expect(entry?.id).toBe("microsoft-trustworthy-computing");
  });

  it("the Microsoft entry states both 2001 (the worms) and 2002 (the memo/push)", () => {
    const entry = APPLIED_CASE_STUDIES.find((e) => e.id === "microsoft-trustworthy-computing");
    expect(entry).toBeDefined();
    expect(entry!.period).toContain("2001");
    expect(entry!.period).toContain("2002");
  });

  it("the Equifax entry states 2017, not a different year", () => {
    const entry = APPLIED_CASE_STUDIES.find((e) => e.id === "equifax-breach");
    expect(entry).toBeDefined();
    expect(entry!.period).toContain("2017");
  });

  it("the Target entry states 2013, not a different year", () => {
    const entry = APPLIED_CASE_STUDIES.find((e) => e.id === "target-breach");
    expect(entry).toBeDefined();
    expect(entry!.period).toContain("2013");
  });

  it("none of the three new entries are reachable from unrelated, previously-null probes (no new over-broad tags)", () => {
    // The same probes entries 190/199/200/201 used to prove the fix does not
    // reject EVERYTHING, re-run to prove B4's additions do not ACCEPT
    // everything either - a security-adjacent word alone is still not
    // enough evidence for any of the three new entries.
    const probes: [string, string][] = [
      ["Network security fundamentals", "Firewalls, VPNs, and secure network design."],
      ["Password policy and authentication", "Multi-factor authentication and password hygiene."],
      ["Ransomware and incident response", "How organizations detect and respond to ransomware attacks."],
      ["Introduction to Python", "Students write their first Python programs and run them."],
    ];
    for (const [topic, summary] of probes) {
      expect(matchCaseStudyLibraryEntry(topic, summary)).toBeNull();
    }
  });
});
