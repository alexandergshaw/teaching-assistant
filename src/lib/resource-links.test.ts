import { describe, it, expect } from "vitest";
import {
  TOOL_TUTORIAL_MAP,
  FIELD_RESOURCE_MAP,
  resolveToolTutorials,
  resolveFieldResources,
  normalizeResourceUrl,
  toolKeysMentionedIn,
  renderToolsYouWillUseSection,
  renderHelpfulFreeResourcesSection,
  type ResourceLink,
} from "./resource-links";
import { CURATED_DOCS_MAP } from "@/lib/live-class/links";

// Every URL in either map must be a site root or a stable top-level
// landing/help page - never a deep article link, a numeric article id, or a
// version path. This is the single rule that prevents the 51% dead-link
// rate measured in the MGT 422 audit from recurring, so it is asserted here
// as a standing regression guard over BOTH maps, not just spot-checked.
function assertIsRootLikeUrl(url: string) {
  const parsed = new URL(url);
  expect(parsed.search).toBe(""); // no query string
  expect(parsed.hash).toBe(""); // no fragment
  // No path segment that is a long digit run (a numeric article/version id -
  // the exact shape of the fabricated PMI deep links the audit found).
  const segments = parsed.pathname.split("/").filter(Boolean);
  for (const segment of segments) {
    expect(segment).not.toMatch(/^\d{3,}$/);
  }
}

// A tool link must be a genuine help/learning surface, not just root-like -
// a bare marketing domain (https://miro.com/) is root-like (no query, no
// hash, no numeric segment) yet is exactly the defect this guards against.
// True when the path goes beyond "/" (e.g. "/help", "/guide", "/excel") OR
// the host itself is a help-like subdomain (help./support./academy./
// learn./pll.).
function isHelpLikeUrl(url: string): boolean {
  const parsed = new URL(url);
  const hasPathBeyondRoot = parsed.pathname.replace(/\/+$/, "").length > 0;
  const helpLikeHost = /^(help|support|academy|learn|pll)\./.test(parsed.hostname);
  return hasPathBeyondRoot || helpLikeHost;
}

// Label/URL honesty pairs: when a label claims to be one of these kinds of
// page, the url must actually carry a matching signal. "help center" accepts
// either "help" or "support" in the url because some vendors (Google) run
// their help center on a support.* domain while still calling it a help
// center - the point is to catch a label promising a help surface that
// resolves to a bare marketing domain, not to force one exact spelling.
const LABEL_URL_HONESTY_PAIRS: Array<{ labelSubstring: string; urlSubstrings: string[] }> = [
  { labelSubstring: "help center", urlSubstrings: ["help", "support"] },
  { labelSubstring: "academy", urlSubstrings: ["academy"] },
  { labelSubstring: "guide", urlSubstrings: ["guid"] },
  { labelSubstring: "support", urlSubstrings: ["support"] },
];

