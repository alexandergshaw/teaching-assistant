// Builds IMS Common Cartridge 1.3 zips (.imscc) so course materials can be
// imported into Blackboard, Canvas, and other LMSs. Deliverables are emitted
// as native CC assignment resources (the IMS CC assignment extension), which
// importers turn into real assignments with rendered instructions.
//
// Two shapes: buildCommonCartridge packages the whole course (weeks as
// folders inside one cartridge, the Canvas path); buildWeekCartridge
// packages a single week with its content at the root, for importers that
// wrap each package in one folder (Blackboard Ultra) so the wrapper itself
// becomes the module.

export interface CartridgeWeek {
  week: number;
  title: string;
  files: Array<{ name: string; blob: Blob }>;
  // HTML pages emitted as webcontent under wiki_content/: Canvas imports
  // those as Pages; Blackboard imports each as a Document rendered inline
  // when opened.
  pages: Array<{ title: string; html: string }>;
  // Deliverable assignments emitted via the CC assignment extension so LMS
  // imports create real assignments.
  assignments: Array<{ title: string; html: string; points: number }>;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizePath(s: string): string {
  return s.replace(/[^a-zA-Z0-9._ -]/g, "_");
}

interface ResourceDef {
  id: string;
  type: string;
  href: string;
}

// Mutable counters and collected resource definitions for one cartridge
// build; the emission helper writes payload files into the zip as it goes.
interface CartridgeState {
  zip: { file: (path: string, data: Blob | string) => unknown };
  resourceId: number;
  itemId: number;
  resourceDefs: ResourceDef[];
}

// Emit page, file, and assignment resources into the cartridge zip and
// return their organization <item> XML strings.
function emitContentItems(
  state: CartridgeState,
  files: CartridgeWeek["files"],
  assignments: CartridgeWeek["assignments"],
  pages: CartridgeWeek["pages"]
): string[] {
  const items: string[] = [];

  // Add page resources first so introductions lead their module. The
  // webcontent lives under wiki_content/: Canvas imports webcontent there
  // as Pages; Blackboard imports it as a Document rendered inline on open.
  for (const page of pages) {
    const num = String(state.resourceId++).padStart(4, "0");
    const resId = `r${num}`;

    const pageHtml = `<html><head><meta charset="utf-8"><title>${esc(
      page.title
    )}</title></head><body>${page.html}</body></html>`;

    const resPath = `wiki_content/p${num}.html`;
    state.zip.file(resPath, pageHtml);

    const pageItemId = `i${String(state.itemId++).padStart(4, "0")}`;
    state.resourceDefs.push({
      id: resId,
      type: "webcontent",
      href: resPath,
    });

    items.push(
      `<item identifier="${pageItemId}" identifierref="${resId}"><title>${esc(
        page.title
      )}</title></item>`
    );
  }

  // Add file resources
  for (const file of files) {
    const resId = `r${String(state.resourceId++).padStart(4, "0")}`;
    const sanitizedName = sanitizePath(file.name);
    const resPath = `res${resId}/${sanitizedName}`;

    state.zip.file(resPath, file.blob);

    const fileItemId = `i${String(state.itemId++).padStart(4, "0")}`;
    state.resourceDefs.push({
      id: resId,
      type: "webcontent",
      href: resPath,
    });

    items.push(
      `<item identifier="${fileItemId}" identifierref="${resId}"><title>${esc(
        file.name
      )}</title></item>`
    );
  }

  // Add assignment resources (CC assignment extension). texttype
  // "text/html" means the importer unescapes the XML-escaped markup
  // inside <text> back into rendered HTML instructions.
  for (const assignment of assignments) {
    const num = String(state.resourceId++).padStart(4, "0");
    const resId = `r${num}`;
    const assignmentId = `a${num}`;

    const assignmentXml = `<?xml version="1.0" encoding="UTF-8"?>
<assignment xmlns="http://www.imsglobal.org/xsd/imscc_extensions/assignment" identifier="${assignmentId}">
  <title>${esc(assignment.title)}</title>
  <text texttype="text/html">${esc(assignment.html)}</text>
  <gradable points_possible="${assignment.points}">true</gradable>
  <submission_formats>
    <format type="text"/>
  </submission_formats>
</assignment>`;

    const resPath = `res${resId}/assignment.xml`;
    state.zip.file(resPath, assignmentXml);

    const assignmentItemId = `i${String(state.itemId++).padStart(4, "0")}`;
    state.resourceDefs.push({
      id: resId,
      type: "assignment_xmlv1p0",
      href: resPath,
    });

    items.push(
      `<item identifier="${assignmentItemId}" identifierref="${resId}"><title>${esc(
        assignment.title
      )}</title></item>`
    );
  }

  return items;
}

function buildManifestXml(
  title: string,
  orgItemsXml: string,
  resourceDefs: ResourceDef[]
): string {
  const resourcesXml = resourceDefs
    .map((r) => `<resource identifier="${r.id}" type="${r.type}" href="${r.href}"><file href="${r.href}"/></resource>`)
    .join("\n    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="ta-cartridge" xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p3/LOM/manifest">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.3.0</schemaversion>
    <lomimscc:lom>
      <lomimscc:general>
        <lomimscc:title>
          <lomimscc:string>${esc(title)}</lomimscc:string>
        </lomimscc:title>
      </lomimscc:general>
    </lomimscc:lom>
  </metadata>
  <organizations>
    <organization identifier="org_1" structure="rooted-hierarchy">
      <item identifier="root">
        ${orgItemsXml}
      </item>
    </organization>
  </organizations>
  <resources>
    ${resourcesXml}
  </resources>
</manifest>`;
}

export async function buildCommonCartridge(
  courseTitle: string,
  weeks: CartridgeWeek[]
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  const state: CartridgeState = {
    zip,
    resourceId: 1,
    itemId: 1,
    resourceDefs: [],
  };

  const orgItems: string[] = [];

  // Process each week as a folder item inside the single cartridge.
  for (const week of weeks) {
    const weekItemId = `i${String(state.itemId++).padStart(4, "0")}`;
    const weekItems = emitContentItems(
      state,
      week.files,
      week.assignments,
      week.pages
    );

    if (weekItems.length > 0) {
      orgItems.push(
        `<item identifier="${weekItemId}"><title>${esc(week.title)}</title>${weekItems.join(
          ""
        )}</item>`
      );
    }
  }

  zip.file(
    "imsmanifest.xml",
    buildManifestXml(
      courseTitle,
      orgItems.join("\n        "),
      state.resourceDefs
    )
  );

  return await zip.generateAsync({ type: "blob" });
}

// Single-week cartridge: the file and assignment items sit directly under
// the root item (no intermediate week folder), so an importer that wraps
// the whole package in one folder named after the package title (Blackboard
// Ultra) yields exactly one top-level module for the week.
export async function buildWeekCartridge(
  weekTitle: string,
  files: CartridgeWeek["files"],
  assignments: CartridgeWeek["assignments"],
  pages: CartridgeWeek["pages"]
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  const state: CartridgeState = {
    zip,
    resourceId: 1,
    itemId: 1,
    resourceDefs: [],
  };

  const items = emitContentItems(state, files, assignments, pages);

  zip.file(
    "imsmanifest.xml",
    buildManifestXml(weekTitle, items.join("\n        "), state.resourceDefs)
  );

  return await zip.generateAsync({ type: "blob" });
}
