// Curated OFFICIAL professional-body / open-courseware resource links, used
// by the resolvers and renderers in ../resource-links.ts to build the
// "## Helpful Free Resources" section (P1-AC3) of generated course
// documents. Pure: no I/O, no fetch, no Date, no Math.random - same
// ROOT-ONLY reasoning as the sibling TOOL_TUTORIAL_MAP (./tool-tutorials.ts):
// every URL in the map below MUST be the organization's official root (its
// own top-level site, help center, or docs root) - never a deep article link
// with a numeric ID or version path. A real generated course (MGT 422, run
// 512bbdbf) shipped 73 unique URLs; 37 (51%) were dead on a curl check,
// including 11 of 12 fabricated PMI deep links - the defect this module
// exists to prevent from recurring.
//
// The model is never trusted to author a URL (see
// generateAssignmentInstructionsForAssignment's "the model writes NO URLs"
// instruction, shared.ts) - resolveFieldResources (../resource-links.ts)
// turns a subject/organization mention into a link by CODE, matched against
// FIELD_RESOURCE_MAP below. A name that matches nothing contributes NO link;
// nothing is ever guessed or constructed.

import type { ResourceLink } from "./tool-tutorials";

// CURATED, hand-maintained map from a professional body / open-courseware
// keyword to its OFFICIAL root (same ROOT-ONLY rule as TOOL_TUTORIAL_MAP,
// ./tool-tutorials.ts). "prince2" and "axelos" alias to the same entry
// (Axelos owns and administers PRINCE2 - a course can name either).
//
// courseKind below (the off-domain-resources fix's course-kind gating) is
// what keeps a "Helpful Free Resources" section honest for the field it is
// actually citing. A real generated applied (project management) course once
// cited FreeCodeCamp in week 1 and W3Schools in week 8 - programming-
// education sites are exactly the wrong citation for a field with no code in
// it, and signal a course that does not know what it is; the reverse is just
// as wrong, since a professional body like PMI or SHRM is not a reasonable
// citation for a course teaching loops and functions. This distinction used
// to be enforced by telling the MODEL what to cite (the deleted
// freeResourceSourceRule, formerly src/lib/course-kind.ts); now that code is
// the sole author of this section, the same distinction gates which curated
// entries the resolver in ../resource-links.ts is allowed to return (see
// resolveFieldResources' `kind` parameter) - so it lives here, next to the
// data it governs, instead of as a rule stated to a model that no longer
// writes this section at all.
//
// courseKind: "applied" entries below are every professional-body resource -
// they belong to an applied field, never a programming one, so they must
// never surface in a coding course's resolved resources. courseKind: "coding"
// entries (after them) mirror CURATED_DOCS_MAP (src/lib/live-class/links.ts)
// - the official language/framework documentation a programming course cites
// - restated here rather than imported, because CURATED_DOCS_MAP lives under
// live-class/ (a feature directory) and this module is a shared lib one; the
// two are named as each other's source of truth in the comment above the
// coding block below, and resource-links.data.test.ts's "coding-tagged
// entries stay in sync with CURATED_DOCS_MAP" describe block imports
// CURATED_DOCS_MAP directly and asserts every coding-tagged entry's url
// matches it (RCA16: this is what makes "cannot silently diverge unnoticed"
// true - previously nothing detected divergence and no test imported
// CURATED_DOCS_MAP at all). The four general/open-courseware entries at the
// very end are left untagged - they are a reasonable "Helpful Free
// Resources" entry for ANY course kind.
// U6 (regression): matching FIELD_RESOURCE_MAP by ORGANIZATION NAME alone
// left the two governing bodies of project management unresolved on exactly
// the assignments that most need them - a project-management assignment
// almost never contains the literal string "PMI" or "Association for
// Project Management" in its own text, so nothing matched and the section
// fell through to generic open-courseware padding instead (MIT OCW,
// OpenStax, Saylor) on a critical-path-scheduling assignment. These are
// subject-matter terms such an assignment reliably DOES contain; a match on
// any one of them resolves PMI and APM even when neither body is named (see
// resolveFieldResources' subjectKeywords check in ../resource-links.ts).
const PROJECT_MANAGEMENT_SUBJECT_KEYWORDS = ["project management", "risk", "procurement", "stakeholder"];