describe("TOOL_TUTORIAL_MAP", () => {
  const requiredTools = [
    "miro",
    "asana",
    "trello",
    "jira",
    "confluence",
    "smartsheet",
    "monday",
    "notion",
    "clickup",
    "wrike",
    "basecamp",
    "airtable",
    "google sheets",
    "google docs",
    "google slides",
    "google drive",
    "excel",
    "word",
    "powerpoint",
    "microsoft project",
    "microsoft planner",
    "lucidchart",
    "figma",
    "canva",
    "tableau",
    "power bi",
    "slack",
    "zoom",
  ];

  it.each(requiredTools)("covers %s", (tool) => {
    expect(TOOL_TUTORIAL_MAP[tool]).toBeDefined();
  });

  it("every entry is an http(s) root-like URL", () => {
    for (const link of Object.values(TOOL_TUTORIAL_MAP)) {
      assertIsRootLikeUrl(link.url);
    }
  });

  // Standing regression guard for the "marketing homepage masquerading as a
  // tutorial link" defect: a bare root like https://miro.com/ is root-like
  // (passes the test above) but is not a help/learning surface. Every entry
  // must resolve to the tool's actual help center, academy, or guides root.
  it("every entry is a help/learning surface, not a bare marketing domain", () => {
    for (const [key, link] of Object.entries(TOOL_TUTORIAL_MAP)) {
      expect(isHelpLikeUrl(link.url), `${key} -> ${link.url} is not a help-like url`).toBe(true);
    }
  });

  // Standing regression guard for the label lying about where the link
  // goes (e.g. "Miro help center" resolving to the marketing homepage). Any
  // label that claims to be a help center, academy, guide, or support page
  // must be backed by a url that actually carries that signal.
  it("label/url honesty: a help center/academy/guide/support label is backed by a matching url", () => {
    for (const [key, link] of Object.entries(TOOL_TUTORIAL_MAP)) {
      const label = link.label.toLowerCase();
      const url = link.url.toLowerCase();
      for (const { labelSubstring, urlSubstrings } of LABEL_URL_HONESTY_PAIRS) {
        if (!label.includes(labelSubstring)) continue;
        const matches = urlSubstrings.some((s) => url.includes(s));
        expect(matches, `${key}: label "${link.label}" promises "${labelSubstring}" but url is ${link.url}`).toBe(
          true
        );
      }
    }
  });

  it("every entry is tagged kind: tool", () => {
    for (const link of Object.values(TOOL_TUTORIAL_MAP)) {
      expect(link.kind).toBe("tool");
    }
  });

  it("aliases point at the exact same entry (ms project / microsoft project, sheets / google sheets)", () => {
    expect(TOOL_TUTORIAL_MAP["ms project"]).toBe(TOOL_TUTORIAL_MAP["microsoft project"]);
    expect(TOOL_TUTORIAL_MAP["sheets"]).toBe(TOOL_TUTORIAL_MAP["google sheets"]);
  });
});

