import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// L4: the loop had no step asking why a feature belongs in this app rather
// than in a chat with an LLM (docs/BACKLOG.md, L4). The fix lives entirely in
// docs/ prose - docs/DEV_LOOP.md's Criteria and Verify paragraphs,
// docs/loop/iteration-caps.md's disposal (b) Reduce, docs/loop/seats.md's
// Acceptance criteria and Test seat briefs, and a new docs/loop/leverage.md -
// and nothing in this repo's suite reads docs/ except src/lib/no-emojis.
// test.ts, so the fix would ship as a rubber stamp without this file.
//
// EVERY ASSERTION HERE PINS A FACT AND AN ORDERING, NEVER A SENTENCE. This
// repo has twice been burned by source-text assertions that pinned exact
// wording or casing (docs/loop/seats.md's own "source-text tests
// over-specify" lesson), which then forced contorted prose later. All text
// matches here are case-insensitive; none pins a full heading sentence, bold
// markup, or a label's exact spelling. An editor may freely reword any
// sentence these tests touch; the tests only require that the leverage step
// still exists, in the same document section, in the same relative order.

const REPO_ROOT = process.cwd();
const readDoc = (relPath: string) => fs.readFileSync(path.join(REPO_ROOT, relPath), "utf-8");

describe("DEV_LOOP.md: the Criteria step carries the leverage claim", () => {
  const source = readDoc("docs/DEV_LOOP.md");
  const criteriaStart = source.indexOf("**Criteria.**");
  const designSeatsStart = source.indexOf("**Design seats", criteriaStart);
  const criteriaSection = source.slice(criteriaStart, designSeatsStart);

  it("the Criteria paragraph exists, followed by the Design seats paragraph", () => {
    expect(criteriaStart, "expected to find **Criteria.**").toBeGreaterThan(-1);
    expect(designSeatsStart, "expected **Design seats after Criteria").toBeGreaterThan(criteriaStart);
  });

  it("the Criteria paragraph names a leverage claim and points at docs/loop/leverage.md", () => {
    expect(criteriaSection).toMatch(/leverage claim/i);
    expect(criteriaSection).toContain("docs/loop/leverage.md");
  });

  it("the pre-existing mechanism hand-off sentence survives", () => {
    // Markdown hard-wraps this paragraph, so the target phrase can straddle a
    // newline; collapse whitespace runs before matching rather than reaching
    // for the /s regex flag (TS1501 fails tsc in this repo).
    const collapsed = criteriaSection.replace(/\s+/g, " ");
    expect(collapsed).toContain("mechanism belongs to the architect");
  });
});

describe("DEV_LOOP.md: Verify re-judges the leverage claim against the built diff", () => {
  const source = readDoc("docs/DEV_LOOP.md");
  const verifyStart = source.indexOf("**Verify.**");
  const followUpStart = source.indexOf("**Follow-up design seats", verifyStart);
  const verifySection = source.slice(verifyStart, followUpStart);

  it("the Verify paragraph exists, followed by Follow-up design seats", () => {
    expect(verifyStart).toBeGreaterThan(-1);
    expect(followUpStart).toBeGreaterThan(verifyStart);
  });

  it("Verify mentions the leverage claim and treats it as a finding, not a refusal", () => {
    expect(verifySection).toMatch(/leverage claim/i);
    expect(verifySection).toMatch(/finding/i);
  });
});

