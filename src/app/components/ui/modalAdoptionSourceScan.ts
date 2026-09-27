// TEST-ONLY INFRASTRUCTURE - never import this module from an application
// file. It imports `node:fs` (readdirSync/readFileSync) to walk and read
// `src/app` at test-run time (see walkFiles/classify below). If a component
// ever imported it, that would pull a node builtin into the client bundle and
// break the build the moment webpack tried to resolve `fs` for the browser -
// this module lives under `src/app` alongside the components it inspects, so
// nothing about its path alone stops that from happening by accident. The
// bundle guard in modalAdoption.wiring.test.ts ("modalAdoptionScan.ts /
// modalAdoptionSourceScan.ts bundle guard" describe block) covers this file
// by name alongside modalAdoptionScan.ts, walking src/app itself (via
// walkFiles, exported below) and failing the moment any non-test file
// imports either one.
//
// EXTRACTED FROM modalAdoptionScan.ts (that file passed 999/1000 lines, the
// strictly-greater ceiling's last line of headroom). The seam is real, not a
// line-count split: this file holds the GENERIC source-scanning primitives -
// the tree walk, the comment tokenizer, and the classification predicates -
// none of which know anything about modal-adoption POLICY (the four AC7/AC8
// site lists, or the hook-destructure attribute analysis). Proof this seam
// already existed in the code, not just in this comment: stripComments below
// is independently imported by useMessageReplies.wiring.test.ts and
// walkthrough-announcement.structure.test.ts, neither of which cares about
// modal adoption at all - it was already being used as general-purpose
// infrastructure through this module's re-export. modalAdoptionScan.ts keeps
// every policy list (PERMANENT_EXCLUSIONS, DEFERRED_CLASS_MISMATCH,
// PENDING_ADOPTION, PARTIALLY_ADOPTED, MECHANISM_PATH), the derived SITES/
// DIALOG_SITES/ADOPTING_PATHS collections (which need MECHANISM_PATH to
// filter ModalShell.tsx out), and the HOOK_DESTRUCTURE_SITES/
// analyzeHookOnlyAdopterSource attribute analysis (AC8/C4 hole 1) - and
// re-exports everything below unchanged, so no existing import of
// modalAdoptionScan.ts needed to change.
//
// See modalAdoptionScan.ts's own header comment for the full AC7/AC8
// contract (what a "dialog site" and "adopts" mean, and the four lists'
// reasoning) - this file's comments below cover only the primitives
// themselves.
import { readdirSync, readFileSync } from "fs";
import { join, relative, sep } from "path";

// ---------------------------------------------------------------------------
// The tree walk and the classification predicates. Every one of these is
// proven against inline fixtures in modalAdoption.wiring.test.ts's canary
// block (the discipline entry 239 check 10 records and
// generatedPreviewModal.wiring.test.ts already follows) before it is trusted
// against the real files.
// ---------------------------------------------------------------------------

export const APP_ROOT = join(process.cwd(), "src/app");

/** Generic recursive directory walk, filtered by a filename predicate. The
 * shared primitive behind walkTsxFiles below and behind the
 * modalAdoptionScan.ts/modalAdoptionSourceScan.ts bundle-guard test in
 * modalAdoption.wiring.test.ts (which needs `.ts` files too, not just `.tsx`,
 * since a component or a lib module could import either module from either
 * extension). */