describe("FIELD_RESOURCE_MAP", () => {
  const requiredFields = [
    "pmi",
    "apm",
    "ipma",
    "prince2",
    "axelos",
    "scrum.org",
    "agile alliance",
    "iso",
    "gao",
    "nist",
    "sba",
    "ama",
    "aicpa",
    "shrm",
    "mit opencourseware",
    "openstax",
    "harvard online",
    "saylor",
    // RCA6 (RCA round 2): the coding half, seeded from CURATED_DOCS_MAP
    // (src/lib/live-class/links.ts) plus the two freeResourceSourceRule
    // named that CURATED_DOCS_MAP does not carry (freeCodeCamp, Microsoft
    // Learn).
    "python",
    "javascript",
    "js",
    "web api",
    "web apis",
    "typescript",
    "ts",
    "react",
    "html",
    "css",
    "git",
    "github",
    "mysql",
    "postgresql",
    "postgres",
    "sqlite",
    "sql server",
    "mssql",
    "freecodecamp",
    "microsoft learn",
  ];

  it.each(requiredFields)("covers %s", (field) => {
    expect(FIELD_RESOURCE_MAP[field]).toBeDefined();
  });

  it("every entry is an http(s) root-like URL", () => {
    for (const link of Object.values(FIELD_RESOURCE_MAP)) {
      assertIsRootLikeUrl(link.url);
    }
  });

  it("every entry is tagged kind: field", () => {
    for (const link of Object.values(FIELD_RESOURCE_MAP)) {
      expect(link.kind).toBe("field");
    }
  });

  it("prince2 and axelos alias to the exact same entry", () => {
    expect(FIELD_RESOURCE_MAP["prince2"]).toBe(FIELD_RESOURCE_MAP["axelos"]);
  });

  // RCA6 (RCA round 2): before this fix, FIELD_RESOURCE_MAP had 14
  // courseKind: "applied" entries and ZERO courseKind: "coding" ones, so a
  // coding course's resolved resources could only ever fall through to the
  // four untagged general entries (MIT OCW, OpenStax, Harvard Online,
  // Saylor) - a coding
  // course's assignment sheet used to cite MDN, the Python docs,
  // freeCodeCamp, and Microsoft Learn (freeResourceSourceRule's coding
  // branch, deleted with this fix - see course-kind.ts and RCA10) before
  // losing that citation quality entirely.
  describe("coding-tagged entries", () => {
    const codingKeys = [
      "python",
      "javascript",
      "js",
      "web api",
      "web apis",
      "typescript",
      "ts",
      "react",
      "html",
      "css",
      "git",
      "github",
      "mysql",
      "postgresql",
      "postgres",
      "sqlite",
      "sql server",
      "mssql",
      "freecodecamp",
      "microsoft learn",
    ];

    it.each(codingKeys)("%s is tagged courseKind: coding", (key) => {
      expect(FIELD_RESOURCE_MAP[key]?.courseKind).toBe("coding");
    });

    it("a Python/JavaScript course blob resolves language documentation under kind: coding, not MIT OCW", () => {
      const links = resolveFieldResources(
        "This course teaches Python and JavaScript fundamentals.",
        3,
        "coding"
      );
      const urls = links.map((l) => l.url);
      expect(urls).toContain(FIELD_RESOURCE_MAP.python.url);
      expect(urls).toContain(FIELD_RESOURCE_MAP.javascript.url);
      expect(urls).not.toContain(FIELD_RESOURCE_MAP["mit opencourseware"].url);
    });

    it("an applied course blob still resolves PMI/APM under kind: applied, and never freeCodeCamp", () => {
      const links = resolveFieldResources(
        "This project management course follows PMI and APM guidance.",
        4,
        "applied"
      );
      const urls = links.map((l) => l.url);
      expect(urls).toContain(FIELD_RESOURCE_MAP.pmi.url);
      expect(urls).toContain(FIELD_RESOURCE_MAP.apm.url);
      expect(urls).not.toContain(FIELD_RESOURCE_MAP.freecodecamp.url);
    });

    it("a coding-tagged entry never surfaces for kind: applied, even when its keyword is literally mentioned", () => {
      const links = resolveFieldResources("Read the Python documentation before class.", 4, "applied");
      expect(links.map((l) => l.url)).not.toContain(FIELD_RESOURCE_MAP.python.url);
    });
  });

  // RCA16 (RCA round 3): resource-links.ts's own header comment claims the
  // coding half and CURATED_DOCS_MAP (src/lib/live-class/links.ts) "cannot
  // silently diverge unnoticed" - but until this test existed, nothing
  // detected divergence and no test anywhere imported CURATED_DOCS_MAP. This
  // is the real drift guard that makes that comment true: freeCodeCamp and
  // Microsoft Learn are the two coding-tagged entries with no CURATED_DOCS_MAP
  // counterpart (see the comment above FIELD_RESOURCE_MAP), so they are
  // skipped rather than asserted against a key that was never meant to exist
  // there.
  describe("coding-tagged entries stay in sync with CURATED_DOCS_MAP (RCA16)", () => {
    const NO_CURATED_DOCS_COUNTERPART = new Set(["freecodecamp", "microsoft learn"]);
    const codingEntries = Object.entries(FIELD_RESOURCE_MAP).filter(
      ([key, link]) => link.courseKind === "coding" && !NO_CURATED_DOCS_COUNTERPART.has(key)
    );

    it("has at least one comparable entry to guard (the guard itself is not vacuous)", () => {
      expect(codingEntries.length).toBeGreaterThan(0);
    });

    it.each(codingEntries)("%s's url matches CURATED_DOCS_MAP's own entry", (key, link) => {
      expect(CURATED_DOCS_MAP[key]).toBeDefined();
      expect(link.url).toBe(CURATED_DOCS_MAP[key].url);
    });

    // Sabotage check: a deliberately mismatched url must fail this guard,
    // not just pass because both sides happen to be strings.
    it("SABOTAGE - a mismatched url is caught", () => {
      const drifted = { ...FIELD_RESOURCE_MAP.python, url: "https://example.com/drifted" };
      expect(drifted.url).not.toBe(CURATED_DOCS_MAP.python.url);
    });
  });
});