// AC3 of the "domain-shaped toolset" fix (course-tools-selection.ts's own
// header comment tells the full story): a real generated BIT 320 (Ethical
// Hacking) course's "Helpful Free Resources" section fell back to generic
// open-courseware padding (MIT OCW, OpenStax, Saylor) for the same reason
// PMI/APM used to - a security assignment's own text reliably uses this
// field's vocabulary ("vulnerability", "network reconnaissance", "incident
// response") far more often than it spells out an organization's literal
// name, so name-only matching left OWASP/NIST/CISA below unresolved on
// exactly the assignments that most need them. Same U6 fix, same reasoning,
// applied to a second field instead of only ever re-verified against PM.
const CYBERSECURITY_SUBJECT_KEYWORDS = [
  "cybersecurity",
  "ethical hacking",
  "penetration testing",
  "vulnerability",
  "network security",
  "malware",
  "cryptography",
  "incident response",
];

const PMI: ResourceLink = {
  label: "Project Management Institute (PMI)",
  url: "https://www.pmi.org/",
  kind: "field",
  courseKind: "applied",
  subjectKeywords: PROJECT_MANAGEMENT_SUBJECT_KEYWORDS,
  whyItHelps:
    "The professional body that defines project management standards, certifications, and the schedule/risk/scope terminology this field uses.",
};
const APM: ResourceLink = {
  label: "Association for Project Management (APM)",
  url: "https://www.apm.org.uk/",
  kind: "field",
  courseKind: "applied",
  subjectKeywords: PROJECT_MANAGEMENT_SUBJECT_KEYWORDS,
  whyItHelps:
    "A chartered professional body for project management, with practitioner guides on planning, scheduling, and stakeholder management.",
};
const IPMA: ResourceLink = {
  label: "International Project Management Association (IPMA)",
  url: "https://www.ipma.world/",
  kind: "field",
  courseKind: "applied",
  whyItHelps: "A global federation of project management associations with practitioner competence standards.",
};
const AXELOS: ResourceLink = {
  label: "Axelos (PRINCE2)",
  url: "https://www.axelos.com/",
  kind: "field",
  courseKind: "applied",
  whyItHelps: "The official home of PRINCE2, a widely used project management method with concrete process guidance.",
};
const SCRUM_ORG: ResourceLink = {
  label: "Scrum.org",
  url: "https://www.scrum.org/",
  kind: "field",
  courseKind: "applied",
  whyItHelps: "The official Scrum Guide and practitioner resources for teams running an agile, iterative process.",
};
const AGILE_ALLIANCE: ResourceLink = {
  label: "Agile Alliance",
  url: "https://www.agilealliance.org/",
  kind: "field",
  courseKind: "applied",
  whyItHelps: "A nonprofit with practitioner guides and a glossary covering agile methods and practices.",
};
const ISO: ResourceLink = {
  label: "International Organization for Standardization (ISO)",
  url: "https://www.iso.org/",
  kind: "field",
  courseKind: "applied",
  whyItHelps: "The body that publishes international standards, including the ISO 21500 project management standard.",
};
const GAO: ResourceLink = {
  label: "U.S. Government Accountability Office (GAO)",
  url: "https://www.gao.gov/",
  kind: "field",
  courseKind: "applied",
  whyItHelps: "The U.S. government's audit arm, with public reports illustrating real project and program failures.",
};
const NIST: ResourceLink = {
  label: "National Institute of Standards and Technology (NIST)",
  url: "https://www.nist.gov/",
  kind: "field",
  courseKind: "applied",
  // Before this fix NIST had NO subjectKeywords at all - only its literal
  // name ever resolved it, exactly the U6 defect PMI/APM already had fixed
  // for the project-management keywords above. NIST publishes the
  // Cybersecurity Framework and is exactly the standards body a security
  // course's own weekly topics ("Vulnerability Assessment", "Incident
  // Response and Recovery") reliably reference without ever spelling out
  // "NIST" by name, so the cybersecurity keywords apply here too (kept
  // scoped to cybersecurity only, not unioned with the PM keywords, so this
  // fix does not change NIST's behavior for a project-management course -
  // see the AC2 regression check in course-planning-grounding.test.ts).
  subjectKeywords: CYBERSECURITY_SUBJECT_KEYWORDS,
  whyItHelps:
    "A federal standards body whose frameworks (including the NIST Cybersecurity Framework) shape risk management, technical project practice, and cybersecurity practice.",
};
const OWASP: ResourceLink = {
  label: "OWASP (Open Worldwide Application Security Project)",
  url: "https://owasp.org/",
  kind: "field",
  courseKind: "applied",
  subjectKeywords: CYBERSECURITY_SUBJECT_KEYWORDS,
  whyItHelps:
    "A nonprofit foundation whose Top Ten and testing guides are the standard practitioner reference for application and web security.",
};
const CISA: ResourceLink = {
  label: "Cybersecurity and Infrastructure Security Agency (CISA)",
  url: "https://www.cisa.gov/",
  kind: "field",
  courseKind: "applied",
  subjectKeywords: CYBERSECURITY_SUBJECT_KEYWORDS,
  whyItHelps:
    "The U.S. federal agency publishing the cybersecurity advisories, frameworks, and incident-response guidance security practitioners actually use.",
};
const SBA: ResourceLink = {
  label: "U.S. Small Business Administration (SBA)",
  url: "https://www.sba.gov/",
  kind: "field",
  courseKind: "applied",
  whyItHelps: "The U.S. Small Business Administration's guides on planning, budgeting, and running a business project.",
};
const AMA: ResourceLink = {
  label: "American Management Association (AMA)",
  url: "https://www.amanet.org/",
  kind: "field",
  courseKind: "applied",
  whyItHelps: "A professional association offering practitioner training and articles on management practice.",
};
const AICPA: ResourceLink = {
  label: "American Institute of CPAs (AICPA)",
  url: "https://www.aicpa.org/",
  kind: "field",
  courseKind: "applied",
  whyItHelps: "The professional body for CPAs, with standards and guidance for accounting and audit practice.",
};
const SHRM: ResourceLink = {
  label: "Society for Human Resource Management (SHRM)",
  url: "https://www.shrm.org/",
  kind: "field",
  courseKind: "applied",
  whyItHelps: "The professional body for HR practitioners, with guidance on people-management practice.",
};
const MIT_OCW: ResourceLink = {
  label: "MIT OpenCourseWare",
  url: "https://ocw.mit.edu/",
  kind: "field",
  whyItHelps: "Free MIT course materials covering a broad range of subjects at a rigorous, university level.",
};
const OPENSTAX: ResourceLink = {
  label: "OpenStax",
  url: "https://openstax.org/",
  kind: "field",
  whyItHelps: "Free, peer-reviewed college textbooks covering a broad range of subjects.",
};
const HARVARD_ONLINE: ResourceLink = {
  label: "Harvard Professional and Lifelong Learning",
  url: "https://pll.harvard.edu/",
  kind: "field",
  whyItHelps: "Harvard's professional and continuing-education courses, including short practitioner-oriented options.",
};
const SAYLOR: ResourceLink = {
  label: "Saylor Academy",
  url: "https://www.saylor.org/",
  kind: "field",
  whyItHelps: "Free, self-paced college-level courses covering a broad range of subjects.",
};

