// Curated resource links for generated course documents (assignment
// instructions, class openers, module-objectives docs). Pure: no I/O, no
// fetch, no Date, no Math.random - deep-link rot is solved by ROOT-ONLY
// curation, not by a network check at generation time (a fetch per link
// would add latency, flakiness, and a failure mode inside an unattended
// run).
//
// THE RULE THAT MATTERS MOST, copied verbatim from CURATED_DOCS_MAP's own
// header comment (src/lib/live-class/links.ts) because it is the exact rule
// whose absence produced the defect this module exists to fix: every URL in
// both maps below MUST be the tool's official help center, academy, or
// guides ROOT (the site's own top-level help/academy/guides landing page) -
// never the marketing homepage, and never a deep article link with a
// numeric ID or version path. "a deep link rots" (gets reorganized, moved,
// 404s) in a way a root essentially never does, and a bare marketing
// homepage teaches a student nothing about how to use the tool - a link
// must satisfy BOTH halves of the rule, not just the anti-rot half. A real
// generated course (MGT 422, run 512bbdbf) shipped 73 unique URLs; 37 (51%)
// were dead on a curl check, including 11 of 12 fabricated PMI deep links.
// No numeric article IDs, no version paths, no deep articles, and no bare
// marketing domain when the tool has a help/academy/guides root.
//
// The model is never trusted to author a URL (see
// generateAssignmentInstructionsForAssignment's "the model writes NO URLs"
// instruction, shared.ts) - it names a tool or resource in plain text, and
// every function below turns that name into a link by CODE, matched against
// the maps here. A name that matches nothing contributes NO link; nothing is
// ever guessed or constructed.

import { sanitizeResourceUrl } from "@/lib/urls";
import type { CourseKind } from "@/lib/course-kind";

/** One resolved resource link. `kind` distinguishes a practitioner TOOL's
 * own tutorial/help page from a professional-body or open-courseware FIELD
 * resource, so a renderer can group or label them differently.
 *
 * `courseKind`, when set on a FIELD_RESOURCE_MAP entry, restricts it to that
 * one course kind (see resolveFieldResources's `kind` parameter below) -
 * left unset for a general/open-courseware resource that is a reasonable
 * "Helpful Free Resources" entry for ANY course kind. Never set on a
 * TOOL_TUTORIAL_MAP entry - a practitioner tool is named because the course
 * committed to it, independent of course kind. */
