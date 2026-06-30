/**
 * Rubric construction for the Embedded Deterministic Engine.
 *
 * Precedence (matches the product decision): when a rubric is supplied (from
 * Canvas, or pasted/uploaded), grade against it; only when none is supplied is a
 * rubric generated from the assignment instructions. All parsing is rule-based.
 */

import type { CheckType, EmbeddedRubric, RubricCheck } from "./types";

const POINTS_PER_CHECK = 10;

const KNOWN_EXTENSIONS = [
  "pdf", "docx", "doc", "pptx", "ppt", "xlsx", "xls", "csv", "txt", "md",
  "ipynb", "py", "java", "js", "ts", "tsx", "jsx", "html", "css", "json",
  "zip", "png", "jpg", "jpeg", "gif", "sql", "r",
];

const STOPWORDS = new Set([
  "the", "and", "for", "with", "your", "you", "this", "that", "from", "into",
  "must", "should", "include", "including", "use", "using", "contain", "have",
  "submit", "upload", "attach", "provide", "ensure", "make", "sure", "least",
  "also", "each", "every", "all", "any", "are", "will", "shall", "a", "an",
  "of", "to", "in", "on", "at", "be", "is", "as", "or", "it", "its",
  "term", "terms", "following", "example", "examples", "etc", "when", "where",
]);

// Structural / deliverable nouns that describe HOW MUCH to submit rather than a
// topic to grade on. They are kept out of generated keyword checks (a "figures"
// count is already a min_file_count; "figures" is not a content term).
const STRUCTURAL_NOUNS = new Set([
  "figure", "figures", "image", "images", "screenshot", "screenshots",
  "file", "files", "source", "sources", "page", "pages", "word", "words",
  "chart", "charts", "table", "tables", "diagram", "diagrams", "photo", "photos",
  "visualization", "visualizations", "attachment", "attachments", "reference", "references",
]);

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

// ── Generation from free-text instructions ──────────────────────────────────

function extractFileTypeChecks(text: string): RubricCheck[] {
  const exts = new Set<string>();
  const extAlternation = KNOWN_EXTENSIONS.join("|");

  // "submit/upload/attach/provide ... a PDF/.docx/..." within a short window.
  const verbRe = new RegExp(
    `\\b(?:submit|upload|attach|provide|include|turn in|hand in)\\b[^.\\n]{0,40}?\\b(${extAlternation})\\b`,
    "gi"
  );
  // "a PDF file", "your .docx document", "PPTX deck".
  const nounRe = new RegExp(`\\b(${extAlternation})\\b\\s+(?:file|document|report|deck|slides?|notebook|script)`, "gi");
  // explicit ".pdf" mentions.
  const dotRe = new RegExp(`\\.(${extAlternation})\\b`, "gi");

  for (const re of [verbRe, nounRe, dotRe]) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      exts.add(match[1].toLowerCase());
    }
  }

  return [...exts].map((ext) => ({
    id: nextId("file"),
    criterion: `Submitted a .${ext} file`,
    checkType: "file_type" as CheckType,
    target: ext,
    points: POINTS_PER_CHECK,
  }));
}

function extractLengthChecks(text: string): RubricCheck[] {
  const checks: RubricCheck[] = [];

  const wordsRe = /\b(?:at least|minimum of|no fewer than|at minimum)\s+(\d{2,6})\s*(?:\+\s*)?words?\b/gi;
  let maxWords = 0;
  let match: RegExpExecArray | null;
  while ((match = wordsRe.exec(text)) !== null) {
    maxWords = Math.max(maxWords, Number(match[1]));
  }
  // "300-word", "500+ words"
  const wordsRe2 = /\b(\d{2,6})\s*(?:\+|-)?\s*words?\b/gi;
  while ((match = wordsRe2.exec(text)) !== null) {
    maxWords = Math.max(maxWords, Number(match[1]));
  }

  const pagesRe = /\b(?:at least|minimum of)\s+(\d{1,3})\s+pages?\b/gi;
  let maxPages = 0;
  while ((match = pagesRe.exec(text)) !== null) {
    maxPages = Math.max(maxPages, Number(match[1]));
  }
  // A page is treated as ~250 words for a deterministic floor.
  const fromPages = maxPages > 0 ? maxPages * 250 : 0;
  const words = Math.max(maxWords, fromPages);

  if (words > 0) {
    checks.push({
      id: nextId("len"),
      criterion: `At least ${words} words`,
      checkType: "min_words",
      target: String(words),
      count: words,
      points: POINTS_PER_CHECK,
    });
  }
  return checks;
}

