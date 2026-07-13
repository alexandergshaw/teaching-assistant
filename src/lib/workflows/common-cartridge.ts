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
  // dueAt is an optional UTC ISO-8601 timestamp WITHOUT timezone suffix,
  // e.g. "2026-08-24T04:59:00": Canvas parses zoneless due_at values as UTC
  // and renders them back in the course timezone (Canvas flavor only).
  assignments: Array<{ title: string; html: string; points: number; dueAt?: string }>;
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

// QTI 1.2 essay assessment (IMS CC profile): one manually graded essay item
// carrying the deliverable instructions. Blackboard Ultra imports these as
// gradable Tests inside the module; it silently drops the CC assignment
// extension, which is why cc-flavor deliverables ride QTI instead.
export function buildQtiAssessmentXml(a: {
  identifier: string;
  title: string;
  html: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/profile/cc/ccv1p3/ccv1p3_qtiasiv1p2p1_v1p0.xsd">
  <assessment ident="${a.identifier}" title="${esc(a.title)}">
    <qtimetadata>
      <qtimetadatafield>
        <fieldlabel>cc_profile</fieldlabel>
        <fieldentry>cc.exam.v0p1</fieldentry>
      </qtimetadatafield>
      <qtimetadatafield>
        <fieldlabel>qmd_scoretype</fieldlabel>
        <fieldentry>Percentage</fieldentry>
      </qtimetadatafield>
    </qtimetadata>
    <section ident="root_section">
      <item ident="${a.identifier}_i1" title="${esc(a.title)}">
        <itemmetadata>
          <qtimetadata>
            <qtimetadatafield>
              <fieldlabel>cc_profile</fieldlabel>
              <fieldentry>cc.essay.v0p1</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>qmd_scoringpermitted</fieldlabel>
              <fieldentry>Yes</fieldentry>
            </qtimetadatafield>
            <qtimetadatafield>
              <fieldlabel>qmd_computerscored</fieldlabel>
              <fieldentry>No</fieldentry>
            </qtimetadatafield>
          </qtimetadata>
        </itemmetadata>
        <presentation>
          <material>
            <mattext texttype="text/html">${esc(a.html)}</mattext>
          </material>
          <response_str ident="response1" rcardinality="Single">
            <render_fib>
              <response_label ident="answer1" rshuffle="No"/>
            </render_fib>
          </response_str>
        </presentation>
      </item>
    </section>
  </assessment>
</questestinterop>`;
}

// Canvas course-export assignment settings; due_at omitted when absent.
export function buildAssignmentSettingsXml(a: {
  identifier: string;
  title: string;
  points: number;
  dueAt?: string;
}): string {
  const dueAtXml = a.dueAt ? `  <due_at>${esc(a.dueAt)}</due_at>\n` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<assignment identifier="${a.identifier}" xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd">
  <title>${esc(a.title)}</title>
${dueAtXml}  <points_possible>${a.points}</points_possible>
  <grading_type>points</grading_type>
  <submission_types>online_text_entry</submission_types>
  <workflow_state>published</workflow_state>
</assignment>`;
}

// Canvas module structure: one module per week, items in emission order.
export function buildModuleMetaXml(
  modules: Array<{
    identifier: string;
    title: string;
    position: number;
    items: Array<{
      identifier: string;
      title: string;
      contentType: "Assignment" | "Attachment";
      identifierref: string;
      position: number;
    }>;
  }>
): string {
  const modulesXml = modules
    .map((m) => {
      const itemsXml = m.items
        .map(
          (item) => `    <item identifier="${item.identifier}">
      <title>${esc(item.title)}</title>
      <content_type>${item.contentType}</content_type>
      <workflow_state>active</workflow_state>
      <identifierref>${item.identifierref}</identifierref>
      <position>${item.position}</position>
    </item>`
        )
        .join("\n");

      return `  <module identifier="${m.identifier}">
    <title>${esc(m.title)}</title>
    <workflow_state>active</workflow_state>
    <position>${m.position}</position>
    <items>
${itemsXml}
    </items>
  </module>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<modules xmlns="http://canvas.instructure.com/xsd/cccv1p0">
${modulesXml}
</modules>`;
}

interface ResourceDef {
  id: string;
  type: string;
  href: string;
  files?: string[]; // Multiple files for Canvas assignments; single-file resources omit this
}

// Mutable counters and collected resource definitions for one cartridge
// build; the emission helper writes payload files into the zip as it goes.
interface CartridgeState {
  zip: { file: (path: string, data: Blob | string) => unknown };
  resourceId: number;
  itemId: number;
  resourceDefs: ResourceDef[];
}

// Emitted item metadata for Canvas module structure.
interface EmittedItem {
  itemId: string;
  resId: string;
  title: string;
  contentType: "Assignment" | "Attachment";
}

// Emit page, file, and assignment resources into the cartridge zip and
// return their organization <item> XML strings plus emitted item metadata for Canvas.
function emitContentItems(
  state: CartridgeState,
  files: CartridgeWeek["files"],
  assignments: CartridgeWeek["assignments"],
  pages: CartridgeWeek["pages"],
  flavor: "cc" | "canvas" = "cc"
): { items: string[]; emittedItems: EmittedItem[] } {
  const items: string[] = [];
  const emittedItems: EmittedItem[] = [];

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

  // Add file resources. Canvas's cartridge converter (activated by
  // course_settings/canvas_export.txt) only maps files whose path starts
  // with web_resources/; anything else silently vanishes on import. The
  // res${resId} subfolder keeps names collision-free in both flavors.
  for (const file of files) {
    const resId = `r${String(state.resourceId++).padStart(4, "0")}`;
    const sanitizedName = sanitizePath(file.name);
    const resPath =
      flavor === "canvas"
        ? `web_resources/res${resId}/${sanitizedName}`
        : `res${resId}/${sanitizedName}`;

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

    emittedItems.push({
      itemId: fileItemId,
      resId,
      title: file.name,
      contentType: "Attachment",
    });
  }

  // Add assignment resources: Canvas uses learning-application-resource with
  // assignment_settings.xml; cc flavor uses QTI essay assessments because Blackboard
  // Ultra drops the CC assignment extension.
  for (const assignment of assignments) {
    const num = String(state.resourceId++).padStart(4, "0");
    const resId = `r${num}`;

    if (flavor === "canvas") {
      // Canvas flavor: assignment.html + assignment_settings.xml
      const assignmentHtml = `<html><head><meta charset="utf-8"><title>${esc(
        assignment.title
      )}</title></head><body>${assignment.html}</body></html>`;

      const assignmentSettingsXml = buildAssignmentSettingsXml({
        identifier: resId,
        title: assignment.title,
        points: assignment.points,
        dueAt: assignment.dueAt,
      });

      state.zip.file(`res${resId}/assignment.html`, assignmentHtml);
      state.zip.file(`res${resId}/assignment_settings.xml`, assignmentSettingsXml);

      const assignmentItemId = `i${String(state.itemId++).padStart(4, "0")}`;
      state.resourceDefs.push({
        id: resId,
        type: "associatedcontent/imscc_xmlv1p1/learning-application-resource",
        href: `res${resId}/assignment.html`,
        files: [`res${resId}/assignment.html`, `res${resId}/assignment_settings.xml`],
      });

      items.push(
        `<item identifier="${assignmentItemId}" identifierref="${resId}"><title>${esc(
          assignment.title
        )}</title></item>`
      );

      emittedItems.push({
        itemId: assignmentItemId,
        resId,
        title: assignment.title,
        contentType: "Assignment",
      });
    } else {
      // CC flavor: QTI essay assessment
      const assessmentXml = buildQtiAssessmentXml({
        identifier: resId,
        title: assignment.title,
        html: assignment.html,
      });

      const resPath = `res${resId}/assessment.xml`;
      state.zip.file(resPath, assessmentXml);

      const assignmentItemId = `i${String(state.itemId++).padStart(4, "0")}`;
      state.resourceDefs.push({
        id: resId,
        type: "imsqti_xmlv1p2/imscc_xmlv1p3/assessment",
        href: resPath,
      });

      items.push(
        `<item identifier="${assignmentItemId}" identifierref="${resId}"><title>${esc(
          assignment.title
        )}</title></item>`
      );
    }
  }

  return { items, emittedItems };
}

function buildManifestXml(
  title: string,
  orgItemsXml: string,
  resourceDefs: ResourceDef[]
): string {
  const resourcesXml = resourceDefs
    .map((r) => {
      const fileHrefs = r.files || [r.href];
      const fileElements = fileHrefs.map((href) => `<file href="${href}"/>`).join("");
      return `<resource identifier="${r.id}" type="${r.type}" href="${r.href}">${fileElements}</resource>`;
    })
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
  weeks: CartridgeWeek[],
  options?: { flavor?: "cc" | "canvas" }
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const flavor = options?.flavor ?? "cc";

  const state: CartridgeState = {
    zip,
    resourceId: 1,
    itemId: 1,
    resourceDefs: [],
  };

  const orgItems: string[] = [];
  const canvasModules: Array<{
    identifier: string;
    title: string;
    position: number;
    items: Array<{
      identifier: string;
      title: string;
      contentType: "Assignment" | "Attachment";
      identifierref: string;
      position: number;
    }>;
  }> = [];

  // Process each week as a folder item inside the single cartridge.
  let weekPosition = 1;
  for (const week of weeks) {
    const weekItemId = `i${String(state.itemId++).padStart(4, "0")}`;
    const { items: weekItems, emittedItems } = emitContentItems(
      state,
      week.files,
      week.assignments,
      week.pages,
      flavor
    );

    if (weekItems.length > 0) {
      orgItems.push(
        `<item identifier="${weekItemId}"><title>${esc(week.title)}</title>${weekItems.join(
          ""
        )}</item>`
      );

      // For Canvas: build module structure from emitted items
      if (flavor === "canvas") {
        const moduleItems = emittedItems
          .filter((ei) => ei.contentType === "Assignment" || ei.contentType === "Attachment")
          .map((ei, index) => ({
            identifier: ei.itemId,
            title: ei.title,
            contentType: ei.contentType as "Assignment" | "Attachment",
            identifierref: ei.resId,
            position: index + 1,
          }));

        if (moduleItems.length > 0) {
          canvasModules.push({
            identifier: `m${String(weekPosition).padStart(4, "0")}`,
            title: week.title,
            position: weekPosition,
            items: moduleItems,
          });
        }
      }
    }

    weekPosition++;
  }

  zip.file(
    "imsmanifest.xml",
    buildManifestXml(
      courseTitle,
      orgItems.join("\n        "),
      state.resourceDefs
    )
  );

  // Canvas flavor: add course_settings/canvas_export.txt and course_settings/module_meta.xml
  if (flavor === "canvas") {
    zip.file("course_settings/canvas_export.txt", "Generated by the teaching assistant app.");
    zip.file("course_settings/module_meta.xml", buildModuleMetaXml(canvasModules));

    // Register the settings resource
    state.resourceDefs.push({
      id: "co_settings",
      type: "associatedcontent/imscc_xmlv1p1/learning-application-resource",
      href: "course_settings/canvas_export.txt",
      files: ["course_settings/canvas_export.txt", "course_settings/module_meta.xml"],
    });

    // Rebuild manifest to include settings resource
    zip.file(
      "imsmanifest.xml",
      buildManifestXml(
        courseTitle,
        orgItems.join("\n        "),
        state.resourceDefs
      )
    );
  }

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

  const { items } = emitContentItems(state, files, assignments, pages, "cc");

  zip.file(
    "imsmanifest.xml",
    buildManifestXml(weekTitle, items.join("\n        "), state.resourceDefs)
  );

  return await zip.generateAsync({ type: "blob" });
}
