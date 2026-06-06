import type { ExternalResource } from "@/lib/external-resources";

export type { ExternalResource };

const TYPE_LABELS: Record<string, string> = {
  documentation: "Official Documentation",
  tutorial: "Tutorial",
  guide: "Guide",
  reference: "Reference",
  video: "Video",
};

export async function buildExternalResourcesDocx(
  assignmentName: string,
  resources: ExternalResource[]
): Promise<ArrayBuffer> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink } = await import("docx");

  const FONT = "Times New Roman";
  const COLOR = "000000";
  const LINK_COLOR = "1a56db";

  const children: InstanceType<typeof Paragraph>[] = [];

  children.push(
    new Paragraph({
      children: [new TextRun({ text: `External Resources: ${assignmentName}`, font: FONT, color: COLOR, bold: true })],
      heading: HeadingLevel.HEADING_1,
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "The following free, publicly available resources are recommended to support your learning for this topic. All resources are free to access and do not require an account or subscription.",
          font: FONT,
          color: COLOR,
        }),
      ],
    })
  );

  children.push(new Paragraph({ children: [] }));

  const byType = new Map<string, ExternalResource[]>();
  for (const resource of resources) {
    const type = resource.type || "reference";
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(resource);
  }

  for (const [type, items] of byType) {
    const sectionLabel = TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1) + "s";
    children.push(
      new Paragraph({
        children: [new TextRun({ text: sectionLabel, font: FONT, color: COLOR, bold: true })],
        heading: HeadingLevel.HEADING_2,
      })
    );

    for (const resource of items) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: resource.title, font: FONT, color: COLOR, bold: true })],
        })
      );

      if (resource.description) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: resource.description, font: FONT, color: COLOR })],
          })
        );
      }

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Link: ", font: FONT, color: COLOR, bold: true }),
            new ExternalHyperlink({
              link: resource.url,
              children: [
                new TextRun({
                  text: resource.url,
                  font: FONT,
                  color: LINK_COLOR,
                  style: "Hyperlink",
                }),
              ],
            }),
          ],
        })
      );

      children.push(new Paragraph({ children: [] }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toArrayBuffer(doc);
}