function extractFileCountChecks(text: string): RubricCheck[] {
  const re = /\b(?:at least|minimum of)\s+(\d{1,2})\s+(files|documents|images|screenshots|attachments|figures|diagrams|photos)\b/gi;
  const match = re.exec(text);
  if (!match) return [];
  const count = Number(match[1]);
  return [
    {
      id: nextId("files"),
      criterion: `At least ${count} ${match[2].toLowerCase()}`,
      checkType: "min_file_count",
      target: String(count),
      count,
      points: POINTS_PER_CHECK,
    },
  ];
}

function extractCodeSymbolChecks(text: string): RubricCheck[] {
  const symbols = new Set<string>();
  const namedRe = /\b(?:function|method|procedure|def|class)\s+(?:named|called)?\s*["'`]?([A-Za-z_]\w{1,40})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = namedRe.exec(text)) !== null) {
    symbols.add(match[1]);
  }
  // Backtick-quoted call like `clean_data()`.
  const callRe = /`([A-Za-z_]\w{1,40})\s*\(\s*\)`/g;
  while ((match = callRe.exec(text)) !== null) {
    symbols.add(match[1]);
  }

  return [...symbols].map((symbol) => ({
    id: nextId("sym"),
    criterion: `Defines ${symbol}`,
    checkType: "code_symbol" as CheckType,
    target: symbol,
    points: POINTS_PER_CHECK,
  }));
}

function extractKeywordChecks(text: string): RubricCheck[] {
  // Reuse the shared explicit-term extractor (quoted terms + the object of
  // include/use/import/cite/... phrases), then drop structural/deliverable nouns
  // so only real content terms become keyword checks.
  return extractExplicitTerms(text)
    .filter((term) => !STRUCTURAL_NOUNS.has(term))
    .slice(0, 6)
    .map((term) => ({
      id: nextId("kw"),
      criterion: `Mentions ${titleCase(term)}`,
      checkType: "keyword" as CheckType,
      target: term,
      points: POINTS_PER_CHECK,
    }));
}

export function buildRubricFromInstructions(instructions: string): EmbeddedRubric {
  idCounter = 0;
  const checks = dedupe(
    [
      ...extractFileTypeChecks(instructions),
      ...extractLengthChecks(instructions),
      ...extractFileCountChecks(instructions),
      ...extractCodeSymbolChecks(instructions),
      ...extractKeywordChecks(instructions),
    ],
    (c) => `${c.checkType}:${c.target.toLowerCase()}`
  );

  if (checks.length === 0) {
    return {
      checks: [
        {
          id: nextId("len"),
          criterion: "Submission is present and substantive",
          checkType: "min_words",
          target: "50",
          count: 50,
          points: POINTS_PER_CHECK,
        },
      ],
      origin: "instructions",
      warnings: [
        "No explicit, checkable requirements were found in the instructions, so a single completeness check was generated. Add a rubric, or state concrete requirements (file types, required terms, word counts, function names), for finer grading.",
      ],
    };
  }

  return {
    checks,
    origin: "instructions",
    warnings: [
      "This rubric was generated from the assignment instructions by rule-based checks. Review it before posting grades.",
    ],
  };
}

// ── Mapping a supplied rubric onto checks ────────────────────────────────────

function checkTypeFrom(value: unknown): CheckType | null {
  const valid: CheckType[] = [
    "keyword", "all_keywords", "any_keywords", "min_words",
    "file_type", "min_file_count", "regex", "code_symbol",
  ];
  return typeof value === "string" && valid.includes(value as CheckType) ? (value as CheckType) : null;
}