// RCA regression (RCA round 2 / entry 156): before this block, EVERY entry
// above was courseKind: "applied" and NONE was courseKind: "coding" - so
// resolveFieldResources(blob, max, "coding") could only ever fall through to
// the four untagged general entries above (MIT OpenCourseWare, OpenStax,
// Harvard Online, Saylor). A coding course's assignment sheet used to cite MDN, the Python
// docs, freeCodeCamp, and Microsoft Learn (see the deleted
// freeResourceSourceRule's coding branch); after the applied half gained its
// own curated citations, the coding half silently lost its - a regression in
// the exact quality dimension this feature exists to raise.
//
// SOURCE OF TRUTH: these URLs are restated from CURATED_DOCS_MAP
// (src/lib/live-class/links.ts), NOT imported - resource-links.ts is a
// shared lib module and live-class/ is a feature directory, so importing
// from it here would invert the natural dependency direction. Keep these two
// lists in sync by hand; a change to one without the other is exactly the
// kind of silent divergence this comment exists to flag. freeCodeCamp and
// Microsoft Learn are the two sources freeResourceSourceRule named that
// CURATED_DOCS_MAP does not carry, added directly below.
const PYTHON_DOCS: ResourceLink = {
  label: "Python documentation",
  url: "https://docs.python.org/3/",
  kind: "field",
  courseKind: "coding",
  whyItHelps: "The official Python language reference and tutorial.",
};
const MDN_JAVASCRIPT: ResourceLink = {
  label: "JavaScript documentation (MDN)",
  url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
  kind: "field",
  courseKind: "coding",
  whyItHelps: "Mozilla's official JavaScript language reference and guides.",
};
const MDN_WEB_API: ResourceLink = {
  label: "Web APIs documentation (MDN)",
  url: "https://developer.mozilla.org/en-US/docs/Web/API",
  kind: "field",
  courseKind: "coding",
  whyItHelps: "Mozilla's official reference for the browser Web APIs used in front-end code.",
};
const TYPESCRIPT_DOCS: ResourceLink = {
  label: "TypeScript documentation",
  url: "https://www.typescriptlang.org/docs/",
  kind: "field",
  courseKind: "coding",
  whyItHelps: "The official TypeScript handbook and language reference.",
};
const REACT_DOCS: ResourceLink = {
  label: "React documentation",
  url: "https://react.dev/",
  kind: "field",
  courseKind: "coding",
  whyItHelps: "The official React documentation and guides.",
};
const MDN_HTML: ResourceLink = {
  label: "HTML documentation (MDN)",
  url: "https://developer.mozilla.org/en-US/docs/Web/HTML",
  kind: "field",
  courseKind: "coding",
  whyItHelps: "Mozilla's official HTML reference and guides.",
};
const MDN_CSS: ResourceLink = {
  label: "CSS documentation (MDN)",
  url: "https://developer.mozilla.org/en-US/docs/Web/CSS",
  kind: "field",
  courseKind: "coding",
  whyItHelps: "Mozilla's official CSS reference and guides.",
};
const GIT_DOCS: ResourceLink = {
  label: "Git documentation",
  url: "https://git-scm.com/doc",
  kind: "field",
  courseKind: "coding",
  whyItHelps: "The official Git reference manual and tutorials.",
};
const GITHUB_DOCS: ResourceLink = {
  label: "GitHub documentation",
  url: "https://docs.github.com/",
  kind: "field",
  courseKind: "coding",
  whyItHelps: "GitHub's official documentation for repositories, pull requests, and Actions.",
};
const MYSQL_DOCS: ResourceLink = {
  label: "MySQL documentation",
  url: "https://dev.mysql.com/doc/",
  kind: "field",
  courseKind: "coding",
  whyItHelps: "The official MySQL reference manual.",
};
const POSTGRESQL_DOCS: ResourceLink = {
  label: "PostgreSQL documentation",
  url: "https://www.postgresql.org/docs/",
  kind: "field",
  courseKind: "coding",
  whyItHelps: "The official PostgreSQL documentation.",
};
const SQLITE_DOCS: ResourceLink = {
  label: "SQLite documentation",
  url: "https://www.sqlite.org/docs.html",
  kind: "field",
  courseKind: "coding",
  whyItHelps: "The official SQLite documentation.",
};
const SQL_SERVER_DOCS: ResourceLink = {
  label: "SQL Server documentation",
  url: "https://learn.microsoft.com/en-us/sql/sql-server/",
  kind: "field",
  courseKind: "coding",
  whyItHelps: "Microsoft's official SQL Server documentation.",
};
const FREECODECAMP: ResourceLink = {
  label: "freeCodeCamp",
  url: "https://www.freecodecamp.org/",
  kind: "field",
  courseKind: "coding",
  whyItHelps: "Free, project-based coding curriculum and tutorials.",
};
const MICROSOFT_LEARN: ResourceLink = {
  label: "Microsoft Learn",
  url: "https://learn.microsoft.com/",
  kind: "field",
  courseKind: "coding",
  whyItHelps: "Microsoft's official, free technical training modules and documentation.",
};

