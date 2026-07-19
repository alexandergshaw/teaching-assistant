// Validation and wrapping for self-contained animation HTML (SVG + CSS keyframes).
// No JavaScript, no external resources; safe for Canvas pages, cartridges, and downloads.

export interface ValidationResult {
  ok: boolean;
  problems: string[];
}

export function validateAnimationHtml(html: string): ValidationResult {
  const problems: string[] = [];

  // REQUIRE: Contains <svg
  if (!/<svg/i.test(html)) {
    problems.push("Missing <svg element");
  }

  // REQUIRE: Contains @keyframes OR <animate
  if (!/@keyframes/i.test(html) && !/<animate/i.test(html)) {
    problems.push("Missing @keyframes or <animate element");
  }

  // REQUIRE: Length between 1000 and 200000
  const len = html.length;
  if (len < 1000) {
    problems.push(`HTML too short: ${len} chars (minimum 1000)`);
  }
  if (len > 200000) {
    problems.push(`HTML too long: ${len} chars (maximum 200000)`);
  }

  // FORBID: <script (any casing/spacing)
  if (/<\s*script\b/i.test(html)) {
    problems.push("Forbidden <script tag");
  }

  // FORBID: <iframe
  if (/<iframe\b/i.test(html)) {
    problems.push("Forbidden <iframe tag");
  }

  // FORBID: <object
  if (/<object\b/i.test(html)) {
    problems.push("Forbidden <object tag");
  }

  // FORBID: <embed
  if (/<embed\b/i.test(html)) {
    problems.push("Forbidden <embed tag");
  }

  // FORBID: <link
  if (/<link\b/i.test(html)) {
    problems.push("Forbidden <link tag");
  }

  // FORBID: @import
  if (/@import\b/i.test(html)) {
    problems.push("Forbidden @import");
  }

  // FORBID: url( with http
  // Permit optional leading whitespace inside the quote before the scheme
  if (/url\s*\(\s*['"]?\s*https?:/i.test(html)) {
    problems.push("Forbidden url() with http");
  }

  // FORBID: src= or href= with values starting with http:// https:// or //
  // Must be careful to not match data: or #
  // Permit optional leading whitespace inside the quote before the scheme
  const attrPattern = /(?:src|href)\s*=\s*['"]?\s*(?:https?:\/\/|\/\/)/i;
  if (attrPattern.test(html)) {
    problems.push("Forbidden src or href with external URL");
  }

  return {
    ok: problems.length === 0,
    problems,
  };
}

export function wrapAnimationDocument(title: string, bodyHtml: string): string {
  const baseStyles = `
html, body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background-color: #f5f5f5;
  color: #333;
}
body {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 20px;
}
.animation-container {
  max-width: 900px;
  width: 100%;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 40px;
}
  `.trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtmlAttribute(title)}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="animation-container">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

function escapeHtmlAttribute(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
