// Curated OFFICIAL practitioner-tool tutorial/help-center links, used by the
// resolvers and renderers in ../resource-links.ts for generated course
// documents (assignment instructions, class openers, module-objectives
// docs). Pure: no I/O, no fetch, no Date, no Math.random - deep-link rot is
// solved by ROOT-ONLY curation, not by a network check at generation time (a
// fetch per link would add latency, flakiness, and a failure mode inside an
// unattended run).
//
// THE RULE THAT MATTERS MOST, copied verbatim from CURATED_DOCS_MAP's own
// header comment (src/lib/live-class/links.ts) because it is the exact rule
// whose absence produced the defect this module exists to fix: every URL in
// the map below MUST be the tool's official help center, academy, or guides
// ROOT (the site's own top-level help/academy/guides landing page) - never
// the marketing homepage, and never a deep article link with a numeric ID or
// version path. "a deep link rots" (gets reorganized, moved, 404s) in a way
// a root essentially never does, and a bare marketing homepage teaches a
// student nothing about how to use the tool - a link must satisfy BOTH
// halves of the rule, not just the anti-rot half. A real generated course
// (MGT 422, run 512bbdbf) shipped 73 unique URLs; 37 (51%) were dead on a
// curl check, including 11 of 12 fabricated PMI deep links. No numeric
// article IDs, no version paths, no deep articles, and no bare marketing
// domain when the tool has a help/academy/guides root.
//
// The model is never trusted to author a URL (see
// generateAssignmentInstructionsForAssignment's "the model writes NO URLs"
// instruction, shared.ts) - it names a tool in plain text, and
// resolveToolTutorials/renderToolsYouWillUseSection (../resource-links.ts)
// turn that name into a link by CODE, matched against TOOL_TUTORIAL_MAP
// below. A name that matches nothing contributes NO link; nothing is ever
// guessed or constructed.
//
// This module holds ONLY the practitioner-tool map and its ResourceLink
// constants. The sibling professional-body/open-courseware map
// (FIELD_RESOURCE_MAP, same ROOT-ONLY rule) lives in ./field-resources.ts;
// every resolver and renderer (resolveToolTutorials, resolveFieldResources,
// renderToolsYouWillUseSection, etc.) stays in ../resource-links.ts, which
// re-exports both maps and this file's ResourceLink type unchanged, so no
// import anywhere else needs to change.

import type { CourseKind } from "@/lib/course-kind";

/** One resolved resource link. `kind` distinguishes a practitioner TOOL's
 * own tutorial/help page from a professional-body or open-courseware FIELD
 * resource, so a renderer can group or label them differently.
 *
 * `courseKind`, when set on a FIELD_RESOURCE_MAP entry, restricts it to that
 * one course kind (see resolveFieldResources's `kind` parameter in
 * ../resource-links.ts) - left unset for a general/open-courseware resource
 * that is a reasonable "Helpful Free Resources" entry for ANY course kind.
 * Never set on a TOOL_TUTORIAL_MAP entry - a practitioner tool is named
 * because the course committed to it, independent of course kind. */
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

// CURATED, hand-maintained map from a lowercased tool name to that tool's
// OFFICIAL tutorial/help/academy ROOT (see the module header rule above).
// Aliases point at the SAME ResourceLink object (e.g. "ms project"/
// "microsoft project", "sheets"/"google sheets") exactly like
// CURATED_DOCS_MAP's "js"/"javascript" pairing, so a name can be phrased
// either way.
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

// Y8-AC4 (tiered toolset - "far more varied free professional tool usage"):
// three specialist categories a project-management course should plausibly
// touch (AC3: scheduling/Gantt, diagramming, stakeholder surveys) had no
// genuinely free, verified entry here at all - the notable gap being a real
// scheduling tool, since MS Project (already in this map) has no free tier.
// Each entry below was verified BOTH ways this module's own header rule
// requires: the tool is genuinely free, and the URL is a live help/docs root
// (checked directly, not guessed) at the time this was added.
//
// GanttProject: free, open-source (GPLv3) desktop Gantt/PERT scheduler for
// Windows/macOS/Linux - the one category (a real scheduling tool, not a
// spreadsheet standing in for one) this map had no free option for at all.
// help.ganttproject.biz was fetched directly and confirmed live: a
// Discourse-based "GanttProject Support" forum with active Desktop/Cloud
// categories - a genuine help-center root, not a marketing page.
const GANTTPROJECT: ResourceLink = {
  label: "GanttProject help center",
  url: "https://help.ganttproject.biz/",
  kind: "tool",
};
// draw.io / diagrams.net: fully free (no account required) web and desktop
// diagramming tool - the free alternative to Lucidchart's limited free tier
// for the network-diagram/process-flow specialist category. The two names
// are the same product (draw.io Ltd/AG rebranded the hosted app as
// diagrams.net); both alias to the same verified, live documentation root
// (drawio.com/docs/manual/, fetched and confirmed to be the real manual
// index, not a 404 or parked page).
const DRAWIO: ResourceLink = {
  label: "draw.io documentation",
  url: "https://www.drawio.com/docs/manual/",
  kind: "tool",
};
// Google Forms: the free survey/stakeholder-input tool for that specialist
// category. Reuses the SAME verified support.google.com/docs/ root the
// existing GOOGLE_SHEETS/GOOGLE_DOCS/GOOGLE_SLIDES entries already point to
// (Google's shared "Docs Editors Help" covers all of Docs/Sheets/Slides/
// Forms) - no new URL to verify, only a new display label for the same,
// already-verified root.
const GOOGLE_FORMS: ResourceLink = {
  label: "Google Forms help center",
  url: "https://support.google.com/docs/",
  kind: "tool",
};
// Considered and NOT added: Google Looker Studio for the dashboard/reporting
// specialist category. Checked directly - support.google.com/looker-studio/
// now states its own help center "has moved to Google Cloud" and "will be
// taken down in the near future", mid-migration to docs.cloud.google.com at
// the time this was verified. Neither the old (being retired) nor the new
// (still settling) root clears this module's own anti-rot bar with
// confidence, so this category is left uncovered here rather than pointing
// at a URL already known to be in flux - add it once the new location is
// stable and verified, the same standard every other entry in this map holds.
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
  ganttproject: GANTTPROJECT,
  "draw.io": DRAWIO,
  "diagrams.net": DRAWIO,
  "google forms": GOOGLE_FORMS,
};
