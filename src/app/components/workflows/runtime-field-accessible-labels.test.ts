import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Guards AC B4 (run-form cleanup): before FieldShell.tsx existed, every
// branch of these three renderer files drew its own bare
// `<label>{field.label}</label>` - not associated with the control it sat
// above by anything but visual proximity, since `htmlFor` never appeared
// anywhere in this directory. This is a purely TEXTUAL/structural test (no
// jsdom/testing-library in this repo - React components cannot be rendered,
// see docs/REGRESSION.md entry 168): it reads each renderer file as text and
// asserts every literal `<label ...>` tag it contains carries `htmlFor`.
//
// Following the house pattern (page-module-css-classes.test.ts): a canary
// pair proves the extractor itself actually distinguishes a bad `<label>`
// from a good one, so a broken regex cannot report every file clean
// vacuously.

const RENDERER_FILES = [
  "src/app/components/workflows/RuntimeFieldInput.tsx",
  "src/app/components/workflows/RuntimeFieldInputEntityPickers.tsx",
  "src/app/components/workflows/RuntimeFieldInputTemplates.tsx",
  "src/app/components/workflows/FieldShell.tsx",
].map((p) => path.resolve(process.cwd(), p));

// The shared shell every branch of the three renderer files above now
// renders its control inside of - see FieldShell.tsx's own header comment.
// The label/legend markup that used to live thirteen times over across the
// renderer files now lives HERE, once. Named separately (not just "the last
// entry of RENDERER_FILES") so the sanity test below can pin its <label>
// assertion to this specific file rather than "any one of the four" - see
// that test's own comment for why "any one" would be too weak a guarantee.
const FIELD_SHELL_FILE = path.resolve(process.cwd(), "src/app/components/workflows/FieldShell.tsx");

// Matches an OPENING <label ...> tag (never the closing </label>),
// capturing its attribute text so presence of `htmlFor` can be checked
// without a full JSX/TSX parser - the same "read the source as text" idiom
// page-module-css-classes.test.ts already uses for CSS Module classes.
const LABEL_OPEN_TAG_RE = /<label(\s[^>]*)?>/g;

/** Strips `//` and `/* *\/` comments before scanning - this file's own
 * source comments explain the shell/legend/hidden pattern using literal
 * text like "a <label> can only ever name ONE control", which the raw
 * regex above would otherwise flag as a real, unassociated label. Blanks
 * out matched comment text (keeps line numbers stable for the offender
 * messages below) rather than deleting it. Not a full tokenizer - like the
 * CSS comment-stripping in page-module-css-classes.test.ts, this does not
 * understand string literals that happen to contain `//` or `/*`, which is
 * an acceptable structural-test tradeoff, not a parser guarantee. */
function stripComments(source: string): string {
  const noBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return noBlockComments.replace(/\/\/[^\n]*/g, (m) => m.replace(/./g, " "));
}

function findLabelsMissingHtmlFor(source: string): string[] {
  const codeOnly = stripComments(source);
  const offenders: string[] = [];
  LABEL_OPEN_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LABEL_OPEN_TAG_RE.exec(codeOnly)) !== null) {
    const attrs = match[1] ?? "";
    if (!/\bhtmlFor=/.test(attrs)) {
      const line = codeOnly.slice(0, match.index).split("\n").length;
      offenders.push(`line ${line}: ${match[0]}`);
    }
  }
  return offenders;
}

describe("run-form renderers: every <label> carries htmlFor (AC B4)", () => {
  it("canary: the extractor flags a <label> with no htmlFor (a broken regex must not silently report clean)", () => {
    const bad = `
      function Bad() {
        return (<div><label>{field.label}</label><input /></div>);
      }
    `;
    const offenders = findLabelsMissingHtmlFor(bad);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("<label>");
  });

  it("canary: the extractor does not flag a properly-associated <label>, and does not flag </label>", () => {
    const good = `
      function Good() {
        return (<div><label htmlFor="x">{field.label}</label><input id="x" /></div>);
      }
    `;
    expect(findLabelsMissingHtmlFor(good)).toEqual([]);
  });

  it("canary: a label with OTHER attributes but no htmlFor is still flagged (attribute text matters, not just tag presence)", () => {
    const bad = `<label className={styles.thing} data-x="y">{field.label}</label>`;
    expect(findLabelsMissingHtmlFor(bad)).toHaveLength(1);
  });

  it("canary: a comment merely MENTIONING <label> (no htmlFor) is not flagged, but a real one on the very next line still is", () => {
    // This file's own renderer comments explain the shell/legend pattern
    // using prose like "a <label> can only ever name ONE control" - proves
    // the comment-stripping step does not just make everything pass, only
    // the commented-out text.
    const mixed = `
      // a <label> can only ever name one control
      /* another <label> mention, block-commented */
      return (<div><label>{field.label}</label></div>);
    `;
    const offenders = findLabelsMissingHtmlFor(mixed);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain("<label>");
  });

  for (const file of RENDERER_FILES) {
    it(`every <label> in ${path.basename(file)} carries htmlFor`, () => {
      const source = fs.readFileSync(file, "utf-8");
      const offenders = findLabelsMissingHtmlFor(source);
      expect(
        offenders,
        `Found <label> without htmlFor in ${path.basename(file)}:\n${offenders.join("\n")}`
      ).toEqual([]);
    });
  }

  it("sanity: FieldShell.tsx specifically contains a <label> (not just some file in the set - see this test's own name history: it used to accept ANY of the renderer files, which stayed vacuously green while the labels moved OUT of the three original renderers and into FieldShell.tsx, silently guarding nothing). If the shell is ever refactored again and the labels move elsewhere, this must fail loudly rather than pass by coincidence.", () => {
    const shellHasLabel = /<label[\s>]/.test(fs.readFileSync(FIELD_SHELL_FILE, "utf-8"));
    expect(shellHasLabel).toBe(true);
  });
});