export interface ResourceLink {
  label: string;
  url: string;
  kind: "tool" | "field";
  courseKind?: CourseKind;
  /** Subject-matter keywords that resolve this entry even when the
   * organization's own name (the map key or one of its aliases) is never
   * mentioned in the text - e.g. a project-management assignment rarely
   * contains the literal string "PMI", but reliably contains "project
   * management", "risk", "procurement", or "stakeholder". Checked by
   * `resolveFieldResources` in addition to, not instead of, the map-key
   * match. Field-resource entries only (never set on a TOOL_TUTORIAL_MAP
   * entry - a practitioner tool is named because the course committed to it,
   * never inferred from subject matter). */
  subjectKeywords?: string[];
  /** A one-sentence, human-authored explanation of why this resource helps
   * with the kind of work it is cited on. Restores the "title, URL, and one
   * short sentence on why it helps" shape the prompt-era "Helpful Free
   * Resources" section used, before code took over authoring that section
   * and the per-resource sentence was lost. Field-resource entries only. */
  whyItHelps?: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Find which key of `map` matches `candidate`, whole-word (so "css" never
 * matches inside "access") - the exact idiom CURATED_DOCS_MAP's own
 * matchDocsKeyword uses (src/lib/live-class/links.ts), copied here for tool
 * and field-resource names. Returns the literal key (not the ResourceLink) so
 * a caller can look up an alias-independent identity for `candidate` - e.g.
 * renderToolsYouWillUseSection's U3 intersection needs to know WHICH
 * TOOL_TUTORIAL_MAP key a committed tool name resolves to, so it can check
 * whether that same key (or an alias sharing its link) is separately
 * mentioned in a document's own body text. Returns null when nothing
 * matches. */
function findMatchingKey(candidate: string, map: Record<string, ResourceLink>): string | null {
  const normalized = (candidate ?? "").toLowerCase().trim();
  if (!normalized) return null;
  for (const key of Object.keys(map)) {
    const pattern = new RegExp(`\\b${escapeRegExp(key)}\\b`, "i");
    if (pattern.test(normalized)) return key;
  }
  return null;
}

/** Match `candidate` against `map`'s keys - see findMatchingKey above for the
 * exact matching rule. Returns the mapped ResourceLink verbatim (never a
 * constructed or guessed URL) or null when nothing matches. */
function matchKeyword(candidate: string, map: Record<string, ResourceLink>): ResourceLink | null {
  const key = findMatchingKey(candidate, map);
  return key ? map[key] : null;
}

// CURATED, hand-maintained map from a lowercased tool name to that tool's
// OFFICIAL tutorial/help/academy ROOT (see the module header rule). Aliases
// point at the SAME ResourceLink object (e.g. "ms project"/"microsoft
// project", "sheets"/"google sheets") exactly like CURATED_DOCS_MAP's
// "js"/"javascript" pairing, so a name can be phrased either way.
const MIRO: ResourceLink = { label: "Miro help center", url: "https://help.miro.com/", kind: "tool" };
const ASANA: ResourceLink = { label: "Asana Academy", url: "https://academy.asana.com/", kind: "tool" };
const TRELLO: ResourceLink = { label: "Trello guide", url: "https://trello.com/guide", kind: "tool" };
const JIRA: ResourceLink = {
  label: "Jira guides",
  url: "https://www.atlassian.com/software/jira/guides",
  kind: "tool",
};
const CONFLUENCE: ResourceLink = {
  label: "Confluence guides",
  url: "https://www.atlassian.com/software/confluence/guides",
  kind: "tool",
};
const SMARTSHEET: ResourceLink = {
  label: "Smartsheet help center",
  url: "https://help.smartsheet.com/",
  kind: "tool",
};
const MONDAY: ResourceLink = { label: "monday.com support", url: "https://support.monday.com/", kind: "tool" };
const NOTION: ResourceLink = { label: "Notion help center", url: "https://www.notion.com/help", kind: "tool" };
const CLICKUP: ResourceLink = { label: "ClickUp help center", url: "https://help.clickup.com/", kind: "tool" };
const WRIKE: ResourceLink = { label: "Wrike help center", url: "https://help.wrike.com/", kind: "tool" };
const BASECAMP: ResourceLink = { label: "Basecamp support", url: "https://basecamp.com/support", kind: "tool" };
const AIRTABLE: ResourceLink = { label: "Airtable support", url: "https://support.airtable.com/", kind: "tool" };
const GOOGLE_SHEETS: ResourceLink = {
  label: "Google Sheets help center",
  url: "https://support.google.com/docs/",
  kind: "tool",
};
const GOOGLE_DOCS: ResourceLink = {
  label: "Google Docs help center",
  url: "https://support.google.com/docs/",
  kind: "tool",
};
const GOOGLE_SLIDES: ResourceLink = {
  label: "Google Slides help center",
  url: "https://support.google.com/docs/",
  kind: "tool",
};
const GOOGLE_DRIVE: ResourceLink = {
  label: "Google Drive help center",
  url: "https://support.google.com/drive/",
  kind: "tool",
};
const EXCEL: ResourceLink = {
  label: "Excel help and learning",
  url: "https://support.microsoft.com/excel",
  kind: "tool",
};
const WORD: ResourceLink = {
  label: "Word help and learning",
  url: "https://support.microsoft.com/word",
  kind: "tool",
};
const POWERPOINT: ResourceLink = {
  label: "PowerPoint help and learning",
  url: "https://support.microsoft.com/powerpoint",
  kind: "tool",
};
const MICROSOFT_PROJECT: ResourceLink = {
  label: "Project help and learning",
  url: "https://support.microsoft.com/project",
  kind: "tool",
};
const MICROSOFT_PLANNER: ResourceLink = {
  label: "Planner help and learning",
  url: "https://support.microsoft.com/planner",
  kind: "tool",
};
const LUCIDCHART: ResourceLink = { label: "Lucid help center", url: "https://help.lucid.co/", kind: "tool" };
const FIGMA: ResourceLink = { label: "Figma help center", url: "https://help.figma.com/", kind: "tool" };
const CANVA: ResourceLink = { label: "Canva help center", url: "https://www.canva.com/help/", kind: "tool" };
const TABLEAU: ResourceLink = { label: "Tableau help", url: "https://help.tableau.com/", kind: "tool" };
const POWER_BI: ResourceLink = {
  label: "Power BI documentation",
  url: "https://learn.microsoft.com/power-bi/",
  kind: "tool",
};
const SLACK: ResourceLink = { label: "Slack help center", url: "https://slack.com/help", kind: "tool" };
const ZOOM: ResourceLink = { label: "Zoom support", url: "https://support.zoom.us/", kind: "tool" };

export const TOOL_TUTORIAL_MAP: Record<string, ResourceLink> = {
  miro: MIRO,
  asana: ASANA,
  trello: TRELLO,
  jira: JIRA,
  confluence: CONFLUENCE,
  smartsheet: SMARTSHEET,
  monday: MONDAY,
  notion: NOTION,
  clickup: CLICKUP,
  wrike: WRIKE,
  basecamp: BASECAMP,
  airtable: AIRTABLE,
  "google sheets": GOOGLE_SHEETS,
  sheets: GOOGLE_SHEETS,
  "google docs": GOOGLE_DOCS,
  "google slides": GOOGLE_SLIDES,
  "google drive": GOOGLE_DRIVE,
  excel: EXCEL,
  word: WORD,
  powerpoint: POWERPOINT,
  "microsoft project": MICROSOFT_PROJECT,
  "ms project": MICROSOFT_PROJECT,
  "microsoft planner": MICROSOFT_PLANNER,
  lucidchart: LUCIDCHART,
  figma: FIGMA,
  canva: CANVA,
  tableau: TABLEAU,
  "power bi": POWER_BI,
  slack: SLACK,
  zoom: ZOOM,
};

// CURATED, hand-maintained map from a professional body / open-courseware
// keyword to its OFFICIAL root (same ROOT-ONLY rule as TOOL_TUTORIAL_MAP
// above). "prince2" and "axelos" alias to the same entry (Axelos owns and
// administers PRINCE2 - a course can name either).
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
// entries the resolver below is allowed to return (see resolveFieldResources'
// `kind` parameter) - so it lives here, next to the data it governs, instead
// of as a rule stated to a model that no longer writes this section at all.
//
// courseKind: "applied" entries below are every professional-body resource -
// they belong to an applied field, never a programming one, so they must
// never surface in a coding course's resolved resources. courseKind: "coding"
// entries (after them) mirror CURATED_DOCS_MAP (src/lib/live-class/links.ts)
// - the official language/framework documentation a programming course cites
// - restated here rather than imported, because CURATED_DOCS_MAP lives under
// live-class/ (a feature directory) and this module is a shared lib one; the
// two are named as each other's source of truth in the comment above the
// coding block below, and resource-links.test.ts's "coding-tagged entries
// stay in sync with CURATED_DOCS_MAP" describe block imports CURATED_DOCS_MAP
// directly and asserts every coding-tagged entry's url matches it (RCA16:
// this is what makes "cannot silently diverge unnoticed" true - previously
// nothing detected divergence and no test imported CURATED_DOCS_MAP at all).
// The four general/open-courseware entries at the very end are left
// untagged - they are a reasonable "Helpful Free Resources" entry for ANY
// course kind.
// U6 (regression): matching FIELD_RESOURCE_MAP by ORGANIZATION NAME alone
// left the two governing bodies of project management unresolved on exactly
// the assignments that most need them - a project-management assignment
// almost never contains the literal string "PMI" or "Association for
// Project Management" in its own text, so nothing matched and the section
// fell through to generic open-courseware padding instead (MIT OCW,
// OpenStax, Saylor) on a critical-path-scheduling assignment. These are
// subject-matter terms such an assignment reliably DOES contain; a match on
// any one of them resolves PMI and APM even when neither body is named (see
// resolveFieldResources' subjectKeywords check below).
const PROJECT_MANAGEMENT_SUBJECT_KEYWORDS = ["project management", "risk", "procurement", "stakeholder"];

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
  whyItHelps: "A federal standards body whose frameworks shape risk management and technical project practice.",
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

/**
 * Resolve official tool-tutorial links for a set of tool names (e.g. the
 * course's committed toolset, or names pulled out of generated body text).
 * Whole-word, case-insensitive match against TOOL_TUTORIAL_MAP - reuses the
 * matchDocsKeyword idiom (matchKeyword above). A name that matches nothing
 * contributes NO link; never constructs or guesses a URL. Deduped by url,
 * order stable (input order).
 */
export function resolveToolTutorials(toolNames: string[]): ResourceLink[] {
  const results: ResourceLink[] = [];
  const seenUrls = new Set<string>();
  for (const name of Array.isArray(toolNames) ? toolNames : []) {
    const link = matchKeyword(name, TOOL_TUTORIAL_MAP);
    if (!link || seenUrls.has(link.url)) continue;
    seenUrls.add(link.url);
    results.push(link);
  }
  return results;
}

/**
 * Resolve professional-body / open-courseware resources mentioned anywhere
 * in a blob of course/assignment text (course description + assignment
 * title + body, typically). Capped at `max` (default 4). Never constructs or
 * guesses a URL - only ever returns a literal value from the map.
 *
 * An entry matches on EITHER of two independent signals - the map's own key
 * (the organization's name/alias, whole-word, exactly as before) OR any of
 * the entry's own `subjectKeywords` (U6 fix): matching by name alone left a
 * field's governing body unresolved on assignments that never spell out the
 * body's name but reliably use its subject-matter vocabulary (a project-
 * management assignment saying "risk" or "stakeholder" but never "PMI").
 * Both checks run against the same whole-word, case-insensitive test.
 *
 * `kind`, when given, excludes any matched entry whose own `courseKind` is
 * set and disagrees with it - a coding course's resolved resources can never
 * include an applied-field professional body (PMI, SHRM, etc.), and vice
 * versa. Omitted (the default) applies NO filtering, so every pre-existing
 * caller (the embedded/deterministic scaffold, src/lib/embedded/docs.ts)
 * that has no course kind to give is completely unaffected.
 */
export function resolveFieldResources(text: string, max = 4, kind?: CourseKind): ResourceLink[] {
  const normalized = typeof text === "string" ? text : "";
  const results: ResourceLink[] = [];
  const seenUrls = new Set<string>();
  const cap = Number.isFinite(max) && max >= 0 ? Math.floor(max) : 4;
  if (!normalized.trim() || cap === 0) return results;

  const wholeWordMatch = (term: string) => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(normalized);

  for (const [key, link] of Object.entries(FIELD_RESOURCE_MAP)) {
    if (seenUrls.has(link.url)) continue;
    if (kind && link.courseKind && link.courseKind !== kind) continue;
    const nameMatches = wholeWordMatch(key);
    const subjectMatches = (link.subjectKeywords ?? []).some(wholeWordMatch);
    if (nameMatches || subjectMatches) {
      seenUrls.add(link.url);
      results.push(link);
      if (results.length >= cap) break;
    }
  }
  return results;
}

// RCA regression (docs/REGRESSION.md entries 137/141/142 - tool-churn
// prevention): a handful of TOOL_TUTORIAL_MAP keys are also ordinary English
// words - "word", "monday", "sheets", "excel", "slack", "zoom", "notion" -
// so a bare whole-word scan of generated prose matches them constantly and
// for the wrong reason. Reproduced verbatim against a Trello-committed
// course: "Write a 500-word summary" rendered Microsoft Word, "due Monday"
// rendered monday.com, "the sheets you produced" rendered Google Sheets, and
// "excel at communicating" rendered Microsoft Excel - none of which the
// course ever chose, which is exactly the churn entries 137/141/142 exist to
// stop. A map key that doubles as an ordinary English word cannot be matched
// bare in prose: it may ONLY be matched via a qualified form that actually
// names the product ("microsoft word", "monday.com", "google sheets",
// "microsoft excel", "slack channel"/"slack workspace", "zoom meeting"/
// "zoom call", "notion workspace"/"notion app") - every other
// TOOL_TUTORIAL_MAP key keeps matching bare, unchanged.
const AMBIGUOUS_TOOL_QUALIFIERS: Record<string, RegExp> = {
  word: /\bmicrosoft word\b/i,
  monday: /\bmonday\.com\b/i,
  sheets: /\bgoogle sheets\b/i,
  excel: /\bmicrosoft excel\b/i,
  slack: /\b(?:slack channel|slack workspace)\b/i,
  zoom: /\b(?:zoom meeting|zoom call)\b/i,
  notion: /\b(?:notion workspace|notion app)\b/i,
};

/** The pattern that counts as "this TOOL_TUTORIAL_MAP key is mentioned" -
 * the qualified-form regex for an ambiguous key (see AMBIGUOUS_TOOL_QUALIFIERS
 * above), or a plain whole-word match on the key itself. Shared by
 * toolKeysMentionedIn (below) and renderToolsYouWillUseSection's U3
 * intersection, so a committed tool is checked against a document's body text
 * by the EXACT same rule that decides whether a body-text-only mention
 * counts - an ambiguous key can never be "mentioned" via its bare word in
 * either path. */
function toolMentionPattern(key: string): RegExp {
  return AMBIGUOUS_TOOL_QUALIFIERS[key] ?? new RegExp(`\\b${escapeRegExp(key)}\\b`, "i");
}

/**
 * Which TOOL_TUTORIAL_MAP keys are named anywhere in a blob of free text
 * (typically a document's own generated body) - used both as the U3
 * intersection signal (see renderToolsYouWillUseSection below) and as the
 * fallback when there is no committed toolset to defer to at all: an applied
 * course whose `ensureCourseTools` found nothing, or a coding course, has no
 * other signal for which tool a document is telling students to use. Returns
 * the matched KEYS (not ResourceLinks, and not deduped against each other) in
 * TOOL_TUTORIAL_MAP's own iteration order; renderToolsYouWillUseSection below
 * is what turns keys into deduped, rendered links. An AMBIGUOUS_TOOL_QUALIFIERS
 * key only counts as mentioned when its qualified form appears - never the
 * bare word (see above).
 */
export function toolKeysMentionedIn(text: string): string[] {
  const normalized = typeof text === "string" ? text : "";
  if (!normalized.trim()) return [];
  const found: string[] = [];
  for (const key of Object.keys(TOOL_TUTORIAL_MAP)) {
    if (toolMentionPattern(key).test(normalized)) found.push(key);
  }
  return found;
}

/**
 * Every line (or sentence within a multi-sentence line) in `bodyText` that
 * mentions the tool identified by `pattern`, cleaned of a leading list marker
 * and trailing punctuation, capped at 220 chars - the candidate pool
 * extractToolContextSentence (below) chooses from. Deterministic and
 * code-owned: each candidate is always a literal excerpt of the artifact's
 * OWN generated text, never invented or paraphrased.
 */
function collectToolContextCandidates(pattern: RegExp, bodyText: string): string[] {
  const candidates: string[] = [];
  if (!bodyText) return candidates;
  for (const rawLine of bodyText.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line || !pattern.test(line)) continue;
    const cleaned = line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").replace(/^#+\s+/, "");
    const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
    const target = sentences.find((s) => pattern.test(s)) ?? cleaned;
    const trimmed = target.trim().replace(/[.!?]+$/, "");
    if (trimmed) candidates.push(trimmed.length > 220 ? `${trimmed.slice(0, 217)}...` : trimmed);
  }
  return candidates;
}

