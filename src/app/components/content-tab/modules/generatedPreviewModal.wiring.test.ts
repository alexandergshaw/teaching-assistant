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
// The "Post to Canvas" footer, extracted out of GeneratedPreviewModal.tsx
// into its own component (GeneratedPostSection.tsx) as a pure structural
// move - see that file's own header comment. GeneratedPreviewModalProps
// itself was NOT touched by the move (still declares every post-related
// prop, still bound at the ModulesView render site by the checks above), so
// only the five assertions below that pin the MOVED JSX/comment text now
// read POST_SECTION_PATH; everything else in this file keeps reading
// MODAL_PATH.
const POST_SECTION_PATH = join(process.cwd(), "src/app/components/content-tab/modules/GeneratedPostSection.tsx");
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
  // X1 (chunk 3e, docs/generated-artifact-editing-acceptance-criteria.md):
  // /edit/i does not collide with any of the seven prop-name shapes above -
  // none of "preview"/"close"/"version"/"instruction"/"refin"/"download"/
  // "post" contains "edit" - and every one of the three new props
  // (canEditText, onSaveEdit, savingEdit) does, so this cannot be satisfied
  // by accident.
  { what: "editing the version's text", pattern: /edit/i },
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
 *
 * COMMENTS ARE STRIPPED FIRST, and that is load-bearing rather than tidy.
 * `tagEnd` below treats `'` as a string delimiter and knows nothing about
 * comments, so a `//` comment containing an apostrophe placed inside any JSX
 * tag in this subtree used to corrupt the walk: one apostrophe throws
 * "unterminated JSX tag" (loud, survivable), but a SECOND one closes the
 * phantom string and silently truncates the block instead - at which point
 * every `not.toContain` assertion below passes for the wrong reason. A guard
 * that can pass vacuously because of an apostrophe in a comment is not a
 * guard. Wave R2 hit exactly this and worked around it by hoisting two
 * comments out of their tags; the constraint was written down nowhere, so the
 * next person would have hit it again.
 */
