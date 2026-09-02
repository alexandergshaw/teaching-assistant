// docs/recording-controls-ux-acceptance-criteria.md CC5/section 6. Nothing
// renders in this repo (vitest is node-env, collects only src/**/*.test.ts),
// so ConfirmArmButtons.tsx's contract is pinned as source text - the idiom
// knowledgeBulkBar.wiring.test.ts and modalAdoptionScan.ts already use
// (stripComments, indexOf-bounded slices, a documented heuristic rather than
// a real JSX parser, "SABOTAGE TARGET" labels on anything worth deliberately
// breaking to prove the test is live).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

const SOURCE_PATH = path.join(process.cwd(), "src/app/components/ui/ConfirmArmButtons.tsx");
const source = readFileSync(SOURCE_PATH, "utf8");

function stripComments(text: string): string {
  // JSX comments ({/* ... */}) must go FIRST: they nest a /* ... */ block
  // comment inside braces, so stripping block comments before JSX comments
  // would leave a dangling "{" and "}" behind instead of removing the whole
  // expression container.
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("stripComments (canary first)", () => {
  it("removes a // comment but leaves real code alone", () => {
    const fixture = ["// aria-describedby used to live here", "const x = <Button aria-describedby={id} />;"].join(
      "\n"
    );
    const stripped = stripComments(fixture);
    expect(stripped).not.toContain("used to live here");
    expect(stripped).toContain("<Button aria-describedby={id} />");
  });

  it("removes a JSX {/* ... */} comment but leaves real code alone", () => {
    const fixture = ["{/* aria-describedby used to live here */}", "const x = <Button aria-describedby={id} />;"].join(
      "\n"
    );
    const stripped = stripComments(fixture);
    expect(stripped).not.toContain("used to live here");
    expect(stripped).toContain("<Button aria-describedby={id} />");
  });
});

describe("ConfirmArmButtons.tsx - CC5's one-element arm/confirm contract, pinned as source text", () => {
  const stripped = stripComments(source);

  it("SABOTAGE TARGET: idle and armed are ONE Button element - a single ternary on variant, not two separate <Button> literals for the main control", () => {
    const buttonOpenCount = (stripped.match(/<Button\b/g) ?? []).length;
    // Exactly two <Button> sites total: the one-element main button, and the
    // Cancel button rendered only while armed.
    expect(buttonOpenCount).toBe(2);
    expect(stripped).toMatch(/variant=\{armed \? "contained" : idleVariant\}/);
  });

  it("armed renders aria-describedby pointing at consequenceId; idle renders it as undefined (never omitted from the element, so it always changes IN PLACE)", () => {
    expect(stripped).toMatch(/aria-describedby=\{armed \? consequenceId : undefined\}/);
  });

  it("SABOTAGE TARGET: Cancel renders only when armed, and its JSX appears AFTER the main Button's closing tag - not before", () => {
    const mainButtonEnd = stripped.indexOf("</Button>");
    expect(mainButtonEnd).toBeGreaterThan(-1);
    const cancelGateIdx = stripped.indexOf("{armed && (");
    expect(cancelGateIdx).toBeGreaterThan(mainButtonEnd);
    // Not an exact-whitespace/line-ending literal (">\n          Cancel\n")
    // - that breaks under CRLF or a formatter change for reasons unrelated
    // to the contract being pinned. The 200-char window below is already
    // used by the next test to bound "the Cancel element"; just confirm the
    // label text lands inside it.
    const cancelBlock = stripped.slice(cancelGateIdx, cancelGateIdx + 200);
    expect(cancelBlock).toContain("Cancel");
  });

  it("Cancel is disabled while loading, and never carries aria-describedby itself", () => {
    const cancelGateIdx = stripped.indexOf("{armed && (");
    const cancelBlock = stripped.slice(cancelGateIdx, cancelGateIdx + 200);
    expect(cancelBlock).toMatch(/disabled=\{loading\}/);
    expect(cancelBlock).not.toMatch(/aria-describedby/);
  });

  it("tone maps to colour via a closed record (danger -> error, warning -> warning, primary -> primary)", () => {
    expect(stripped).toMatch(/danger:\s*"error"/);
    expect(stripped).toMatch(/warning:\s*"warning"/);
    expect(stripped).toMatch(/primary:\s*"primary"/);
  });

  it("SABOTAGE TARGET: Escape, while armed, calls the SAME cancel handler that focuses the button - not a bare onCancel prop call", () => {
    expect(stripped).toMatch(/event\.key === "Escape" && armed\) handleCancel\(\)/);
  });

  it("SABOTAGE TARGET: handleCancel focuses the main button BEFORE calling the onCancel prop, so a click never drops focus to <body> once Cancel unmounts", () => {
    const handleCancelIdx = stripped.indexOf("const handleCancel = () => {");
    expect(handleCancelIdx).toBeGreaterThan(-1);
    const focusIdx = stripped.indexOf("mainButtonRef.current?.focus()", handleCancelIdx);
    const onCancelIdx = stripped.indexOf("onCancel();", handleCancelIdx);
    expect(focusIdx).toBeGreaterThan(handleCancelIdx);
    expect(onCancelIdx).toBeGreaterThan(focusIdx);
  });

  it("no onBlur disarm anywhere in this file (CC5: no onBlur disarm on the confirm element)", () => {
    expect(stripped).not.toMatch(/onBlur/);
  });

  it("the wrapper carries no tabIndex (CC5: both buttons inside <span className={styles.ghActions} onKeyDown=...> with no tabIndex)", () => {
    const spanIdx = stripped.indexOf("<span");
    const spanEnd = stripped.indexOf(">", spanIdx);
    const spanTag = stripped.slice(spanIdx, spanEnd + 1);
    expect(spanTag).toMatch(/className=\{styles\.ghActions\}/);
    expect(spanTag).not.toMatch(/tabIndex/);
  });
});

