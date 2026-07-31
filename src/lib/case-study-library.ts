/**
 * Curated case-study knowledge base for APPLIED (no-code) courses - the
 * project-management/business-failure counterpart to
 * src/lib/research/case-studies.ts (which is a SOFTWARE bank, keyed to
 * coding topics). Every entry's "period" is deliberately conservative: a
 * decade, a range, or a "planned X, actually happened Y" qualifier rather
 * than a single bare year, because the professional-lift audit found shipped
 * decks asserting specific years that do not hold up (Denver dated to both
 * 2002 and 2011 in the SAME course; the failure was actually 1994-95). See
 * V2 in that audit: a year attached to a named case is a factual claim held
 * to the same standard as a URL - code owns the verified facts here so the
 * model never has to recall (and risk misremembering) one.
 *
 * Matched by keyword/topic the same way FIELD_RESOURCE_MAP
 * (src/lib/resource-links.ts) matches a field resource: a whole-word test
 * against each entry's `topics`, never a substring match (so "risk" does not
 * match inside "risky").
 */

export interface CaseStudyLibraryEntry {
  id: string;
  /** Display name, deliberately without a year baked in - see the module
   * comment on why a bare year is never asserted here. */
  organization: string;
  /** A conservative, verified period description - never a single disputed
   * year presented as certain. */
  period: string;
  /** Keyword/topic tags used for matching against a week's topic + summary. */
  topics: string[];
  /** 1-2 factual sentences: what happened and why. */
  summary: string[];
  /** One-line connection to what an applied/project-management course teaches. */
  lesson: string;
}

