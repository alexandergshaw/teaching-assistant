import { CastletopPlan } from "./castletop-plan";

const ACCOUNTING = '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)';
const YELLOW = "FFFFFF99";
const BOLD = { name: "Calibri", size: 11, bold: true };
const BORDER_GRAY = "FFBFBFBF";
const THIN_GRAY: { style: "thin"; color: { argb: string } } = {
  style: "thin",
  color: { argb: BORDER_GRAY },
};

export async function buildCastletopWorkbook(
  plan: CastletopPlan
): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(plan.sheetName);

  // Header: A1 title
  ws.getCell("A1").value = plan.title;
  ws.getCell("A1").font = BOLD;

  // Merge cells and set column headers
  ws.mergeCells("C2:E2");
  ws.mergeCells("F2:G2");
  ws.mergeCells("H2:I2");
  ws.getCell("C2").value = "Pre class work";
  ws.getCell("F2").value = "In class work";
  ws.getCell("H2").value = "After class work";
  ws.getCell("J2").value = "Points";
  ws.getCell("K2").value = "In class hours";
  ws.getCell("L2").value = "Out of class hours";
  ws.getCell("M2").value = "Total";
  ws.getCell("N2").value = "Weekly total";

  // Center and bold the merged header cells
  for (const a of ["C2", "F2", "H2"]) {
    ws.getCell(a).alignment = { horizontal: "center" };
  }
  for (const a of ["C2", "F2", "H2", "J2", "K2", "L2", "M2", "N2"]) {
    ws.getCell(a).font = BOLD;
  }

  // Row 3 headers (bold)
  ws.getCell("B3").value = "Qty";
  ws.getCell("C3").value = "Assignment";
  ws.getCell("E3").value = "min.";
  ws.getCell("F3").value = "Assignment";
  ws.getCell("G3").value = "min.";
  ws.getCell("H3").value = "Assignment ";
  ws.getCell("I3").value = "min.";
  ws.getCell("K3").value = plan.contactMinutes;

  for (const a of ["B3", "C3", "E3", "F3", "G3", "H3", "I3"]) {
    ws.getCell(a).font = BOLD;
  }
  ws.getCell("C3").alignment = { horizontal: "center" };
  ws.getCell("C3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };

  // Set column widths
  const widths: Record<string, number> = {
    A: 3.71,
    B: 4.14,
    C: 32.14,
    D: 4.29,
    E: 8.0,
    F: 30.29,
    G: 5.0,
    H: 53.86,
    I: 6.86,
    J: 6.43,
    K: 8.29,
    // L/M/N are not part of the reference-verified width set (entry 56 covers
    // A-K only). They carry the same accounting-formatted numeric content as
    // K, so K's verified width is reused here for legibility, not parity.
    L: 8.29,
    M: 8.29,
    N: 8.29,
  };
  for (const [col, w] of Object.entries(widths)) {
    ws.getColumn(col).width = w;
  }

  // Freeze panes below header
  ws.views = [{ state: "frozen", ySplit: 3 }];

  // Content rows per week
  let row = 4;
  const totalRows: number[] = [];

  for (const wk of plan.weeks) {
    const first = row;
    const last = row + plan.blockRows - 1;
    const totalRow = last + 1;

    for (let i = 0; i < plan.blockRows; i++) {
      const r = row + i;
      const pre = wk.preClass[i];
      const inc = wk.inClass[i];
      const aft = wk.afterClass[i];

      if (pre) {
        ws.getCell(`C${r}`).value = pre.assignment;
        ws.getCell(`C${r}`).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: YELLOW },
        };
        if (pre.qty != null && pre.rate != null) {
          ws.getCell(`B${r}`).value = pre.qty;
          ws.getCell(`D${r}`).value = pre.rate;
          ws.getCell(`E${r}`).value = { formula: `(B${r}/D${r})*60` };
        }
      }

      if (inc) {
        ws.getCell(`F${r}`).value = inc.assignment;
        ws.getCell(`G${r}`).value = inc.minutes;
      }

      if (aft) {
        ws.getCell(`H${r}`).value = aft.assignment;
        ws.getCell(`I${r}`).value = aft.minutes;
        if (aft.points != null) {
          ws.getCell(`J${r}`).value = aft.points;
        }
      }

      // Formulas for hour calculations
      ws.getCell(`K${r}`).value = { formula: `G${r}/$K$3` };
      ws.getCell(`L${r}`).value = { formula: `(E${r}+I${r})/$K$3` };
      ws.getCell(`M${r}`).value = { formula: `L${r}+K${r}` };

      for (const c of ["E", "K", "L", "M"]) {
        ws.getCell(`${c}${r}`).numFmt = ACCOUNTING;
      }
    }

    // Total row for the week
    ws.getCell(`I${totalRow}`).value = "Total";
    ws.getCell(`K${totalRow}`).value = { formula: `SUM(K${first}:K${last})` };
    ws.getCell(`L${totalRow}`).value = { formula: `SUM(L${first}:L${last})` };
    ws.getCell(`M${totalRow}`).value = { formula: `SUM(M${first}:M${last})` };
    ws.getCell(`N${totalRow}`).value = { formula: `M${totalRow}` };

    for (const c of ["I", "K", "L", "M", "N"]) {
      ws.getCell(`${c}${totalRow}`).font = BOLD;
      if (c !== "I") {
        ws.getCell(`${c}${totalRow}`).numFmt = ACCOUNTING;
      }
    }

    // Thin gray separator under each week's total row
    for (const c of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"]) {
      ws.getCell(`${c}${totalRow}`).border = { bottom: THIN_GRAY };
    }

    // Merge and style week label column
    ws.mergeCells(`A${first}:A${totalRow}`);
    ws.getCell(`A${first}`).value = wk.label;
    ws.getCell(`A${first}`).font = BOLD;
    ws.getCell(`A${first}`).alignment = { horizontal: "center", vertical: "top" };

    totalRows.push(totalRow);
    row = totalRow + 1;
  }

  // Grand totals (skip entirely when there are no weeks)
  if (plan.weeks.length > 0) {
    const lastBlockRow = row - 1;
    const labelRow = lastBlockRow + 3;
    const grandRow = labelRow + 1;
    const avgRow = grandRow + 1;

    ws.getCell(`K${labelRow}`).value = "In ";
    ws.getCell(`L${labelRow}`).value = "Out";
    ws.getCell(`M${labelRow}`).value = "Total";
    for (const c of ["K", "L", "M"]) {
      ws.getCell(`${c}${labelRow}`).font = BOLD;
    }

    ws.mergeCells(`H${grandRow}:I${grandRow}`);
    ws.getCell(`H${grandRow}`).value = "Grand Totals";
    ws.getCell(`H${grandRow}`).alignment = { horizontal: "right" };
    ws.getCell(`H${grandRow}`).font = BOLD;

    // Grand total formulas in REVERSE week order
    const kFormulaParts = totalRows
      .slice()
      .reverse()
      .map((r) => `K${r}`);
    const lFormulaParts = totalRows
      .slice()
      .reverse()
      .map((r) => `L${r}`);

    ws.getCell(`K${grandRow}`).value = { formula: kFormulaParts.join("+") };
    ws.getCell(`L${grandRow}`).value = { formula: lFormulaParts.join("+") };
    ws.getCell(`M${grandRow}`).value = { formula: `SUM(N4:N${lastBlockRow + 2})` };

    ws.getCell(`L${avgRow}`).value = "Average";
    ws.getCell(`L${avgRow}`).font = BOLD;
    ws.getCell(`M${avgRow}`).value = {
      formula: `M${grandRow}/${plan.weeks.length}`,
    };

    // Format grand total and average rows
    for (const c of ["K", "L", "M"]) {
      ws.getCell(`${c}${grandRow}`).font = BOLD;
      ws.getCell(`${c}${grandRow}`).numFmt = ACCOUNTING;
    }
    ws.getCell(`M${avgRow}`).font = BOLD;
    ws.getCell(`M${avgRow}`).numFmt = ACCOUNTING;

    // Light gray frame around the grand-total block (restrained separator,
    // not a design statement - borders are not on entry 56's verified list)
    for (const r of [labelRow, grandRow, avgRow]) {
      for (const c of ["H", "I", "J", "K", "L", "M"]) {
        const cellBorder: {
          top?: typeof THIN_GRAY;
          bottom?: typeof THIN_GRAY;
          left?: typeof THIN_GRAY;
          right?: typeof THIN_GRAY;
        } = {};
        if (r === labelRow) cellBorder.top = THIN_GRAY;
        if (r === avgRow) cellBorder.bottom = THIN_GRAY;
        if (c === "H") cellBorder.left = THIN_GRAY;
        if (c === "M") cellBorder.right = THIN_GRAY;
        ws.getCell(`${c}${r}`).border = cellBorder;
      }
    }
  }

  // Write to buffer and return as real ArrayBuffer
  const buffer = await wb.xlsx.writeBuffer();
  if (buffer instanceof ArrayBuffer) {
    return buffer;
  }
  // If it's a Node.js Buffer, convert to ArrayBuffer
  const bufferTyped = buffer as {
    buffer: ArrayBuffer;
    byteOffset: number;
    byteLength: number;
  };
  return bufferTyped.buffer.slice(
    bufferTyped.byteOffset,
    bufferTyped.byteOffset + bufferTyped.byteLength
  );
}
