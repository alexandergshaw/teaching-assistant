// Generated-content preview modal - placement guard.
//
// The modal opened by the LMS view's "Generate" bulk action used to be
// rendered from inside `ModulesView`'s `<div className={styles.ccStickyHeader}>`
// (it lived in GenerateFromSelectionSection's `preview &&` branch, and that
// section renders inside the bulk bar, inside the header). That header is
// `position: sticky; z-index: 30; backdrop-filter: blur(10px)`, which makes it
// BOTH a stacking context capped at 30 - below the Tabs strip (40), the
// in-session banner (45) and the top bar (50) - AND the containing block for
// `position: fixed` descendants, so `.previewBackdrop`'s `inset: 0` sized to
// the header instead of the viewport. The modal therefore painted behind all
// three chrome bars, with a header-sized scrim. See
// docs/lms-preview-modal-stacking-acceptance-criteria.md.
//
// vitest here is node-env and collects only `src/**/*.test.ts`, so no `.tsx`
// is ever rendered and nothing can assert paint order. What CAN be pinned is
// the structural fact the fix rests on: the modal is not rendered anywhere
// inside the sticky-header subtree, and no capability was dropped on the way
// out. This file reads the components as TEXT, the same idiom
// `bulkCreateModules.wiring.test.ts` and `repoGrades.wiring.test.ts` already
// use - and, as REGRESSION entry 239 check 10 requires, every structural
// checker below is proven against inline canary fixtures before it is trusted
// against the real files.
//
// The canaries below are deliberately the sabotages an audit of an earlier
// draft of this file ACTUALLY got past: a capability deleted from the props
// interface AND the render site at once (which an "every declared prop is
// bound" check cannot see), a hardcoded in-header file list that excluded the
// very component it was meant to police, and a deck-template picker deleted
// while the test named after it stayed green.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const MODULES_VIEW_PATH = join(process.cwd(), "src/app/components/content-tab/ModulesView.tsx");
const MODAL_PATH = join(process.cwd(), "src/app/components/content-tab/modules/GeneratedPreviewModal.tsx");
const SECTION_PATH = join(process.cwd(), "src/app/components/content-tab/modules/GenerateFromSelectionSection.tsx");
const PAGE_CSS_PATH = join(process.cwd(), "src/app/page.module.css");

const modulesViewSource = readFileSync(MODULES_VIEW_PATH, "utf8");
const sectionSource = readFileSync(SECTION_PATH, "utf8");
const pageCss = readFileSync(PAGE_CSS_PATH, "utf8");

/** Where a component rendered inside the sticky header could live. Used to
 * RESOLVE the header's actual children (read out of the header block itself),
 * never as the list of what to check - a hardcoded list cannot police a
 * component added later, which is exactly how an earlier draft of this guard
 * missed its own regression. */
const COMPONENT_DIRS = [
  "src/app/components/content-tab/modules",
  "src/app/components/content-tab",
  "src/app/components",
];

/** Each capability the modal has today, and the prop-name shape that carries
 * it. Names, not spellings: a rename inside the pattern is fine, deleting the
 * capability is not. */
const CAPABILITIES: readonly { readonly what: string; readonly pattern: RegExp }[] = [
  { what: "the version on screen", pattern: /^preview$/i },
  { what: "closing the modal", pattern: /close/i },
  { what: "choosing a stored version", pattern: /version/i },
  { what: "the refine instructions box", pattern: /instruction/i },
  { what: "running a refine", pattern: /refin/i },
  { what: "downloading the version", pattern: /download/i },
  { what: "posting to Canvas", pattern: /post/i },
];

/**
 * End of the JSX tag that starts at `from` (the index of its `<`), and whether
 * that tag is self-closing. Brace- and quote-aware, because a JSX tag's props
 * routinely contain `>` inside an expression (`onClick={() => ...}`), and the
 * sticky header itself contains a self-closing `<div ... />` (the resize
 * handle) that a naive `<div` / `</div>` count would mis-pair.
 */
function tagEnd(text: string, from: number): { end: number; selfClosing: boolean } {
  let braces = 0;
  let quote: string | null = null;
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") braces += 1;
    else if (ch === "}") braces -= 1;
    else if (ch === ">" && braces === 0) {
      let j = i - 1;
      while (j > from && /\s/.test(text[j])) j -= 1;
      return { end: i, selfClosing: text[j] === "/" };
    }
  }
  throw new Error("unterminated JSX tag");
}

/**
 * The full text of `<div className={styles.ccStickyHeader}> ... </div>`,
 * matched by a depth walk over `<div` / `</div>` that skips self-closing divs.
 */
