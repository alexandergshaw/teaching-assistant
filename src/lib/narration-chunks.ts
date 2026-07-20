// Split narration text into chunks safe for ElevenLabs API (3800 chars per call).
// Preserves all text and maintains sentence boundaries where possible.

export function splitNarrationText(text: string, maxLen = 3800): string[] {
  // Normalize newlines
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split into paragraphs on blank lines (two or more newlines)
  const paragraphs = normalized
    .split(/\n\n+/)
    .map((p) => p.replace(/\n/g, ' ').trim()) // Replace internal newlines with spaces
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if (para.length <= maxLen) {
      // Paragraph fits within maxLen
      if (!currentChunk) {
        currentChunk = para;
      } else if (currentChunk.length + 1 + para.length <= maxLen) {
        // Can add to current chunk with a space
        currentChunk += ' ' + para;
      } else {
        // Start a new chunk
        chunks.push(currentChunk);
        currentChunk = para;
      }
    } else {
      // Paragraph is too long; split on sentence boundaries
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }

      const sentences = splitIntoSentences(para);
      for (const sentence of sentences) {
        // Handle sentences longer than maxLen via hard-slice
        let toAdd = sentence;
        while (toAdd.length > maxLen) {
          if (currentChunk) {
            chunks.push(currentChunk);
            currentChunk = '';
          }
          chunks.push(toAdd.slice(0, maxLen));
          toAdd = toAdd.slice(maxLen);
        }

        if (!toAdd) continue;

        if (!currentChunk) {
          currentChunk = toAdd;
        } else if (currentChunk.length + 1 + toAdd.length <= maxLen) {
          currentChunk += ' ' + toAdd;
        } else {
          chunks.push(currentChunk);
          currentChunk = toAdd;
        }
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  let current = '';

  for (let i = 0; i < text.length; i++) {
    current += text[i];

    // Check for sentence terminator (. ! ?) followed by space or end of text
    if (
      text[i] === '.' ||
      text[i] === '!' ||
      text[i] === '?'
    ) {
      const nextChar = i < text.length - 1 ? text[i + 1] : null;
      // Sentence boundary if followed by space or end of text
      if (nextChar === ' ' || nextChar === null) {
        sentences.push(current.trim());
        current = '';
        // Skip the space if it exists
        if (nextChar === ' ') {
          i++;
        }
      }
    }
  }

  // Add any remaining text as a sentence
  if (current.trim()) {
    sentences.push(current.trim());
  }

  return sentences;
}
