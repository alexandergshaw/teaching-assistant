import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fmt } from "./types";

describe("recording-split structure", () => {
  describe("fmt()", () => {
    it("should format 0 seconds as 0:00", () => {
      expect(fmt(0)).toBe("0:00");
    });

    it("should format 59 seconds as 0:59", () => {
      expect(fmt(59)).toBe("0:59");
    });

    it("should format 60 seconds as 1:00", () => {
      expect(fmt(60)).toBe("1:00");
    });

    it("should format 61 seconds as 1:01", () => {
      expect(fmt(61)).toBe("1:01");
    });

    it("should format 3599 seconds as 59:59", () => {
      expect(fmt(3599)).toBe("59:59");
    });

    it("should format 3600 seconds as 60:00", () => {
      expect(fmt(3600)).toBe("60:00");
    });
  });

  describe("split structure guard (ratchet canary)", () => {
    it("should keep RecordingTab.tsx under 1000 lines", () => {
      const content = fs.readFileSync(
        path.resolve(process.cwd(), "src/app/components/RecordingTab.tsx"),
        "utf-8"
      );
      const lineCount = content.split("\n").length;
      expect(lineCount).toBeLessThanOrEqual(1000);
    });

    it("should keep TabShell.tsx under 1000 lines", () => {
      const content = fs.readFileSync(
        path.resolve(process.cwd(), "src/app/components/TabShell.tsx"),
        "utf-8"
      );
      const lineCount = content.split("\n").length;
      expect(lineCount).toBeLessThanOrEqual(1000);
    });

    it("should keep all recording/*.ts/*.tsx files under 1000 lines", () => {
      const recordingDir = path.resolve(
        process.cwd(),
        "src/app/components/recording"
      );
      const files = fs.readdirSync(recordingDir);
      const tsFiles = files.filter((f) => /\.(ts|tsx)$/.test(f));

      for (const file of tsFiles) {
        const filePath = path.join(recordingDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const lineCount = content.split("\n").length;
        expect(
          lineCount,
          `${file} should be under 1000 lines but has ${lineCount}`
        ).toBeLessThanOrEqual(1000);
      }
    });
  });

  describe("contract strings in RecordingTab.tsx source", () => {
    const recordingTabContent = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/components/RecordingTab.tsx"),
      "utf-8"
    );

    it("should re-export Take from recording/types", () => {
      expect(recordingTabContent).toContain(
        'export type { Take } from "./recording/types";'
      );
    });

    it("should have default export function RecordingTab", () => {
      expect(recordingTabContent).toContain("export default function RecordingTab");
    });

    it("should use TabShell as root container", () => {
      expect(recordingTabContent).toContain("<TabShell");
    });
  });

  describe("localStorage key canary (cross-component API)", () => {
    it("should have exactly the expected set of ta-rec-* keys", () => {
      const recordingDir = path.resolve(
        process.cwd(),
        "src/app/components/recording"
      );
      const recordingTabPath = path.resolve(
        process.cwd(),
        "src/app/components/RecordingTab.tsx"
      );

      const keysSet = new Set<string>();

      // Scan recording directory
      const files = fs.readdirSync(recordingDir);
      const tsFiles = files.filter(
        (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts")
      );

      for (const file of tsFiles) {
        const filePath = path.join(recordingDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const matches = content.match(/ta-rec-[a-z-]*/g);
        if (matches) {
          matches.forEach((match) => keysSet.add(match));
        }
      }

      // Scan RecordingTab.tsx
      const recordingTabContent = fs.readFileSync(recordingTabPath, "utf-8");
      const matches = recordingTabContent.match(/ta-rec-[a-z-]*/g);
      if (matches) {
        matches.forEach((match) => keysSet.add(match));
      }

      const derivedKeys = Array.from(keysSet).sort();
      const expectedKeys = [
        "ta-rec-autostop",
        "ta-rec-bg",
        "ta-rec-camera",
        "ta-rec-card-bg",
        "ta-rec-card-closing",
        "ta-rec-card-secs",
        "ta-rec-card-subtitle",
        "ta-rec-card-text",
        "ta-rec-card-title",
        "ta-rec-cards",
        "ta-rec-echo",
        "ta-rec-gain",
        "ta-rec-mic",
        "ta-rec-mirror",
        "ta-rec-noise",
        "ta-rec-pen-color",
        "ta-rec-pen-size",
        "ta-rec-pip",
        "ta-rec-pip-corner",
        "ta-rec-prompter",
        "ta-rec-prompter-size",
        "ta-rec-res",
        "ta-rec-script",
        "ta-rec-script-minutes",
        "ta-rec-script-objectives",
        "ta-rec-script-topic",
        "ta-rec-source",
        "ta-rec-use-countdown",
        "ta-rec-view",
      ];

      expect(derivedKeys).toEqual(expectedKeys);
    });
  });
});
