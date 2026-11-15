import { HTMLElement, parse } from "node-html-parser";
import { htmlToMarkdown, markdownToHtml } from "./markdown";
import { renderRichTemplate, validRichTemplate, type RichTemplate } from "./announcement-rich-template";
import { verifiedStyledAnnouncement } from "./walkthrough-styled-announcement";

/** Apply unambiguous whole-block styles without asking a model to repeat text. */
export function projectRichTemplate(message: string, value: unknown): string | null {
  if (!validRichTemplate(value)) return null;
  const template: RichTemplate = value;
  const blocks = parse(markdownToHtml(message)).childNodes.filter((node): node is HTMLElement => node instanceof HTMLElement);
  if (blocks.length !== template.blocks.length) return null;
  const slots: { index: number; entries: string[][] }[] = [];
  for (let index = 0; index < blocks.length; index++) {
    const actual = blocks[index], target = template.blocks[index];
    const actualTag = actual.rawTagName?.toLowerCase() ?? "";
    const paragraphLike = (tag: string) => tag === "p" || tag === "div" || /^h[1-6]$/.test(tag);
    if (actualTag !== target.tag && !(paragraphLike(actualTag) && paragraphLike(target.tag))) return null;
    const list = actualTag === "ul" || actualTag === "ol";
    const entries = list ? actual.childNodes.filter((child): child is HTMLElement => child instanceof HTMLElement && child.rawTagName?.toLowerCase() === "li") : [actual];
    if (!entries.length || entries.length > target.entries.length) return null;
    const values: string[][] = [];
    for (let i = 0; i < entries.length; i++) {
      if (target.entries[i].runs.length !== 1) return null;
      const content = htmlToMarkdown(`<p>${entries[i].innerHTML}</p>`).trim();
      if (!content || /[\r\n]/.test(content)) return null;
      values.push([content]);
    }
    slots.push({ index, entries: values });
  }
  const candidate = renderRichTemplate(template, slots);
  return candidate ? verifiedStyledAnnouncement(message, candidate) : null;
}