function stickyHeaderBlock(rawText: string): string {
  const text = stripComments(rawText);
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
    // The fixture also declares no "edit"-shaped prop, so it now surfaces as
    // missing too (X1's own eighth capability) - the fixture is deliberately
    // NOT updated to include one, since the point of this canary is that the
    // checker reports every capability absent from a stale interface, not
    // only the two chunk 3b happened to remove.
    expect(missing).toEqual(["the refine instructions box", "running a refine", "editing the version's text"]);
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
    // The real intent is a full-viewport surface rendered outside the sticky
    // header, not these two literal class names - ModalShell (src/app/
    // components/ui/ModalShell.tsx) renders exactly `styles.previewBackdrop`
    // wrapping `styles.previewModal` itself, so a modal that adopts it still
    // satisfies the contract these assertions exist to police, without
    // referencing either class directly in its own source.
    const adoptsModalShell = /<ModalShell\b/.test(modalSource);
    expect(modalSource.includes("styles.previewBackdrop") || adoptsModalShell).toBe(true);
    expect(modalSource.includes("styles.previewModal") || adoptsModalShell).toBe(true);
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

  // Props DELIBERATELY declared but not yet bound at the render site, each
  // naming the wave that will bind them. Wave R1 of the focus-restoration
  // project (docs/modal-focus-restoration-acceptance-criteria.md) was purely
  // additive plumbing: every dialog gained these two props and forwarded
  // them to ModalShell, but no OPENER was wired until R2, because the
  // opener for this modal lives in the bulk bar and can unmount while the
  // dialog is open - which was a design question, not a mechanical edit.
  //
  // R2 (Modules view opener wiring) bound both props at this modal's render
  // site - GenerateFromSelectionSection's kind buttons now capture
  // `event.currentTarget` synchronously and ModulesView threads it through
  // as `restoreFocusRef`, with the sticky header as `fallbackFocusRefs` (the
  // bulk bar this modal opens from unmounts the moment the selection
  // clears). This list is NOT a way to silence the check - it is asserted in
  // BOTH directions below, so a bound entry left here would fail just as
  // loudly as an unbound prop that nobody declared an exception for. It
  // reaches empty at R2, and stays empty unless a future prop needs the same
  // deferral.
  const PENDING_BINDING: readonly { prop: string; wave: string }[] = [];

  it("binds every prop the modal declares, by name", () => {
    const modalSource = readFileSync(MODAL_PATH, "utf8");
    const bound = boundProps(modulesViewSource, "GeneratedPreviewModal");
    expect(bound.hasSpread, "props are passed by name here, so a dropped one is visible").toBe(false);
    const declared = declaredProps(modalSource, "GeneratedPreviewModalProps");
    const pending = new Set(PENDING_BINDING.map((entry) => entry.prop));
    const unbound = declared.filter((n) => !bound.names.includes(n) && !pending.has(n));
    expect(unbound, "declared but never bound, and not on PENDING_BINDING").toEqual([]);
  });

  it("keeps PENDING_BINDING honest in both directions", () => {
    const modalSource = readFileSync(MODAL_PATH, "utf8");
    const bound = boundProps(modulesViewSource, "GeneratedPreviewModal");
    const declared = declaredProps(modalSource, "GeneratedPreviewModalProps");

    // A pending prop that IS now bound means the wave landed and the entry is
    // stale - remove it, or the list quietly becomes permanent.
    const alreadyBound = PENDING_BINDING.filter((entry) => bound.names.includes(entry.prop));
    expect(alreadyBound.map((e) => e.prop), "now bound - drop it from PENDING_BINDING").toEqual([]);

    // A pending prop the modal no longer declares is equally stale.
    const notDeclared = PENDING_BINDING.filter((entry) => !declared.includes(entry.prop));
    expect(notDeclared.map((e) => e.prop), "no longer declared - drop it from PENDING_BINDING").toEqual([]);

    // Every entry has to name the wave that will finish it, so the list
    // stays actionable rather than becoming a graveyard.
    for (const entry of PENDING_BINDING) {
      expect(entry.wave.trim().length, `${entry.prop} needs a wave`).toBeGreaterThan(0);
    }
  });
});