describe("resolveToolTutorials", () => {
  it("resolves a committed toolset entry like 'Trello (free plan)' by whole-word match", () => {
    const links = resolveToolTutorials(["Trello (free plan)"]);
    expect(links).toEqual([TOOL_TUTORIAL_MAP.trello]);
  });

  it("resolves several distinct tools, preserving input order", () => {
    const links = resolveToolTutorials(["Asana (free tier)", "Excel (free trial)"]);
    expect(links.map((l) => l.url)).toEqual([TOOL_TUTORIAL_MAP.asana.url, TOOL_TUTORIAL_MAP.excel.url]);
  });

  it("contributes no link for a name that matches nothing", () => {
    expect(resolveToolTutorials(["a whiteboard and some markers"])).toEqual([]);
  });

  it("never matches a substring inside an unrelated word (whole-word only)", () => {
    // "notion" must not match inside a word like "connotation".
    expect(resolveToolTutorials(["connotation"])).toEqual([]);
  });

  it("dedupes by url when two names resolve to the same tool", () => {
    const links = resolveToolTutorials(["sheets", "google sheets"]);
    expect(links).toHaveLength(1);
    expect(links[0]).toBe(TOOL_TUTORIAL_MAP["google sheets"]);
  });

  it("is defensive about a non-array input", () => {
    expect(resolveToolTutorials(null as unknown as string[])).toEqual([]);
  });

  it("never returns a URL that is not a literal value in TOOL_TUTORIAL_MAP", () => {
    const curatedUrls = new Set(Object.values(TOOL_TUTORIAL_MAP).map((l) => l.url));
    const links = resolveToolTutorials([
      "Miro",
      "Jira",
      "Confluence",
      "Monday.com",
      "ClickUp",
      "Wrike (free plan)",
      "some totally invented tool",
    ]);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(curatedUrls.has(link.url)).toBe(true);
    }
  });
});

describe("resolveFieldResources", () => {
  it("resolves a mentioned professional body from a text blob", () => {
    const links = resolveFieldResources("This course follows PMI's guide to project management.");
    expect(links).toEqual([FIELD_RESOURCE_MAP.pmi]);
  });

  it("resolves multiple distinct bodies mentioned in the same blob", () => {
    const links = resolveFieldResources("Aligned with PMI and SHRM guidance on workforce planning.");
    const urls = links.map((l) => l.url);
    expect(urls).toContain(FIELD_RESOURCE_MAP.pmi.url);
    expect(urls).toContain(FIELD_RESOURCE_MAP.shrm.url);
  });

  it("honors the max cap (default 4)", () => {
    const text = "pmi apm ipma axelos scrum.org agile alliance iso gao nist sba";
    expect(resolveFieldResources(text).length).toBeLessThanOrEqual(4);
    expect(resolveFieldResources(text, 2)).toHaveLength(2);
  });

  it("returns nothing for a blob mentioning no curated field", () => {
    expect(resolveFieldResources("A general essay about teamwork and communication.")).toEqual([]);
  });

  it("is defensive about a non-string input", () => {
    expect(resolveFieldResources(null as unknown as string)).toEqual([]);
    expect(resolveFieldResources(undefined as unknown as string)).toEqual([]);
  });

  it("never returns a URL that is not a literal value in FIELD_RESOURCE_MAP", () => {
    const curatedUrls = new Set(Object.values(FIELD_RESOURCE_MAP).map((l) => l.url));
    const links = resolveFieldResources("pmi apm ipma prince2 axelos scrum.org agile alliance iso gao nist sba ama aicpa shrm", 20);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(curatedUrls.has(link.url)).toBe(true);
    }
  });

  // RCA regression (docs/REGRESSION.md entry 156 / off-domain-resources fix
  // AC6): freeResourceSourceRule used to gate what the MODEL wrote in this
  // section; now that code is the sole author, the SAME course-kind
  // distinction gates which curated entries the resolver itself may return.
  describe("course-kind gating (kind parameter)", () => {
    it("with no kind given (the default), an applied-only entry matches regardless of kind - unaffected, pre-existing callers keep their exact behavior", () => {
      const links = resolveFieldResources("This course follows PMI's guide.");
      expect(links).toEqual([FIELD_RESOURCE_MAP.pmi]);
    });

    it("kind: 'coding' excludes an applied-only professional body even when it is literally mentioned", () => {
      const links = resolveFieldResources("This course follows PMI's guide.", 4, "coding");
      expect(links).toEqual([]);
    });

    it("kind: 'applied' still resolves the applied-only professional body", () => {
      const links = resolveFieldResources("This course follows PMI's guide.", 4, "applied");
      expect(links).toEqual([FIELD_RESOURCE_MAP.pmi]);
    });

    it("the general/open-courseware pool is course-kind neutral - it resolves under either kind", () => {
      expect(resolveFieldResources("Readings are drawn from OpenStax.", 4, "coding")).toEqual([FIELD_RESOURCE_MAP.openstax]);
      expect(resolveFieldResources("Readings are drawn from OpenStax.", 4, "applied")).toEqual([FIELD_RESOURCE_MAP.openstax]);
    });
  });
});

