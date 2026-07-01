/**
 * Deterministic revision engine for the Embedded Deterministic Engine. Where the
 * LLM applies a freeform edit instruction, this parses the most common concrete
 * commands and applies them mechanically:
 *
 *   replace "A" with "B"          rename the title to "X"
 *   remove the section "X"        add a section "X"
 *   add a bullet "X" [to "Y"]     remove the line/bullet containing "X"
 *   remove the slide "X"          add a slide "X"
 *   shorten / make it more concise
 *
 * An instruction the engine cannot parse leaves the content unchanged (applied:
 * false) so the caller can say so — the engine never guesses at an edit.
 */

import { copyedit, pick, titleCase } from "./scaffold";

/** Quoted arguments in the instruction, in order ("...", '...', or smart quotes). */
function quotedArgs(instruction: string): string[] {
  const out: string[] = [];
  const re = /"([^"]+)"|'([^']+)'|“([^”]+)”/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(instruction)) !== null) {
    out.push((match[1] ?? match[2] ?? match[3]).trim());
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The words after `keyword ... (about|called|titled|named|on)?` in the instruction. */
function tailAfter(instruction: string, keyword: RegExp): string | null {
  const m = new RegExp(`${keyword.source}\\s+(?:about|called|titled|named|on|for)?\\s*(.+)$`, "i").exec(instruction);
  if (!m) return null;
  return m[1].replace(/[."']+$/g, "").trim() || null;
}

/** Replace all occurrences of `from` (case-sensitive first, else case-insensitive). */
function replaceAllLoose(text: string, from: string, to: string): { text: string; applied: boolean } {
  if (text.includes(from)) {
    return { text: text.split(from).join(to), applied: true };
  }
  const re = new RegExp(escapeRegExp(from), "gi");
  if (re.test(text)) {
    return { text: text.replace(re, to), applied: true };
  }
  return { text, applied: false };
}

const IS_REPLACE = /\b(?:replace|swap)\b[\s\S]*\bwith\b|\bchange\b[\s\S]*\bto\b/i;
const IS_RETITLE = /\b(?:rename|retitle|change)\b[\s\S]*\btitle\b/i;
const IS_REMOVE = /\b(?:remove|delete|drop|cut)\b/i;
const IS_ADD = /\b(?:add|insert|append)\b/i;
const IS_SHORTEN = /\b(?:shorten|tighten|condense|more concise|less wordy)\b/i;

export interface TextRevision {
  text: string;
  applied: boolean;
}

/** Apply a common edit command to a markdown-ish document. */
export function applyTextRevision(currentText: string, instruction: string): TextRevision {
  const q = quotedArgs(instruction);

  // Rename the title (checked before replace: "change the title to X").
  if (IS_RETITLE.test(instruction)) {
    const newTitle = q[0] ?? tailAfter(instruction, /\btitle\s+to\b/);
    if (newTitle) {
      if (/^#\s+.*$/m.test(currentText)) {
        return { text: currentText.replace(/^#\s+.*$/m, `# ${newTitle}`), applied: true };
      }
      return { text: `# ${newTitle}\n\n${currentText}`, applied: true };
    }
  }

  // Remove a section by its heading.
  if (IS_REMOVE.test(instruction) && /\bsection\b/i.test(instruction)) {
    const target = q[0] ?? tailAfter(instruction, /\bsection\b/);
    if (target) {
      const lines = currentText.split("\n");
      const isHeading = (line: string) => /^#{1,6}\s+/.test(line);
      const out: string[] = [];
      let skipping = false;
      for (const line of lines) {
        if (isHeading(line)) {
          skipping = /^##+\s+/.test(line) && line.toLowerCase().includes(target.toLowerCase());
        }
        if (!skipping) out.push(line);
      }
      const next = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (next !== currentText.trim()) return { text: next, applied: true };
    }
  }

  // Remove lines / sentences / bullets containing a phrase.
  if (IS_REMOVE.test(instruction) && /\b(?:line|bullet|sentence|paragraph|mention)/i.test(instruction) && q[0]) {
    const target = q[0].toLowerCase();
    const kept = currentText.split("\n").filter((line) => !line.toLowerCase().includes(target));
    const next = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (next !== currentText.trim()) return { text: next, applied: true };
  }

  // Add a bullet, optionally to a named section (checked before add-section,
  // since "add a bullet ... to the section ..." mentions both).
  if (IS_ADD.test(instruction) && /\bbullet\b/i.test(instruction) && q[0]) {
    const bullet = `- ${q[0]}`;
    const sectionName = q[1];
    if (sectionName) {
      const lines = currentText.split("\n");
      const start = lines.findIndex(
        (line) => /^##+\s+/.test(line) && line.toLowerCase().includes(sectionName.toLowerCase())
      );
      if (start !== -1) {
        let end = lines.length;
        for (let i = start + 1; i < lines.length; i += 1) {
          if (/^#{1,6}\s+/.test(lines[i])) {
            end = i;
            break;
          }
        }
        // Insert before the next heading, after trailing blanks of the section.
        let insertAt = end;
        while (insertAt > start + 1 && lines[insertAt - 1].trim() === "") insertAt -= 1;
        lines.splice(insertAt, 0, bullet);
        return { text: lines.join("\n"), applied: true };
      }
    }
    return { text: `${currentText.trim()}\n${bullet}`, applied: true };
  }

  // Add a section.
  if (IS_ADD.test(instruction) && /\bsection\b/i.test(instruction)) {
    const name = q[0] ?? tailAfter(instruction, /\bsection\b/);
    if (name) {
      return { text: `${currentText.trim()}\n\n## ${titleCase(name)}\n\n[Add content here.]`, applied: true };
    }
  }

  // Find and replace.
  if (IS_REPLACE.test(instruction) && q.length >= 2) {
    const result = replaceAllLoose(currentText, q[0], q[1]);
    if (result.applied) return result;
  }

  // Shorten: copy-edit prose paragraphs (headings and bullets keep their shape).
  if (IS_SHORTEN.test(instruction)) {
    const next = currentText
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || /^#{1,6}\s+/.test(trimmed) || /^[-*]\s+/.test(trimmed)) return line;
        return copyedit(trimmed);
      })
      .join("\n");
    if (next !== currentText) return { text: next, applied: true };
  }

  return { text: currentText, applied: false };
}

export interface SlideLike {
  title: string;
  bullets: string[];
  code?: string;
  codeLanguage?: string;
}

export interface SlidesRevision<T extends SlideLike> {
  slides: T[];
  applied: boolean;
}

/** Apply a common edit command to a slide deck. */
export function applySlidesRevision<T extends SlideLike>(
  currentSlides: T[],
  instruction: string
): SlidesRevision<T> {
  const q = quotedArgs(instruction);

  // Rename a slide: rename the slide "A" to "B".
  if (/\brename\b/i.test(instruction) && /\bslide\b/i.test(instruction) && q.length >= 2) {
    let applied = false;
    const slides = currentSlides.map((slide) => {
      if (slide.title.toLowerCase().includes(q[0].toLowerCase())) {
        applied = true;
        return { ...slide, title: q[1] };
      }
      return slide;
    });
    if (applied) return { slides, applied };
  }

  // Remove a slide by title.
  if (IS_REMOVE.test(instruction) && /\bslide\b/i.test(instruction)) {
    const target = q[0] ?? tailAfter(instruction, /\bslide\b/);
    if (target) {
      const slides = currentSlides.filter(
        (slide) => !slide.title.toLowerCase().includes(target.toLowerCase())
      );
      if (slides.length !== currentSlides.length) return { slides, applied: true };
    }
  }

  // Add a slide.
  if (IS_ADD.test(instruction) && /\bslide\b/i.test(instruction)) {
    const name = q[0] ?? tailAfter(instruction, /\bslide\b/);
    if (name) {
      const title = titleCase(name);
      const added = {
        title,
        bullets: [
          `Key idea: ${name.toLowerCase()}`,
          pick(
            [
              "Why it matters: connect this to prior topics and a real-world example students recognize",
              "Why it matters: tie this to something students already use or have seen",
            ],
            name
          ),
        ],
      } as T;
      return { slides: [...currentSlides, added], applied: true };
    }
  }

  // Remove bullets containing a phrase.
  if (IS_REMOVE.test(instruction) && /\bbullet/i.test(instruction) && q[0]) {
    const target = q[0].toLowerCase();
    let applied = false;
    const slides = currentSlides.map((slide) => {
      const bullets = slide.bullets.filter((b) => !b.toLowerCase().includes(target));
      if (bullets.length !== slide.bullets.length) applied = true;
      return { ...slide, bullets };
    });
    if (applied) return { slides, applied };
  }

  // Find and replace across titles and bullets.
  if (IS_REPLACE.test(instruction) && q.length >= 2) {
    let applied = false;
    const swap = (value: string): string => {
      const result = replaceAllLoose(value, q[0], q[1]);
      if (result.applied) applied = true;
      return result.text;
    };
    const slides = currentSlides.map((slide) => ({
      ...slide,
      title: swap(slide.title),
      bullets: slide.bullets.map(swap),
    }));
    if (applied) return { slides, applied };
  }

  // Shorten: cap each slide at three bullets.
  if (IS_SHORTEN.test(instruction)) {
    const needsTrim = currentSlides.some((slide) => slide.bullets.length > 3);
    if (needsTrim) {
      return {
        slides: currentSlides.map((slide) => ({ ...slide, bullets: slide.bullets.slice(0, 3) })),
        applied: true,
      };
    }
  }

  return { slides: currentSlides, applied: false };
}

export interface HtmlRevision {
  html: string;
  applied: boolean;
}

/**
 * Apply a conservative edit command to a page's HTML: find/replace of quoted
 * text, or removing whole p/li/heading elements whose text contains a quoted
 * phrase. Anything else leaves the page untouched.
 */
export function applyHtmlRevision(currentHtml: string, instruction: string): HtmlRevision {
  const q = quotedArgs(instruction);

  if (IS_REPLACE.test(instruction) && q.length >= 2) {
    const result = replaceAllLoose(currentHtml, q[0], q[1]);
    if (result.applied) return { html: result.text, applied: true };
  }

  if (IS_REMOVE.test(instruction) && q[0]) {
    const target = escapeRegExp(q[0]);
    const re = new RegExp(
      `<(p|li|h[1-6])\\b[^>]*>(?:(?!</\\1>)[\\s\\S])*?${target}(?:(?!</\\1>)[\\s\\S])*?</\\1>\\s*`,
      "gi"
    );
    if (re.test(currentHtml)) {
      return { html: currentHtml.replace(re, ""), applied: true };
    }
  }

  return { html: currentHtml, applied: false };
}
