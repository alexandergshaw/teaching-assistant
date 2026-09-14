// A hand-rolled reader/writer for the exact YAML subset docs/backlog.yml uses:
// a top-level block sequence of mappings, one BacklogItem per "- id: '...'"
// item, every scalar single-quoted (YAML's own escaping rule - a literal '
// is written as two: '' - see https://yaml.org/spec/1.2.2/#732-single-quoted-style),
// and `owns`/`blocked_by` as flow sequences of single-quoted scalars.
//
// Why hand-rolled rather than a real YAML library: this task's file list is
// `package.json - only to add npm scripts`, so no new dependency can be
// declared there. `node_modules/yaml` and `node_modules/js-yaml` are present
// only as transitive deps of eslint/next; importing either would be an
// undeclared runtime dependency this repo never asked for, liable to vanish
// or shift on an unrelated `npm install`. Since this module is both the only
// writer and the only reader of docs/backlog.yml, a small subset that is
// still valid YAML (any real parser would agree with it) is enough, and it
// keeps the whole read/write path inside the file list.
//
// Every string field is required to stay single-line (no raw "\n") so the
// grammar below - one key: value pair per line - stays unambiguous. Long
// free text is joined with spaces during migration rather than wrapped.

import type { BacklogItem, BacklogState } from "./types";
import { isBacklogState } from "./types";

type StringKey = "id" | "state" | "title" | "verify" | "instrument" | "from" | "note";
type ArrayKey = "owns" | "blocked_by";

function escapeScalar(value: string): string {
  if (value.includes("\n") || value.includes("\r")) {
    throw new Error(`yaml-codec: scalar must be single-line, got a newline in: ${JSON.stringify(value)}`);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function unescapeScalar(raw: string): string {
  const m = raw.match(/^'((?:[^']|'')*)'$/);
  if (!m) {
    throw new Error(`yaml-codec: expected a single-quoted scalar, got: ${raw}`);
  }
  return m[1].replace(/''/g, "'");
}

function serializeArray(values: string[]): string {
  if (values.length === 0) return "[]";
  return `[${values.map((v) => escapeScalar(v)).join(", ")}]`;
}

function parseArray(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed === "[]") return [];
  const m = trimmed.match(/^\[(.*)\]$/);
  if (!m) {
    throw new Error(`yaml-codec: expected a flow sequence, got: ${raw}`);
  }
  const inner = m[1].trim();
  if (inner.length === 0) return [];
  // Split on commas that sit between single-quoted scalars - safe here
  // because every element is quoted and commas never appear un-quoted.
  const parts: string[] = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === "'") {
      // Handle doubled '' as an escaped quote rather than a boundary.
      if (inQuote && inner[i + 1] === "'") {
        current += "''";
        i += 1;
        continue;
      }
      inQuote = !inQuote;
      current += ch;
      continue;
    }
    if (ch === "," && !inQuote) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) parts.push(current.trim());
  return parts.map(unescapeScalar);
}

/** Serializes items in array order - callers that need a canonical order sort before calling this. */
export function serializeBacklogYaml(items: BacklogItem[]): string {
  const lines: string[] = [
    "# GENERATED SOURCE OF TRUTH. Hand-edit THIS file (docs/backlog.yml) -",
    "# never docs/BACKLOG.md, which is rendered from it by",
    "# `npm run backlog:render` and checked by `npm run backlog:check-generated`.",
    "#",
    "# Schema: src/tools/backlog/types.ts (BacklogItem). Read/write path:",
    "# src/tools/backlog/yaml-codec.ts.",
  ];
  for (const item of items) {
    lines.push(`- id: ${escapeScalar(item.id)}`);
    lines.push(`  state: ${escapeScalar(item.state)}`);
    lines.push(`  title: ${escapeScalar(item.title)}`);
    lines.push(`  owns: ${serializeArray(item.owns)}`);
    lines.push(`  verify: ${item.verify === null ? "null" : escapeScalar(item.verify)}`);
    lines.push(`  blocked_by: ${serializeArray(item.blocked_by)}`);
    lines.push(`  instrument: ${escapeScalar(item.instrument)}`);
    lines.push(`  from: ${escapeScalar(item.from)}`);
    lines.push(`  note: ${escapeScalar(item.note)}`);
  }
  return `${lines.join("\n")}\n`;
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

function isComment(line: string): boolean {
  return line.trim().startsWith("#");
}

/** Parses the subset serializeBacklogYaml writes. Throws on anything else, deliberately - a hand-edit that breaks the grammar must fail loudly, not be guessed at. */
export function parseBacklogYaml(text: string): BacklogItem[] {
  const rawLines = text.split("\n");
  const lines = rawLines.filter((l) => !isBlank(l) && !isComment(l));

  const items: BacklogItem[] = [];
  let i = 0;
  while (i < lines.length) {
    const head = lines[i];
    const headMatch = head.match(/^- id: (.+)$/);
    if (!headMatch) {
      throw new Error(`yaml-codec: expected an item to start with "- id: ...", got: ${head}`);
    }
    const id = unescapeScalar(headMatch[1]);
    const fields = new Map<string, string>();
    i += 1;
    while (i < lines.length && !lines[i].startsWith("- id: ")) {
      const line = lines[i];
      const m = line.match(/^ {2}([a-z_]+): (.*)$/);
      if (!m) {
        throw new Error(`yaml-codec: malformed field line: ${line}`);
      }
      fields.set(m[1], m[2]);
      i += 1;
    }

    const get = (key: StringKey): string => {
      const raw = fields.get(key);
      if (raw === undefined) throw new Error(`yaml-codec: item ${id} is missing required field "${key}"`);
      return unescapeScalar(raw);
    };
    const getArray = (key: ArrayKey): string[] => {
      const raw = fields.get(key);
      if (raw === undefined) throw new Error(`yaml-codec: item ${id} is missing required field "${key}"`);
      return parseArray(raw);
    };
    const verifyRaw = fields.get("verify");
    if (verifyRaw === undefined) throw new Error(`yaml-codec: item ${id} is missing required field "verify"`);
    const verify = verifyRaw === "null" ? null : unescapeScalar(verifyRaw);

    const stateRaw = get("state");
    if (!isBacklogState(stateRaw)) {
      throw new Error(`yaml-codec: item ${id} has an unknown state "${stateRaw}"`);
    }

    items.push({
      id,
      state: stateRaw as BacklogState,
      title: get("title"),
      owns: getArray("owns"),
      verify,
      blocked_by: getArray("blocked_by"),
      instrument: get("instrument"),
      from: get("from"),
      note: get("note"),
    });
  }
  return items;
}