/**
 * The best candidate sentence in `bodyText` describing THIS tool (`key`,
 * matched via `pattern`) alone - used to build the per-tool "specific
 * sentence" U3-AC2 requires (renderToolsYouWillUseSection below). Returns
 * null when no candidate names this tool alone (the caller falls back to a
 * generic usage sentence).
 *
 * Bug fix (captured against a Week 5 artifact naming Asana, Miro, and Google
 * Sheets in one combined sentence: "Map the approval chain in Miro, track
 * tasks in Asana, and calculate in Google Sheets."): the previous version
 * returned the first matching sentence unconditionally, so all three tools'
 * bullets quoted the exact same multi-tool sentence. That is the U3-AC2
 * boilerplate defect in a new form (identical text under every bullet), and
 * it is WORSE than boilerplate because it misattributes - the Asana bullet
 * led with "Map the approval chain in Miro", describing a different tool.
 * A generic-but-true sentence beats a specific-but-wrong one, so a candidate
 * naming another tool is never returned: among all candidates mentioning
 * `key`, this prefers one that names no OTHER TOOL_TUTORIAL_MAP tool (an
 * alias sharing this tool's own URL - e.g. "sheets"/"google sheets" - does
 * not count as "other"); if every candidate names another tool too, this
 * returns null rather than shipping a misattributed line, and the caller
 * falls back to the generic sentence instead.
 */