/** Parse a structured, check-based JSON rubric. Returns null when it is not one. */
function tryParseCheckRubric(text: string): RubricCheck[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { criteria?: unknown }).criteria)
      ? (parsed as { criteria: unknown[] }).criteria
      : null;
  if (!list) return null;

  const checks: RubricCheck[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const checkType = checkTypeFrom(item.checkType ?? item.check_type ?? item.type);
    if (!checkType) continue;
    const criterion =
      typeof item.criterion === "string"
        ? item.criterion
        : typeof item.area === "string"
          ? item.area
          : typeof item.name === "string"
            ? item.name
            : checkType;
    const target = typeof item.target === "string" ? item.target : "";
    const terms = Array.isArray(item.terms) ? item.terms.filter((t): t is string => typeof t === "string") : undefined;
    const count = typeof item.count === "number" ? item.count : undefined;
    const pattern = typeof item.pattern === "string" ? item.pattern : undefined;
    const points = typeof item.points === "number" && item.points > 0 ? item.points : POINTS_PER_CHECK;
    if (!target && !terms && !count && !pattern) continue;
    checks.push({ id: nextId("chk"), criterion, checkType, target, terms, count, pattern, points });
  }
  return checks.length > 0 ? checks : null;
}

// Header cell -> canonical rubric field. Lets CSV columns be named loosely
// ("Check Type", "checkType", "type" all map to the check type).
const CSV_HEADER_ALIASES: Record<string, string> = {
  criterion: "criterion", area: "criterion", name: "criterion",
  checktype: "checkType", check: "checkType", type: "checkType",
  target: "target", value: "target", arg: "target",
  points: "points", point: "points", pts: "points", weight: "points",
  count: "count", threshold: "count", min: "count", minimum: "count",
  pattern: "pattern", regex: "pattern",
  terms: "terms", keywords: "terms", words: "terms",
  description: "description", detail: "description", desc: "description",
};

function normalizeHeaderCell(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** RFC4180-ish CSV parse: handles quoted fields, escaped quotes, and CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/**
 * Parse a tabular CSV rubric. A `check_type` column yields structured checks
 * (origin "checks"); a criterion/points table without one is mapped per criterion
 * (origin "rubric"). Returns null when the text is not a recognizable rubric CSV.
 */
function tryParseCsvRubric(
  text: string
): { checks: RubricCheck[]; origin: "checks" | "rubric"; warnings: string[] } | null {
  const rows = parseCsv(text.trim());
  if (rows.length < 2) return null;

  const column: Record<string, number> = {};
  rows[0].forEach((cell, index) => {
    const field = CSV_HEADER_ALIASES[normalizeHeaderCell(cell)];
    if (field && !(field in column)) column[field] = index;
  });
  if (!("criterion" in column) && !("checkType" in column)) return null;

  const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell.trim() !== ""));
  const cell = (r: string[], field: string): string =>
    field in column ? (r[column[field]] ?? "").trim() : "";
  const pointsOf = (r: string[]): number => {
    const raw = cell(r, "points");
    return raw && Number(raw) > 0 ? Number(raw) : POINTS_PER_CHECK;
  };

  // Structured check rubric.
  if ("checkType" in column) {
    const checks: RubricCheck[] = [];
    for (const r of dataRows) {
      const checkType = checkTypeFrom(cell(r, "checkType"));
      if (!checkType) continue;
      const target = cell(r, "target");
      const termsRaw = cell(r, "terms");
      const terms = termsRaw ? termsRaw.split(/[;|]/).map((t) => t.trim()).filter(Boolean) : undefined;
      const countRaw = cell(r, "count");
      const count = countRaw && !Number.isNaN(Number(countRaw)) ? Number(countRaw) : undefined;
      const pattern = cell(r, "pattern") || undefined;
      if (!target && !terms && count === undefined && !pattern) continue;
      checks.push({
        id: nextId("csv"),
        criterion: cell(r, "criterion") || checkType,
        checkType,
        target,
        terms,
        count,
        pattern,
        points: pointsOf(r),
      });
    }
    return checks.length > 0 ? { checks, origin: "checks", warnings: [] } : null;
  }

  // Criterion/points table with no checks: map each criterion heuristically.
  const checks: RubricCheck[] = [];
  for (const r of dataRows) {
    const name = cell(r, "criterion");
    if (!name) continue;
    checks.push(criterionToCheck(name, cell(r, "description"), pointsOf(r)));
  }
  return checks.length > 0
    ? {
        checks,
        origin: "rubric",
        warnings: [
          "Your CSV rubric had no check_type column, so each criterion was graded with deterministic checks derived from its text. For exact control, add a check_type column (keyword, min_words, file_type, code_symbol, regex).",
        ],
      }
    : null;
}

