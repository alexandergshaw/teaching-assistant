/**
 * Curated case-study knowledge base for the research library. Every entry is a
 * real, widely documented event, summarized conservatively: the facts stated
 * here (organization, year, what happened) are established in public postmortems
 * and reporting. This is the deterministic counterpart to an LLM recalling a
 * case study: retrieval from a vetted list instead of model memory, so nothing
 * is fabricated.
 */

export interface CaseStudyEntry {
  kind: "case_study";
  id: string;
  title: string;
  year: number;
  organization: string;
  /** Topic tags used for retrieval matching. */
  topics: string[];
  /** Two factual bullets: what happened and why. */
  summary: string[];
  /** The connection to what students are learning. */
  lesson: string;
}

export const CASE_STUDIES: CaseStudyEntry[] = [
  {
    kind: "case_study",
    id: "therac-25",
    title: "The Therac-25 Radiation Overdoses",
    year: 1986,
    organization: "AECL",
    topics: ["concurrency", "race conditions", "testing", "safety", "threads", "medical software", "software engineering"],
    summary: [
      "Between 1985 and 1987 the Therac-25 radiation therapy machine delivered massive overdoses to patients, with fatal results.",
      "A race condition in the control software let the machine fire its high-power beam without the protective target in place, and earlier hardware interlocks had been removed in favor of software checks.",
    ],
    lesson: "Safety-critical software needs defensive design, independent interlocks, and rigorous testing of concurrent code paths.",
  },
  {
    kind: "case_study",
    id: "ariane-5",
    title: "Ariane 5 Flight 501 Self-Destructs",
    year: 1996,
    organization: "European Space Agency",
    topics: ["type conversion", "integers", "overflow", "exceptions", "code reuse", "testing", "data types"],
    summary: [
      "Ariane 5's first flight self-destructed about 40 seconds after launch in 1996, destroying the rocket and its payload.",
      "Guidance code reused from Ariane 4 converted a 64-bit floating-point value to a 16-bit signed integer; the larger rocket's flight profile overflowed it, crashing both inertial reference systems.",
    ],
    lesson: "Validate numeric ranges and type conversions whenever code is reused in a new context.",
  },
  {
    kind: "case_study",
    id: "mars-climate-orbiter",
    title: "The Mars Climate Orbiter Unit Mix-Up",
    year: 1999,
    organization: "NASA / Lockheed Martin",
    topics: ["units", "functions", "interfaces", "integration testing", "conversion", "apis"],
    summary: [
      "NASA's Mars Climate Orbiter was lost in 1999 when it entered the Martian atmosphere far lower than planned.",
      "One team's software produced thruster impulse data in pound-force seconds while the receiving software expected newton-seconds, so trajectory corrections were consistently wrong.",
    ],
    lesson: "Agree on units and data contracts at every interface, and test integrations end to end.",
  },
  {
    kind: "case_study",
    id: "knight-capital",
    title: "Knight Capital's 45-Minute Collapse",
    year: 2012,
    organization: "Knight Capital",
    topics: ["deployment", "devops", "dead code", "feature flags", "finance", "testing", "operations"],
    summary: [
      "Knight Capital lost about 440 million dollars in roughly 45 minutes of trading on August 1, 2012.",
      "A manual deployment left old, repurposed test code active on one of eight servers, which flooded the market with unintended orders.",
    ],
    lesson: "Automate deployments, delete dead code, and use feature flags so one stale server cannot take down the business.",
  },
  {
    kind: "case_study",
    id: "equifax-2017",
    title: "The Equifax Data Breach",
    year: 2017,
    organization: "Equifax",
    topics: ["security", "dependencies", "patching", "web", "vulnerabilities", "frameworks"],
    summary: [
      "Attackers accessed personal data of about 147 million people at Equifax in 2017.",
      "The breach exploited a known Apache Struts vulnerability for which a patch had been available for months before the intrusion.",
    ],
    lesson: "Track your dependencies and apply security patches promptly; attackers automate scanning for known flaws.",
  },
  {
    kind: "case_study",
    id: "morris-worm",
    title: "The Morris Worm",
    year: 1988,
    organization: "Internet-wide",
    topics: ["security", "buffer overflow", "networking", "c", "input validation"],
    summary: [
      "The 1988 Morris worm was one of the first programs to spread itself across the internet, infecting an estimated tenth of connected machines.",
      "It exploited a buffer overflow in the fingerd service and a debug feature left enabled in sendmail, and replicated so aggressively that it crippled the systems it infected.",
    ],
    lesson: "Validate input lengths and never ship debug backdoors; small oversights become internet-scale incidents.",
  },
  {
    kind: "case_study",
    id: "y2k",
    title: "The Y2K Date Rollover",
    year: 2000,
    organization: "Industry-wide",
    topics: ["data representation", "dates", "technical debt", "maintenance", "legacy code"],
    summary: [
      "For decades programs stored years as two digits, so the year 2000 would be indistinguishable from 1900.",
      "A massive worldwide remediation effort in the late 1990s fixed most systems, and the rollover passed with only scattered failures.",
    ],
    lesson: "Data representation choices outlive the code that made them; design for the whole lifetime of your data.",
  },
  {
    kind: "case_study",
    id: "heartbleed",
    title: "The Heartbleed OpenSSL Bug",
    year: 2014,
    organization: "OpenSSL",
    topics: ["security", "c", "memory", "bounds checking", "open source", "web", "encryption"],
    summary: [
      "Heartbleed, disclosed in 2014, let attackers read up to 64 KB of server memory at a time from systems using OpenSSL.",
      "A missing bounds check in the TLS heartbeat feature echoed back whatever memory followed the request buffer, including private keys and passwords.",
    ],
    lesson: "Bounds-check every read; widely reused open-source code concentrates risk when a flaw slips through.",
  },
  {
    kind: "case_study",
    id: "gangnam-style-counter",
    title: "Gangnam Style Overflows YouTube's View Counter",
    year: 2014,
    organization: "YouTube",
    topics: ["integers", "overflow", "data types", "variables"],
    summary: [
      "In 2014 the video for Gangnam Style headed past 2,147,483,647 views, the maximum value of a signed 32-bit integer.",
      "YouTube upgraded its view counter to a 64-bit integer so the count could keep climbing.",
    ],
    lesson: "Choose integer types for the values you will eventually have, not just the ones you have today.",
  },
  {
    kind: "case_study",
    id: "excel-gene-names",
    title: "Excel Auto-Correct Corrupts Gene Names",
    year: 2016,
    organization: "Genomics research community",
    topics: ["spreadsheets", "data cleaning", "data types", "csv", "data science", "excel"],
    summary: [
      "Studies found that a large share of genomics papers had supplementary data corrupted by Excel auto-converting gene names such as SEPT2 into dates.",
      "The problem proved so persistent that in 2020 the human gene naming committee renamed the affected genes to stop the corruption.",
    ],
    lesson: "Spreadsheet type inference silently rewrites data; control column types explicitly when importing and cleaning data.",
  },
  {
    kind: "case_study",
    id: "aws-s3-2017",
    title: "The Amazon S3 Typo Outage",
    year: 2017,
    organization: "Amazon Web Services",
    topics: ["operations", "cloud", "devops", "distributed systems", "tooling"],
    summary: [
      "In February 2017 a large part of the web broke for about four hours when Amazon S3's US-East-1 region went down.",
      "An engineer debugging the billing system mistyped one command parameter and removed far more servers than intended, forcing a full subsystem restart.",
    ],
    lesson: "Build guardrails into operational tooling; a one-character mistake should not have internet-wide blast radius.",
  },
  {
    kind: "case_study",
    id: "crowdstrike-2024",
    title: "The CrowdStrike Windows Outage",
    year: 2024,
    organization: "CrowdStrike",
    topics: ["testing", "deployment", "rollouts", "operating systems", "drivers", "updates"],
    summary: [
      "In July 2024 a faulty CrowdStrike content update crashed about 8.5 million Windows machines worldwide.",
      "Airlines, hospitals, and banks were disrupted for days because affected machines needed manual intervention to boot.",
    ],
    lesson: "Stage rollouts and test updates against real configurations before shipping to everyone at once.",
  },
  {
    kind: "case_study",
    id: "patriot-1991",
    title: "The Patriot Missile Timing Drift",
    year: 1991,
    organization: "US Army",
    topics: ["floating point", "precision", "real-time", "embedded systems", "rounding"],
    summary: [
      "In 1991 a Patriot battery in Dhahran failed to intercept an incoming Scud missile, and 28 soldiers were killed in the strike.",
      "The system counted time in tenths of a second, a value with no exact binary representation; after about 100 hours of continuous operation the accumulated rounding error had shifted its tracking window off target.",
    ],
    lesson: "Floating-point error accumulates over time; precision is a design decision in any long-running system.",
  },
  {
    kind: "case_study",
    id: "left-pad",
    title: "The left-pad Incident",
    year: 2016,
    organization: "npm ecosystem",
    topics: ["javascript", "npm", "dependencies", "package management", "node", "build tools"],
    summary: [
      "In 2016 an author unpublished left-pad, an 11-line npm package, and builds broke across the internet within hours.",
      "Thousands of projects, including React and Babel, depended on it directly or indirectly.",
    ],
    lesson: "Know what your project depends on; a tiny transitive dependency is still a single point of failure.",
  },
  {
    kind: "case_study",
    id: "gitlab-2017",
    title: "GitLab's Database Deletion",
    year: 2017,
    organization: "GitLab",
    topics: ["databases", "backups", "sql", "operations", "postgresql"],
    summary: [
      "In 2017 a GitLab engineer working on database replication accidentally deleted the primary production database directory.",
      "Five separate backup mechanisms turned out to be failing or misconfigured; about six hours of data were lost, and GitLab published the full postmortem while restoring from a staging snapshot.",
    ],
    lesson: "A backup you have never restored is not a backup; verify recovery paths, not just backup jobs.",
  },
  {
    kind: "case_study",
    id: "facebook-bgp-2021",
    title: "Facebook's Six-Hour BGP Outage",
    year: 2021,
    organization: "Meta",
    topics: ["networking", "dns", "bgp", "infrastructure", "routing"],
    summary: [
      "In October 2021 Facebook, Instagram, and WhatsApp disappeared from the internet for about six hours.",
      "A maintenance command withdrew the BGP routes to Facebook's own DNS servers, and internal tools that depended on the same network locked engineers out of the systems needed to fix it.",
    ],
    lesson: "Networks fail as systems: DNS, routing, and even building access can share one hidden dependency.",
  },
  {
    kind: "case_study",
    id: "apollo-11-1202",
    title: "Apollo 11's 1202 Alarms",
    year: 1969,
    organization: "NASA",
    topics: ["real-time", "operating systems", "prioritization", "scheduling", "embedded systems"],
    summary: [
      "During the 1969 Apollo 11 landing, the guidance computer repeatedly raised 1202 and 1201 alarms as a radar configuration issue flooded it with extra work.",
      "Its priority-based executive shed low-priority tasks and kept the landing-critical ones running, and the landing succeeded.",
    ],
    lesson: "Design systems to degrade gracefully under overload by protecting the work that must not fail.",
  },
  {
    kind: "case_study",
    id: "netflix-chaos",
    title: "Netflix and Chaos Monkey",
    year: 2011,
    organization: "Netflix",
    topics: ["distributed systems", "cloud", "microservices", "resilience", "testing"],
    summary: [
      "After a 2008 database corruption halted DVD shipments for days, Netflix rebuilt its service as cloud microservices.",
      "It created Chaos Monkey, a tool that randomly terminates production instances, to force every service to tolerate failure as a matter of routine.",
    ],
    lesson: "Assume components will fail, and continuously test that assumption under production-like conditions.",
  },
  {
    kind: "case_study",
    id: "amazon-recruiting-ml",
    title: "Amazon's Biased Recruiting Model",
    year: 2018,
    organization: "Amazon",
    topics: ["machine learning", "ai", "bias", "data science", "ethics", "training data"],
    summary: [
      "Reuters reported in 2018 that Amazon scrapped an experimental machine-learning recruiting tool.",
      "Trained on a decade of past resumes, the model learned to downgrade resumes containing the word women's, reflecting historical bias in its training data.",
    ],
    lesson: "Models learn the biases of their training data; evaluate for fairness before trusting predictions.",
  },
  {
    kind: "case_study",
    id: "tay-2016",
    title: "Microsoft's Tay Chatbot",
    year: 2016,
    organization: "Microsoft",
    topics: ["ai", "chatbots", "machine learning", "moderation", "security", "input validation"],
    summary: [
      "Microsoft's Tay chatbot launched on Twitter in March 2016 and was taken offline within about a day.",
      "Coordinated users exploited its learn-from-conversation design to teach it to produce offensive content.",
    ],
    lesson: "Any system that learns from public input will be attacked through that input; design safeguards before launch.",
  },
];