function extractToolContextSentence(key: string, pattern: RegExp, bodyText: string): string | null {
  const candidates = collectToolContextCandidates(pattern, bodyText);
  if (candidates.length === 0) return null;

  const thisUrl = TOOL_TUTORIAL_MAP[key]?.url;
  const namesOnlyThisTool = (sentence: string): boolean =>
    !toolKeysMentionedIn(sentence).some((otherKey) => TOOL_TUTORIAL_MAP[otherKey].url !== thisUrl);

  return candidates.find(namesOnlyThisTool) ?? null;
}

// A tool-name key from TOOL_TUTORIAL_MAP is lowercase (a match key, not a
// display string) - title-cased here only for the rendered bullet's label
// when the key itself is the only display name available (a committed-
// toolset name, e.g. "Trello (free plan)", already carries its own casing
// and is used as-is instead).
function titleCaseToolKey(key: string): string {
  return key
    .split(" ")
    .map((word) => {
      const upper = word.toUpperCase();
      if (upper === "BI" || upper === "MS") return upper;
      return word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    })
    .join(" ");
}

/**
 * Render the "## Tools You Will Use" markdown block shared by every
 * generated document that can name a tool (assignment instructions, module
 * objectives, class openers - P1-AC3/AC4): one bullet per tool this artifact
 * actually directs the student to use, each rendered "- <Tool>: <label> -
 * <url>. <specific sentence>". Deterministic: the per-tool sentence is drawn
 * from the artifact's own text or a fixed fallback, never a further LLM call
 * - code owns not just the link but what surrounds it, so this block can
 * never fail or drift independently of the link it renders. Returns ""
 * (omit the whole section) when nothing resolves - a document naming no tool
 * gets no section, never an empty heading.
 *
 * RCA regression (docs/REGRESSION.md entries 137/141/142 - tool-churn
 * prevention): this used to UNION the committed toolset with any
 * TOOL_TUTORIAL_MAP key mentioned in `bodyText`, on the theory that "if the
 * document tells a student to use a tool, that tool gets a link, no
 * exceptions". That reintroduced exactly the drift 137/141/142 exist to stop
 * - a Trello-committed course's generated prose saying "due Monday" or "a
 * 500-word summary" rendered monday.com / Microsoft Word links for tools the
 * course never chose.
 *
 * U3 regression (the fix immediately before this one over-corrected): once
 * the union bug above was fixed, this rendered the WHOLE committed toolset
 * regardless of what the artifact's own text actually used - a Week 5
 * assignment that only used Asana and Google Sheets still got a Miro bullet,
 * with the identical boilerplate sentence repeated for all three. THE RIGHT
 * SET IS THE INTERSECTION: when a committed toolset exists, a tool renders
 * only when it is BOTH committed AND named somewhere in `bodyText` (checked
 * via toolKeysMentionedIn's exact ambiguous-qualified-form rule, so "a
 * 500-word summary" still never counts as naming Word). A committed tool
 * this artifact never mentions is omitted entirely - which also means an
 * artifact that names no tool at all (a deliberately paper/low-tech warm-up)
 * gets NO tools block, rather than one that contradicts its own text (U4).
 * With no committed toolset at all (an applied course whose
 * `ensureCourseTools` found nothing, or a coding course), the body-text scan
 * is the only signal available, unchanged from before.
 *
 * U3-AC2: each bullet's sentence is a literal excerpt of the artifact's own
 * text naming that tool alone (extractToolContextSentence above), not one
 * boilerplate line repeated per tool, and never a different tool's sentence
 * misattributed to this one - a combined sentence naming several tools at
 * once (e.g. "Map the approval chain in Miro, track tasks in Asana, and
 * calculate in Google Sheets.") falls back to the generic `usageContext`
 * sentence for every tool it names, rather than quoting that one combined
 * line under all of them.
 */