describe("iteration-caps.md: the leverage claim is a disposal, not an entry gate", () => {
  const source = readDoc("docs/loop/iteration-caps.md");
  const disposalsStart = source.indexOf("## The four legal disposals");
  const checkerContractStart = source.indexOf("## Checker output contract", disposalsStart);
  const disposalsSection = source.slice(disposalsStart, checkerContractStart);
  const entryGatesStart = source.indexOf("## Entry gates");
  const antiGamingStart = source.indexOf("## Anti-gaming rules", entryGatesStart);
  const entryGatesSection = source.slice(entryGatesStart, antiGamingStart);

  it("the four legal disposals section exists, followed by the checker output contract", () => {
    expect(disposalsStart).toBeGreaterThan(-1);
    expect(checkerContractStart).toBeGreaterThan(disposalsStart);
  });

  it("disposal (b) mentions the leverage claim", () => {
    const reduceIdx = disposalsSection.search(/\(b\)\s*reduce/i);
    expect(reduceIdx, "expected disposal (b) Reduce to exist").toBeGreaterThan(-1);
    expect(disposalsSection.toLowerCase()).toContain("leverage");
  });

  it("no fourth numbered entry gate was added for the leverage claim (it is a disposal, not a gate)", () => {
    const gateRegex = /^\d+\.\s\*\*/gm;
    const gates = entryGatesSection.match(gateRegex) ?? [];
    expect(gates.length).toBe(3);
    expect(entryGatesSection.toLowerCase()).not.toContain("leverage");
  });
});

describe("seats.md: the Acceptance criteria seat owns the leverage claim, including its checker question", () => {
  const source = readDoc("docs/loop/seats.md");
  const acStart = source.indexOf("## Acceptance criteria");
  const architectStart = source.indexOf("## Architect + reuse survey", acStart);
  const acSection = source.slice(acStart, architectStart);

  it("the Acceptance criteria section exists, followed by Architect + reuse survey", () => {
    expect(acStart).toBeGreaterThan(-1);
    expect(architectStart).toBeGreaterThan(acStart);
  });

  it("Produces names the leverage claim and cites docs/loop/leverage.md", () => {
    expect(acSection).toContain("docs/loop/leverage.md");
    expect(acSection).toMatch(/leverage claim/i);
  });

  it("the checker QUESTION LIST itself - not only the Produces paragraph - addresses the leverage claim", () => {
    const checkerAskIdx = acSection.indexOf("Its checker must ask:");
    expect(checkerAskIdx).toBeGreaterThan(-1);
    const afterChecker = acSection.slice(checkerAskIdx);
    expect(afterChecker.toLowerCase()).toContain("leverage");
    expect(afterChecker).toContain("docs/loop/leverage.md");
  });
});

describe("seats.md: the Test seat owns the removal test, including its checker question", () => {
  const source = readDoc("docs/loop/seats.md");
  const testSeatStart = source.indexOf("## Test seat");
  const testSeatSection = source.slice(testSeatStart);

  it("the Test seat section exists", () => {
    expect(testSeatStart).toBeGreaterThan(-1);
  });

  it("the Produces prose mentions the removal test", () => {
    const checkerAskIdx = testSeatSection.indexOf("Its checker must ask:");
    expect(checkerAskIdx).toBeGreaterThan(-1);
    const producesProse = testSeatSection.slice(0, checkerAskIdx);
    expect(producesProse.toLowerCase()).toContain("removal test");
  });

  it("the checker QUESTION LIST itself also addresses the removal test", () => {
    const checkerAskIdx = testSeatSection.indexOf("Its checker must ask:");
    const afterChecker = testSeatSection.slice(checkerAskIdx);
    expect(afterChecker.toLowerCase()).toContain("removal test");
  });
});

