import { describe, it, expect } from "vitest";
import {
  normalizeConceptKey,
  parseNavItems,
  conceptUrl,
  matchConcept,
  insertNavLeaf,
  insertTopicPageCase,
  VISUALIZER_BASE_URL,
  VISUALIZER_REPO,
  TOPIC_ROUTES,
  TOPIC_TO_EXPORT_MAP,
  TOPIC_TO_DIR_MAP,
} from "./visualizer";

describe("visualizer", () => {
  describe("normalizeConceptKey", () => {
    it("lowercases and removes non-alphanumerics", () => {
      expect(normalizeConceptKey("Recursion")).toBe("recursion");
      expect(normalizeConceptKey("User Input")).toBe("userinput");
      expect(normalizeConceptKey("Array-Slicing!")).toBe("arrayslicing");
      expect(normalizeConceptKey("CONST & LET")).toBe("constlet");
    });

    it("handles edge cases", () => {
      expect(normalizeConceptKey("   ")).toBe("");
      expect(normalizeConceptKey("123")).toBe("123");
      expect(normalizeConceptKey("!!!")).toBe("");
    });
  });

  describe("TOPIC_ROUTES", () => {
    it("contains all expected languages", () => {
      expect(TOPIC_ROUTES.html).toBe("/languages/html");
      expect(TOPIC_ROUTES.javascript).toBe("/languages/javascript");
      expect(TOPIC_ROUTES.python).toBe("/languages/python");
      expect(TOPIC_ROUTES.react).toBe("/languages/react");
      expect(TOPIC_ROUTES.typescript).toBe("/languages/typescript");
    });

    it("contains all expected skills", () => {
      expect(TOPIC_ROUTES.cybersecurity).toBe("/skills/cybersecurity");
      expect(TOPIC_ROUTES.databases).toBe("/skills/databases");
      expect(TOPIC_ROUTES["programming-basics"]).toBe("/skills/programming-basics");
      expect(TOPIC_ROUTES.github).toBe("/skills/github");
    });
  });

  describe("parseNavItems", () => {
    // Real camelCase export names and single-quoted strings from programming-concept-visualizer navItems.ts
    const programmingBasicsSource = `export const programmingBasicsNavItems: SidebarItem[] = [
  { label: 'Introduction', value: 'introduction-computers-run-programs' },
  { label: 'Interpreters & Compilers', value: 'compilers-interpreters' },
  { label: 'Hardware', value: 'hardware' },
  { label: 'Data', value: 'memory' },
  { label: 'Recursion', value: 'recursion-viz' },
  { label: 'Searching', value: 'searching' },
];`;

    // Real single-quoted strings with spaces in values from programming-concept-visualizer navItems.ts
    const pythonSource = `export const pythonNavItems: SidebarItem[] = [
  { label: 'Variables', value: 'variables' },
  { label: 'Numeric Expressions', value: 'numeric-expressions' },
  { label: 'User Input', value: 'user input' },
  { label: 'String Manipulation', value: 'string manipulation' },
  { label: 'Function Basics', value: 'function-basics' },
  { label: 'Recursion', value: 'recursion' },
];`;

    it("parses single topic export with real camelCase name", () => {
      const items = parseNavItems(programmingBasicsSource);
      expect(items.length).toBeGreaterThan(0);
      const recursion = items.find((i) => i.value === 'recursion-viz');
      expect(recursion).toEqual({
        topicExport: "programmingBasicsNavItems",
        label: 'Recursion',
        value: 'recursion-viz',
      });
    });

    it("parses multiple topic exports with multi-word camelCase names", () => {
      const combined = programmingBasicsSource + '\n\n' + pythonSource;
      const items = parseNavItems(combined);
      const progBasicsItems = items.filter((i) => i.topicExport === "programmingBasicsNavItems");
      const pythonItems = items.filter((i) => i.topicExport === "pythonNavItems");
      expect(progBasicsItems.length).toBeGreaterThan(0);
      expect(pythonItems.length).toBeGreaterThan(0);
    });

    it("handles single-quoted strings from real navItems.ts", () => {
      const items = parseNavItems(pythonSource);
      const userInput = items.find((i) => i.value === 'user input');
      expect(userInput).toBeDefined();
      expect(userInput?.label).toBe('User Input');
    });

    it("handles empty exports", () => {
      const empty = "export const emptyItems = [];";
      const items = parseNavItems(empty);
      expect(items).toHaveLength(0);
    });
  });

  describe("conceptUrl", () => {
    it("builds correct URL with encoded slug", () => {
      const url = conceptUrl("/languages/python", "list-comprehension");
      expect(url).toBe(
        "https://programming-concept-visualizer.vercel.app/languages/python?concept=list-comprehension"
      );
    });

    it("URL-encodes special characters in slug", () => {
      const url = conceptUrl("/languages/javascript", "const & let");
      expect(url).toContain("concept=const%20%26%20let");
    });
  });

  describe("matchConcept", () => {
    // Real entries from visualizer navItems exports
    const entries = [
      { topicExport: "pythonNavItems", label: "Recursion", value: "recursion" },
      { topicExport: "pythonNavItems", label: "User Input", value: "user input" },
      { topicExport: "programmingBasicsNavItems", label: "Recursion", value: "recursion-viz" },
    ];

    it("matches on exact normalized value", () => {
      const match = matchConcept(entries, "recursion");
      expect(match).toEqual(entries[0]);
    });

    it("matches on exact normalized label", () => {
      const match = matchConcept(entries, "Recursion");
      expect(match).toEqual(entries[0]);
    });

    it("matches with case-insensitive spaces from real nav entries", () => {
      const match = matchConcept(entries, "user input");
      expect(match).toEqual(entries[1]);
    });

    it("returns null when no match", () => {
      const match = matchConcept(entries, "nonexistent");
      expect(match).toBeNull();
    });

    it("returns first match when multiple possible", () => {
      const match = matchConcept(entries, "recursion");
      expect(match).toEqual(entries[0]);
    });
  });

  describe("insertNavLeaf", () => {
    // Real excerpt-style from programming-concept-visualizer navItems.ts
    const source = `export const pythonNavItems = [
  { label: 'Variables', value: 'variables' },
  { label: 'Loops', value: 'loops' },
];
`;

    it("inserts new leaf before closing bracket", () => {
      const result = insertNavLeaf(source, "pythonNavItems", "Functions", "functions");
      expect(result).not.toBeNull();
      if (result) {
        const items = parseNavItems(result);
        expect(items).toHaveLength(3);
        const functions = items.find((i) => i.value === "functions");
        expect(functions).toBeDefined();
      }
    });

    it("returns null if topic export not found", () => {
      const result = insertNavLeaf(source, "softwareTestingNavItems", "Classes", "classes");
      expect(result).toBeNull();
    });

    it("returns null if slug already present", () => {
      const result = insertNavLeaf(source, "pythonNavItems", "Variables 2", "variables");
      expect(result).toBeNull();
    });

    it("handles empty array", () => {
      const emptySource = "export const programmingBasicsNavItems = [];";
      const result = insertNavLeaf(emptySource, "programmingBasicsNavItems", "First", "first");
      expect(result).not.toBeNull();
      if (result) {
        const items = parseNavItems(result);
        expect(items).toHaveLength(1);
        expect(items[0].value).toBe("first");
      }
    });
  });

  describe("insertTopicPageCase", () => {
    // Real-style excerpt from PythonPage.tsx
    const sourceWithDefault = `import VariableConcept from './VariableConcept';
import UserInputConcept from './UserInputConcept';
import StringManipulationConcept from './StringManipulationConcept';
import { pythonNavItems as navItems } from '../navItems';

export default function PythonPage() {
  const slug = searchParams.concept || '';

  const renderContent = (concept: string | null) => {
    switch (concept) {
      case 'variables':
        return <VariableConcept />;
      case 'user-input':
        return <UserInputConcept />;
      case 'string-manipulation':
        return <StringManipulationConcept />;
      default:
        return null;
    }
  };
}`;

    it("adds import and case statement", () => {
      const result = insertTopicPageCase(
        sourceWithDefault,
        "FunctionsConcept",
        "functions",
        "./FunctionsConcept"
      );
      expect(result).not.toBeNull();
      if (result) {
        expect(result).toContain('import FunctionsConcept from "./FunctionsConcept";');
        expect(result).toContain('case "functions":');
        expect(result).toContain("return <FunctionsConcept />;");
      }
    });

    it("returns null if case already exists", () => {
      const result = insertTopicPageCase(sourceWithDefault, "VariableConcept", "variables", "");
      expect(result).toBeNull();
    });

    it("places case before default", () => {
      const result = insertTopicPageCase(
        sourceWithDefault,
        "NewConcept",
        "newconcept",
        "./NewConcept"
      );
      expect(result).not.toBeNull();
      if (result) {
        const newCaseIndex = result.indexOf('case "newconcept":');
        const defaultIndex = result.indexOf("default:");
        expect(newCaseIndex).toBeLessThan(defaultIndex);
      }
    });
  });

  describe("constants", () => {
    it("VISUALIZER_BASE_URL is correct", () => {
      expect(VISUALIZER_BASE_URL).toBe("https://programming-concept-visualizer.vercel.app");
    });

    it("VISUALIZER_REPO is correct", () => {
      expect(VISUALIZER_REPO).toBe("alexandergshaw/programming-concept-visualizer");
    });
  });

  describe("topic mappings", () => {
    it("TOPIC_TO_EXPORT_MAP contains all TOPIC_ROUTES keys", () => {
      for (const key of Object.keys(TOPIC_ROUTES)) {
        expect(TOPIC_TO_EXPORT_MAP[key]).toBeDefined();
        expect(TOPIC_TO_EXPORT_MAP[key]).toMatch(/NavItems$/);
      }
    });

    it("TOPIC_TO_DIR_MAP contains all TOPIC_ROUTES keys", () => {
      for (const key of Object.keys(TOPIC_ROUTES)) {
        expect(TOPIC_TO_DIR_MAP[key]).toBeDefined();
      }
    });

    it("multi-word topics map to correct camelCase exports", () => {
      expect(TOPIC_TO_EXPORT_MAP["programming-basics"]).toBe("programmingBasicsNavItems");
      expect(TOPIC_TO_EXPORT_MAP["software-testing"]).toBe("softwareTestingNavItems");
      expect(TOPIC_TO_EXPORT_MAP["website-management"]).toBe("websiteManagementNavItems");
      expect(TOPIC_TO_EXPORT_MAP["project-management"]).toBe("projectManagementNavItems");
    });

    it("multi-word topics map to correct PascalCase dirs", () => {
      expect(TOPIC_TO_DIR_MAP["programming-basics"]).toBe("ProgrammingBasics");
      expect(TOPIC_TO_DIR_MAP["software-testing"]).toBe("SoftwareTesting");
      expect(TOPIC_TO_DIR_MAP["website-management"]).toBe("WebsiteManagement");
      expect(TOPIC_TO_DIR_MAP["project-management"]).toBe("ProjectManagement");
    });

    it("special-case topics map correctly", () => {
      expect(TOPIC_TO_EXPORT_MAP.javascript).toBe("javascriptNavItems");
      expect(TOPIC_TO_EXPORT_MAP.typescript).toBe("typeScriptNavItems");
      expect(TOPIC_TO_DIR_MAP.javascript).toBe("JavaScript");
      expect(TOPIC_TO_DIR_MAP.typescript).toBe("TypeScript");
      expect(TOPIC_TO_DIR_MAP.sql).toBe("SQL");
      expect(TOPIC_TO_DIR_MAP.github).toBe("GitHub");
    });
  });
});