export function renderToolsYouWillUseSection(
  committedToolNames: string[],
  bodyText: string,
  usageContext = "this assignment's hands-on work"
): string {
  const committed = (Array.isArray(committedToolNames) ? committedToolNames : [])
    .map((name) => (typeof name === "string" ? name.trim() : ""))
    .filter(Boolean);
  const mentionedKeys = toolKeysMentionedIn(bodyText);
  const mentionedUrls = new Set(mentionedKeys.map((key) => TOOL_TUTORIAL_MAP[key].url));

  // With a committed toolset: only the tools ALSO mentioned in this
  // artifact's own text (the intersection - U3-AC1). With none: the only
  // signal is what's mentioned, title-cased from its map key (unchanged
  // fallback behavior).
  const candidates =
    committed.length > 0
      ? committed.filter((name) => {
          const key = findMatchingKey(name, TOOL_TUTORIAL_MAP);
          return key !== null && mentionedUrls.has(TOOL_TUTORIAL_MAP[key].url);
        })
      : mentionedKeys.map(titleCaseToolKey);

  const seenUrls = new Set<string>();
  const bullets: string[] = [];
  for (const candidate of candidates) {
    const key = findMatchingKey(candidate, TOOL_TUTORIAL_MAP);
    if (!key) continue;
    const link = TOOL_TUTORIAL_MAP[key];
    if (seenUrls.has(link.url)) continue;
    seenUrls.add(link.url);
    const contextSentence = extractToolContextSentence(key, toolMentionPattern(key), bodyText);
    const sentence = contextSentence ? `${contextSentence}.` : `Use it for ${usageContext}.`;
    bullets.push(`- ${candidate}: ${link.label} - ${link.url}. ${sentence}`);
  }

  if (bullets.length === 0) return "";
  return `## Tools You Will Use\n${bullets.join("\n")}`;
}

