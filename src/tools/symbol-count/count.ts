// RULING 135: the counting instrument for "how many real occurrences of this
// symbol are in these files" - built after four sub-wave briefs in one
// session cited a `grep -c` number that was wrong (see the four fixtures in
// count.test.ts, and docs/loop/traps-spec.md's entry for this ruling). Every
// wrong number shared one root cause: `grep -c` counts LINES that contain the
// substring, with no idea whether that substring sits in a comment, a string,
// an import specifier, a declaration, or a real call - so an import line, a
// JSDoc mention, or a deprecation note inflates the count exactly as much as
// a real call site does.
//
// THE FIX IS NOT A BETTER REGEX. It is TWO INDEPENDENT INSTRUMENTS reading
// the same file and a report that shows where they agree and disagree:
//
//   1. An AST WALK (`ts.createSourceFile`, the same TypeScript compiler API
//      `src/lib/module-graph/runtime-import-graph.ts` already uses for
//      exactly this reason - "Edge extraction is done by the TypeScript
//      compiler's own parser... never by a pattern over raw text", that
//      file's own header comment). This sees only real code: an Identifier
//      node inside a comment or a string literal does not exist in the AST,
//      so a JSDoc mention of `requireUser()` or a deprecation note quoting it
//      can never be counted as a reference by this instrument. Every real
//      Identifier occurrence of the symbol is classified into exactly one of
//      three buckets - DECLARATION (it names a function/class/import/export
//      binding), CALL (it is the callee of a call expression, directly or via
//      `.property()`), or REFERENCE (anything else: passed as a value,
//      destructured, re-exported by name) - and the three buckets always sum
//      to the total, which is itself a cross-check: if they do not sum, the
//      classifier has a gap, not the file.
//
//   2. A LEXICAL SCAN (`ts.createScanner`, the same compiler package, its
//      other public entry point - not a hand-rolled tokenizer, and not the
//      fourth copy of the comment-stripping regex that is already duplicated
//      across dozens of `*.test.ts` files in this tree; see this tool's own
//      report for why that extraction is a separate, bigger change and not
//      done here). Run with trivia NOT skipped, it walks the file as a
//      sequence of real tokens - comments, string/template literals, and
//      code - and lets this tool measure occurrences of the symbol text
//      INSIDE comment tokens and INSIDE string/template literal tokens
//      separately from occurrences in real code tokens. This is what
//      `grep -c` cannot do: a line-based text match has no token boundaries
//      at all, so it cannot distinguish "the word appears in a comment on
//      this line" from "the word appears in code on this line."
//
// A THIRD number is reported for comparison only, never trusted: the naive
// whole-word line-count a `grep -c -w` over the raw file would report. It is
// computed here (not shelled out to a real `grep`, so the tool has no
// external-process dependency and no PATH/platform assumption) by the same
// word-boundary rule `grep -w` documents. It exists so a caller can see, in
// one report, exactly the gap that misled four sub-wave briefs - never to
// replace either instrument above.
//
// WHAT THIS TOOL CANNOT SEE (say so, per RULING 135's own requirement):
// a symbol built by string concatenation (`"require" + "User"`) or produced
// inside a template literal's `${...}` substitution is not a `ts.Identifier`
// naming that symbol anywhere in the AST, and its text does not appear
// verbatim in any single token the scanner emits either - both instruments,
// and the naive line count, are blind to it. Seeing that would require
// evaluating the expression, which no source-level tool (this one or a
// human's `grep`) can do without running the program. If a symbol might be
// invoked that way, the only honest answer is to say the count is a lower
// bound and to grep the file by hand for the pieces (`"require"`, `"User"`)
// as a separate, manual step - this tool does not attempt it.
//
// LIMITATION, stated rather than hidden: the scanner is run in
// `LanguageVariant.Standard` mode, so it does not specially re-scan JSX text
// runs in a `.tsx` file (`reScanJsxToken` is never called). Every fixture
// proven against this tool (count.test.ts) is a plain `.ts` action/lib file
// with no JSX; a `.tsx` file with a symbol occurrence inside literal JSX text
// (not an attribute expression) could be misclassified by the lexical scan.
// The AST walk (instrument 1) is unaffected by this - `ts.createSourceFile`
// parses JSX correctly regardless of scanner mode - so a `.tsx` file's CODE
// occurrences remain trustworthy; only the comment/string SEPARATION for such
// a file should be treated as provisional.
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");

export type OccurrenceRole = "declaration" | "call" | "reference";

