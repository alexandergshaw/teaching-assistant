import { describe, it, expect } from "vitest";
import {
  findCaseStudySlide,
  caseStudyDescriptor,
  extractOrganizationCandidates,
  detectReusedCaseStudies,
  type CaseStudyPlan,
} from "./case-study-reuse";

describe("findCaseStudySlide", () => {
  it("finds the slide whose title starts with 'Case Study:'", () => {
    const slides = [
      { title: "Project Scheduling", bullets: [] },
      { title: "Case Study: Boeing 737 MAX", bullets: ["b"] },
      { title: "Principle: risk", bullets: [] },
    ];
    expect(findCaseStudySlide(slides)?.title).toBe("Case Study: Boeing 737 MAX");
  });

  it("returns undefined when there is no Case Study slide", () => {
    const slides = [{ title: "Principle: risk", bullets: [] }];
    expect(findCaseStudySlide(slides)).toBeUndefined();
  });

  it("is case-insensitive on the prefix", () => {
    const slides = [{ title: "case study: something", bullets: [] }];
    expect(findCaseStudySlide(slides)).toBeDefined();
  });
});

describe("caseStudyDescriptor", () => {
  it("strips the 'Case Study:' prefix and trims", () => {
    expect(caseStudyDescriptor({ title: "Case Study:   Boeing 737 MAX  ", bullets: [] })).toBe("Boeing 737 MAX");
  });

  it("falls back to the first bullet when the title has nothing after the prefix", () => {
    expect(caseStudyDescriptor({ title: "Case Study:", bullets: ["The 2012 London Olympics ran over budget."] })).toBe(
      "The 2012 London Olympics ran over budget."
    );
  });

  it("falls back to a generic label when title and bullets are both empty", () => {
    expect(caseStudyDescriptor({ title: "Case Study:", bullets: [] })).toBe("an unnamed case study");
  });
});

describe("extractOrganizationCandidates", () => {
  it("extracts a multi-word proper noun phrase", () => {
    const candidates = extractOrganizationCandidates("The Deepwater Horizon disaster cost billions.");
    expect(candidates).toContain("Deepwater Horizon");
  });

  it("extracts a single well-known organization name", () => {
    const candidates = extractOrganizationCandidates("NASA lost contact with the probe.");
    expect(candidates).toContain("NASA");
  });

  it("does not treat sentence-initial generic words as organizations", () => {
    const candidates = extractOrganizationCandidates("The team missed the deadline. This was a costly mistake.");
    expect(candidates).not.toContain("The");
    expect(candidates).not.toContain("This");
  });

  it("drops a lone short capitalized word that is too weak a signal alone", () => {
    const candidates = extractOrganizationCandidates("It was a bad week.");
    expect(candidates).not.toContain("It");
  });

  it("extracts multiple distinct candidates from the same text", () => {
    const candidates = extractOrganizationCandidates(
      "Boeing and the Federal Aviation Administration both faced scrutiny."
    );
    expect(candidates).toContain("Boeing");
    expect(candidates).toContain("Federal Aviation Administration");
  });

  it("returns an empty array for text with no capitalized words", () => {
    expect(extractOrganizationCandidates("the quick fix was not enough")).toEqual([]);
  });

  it("caps a phrase run at 4 consecutive capitalized words", () => {
    const candidates = extractOrganizationCandidates("A B C D E all appeared together.");
    expect(candidates.some((c) => c.split(" ").length > 4)).toBe(false);
  });
});