describe("docs/loop/leverage.md: the taxonomy card exists with its worked examples", () => {
  const leveragePath = path.join(REPO_ROOT, "docs/loop/leverage.md");

  it("the file exists", () => {
    expect(fs.existsSync(leveragePath)).toBe(true);
  });

  const source = fs.existsSync(leveragePath) ? fs.readFileSync(leveragePath, "utf-8") : "";
  const taxonomyMatch = /^## .*taxonom/im.exec(source);
  const negativeExampleMatch = /^## .*negative example/im.exec(source);
  const removalTestMatch = /^## .*removal test/im.exec(source);
  const disposalMatch = /^## .*disposal/im.exec(source);

  const taxonomyIdx = taxonomyMatch?.index ?? -1;
  const negativeExampleIdx = negativeExampleMatch?.index ?? -1;
  const removalTestIdx = removalTestMatch?.index ?? -1;
  const disposalIdx = disposalMatch?.index ?? -1;

  it("holds, in order: the taxonomy, the negative example, the removal test, then disposal guidance", () => {
    expect(taxonomyIdx, "expected a taxonomy heading").toBeGreaterThan(-1);
    expect(negativeExampleIdx, "expected a negative-example heading").toBeGreaterThan(taxonomyIdx);
    expect(removalTestIdx, "expected a removal-test heading").toBeGreaterThan(negativeExampleIdx);
    expect(disposalIdx, "expected a disposal heading").toBeGreaterThan(removalTestIdx);
  });

  it("the taxonomy is a real table, not a stub (at least 8 markdown-table lines)", () => {
    const taxonomySection = source.slice(taxonomyIdx, negativeExampleIdx);
    const tableLines = taxonomySection.split("\n").filter((l) => l.trim().startsWith("|"));
    expect(tableLines.length).toBeGreaterThanOrEqual(8);
  });

  it("the GUARANTEED row cites REGRESSION entry 423 plus at least two more in-repo examples", () => {
    const taxonomySection = source.slice(taxonomyIdx, negativeExampleIdx);
    expect(taxonomySection).toContain("423");
    expect(taxonomySection).toContain("class-trends-insight.ts");
    expect(taxonomySection).toContain("course-intel/ask/route.ts");
  });

  it("names at least three classes struck as inherited-not-earned", () => {
    const struckIdx = source.toLowerCase().indexOf("struck");
    expect(struckIdx, "expected a struck-classes section").toBeGreaterThan(-1);
    const struckSection = source.slice(struckIdx, taxonomyIdx > struckIdx ? undefined : negativeExampleIdx);
    const tableLines = struckSection.split("\n").filter((l) => l.trim().startsWith("|") && !l.includes("---"));
    // header row + at least 3 data rows
    expect(tableLines.length).toBeGreaterThanOrEqual(4);
  });

  it("the negative example names a real, findable feature, not an invented one", () => {
    const struggleSection = source.slice(negativeExampleIdx, removalTestIdx);
    expect(struggleSection).toContain("AskAiModal.tsx");
    expect(struggleSection).toContain("askAboutCourseAction");
  });

  it("the removal-test section cites the worked classTrendsDraft guard fix", () => {
    const removalSection = source.slice(removalTestIdx, disposalIdx);
    expect(removalSection).toContain("classTrendsDraft.not-postable.test.ts");
    expect(removalSection.toLowerCase()).toContain("sabotage");
  });

  it("the removal-test section carries a self-check procedure for an author's own draft, after the section's opening", () => {
    const removalSection = source.slice(removalTestIdx, disposalIdx);
    // The opening defines what a removal test is (it must go RED when the
    // advantage is removed). The self-check procedure - telling an author how
    // to test their OWN draft against that definition - must come after it,
    // not be the first thing the section says.
    const openingIdx = removalSection.search(/goes red/i);
    const selfCheckIdx = removalSection.search(/state the deletion/i);
    expect(openingIdx, "expected the removal-test definition to exist").toBeGreaterThan(-1);
    expect(selfCheckIdx, "expected a self-check procedure").toBeGreaterThan(openingIdx);
  });
});

describe("AGENTS.md: every session is asked the leverage question", () => {
  const source = readDoc("AGENTS.md");

  it("names the leverage question and points at docs/loop/leverage.md", () => {
    expect(source).toMatch(/chat with an llm/i);
    expect(source).toContain("docs/loop/leverage.md");
  });
});

// NOT COVERED HERE, AND SAID PLAINLY: whether a checker actually applies the
// leverage-claim question well on any given feature is not gateable by a
// structure test - it can prove the taxonomy and the negative example exist,
// never that a future agent read them or judged a claim correctly. Same
// ceiling this repo already states for Accessibility: no component is
// rendered by any test here, and no per-feature criteria document is a
// tracked file this suite can read either.