function stickyHeaderBlock(text: string): string {
  const marker = "<div className={styles.ccStickyHeader}>";
  const start = text.indexOf(marker);
  if (start === -1) throw new Error("sticky header not found");
  let depth = 1;
  let idx = start + marker.length;
  while (depth > 0) {
    const open = text.indexOf("<div", idx);
    const close = text.indexOf("</div>", idx);
    if (close === -1) throw new Error("unbalanced sticky header block");
    if (open !== -1 && open < close) {
      const { end, selfClosing } = tagEnd(text, open);
      if (!selfClosing) depth += 1;
      idx = end + 1;
      continue;
    }
    depth -= 1;
    idx = close + "</div>".length;
  }
  return text.slice(start, idx);
}

/** Source with comments stripped, so a name mentioned in prose is never
 * mistaken for a declared prop, a bound one, or a rendered component. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Names declared by `export interface <name> { ... }`. */
function declaredProps(text: string, interfaceName: string): string[] {
  const stripped = stripComments(text);
  const marker = `export interface ${interfaceName} {`;
  const start = stripped.indexOf(marker);
  if (start === -1) throw new Error(`interface ${interfaceName} not found`);
  let depth = 1;
  let idx = start + marker.length;
  while (idx < stripped.length && depth > 0) {
    if (stripped[idx] === "{") depth += 1;
    else if (stripped[idx] === "}") depth -= 1;
    idx += 1;
  }
  const body = stripped.slice(start + marker.length, idx - 1);
  return [...body.matchAll(/^[ \t]*(?:readonly[ \t]+)?([A-Za-z_$][\w$]*)\??[ \t]*:/gm)].map((m) => m[1]);
}

/** Every `{expression}` and every quoted string in a JSX tag, replaced by a
 * single `@`, so what remains is the tag's own prop skeleton. Without this a
 * boolean shorthand (`posting`) or a string binding (`label="x"`) is invisible
 * to a `name={` regex, and the guard silently under-reports what is bound. */