describe("detectReusedCaseStudies", () => {
  it("returns [] when every week's Case Study names a different organization", () => {
    const plans = [
      { weekNumber: 1, slides: [{ title: "Case Study: Boeing 737 MAX", bullets: ["b"] }] },
      { weekNumber: 2, slides: [{ title: "Case Study: Enron", bullets: ["b"] }] },
    ];
    expect(detectReusedCaseStudies(plans)).toEqual([]);
  });

  it("detects the same organization named on two different weeks' Case Study slides", () => {
    const plans = [
      {
        weekNumber: 1,
        slides: [{ title: "Case Study: The 2012 London Olympics", bullets: ["Construction ran over budget."] }],
      },
      { weekNumber: 5, slides: [{ title: "Principle: risk", bullets: [] }] },
      {
        weekNumber: 7,
        slides: [{ title: "Case Study: A Later Overrun", bullets: ["The London Olympics faced delays too."] }],
      },
    ];
    const reused = detectReusedCaseStudies(plans);
    const london = reused.find((r) => r.organization.toLowerCase().includes("london"));
    expect(london).toBeDefined();
    expect(london!.weeks).toEqual([1, 7]);
  });

  it("ignores weeks with no Case Study slide", () => {
    const plans = [
      { weekNumber: 1, slides: [{ title: "Principle: risk", bullets: [] }] },
      { weekNumber: 2, slides: [{ title: "Principle: schedule", bullets: [] }] },
    ];
    expect(detectReusedCaseStudies(plans)).toEqual([]);
  });

  it("does not flag an organization that only appears on one week's Case Study slide", () => {
    const plans = [
      { weekNumber: 1, slides: [{ title: "Case Study: Boeing 737 MAX", bullets: ["b"] }] },
      { weekNumber: 2, slides: [{ title: "Case Study: Enron collapse", bullets: ["b"] }] },
    ];
    const reused = detectReusedCaseStudies(plans);
    expect(reused.every((r) => !r.organization.toLowerCase().includes("boeing"))).toBe(true);
  });

  it("returns results sorted by organization name, weeks sorted ascending", () => {
    const plans = [
      { weekNumber: 3, slides: [{ title: "Case Study: Zenith Corp failure", bullets: ["Zenith Corp collapsed."] }] },
      { weekNumber: 9, slides: [{ title: "Case Study: A rehash", bullets: ["Zenith Corp again."] }] },
      { weekNumber: 1, slides: [{ title: "Case Study: Acme Inc rise", bullets: ["Acme Inc grew fast."] }] },
      { weekNumber: 4, slides: [{ title: "Case Study: Acme Inc troubles", bullets: ["Acme Inc struggled."] }] },
    ];
    const reused = detectReusedCaseStudies(plans);
    const names = reused.map((r) => r.organization);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    const acme = reused.find((r) => r.organization.includes("Acme"));
    expect(acme?.weeks).toEqual([1, 4]);
  });

  // Regression test for the P2-AC8 bug report: run against the REAL 16-week
  // MGT 422 Case Study titles as shipped, `detectReusedCaseStudies` used to
  // report 6 collision groups, 2 of which were generic-English-word false
  // positives ("Lack" from a sentence-initial bullet on weeks 4/9/12, and
  // "Construction" from week 14's title) rather than actual reused
  // organizations/events. Only 4 of the 6 were genuine. This fixture
  // reproduces that exact course and asserts the noise is gone while all
  // four real collisions still report.
  it("against the real 16-week MGT 422 course, reports only the 4 genuine collisions - no generic-word false positives", () => {
    const realTitles = [
      "The Denver International Airport Baggage System (1995)",
      "The Denver International Airport Baggage System (1994)",
      "The Denver International Airport Baggage System (1994)",
      "The Sydney Opera House (1959-1973)",
      "The Sydney Opera House",
      "The Denver International Airport Baggage System (1994)",
      "The 2012 London Olympics Infrastructure",
      "The Big Dig (Boston, 1991-2007)",
      "The Denver International Airport Automated Baggage System (1994)",
      "The Denver International Airport Baggage System",
      "The Big Dig (Boston, 2006)",
      "The Boeing 787 Dreamliner (2007-2011)",
      "The Denver International Airport Baggage System (1995)",
      "The London 2012 Olympic Park Construction",
      "The Sydney Opera House Overrun",
      "The 2013 Healthcare.gov Launch",
    ];

    // Weeks 4, 9 and 12 shipped with a Case Study bullet that opens with the
    // sentence-initial (but non-organization) word "Lack" - the real
    // false-positive case from the bug report.
    const lackBulletWeeks = new Set([4, 9, 12]);

    const plans: CaseStudyPlan[] = realTitles.map((title, i) => {
      const weekNumber = i + 1;
      const bullets = lackBulletWeeks.has(weekNumber)
        ? ["Lack of stakeholder alignment caused the overrun."]
        : [];
      return {
        weekNumber,
        slides: [{ title: `Case Study: ${title}`, bullets }],
      };
    });

    const reused = detectReusedCaseStudies(plans);

    expect(reused).toHaveLength(4);

    const denver = reused.find((r) => r.organization.toLowerCase().includes("denver"));
    expect(denver).toBeDefined();
    expect(denver!.weeks).toEqual([1, 2, 3, 6, 9, 10, 13]);

    for (const r of reused) {
      expect(r.organization).not.toContain("Lack");
      expect(r.organization).not.toBe("Construction");
    }
  });
});