export const FIELD_RESOURCE_MAP: Record<string, ResourceLink> = {
  pmi: PMI,
  apm: APM,
  ipma: IPMA,
  prince2: AXELOS,
  axelos: AXELOS,
  "scrum.org": SCRUM_ORG,
  "agile alliance": AGILE_ALLIANCE,
  iso: ISO,
  gao: GAO,
  nist: NIST,
  sba: SBA,
  ama: AMA,
  aicpa: AICPA,
  shrm: SHRM,
  owasp: OWASP,
  cisa: CISA,
  "mit opencourseware": MIT_OCW,
  openstax: OPENSTAX,
  "harvard online": HARVARD_ONLINE,
  saylor: SAYLOR,
  python: PYTHON_DOCS,
  javascript: MDN_JAVASCRIPT,
  js: MDN_JAVASCRIPT,
  "web api": MDN_WEB_API,
  "web apis": MDN_WEB_API,
  typescript: TYPESCRIPT_DOCS,
  ts: TYPESCRIPT_DOCS,
  react: REACT_DOCS,
  html: MDN_HTML,
  css: MDN_CSS,
  git: GIT_DOCS,
  github: GITHUB_DOCS,
  mysql: MYSQL_DOCS,
  postgresql: POSTGRESQL_DOCS,
  postgres: POSTGRESQL_DOCS,
  sqlite: SQLITE_DOCS,
  "sql server": SQL_SERVER_DOCS,
  mssql: SQL_SERVER_DOCS,
  freecodecamp: FREECODECAMP,
  "microsoft learn": MICROSOFT_LEARN,
};
