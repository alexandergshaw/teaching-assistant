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
 * match inside "risky"). The scoring/exclusion mechanism itself is shared
 * with the CODING case-study bank (src/lib/research/case-studies.ts) via
 * matchBestByTopics (src/lib/case-study-match.ts) - Z1 (Group Z): same
 * mechanism, same guarantees, for both course kinds.
 */

import { matchBestByTopics } from "./case-study-match";

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
    // "scope creep" (unlike every other tag here) is not a literal phrase
    // from this entry's own write-up below, which says "scope grew" rather
    // than "scope creep" - but it is the standard project-management TERM
    // OF ART for exactly what happened here (scope expanding from one
    // concourse to the whole airport mid-project), so it is real,
    // case-specific evidence rather than an invented filler tag. It exists
    // to keep "scope" + "vendor management" - two tags that individually
    // and together (evidence 1 + 3 = 4) fall one point short of
    // QUALIFY_FLOOR (5) - reachable for a week phrased with this exact,
    // ordinary PM vocabulary (see case-study-plan.test.ts's "Scope
    // Management" / "Scope creep and vendor management issues." fixture,
    // src/app/actions/case-study-plan.test.ts, which is out of scope for
    // this fix to edit but must keep passing).
    topics: [
      "scope", "vendor management", "systems integration", "testing",
      "schedule", "automation", "logistics", "complex systems", "risk",
      "quality assurance", "baggage system", "scope creep",
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
      "rollout", "requirements", "launch", "quality assurance",
      "end-to-end integration", "single owner",
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
      "epoxy", "inadequate inspection",
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
      "public works", "delay", "planning", "smoke-extraction",
      "changed sponsors",
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
      "scope", "waterfall", "contracts", "upfront specification",
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
      "requirements", "waterfall contract",
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
      "handoff", "vendor management", "review process",
    ],
    summary: [
      "NASA lost the Mars Climate Orbiter in 1999 when it entered the Martian atmosphere far lower than planned and disintegrated.",
      "One contractor's navigation software produced data in pound-force seconds while NASA's own team expected newton-seconds, and neither side's review process caught the mismatch before the spacecraft reached Mars.",
    ],
    lesson: "A handoff between teams needs an explicit, checked contract for units and formats - review processes must verify assumptions, not just each side's own internal work.",
  },
  {
    // NOTE ON SELF-MATCH COVERAGE: this is the one entry (of 12) that does
    // NOT match its own organization + summary + lesson text under
    // QUALIFY_FLOOR (src/lib/case-study-match.ts) - its evidence score is 1
    // (only the "fraud" tag literally recurs in its own write-up; the
    // write-up's other distinctive language - "kickbacks", "billing",
    // "timekeeping" - was deliberately left untagged rather than padding
    // this entry with tags invented solely to make a self-match test pass).
    // matchCaseStudyLibraryEntry("New York City's CityTime payroll project",
    // <this entry's own summary + lesson>) correctly returns null rather
    // than a low-confidence guess, and case-study-library.test.ts's
    // data-driven self-match suite budgets for exactly this one miss (the
    // acceptance bar is >= 11 of 12, not 12 of 12). It remains fully
    // reachable for a week that actually discusses fraud, oversight, and
    // vendor billing together - see that test file's "still reachable"
    // coverage for the same principle applied to other entries.
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
      "quality assurance", "manufacturing", "risk", "suppliers",
      "prime contractor",
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
      "software failure", "testing", "rollout", "safety",
      "healthcare", "requirements", "quality assurance", "cutover",
      "call volume",
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
      "o-ring", "raised concerns",
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
      "safety", "oversight", "contractors",
      "communication", "regulatory", "quality assurance", "oil spill",
      "warning signs",
    ],
    summary: [
      "The Deepwater Horizon drilling rig exploded in the Gulf of Mexico in April 2010, killing 11 workers and causing the largest offshore oil spill in U.S. history.",
      "Investigations found the well's owner and its contractors each managed their own piece of the work with weak coordination between them, and warning signs from pressure tests were misread or ignored under time and cost pressure.",
    ],
    lesson: "When several contractors each own a piece of a risky project, no one owns the interfaces between them - which is exactly where warning signs get missed.",
  },
  // B4 (docs/REGRESSION.md entry 190's original Limits, restated in entries
  // 199-201): every entry above is a project-management megaproject failure -
  // aerospace, government web, airport logistics, construction, oil and gas,
  // municipal payroll, manufacturing - and NOT ONE is a software-security
  // case. So a security-flavored week correctly fell through to the LLM
  // fallback every time (requireDistinctiveMatch rejecting every
  // cross-industry coincidence, exactly as designed) rather than ever having
  // an on-domain curated entry to reach. These three close that content gap.
  // Same shape, tone, and level of detail as the twelve above: a real,
  // verifiable incident, a conservative period (never a single disputed
  // year), tags that are - with the same literal-phrase discipline the rest
  // of this file uses - drawn from each entry's own summary/lesson text, and
  // a lesson connecting the incident to what an applied (no-code) course
  // teaches about process, not code.
  {
    id: "microsoft-trustworthy-computing",
    organization: "Microsoft's Trustworthy Computing security initiative",
    period: "2001 Code Red/Nimda worms; the Trustworthy Computing memo and security push in 2002",
    topics: [
      "buffer overflow", "patch", "worm", "trustworthy computing",
      "code review", "security requirements", "threat modeling",
      "security gate", "software development lifecycle",
    ],
    summary: [
      "The Code Red worm exploited a buffer overflow in Microsoft's IIS web server software in July 2001, infecting more than 359,000 hosts within 14 hours even though Microsoft had published a patch for the underlying flaw about a month earlier; the Nimda worm followed that September.",
      "Bill Gates's company-wide 'Trustworthy Computing' memo in January 2002 told Microsoft to prioritize security over new features, and Windows engineering paused feature work for weeks so staff could take secure-coding training and complete a full code review; the effort led Microsoft to formalize a Security Development Lifecycle requiring security requirements, threat modeling, and code review at every phase, with a mandatory security gate before a product could ship.",
    ],
    lesson: "Security bolted on after release comes too late - a secure software development lifecycle needs security requirements, code review, and a release gate built into every phase, not left to the aftermath of the last worm.",
  },
  {
    id: "equifax-breach",
    organization: "Equifax's 2017 data breach",
    period: "vulnerability exploited from May 2017; publicly disclosed in September 2017",
    topics: [
      "vulnerability", "web framework", "patch", "patch management",
      "expired certificate", "intrusion", "data breach", "personal data",
      "settlement", "regulators",
    ],
    summary: [
      "Attackers exploited a known vulnerability in the Apache Struts web framework that Equifax had failed to patch on an internet-facing system, despite a patch being available for months, and used it to access Equifax's network from May 2017 onward.",
      "An expired certificate on Equifax's own traffic-inspection tool left encrypted network traffic uninspected for months, letting the intrusion go undetected until it was discovered in late July 2017; the breach, publicly disclosed that September, exposed personal data for approximately 147 million people and led to a settlement of up to 700 million dollars with US regulators.",
    ],
    lesson: "A patch that exists but is never applied protects no one - a patch management process and basic monitoring hygiene, like a current inspection certificate, are only as strong as the discipline that maintains them.",
  },
  {
    id: "target-breach",
    organization: "Target Corporation's 2013 payment card breach",
    period: "attackers active from late November to mid-December 2013; disclosed in December 2013",
    topics: [
      "third-party vendor", "network segmentation", "phishing", "malware",
      "point of sale", "payment card", "security alerts", "vendor access",
      "resigned",
    ],
    summary: [
      "Attackers stole network credentials from Fazio Mechanical Services, a third-party vendor providing HVAC services to Target Corporation, through a phishing email, then used that vendor access to reach Target's network because Target lacked adequate network segmentation between the vendor portal and the systems that processed customer payments.",
      "Malware installed on point of sale terminals captured roughly 40 million customers' payment card numbers and personal information for about 70 million more between late November and mid-December 2013; Target's own security monitoring tools had raised security alerts about the intrusion that its team did not act on before the theft was discovered, and both the company's CEO and CIO resigned in 2014.",
    ],
    lesson: "A vendor's network access is your network's access - without real network segmentation between third-party vendors and payment systems, and a process that actually acts on the security alerts your monitoring tools raise, both are just theater.",
  },
];

