// Pure library for detecting, parsing, and manipulating LMS gradebook exports.
// Formats: Canvas, Brightspace, Blackboard (TSV), Moodle.
// fillGradebookCsv preserves every untouched byte.

export type GradebookFormat = "canvas" | "brightspace" | "blackboard" | "moodle" | "unknown";

export type StudentEntry = {
  row: number;
  name: string;
  externalId?: string;
  username?: string;
  email?: string;
};

export type ItemEntry = {
  column: number;
  header: string;
  name: string;
  pointsPossible: number | null;
};

export type ParsedGradebook = {
  format: GradebookFormat;
  delimiter: "," | "\t";
  students: StudentEntry[];
  items: ItemEntry[];
  cell(row: number, column: number): string;
};

// Mirrored from src/app/actions.ts for pure use without server imports
export type MissingAssignmentReport = {
  assignmentId: string;
  assignmentName: string;
  dueAt: string | null;
  pointsPossible: number | null;
  students: Array<{ userId?: number; name: string; email?: string }>;
};

export type FillGradebookResult = {
  csv: string;
  filled: number;
  unmatched: string[];
};

// Detect delimiter from first line (count tabs; if >=2, use tab, else comma)
function detectDelimiter(firstLine: string): "," | "\t" {
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  return tabCount >= 2 ? "\t" : ",";
}

// Parse CSV-like format with detected delimiter and track raw cell text for re-emit
// Returns an object with parsed cells AND raw text for each cell (including original quoting)
function parseCsvWithDelimiter(text: string, delimiter: string): {
  rows: string[][];
  rawCells: string[][]
} {
  const rows: string[][] = [];
  const rawCells: string[][] = [];
  let row: string[] = [];
  let rawRow: string[] = [];
  let cell = "";
  let rawCell = "";
  let inQuotes = false;
  let i = 0;

  const pushCell = () => {
    row.push(cell);
    rawRow.push(rawCell);
    cell = "";
    rawCell = "";
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    rawCells.push(rawRow);
    row = [];
    rawRow = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      rawCell += ch;
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          rawCell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      rawCell += ch;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      pushCell();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    cell += ch;
    rawCell += ch;
    i += 1;
  }

  // Flush final row
  if (cell.length > 0 || row.length > 0) pushRow();

  return { rows, rawCells };
}

// Strip brightspace/blackboard suffixes from header: remove " <...>" pattern
function stripItemSuffix(header: string): string {
  return header.replace(/\s*<[^>]*>$/, "");
}

export function detectGradebookFormat(headerCells: string[]): GradebookFormat {
  const headerStr = headerCells.join(" ").toLowerCase();

  // Blackboard: "|<digits>" suffix or "Total Pts:" in any header
  if (headerCells.some((h) => /\|\d+$/.test(h)) || headerStr.includes("total pts:")) {
    return "blackboard";
  }

  // Brightspace: OrgDefinedId header
  if (headerCells.some((h) => h.trim() === "OrgDefinedId")) {
    return "brightspace";
  }

  // Canvas: has Student and ID headers
  if (
    headerCells.some((h) => h.trim().toLowerCase() === "student") &&
    headerCells.some((h) => h.trim().toLowerCase() === "id")
  ) {
    return "canvas";
  }

  // Moodle: has Email address header
  if (headerCells.some((h) => h.trim() === "Email address")) {
    return "moodle";
  }

  return "unknown";
}