describe("AC4 - the Generate controls stay in the bulk bar", () => {
  it("still renders the section inside the sticky header", () => {
    expect(stickyHeaderBlock(modulesViewSource)).toContain("<GenerateFromSelectionSection");
  });

  it("still renders one control per kind, the deck template picker and the video length picker", () => {
    // The mapping, not the handler's spelling: deleting any of these three
    // controls removes its map and fails here, while extracting a handler
    // does not. scriptLengthOptions.map( is the missing assertion finding 6
    // (docs/module-intro-video-script-acceptance-criteria.md, M18) calls
    // out - entry 267 check 6 records this exact prop path shipping switched
    // off once already, with nothing here to catch it.
    expect(sectionSource).toMatch(/kinds\.map\(/);
    expect(sectionSource).toMatch(/templates\.map\(/);
    expect(sectionSource).toMatch(/scriptLengthOptions\.map\(/);
  });
});

describe("AC6 / AC8 - no new machinery, and the stacking comment tells the truth", () => {
  it("introduces no portal", () => {
    expect(readFileSync(MODAL_PATH, "utf8")).not.toContain("createPortal");
  });

  // SWITCHING VERSION IS A WORK-LOSS PATH, NOT ONLY CLOSING IS. The modal
  // derives its editable text from `preview.selectedVersion`, and reseeds the
  // draft whenever that derived text changes (E9). So calling `onSelectVersion`
  // straight from the select's onChange would silently throw away an unsaved
  // edit - no dismissal involved, so the E10 discard guard never sees it. An
  // instructor comparing v2 against v1 mid-edit reaches this the ordinary way.
  //
  // Pinned as a FACT about the wiring, not about wording: the select must not
  // invoke the prop directly, and the component must own a guarded handler
  // that consults `dirty` before switching. Renaming that handler is fine;
  // deleting the guard is not.
  it("routes a version switch through the dirty guard, not straight to the prop", () => {
    const modalSource = stripComments(readFileSync(MODAL_PATH, "utf8"));

    expect(
      modalSource,
      "the version select must not call onSelectVersion directly - that bypasses the unsaved-edit guard"
    ).not.toMatch(/onChange=\{\s*\(e\)\s*=>\s*onSelectVersion\(/);

    const handlerMatch = modalSource.match(/const\s+(\w+)\s*=\s*\(\s*version:\s*number\s*\)\s*=>\s*\{/);
    expect(handlerMatch, "a guarded version-switch handler taking a version should exist").not.toBeNull();

    const handlerName = handlerMatch![1];
    // The handler's body: from its opening brace to the first line that
    // closes a top-level const arrow (two-space indent + "};"), which is this
    // file's own formatting throughout.
    const bodyStart = modalSource.indexOf(handlerMatch![0]) + handlerMatch![0].length;
    const bodyEnd = modalSource.indexOf("\n  };", bodyStart);
    expect(bodyEnd, `${handlerName} should have a terminated body`).toBeGreaterThan(bodyStart);
    const handlerBody = modalSource.slice(bodyStart, bodyEnd);
    expect(handlerBody, `${handlerName} should consult the dirty state before switching`).toContain("dirty");
    expect(handlerBody, `${handlerName} should arm the discard confirmation`).toContain("setDiscardConfirm(true)");
    expect(handlerBody, `${handlerName} should still be able to perform the switch`).toContain("onSelectVersion(");

    const selectOnChange = modalSource.match(/onChange=\{\(e\)\s*=>\s*(\w+)\(Number\(e\.target\.value\)\)\}/);
    expect(selectOnChange, "the version select should bind an onChange that parses the version").not.toBeNull();
    expect(selectOnChange![1], "the version select should call the guarded handler").toBe(handlerName);
  });

  it("reuses existing page.module.css classes only", () => {
    // Defect fix: used to read MODAL_PATH alone. GeneratedPostSection.tsx now
    // holds the "Post to Canvas" footer (styles.previewMeta/styles.fieldHint)
    // that used to live inline in GeneratedPreviewModal.tsx, so a guard that
    // only ever reads MODAL_PATH stopped covering the file that actually
    // carries that markup - nothing broken today (both classes are real),
    // but a future new class added only to GeneratedPostSection.tsx would
    // pass this check by never being seen at all.
    const modalUsed = [...new Set([...readFileSync(MODAL_PATH, "utf8").matchAll(/styles\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))];
    expect(modalUsed.length).toBeGreaterThanOrEqual(4);
    const postSectionUsed = [
      ...new Set([...readFileSync(POST_SECTION_PATH, "utf8").matchAll(/styles\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1])),
    ];
    expect(postSectionUsed.length).toBeGreaterThanOrEqual(1);
    for (const cls of [...modalUsed, ...postSectionUsed]) {
      expect(pageCss, `.${cls} is a new class; this fix adds none`).toMatch(new RegExp(`\\.${cls}\\b`));
    }
  });

  it("no longer claims the top bar is z-index 9999", () => {
    // It is 50. The 9999 in the app belongs to AiChatFab's floating button,
    // which is the element .previewBackdrop's 10000 actually has to beat.
    expect(pageCss).not.toContain("top bar is z-index 9999");
  });
});

// AC8 (docs/objectives-post-target-from-selection-acceptance-criteria.md):
// the modal says where the default post-target came from. `postTargetFromSelection`
// is declared on GeneratedPreviewModalProps and bound by name at the
// ModulesView render site the SAME WAY every other prop is - the generic
// "binds every prop the modal declares, by name" guard above (:442-450)
// already cross-checks declared props against bound ones with no per-prop
// exception list, so it covers this prop automatically; it is NOT duplicated
// here. What follows pins the three things that guard cannot see: the hint's
// render condition, its text, and its JSX position - located by structural
// anchors (marker strings and their indices), never by asserting a whole
// source line, so a reworded neighbouring comment cannot redden this suite.
describe("AC8 - the modal says where the default came from", () => {
  it("declares postTargetFromSelection on the props interface", () => {
    const modalSource = readFileSync(MODAL_PATH, "utf8");
    const declared = declaredProps(modalSource, "GeneratedPreviewModalProps");
    expect(declared).toContain("postTargetFromSelection");
  });

  it("renders the hint only when both postTargetFromSelection and a non-empty postModuleChoice hold", () => {
    // Pins the two names and the empty-string comparison, not the exact
    // spacing or quote style - AC8.4's condition, restated structurally.
    // This condition lives in GeneratedPostSection.tsx now (the moved
    // "Post to Canvas" footer) - see POST_SECTION_PATH's own comment above.
    const sectionSource = stripComments(readFileSync(POST_SECTION_PATH, "utf8"));
    expect(sectionSource).toMatch(/postTargetFromSelection\s*&&\s*postModuleChoice\s*!==\s*(["'])\1/);
  });

  it("renders the hint text exactly once, with its full stop", () => {
    // Comments stripped FIRST - the same posture every other guard in this
    // file takes. Counting against raw source would redden the moment any
    // comment quoted the hint's own wording, which is exactly what the
    // comment beside the hint now does when it explains its render gate.
    const sectionSource = stripComments(readFileSync(POST_SECTION_PATH, "utf8"));
    const occurrences = [...sectionSource.matchAll(/From your selection\./g)];
    expect(occurrences.length).toBe(1);
  });

  it("gates the hint on the seeded value still being one of postModuleOptions", () => {
    // The seeded value is decided when generation STARTS; the options come
    // from the LIVE `modules` tree, which useInlineModuleEdits and
    // useDragReorder keep rewriting underneath an open preview. If the seeded
    // module disappears, MUI renders the select BLANK (its out-of-range
    // warning is dev-only), and without this third clause the hint would sit
    // beside an empty box claiming it came from the selection. Presentational
    // only: nothing here changes what gets posted.
    const sectionSource = stripComments(readFileSync(POST_SECTION_PATH, "utf8"));
    const hintIdx = sectionSource.indexOf("From your selection.");
    expect(hintIdx, "hint text not found").toBeGreaterThan(-1);
    // The gate must sit in the hint's OWN condition, not merely somewhere in
    // the file - so it is located in the text immediately preceding the hint.
    const condition = sectionSource.slice(Math.max(0, hintIdx - 400), hintIdx);
    expect(condition).toMatch(/postModuleOptions\s*\.\s*some\s*\(/);
    expect(condition).toMatch(/postModuleChoice/);
  });

  it("renders the hint as a plain styles.previewMeta span, not styles.fieldHint (AC8.2)", () => {
    const sectionSource = stripComments(readFileSync(POST_SECTION_PATH, "utf8"));
    const hintIdx = sectionSource.indexOf("From your selection.");
    expect(hintIdx).toBeGreaterThan(-1);
    // The className nearest before the hint text - the element the hint's
    // own text sits in, not just some className appearing anywhere earlier.
    const before = sectionSource.slice(Math.max(0, hintIdx - 200), hintIdx);
    expect(before).toMatch(/className=\{styles\.previewMeta\}/);
    expect(before).not.toMatch(/className=\{styles\.fieldHint\}/);
  });

  it("positions the hint inside the postNeedsModuleTarget fragment, not outside it (AC8.3/AC9)", () => {
    // Structural anchors: the `postNeedsModuleTarget && (` gate, the `<>`
    // that opens its fragment, and the `</>` that closes it. The hint's own
    // index must fall strictly between the fragment's open and close, which
    // is what keeps it off announcements (postNeedsModuleTarget false) and
    // off generation-only kinds (offersPost false, so this whole subtree
    // never renders) per AC9.
    const sectionSource = stripComments(readFileSync(POST_SECTION_PATH, "utf8"));
    const fragmentGate = "postNeedsModuleTarget && (";
    const fragmentStart = sectionSource.indexOf(fragmentGate);
    expect(fragmentStart, "postNeedsModuleTarget && ( gate not found").toBeGreaterThan(-1);
    const fragOpen = sectionSource.indexOf("<>", fragmentStart);
    expect(fragOpen, "fragment open <> not found after the gate").toBeGreaterThan(-1);
    const fragClose = sectionSource.indexOf("</>", fragOpen);
    expect(fragClose, "fragment close </> not found after the open").toBeGreaterThan(-1);

    const hintIdx = sectionSource.indexOf("From your selection.");
    expect(hintIdx, "hint text not found").toBeGreaterThan(-1);
    expect(hintIdx, "hint sits before the fragment opens").toBeGreaterThan(fragOpen);
    expect(hintIdx, "hint sits after the fragment closes").toBeLessThan(fragClose);
  });
});

// docs/announcement-preview-edit-before-post-acceptance-criteria.md adds two
// capabilities - the Subject field (AC A) and the post confirm step (AC C) -
// with ZERO new props on GeneratedPreviewModalProps (the subject is local
// modal state; both new predicates are read from `preview.kindId` through
// kinds.ts). The generic CAPABILITIES deletion-guard above therefore cannot
// see either one (AC 22) - the same situation the teleprompter chunk hit,
// solved there with its own dedicated wiring test file. The reseed/dirty
// widening and the arm-signature collision proof are pinned as REAL,
// callable unit tests in generatedPreviewDrafts.test.ts and
// postConfirmArming.test.ts (AC F21) - those two modules are where the
// actual logic lives. What follows pins the two things a pure-module test
// cannot see at all: that this file reads the two new predicates
// declaratively rather than hardcoding a kind id, and that the double-post
// guard (AC 12d) and the dismiss-time disarm (AC 13) are wired into the
// actual handlers in this component, not merely available as importable
// functions nobody calls correctly.
describe("AC A/C - the subject field and the post confirm read declarative kind flags, never a hardcoded id", () => {
  it("gates the Subject field on kindTitleIsContent, never a literal kind id comparison", () => {
    const modalSource = stripComments(readFileSync(MODAL_PATH, "utf8"));
    expect(modalSource).toContain("kindTitleIsContent(preview.kindId)");
    expect(modalSource).not.toMatch(/kindId\s*===\s*["']announcements["']/);
  });

  it("gates the post confirm step on kindPostsImmediately, never a literal kind id comparison", () => {
    const modalSource = stripComments(readFileSync(MODAL_PATH, "utf8"));
    expect(modalSource).toContain("kindPostsImmediately(preview.kindId)");
    // Defect fix: symmetry with the Subject-field check above, which pins
    // both halves (the declarative call AND the absence of the hardcoded
    // comparison it replaces). This check only had the positive half.
    expect(modalSource).not.toMatch(/kindId\s*===\s*["']announcements["']/);
  });

  it("falls the header title back to kindLabel when the subject field is offered (AC1b)", () => {
    // Pins the FACT (headerTitle's first branch is `offersSubject`, and it
    // resolves to `preview.kindLabel`), not the exact surrounding
    // punctuation - a reformat of the ternary is fine, reverting to always
    // preferring the saved artifact's own title is not.
    const modalSource = stripComments(readFileSync(MODAL_PATH, "utf8"));
    expect(modalSource).toMatch(/const\s+headerTitle\s*=\s*offersSubject\s*\?\s*preview\.kindLabel/);
  });
});

describe("AC 12d/13 - the post confirmation is explicitly disarmed, not left for the signature to invalidate", () => {
  it("disarms before committing a post, never after (the double-post guard)", () => {
    // Sabotage target: removing the explicit disarm from the commit branch
    // (leaving the signature model to "cover" a successful post, which AC
    // 12d's own reasoning explains it structurally cannot - a successful
    // write does not change the signature) must turn this test red.
    const modalSource = stripComments(readFileSync(MODAL_PATH, "utf8"));
    const match = modalSource.match(/const\s+handlePostAction\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n {2}\};/);
    expect(match, "a handlePostAction handler should exist").not.toBeNull();
    const body = match![1];
    const disarmIdx = body.lastIndexOf("setPostArmedFor(null)");
    const commitIdx = body.lastIndexOf("onPost?.()");
    expect(disarmIdx, "handlePostAction should disarm the confirmation somewhere in its commit branch").toBeGreaterThan(-1);
    expect(commitIdx, "handlePostAction should still call through to onPost").toBeGreaterThan(-1);
    expect(disarmIdx, "the disarm must happen BEFORE the commit call, not after (or a stray second click could still post twice)").toBeLessThan(
      commitIdx,
    );
  });

  // Defect fix: `mayPostCommit` (postConfirmArming.ts) used to be exported
  // and unit-tested with nothing in the shipped path ever calling it - a
  // tautological test that could not fail for any change to the real post
  // flow. It is now consulted in handlePostAction as a second, non-render-
  // level guard (see that handler's own comment for why). Pinned here as a
  // FACT about the wiring - the call must exist in the commit branch, before
  // the disarm - not as source text, so a rename of the surrounding code is
  // fine and only removing the guard reddens this.
  it("consults mayPostCommit as a second guard before committing a post (defect fix)", () => {
    const modalSource = stripComments(readFileSync(MODAL_PATH, "utf8"));
    const match = modalSource.match(/const\s+handlePostAction\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n {2}\};/);
    expect(match, "a handlePostAction handler should exist").not.toBeNull();
    const body = match![1];
    const guardIdx = body.indexOf("mayPostCommit(");
    const disarmIdx = body.lastIndexOf("setPostArmedFor(null)");
    expect(guardIdx, "handlePostAction should call mayPostCommit before committing").toBeGreaterThan(-1);
    expect(guardIdx, "the mayPostCommit guard must run before the disarm/commit, not after").toBeLessThan(disarmIdx);
    expect(modalSource, "mayPostCommit must actually be imported from postConfirmArming").toMatch(
      /import\s*\{[^}]*\bmayPostCommit\b[^}]*\}\s*from\s*["']\.\/postConfirmArming["']/,
    );
  });

  it("disarms on every dismissal attempt, after the teleprompter rung (AC13)", () => {
    // Mirrors teleprompter.wiring.test.ts's own ordering check on the same
    // handler (that file pins teleprompterOpen before onClosePreview()) -
    // this pins the post-confirm disarm as a THIRD rung, still after
    // teleprompter, so Escape/backdrop/header Close all disarm the post
    // confirmation even on a dismissal that only arms the discard-changes
    // panel below (dirty, first attempt) rather than closing the modal.
    const modalSource = stripComments(readFileSync(MODAL_PATH, "utf8"));
    const match = modalSource.match(/const\s+handleDismiss\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n {2}\};/);
    expect(match, "a handleDismiss handler should exist").not.toBeNull();
    const body = match![1];
    const teleprompterIdx = body.indexOf("teleprompterOpen");
    const disarmIdx = body.indexOf("setPostArmedFor(null)");
    expect(teleprompterIdx, "handleDismiss should still check teleprompterOpen first").toBeGreaterThanOrEqual(0);
    expect(disarmIdx, "handleDismiss should disarm the post confirmation").toBeGreaterThan(-1);
    expect(teleprompterIdx, "the teleprompter rung must come before the post-confirm disarm").toBeLessThan(disarmIdx);
  });
});

// Defect fix (adversarial verification of the AC A/C wave above): the two
// describes above pin that this component reads the two new predicates
// declaratively, and that the handlers wired to them behave correctly - but
// nothing anywhere actually asserted the NEW MARKUP those predicates gate
// exists at all. Before this, deleting the whole Subject TextField block
// (MODAL_PATH) or the whole confirm panel (POST_SECTION_PATH) left every
// test in this file, generatedPreviewDrafts.test.ts and
// postConfirmArming.test.ts green, because those only ever exercised the
// PURE predicates and handlers, never the render output. REGRESSION 312
// check 12 names exactly this failure mode. Every assertion below is
// anchored on a structural marker (a gate string, a prop binding) rather
// than a literal sentence, per this repo's own "source-text tests
// over-specify" note - and each one was proven to redden by actually
// deleting the markup it covers, then restoring it (see the wave A report).
describe("AC A/C defect fix - the new markup itself is asserted, not only the predicates that gate it", () => {
  it("renders a live Subject TextField, gated on offersSubject, bound to subjectDraft", () => {
    const modalSource = stripComments(readFileSync(MODAL_PATH, "utf8"));
    const gateIdx = modalSource.indexOf("offersSubject && (");
    expect(gateIdx, "the offersSubject && ( gate is missing - the Subject field block was deleted").toBeGreaterThan(-1);
    const fieldStart = modalSource.indexOf("<TextField", gateIdx);
    expect(fieldStart, "no TextField renders inside the offersSubject block").toBeGreaterThan(-1);
    const { end } = tagEnd(modalSource, fieldStart);
    const tag = modalSource.slice(fieldStart, end + 1);
    expect(tag, "the Subject field should carry its label").toMatch(/label="Subject"/);
    expect(tag, "the Subject field should be bound to subjectDraft, not currentTitle or draft").toMatch(/value=\{subjectDraft\}/);
    expect(tag, "the Subject field's onChange should update subjectDraft").toMatch(/onChange=\{[\s\S]*setSubjectDraft/);
  });

  it("renders the post confirm panel's consequence paragraph, quoting confirmSubjectText and confirmBodyText", () => {
    const sectionSource = stripComments(readFileSync(POST_SECTION_PATH, "utf8"));
    const consequenceIdx = sectionSource.indexOf("Posting publishes this announcement");
    expect(consequenceIdx, "the confirm panel's consequence paragraph is missing - the panel was deleted").toBeGreaterThan(-1);
    const before = sectionSource.slice(Math.max(0, consequenceIdx - 700), consequenceIdx);
    expect(before, "the consequence paragraph should be gated on showCancelConfirm").toMatch(/showCancelConfirm\s*&&/);
    const after = sectionSource.slice(consequenceIdx, consequenceIdx + 1200);
    expect(after, "the confirm panel should quote confirmSubjectText, the exact value that will post").toMatch(/\{confirmSubjectText\}/);
    expect(after, "the confirm panel should quote confirmBodyText, the exact value that will post").toMatch(/\{confirmBodyText\}/);
  });

  it("replaces the post button with a hint while postBlockedByDirtyEdit, rather than merely disabling it", () => {
    const sectionSource = stripComments(readFileSync(POST_SECTION_PATH, "utf8"));
    const hintIdx = sectionSource.indexOf("Save your edit first");
    expect(hintIdx, "the dirty-block hint text is missing").toBeGreaterThan(-1);
    const before = sectionSource.slice(Math.max(0, hintIdx - 200), hintIdx);
    expect(before, "the hint should be gated on postBlockedByDirtyEdit ?").toMatch(/postBlockedByDirtyEdit\s*\?/);
    // The button row (the ternary's other arm) still has to exist somewhere
    // after the hint, bound to onPostButtonClick - otherwise the "replaces"
    // half of this test would pass even if the not-blocked arm were deleted
    // outright, leaving no way to post at all once the editor is clean.
    const after = sectionSource.slice(hintIdx, hintIdx + 1200);
    expect(after, "a Post-to-Canvas button bound to onPostButtonClick should still exist in the other arm").toMatch(
      /onClick=\{onPostButtonClick\}/,
    );
  });
});