// A generic, always-applicable fallback pool for renderHelpfulFreeResources-
// Section below - open-courseware roots broad enough to be a reasonable
// "Helpful Free Resources" entry for ANY course kind or field, used only to
// pad up to the minimum when the field-keyword match finds too few (or
// none) - never invented, always a literal FIELD_RESOURCE_MAP value.
const GENERAL_FIELD_FALLBACK_KEYS = ["mit opencourseware", "openstax", "saylor"];

/**
 * Render the "## Helpful Free Resources" markdown block CODE appends to
 * generated assignment instructions (P1-AC3): resolveFieldResources over
 * `text` (course description + assignment title + body, the caller's
 * concatenation), padded with GENERAL_FIELD_FALLBACK_KEYS - in order, skipping
 * anything already present - until at least `min` (default 3) entries are
 * reached. Every entry rendered "- <label> - <url>. <why it helps>" (U6
 * fix: the per-resource sentence explaining relevance, present in the
 * prompt-era version of this section and lost when code took over authoring
 * it - see `whyItHelps` on ResourceLink). An entry with no `whyItHelps` set
 * renders the bare "- <label> - <url>" it always has. Never returns fewer
 * than `min` entries (the fallback pool alone covers that), and never
 * constructs or guesses a URL.
 *
 * `kind`, when given, is threaded into resolveFieldResources so a matched
 * entry outside that course kind is excluded (see resolveFieldResources's
 * own doc comment) - GENERAL_FIELD_FALLBACK_KEYS is untouched by it, since
 * every entry in that pool is already course-kind neutral. Omitted (the
 * default) applies no filtering, matching every pre-existing caller.
 */