function maskExpressions(tag: string): string {
  let out = "";
  let i = 0;
  while (i < tag.length) {
    const ch = tag[i];
    if (ch === "{") {
      let depth = 1;
      let j = i + 1;
      let quote: string | null = null;
      while (j < tag.length && depth > 0) {
        const c = tag[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'" || c === "`") quote = c;
        else if (c === "{") depth += 1;
        else if (c === "}") depth -= 1;
        j += 1;
      }
      out += "@";
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < tag.length && tag[j] !== ch) j += 1;
      out += "@";
      i = j + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Prop names bound at the first `<Component ...>` render site, plus whether
 * that site spreads an object (which would make the binding unverifiable from
 * text - this repo passes every prop by name deliberately). */
function boundProps(text: string, component: string): { names: string[]; hasSpread: boolean } {
  const stripped = stripComments(text);
  const start = stripped.indexOf(`<${component}`);
  if (start === -1) throw new Error(`${component} is never rendered`);
  const { end } = tagEnd(stripped, start);
  const tag = stripped.slice(start + component.length + 1, end);
  const hasSpread = /\{\s*\.\.\./.test(tag);
  const masked = maskExpressions(tag);
  const names = [...masked.matchAll(/([A-Za-z_$][\w$]*)\s*=\s*@/g)].map((m) => m[1]);
  const residue = masked.replace(/([A-Za-z_$][\w$]*)\s*=\s*@/g, " ");
  const shorthand = [...residue.matchAll(/[A-Za-z_$][\w$]*/g)].map((m) => m[0]);
  return { names: [...names, ...shorthand], hasSpread };
}

/** The expression bound to `prop` at a render site (`preview={X}` -> "X"). */
function boundExpression(text: string, component: string, prop: string): string {
  const stripped = stripComments(text);
  const start = stripped.indexOf(`<${component}`);
  if (start === -1) throw new Error(`${component} is never rendered`);
  const { end } = tagEnd(stripped, start);
  const tag = stripped.slice(start, end);
  const match = tag.match(new RegExp(`\\b${prop}\\s*=\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`${prop} is not bound at the ${component} render site`);
  return match[1].trim();
}

/** Component names rendered inside `block`, resolved to the files that define
 * them. Anything that resolves to no file in this app (MUI and friends) is
 * dropped. */
function resolveRenderedComponents(block: string): { name: string; path: string }[] {
  const names = [...new Set([...stripComments(block).matchAll(/<([A-Z][\w]*)/g)].map((m) => m[1]))];
  const found: { name: string; path: string }[] = [];
  for (const name of names) {
    for (const dir of COMPONENT_DIRS) {
      const candidate = join(process.cwd(), dir, `${name}.tsx`);
      if (existsSync(candidate)) {
        found.push({ name, path: candidate });
        break;
      }
    }
  }
  return found;
}

describe("the sticky-header block checker (canaries first)", () => {
  it("reports a component nested inside the header as inside, and a sibling as outside", () => {
    const nested = [
      "<div className={styles.ccStickyHeader}>",
      "  <div className={styles.ccHeaderBody}>",
      "    <GeneratedPreviewModal preview={p} />",
      "  </div>",
      "</div>",
      "<OtherThing />",
    ].join("\n");
    expect(stickyHeaderBlock(nested)).toContain("GeneratedPreviewModal");

    const sibling = [
      "<div className={styles.ccStickyHeader}>",
      "  <div className={styles.ccHeaderBody}>",
      "    <GenerateFromSelectionSection onGenerate={g} />",
      "  </div>",
      "</div>",
      "{preview && <GeneratedPreviewModal preview={p} />}",
    ].join("\n");
    expect(stickyHeaderBlock(sibling)).not.toContain("GeneratedPreviewModal");
    expect(stickyHeaderBlock(sibling)).toContain("GenerateFromSelectionSection");
  });

  it("is not fooled by a self-closing div or by a `>` inside a prop expression", () => {
    const withSelfClosing = [
      "<div className={styles.ccStickyHeader}>",
      "  <div className={styles.ccHeaderResize} onDoubleClick={() => reset(null)} />",
      "</div>",
      "<GeneratedPreviewModal preview={p} />",
    ].join("\n");
    // A naive `<div`/`</div>` count treats the self-closing resize handle as an
    // opener, swallows the real closer, and drags the sibling modal into the
    // block - which would make the guard below pass for the wrong reason.
    expect(stickyHeaderBlock(withSelfClosing)).not.toContain("GeneratedPreviewModal");
  });

  it("resolves the header's real children to files, and drops what this app does not define", () => {
    const block = [
      "<div className={styles.ccStickyHeader}>",
      "  <ModulesHeaderBar reload={r} />",
      "  <Button size=\"small\">Clear</Button>",
      "</div>",
    ].join("\n");
    const resolved = resolveRenderedComponents(block).map((c) => c.name);
    expect(resolved).toContain("ModulesHeaderBar");
    expect(resolved).not.toContain("Button");
  });
});

describe("the prop checkers (canaries first)", () => {
  it("reads declared names and ignores prose that looks like a declaration", () => {
    const withComment = [
      "export interface GeneratedPreviewModalProps {",
      "  /**",
      "   * onGhost: boolean;",
      "   */",
      "  preview: GenerationPreviewState;",
      "  posting?: boolean;",
      "}",
    ].join("\n");
    // Proven to matter: without stripComments this returns ["onGhost", ...].
    expect(declaredProps(withComment, "GeneratedPreviewModalProps")).toEqual(["preview", "posting"]);
  });

  it("sees braced, string and shorthand bindings, and notices a spread", () => {
    const site = '<GeneratedPreviewModal preview={p} label="x" posting onClose={() => c({a: 1})} />';
    const read = boundProps(site, "GeneratedPreviewModal");
    expect(read.names.sort()).toEqual(["label", "onClose", "posting", "preview"]);
    expect(read.hasSpread).toBe(false);
    expect(boundProps("<GeneratedPreviewModal {...props} />", "GeneratedPreviewModal").hasSpread).toBe(true);
  });

  it("catches a prop that was declared and then dropped at the render site", () => {
    const iface = [
      "export interface GeneratedPreviewModalProps {",
      "  preview: GenerationPreviewState;",
      "  posting?: boolean;",
      "}",
    ].join("\n");
    const dropped = "{p && <GeneratedPreviewModal preview={p} />}";
    const declared = declaredProps(iface, "GeneratedPreviewModalProps");
    const bound = boundProps(dropped, "GeneratedPreviewModal").names;
    expect(declared.filter((n) => !bound.includes(n))).toEqual(["posting"]);
  });

  it("catches a capability deleted from the interface AND the render site at once", () => {
    // The sabotage an earlier draft of this guard got past: refine removed from
    // both sides leaves "every declared prop is bound" perfectly green.
    const iface = [
      "export interface GeneratedPreviewModalProps {",
      "  preview: GenerationPreviewState;",
      "  onClose: () => void;",
      "  onSelectVersion: (v: number) => void;",
      "  downloadFormats?: readonly string[];",
      "  onPost?: () => void;",
      "}",
    ].join("\n");
    const declared = declaredProps(iface, "GeneratedPreviewModalProps");
    const missing = CAPABILITIES.filter((c) => !declared.some((n) => c.pattern.test(n))).map((c) => c.what);
    expect(missing).toEqual(["the refine instructions box", "running a refine"]);
  });

  it("reads the expression a render site gates on", () => {
    const site = "{lmsGeneration.preview && <GeneratedPreviewModal preview={lmsGeneration.preview} />}";
    expect(boundExpression(site, "GeneratedPreviewModal", "preview")).toBe("lmsGeneration.preview");
  });
});

describe("AC1 - the preview modal renders outside the sticky header", () => {
  it("ships a GeneratedPreviewModal component that owns the backdrop", () => {
    expect(existsSync(MODAL_PATH)).toBe(true);
    const modalSource = readFileSync(MODAL_PATH, "utf8");
    expect(modalSource).toContain("styles.previewBackdrop");
    expect(modalSource).toContain("styles.previewModal");
  });

  it("renders it from ModulesView, outside the ccStickyHeader subtree", () => {
    const header = stickyHeaderBlock(modulesViewSource);
    expect(modulesViewSource).toContain("<GeneratedPreviewModal");
    expect(header).not.toContain("GeneratedPreviewModal");
  });

  it("gates that render site on the same state it hands the modal", () => {
    const stripped = stripComments(modulesViewSource);
    const gate = boundExpression(modulesViewSource, "GeneratedPreviewModal", "preview");
    const before = stripped.slice(Math.max(0, stripped.indexOf("<GeneratedPreviewModal") - 200));
    const preamble = before.slice(0, before.indexOf("<GeneratedPreviewModal"));
    // Accepts `X &&`, `X !== null &&`, `Boolean(X) &&` and `X ? ` alike; rejects
    // an unconditional render, and rejects a gate on some unrelated value.
    expect(preamble).toContain(gate);
    expect(preamble).toMatch(/(&&|\?)\s*\(?\s*$/);
  });

  it("leaves no full-viewport overlay in any component the header actually renders", () => {
    const children = resolveRenderedComponents(stickyHeaderBlock(modulesViewSource));
    // Derived from the header block itself, so a component added to the header
    // later is policed automatically. Vacuous if nothing resolved.
    expect(children.length).toBeGreaterThanOrEqual(4);
    for (const child of children) {
      expect(stripComments(readFileSync(child.path, "utf8")), `${child.name} renders a fixed overlay inside the sticky header`).not.toContain(
        "styles.previewBackdrop",
      );
    }
  });
});

describe("AC3 - no capability was dropped on the way out of the header", () => {
  it("still offers every capability the modal had before the move", () => {
    const modalSource = readFileSync(MODAL_PATH, "utf8");
    const declared = declaredProps(modalSource, "GeneratedPreviewModalProps");
    const bound = boundProps(modulesViewSource, "GeneratedPreviewModal");
    expect(CAPABILITIES.filter((c) => !declared.some((n) => c.pattern.test(n))).map((c) => c.what)).toEqual([]);
    expect(CAPABILITIES.filter((c) => !bound.names.some((n) => c.pattern.test(n))).map((c) => c.what)).toEqual([]);
  });

  it("binds every prop the modal declares, by name", () => {
    const modalSource = readFileSync(MODAL_PATH, "utf8");
    const bound = boundProps(modulesViewSource, "GeneratedPreviewModal");
    expect(bound.hasSpread, "props are passed by name here, so a dropped one is visible").toBe(false);
    const declared = declaredProps(modalSource, "GeneratedPreviewModalProps");
    expect(declared.filter((n) => !bound.names.includes(n))).toEqual([]);
  });
});

describe("AC4 - the Generate controls stay in the bulk bar", () => {
  it("still renders the section inside the sticky header", () => {
    expect(stickyHeaderBlock(modulesViewSource)).toContain("<GenerateFromSelectionSection");
  });

  it("still renders one control per kind and the deck template picker", () => {
    // The mapping, not the handler's spelling: deleting either control removes
    // its map and fails here, while extracting a handler does not.
    expect(sectionSource).toMatch(/kinds\.map\(/);
    expect(sectionSource).toMatch(/templates\.map\(/);
  });
});

describe("AC6 / AC8 - no new machinery, and the stacking comment tells the truth", () => {
  it("introduces no portal", () => {
    expect(readFileSync(MODAL_PATH, "utf8")).not.toContain("createPortal");
  });

  it("reuses existing page.module.css classes only", () => {
    const used = [...new Set([...readFileSync(MODAL_PATH, "utf8").matchAll(/styles\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))];
    expect(used.length).toBeGreaterThanOrEqual(4);
    for (const cls of used) {
      expect(pageCss, `.${cls} is a new class; this fix adds none`).toMatch(new RegExp(`\\.${cls}\\b`));
    }
  });

  it("no longer claims the top bar is z-index 9999", () => {
    // It is 50. The 9999 in the app belongs to AiChatFab's floating button,
    // which is the element .previewBackdrop's 10000 actually has to beat.
    expect(pageCss).not.toContain("top bar is z-index 9999");
  });
});