describe("normalizeResourceUrl", () => {
  it("returns the sanitized url unchanged when it is already an exact map value", () => {
    expect(normalizeResourceUrl("https://www.pmi.org/")).toBe("https://www.pmi.org/");
  });

  it("collapses a deep link that shares an origin with a curated entry to that entry's root", () => {
    expect(normalizeResourceUrl("https://www.pmi.org/learning/library/critical-path-method-analysis-6193")).toBe(
      FIELD_RESOURCE_MAP.pmi.url
    );
  });

  it("collapses a mangled deep link (trailing punctuation) sharing a curated origin", () => {
    expect(normalizeResourceUrl("https://www.pmi.org/certifications/project-management-pmp.")).toBe(
      FIELD_RESOURCE_MAP.pmi.url
    );
  });

  it("returns '' when neither the exact url nor its origin is in either map", () => {
    expect(normalizeResourceUrl("https://www.example.com/some/random/page")).toBe("");
  });

  it("returns '' for a non-http(s) or empty input", () => {
    expect(normalizeResourceUrl("not a url")).toBe("");
    expect(normalizeResourceUrl("")).toBe("");
  });
});

// Type-level smoke check that ResourceLink is exported with the expected shape.
describe("ResourceLink shape", () => {
  it("has label, url, kind", () => {
    const sample: ResourceLink = { label: "x", url: "https://example.com/", kind: "tool" };
    expect(sample.kind === "tool" || sample.kind === "field").toBe(true);
  });
});

describe("toolKeysMentionedIn", () => {
  it("finds a single mentioned tool key", () => {
    expect(toolKeysMentionedIn("Track your backlog in Trello.")).toContain("trello");
  });

  it("finds several distinct mentioned unambiguous tool keys", () => {
    const found = toolKeysMentionedIn("Track this in Jira and diagram it in Lucidchart.");
    expect(found).toContain("jira");
    expect(found).toContain("lucidchart");
  });

  it("never matches a substring inside an unrelated word", () => {
    expect(toolKeysMentionedIn("connotation")).not.toContain("notion");
  });

  it("returns [] for text naming no tool", () => {
    expect(toolKeysMentionedIn("A general essay about teamwork.")).toEqual([]);
  });

  it("is defensive about a non-string input", () => {
    expect(toolKeysMentionedIn(null as unknown as string)).toEqual([]);
  });

  // RCA regression (docs/REGRESSION.md entries 137/141/142): "word", "monday",
  // "sheets", "excel", "slack", "zoom", and "notion" are also ordinary English
  // words - reproduced verbatim from a real generated assignment sheet, each
  // line below previously matched its map key bare and rendered a tool link
  // the course never committed to.
  describe("ambiguous keys never match the bare English word", () => {
    it.each([
      ["Write a 500-word summary of your procurement strategy.", "word"],
      ["Word count: 500.", "word"],
      ["Bring your draft to class on Monday for peer review.", "monday"],
      ["Attach the sheets you produced during the workshop.", "sheets"],
      ["due Monday at 5pm; excel at communicating your rationale", "monday"],
      ["due Monday at 5pm; excel at communicating your rationale", "excel"],
      ["Post an update for the team to see.", "slack"],
      ["We will zoom through the agenda today.", "zoom"],
      ["I like the notion of shared ownership.", "notion"],
    ])("%s -> does not mention %s", (text, key) => {
      expect(toolKeysMentionedIn(text)).not.toContain(key);
    });

    it.each([
      ["Save the draft in Microsoft Word before submitting.", "word"],
      ["RSVP on monday.com by Friday.", "monday"],
      ["The data lives in a Google Sheets workbook.", "sheets"],
      ["Log hours in Microsoft Excel each week.", "excel"],
      ["Post updates in the team Slack channel.", "slack"],
      ["Join the weekly Zoom meeting on Fridays.", "zoom"],
      ["All notes live in the shared Notion workspace.", "notion"],
    ])("%s -> mentions %s via its qualified form", (text, key) => {
      expect(toolKeysMentionedIn(text)).toContain(key);
    });
  });
});