export function parseGradebookCsv(csv: string): ParsedGradebook {
  const lines = csv.split(/\r?\n/);
  const firstLine = lines[0] ?? "";
  const delimiter = detectDelimiter(firstLine);

  const { rows } = parseCsvWithDelimiter(csv, delimiter);

  if (rows.length === 0) {
    return {
      format: "unknown",
      delimiter,
      students: [],
      items: [],
      cell: () => "",
    };
  }

  const headerRow = rows[0];
  const format = detectGradebookFormat(headerRow);

  // Build cell access function
  const cellMap = new Map<string, string>();
  rows.forEach((row, rowIdx) => {
    row.forEach((val, colIdx) => {
      cellMap.set(`${rowIdx},${colIdx}`, val);
    });
  });

  const cell = (row: number, col: number): string => cellMap.get(`${row},${col}`) ?? "";

  // Find data columns by format
  const students: StudentEntry[] = [];
  const items: ItemEntry[] = [];

  if (format === "canvas") {
    // Canvas: Student, ID, then name columns like "Name (12345)"
    const studentColIdx = headerRow.findIndex((h) => h.trim().toLowerCase() === "student");
    const idColIdx = headerRow.findIndex((h) => h.trim().toLowerCase() === "id");
    const sisLoginIdColIdx = headerRow.findIndex((h) => h.trim() === "SIS Login ID");

    // Points Possible is in row 1 (second row)
    const ppRow = rows[1];

    for (let i = 0; i < headerRow.length; i++) {
      const h = headerRow[i];
      if (i === studentColIdx || i === idColIdx) continue;

      const match = h.match(/\((\d+)\)$/);
      if (match) {
        const ppStr = ppRow?.[i] ?? "";
        const pp = ppStr.trim() === "" ? null : parseFloat(ppStr);
        items.push({
          column: i,
          header: h,
          name: h.replace(/\s*\(\d+\)$/, "").trim(),
          pointsPossible: isNaN(pp ?? NaN) ? null : pp,
        });
      }
    }

    // Students: skip row 1 (Points Possible)
    for (let row = 2; row < rows.length; row++) {
      const r = rows[row];
      if (!r || r.length === 0) continue;
      const name = r[studentColIdx] ?? "";
      if (name.trim() === "") continue;

      const sisLoginIdValue = sisLoginIdColIdx >= 0 ? r[sisLoginIdColIdx]?.trim() : undefined;
      const email = sisLoginIdValue && sisLoginIdValue.includes("@") ? sisLoginIdValue : undefined;

      students.push({
        row,
        name: name.trim(),
        externalId: r[idColIdx]?.trim(),
        email,
      });
    }
  } else if (format === "brightspace") {
    // Brightspace: OrgDefinedId (and/or Username), item headers with "<...>" suffix (strip them)
    const idColIdx = headerRow.findIndex((h) => h.trim() === "OrgDefinedId");
    const usernameColIdx = headerRow.findIndex((h) => h.trim() === "Username");
    const emailColIdx = headerRow.findIndex((h) => h.trim() === "Email");

    for (let i = 0; i < headerRow.length; i++) {
      const h = headerRow[i];
      if (i === idColIdx || i === usernameColIdx || i === emailColIdx) continue;
      if (h.trim().toLowerCase() === "end-of-line indicator") continue;

      const stripped = stripItemSuffix(h);
      const ppMatch = h.match(/<Numeric MaxPoints:(\d+)>/);
      const pp = ppMatch ? parseInt(ppMatch[1], 10) : null;

      items.push({
        column: i,
        header: h,
        name: stripped,
        pointsPossible: pp,
      });
    }

    // Students: all data rows
    for (let row = 1; row < rows.length; row++) {
      const r = rows[row];
      if (!r || r.length === 0) continue;

      const orgId = idColIdx >= 0 ? r[idColIdx]?.trim() : undefined;
      const username = usernameColIdx >= 0 ? r[usernameColIdx]?.trim() : undefined;
      const emailValue = emailColIdx >= 0 ? r[emailColIdx]?.trim() : undefined;
      const email = emailValue && emailValue !== "" ? emailValue : undefined;

      // Use OrgDefinedId as externalId, Username as username; either can be present
      if ((orgId && orgId !== "") || (username && username !== "")) {
        students.push({
          row,
          name: orgId || username || "",
          externalId: orgId,
          username: username,
          email,
        });
      }
    }
  } else if (format === "blackboard") {
    // Blackboard: Username key, item headers with "|columnId" suffix (preserve it)
    const usernameColIdx = headerRow.findIndex((h) => h.trim().toLowerCase() === "username");

    for (let i = 0; i < headerRow.length; i++) {
      const h = headerRow[i];
      if (i === usernameColIdx) continue;

      // Strip suffix for name matching, but preserve full header for emit
      // Remove |columnId first, then strip any <...> suffixes
      const stripped = stripItemSuffix(h.replace(/\s*\|\d+$/, ""));

      items.push({
        column: i,
        header: h,
        name: stripped,
        pointsPossible: null, // Blackboard doesn't carry PP in header
      });
    }

    // Students: all data rows
    for (let row = 1; row < rows.length; row++) {
      const r = rows[row];
      if (!r || r.length === 0) continue;

      const username = r[usernameColIdx]?.trim() ?? "";
      if (username !== "") {
        students.push({
          row,
          name: username,
          username,
        });
      }
    }
  } else if (format === "moodle") {
    // Moodle: Email address identifier, free-form item columns
    const emailColIdx = headerRow.findIndex((h) => h.trim() === "Email address");

    for (let i = 0; i < headerRow.length; i++) {
      const h = headerRow[i];
      if (i === emailColIdx) continue;

      items.push({
        column: i,
        header: h,
        name: h,
        pointsPossible: null,
      });
    }

    // Students: all data rows
    for (let row = 1; row < rows.length; row++) {
      const r = rows[row];
      if (!r || r.length === 0) continue;

      const email = r[emailColIdx]?.trim() ?? "";
      if (email !== "") {
        students.push({
          row,
          name: email,
          email,
        });
      }
    }
  }

  return {
    format,
    delimiter,
    students,
    items,
    cell,
  };
}