export function walkFiles(dir: string, matches: (fileName: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, matches));
    } else if (entry.isFile() && matches(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every `.tsx` file under `src/app`, walked at test-run time - never a
 * static list. `.ts` files (useModalDismiss.ts itself, every `.wiring.test.ts`
 * file) are deliberately excluded: they are not components and cannot render
 * a dialog, and useModalDismiss.ts's own JSDoc contains the literal string
 * `role="dialog"` in prose (describing what its caller's container carries),
 * which would otherwise misclassify the hook file as a dialog site. */
export function walkTsxFiles(dir: string): string[] {
  return walkFiles(dir, (fileName) => fileName.endsWith(".tsx"));
}

/** Identifiers after which a following `/` starts a regex literal, not a
 * division operator - used by regexAllowedHere below. */
const REGEX_PRECEDING_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
  "yield", "throw", "case", "do", "else",
]);

/** True when a `/` at the current scan position starts a regex literal, not
 * division - the standard "operand expected" heuristic, judged from the code
 * already emitted (`outSoFar`): start of file, or a preceding operand-
 * introducing punctuation character, or a preceding keyword from
 * REGEX_PRECEDING_KEYWORDS (never a plain identifier/number) all allow a
 * regex; anything else (`)`, `]`, `}`, a closing quote) is treated as
 * division/ambiguous.
 *
 * JSX FIX: a `/` glued directly onto a preceding `<` with no whitespace
 * between them - i.e. `</` - is a JSX closing tag (`</legend>`), never a
 * regex opener, even though `<` is otherwise an operand-introducing
 * punctuation character (`a < /re/` is valid JS). Checked by requiring the
 * `<` to be the LAST character of `outSoFar`, not merely the last non-
 * whitespace one, so a real comparison like `a < /re/` (whitespace between
 * `<` and `/`) still allows a regex. Without this, `</legend>` immediately
 * followed by `//` swallows the comment marker's first `/` as the phantom
 * regex's own closing delimiter, leaving the comment unstripped.
 *
 * KNOWN LIMITATION: `)` and `}` are genuinely ambiguous in real JS
 * (`(a+b)/c` is division; `if (x) /re/.test(y)` is a regex) and resolving the
 * general case needs full expression-grammar context this scanner does not
 * carry. Both resolve to "division" here, matching every real occurrence in
 * this codebase today (verified by grep - no regex literal in src/app
 * immediately follows a bare `)`/`}`). Revisit if one is ever added. */
function regexAllowedHere(outSoFar: string): boolean {
  const lastIdx = outSoFar.length - 1;
  let j = lastIdx;
  while (j >= 0 && /\s/.test(outSoFar[j])) j--;
  if (j < 0) return true;
  const c = outSoFar[j];
  if (c === "<" && j === lastIdx) return false;
  if ("([{,;:=!&|?+-*%^~<>".includes(c)) return true;
  if (/[A-Za-z0-9_$]/.test(c)) {
    const wordMatch = /[A-Za-z_$][A-Za-z0-9_$]*$/.exec(outSoFar.slice(0, j + 1));
    return !!wordMatch && REGEX_PRECEDING_KEYWORDS.has(wordMatch[0]);
  }
  return false;
}

type ScanMode = "code" | "line-comment" | "block-comment" | "string-single" | "string-double" | "template";

interface ScanFrame {
  readonly mode: ScanMode;
  /** True only for the synthetic "code" frame opened by a template literal's
   * `${` - the frame a matching `}` pops back through to resume template
   * scanning, unlike a frame opened by an ordinary `{` in code. */
  readonly viaTemplateExpr: boolean;
}

/** Source with comments stripped by a character-scanning tokenizer, not a
 * regex pair (RULING 79): no line-wise regex can both remove a TRAILING `//`
 * comment and leave a `//` inside a string literal (a URL) alone - the old
 * anchored form here was blind to the former, the unanchored form used
 * elsewhere in this repo is blind to the latter, and the two defects are
 * mutually exclusive for any regex operating line-by-line. This tracks
 * whether the scan is inside a single/double-quoted string, a template
 * literal (including nested `${...}` substitutions, which resume ordinary
 * code scanning and can themselves contain new strings/templates/regexes/
 * comments), a regex literal (regexAllowedHere decides where one starts), a
 * line comment, or a block comment - and removes only real comments in the
 * last two. Escaped delimiters (`\'`, `\"`, `` \` ``, `\/`) copy through as
 * pairs. A line comment's own newline survives (matching the old regex's
 * `.*$`); a block comment is removed entirely, newlines included, also
 * matching the old regex.
 *
 * KNOWN LIMITATIONS: regexAllowedHere's `)`/`}` ambiguity (see its own
 * comment); an unterminated regex (`/` with no closing `/` before the next
 * newline) is scanned only to end of line with no recovery attempt - not a
 * real shape in this repo today. */
export function stripComments(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  const stack: ScanFrame[] = [{ mode: "code", viaTemplateExpr: false }];
  const push = (mode: ScanMode, viaTemplateExpr = false) => stack.push({ mode, viaTemplateExpr });

  while (i < n) {
    const mode = stack[stack.length - 1].mode;
    const ch = text[i];
    const next = i + 1 < n ? text[i + 1] : "";

    if (mode === "line-comment") {
      if (ch === "\n") { stack.pop(); out += ch; }
      i++;
      continue;
    }
    if (mode === "block-comment") {
      if (ch === "*" && next === "/") { stack.pop(); i += 2; } else i++;
      continue;
    }
    if (mode === "string-single" || mode === "string-double") {
      const quote = mode === "string-single" ? "'" : '"';
      if (ch === "\\") { out += ch + next; i += 2; continue; }
      out += ch;
      if (ch === quote) stack.pop();
      i++;
      continue;
    }
    if (mode === "template") {
      if (ch === "\\") { out += ch + next; i += 2; continue; }
      if (ch === "`") { stack.pop(); out += ch; i++; continue; }
      if (ch === "$" && next === "{") { out += "${"; push("code", true); i += 2; continue; }
      out += ch;
      i++;
      continue;
    }

    // mode === "code"
    if (ch === "/" && next === "/") { push("line-comment"); i += 2; continue; }
    if (ch === "/" && next === "*") { push("block-comment"); i += 2; continue; }
    if (ch === "'") { out += ch; push("string-single"); i++; continue; }
    if (ch === '"') { out += ch; push("string-double"); i++; continue; }
    if (ch === "`") { out += ch; push("template"); i++; continue; }
    if (ch === "/" && regexAllowedHere(out)) {
      out += ch;
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const rc = text[j];
        if (rc === "\n") break;
        if (rc === "\\" && j + 1 < n) { out += rc + text[j + 1]; j += 2; continue; }
        out += rc;
        if (rc === "[") inClass = true;
        else if (rc === "]") inClass = false;
        else if (rc === "/" && !inClass) { j++; break; }
        j++;
      }
      while (j < n && /[a-zA-Z]/.test(text[j])) { out += text[j]; j++; }
      i = j;
      continue;
    }
    if (ch === "{") { out += ch; push("code"); i++; continue; }
    if (ch === "}") {
      out += ch;
      if (stack.length > 1) stack.pop();
      i++;
      continue;
    }
    out += ch;
    i++;
  }

  return out;
}

