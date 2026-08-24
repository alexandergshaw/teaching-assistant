// Unwrapping a model response that arrived wrapped in a markdown code fence.
//
// This exists because the obvious regex is catastrophically wrong. Every
// prose-generating action used to do:
//
//   const fenced = text.match(/```(?:markdown|md|text)?\s*([\s\S]*?)```/i);
//   if (fenced) text = fenced[1].trim();
//
// The language tag is OPTIONAL and the match is UNANCHORED, so on a document
// that merely CONTAINS a code block - a class opener with a ```python warm-up
// exercise, say - it matches from that inner fence to its closing fence and
// throws away everything else. The document silently becomes the code snippet.
// That shipped: an entire 16-week set of Project Management class openers came
// out as bare Python fragments with every word of prose gone.
//
// Pure: no I/O, no Date, no randomness.

// A fence that opens a whole DOCUMENT carries no language tag, or a
// document-ish one. A programming language tag (```python, ```js) means the
// fence opens a code block INSIDE the document, never the document itself.
const DOCUMENT_FENCE_OPEN = /^```(?:markdown|md|text|txt)?[ \t]*\r?\n/i;

// The same rule for a call site whose DOCUMENT is html - a page body being
// rewritten, where the model routinely answers with ```html ... ```. `html`
// cannot simply join the list above: for a markdown document, an opening
// ```html fence means a code block INSIDE the document (a tutorial showing
// markup), which is exactly the case the list is drawn to exclude. The tag is
// document-ish or code-ish depending on what the caller asked for, so the
// caller picks the pattern rather than one shared list guessing.
const HTML_DOCUMENT_FENCE_OPEN = /^```(?:html|markdown|md|text|txt)?[ \t]*\r?\n/i;

/**
 * Strip a code fence that wraps the ENTIRE response, and only that.
 *
 * Returns the text unchanged - never a fragment of it - when the response is
 * not wholly wrapped. Being too conservative leaves a stray "```markdown" line
 * at the top of a document; being too eager destroys the document.
 */
export function unwrapDocumentFence(text: string): string {
  return unwrapFence(text, DOCUMENT_FENCE_OPEN);
}

/**
 * `unwrapDocumentFence` for a call site whose document IS html - currently
 * `revisePageWithAiAction`, which rewrites a live Canvas page body.
 *
 * Split out rather than folded into the shared tag list because the two
 * answers genuinely differ: ```html opening a MARKDOWN document is a code
 * block inside it (and unwrapping there is the catastrophic behaviour this
 * module exists to prevent), while ```html opening an HTML document is the
 * wrapper. Same conservative contract otherwise: it returns the text
 * unchanged, never a fragment of it, unless a fence wraps the WHOLE response.
 */
export function unwrapHtmlDocumentFence(text: string): string {
  return unwrapFence(text, HTML_DOCUMENT_FENCE_OPEN);
}

function unwrapFence(text: string, openPattern: RegExp): string {
  const trimmed = text.trim();

  // A wrapper must close at the very end. A document that merely ENDS with a
  // code block also ends with a fence, so this alone is not sufficient - the
  // opening check below is what distinguishes them.
  if (!trimmed.startsWith("```") || !trimmed.endsWith("```")) return trimmed;

  const opening = trimmed.match(openPattern);
  if (!opening) return trimmed;

  const body = trimmed.slice(opening[0].length, trimmed.length - "```".length);
  const unwrapped = body.trim();

  // Refuse to return nothing: a response of just "```\n```" is malformed, and
  // the caller is better served by the raw text than by an empty document.
  return unwrapped || trimmed;
}
