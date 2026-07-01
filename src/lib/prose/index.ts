/**
 * The prose library: deterministic data-to-text conversion. Takes an arbitrary
 * input string, detects its shape (JSON, delimited table, key-value lines,
 * markdown with headings/bullets, or already-prose), and realizes it as
 * natural-language prose. Everything in the output restates the input — no fact,
 * number, or name is invented — and the same input always produces the same
 * prose.
 *
 * Used in-app so embedded document/announcement generation reads naturally when
 * given structured input; exposed to other clients via POST /api/prose.
 */

import { capitalizeFirst, cleanText, ensureSentence } from "@/lib/embedded/scaffold";

export type DetectedFormat = "json" | "table" | "keyvalue" | "markdown" | "list" | "prose";

export interface ProseResult {
  prose: string;
  format: DetectedFormat;
}

const MAX_LIST_ITEMS = 10;
const MAX_RECORDS = 6;
const MAX_FIELDS = 12;

/** "camelCase_or_snake-key" -> "camel case or snake key". */
function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Join items as "a, b, and c". */
function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "not set";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim() || "empty";
  return "";
}

// ── JSON ─────────────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One "key is value" clause, descending one level into arrays and objects. */
function fieldClause(key: string, value: unknown): string {
  const name = humanizeKey(key);
  if (Array.isArray(value)) {
    const primitives = value.filter((v) => !isPlainObject(v) && !Array.isArray(v));
    if (primitives.length === value.length) {
      const items = value.slice(0, MAX_LIST_ITEMS).map(formatValue);
      const more = value.length > MAX_LIST_ITEMS ? `, and ${value.length - MAX_LIST_ITEMS} more` : "";
      return `${name} includes ${joinList(items)}${more}`;
    }
    return `${name} lists ${value.length} record${value.length === 1 ? "" : "s"}`;
  }
  if (isPlainObject(value)) {
    const inner = Object.entries(value)
      .slice(0, MAX_FIELDS)
      .map(([k, v]) => `${humanizeKey(k)} ${Array.isArray(v) || isPlainObject(v) ? "is provided" : `is ${formatValue(v)}`}`);
    return `${name} has ${joinList(inner)}`;
  }
  return `${name} is ${formatValue(value)}`;
}

function describeRecord(record: Record<string, unknown>): string {
  const entries = Object.entries(record);
  const clauses = entries.slice(0, MAX_FIELDS).map(([k, v]) => fieldClause(k, v));
  const more = entries.length > MAX_FIELDS ? `, and ${entries.length - MAX_FIELDS} more fields` : "";
  return `${joinList(clauses)}${more}`;
}

function jsonToProse(value: unknown): string {
  if (Array.isArray(value)) {
    const objects = value.filter(isPlainObject);
    if (objects.length === value.length && value.length > 0) {
      const sentences = [
        `The data lists ${value.length} record${value.length === 1 ? "" : "s"}.`,
        ...objects
          .slice(0, MAX_RECORDS)
          .map((record, i) => ensureSentence(capitalizeFirst(`record ${i + 1}: ${describeRecord(record)}`))),
      ];
      if (value.length > MAX_RECORDS) {
        sentences.push(`There are ${value.length - MAX_RECORDS} more records.`);
      }
      return sentences.join(" ");
    }
    const items = value.slice(0, MAX_LIST_ITEMS).map(formatValue);
    const more = value.length > MAX_LIST_ITEMS ? ` There are ${value.length - MAX_LIST_ITEMS} more items.` : "";
    return `${ensureSentence(`The list has ${value.length} item${value.length === 1 ? "" : "s"}: ${joinList(items)}`)}${more}`;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    const sentences = entries
      .slice(0, MAX_FIELDS)
      .map(([k, v]) => ensureSentence(capitalizeFirst(`the ${fieldClause(k, v)}`)));
    if (entries.length > MAX_FIELDS) {
      sentences.push(`There are ${entries.length - MAX_FIELDS} more fields.`);
    }
    return sentences.join(" ");
  }
  return ensureSentence(`The value is ${formatValue(value)}`);
}

// ── Delimited tables ─────────────────────────────────────────────────────────

interface Table {
  headers: string[];
  rows: string[][];
}