export function renderHelpfulFreeResourcesSection(text: string, min = 3, kind?: CourseKind): string {
  const matched = resolveFieldResources(text, 6, kind);
  const seenUrls = new Set(matched.map((link) => link.url));
  const padded = [...matched];

  for (const key of GENERAL_FIELD_FALLBACK_KEYS) {
    if (padded.length >= min) break;
    const link = FIELD_RESOURCE_MAP[key];
    if (!link || seenUrls.has(link.url)) continue;
    seenUrls.add(link.url);
    padded.push(link);
  }

  if (padded.length === 0) return "";
  const bullets = padded.map((link) =>
    link.whyItHelps ? `- ${link.label} - ${link.url}. ${link.whyItHelps}` : `- ${link.label} - ${link.url}`
  );
  return `## Helpful Free Resources\n${bullets.join("\n")}`;
}

/**
 * Normalize a possibly-mangled resource URL against the curated maps above:
 * sanitizeResourceUrl (src/lib/urls.ts) first cleans trailing punctuation /
 * an unmatched trailing bracket; if the cleaned URL is not itself a value
 * already in either map, but shares an ORIGIN with a map entry, the map
 * entry's own url is returned instead (so
 * "https://www.pmi.org/learning/library/critical-path-method-analysis-6193"
 * collapses to the curated "https://www.pmi.org/" entry rather than
 * 404ing). Returns "" when nothing in either map shares that origin. Never
 * constructs a new URL - only ever returns "" or a literal map value.
 */
export function normalizeResourceUrl(raw: string): string {
  const sanitized = sanitizeResourceUrl(raw);
  if (!sanitized) return "";

  const allEntries = [...Object.values(TOOL_TUTORIAL_MAP), ...Object.values(FIELD_RESOURCE_MAP)];

  for (const entry of allEntries) {
    if (entry.url === sanitized) return sanitized;
  }

  let sanitizedOrigin: string;
  try {
    sanitizedOrigin = new URL(sanitized).origin;
  } catch {
    return "";
  }

  for (const entry of allEntries) {
    try {
      if (new URL(entry.url).origin === sanitizedOrigin) return entry.url;
    } catch {
      continue;
    }
  }

  return "";
}

// Re-exported so a caller that only needs resource-links.ts (the common
// case - shared.ts, docs.ts, steps.content-lectures.ts all render curated
// links) does not also need a separate import from src/lib/urls.ts.
export { sanitizeResourceUrl };