/** True for either shape MUI's `Dialog` is imported in this codebase: a
 * default import from the `@mui/material/Dialog` subpath (TextbookPhotoModal,
 * RecommendTextbooksModal), or a named specifier inside a multi-line import
 * from the package root (FolderActionsMenu, TasksTab, ManageTasksDialog,
 * TaskAttachmentsDialog, CoursesTable). Checking specifiers by exact token
 * (split on `,`, trim, compare) rather than a loose `/\bDialog\b/` regex is
 * deliberate: `DialogTitle`/`DialogContent`/`DialogActions` all contain the
 * substring `Dialog` and are imported alongside it everywhere `Dialog` itself
 * is, so a substring test would never actually discriminate anything. */
export function importsMuiDialog(strippedSource: string): boolean {
  if (/import\s+Dialog\s+from\s+["']@mui\/material\/Dialog["']/.test(strippedSource)) return true;
  const namedImportBlocks = [...strippedSource.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']@mui\/material["']/g)];
  return namedImportBlocks.some((block) => block[1].split(",").map((s) => s.trim()).includes("Dialog"));
}

/** True when the file imports `ModalShell` from a path whose final segment is
 * exactly `ModalShell` - `../ui/ModalShell`, `./ui/ModalShell` match; a
 * hypothetical `../settings/useModalShellPrefs` (a different module that
 * merely shares a prefix) does not, because the regex requires the segment to
 * end at the closing quote. */