/** Pull "Name (10 pts): description" criteria out of a free-text rubric. */
function parseCriteriaLines(text: string): Array<{ name: string; description: string; points: number }> {
  const out: Array<{ name: string; description: string; points: number }> = [];
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s/.test(raw)) continue; // indented = rating / subcategory line
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^(.+?)\s*\(\s*(\d+(?:\.\d+)?)\s*(?:pts?|points?|%)?\s*\)\s*:\s*(.*)$/i);
    if (!match) continue;
    const name = match[1].trim();
    if (!name) continue;
    out.push({ name, description: match[3].trim(), points: Number(match[2]) || POINTS_PER_CHECK });
  }
  return out;
}

/**
 * Detect a required file extension only in a strong context (a verb like
 * "submit", a following noun like "file", or a dotted ".pdf"), so a bare letter
 * such as "r" sitting in prose is not mistaken for a file type.
 */
function detectFileExtension(text: string): string | null {
  const extAlternation = KNOWN_EXTENSIONS.join("|");
  const patterns = [
    new RegExp(`\\b(?:submit|upload|attach|provide|include|turn in|hand in)\\b[^.\\n]{0,40}?\\b(${extAlternation})\\b`, "i"),
    new RegExp(`\\b(${extAlternation})\\b\\s+(?:file|document|report|deck|slides?|notebook|script)`, "i"),
    new RegExp(`\\.(${extAlternation})\\b`, "i"),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

/** Concrete terms a criterion explicitly requires: quoted terms and the object of
 *  "include / use / cite / reference / discuss X" phrases. */
function extractExplicitTerms(text: string): string[] {
  const terms = new Set<string>();

  const quotedRe = /["'“”‘’]([A-Za-z][A-Za-z0-9 \-]{2,40})["'“”‘’]/g;
  let match: RegExpExecArray | null;
  while ((match = quotedRe.exec(text)) !== null) {
    const term = match[1].trim().toLowerCase();
    if (term && !STOPWORDS.has(term)) terms.add(term);
  }

  const requireRe =
    /\b(?:include|includes|including|use|uses|using|import|imports|incorporate|incorporates|apply|applies|employ|employs|contain|contains|cite|cites|reference|references|mention|mentions|discuss|discusses|address|addresses|cover|covers|implement|implements)\s+(?:a|an|the|some|any|at least)?\s*([A-Za-z][A-Za-z0-9 ,\-]{2,60})/gi;
  while ((match = requireRe.exec(text)) !== null) {
    // Split a list like "pandas, numpy and matplotlib" into individual terms.
    for (const part of match[1].toLowerCase().split(/\s*(?:,|\band\b|\bor\b|\/|;)\s*/)) {
      const cleaned = part.replace(/^(?:a|an|the|your|their)\s+/, "").trim();
      const word = cleaned.split(/\s+/).find((w) => w.length > 2 && !STOPWORDS.has(w));
      if (word) terms.add(word);
    }
  }

  return [...terms];
}

/** Salient topical words for a soft "is the submission on-topic" fallback. */
function salientTerms(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length >= 4 && !STOPWORDS.has(word) && !seen.has(word)) {
      seen.add(word);
      out.push(word);
    }
  }
  return out;
}

/** Build the most specific check available for one free-text criterion, reading
 *  both its name and description. */
function criterionToCheck(name: string, description: string, points: number): RubricCheck {
  const haystack = `${name}. ${description}`;

  const ext = detectFileExtension(haystack);
  if (ext) {
    return { id: nextId("c"), criterion: name, checkType: "file_type", target: ext, points };
  }

  const symbol = /\b(?:function|method|class|def)\s+(?:named|called)?\s*["'`]?([A-Za-z_]\w{1,40})\b/i.exec(haystack);
  if (symbol) {
    return { id: nextId("c"), criterion: name, checkType: "code_symbol", target: symbol[1], points };
  }

  const words = /\b(?:at least|minimum of|no fewer than)\s+(\d{2,6})\s*words?\b/i.exec(haystack);
  if (words) {
    const count = Number(words[1]);
    return { id: nextId("c"), criterion: name, checkType: "min_words", target: String(count), count, points };
  }

  const fileCount =
    /\b(?:at least|minimum of)\s+(\d{1,2})\s+(?:files|images|screenshots|attachments|diagrams|figures|charts|tables)\b/i.exec(
      haystack
    );
  if (fileCount) {
    const count = Number(fileCount[1]);
    return { id: nextId("c"), criterion: name, checkType: "min_file_count", target: String(count), count, points };
  }

  // Explicit required terms from the criterion -> require them (precise).
  const explicit = extractExplicitTerms(haystack).slice(0, 5);
  if (explicit.length === 1) {
    return { id: nextId("c"), criterion: name, checkType: "keyword", target: explicit[0], points };
  }
  if (explicit.length > 1) {
    return { id: nextId("c"), criterion: name, checkType: "all_keywords", target: explicit[0], terms: explicit, points };
  }

  // Topical fallback: the submission should at least be on-topic for this criterion.
  const topical = salientTerms(haystack).slice(0, 4);
  if (topical.length === 0) {
    return { id: nextId("c"), criterion: name, checkType: "min_words", target: "25", count: 25, points };
  }
  if (topical.length === 1) {
    return { id: nextId("c"), criterion: name, checkType: "keyword", target: topical[0], points };
  }
  return { id: nextId("c"), criterion: name, checkType: "any_keywords", target: topical[0], terms: topical, points };
}

export function buildRubricFromRubricText(text: string, fileName?: string): EmbeddedRubric {
  idCounter = 0;
  const lower = (fileName ?? "").toLowerCase();

  const tryJson = (): EmbeddedRubric | null => {
    const checks = tryParseCheckRubric(text);
    return checks ? { checks, origin: "checks", warnings: [] } : null;
  };
  const tryCsv = (): EmbeddedRubric | null => tryParseCsvRubric(text);

  // Both structured forms are tried; a ".csv" filename tips the order so a comma
  // table is read as CSV rather than risking a stray JSON interpretation.
  const order = lower.endsWith(".csv") ? [tryCsv, tryJson] : [tryJson, tryCsv];
  for (const attempt of order) {
    const parsed = attempt();
    if (parsed) return parsed;
  }

  const criteria = parseCriteriaLines(text);
  if (criteria.length > 0) {
    const checks = criteria.map((c) => criterionToCheck(c.name, c.description, c.points));
    return {
      checks,
      origin: "rubric",
      warnings: [
        "Your rubric was graded with deterministic keyword and structure checks derived from each criterion. For exact control, supply a check-based JSON or CSV rubric.",
      ],
    };
  }

  // No structured form recognised: fall back to treating the rubric prose as the
  // brief and generating checks from it.
  const generated = buildRubricFromInstructions(text);
  return {
    ...generated,
    origin: "rubric",
    warnings: [
      "The supplied rubric had no parseable criteria, so checks were generated from its text. Review them before posting grades.",
    ],
  };
}

// ── Presentation ─────────────────────────────────────────────────────────────

/** A short requirement phrase for one check (used in the full-credit checklist). */
function requirementPhrase(check: RubricCheck): string {
  switch (check.checkType) {
    case "file_type":
      return `Submit a .${check.target.replace(/^\./, "")} file.`;
    case "min_words":
      return `Write at least ${check.count ?? check.target} words.`;
    case "min_file_count":
      return `Submit at least ${check.count ?? 1} files.`;
    case "code_symbol":
      return `Define ${check.target} in your code.`;
    case "all_keywords":
      return `Address all of: ${(check.terms ?? []).join(", ")}.`;
    case "any_keywords":
      return `Address at least one of: ${(check.terms ?? [check.target]).join(", ")}.`;
    case "regex":
      return `Match the required format for "${check.criterion}".`;
    case "keyword":
    default:
      return `Address "${check.target}" in your submission.`;
  }
}

export function fullCreditChecklist(rubric: EmbeddedRubric): string[] {
  return rubric.checks.map(requirementPhrase);
}

/** Human-readable rendering of the rubric, shown in the "auto-generated" panel. */
export function renderRubricText(rubric: EmbeddedRubric): string {
  return rubric.checks
    .map((check) => `${check.criterion} (${check.points} pts): ${requirementPhrase(check)}`)
    .join("\n");
}
