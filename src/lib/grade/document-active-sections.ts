import { SaxesParser } from "saxes";

const WORD = new Set(["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"]);
const OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const OFFICE_REL_STRICT = "http://purl.oclc.org/ooxml/officeDocument/relationships";
const PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

/** Resolve section header/footer references only; orphan parts are not evidence. */
export function activeDocxHeaderFooterPaths(documentXml: string, relationshipsXml: string | null): string[] {
  if (!/<(?:[\w.-]+:)?(?:headerReference|footerReference)\b/.test(documentXml)) return [];
  const refs = new Map<string, string>();
  const ancestors: string[] = [];
  const document = new SaxesParser({ xmlns: true });
  document.on("doctype", () => { throw new Error("DTD not supported"); });
  document.on("opentag", (tag) => {
    const local = WORD.has(tag.uri) ? tag.local : "";
    if ((local === "headerReference" || local === "footerReference") && ancestors.at(-1) === "sectPr" && !ancestors.includes("sectPrChange")) {
      const id = Object.values(tag.attributes).find((attr) => (attr.uri === OFFICE_REL || attr.uri === OFFICE_REL_STRICT) && attr.local === "id")?.value;
      if (!id) throw new Error("Missing section relationship");
      const kind = local === "headerReference" ? "header" : "footer";
      if (refs.has(id) && refs.get(id) !== kind) throw new Error("Ambiguous section relationship");
      refs.set(id, kind);
    }
    ancestors.push(local);
  });
  document.on("closetag", () => { ancestors.pop(); });
  document.write(documentXml).close();
  if (!refs.size) return [];
  if (!relationshipsXml) throw new Error("Missing document relationships");
  const paths = new Map<string, string>();
  const rels = new SaxesParser({ xmlns: true });
  rels.on("doctype", () => { throw new Error("DTD not supported"); });
  rels.on("opentag", (tag) => {
    if (tag.uri !== PACKAGE_REL || tag.local !== "Relationship") return;
    const attrs = Object.values(tag.attributes);
    const get = (name: string) => attrs.find((attr) => !attr.uri && attr.local === name)?.value;
    const id = get("Id");
    if (!id || !refs.has(id)) return;
    if (paths.has(id) || get("TargetMode")?.toLowerCase() === "external" || ![`${OFFICE_REL}/${refs.get(id)}`, `${OFFICE_REL_STRICT}/${refs.get(id)}`].includes(get("Type") ?? "")) throw new Error("Invalid section relationship");
    const target = get("Target");
    if (!target || target.includes("\\") || /[?#]/.test(target)) throw new Error("Invalid section target");
    const segments: string[] = target.startsWith("/") ? [] : ["word"];
    for (const part of target.split("/")) {
      if (part === "..") { if (!segments.length) throw new Error("Invalid section target"); segments.pop(); }
      else if (part && part !== ".") segments.push(part);
    }
    const path = segments.join("/");
    if (!path.startsWith("word/") || !path.toLowerCase().endsWith(".xml")) throw new Error("Invalid section target");
    paths.set(id, path);
  });
  rels.write(relationshipsXml).close();
  if (paths.size !== refs.size) throw new Error("Unresolved section relationship");
  return [...new Set(paths.values())];
}