/**
 * The best-matching curated entry for a week's topic + summary, or null when
 * nothing matches (every candidate is excluded, or the single best-scoring
 * candidate doesn't clear the evidence floor below). `exclude` holds entry
 * ids already claimed by another week in this same run, so the same curated
 * case is never assigned to two different weeks. Every candidate is scored
 * by the SAME phrase-weighted evidence measure (qualifyingEvidenceScore) used
 * both to RANK candidates against each other and to GATE the single winner
 * against the evidence floor - one number, read twice, never two different
 * numbers that could disagree. Only the single top-scoring candidate is
 * checked against the floor; a lower-scoring candidate can never be returned
 * instead of a higher-scoring one, even when the higher scorer fails that
 * check (see matchBestByTopics, src/lib/case-study-match.ts, for the full
 * mechanism and the two independent real defects this guards against: an
 * earlier, filter-first version that let a low-scoring coincidental phrase
 * match beat a high-scoring correct match for the exact same week, and a
 * later version - fixed after a regression gate reproduced it against this
 * exact library - where ranking used the raw matched-tag count while gating
 * used this weighted evidence score, two different measures that could and
 * did pick different winners).
 *
 * requireDistinctiveMatch=true (the "off-domain case study" fix): unlike
 * CASE_STUDIES (src/lib/research/case-studies.ts), a single coherent
 * software-engineering domain, APPLIED_CASE_STUDIES pools case studies from
 * many UNRELATED industries - aerospace (Challenger, Mars Climate Orbiter),
 * government web services (Healthcare.gov), airport logistics (Denver),
 * construction (Big Dig, Berlin Brandenburg), oil and gas (Deepwater
 * Horizon), municipal payroll (CityTime), manufacturing (Boeing 787) -
 * tagged with a shared vocabulary of generic project-management/engineering
 * words most of those industries' write-ups use regardless of subject
 * (risk, schedule, testing, requirements, quality assurance, communication,
 * government, launch, ...). Without requireDistinctiveMatch, a week
 * from ANY technical field can coincidentally out-score every genuinely
 * on-topic entry just by using ordinary technical English - this is exactly
 * how a real cybersecurity course ended up with the Challenger disaster,
 * the Mars Climate Orbiter, Healthcare.gov, and Denver's baggage system as
 * "its" case studies: none of the four is a software or security case, but
 * each has enough shared generic vocabulary to win on a coincidental
 * one-or-two-word overlap when nothing more specific exists in this
 * curated, all-industries library for that week. requireDistinctiveMatch
 * makes this matcher decline (return null) rather than assert a weak,
 * coincidental match; the caller (planCourseCaseStudies,
 * src/app/actions/case-study-plan.ts) already falls back to an LLM pass for
 * any week this returns null for, and THAT pass does receive the course's
 * own description, so it can propose an actually-on-domain case even when
 * this curated library has none. See matchBestByTopics
 * (src/lib/case-study-match.ts) for the full mechanism and the
 * IDF-weighting alternative rejected in favor of this.
 */
export function matchCaseStudyLibraryEntry(
  topic: string,
  summary: string,
  exclude: ReadonlySet<string> = new Set()
): CaseStudyLibraryEntry | null {
  return matchBestByTopics(APPLIED_CASE_STUDIES, topic, summary, exclude, true);
}