function tryParseTable(lines: string[]): Table | null {
  if (lines.length < 2) return null;
  // Markdown pipe tables: strip outer pipes and the |---|---| separator row.
  const cleaned = lines
    .map((line) => line.trim().replace(/^\||\|$/g, ""))
    .filter((line) => !/^[\s|:-]+$/.test(line));
  for (const delimiter of ["\t", "|", ","]) {
    const split = cleaned.map((line) => line.split(delimiter).map((cell) => cell.trim()));
    const width = split[0]?.length ?? 0;
    if (width >= 2 && split.length >= 2 && split.every((row) => row.length === width)) {
      return { headers: split[0], rows: split.slice(1) };
    }
  }
  return null;
}

function tableToProse(table: Table): string {
  const { headers, rows } = table;
  const sentences = [
    `The table has ${rows.length} row${rows.length === 1 ? "" : "s"} with columns ${joinList(headers)}.`,
  ];
  for (const row of rows.slice(0, MAX_RECORDS)) {
    const clauses = headers.slice(1).map((header, i) => `${humanizeKey(header)} is ${row[i + 1] || "empty"}`);
    sentences.push(ensureSentence(capitalizeFirst(`for ${row[0]}, ${joinList(clauses)}`)));
  }
  if (rows.length > MAX_RECORDS) {
    sentences.push(`There are ${rows.length - MAX_RECORDS} more rows.`);
  }
  return sentences.join(" ");
}

// ── Key-value lines ──────────────────────────────────────────────────────────

const KEY_VALUE_LINE = /^([A-Za-z][\w .()/-]{0,50}?)\s*:\s+(.+)$/;

function keyValueToProse(lines: string[]): string {
  return lines
    .map((line) => {
      const m = KEY_VALUE_LINE.exec(line);
      if (!m) return null;
      return ensureSentence(capitalizeFirst(`the ${humanizeKey(m[1])} is ${m[2].trim()}`));
    })
    .filter(Boolean)
    .join(" ");
}

// ── Markdown / lists ─────────────────────────────────────────────────────────

const BULLET_LINE = /^\s*(?:[-*•‣◦]|\d+[.)])\s+(.+)$/;
const HEADING_LINE = /^#{1,6}\s+(.+)$/;

function markdownToProse(lines: string[]): string {
  const paragraphs: string[] = [];
  let heading: string | null = null;
  let items: string[] = [];

  const flush = () => {
    if (items.length === 0 && !heading) return;
    const list = joinList(items.map((item) => item.replace(/[.;]+$/, "")));
    if (heading && list) {
      paragraphs.push(ensureSentence(`${capitalizeFirst(heading)} covers ${list}`));
    } else if (heading) {
      paragraphs.push(ensureSentence(capitalizeFirst(heading)));
    } else if (list) {
      paragraphs.push(ensureSentence(`The list includes ${list}`));
    }
    heading = null;
    items = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const headingMatch = HEADING_LINE.exec(line);
    if (headingMatch) {
      flush();
      heading = headingMatch[1].trim();
      continue;
    }
    const bulletMatch = BULLET_LINE.exec(line);
    if (bulletMatch) {
      items.push(bulletMatch[1].trim());
      continue;
    }
    // Plain paragraph text: attach under the current heading, verbatim.
    flush();
    paragraphs.push(ensureSentence(cleanText(line)));
  }
  flush();

  return paragraphs.join(" ");
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Convert an input string into natural-language prose. The detected format is
 * returned alongside the prose; "prose" means the input already read as natural
 * language and was passed through unchanged (trimmed only).
 */
export function toProse(input: string): ProseResult {
  const text = input.trim();
  if (!text) return { prose: "", format: "prose" };

  // JSON.
  if (/^[[{]/.test(text)) {
    try {
      return { prose: jsonToProse(JSON.parse(text)), format: "json" };
    } catch {
      // fall through to the text formats
    }
  }

  const lines = text.split(/\r?\n/).filter((line) => line.trim());

  // Delimited table.
  const table = tryParseTable(lines);
  if (table) {
    return { prose: tableToProse(table), format: "table" };
  }

  // Key-value block: at least two lines, all "Label: value".
  if (lines.length >= 2 && lines.every((line) => KEY_VALUE_LINE.test(line.trim()))) {
    return { prose: keyValueToProse(lines.map((l) => l.trim())), format: "keyvalue" };
  }

  // Markdown headings / bullet lists.
  const hasHeading = lines.some((line) => HEADING_LINE.test(line.trim()));
  const bulletCount = lines.filter((line) => BULLET_LINE.test(line)).length;
  if (hasHeading || bulletCount >= 2) {
    return { prose: markdownToProse(lines), format: hasHeading ? "markdown" : "list" };
  }

  // Already prose.
  return { prose: text, format: "prose" };
}