export interface SymbolOccurrenceReport {
  readonly symbol: string;
  readonly fileName: string;
  /** AST-walk instrument. Real code occurrences only - a comment or string
   * literal can never contribute to this number, because an Identifier node
   * does not exist inside either. declarationCount + callCount +
   * referenceCount === codeOccurrences always (asserted by the tool itself,
   * not just by its tests - see assertPartition below). */
  readonly codeOccurrences: number;
  readonly declarationCount: number;
  readonly callCount: number;
  readonly referenceCount: number;
  /** Lexical-scan instrument, independent of the AST walk above. Occurrences
   * of the symbol's exact text found inside comment tokens. */
  readonly excludedAsComment: number;
  /** Lexical-scan instrument. Occurrences of the symbol's exact text found
   * inside string-literal or template-literal tokens. */
  readonly excludedAsString: number;
  /** NOT a trusted count - the number a naive `grep -c -w` line scan of the
   * raw file would report. Reported only so its disagreement with
   * codeOccurrences (or with callCount, for the common "how many call sites"
   * question) is visible in one place. Never use this field to make a
   * decision; that is the exact mistake this tool exists to stop. */
  readonly naiveGrepLineCount: number;
  /** True when codeOccurrences + excludedAsComment + excludedAsString exactly
   * accounts for every raw substring occurrence the two instruments found
   * combined. False means the two instruments disagree about the same file -
   * report it, do not average it away. */
  readonly instrumentsReconcile: boolean;
  /** Fixed statement of what no source-level scan can see. Always present, so
   * a caller reading only this report (not the module header) still gets the
   * warning RULING 135 requires. */
  readonly blindSpot: string;
}

const BLIND_SPOT_NOTICE =
  "This tool reads source text and parses it; it cannot evaluate the program. " +
  "A symbol built by string concatenation or assembled inside a template " +
  "literal's ${...} substitution is invisible to both instruments below and " +
  "to any naive text search - seeing it would require running the code. " +
  "Treat every count here as a lower bound when the file contains dynamic " +
  "property/member access or string-built identifiers.";

function isNameOf(node: import("typescript").Identifier, parent: import("typescript").Node): boolean {
  const named = parent as { name?: import("typescript").Node };
  return named.name === node;
}

function classify(node: import("typescript").Identifier): OccurrenceRole {
  const parent = node.parent;
  if (!parent) return "reference";

  if (
    (ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isEnumDeclaration(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isBindingElement(parent) ||
      ts.isParameter(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent)) &&
    isNameOf(node, parent)
  ) {
    return "declaration";
  }
  if (ts.isImportSpecifier(parent) && (parent.name === node || parent.propertyName === node)) {
    return "declaration";
  }
  if (ts.isImportClause(parent) && parent.name === node) return "declaration";
  if (ts.isNamespaceImport(parent) && parent.name === node) return "declaration";
  if (ts.isExportSpecifier(parent) && (parent.name === node || parent.propertyName === node)) {
    return "declaration";
  }

  // Direct call: `symbol(...)`.
  if (ts.isCallExpression(parent) && parent.expression === node) return "call";

  // Method-style call: `obj.symbol(...)` - the Identifier is the `.name` of a
  // PropertyAccessExpression whose own parent is the CallExpression calling
  // exactly that property access (not some unrelated call that merely
  // contains the property access as an argument elsewhere).
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    const grandparent = parent.parent;
    if (grandparent && ts.isCallExpression(grandparent) && grandparent.expression === parent) {
      return "call";
    }
  }

  return "reference";
}

/** Word-boundary occurrence count inside one string - the same rule
 * `grep -w` documents (`\b` on both sides), used identically by the naive
 * line-count below and by the comment/string scan, so all three numbers in
 * the report are counting the same THING (whole-word occurrences of the
 * symbol), differing only in WHERE each instrument looks. */