export function importsModalShellComponent(strippedSource: string): boolean {
  return /from\s+["'][^"']*\/ModalShell["']/.test(strippedSource);
}

/** True when the file imports `useModalDismiss` from a path whose final
 * segment is exactly `useModalDismiss` - same closing-quote discipline as
 * importsModalShellComponent above, and for the same reason. */
export function importsUseModalDismissHook(strippedSource: string): boolean {
  return /from\s+["'][^"']*\/useModalDismiss["']/.test(strippedSource);
}

/** True when the file imports `ModalShell` or `useModalDismiss` from a path
 * whose final segment is exactly that name. Kept as the OR of the two named
 * predicates above (not its own regex) so callers of the individual
 * predicates and this combined one can never drift apart on what "imports
 * the hook" or "imports the shell" means - they are built from the identical
 * checks, just combined differently. (HOOK_DESTRUCTURE_SITES, in
 * modalAdoptionScan.ts, is built from a different signal entirely -
 * hasHookDestructure, not this function - see that constant's own comment
 * for why "imports the hook" is not the same question as "hand-wires the
 * hook's ref onto an element".) */
export function adoptsSharedMechanism(strippedSource: string): boolean {
  return importsModalShellComponent(strippedSource) || importsUseModalDismissHook(strippedSource);
}

/** Finds the index of the `>` that closes the JSX opening tag starting at
 * `tagStart` (which must point at the tag's own `<`, e.g. `<div`), tracking
 * `{`/`}` depth so a `>` INSIDE a brace-delimited value is never mistaken for
 * the tag's own close. Not cosmetic: every C4 hook-only adopter's backdrop
 * and content elements carry an arrow-function attribute
 * (`onClick={() => onClose()}`), and a naive `indexOf(">", tagStart)` stops
 * at the `>` inside that `=>`, truncating the slice early. Proven against
 * that exact shape in modalAdoption.wiring.test.ts's canary block. Returns -1
 * if no depth-zero `>` is found. */
export function findOpeningTagEnd(source: string, tagStart: number): number {
  let depth = 0;
  for (let i = tagStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return i;
  }
  return -1;
}

/** Finds the start index of the JSX opening-tag token (`<TagName`) nearest at
 * or before `beforeIndex`, for WHATEVER tag name it is - the generalization
 * of `source.lastIndexOf("<div", beforeIndex)`, which this module used to
 * hardcode in two places (see findEnclosingOpeningTag's own comment for the
 * false negative that hardcoding produced on AccessibilityCenter.tsx, an
 * `<aside>`). Matches any `<Identifier` token, so it finds `<aside`,
 * `<section`, a component like `<Foo`, or a plain `<div` alike. Returns -1 if
 * no tag start exists before `beforeIndex`. */
export function lastTagStartBefore(source: string, beforeIndex: number): number {
  const tagStartPattern = /<[A-Za-z][\w.]*/g;
  let last = -1;
  let match: RegExpExecArray | null;
  while ((match = tagStartPattern.exec(source))) {
    if (match.index > beforeIndex) break;
    last = match.index;
  }
  return last;
}

