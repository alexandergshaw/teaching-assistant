import { describe, it, expect } from "vitest";
import { TOOL_TUTORIAL_MAP, FIELD_RESOURCE_MAP, resolveFieldResources } from "./resource-links";
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
    // Y8-AC4: the free desktop scheduler / diagramming / survey specialist
    // categories, added to close the "no genuinely free scheduling tool" gap.
    "ganttproject",
    "draw.io",
    "diagrams.net",
    "google forms",
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

  // Y8-AC4: draw.io and diagrams.net are the same product under two names -
  // both must resolve to the identical entry, the same alias pattern as
  // ms project/microsoft project above.
  it("draw.io and diagrams.net alias to the exact same entry", () => {
    expect(TOOL_TUTORIAL_MAP["draw.io"]).toBe(TOOL_TUTORIAL_MAP["diagrams.net"]);
  });

  // Y8-AC4: GanttProject is the one genuinely free desktop project scheduler
  // this map previously had no entry for at all - MS Project (the only
  // scheduling-shaped entry already present) has no free tier.
  it("GanttProject is a genuinely free desktop scheduling tool, distinct from MS Project", () => {
    expect(TOOL_TUTORIAL_MAP["ganttproject"].url).not.toBe(TOOL_TUTORIAL_MAP["microsoft project"].url);
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
    // AC3 of the "domain-shaped toolset" fix - a security course's "Helpful
    // Free Resources" section needs a professional body/standards reference
    // of its own, the same way a project-management course gets PMI/APM.
    "owasp",
    "cisa",
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

  // AC3 of the "domain-shaped toolset" fix - the real defect this guards:
  // BIT 320 (Ethical Hacking)'s generated "Helpful Free Resources" section
  // fell back to generic open-courseware padding (MIT OCW/OpenStax/Saylor)
  // because FIELD_RESOURCE_MAP had no professional-body/standards entry for
  // the security field at all, the way PMI/APM already exist for project
  // management. OWASP and CISA close that gap; NIST (already present) gains
  // the same cybersecurity subject-keyword coverage.
  describe("cybersecurity-tagged entries (AC3)", () => {
    it.each(["owasp", "cisa"])("%s is tagged courseKind: applied", (key) => {
      expect(FIELD_RESOURCE_MAP[key]?.courseKind).toBe("applied");
    });

    it.each(["owasp", "cisa", "nist"])("%s carries cybersecurity subject keywords", (key) => {
      const keywords = FIELD_RESOURCE_MAP[key]?.subjectKeywords ?? [];
      expect(keywords).toContain("vulnerability");
      expect(keywords).toContain("penetration testing");
    });

    it("a cybersecurity course blob resolves OWASP, CISA, and NIST via subject keywords with none of their names mentioned", () => {
      const links = resolveFieldResources(
        "This week covers network reconnaissance and vulnerability assessment techniques.",
        6,
        "applied"
      );
      const urls = links.map((l) => l.url);
      expect(urls).toContain(FIELD_RESOURCE_MAP.owasp.url);
      expect(urls).toContain(FIELD_RESOURCE_MAP.cisa.url);
      expect(urls).toContain(FIELD_RESOURCE_MAP.nist.url);
    });

    it("a cybersecurity course blob never resolves PMI/APM, and a project-management blob never resolves OWASP/CISA", () => {
      const securityLinks = resolveFieldResources(
        "This week covers malware analysis and incident response.",
        6,
        "applied"
      );
      expect(securityLinks.map((l) => l.url)).not.toContain(FIELD_RESOURCE_MAP.pmi.url);

      const pmLinks = resolveFieldResources(
        "This week covers stakeholder management and procurement.",
        6,
        "applied"
      );
      expect(pmLinks.map((l) => l.url)).not.toContain(FIELD_RESOURCE_MAP.owasp.url);
      expect(pmLinks.map((l) => l.url)).not.toContain(FIELD_RESOURCE_MAP.cisa.url);
    });

    // SABOTAGE CHECK (actually performed): temporarily set OWASP's
    // subjectKeywords to `undefined` and re-ran this file. Result: three
    // failures - "owasp carries cybersecurity subject keywords" failed with
    // "expected [] to include 'vulnerability'", and both resolver tests
    // failed with "expected [ 'https://www.nist.gov/', ...(1) ] to include
    // 'https://owasp.org/'" (CISA still matched via its own untouched
    // keywords, NIST via its own - only OWASP dropped out, proving the
    // assertions exercise OWASP's specific subjectKeywords wiring rather
    // than passing coincidentally). Reverted back to the real implementation
    // afterward; the full file (133 tests) is green again.
    it("SABOTAGE-checked: subject-keyword matching is what resolves OWASP, not a name mention", () => {
      const links = resolveFieldResources("Focus on vulnerability assessment this week.", 6, "applied");
      expect(links.map((l) => l.url)).toContain(FIELD_RESOURCE_MAP.owasp.url);
    });
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
