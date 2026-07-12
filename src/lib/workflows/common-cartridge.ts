// Builds an IMS Common Cartridge 1.1 zip (.imscc) so course materials can be
// imported into Blackboard and other LMSs; content only - plain CC creates no
// gradable items.

export interface CartridgeWeek {
  week: number;
  title: string;
  files: Array<{ name: string; blob: Blob }>;
  pages: Array<{ title: string; html: string }>;
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

export async function buildCommonCartridge(
  courseTitle: string,
  weeks: CartridgeWeek[]
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  let resourceId = 1;
  let itemId = 1;

  const resourceDefs: Array<{ id: string; type: string; href: string }> = [];
  const orgItems: string[] = [];

  // Process each week
  for (const week of weeks) {
    const weekItemId = `i${String(itemId++).padStart(4, "0")}`;
    const weekItems: string[] = [];

    // Add file resources
    for (const file of week.files) {
      const resId = `r${String(resourceId++).padStart(4, "0")}`;
      const sanitizedName = sanitizePath(file.name);
      const resPath = `res${resId}/${sanitizedName}`;

      zip.file(resPath, file.blob);

      const itemId_file = `i${String(itemId++).padStart(4, "0")}`;
      resourceDefs.push({
        id: resId,
        type: "webcontent",
        href: resPath,
      });

      weekItems.push(
        `<item identifier="${itemId_file}" identifierref="${resId}"><title>${esc(
          file.name
        )}</title></item>`
      );
    }

    // Add page resources
    for (const page of week.pages) {
      const resId = `r${String(resourceId++).padStart(4, "0")}`;
      const pageHtml = `<html><head><meta charset="utf-8"><title>${esc(
        page.title
      )}</title></head><body>${page.html}</body></html>`;

      const resPath = `res${resId}/index.html`;
      zip.file(resPath, pageHtml);

      const itemId_page = `i${String(itemId++).padStart(4, "0")}`;
      resourceDefs.push({
        id: resId,
        type: "webcontent",
        href: resPath,
      });

      weekItems.push(
        `<item identifier="${itemId_page}" identifierref="${resId}"><title>${esc(
          page.title
        )}</title></item>`
      );
    }

    // Build week item with children
    if (weekItems.length > 0) {
      orgItems.push(
        `<item identifier="${weekItemId}"><title>${esc(week.title)}</title>${weekItems.join(
          ""
        )}</item>`
      );
    }
  }

  // Build resources section
  const resourcesXml = resourceDefs
    .map((r) => `<resource identifier="${r.id}" type="${r.type}" href="${r.href}"><file href="${r.href}"/></resource>`)
    .join("\n    ");

  // Build manifest
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="ta-cartridge" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.1.0</schemaversion>
    <lomimscc:lom>
      <lomimscc:general>
        <lomimscc:title>
          <lomimscc:string>${esc(courseTitle)}</lomimscc:string>
        </lomimscc:title>
      </lomimscc:general>
    </lomimscc:lom>
  </metadata>
  <organizations>
    <organization identifier="org_1" structure="rooted-hierarchy">
      <item identifier="root">
        ${orgItems.join("\n        ")}
      </item>
    </organization>
  </organizations>
  <resources>
    ${resourcesXml}
  </resources>
</manifest>`;

  zip.file("imsmanifest.xml", manifest);

  return await zip.generateAsync({ type: "blob" });
}