describe("renderToolsYouWillUseSection", () => {
  it("renders one bullet per committed tool, using the committed display name verbatim", () => {
    const section = renderToolsYouWillUseSection(["Trello (free plan)"], "");
    expect(section).toContain("## Tools You Will Use");
    expect(section).toContain(`- Trello (free plan): ${TOOL_TUTORIAL_MAP.trello.label} - ${TOOL_TUTORIAL_MAP.trello.url}.`);
  });

  it("with no committed toolset, resolves a tool named only in the body text, title-casing its display name", () => {
    const section = renderToolsYouWillUseSection([], "This week's work happens in google sheets.");
    expect(section).toContain(`Google Sheets: ${TOOL_TUTORIAL_MAP["google sheets"].label} - ${TOOL_TUTORIAL_MAP["google sheets"].url}`);
  });

  it("a committed tool renders even when the body text separately mentions it", () => {
    const section = renderToolsYouWillUseSection(["Trello (free tier)"], "Use trello for your board.");
    const occurrences = section.split(TOOL_TUTORIAL_MAP.trello.url).length - 1;
    expect(occurrences).toBe(1);
    expect(section).toContain("Trello (free tier):");
  });

  // RCA regression (docs/REGRESSION.md entries 137/141/142 - tool-churn
  // prevention): this used to UNION the committed toolset with any tool
  // named in the body text. Reproduced verbatim: for a Trello-committed
  // course, this exact prose rendered Microsoft Word / monday.com / Google
  // Sheets links the course never chose.
  describe("committed toolset is authoritative (union deleted)", () => {
    const offendingProse = [
      "Write a 500-word summary of your procurement strategy.",
      "Word count: 500.",
      "Bring your draft to class on Monday for peer review.",
      "Attach the sheets you produced during the workshop.",
      "due Monday at 5pm; excel at communicating your rationale",
    ].join("\n");

    it("a Trello-committed course names Trello and nothing else, even with all five offending lines in the body", () => {
      const section = renderToolsYouWillUseSection(["Trello (free plan)"], offendingProse);
      expect(section).toContain("Trello");
      const bulletCount = section.split("\n").filter((l) => l.startsWith("- ")).length;
      expect(bulletCount).toBe(1);
    });

    it("a committed toolset suppresses even an UNAMBIGUOUS tool the body text separately names", () => {
      // Miro and Excel are both real, unambiguous mentions here - the point
      // is that a committed toolset must render ONLY itself, never a union.
      const section = renderToolsYouWillUseSection(
        ["Trello (free plan)"],
        "Also track this in Miro and log hours in Microsoft Excel."
      );
      expect(section).toContain("Trello");
      expect(section).not.toContain(TOOL_TUTORIAL_MAP.miro.url);
      expect(section).not.toContain(TOOL_TUTORIAL_MAP.excel.url);
      const bulletCount = section.split("\n").filter((l) => l.startsWith("- ")).length;
      expect(bulletCount).toBe(1);
    });

    it("with NO committed toolset, an unambiguous tool still resolves from the body text", () => {
      const section = renderToolsYouWillUseSection([], "Build the charter in Miro.");
      expect(section).toContain(TOOL_TUTORIAL_MAP.miro.url);
    });

    it("with NO committed toolset, the same offending prose resolves to nothing (ambiguous keys stay unmatched)", () => {
      const section = renderToolsYouWillUseSection([], offendingProse);
      expect(section).toBe("");
    });
  });

  it("returns '' (omits the section) when nothing resolves", () => {
    expect(renderToolsYouWillUseSection([], "A purely conceptual discussion with no named tool.")).toBe("");
    expect(renderToolsYouWillUseSection([], "")).toBe("");
  });

  it("uses the supplied usageContext in the per-tool sentence", () => {
    const section = renderToolsYouWillUseSection(["Miro"], "", "this week's warm-up exercise");
    expect(section).toContain("Use it for this week's warm-up exercise.");
  });

  it("is defensive about a non-array committedToolNames input", () => {
    expect(renderToolsYouWillUseSection(null as unknown as string[], "")).toBe("");
  });
});

