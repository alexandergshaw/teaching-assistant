import path from "node:path";
import { DOMParser, XMLSerializer, type Document as XmlDocument, type Element as XmlElement } from "@xmldom/xmldom";
import JSZip from "jszip";
import { assertContainerWithinCaps, createZipBudget, readOfficeMember, ZipCapError } from "@/lib/zip-caps";

const C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const PKG_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export interface UploadedSlideChartData { seriesName: string; categories: string[]; values: number[] }
export interface ChartInspection { data?: UploadedSlideChartData; reason?: string; chartMember?: string; workbookMember?: string; sheetMember?: string }
export type ChartOperation = { objectId: string; kind: "chart"; action: "setData"; data: UploadedSlideChartData };

export class UploadedSlideChartError extends Error {
  constructor(readonly code: "unsupported_chart" | "invalid_operation" | "invalid_package") {
    super(code);
    this.name = "UploadedSlideChartError";
  }
}

function parseXml(xml: string): XmlDocument {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new UploadedSlideChartError("invalid_package");
  let failed = false;
  const doc = new DOMParser({ onError: () => { failed = true; } }).parseFromString(xml, "application/xml");
  if (failed || !doc.documentElement || doc.getElementsByTagName("parsererror").length) throw new UploadedSlideChartError("invalid_package");
  return doc;
}
function descendants(root: XmlDocument | XmlElement, ns: string, local: string): XmlElement[] { return Array.from(root.getElementsByTagNameNS(ns, local)); }
function children(parent: XmlElement, ns: string, local: string): XmlElement[] {
  const result: XmlElement[] = [];
  for (let child = parent.firstChild; child; child = child.nextSibling) if (child.nodeType === 1 && (child as XmlElement).namespaceURI === ns && (child as XmlElement).localName === local) result.push(child as XmlElement);
  return result;
}
function one(root: XmlDocument | XmlElement, ns: string, local: string): XmlElement {
  const found = descendants(root, ns, local);
  if (found.length !== 1) throw new UploadedSlideChartError("unsupported_chart");
  return found[0]!;
}
function requiredAttribute(node: XmlElement, name: string): string {
  const value = node.getAttribute(name);
  if (value === null) throw new UploadedSlideChartError("unsupported_chart");
  return value;
}
function requiredAttributeNS(node: XmlElement, ns: string, name: string): string {
  const value = node.getAttributeNS(ns, name);
  if (value === null) throw new UploadedSlideChartError("unsupported_chart");
  return value;
}
function requiredLocalName(node: XmlElement): string {
  const value = node.localName;
  if (value === null) throw new UploadedSlideChartError("unsupported_chart");
  return value;
}
function resolveMember(source: string, target: string, rootPrefix: string): string {
  if (!target || target.includes("\\") || /[%?#]/.test(target)) throw new UploadedSlideChartError("unsupported_chart");
  const member = target.startsWith("/") ? path.posix.normalize(target.slice(1)) : path.posix.normalize(path.posix.join(path.posix.dirname(source), target));
  if (!member.startsWith(rootPrefix) || member.startsWith("../") || path.posix.isAbsolute(member)) throw new UploadedSlideChartError("unsupported_chart");
  return member;
}
async function readDoc(zip: JSZip, member: string, budget: ReturnType<typeof createZipBudget>): Promise<XmlDocument> {
  const file = zip.file(member);
  if (!file || file.dir) throw new UploadedSlideChartError("unsupported_chart");
  return parseXml((await readOfficeMember(file, member, budget)).toString("utf8"));
}
function relationshipMap(doc: XmlDocument): Map<string, { type: string; target: string; external: boolean }> {
  const result = new Map<string, { type: string; target: string; external: boolean }>();
  for (const rel of descendants(doc, REL, "Relationship")) {
    const id = requiredAttribute(rel, "Id");
    if (!id || result.has(id)) throw new UploadedSlideChartError("unsupported_chart");
    result.set(id, { type: requiredAttribute(rel, "Type"), target: requiredAttribute(rel, "Target"), external: (rel.getAttribute("TargetMode") ?? "").toLowerCase() === "external" });
  }
  return result;
}
function chartPaths(slideMember: string): { slideRels: string; prefix: string } {
  return { slideRels: slideMember.replace(/^ppt\/slides\//, "ppt/slides/_rels/") + ".rels", prefix: "ppt/charts/" };
}
interface ResolvedChart { chartMember: string; workbookMember: string; sheetMember: string; chart: XmlDocument; sheet: XmlDocument }

async function resolveChart(zip: JSZip, slideMember: string, chartRelId: string, budget: ReturnType<typeof createZipBudget>): Promise<ResolvedChart> {
  const { slideRels, prefix } = chartPaths(slideMember);
  const slideRelations = relationshipMap(await readDoc(zip, slideRels, budget));
  const chartRel = slideRelations.get(chartRelId);
  if (!chartRel || chartRel.external || !chartRel.type.endsWith("/chart")) throw new UploadedSlideChartError("unsupported_chart");
  const chartMember = resolveMember(slideMember, chartRel.target, prefix);
  const chart = await readDoc(zip, chartMember, budget);
  const chartData = one(chart, C, "chart");
  const plot = one(chartData, C, "plotArea");
  const barCharts = children(plot, C, "barChart");
  const allowedPlotChildren = new Set(["layout", "barChart", "catAx", "valAx", "spPr"]);
  if (barCharts.length !== 1 || Array.from(plot.childNodes).some((node) => node.nodeType === 1 && (node as XmlElement).namespaceURI === C && !allowedPlotChildren.has(requiredLocalName(node as XmlElement)))) throw new UploadedSlideChartError("unsupported_chart");
  const bar = barCharts[0]!;
  if (requiredAttribute(one(bar, C, "barDir"), "val") !== "col" || requiredAttribute(one(bar, C, "grouping"), "val") !== "clustered" || children(bar, C, "ser").length !== 1) throw new UploadedSlideChartError("unsupported_chart");
  const categoryAxes = children(plot, C, "catAx"), valueAxes = children(plot, C, "valAx"), chartAxes = children(bar, C, "axId").map((axis) => requiredAttribute(axis, "val"));
  if (categoryAxes.length !== 1 || valueAxes.length !== 1 || children(plot, C, "dateAx").length || children(plot, C, "serAx").length || chartAxes.length !== 2 || new Set(chartAxes).size !== 2 || !chartAxes.includes(requiredAttribute(one(categoryAxes[0]!, C, "axId"), "val")) || !chartAxes.includes(requiredAttribute(one(valueAxes[0]!, C, "axId"), "val"))) throw new UploadedSlideChartError("unsupported_chart");
  const external = one(chart, C, "externalData");
  const workbookRelId = requiredAttributeNS(external, R, "id");
  const chartRelsMember = chartMember.replace(/^ppt\/charts\//, "ppt/charts/_rels/") + ".rels";
  const chartRelations = relationshipMap(await readDoc(zip, chartRelsMember, budget));
  const workbookRel = chartRelations.get(workbookRelId);
  if (!workbookRel || workbookRel.external || !workbookRel.type.endsWith("/package")) throw new UploadedSlideChartError("unsupported_chart");
  const workbookMember = resolveMember(chartMember, workbookRel.target, "ppt/embeddings/");
  const workbookBytes = await zip.file(workbookMember)?.async("nodebuffer");
  if (!workbookBytes) throw new UploadedSlideChartError("unsupported_chart");
  const workbook = await JSZip.loadAsync(workbookBytes);
  assertContainerWithinCaps(workbook, "office-file");
  const workbookBudget = createZipBudget();
  if (workbook.file("xl/sharedStrings.xml") || workbook.file("xl/tables/")) throw new UploadedSlideChartError("unsupported_chart");
  const workbookXml = await readDoc(workbook, "xl/workbook.xml", workbookBudget);
  if (descendants(workbookXml, S, "definedNames").length || descendants(workbookXml, S, "sheet").length !== 1) throw new UploadedSlideChartError("unsupported_chart");
  const sheet = one(workbookXml, S, "sheet");
  if (sheet.getAttribute("name") !== "Sheet1" || (sheet.getAttribute("state") && sheet.getAttribute("state") !== "visible")) throw new UploadedSlideChartError("unsupported_chart");
  const workbookRels = relationshipMap(await readDoc(workbook, "xl/_rels/workbook.xml.rels", workbookBudget));
  if ([...workbookRels.values()].some((rel) => rel.external) || Object.keys(workbook.files).some((name) => name.startsWith("xl/externalLinks/"))) throw new UploadedSlideChartError("unsupported_chart");
  const sheetRel = workbookRels.get(requiredAttributeNS(sheet, PKG_R, "id"));
  if (!sheetRel || sheetRel.external || !sheetRel.type.endsWith("/worksheet")) throw new UploadedSlideChartError("unsupported_chart");
  const sheetMember = resolveMember("xl/workbook.xml", sheetRel.target, "xl/worksheets/");
  const sheetDoc = await readDoc(workbook, sheetMember, workbookBudget);
  const hidden = (node: XmlElement) => ["1", "true"].includes((node.getAttribute("hidden") || "").toLowerCase());
  if (descendants(sheetDoc, S, "formula").length || descendants(sheetDoc, S, "f").length || descendants(sheetDoc, S, "mergeCell").length || descendants(sheetDoc, S, "tablePart").length || descendants(sheetDoc, S, "row").some(hidden) || descendants(sheetDoc, S, "col").some(hidden)) throw new UploadedSlideChartError("unsupported_chart");
  return { chartMember, workbookMember, sheetMember, chart, sheet: sheetDoc };
}

function cell(doc: XmlDocument, address: string): XmlElement {
  const found = descendants(doc, S, "c").filter((node) => node.getAttribute("r") === address);
  if (found.length !== 1) throw new UploadedSlideChartError("unsupported_chart");
  return found[0]!;
}
function cellValue(doc: XmlDocument, address: string, kind: "text" | "number"): string | number {
  const target = cell(doc, address);
  if (kind === "text") {
    if (target.getAttribute("t") !== "inlineStr" || descendants(target, S, "v").length) throw new UploadedSlideChartError("unsupported_chart");
    const text = descendants(target, S, "t");
    if (text.length !== 1) throw new UploadedSlideChartError("unsupported_chart");
    return text[0]!.textContent ?? "";
  }
  if (target.hasAttribute("t") || descendants(target, S, "is").length || descendants(target, S, "v").length !== 1) throw new UploadedSlideChartError("unsupported_chart");
  const value = Number(descendants(target, S, "v")[0]!.textContent);
  if (!Number.isFinite(value)) throw new UploadedSlideChartError("unsupported_chart");
  return value;
}
function parseFormula(ref: XmlElement, expectedColumn: "A" | "B", expectedStartRow: number, expectedEndRow: number): void {
  const formula = descendants(ref, C, "f");
  if (formula.length !== 1) throw new UploadedSlideChartError("unsupported_chart");
  const raw = (formula[0]!.textContent ?? "").replace(/^\$/, "");
  const escaped = raw.match(/^'((?:[^']|'')+)'!\$([A-Z]+)\$(\d+)(?::\$([A-Z]+)\$(\d+))?$/);
  const plain = raw.match(/^([A-Za-z_][A-Za-z0-9_.]*)!\$([A-Z]+)\$(\d+)(?::\$([A-Z]+)\$(\d+))?$/);
  const match = escaped ?? plain;
  if (!match || match[1]!.replace(/''/g, "'") !== "Sheet1" || match[2] !== expectedColumn || Number(match[3]) !== expectedStartRow || (expectedStartRow !== expectedEndRow && (match[4] !== expectedColumn || Number(match[5]) !== expectedEndRow)) || (expectedStartRow === expectedEndRow && match[4] !== undefined)) throw new UploadedSlideChartError("unsupported_chart");
}
function cachePoints(cache: XmlElement, numeric: boolean): Array<{ index: number; value: string | number }> {
  const points = descendants(cache, C, "pt").map((point) => {
    const idx = Number(point.getAttribute("idx"));
    const value = one(point, C, "v").textContent ?? "";
    if (!Number.isSafeInteger(idx) || idx < 0) throw new UploadedSlideChartError("unsupported_chart");
    if (!numeric) return { index: idx, value };
    const number = Number(value);
    if (!Number.isFinite(number)) throw new UploadedSlideChartError("unsupported_chart");
    return { index: idx, value: number };
  });
  if (new Set(points.map(({ index }) => index)).size !== points.length || points.some(({ index }) => index >= points.length)) throw new UploadedSlideChartError("unsupported_chart");
  const pointCount = descendants(cache, C, "ptCount");
  if (pointCount.length !== 1 || Number(pointCount[0]!.getAttribute("val")) !== points.length) throw new UploadedSlideChartError("unsupported_chart");
  return points.sort((a, b) => a.index - b.index);
}
function chartData(resolved: ResolvedChart): UploadedSlideChartData {
  const chart = resolved.chart;
  const bar = one(chart, C, "barChart");
  const series = one(bar, C, "ser");
  const tx = one(series, C, "tx"), cat = one(series, C, "cat"), val = one(series, C, "val");
  const txRef = one(tx, C, "strRef"), catRef = one(cat, C, "strRef"), valRef = one(val, C, "numRef");
  const name = String(cellValue(resolved.sheet, "B1", "text"));
  const cellAddresses = descendants(resolved.sheet, S, "c").map((item) => requiredAttribute(item, "r"));
  const categoryCells = cellAddresses.filter((address) => /^A[2-9]\d*$|^A\d+$/.test(address)).map((address) => Number(address.slice(1))).sort((a, b) => a - b);
  const valueCells = cellAddresses.filter((address) => /^B\d+$/.test(address) && Number(address.slice(1)) >= 2).map((address) => Number(address.slice(1))).sort((a, b) => a - b);
  if (categoryCells.length < 1 || categoryCells.some((row, i) => row !== i + 2) || valueCells.length !== categoryCells.length || valueCells.some((row, i) => row !== i + 2)) throw new UploadedSlideChartError("unsupported_chart");
  const expectedAddresses = new Set(["B1", ...categoryCells.flatMap((row) => [`A${row}`, `B${row}`])]);
  if (cellAddresses.some((address) => !expectedAddresses.has(address)) || cellAddresses.length !== expectedAddresses.size) throw new UploadedSlideChartError("unsupported_chart");
  const last = categoryCells.length + 1;
  parseFormula(txRef, "B", 1, 1); parseFormula(catRef, "A", 2, last); parseFormula(valRef, "B", 2, last);
  const txCache = one(txRef, C, "strCache"), catCache = one(catRef, C, "strCache"), valCache = one(valRef, C, "numCache");
  const names = cachePoints(txCache, false), cats = cachePoints(catCache, false), nums = cachePoints(valCache, true);
  if (names.length !== 1 || names[0]!.value !== name || cats.length !== categoryCells.length || nums.length !== categoryCells.length) throw new UploadedSlideChartError("unsupported_chart");
  const categories: string[] = [], values: number[] = [];
  for (let i = 0; i < categoryCells.length; i += 1) {
    const category = String(cellValue(resolved.sheet, `A${i + 2}`, "text"));
    const value = Number(cellValue(resolved.sheet, `B${i + 2}`, "number"));
    if (cats[i]!.index !== i || cats[i]!.value !== category || nums[i]!.index !== i || nums[i]!.value !== value) throw new UploadedSlideChartError("unsupported_chart");
    categories.push(category); values.push(value);
  }
  return { seriesName: name, categories, values };
}

export async function inspectUploadedSlideChart(bytes: Buffer, slideMember: string, chartRelId: string): Promise<ChartInspection> {
  try {
    const zip = await JSZip.loadAsync(bytes); assertContainerWithinCaps(zip, "office-file");
    const resolved = await resolveChart(zip, slideMember, chartRelId, createZipBudget());
    return { data: chartData(resolved), chartMember: resolved.chartMember, workbookMember: resolved.workbookMember, sheetMember: resolved.sheetMember };
  } catch (error) {
    if (error instanceof ZipCapError) return { reason: "This chart exceeds the editor's package limits and is read-only." };
    return { reason: "Only simple clustered column charts with a matching embedded Sheet1 data table can be edited; this chart is retained read-only." };
  }
}

function validateData(value: unknown, existing: UploadedSlideChartData): UploadedSlideChartData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new UploadedSlideChartError("invalid_operation");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "categories,seriesName,values" || typeof record.seriesName !== "string" || !record.seriesName.trim() || record.seriesName.length > 120 || !Array.isArray(record.categories) || !Array.isArray(record.values) || record.categories.length !== existing.categories.length || record.values.length !== existing.values.length) throw new UploadedSlideChartError("invalid_operation");
  if (record.categories.some((label) => typeof label !== "string" || !label.trim() || label.length > 120) || record.values.some((number) => typeof number !== "number" || !Number.isFinite(number) || Math.abs(number) > 1e12)) throw new UploadedSlideChartError("invalid_operation");
  return { seriesName: record.seriesName.trim(), categories: record.categories as string[], values: record.values as number[] };
}
function setCell(doc: XmlDocument, address: string, value: string | number): void {
  const target = cell(doc, address);
  const valueNodes = children(target, S, "v"), inlineNodes = children(target, S, "is");
  for (const node of [...valueNodes, ...inlineNodes]) target.removeChild(node);
  if (typeof value === "string") {
    target.setAttribute("t", "inlineStr");
    const inline = doc.createElementNS(S, "is"), text = doc.createElementNS(S, "t");
    if (/^\s|\s$/.test(value)) text.setAttribute("xml:space", "preserve");
    text.appendChild(doc.createTextNode(value)); inline.appendChild(text); target.appendChild(inline);
  } else {
    target.removeAttribute("t"); const node = doc.createElementNS(S, "v"); node.appendChild(doc.createTextNode(String(value))); target.appendChild(node);
  }
}
function updateCache(cache: XmlElement, values: Array<string | number>): void {
  const points = descendants(cache, C, "pt");
  if (points.length !== values.length) throw new UploadedSlideChartError("unsupported_chart");
  points.sort((a, b) => Number(a.getAttribute("idx")) - Number(b.getAttribute("idx")));
  points.forEach((point, index) => { one(point, C, "v").textContent = String(values[index]); });
}

export async function applyUploadedSlideChartOperation(bytes: Buffer, slideMember: string, slideNumber: number, identityPackageKey: string, operation: ChartOperation): Promise<{ bytes: Buffer; changedMembers: string[] }> {
  try {
    const identity = typeof operation.objectId === "string" ? operation.objectId.match(new RegExp(`^${identityPackageKey}:s(\\d+):o(\\d+):chart$`)) : null;
    if (!identity || operation.kind !== "chart" || operation.action !== "setData") throw new UploadedSlideChartError("invalid_operation");
    const zip = await JSZip.loadAsync(bytes); assertContainerWithinCaps(zip, "office-file");
    const budget = createZipBudget();
    const slideDoc = await readDoc(zip, slideMember, budget);
    const chartFrame = descendants(slideDoc, "http://schemas.openxmlformats.org/presentationml/2006/main", "graphicFrame").find((frame) => {
      const nv = descendants(frame, "http://schemas.openxmlformats.org/presentationml/2006/main", "cNvPr")[0];
      return nv?.getAttribute("id") === identity[2] && descendants(frame, C, "chart").length === 1;
    });
    const chartRelationshipId = chartFrame && descendants(chartFrame, C, "chart")[0]!.getAttributeNS(R, "id");
    if (!chartRelationshipId || Number(identity[1]) !== slideNumber) throw new UploadedSlideChartError("invalid_operation");
    const resolved = await resolveChart(zip, slideMember, chartRelationshipId, budget);
    const current = chartData(resolved), next = validateData(operation.data, current);
    // Mutate only the embedded worksheet and the three chart caches. No other
    // package member or chart formatting property is rewritten.
    const bar = one(resolved.chart, C, "barChart"), ser = one(bar, C, "ser");
    const txRef = one(one(ser, C, "tx"), C, "strRef"), catRef = one(one(ser, C, "cat"), C, "strRef"), valRef = one(one(ser, C, "val"), C, "numRef");
    const last = next.categories.length + 1;
    setCell(resolved.sheet, "B1", next.seriesName);
    next.categories.forEach((category, index) => { setCell(resolved.sheet, `A${index + 2}`, category); setCell(resolved.sheet, `B${index + 2}`, next.values[index]!); });
    updateCache(one(txRef, C, "strCache"), [next.seriesName]); updateCache(one(catRef, C, "strCache"), next.categories); updateCache(one(valRef, C, "numCache"), next.values);
    if (last !== current.categories.length + 1) throw new UploadedSlideChartError("invalid_operation");
    const workbook = await JSZip.loadAsync(await zip.file(resolved.workbookMember)!.async("nodebuffer"));
    const sheetEntry = workbook.file(resolved.sheetMember); const chartEntry = zip.file(resolved.chartMember);
    if (!sheetEntry || !chartEntry) throw new UploadedSlideChartError("unsupported_chart");
    workbook.file(resolved.sheetMember, new XMLSerializer().serializeToString(resolved.sheet));
    zip.file(resolved.workbookMember, await workbook.generateAsync({ type: "nodebuffer" }));
    zip.file(resolved.chartMember, new XMLSerializer().serializeToString(resolved.chart));
    const output = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    return { bytes: output, changedMembers: [resolved.chartMember, resolved.workbookMember] };
  } catch (error) {
    if (error instanceof UploadedSlideChartError) throw error;
    if (error instanceof ZipCapError) throw new UploadedSlideChartError("invalid_package");
    throw new UploadedSlideChartError("invalid_package");
  }
}
