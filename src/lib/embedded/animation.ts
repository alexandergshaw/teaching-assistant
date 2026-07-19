/**
 * Deterministic animation scaffold for concept visualization. When an LLM
 * provider is unavailable or animations fail validation, this generates a
 * stable fallback: a self-contained HTML fragment with SVG stage diagrams
 * and CSS keyframes, no external resources, no JavaScript.
 *
 * The same concept and visualIdea always produce the same animation; different
 * inputs yield different layouts but consistent styling (muted palette, system
 * fonts, professional presentation).
 */

import { pick } from "./scaffold";

/**
 * Generate a deterministic animated concept visualization. The output is an
 * HTML fragment (no doctype/html/head/body) that contains an SVG diagram of
 * 3-4 labeled stage boxes connected by arrows, a CSS keyframes loop
 * highlighting each stage in turn, the concept as a heading, visualIdea as
 * subtitle, and a step legend. Muted professional palette (grays + one accent),
 * system fonts, no emojis. Always passes validateAnimationHtml.
 */
export function scaffoldConceptAnimation(concept: string, visualIdea: string): string {
  const stageCount = 4;
  const cycleTime = 16;
  const stageNames = deriveStageNames(concept);
  const accentColor = pick(
    ["#0066cc", "#2e5c8a", "#4a7c59", "#6b4423"],
    concept
  );

  const svgContent = buildAnimationSvg(stageNames);
  const keyframes = buildKeyframes(stageCount, cycleTime, accentColor);
  const subtitle = visualIdea.trim() || "Concept evolution over time";

  const html = `<style>
@keyframes highlight-stage {
${keyframes}
}

.concept-animation {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  line-height: 1.5;
  color: #555;
}

.concept-animation h2 {
  margin: 0 0 0.5em 0;
  font-size: 1.75em;
  font-weight: 600;
  color: #333;
}

.concept-animation .subtitle {
  margin: 0 0 1.5em 0;
  font-size: 1em;
  color: #888;
  font-style: italic;
}

.concept-animation svg {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1.5em 0;
  background: #fafafa;
  border-radius: 4px;
  padding: 1em;
}

.stage {
  animation: highlight-stage ${cycleTime}s infinite;
  transition: fill 200ms ease-out;
}

.stage-1 { animation-delay: 0s; }
.stage-2 { animation-delay: ${cycleTime / stageCount}s; }
.stage-3 { animation-delay: ${(2 * cycleTime) / stageCount}s; }
.stage-4 { animation-delay: ${(3 * cycleTime) / stageCount}s; }

.concept-animation .legend {
  margin: 1.5em 0 0 0;
  padding: 1em;
  background: #f5f5f5;
  border-left: 3px solid ${accentColor};
  border-radius: 2px;
  font-size: 0.95em;
}

.concept-animation .legend-title {
  font-weight: 600;
  color: #333;
  margin: 0 0 0.75em 0;
}

.concept-animation .legend-item {
  margin: 0.5em 0;
  color: #666;
}

.concept-animation .legend-item strong {
  color: #333;
}
</style>

<div class="concept-animation">
  <h2>${escapeHtml(concept)}</h2>
  <p class="subtitle">${escapeHtml(subtitle)}</p>

  ${svgContent}

  <div class="legend">
    <div class="legend-title">Stages</div>
    ${stageNames
      .map(
        (name, i) =>
          `<div class="legend-item"><strong>${i + 1}. ${escapeHtml(name)}</strong></div>`
      )
      .join("")}
  </div>
</div>`;

  return html;
}

/**
 * Derive stage names from the concept using a mix of generic and deterministic
 * variations, so different concepts get slightly different narratives but the
 * same concept always gets the same stages.
 */
function deriveStageNames(concept: string): string[] {
  const generic = ["Setup", "Process", "Transform", "Result"];
  const variant = pick([0, 1, 2], concept);

  if (variant === 1) {
    return ["Foundation", "Development", "Application", "Outcome"];
  } else if (variant === 2) {
    return ["Initialize", "Execute", "Integrate", "Complete"];
  }
  return generic;
}

/**
 * Build an SVG diagram of stage boxes connected by arrows. Stages are
 * positioned horizontally with connecting arrows, no interactive features.
 */
function buildAnimationSvg(stages: string[]): string {
  const boxWidth = 120;
  const boxHeight = 80;
  const spacing = 160;
  const margin = 40;
  const svgWidth = stages.length * spacing + margin * 2;
  const svgHeight = 200;
  const centerY = svgHeight / 2;
  const textY = centerY + 5;

  const arrowDefs = `
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
        <polygon points="0 0, 10 3, 0 6" fill="#999" />
      </marker>
    </defs>
  `;

  const boxes = stages
    .map((name, i) => {
      const x = margin + i * spacing;
      const boxX = x + spacing / 2 - boxWidth / 2;
      const boxY = centerY - boxHeight / 2;

      return `<g class="stage stage-${i + 1}">
        <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" fill="#e8e8e8" stroke="#999" stroke-width="1" rx="4" />
        <text x="${x + spacing / 2}" y="${textY}" text-anchor="middle" font-size="13" font-weight="500" fill="#333">
          ${i + 1}
        </text>
        <text x="${x + spacing / 2}" y="${textY + 18}" text-anchor="middle" font-size="12" fill="#666">
          ${escapeHtmlXml(name.split(" ")[0])}
        </text>
      </g>`;
    })
    .join("");

  const arrows = stages
    .slice(0, -1)
    .map((_, i) => {
      const x1 = margin + (i + 1) * spacing - boxWidth / 2 - 20;
      const x2 = x1 + 40;
      return `<line x1="${x1}" y1="${centerY}" x2="${x2}" y2="${centerY}" stroke="#999" stroke-width="2" marker-end="url(#arrowhead)" />`;
    })
    .join("");

  return `<svg viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    ${arrowDefs}
    ${boxes}
    ${arrows}
  </svg>`;
}

/**
 * Build the CSS keyframes animation. Emits a single highlight pulse that,
 * when combined with staggered animation-delay on each stage, lights them
 * sequentially. Each stage highlights for 1/stageCount of the cycle.
 */
function buildKeyframes(stageCount: number, cycleTime: number, accentColor: string): string {
  const holdStart = 3;
  const holdEnd = 100 / stageCount - 3;

  return `  0% { fill: #e8e8e8; }
  ${holdStart}% { fill: ${accentColor}; }
  ${holdEnd}% { fill: ${accentColor}; }
  ${100 / stageCount}% { fill: #e8e8e8; }
  100% { fill: #e8e8e8; }`;
}

/**
 * Escape HTML special characters for safe embedding in HTML text nodes.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape text for safe embedding in SVG text elements.
 * SVG content should still use HTML entity encoding for consistency.
 */
function escapeHtmlXml(text: string): string {
  return escapeHtml(text);
}