describe("renderHelpfulFreeResourcesSection", () => {
  it("renders the matched field resources", () => {
    const section = renderHelpfulFreeResourcesSection("This course follows PMI's guide to project management.");
    expect(section).toContain("## Helpful Free Resources");
    expect(section).toContain(`- ${FIELD_RESOURCE_MAP.pmi.label} - ${FIELD_RESOURCE_MAP.pmi.url}`);
  });

  it("pads with the general fallback pool up to the minimum when nothing matches", () => {
    const section = renderHelpfulFreeResourcesSection("A general essay about teamwork and communication.");
    const bulletCount = section.split("\n").filter((l) => l.startsWith("- ")).length;
    expect(bulletCount).toBeGreaterThanOrEqual(3);
  });

  it("never duplicates an entry already matched when padding with the fallback pool", () => {
    // openstax is both a possible direct match and part of the fallback pool -
    // it must appear exactly once even when explicitly named.
    const section = renderHelpfulFreeResourcesSection("Readings are drawn from OpenStax.");
    const occurrences = section.split(FIELD_RESOURCE_MAP.openstax.url).length - 1;
    expect(occurrences).toBe(1);
  });

  it("honors a custom minimum", () => {
    const section = renderHelpfulFreeResourcesSection("This course follows PMI's guide.", 1);
    const bulletCount = section.split("\n").filter((l) => l.startsWith("- ")).length;
    expect(bulletCount).toBeGreaterThanOrEqual(1);
  });

  // RCA regression (docs/REGRESSION.md entry 156): the model used to also be
  // asked to write a "Helpful Free Resources" section itself, so every
  // LLM-generated sheet ended up with the heading twice. Code now owns this
  // section outright; this pins that a document assembled the way
  // generateAssignmentInstructionsForAssignment assembles one only ever
  // carries the heading once.
  it("appears exactly once in an assembled document, even when the body text itself would otherwise match a field resource", () => {
    const modelBody = "# Assignment\n\n## Assignment Overview\nFollows PMI's guide.\n\n## Deliverables\n- Submit the file";
    const resourcesSection = renderHelpfulFreeResourcesSection(modelBody);
    const assembled = `${modelBody}\n\n${resourcesSection}`;
    const occurrences = assembled.split("## Helpful Free Resources").length - 1;
    expect(occurrences).toBe(1);
  });

  // Course-kind gating (off-domain-resources fix AC6): now governs the
  // CURATED resolver's field-source choice rather than the prompt (RCA3).
  describe("course-kind gating (kind parameter)", () => {
    it("kind: 'coding' never surfaces an applied-only professional body, even when the course text names one - falls back to the general pool instead", () => {
      const section = renderHelpfulFreeResourcesSection("This course follows PMI's guide.", 3, "coding");
      expect(section).not.toContain(FIELD_RESOURCE_MAP.pmi.url);
      const bulletCount = section.split("\n").filter((l) => l.startsWith("- ")).length;
      expect(bulletCount).toBeGreaterThanOrEqual(3);
    });

    it("kind: 'applied' still surfaces the applied-only professional body", () => {
      const section = renderHelpfulFreeResourcesSection("This course follows PMI's guide.", 3, "applied");
      expect(section).toContain(FIELD_RESOURCE_MAP.pmi.url);
    });
  });
});