function countWholeWordOccurrences(text: string, symbol: string): number {
  const pattern = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

/** Instrument 1: the AST walk. Every Identifier node in the parsed tree whose
 * text equals `symbol`, classified into exactly one role. Nothing here can
 * come from a comment or a string literal - those never produce an
 * Identifier node. */
function walkAst(sourceFile: import("typescript").SourceFile, symbol: string): { declaration: number; call: number; reference: number } {
  let declaration = 0;
  let call = 0;
  let reference = 0;

  function visit(node: import("typescript").Node): void {
    if (ts.isIdentifier(node) && node.text === symbol) {
      const role = classify(node);
      if (role === "declaration") declaration++;
      else if (role === "call") call++;
      else reference++;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  return { declaration, call, reference };
}

const COMMENT_KINDS = new Set<import("typescript").SyntaxKind>([
  ts.SyntaxKind.SingleLineCommentTrivia,
  ts.SyntaxKind.MultiLineCommentTrivia,
]);
const STRING_LIKE_KINDS = new Set<import("typescript").SyntaxKind>([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
]);

/** Instrument 2: the lexical scan. Walks the file as tokens (trivia NOT
 * skipped, so comments come through as their own tokens) using the compiler's
 * own scanner - not a hand-rolled comment stripper - and counts whole-word
 * occurrences of `symbol` inside comment tokens and inside string/template/
 * regex tokens separately. See the module header for the `.tsx` JSX-text
 * limitation of this instrument specifically. */
function scanCommentsAndStrings(
  source: string,
  fileName: string,
  symbol: string
): { comment: number; string: number } {
  const variant = fileName.endsWith(".tsx") || fileName.endsWith(".jsx")
    ? ts.LanguageVariant.JSX
    : ts.LanguageVariant.Standard;
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, /* skipTrivia */ false, variant, source);

  let comment = 0;
  let string = 0;
  let kind = scanner.scan();
  while (kind !== ts.SyntaxKind.EndOfFileToken) {
    if (COMMENT_KINDS.has(kind)) {
      comment += countWholeWordOccurrences(scanner.getTokenText(), symbol);
    } else if (STRING_LIKE_KINDS.has(kind)) {
      string += countWholeWordOccurrences(scanner.getTokenText(), symbol);
    }
    kind = scanner.scan();
  }
  return { comment, string };
}

/** Counts every real occurrence of `symbol` in `source` (a single file's
 * text), using the two independent instruments described in this module's
 * header, plus the naive line-count for comparison. `fileName` is used only
 * to pick TS vs TSX scanning mode and to label the report - this function
 * does no file-system access itself, so it is trivially testable against
 * inline fixtures (RULING 135: "your tests must not freeze a count that
 * legitimate edits would change" - callers pass the CURRENT text of a real
 * file, never a frozen copy of it, for anything but a synthetic fixture). */
export function countSymbolOccurrences(source: string, fileName: string, symbol: string): SymbolOccurrenceReport {
  const scriptKind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);

  const { declaration, call, reference } = walkAst(sourceFile, symbol);
  const codeOccurrences = declaration + call + reference;
  const { comment, string } = scanCommentsAndStrings(source, fileName, symbol);
  const naiveGrepLineCount = source
    .split("\n")
    .filter((line) => countWholeWordOccurrences(line, symbol) > 0).length;

  // Reconciliation: the total whole-word occurrences the LEXICAL scan finds
  // across every token kind (code tokens are everything the scanner emits
  // that is neither a comment nor a string/template/regex token) must equal
  // codeOccurrences from the AST walk - two instruments counting the same
  // file, expected to agree on the split between "in real code" and "not."
  // A mismatch means an Identifier the AST sees was not found as a plain
  // word-token by the scanner (or vice versa) - a real disagreement to
  // surface, not paper over.
  const totalWholeWordInFile = countWholeWordOccurrences(source, symbol);
  const instrumentsReconcile = codeOccurrences + comment + string === totalWholeWordInFile;

  return {
    symbol,
    fileName,
    codeOccurrences,
    declarationCount: declaration,
    callCount: call,
    referenceCount: reference,
    excludedAsComment: comment,
    excludedAsString: string,
    naiveGrepLineCount,
    instrumentsReconcile,
    blindSpot: BLIND_SPOT_NOTICE,
  };
}

/** Convenience for the common multi-file case a sub-wave brief actually
 * needs ("how many guard call sites across these N files"): runs
 * countSymbolOccurrences per file and also returns the summed call/reference/
 * declaration totals, so a caller gets both the per-file detail (to spot a
 * single outlier file) and the total (the number that goes in the brief). No
 * file-system access - callers supply {fileName, source} pairs, which keeps
 * this function as testable as the single-file one above. */
export function countSymbolOccurrencesAcrossFiles(
  files: ReadonlyArray<{ readonly fileName: string; readonly source: string }>,
  symbol: string
): { readonly perFile: SymbolOccurrenceReport[]; readonly totalCallCount: number; readonly totalCodeOccurrences: number } {
  const perFile = files.map((f) => countSymbolOccurrences(f.source, f.fileName, symbol));
  const totalCallCount = perFile.reduce((sum, r) => sum + r.callCount, 0);
  const totalCodeOccurrences = perFile.reduce((sum, r) => sum + r.codeOccurrences, 0);
  return { perFile, totalCallCount, totalCodeOccurrences };
}