export const APPLIED_CASE_STUDIES: CaseStudyLibraryEntry[] = [
  {
    id: "denver-baggage",
    organization: "Denver International Airport's automated baggage system",
    period: "1994-1995 (the automated system for one concourse was abandoned in 2005)",
    topics: [
      "scope", "vendor management", "systems integration", "testing",
      "schedule", "automation", "logistics", "complex systems", "risk",
      "quality assurance",
    ],
    summary: [
      "The city delayed Denver International Airport's opening by 16 months, into early 1995, after its automated baggage-handling system repeatedly jammed and shredded bags in testing.",
      "The system's scope grew from one concourse to the whole airport mid-project, and the airport ultimately abandoned the automated system for the affected concourse in 2005.",
    ],
    lesson: "Uncontrolled scope growth and skipped integration testing can hold an entire project hostage to one subsystem.",
  },
  {
    id: "healthcare-gov",
    organization: "Healthcare.gov",
    period: "2013",
    topics: [
      "procurement", "vendor management", "integration testing", "government",
      "web", "rollout", "requirements", "launch", "quality assurance",
    ],
    summary: [
      "Healthcare.gov's October 2013 launch collapsed under load within hours, able to complete only a handful of enrollments in its first days.",
      "More than 55 contractors had each built a separate piece with no single technical lead integrating or load-testing the whole system before launch.",
    ],
    lesson: "A project with no single owner accountable for end-to-end integration will fail exactly at integration.",
  },
  {
    id: "big-dig",
    organization: "Boston's Central Artery/Tunnel Project (the Big Dig)",
    period: "1991-2007",
    topics: [
      "cost overrun", "schedule", "construction", "budget", "risk",
      "public works", "stakeholders", "contracts", "quality assurance",
    ],
    summary: [
      "Boston's Central Artery/Tunnel Project ran from 1991 to substantial completion in 2007, with its budget growing from an original estimate near 2.8 billion dollars to more than 14.6 billion dollars.",
      "A ceiling panel installed with the wrong epoxy collapsed in a tunnel in 2006, killing a motorist, and later inquiries tied it to inadequate inspection of a change made under schedule pressure.",
    ],
    lesson: "A budget set before the real scope is known will be wrong, and cutting inspection to protect schedule creates safety risk, not just cost risk.",
  },
  {
    id: "berlin-brandenburg",
    organization: "Berlin Brandenburg Airport (BER)",
    period: "planned to open in 2011; actually opened in 2020",
    topics: [
      "schedule", "construction", "certification", "government",
      "public works", "delay", "planning",
    ],
    summary: [
      "Berlin Brandenburg Airport was originally planned to open in 2011 but did not open until October 2020, a delay of nearly nine years.",
      "Its fire-safety and smoke-extraction systems repeatedly failed certification, and the project changed sponsors and plans multiple times without a single, stable design being carried through to completion.",
    ],
    lesson: "A schedule announced before a design is finished, and a project that changes its own plan mid-stream, both erode the credibility of every date that follows.",
  },
  {
    id: "fbi-vcf",
    organization: "The FBI's Virtual Case File (VCF) program",
    period: "began around 2000; cancelled in 2005",
    topics: [
      "requirements", "government", "software", "vendor management",
      "scope", "waterfall", "contracts",
    ],
    summary: [
      "The FBI's Virtual Case File program spent roughly 170 million dollars over several years before being cancelled in 2005 without a usable system.",
      "Requirements kept changing while the contractor built against a fixed, upfront specification, so the delivered software no longer matched what agents actually needed by the time any of it was ready.",
    ],
    lesson: "A large fixed upfront specification cannot survive years of changing requirements - the FBI's own successor program (Sentinel) later adopted iterative delivery specifically because of this failure.",
  },
  {
    id: "fbi-sentinel",
    organization: "The FBI's Sentinel case-management system",
    period: "contracted around 2006; deployed in 2012 after being restructured",
    topics: [
      "agile", "iterative delivery", "government", "vendor management",
      "requirements", "software",
    ],
    summary: [
      "Sentinel, the FBI's replacement for Virtual Case File, also ran over budget and behind schedule under its original contractor.",
      "The FBI brought development in-house partway through and switched to an iterative, agile approach, which let it finish and deploy the system in 2012.",
    ],
    lesson: "Switching to iterative delivery mid-program, and bringing accountability in-house, can rescue a program a rigid waterfall contract could not.",
  },
  {
    id: "mars-climate-orbiter-pm",
    organization: "NASA's Mars Climate Orbiter",
    period: "1999",
    topics: [
      "units", "interfaces", "integration testing", "quality assurance",
      "communication", "requirements", "handoff", "vendor management",
    ],
    summary: [
      "NASA lost the Mars Climate Orbiter in 1999 when it entered the Martian atmosphere far lower than planned and disintegrated.",
      "One contractor's navigation software produced data in pound-force seconds while NASA's own team expected newton-seconds, and neither side's review process caught the mismatch before the spacecraft reached Mars.",
    ],
    lesson: "A handoff between teams needs an explicit, checked contract for units and formats - review processes must verify assumptions, not just each side's own internal work.",
  },
  {
    id: "citytime",
    organization: "New York City's CityTime payroll project",
    period: "contracted in the early 2000s; fraud exposed in 2010-2011",
    topics: [
      "fraud", "vendor management", "oversight", "government", "contracts",
      "procurement", "cost overrun", "risk",
    ],
    summary: [
      "New York City's CityTime employee timekeeping project grew from an original estimate of about 63 million dollars to more than 700 million dollars.",
      "A federal investigation exposed in 2010-2011 found subcontractor staff had defrauded the city for years by inflating hours and taking kickbacks, undetected because no one independently verified contractor billing against actual work.",
    ],
    lesson: "A project with no independent check on contractor billing and deliverables invites exactly the fraud that check would have caught.",
  },
  {
    id: "boeing-787",
    organization: "Boeing's 787 Dreamliner program",
    period: "launched in 2004; first delivered in 2011, about three years late",
    topics: [
      "supply chain", "outsourcing", "schedule", "vendor management",
      "quality assurance", "manufacturing", "risk",
    ],
    summary: [
      "Boeing outsourced an unusually large share of the 787's design and manufacturing to suppliers worldwide, expecting them to deliver finished sub-assemblies on a fixed schedule.",
      "Many suppliers could not meet the specifications or schedule on their own, forcing Boeing to take over troubled work itself, which pushed first delivery to 2011, about three years behind the original plan.",
    ],
    lesson: "Outsourcing removes day-to-day control; a project that depends on many suppliers still needs the prime contractor to verify their capability before committing to a shared schedule.",
  },
  {
    id: "london-ambulance-cad",
    organization: "The London Ambulance Service's computer-aided dispatch system",
    period: "1992",
    topics: [
      "software failure", "testing", "rollout", "operations", "safety",
      "healthcare", "requirements", "quality assurance",
    ],
    summary: [
      "The London Ambulance Service switched its entire dispatch operation to a new computer-aided dispatch system in October 1992, and the system collapsed within days under real call volume.",
      "The system had not been tested at realistic call volumes before the full cutover, and ambulances were delayed reaching patients while staff reverted to manual methods.",
    ],
    lesson: "A full cutover with no tested fallback, on a system never proven at real load, turns a software bug into a life-safety incident.",
  },
  {
    id: "challenger",
    organization: "NASA's Space Shuttle Challenger",
    period: "1986",
    topics: [
      "risk", "safety culture", "schedule pressure", "decision making",
      "quality assurance", "government", "communication", "ethics",
    ],
    summary: [
      "The Space Shuttle Challenger broke apart 73 seconds after launch on January 28, 1986, killing its crew of seven, after cold weather made an O-ring seal fail.",
      "Engineers had raised concerns about launching in cold temperatures the night before, but managers under schedule pressure approved the launch anyway.",
    ],
    lesson: "A team that can raise a safety concern is not enough - the project also needs a decision process where schedule pressure cannot override that concern.",
  },
  {
    id: "deepwater-horizon",
    organization: "The Deepwater Horizon drilling rig",
    period: "2010",
    topics: [
      "safety", "risk management", "oversight", "contractors",
      "communication", "regulatory", "quality assurance",
    ],
    summary: [
      "The Deepwater Horizon drilling rig exploded in the Gulf of Mexico in April 2010, killing 11 workers and causing the largest offshore oil spill in U.S. history.",
      "Investigations found the well's owner and its contractors each managed their own piece of the work with weak coordination between them, and warning signs from pressure tests were misread or ignored under time and cost pressure.",
    ],
    lesson: "When several contractors each own a piece of a risky project, no one owns the interfaces between them - which is exactly where warning signs get missed.",
  },
];

function normalizeForMatch(text: string): string {
  return text.toLowerCase();
}

function wholeWordMatch(term: string, normalizedText: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(normalizedText);
}

/**
 * The best-matching curated entry for a week's topic + summary, or null when
 * nothing matches (or every candidate is excluded). `exclude` holds entry
 * ids already claimed by another week in this same run, so the same curated
 * case is never assigned to two different weeks. Scored by how many of an
 * entry's topic tags whole-word-match the week's text; ties keep the
 * library's own declared order (earlier entries win).
 */
export function matchCaseStudyLibraryEntry(
  topic: string,
  summary: string,
  exclude: ReadonlySet<string> = new Set()
): CaseStudyLibraryEntry | null {
  const text = normalizeForMatch(`${topic} ${summary}`);
  if (!text.trim()) return null;

  let best: { entry: CaseStudyLibraryEntry; score: number } | null = null;
  for (const entry of APPLIED_CASE_STUDIES) {
    if (exclude.has(entry.id)) continue;
    const score = entry.topics.filter((tag) => wholeWordMatch(tag, text)).length;
    if (score === 0) continue;
    if (!best || score > best.score) {
      best = { entry, score };
    }
  }
  return best?.entry ?? null;
}