export function missingFromGradebook(
  parsed: ParsedGradebook,
  itemName?: string
): MissingAssignmentReport[] {
  const itemsToCheck = itemName
    ? parsed.items.filter((item) => item.name.toLowerCase() === itemName.toLowerCase())
    : parsed.items;

  const reports: MissingAssignmentReport[] = [];

  for (const item of itemsToCheck) {
    const missing: MissingAssignmentReport["students"] = [];

    for (const student of parsed.students) {
      const cellValue = parsed.cell(student.row, item.column).trim();
      if (cellValue === "") {
        missing.push({
          userId: undefined,
          name: student.name,
          email: student.email,
        });
      }
    }

    if (missing.length > 0) {
      reports.push({
        assignmentId: item.header,
        assignmentName: item.name,
        dueAt: null,
        pointsPossible: item.pointsPossible,
        students: missing,
      });
    }
  }

  return reports;
}

// Quote a CSV cell if it contains the delimiter, a double-quote, or a newline
function quoteCsvCell(cell: string, delimiter: string): string {
  if (cell.includes(delimiter) || cell.includes('"') || cell.includes("\n")) {
    return '"' + cell.replace(/"/g, '""') + '"';
  }
  return cell;
}

// Match student by externalId > username > email > exact name (case-insensitive)
function matchStudent(
  parsed: ParsedGradebook,
  score: {
    name?: string;
    externalId?: string;
    username?: string;
    email?: string;
  }
): StudentEntry | undefined {
  if (score.externalId) {
    const found = parsed.students.find(
      (s) => s.externalId && s.externalId.toLowerCase() === score.externalId!.toLowerCase()
    );
    if (found) return found;
  }

  if (score.username) {
    const found = parsed.students.find(
      (s) => s.username && s.username.toLowerCase() === score.username!.toLowerCase()
    );
    if (found) return found;
  }

  if (score.email) {
    const found = parsed.students.find(
      (s) => s.email && s.email.toLowerCase() === score.email!.toLowerCase()
    );
    if (found) return found;
  }

  if (score.name) {
    const found = parsed.students.find(
      (s) => s.name.toLowerCase() === score.name!.toLowerCase()
    );
    if (found) return found;
  }

  return undefined;
}

// Match item by name (case-insensitive), stripping suffixes on both sides
function matchItem(parsed: ParsedGradebook, itemName: string): ItemEntry | undefined {
  const targetName = stripItemSuffix(itemName).toLowerCase();

  for (const item of parsed.items) {
    const itemNameStripped = stripItemSuffix(item.name).toLowerCase();
    if (itemNameStripped === targetName) {
      return item;
    }
  }

  return undefined;
}

export function fillGradebookCsv(
  originalCsv: string,
  scores: Array<{
    name?: string;
    externalId?: string;
    username?: string;
    email?: string;
    itemName: string;
    score: string;
  }>
): FillGradebookResult {
  const parsed = parseGradebookCsv(originalCsv);
  const { rows, rawCells } = parseCsvWithDelimiter(originalCsv, parsed.delimiter);

  // Build a map of row,col -> new value for matched scores
  const updateMap = new Map<string, string>();
  const unmatched: string[] = [];
  let filled = 0;

  for (const score of scores) {
    const student = matchStudent(parsed, score);
    const item = matchItem(parsed, score.itemName);

    if (!student || !item) {
      unmatched.push(`${score.name || score.externalId || score.email || "?"} / ${score.itemName}`);
      continue;
    }

    const key = `${student.row},${item.column}`;
    updateMap.set(key, score.score);
    filled++;
  }

  // Rebuild CSV from logical rows: for each cell, use raw original if untouched,
  // or the new value (re-quoted) if updated
  const outputLines: string[] = [];
  const delimiter = parsed.delimiter;

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const rawRow = rawCells[rowIdx];
    if (!row) continue;

    // Build this row by combining updated and untouched cells
    const outputCells: string[] = [];
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const key = `${rowIdx},${colIdx}`;
      if (updateMap.has(key)) {
        // Updated cell: use new value, re-quoted
        const newValue = updateMap.get(key)!;
        outputCells.push(quoteCsvCell(newValue, delimiter));
      } else {
        // Untouched cell: use original raw text (preserves quoting)
        outputCells.push(rawRow?.[colIdx] ?? "");
      }
    }

    outputLines.push(outputCells.join(delimiter));
  }

  // Preserve line endings as in original
  let csv: string;
  if (originalCsv.includes("\r\n")) {
    csv = outputLines.join("\r\n");
    // Add final CRLF if original had it
    if (originalCsv.endsWith("\r\n") && !csv.endsWith("\r\n")) {
      csv += "\r\n";
    }
  } else {
    csv = outputLines.join("\n");
    // Add final LF if original had it
    if (originalCsv.endsWith("\n") && !csv.endsWith("\n")) {
      csv += "\n";
    }
  }

  return {
    csv,
    filled,
    unmatched,
  };
}

export function buildCanvasGradebookCsv(
  students: Array<{ name: string; externalId: string }>,
  item: { name: string; pointsPossible: number },
  scores: Map<string, string>
): string {
  const delimiter = ",";
  const headerRow = ["Student", "ID", `${item.name} (${item.pointsPossible})`];
  const ppRow = ["", "", "Points Possible"];

  const rows = [headerRow, ppRow];

  for (const student of students) {
    const score = scores.get(student.externalId) ?? "";
    rows.push([student.name, student.externalId, score]);
  }

  return rows.map((r) => r.map((c) => quoteCsvCell(c, delimiter)).join(delimiter)).join("\n") + "\n";
}

export function buildMoodleGradebookCsv(
  students: Array<{ email: string }>,
  itemName: string,
  scores: Map<string, string>
): string {
  const delimiter = ",";
  const headerRow = ["Email address", itemName];
  const rows = [headerRow];

  for (const student of students) {
    const score = scores.get(student.email) ?? "";
    rows.push([student.email, score]);
  }

  return rows.map((r) => r.map((c) => quoteCsvCell(c, delimiter)).join(delimiter)).join("\n") + "\n";
}