// ---------------------------------------------------------------------------
// CC5/section 6: "onBlur never appears on the same element as
// aria-describedby={...consequenceId} in any consumer" - the row-level
// GradingTableRow.tsx precedent this group replaces (`onBlur={() =>
// setRemoveArmed(false)}` on the SAME Button as the confirm label) is
// exactly the anti-pattern CC5 retires. At wave 0 no consumer of
// ConfirmArmButtons exists yet - the named files (CaptionsList.tsx,
// TakesPanel.tsx, PreviewExport.tsx) keep legitimate blur-COMMIT handlers
// elsewhere in those files, which this scan must not flag. This is a
// documented heuristic, not a real JSX parser (the same limitation
// modalAdoptionScan.ts records for itself): it locates the nearest `<`
// before and `>` after a match and treats that slice as "the element" -
// deeply nested multi-line props inside that same tag could fool it, but
// nothing in this repo's actual JSX shapes today does.
// ---------------------------------------------------------------------------

function walkTsxFiles(rootDir: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx")) found.push(full);
    }
  };
  walk(rootDir);
  return found;
}

/** Element-scoped: reports the tag text for every element carrying BOTH
 *  `onBlur` and an `aria-describedby={...}` whose expression names a
 *  consequence id (camelCase `...ConsequenceId`, `consequenceId`, or the
 *  SCREAMING_SNAKE `..._CONSEQUENCE_ID` constants this repo uses). */
function findOnBlurBesideConsequenceDescribedBy(source: string): string[] {
  const stripped = stripComments(source);
  const violations: string[] = [];
  const describedByRegex = /aria-describedby=\{[^}]*\}/g;
  let match: RegExpExecArray | null;
  while ((match = describedByRegex.exec(stripped))) {
    if (!/consequence_?id/i.test(match[0])) continue;
    const idx = match.index;
    const tagStart = stripped.lastIndexOf("<", idx);
    const tagEnd = stripped.indexOf(">", idx);
    if (tagStart === -1 || tagEnd === -1) continue;
    const tagText = stripped.slice(tagStart, tagEnd + 1);
    if (/onBlur/.test(tagText)) violations.push(tagText);
  }
  return violations;
}

describe("findOnBlurBesideConsequenceDescribedBy (scanner fixture self-test)", () => {
  it("flags a synthetic element that carries both onBlur and a consequence aria-describedby (the exact GradingTableRow.tsx precedent CC5 retires)", () => {
    const fixture =
      '<Button onClick={handleRemoveClick} onBlur={() => setRemoveArmed(false)} aria-describedby={REMOVE_CONSEQUENCE_ID}>Confirm</Button>';
    expect(findOnBlurBesideConsequenceDescribedBy(fixture)).toHaveLength(1);
  });

  it("does not flag a legitimate blur-commit handler on an UNRELATED element in the same file", () => {
    const fixture = [
      '<TextField onBlur={commitLibraryName} />',
      '<Button aria-describedby={deleteConsequenceId}>Confirm delete</Button>',
    ].join("\n");
    expect(findOnBlurBesideConsequenceDescribedBy(fixture)).toHaveLength(0);
  });

  it("does not flag an aria-describedby that has nothing to do with a consequence id", () => {
    const fixture = '<input onBlur={commit} aria-describedby={helpTextId} />';
    expect(findOnBlurBesideConsequenceDescribedBy(fixture)).toHaveLength(0);
  });
});

describe("repo-wide: no consumer pairs onBlur with a consequence aria-describedby on the same element", () => {
  it("SABOTAGE TARGET: zero violations across every .tsx file under src/app/components (re-run after wave 1 wires real consumers)", () => {
    const files = walkTsxFiles(path.join(process.cwd(), "src/app/components"));
    expect(files.length).toBeGreaterThan(50);
    const allViolations: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const found = findOnBlurBesideConsequenceDescribedBy(text);
      if (found.length > 0) allViolations.push(`${file}: ${found.join(" | ")}`);
    }
    expect(allViolations, allViolations.join("\n")).toEqual([]);
  });
});
