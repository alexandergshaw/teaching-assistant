import { describe, it, expect } from "vitest";
import { unwrapDocumentFence } from "./llm-fence";

// The exact shape that shipped 16 broken class openers: a real document whose
// warm-up section contains a Python code block.
const OPENER_WITH_CODE = `# Class Opener: Introduction to Project Management

## Case study discussion (about 18 minutes)

The Denver International Airport baggage system overran by 16 months.

- Scope grew after the design was frozen.
- No single owner held the schedule.

Discussion Questions:
1. What key principles were at play?
2. What would you do differently?

## Warm-up exercise (about 10 minutes)

Audit the dependency list below.

\`\`\`python
required_packages = ["react", "babel"]
def audit_dependencies(required, installed):
    pass
\`\`\`

## Debrief (about 5 minutes)

Key concepts: scope control beats schedule heroics.`;

describe("unwrapDocumentFence", () => {
  // THE regression. The old regex matched the inner ```python fence and
  // returned only the code, discarding every word of the document.
  it("never unwraps an inner code fence", () => {
    const result = unwrapDocumentFence(OPENER_WITH_CODE);
    expect(result).toBe(OPENER_WITH_CODE);
    expect(result).toContain("# Class Opener");
    expect(result).toContain("Denver International Airport");
    expect(result).toContain("## Debrief");
  });

  it("leaves a plain document completely untouched", () => {
    const plain = "# Title\n\nSome prose.\n\n- a bullet";
    expect(unwrapDocumentFence(plain)).toBe(plain);
  });

  it("unwraps a whole-document markdown fence", () => {
    expect(unwrapDocumentFence("```markdown\n# Title\n\nBody.\n```")).toBe("# Title\n\nBody.");
    expect(unwrapDocumentFence("```md\n# Title\n```")).toBe("# Title");
    expect(unwrapDocumentFence("```text\nBody.\n```")).toBe("Body.");
  });

  it("unwraps an untagged whole-document fence", () => {
    expect(unwrapDocumentFence("```\n# Title\n\nBody.\n```")).toBe("# Title\n\nBody.");
  });

  // A ```python opener means the fence opens a code block, not the document.
  it("refuses to unwrap when the opening fence names a programming language", () => {
    const codeFirst = '```python\nprint("hi")\n```';
    expect(unwrapDocumentFence(codeFirst)).toBe(codeFirst);

    const jsFirst = "```js\nconst a = 1;\n```";
    expect(unwrapDocumentFence(jsFirst)).toBe(jsFirst);
  });

  it("leaves a document that merely ENDS with a code block alone", () => {
    const endsWithCode = '# Title\n\nTry this:\n\n```python\nprint("hi")\n```';
    expect(unwrapDocumentFence(endsWithCode)).toBe(endsWithCode);
  });

  it("leaves a document that merely STARTS with a code block alone", () => {
    const startsWithCode = '```python\nprint("hi")\n```\n\nNow explain what it does.';
    expect(unwrapDocumentFence(startsWithCode)).toBe(startsWithCode);
  });

  it("unwraps a wrapper even when the document inside contains code fences", () => {
    const wrapped = "```markdown\n# Title\n\n```python\nx = 1\n```\n\nDone.\n```";
    const result = unwrapDocumentFence(wrapped);
    expect(result).toContain("# Title");
    expect(result).toContain("x = 1");
    expect(result).toContain("Done.");
    expect(result.startsWith("```markdown")).toBe(false);
  });

  it("trims surrounding whitespace before deciding", () => {
    expect(unwrapDocumentFence("\n\n  ```markdown\n# Title\n```  \n")).toBe("# Title");
  });

  // Returning "" would hand the caller an empty document; the raw text is
  // strictly more useful.
  it("never returns an empty string for a malformed empty fence", () => {
    expect(unwrapDocumentFence("```\n```")).not.toBe("");
    expect(unwrapDocumentFence("```markdown\n\n```")).not.toBe("");
  });

  it("is idempotent", () => {
    const once = unwrapDocumentFence("```markdown\n# Title\n```");
    expect(unwrapDocumentFence(once)).toBe(once);
  });
});