/** Finds the opening tag - of WHATEVER tag name - that actually ENCLOSES
 * `index` (e.g. `index` pointing at a `ref={x}` occurrence inside that tag's
 * own attribute list returns that element's full opening tag). This is the
 * fix for a real defect the C5 implementer found: the old code assumed the
 * enclosing element was always `<div` and used
 * `source.lastIndexOf("<div", index)` to find it, which is correct only by
 * coincidence when every candidate element happens to be a div. C5's
 * AccessibilityCenter.tsx broke that coincidence - its content element is an
 * `<aside>`, preceded by a self-closing `<div ... aria-hidden="true" />`
 * backdrop - so `lastIndexOf("<div", ...)` walked PAST the enclosing
 * `<aside>` entirely and landed on the backdrop div instead, which carries
 * none of the five required attributes. That produced a false negative
 * (reporting a correctly-wired `<aside>` as missing ref/tabIndex/role/
 * aria-modal/aria-label) of the same kind as a hardcoded file list (entry
 * 272 check 5, docs/REGRESSION.md) - a hardcoded ASSUMPTION excluding the
 * exact site it was meant to check, just at the tag-name granularity instead
 * of the file-list granularity.
 *
 * The fix tries each preceding tag-start (via lastTagStartBefore above) from
 * nearest to farthest, and keeps the first one whose own close (via
 * findOpeningTagEnd) lands AT OR AFTER `index` - a tag that already closed
 * (its own `>` sits before `index`, as the backdrop's self-closing `/>`
 * does relative to the `<aside>`'s later `ref=`) cannot be the tag enclosing
 * `index`, so the search continues past it rather than accepting the
 * nearest candidate unconditionally the way a plain lastIndexOf does.
 * Returns null if no enclosing tag can be found. */
export function findEnclosingOpeningTag(source: string, index: number): { tagStart: number; tagEnd: number } | null {
  let searchBefore = index;
  while (true) {
    const tagStart = lastTagStartBefore(source, searchBefore);
    if (tagStart === -1) return null;
    const tagEnd = findOpeningTagEnd(source, tagStart);
    if (tagEnd !== -1 && tagEnd >= index) return { tagStart, tagEnd };
    // This candidate tag already closed before `index` (or never closes) -
    // it cannot be the enclosing tag. Keep searching strictly before it.
    searchBefore = tagStart - 1;
  }
}

/** Slices the whole opening tag of the nearest ENCLOSING tag at or before
 * `markerIndex` (e.g. `markerIndex` pointing at a `styles.previewModal`
 * class-marker occurrence returns that element's own opening tag), whatever
 * that tag's name is - see findEnclosingOpeningTag above for why this can no
 * longer assume `<div`. Returns null if no enclosing tag can be found. */
export function tagAt(source: string, markerIndex: number): string | null {
  const enclosing = findEnclosingOpeningTag(source, markerIndex);
  if (!enclosing) return null;
  return source.slice(enclosing.tagStart, enclosing.tagEnd + 1);
}

/** A DIALOG SITE per modalAdoptionScan.ts's header comment: the four raw-
 * markup/MUI markers AC8 names (`styles.previewBackdrop`, `role="dialog"`,
 * `role="alertdialog"`, MUI `Dialog`), OR adoption itself - the last clause
 * is what keeps an adopted file (which no longer carries the raw markers in
 * its own source) from disappearing out of the scan entirely. The
 * `alertdialog` marker exists because `KnowledgeTab.tsx:463` carries
 * `role="alertdialog"` on an inline warning banner - harmless today since
 * it is not an overlay (allowlisted in PERMANENT_EXCLUSIONS), but a real
 * alertdialog-shaped overlay modal would otherwise evade this scan entirely.
 * See modalAdoptionScan.ts's header comment for this marker set's known
 * blind spots (single-quoted `role` values, computed `role={expr}`). */
export function isDialogSite(strippedSource: string): boolean {
  return (
    strippedSource.includes("styles.previewBackdrop") ||
    strippedSource.includes('role="dialog"') ||
    strippedSource.includes('role="alertdialog"') ||
    importsMuiDialog(strippedSource) ||
    adoptsSharedMechanism(strippedSource)
  );
}

export function toRepoRelativePosix(absPath: string): string {
  return relative(process.cwd(), absPath).split(sep).join("/");
}

export interface SiteInfo {
  readonly path: string;
  readonly strippedSource: string;
  readonly adopts: boolean;
  readonly isDialogSite: boolean;
}

export function classify(absPath: string): SiteInfo {
  const stripped = stripComments(readFileSync(absPath, "utf8"));
  return {
    path: toRepoRelativePosix(absPath),
    strippedSource: stripped,
    adopts: adoptsSharedMechanism(stripped),
    isDialogSite: isDialogSite(stripped),
  };
}
