import { describe, it, expect } from "vitest";
import { scaffoldConceptAnimation } from "./animation";
// Note: validateAnimationHtml is from CHUNK N1 (animation-html.ts), which may
// not exist yet; this import and test verify the scaffold passes validation
// when animation-html.ts is available.
import { validateAnimationHtml } from "@/lib/animation-html";

describe("scaffoldConceptAnimation", () => {
  it("returns a non-empty string", () => {
    const result = scaffoldConceptAnimation("Recursion", "Functions calling themselves");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes the concept text in the output", () => {
    const concept = "Photosynthesis";
    const result = scaffoldConceptAnimation(concept, "Light to energy");
    expect(result).toContain(concept);
  });

  it("includes the visual idea in the output", () => {
    const visualIdea = "Water flowing through stages";
    const result = scaffoldConceptAnimation("Osmosis", visualIdea);
    expect(result).toContain(visualIdea);
  });

  it("uses a fallback subtitle when visualIdea is empty", () => {
    const result = scaffoldConceptAnimation("Concept", "");
    expect(result).toContain("Concept evolution over time");
  });

  it("is deterministic: same inputs produce identical output", () => {
    const concept = "Recursion";
    const idea = "A function calling itself";
    const result1 = scaffoldConceptAnimation(concept, idea);
    const result2 = scaffoldConceptAnimation(concept, idea);
    expect(result1).toBe(result2);
  });

  it("produces different output for different inputs", () => {
    const result1 = scaffoldConceptAnimation("Recursion", "Functions");
    const result2 = scaffoldConceptAnimation("Iteration", "Loops");
    expect(result1).not.toBe(result2);
  });

  it("contains SVG markup", () => {
    const result = scaffoldConceptAnimation("Example", "Idea");
    expect(result).toContain("<svg");
    expect(result).toContain("</svg>");
  });

  it("contains CSS keyframes animation", () => {
    const result = scaffoldConceptAnimation("Example", "Idea");
    expect(result).toContain("@keyframes");
    expect(result).toContain("highlight-stage");
  });

  it("contains a legend with stage labels", () => {
    const result = scaffoldConceptAnimation("Example", "Idea");
    expect(result).toContain("Stages");
    expect(result).toContain("legend");
  });

  it("does not include any <script> tags", () => {
    const result = scaffoldConceptAnimation("Example", "Idea");
    expect(result).not.toMatch(/<script/i);
  });

  it("does not include any external resource references", () => {
    const result = scaffoldConceptAnimation("Example", "Idea");
    // Check for actual external URLs in src/href attributes or url() functions, not namespace declarations
    expect(result).not.toMatch(/(?:src|href|url)\s*=?\s*["']?https?:\/\//i);
    expect(result).not.toMatch(/url\s*\(\s*https?:\/\//i);
  });

  it("escapes HTML entities in concept and visualIdea", () => {
    const concept = "Recursion<script>";
    const idea = "Test & demo";
    const result = scaffoldConceptAnimation(concept, idea);
    // Should escape < > and &, not include literal tags
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;");
    expect(result).toContain("&amp;");
  });

  it("passes the animation HTML validator", () => {
    const result = scaffoldConceptAnimation("Core Concept", "Visual progression");
    const validation = validateAnimationHtml(result);
    expect(validation.ok).toBe(true);
    expect(validation.problems).toHaveLength(0);
  });
});
