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
    const recordingDir = path.resolve(
      process.cwd(),
      "src/app/components/recording"
    );
    const recordingTabPath = path.resolve(
      process.cwd(),
      "src/app/components/RecordingTab.tsx"
    );

    const files = fs.readdirSync(recordingDir);
    const tsFiles = files.filter(
      (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts")
    );
    const recordingTabContent = fs.readFileSync(recordingTabPath, "utf-8");

    // Hoisted so both the key-inventory canary below and the read/write
    // wiring check (hole 1) scan the exact same combined source, rather than
    // each re-deriving its own file list that could quietly drift apart.
    const combinedRecordingSource =
      tsFiles
        .map((file) => fs.readFileSync(path.join(recordingDir, file), "utf-8"))
        .join("\n") +
      "\n" +
      recordingTabContent;

    // Shared by both the disc and ann read/write wiring-check blocks below
    // (moved here, out of the disc block, so the ann block - added by this
    // group, docs/reply-composition-controls-acceptance-criteria.md C0-1 -
    // does not have to duplicate it). What "wired" honestly means here, and
    // no more: the literal key string appears as the argument of a call
    // shaped like a persistence READ (`readLocalStorage("KEY")`,
    // `readPersisted("KEY")` or `localStorage.getItem("KEY")`), AND,
    // separately, as the argument of a call shaped like a persistence WRITE
    // (`writeLocalStorage("KEY", ...)` or `localStorage.setItem("KEY", ...)`)
    // - directly, or via a `const NAME = "KEY"` binding used at the call
    // site instead of the literal (the three useReplyRows.ts STORAGE_KEY_*
    // keys need this; the ta-rec-ann-* keys do not, but the same helper
    // covers both without caring which shape a given key uses). A
    // source-text scan cannot prove the read result reaches component
    // state, that the write effect actually fires at runtime, or that
    // either runs at all - only that both call shapes exist in the source,
    // addressed to this exact key. That is enough to catch the proven
    // failure mode: a write call deleted outright while the read (and the
    // key string itself) survives untouched.
    function isWired(key: string, callKind: "read" | "write"): boolean {
      const directPattern =
        callKind === "read"
          ? new RegExp(`(readLocalStorage|readPersisted|localStorage\\.getItem)\\(\\s*["']${key}["']\\s*\\)`)
          : new RegExp(`(writeLocalStorage|localStorage\\.setItem)\\(\\s*["']${key}["']\\s*,`);
      if (directPattern.test(combinedRecordingSource)) return true;

      const constNames = Array.from(
        combinedRecordingSource.matchAll(new RegExp(`const\\s+(\\w+)\\s*=\\s*["']${key}["']`, "g"))
      ).map((m) => m[1]);
      if (constNames.length === 0) return false;

      return constNames.some((name) => {
        const pattern =
          callKind === "read"
            ? new RegExp(`(readLocalStorage|readPersisted|localStorage\\.getItem)\\(\\s*${name}\\s*\\)`)
            : new RegExp(`(writeLocalStorage|localStorage\\.setItem)\\(\\s*${name}\\s*,`);
        return pattern.test(combinedRecordingSource);
      });
    }

    it("should have exactly the expected set of ta-rec-* keys", () => {
      const keysSet = new Set<string>();
      const matches = combinedRecordingSource.match(/ta-rec-[a-z-]*/g);
      if (matches) {
        matches.forEach((match) => keysSet.add(match));
      }

      const derivedKeys = Array.from(keysSet).sort();
      const expectedKeys = [
        "ta-rec-ann-course",
        "ta-rec-ann-formality",
        "ta-rec-ann-ingredients",
        "ta-rec-autostop",
        "ta-rec-avatar-camera",
        "ta-rec-avatar-course",
        "ta-rec-avatar-mic",
        "ta-rec-avatar-name",
        "ta-rec-avatar-prompt",
        "ta-rec-avatar-purpose",
        "ta-rec-avatar-script",
        "ta-rec-bg",
        "ta-rec-camera",
        "ta-rec-card-bg",
        "ta-rec-card-closing",
        "ta-rec-card-secs",
        "ta-rec-card-subtitle",
        "ta-rec-card-text",
        "ta-rec-card-title",
        "ta-rec-cards",
        "ta-rec-disc-address-name",
        "ta-rec-disc-audience",
        "ta-rec-disc-course",
        "ta-rec-disc-filter",
        "ta-rec-disc-formality",
        "ta-rec-disc-ingredients",
        "ta-rec-disc-kb-context-label",
        "ta-rec-disc-save-video",
        "ta-rec-disc-sort",
        "ta-rec-disc-table",
        "ta-rec-echo",
        "ta-rec-gain",
        "ta-rec-mic",
        "ta-rec-mirror",
        "ta-rec-noise",
        "ta-rec-pen-color",
        "ta-rec-pen-size",
        "ta-rec-pip",
        "ta-rec-pip-corner",
        "ta-rec-pip-shape",
        "ta-rec-pip-size",
        "ta-rec-prompter",
        "ta-rec-prompter-size",
        "ta-rec-res",
        "ta-rec-screen-audio",
        "ta-rec-script",
        "ta-rec-script-minutes",
        "ta-rec-script-objectives",
        "ta-rec-script-topic",
        "ta-rec-source",
        "ta-rec-speed-rate",
        "ta-rec-use-countdown",
        "ta-rec-view",
        "ta-rec-walk-keep-source-audio",
        "ta-rec-walk-mode",
      ];

      expect(derivedKeys).toEqual(expectedKeys);
    });

    describe("every ta-rec-avatar-* key is wired to both a read and a write (hole 1)", () => {
      // Hole 1 (proven by sabotage): the canary above proves each key
      // STRING appears somewhere in this directory - and that string also
      // appears inside a `readPersisted("ta-rec-avatar-name")` READ call, so
      // deleting the paired `localStorage.setItem` WRITE leaves the key
      // string (and the canary above) completely untouched. Verified by
      // sabotage: deleting the "ta-rec-avatar-name" write in
      // useAvatarCapture.ts produced zero failures anywhere in the suite
      // before this block existed.
      //
      // The key list below is DERIVED from the same combinedRecordingSource
      // the canary above scans, filtered to the "ta-rec-avatar-" prefix,
      // rather than hardcoded a second time here - a hardcoded key/file list
      // on this exact surface (a source inventory in this directory) has
      // already failed an audit in this repo before (see
      // docs/REGRESSION.md entry 272 check 5: a hardcoded scan-target list
      // that excluded the very file it existed to police). A new
      // ta-rec-avatar-* key is therefore covered by this check with no
      // second list to remember to update.
      const avatarKeys = Array.from(
        new Set(combinedRecordingSource.match(/ta-rec-avatar-[a-z-]*/g) ?? [])
      ).sort();

      it("finds at least one ta-rec-avatar-* key to check - a check over nothing proves nothing", () => {
        expect(avatarKeys.length).toBeGreaterThan(0);
      });

      it.each(avatarKeys)(
        '"%s" has both a read and a write call wired to that literal key',
        (key) => {
          // What "wired" honestly means here, and no more: the literal key
          // string appears as the argument of a call shaped like a
          // persistence READ (`readPersisted("KEY")` or
          // `localStorage.getItem("KEY")`), AND, separately, as the argument
          // of a call shaped like a persistence WRITE
          // (`localStorage.setItem("KEY", ...)`). A source-text scan cannot
          // prove the read result reaches component state, that the write
          // effect actually fires at runtime, or that either runs at all -
          // only that both call shapes exist in the source, addressed to
          // this exact key. That is enough to catch the proven failure
          // mode: a write call deleted outright while the read (and the key
          // string itself) survives untouched.
          const readPattern = new RegExp(
            `(readPersisted|localStorage\\.getItem)\\(\\s*["']${key}["']\\s*\\)`
          );
          const writePattern = new RegExp(
            `localStorage\\.setItem\\(\\s*["']${key}["']\\s*,`
          );
          expect(
            combinedRecordingSource,
            `expected a read call (readPersisted or localStorage.getItem) wired to "${key}"`
          ).toMatch(readPattern);
          expect(
            combinedRecordingSource,
            `expected a localStorage.setItem write call wired to "${key}"`
          ).toMatch(writePattern);
        }
      );
    });

    describe("every ta-rec-disc-* key is wired to both a read and a write (C5c)", () => {
      // docs/reply-composition-controls-acceptance-criteria.md C5c-i: the
      // avatar check right above is NOT copy-pasteable onto this surface,
      // and an earlier draft of the AC assumed it was. Two mismatches, either
      // of which yields a screenful of red tests over correct code:
      //
      //  - useDiscussionReplies.ts (audience/course/save-video, and this
      //    group's three new keys - address-name/formality/ingredients)
      //    reads and writes through `readLocalStorage("literal key")` /
      //    `writeLocalStorage("literal key", ...)`, not `readPersisted` or a
      //    bare `localStorage.getItem`/`setItem`.
      //  - useReplyRows.ts (filter/sort/table) reads and writes through
      //    `window.localStorage.getItem(STORAGE_KEY_X)` /
      //    `window.localStorage.setItem(STORAGE_KEY_X, ...)`, where
      //    STORAGE_KEY_X is a `const` binding, not the literal string, at the
      //    call site - a literal-argument regex cannot see these three keys
      //    at all, however the call is spelled.
      //
      // So each key is checked two ways below: DIRECT (the literal key
      // string is itself the argument of a read/write call, covering the six
      // readLocalStorage/writeLocalStorage keys), or INDIRECT (the key is
      // bound to a `const NAME = "key"` identifier somewhere in this
      // directory, and that IDENTIFIER - not the literal - is the argument
      // of a read/write call, covering the three STORAGE_KEY_* keys). Either
      // shape counts as wired; a key needs only one to pass.
      //
      // Proven by sabotage: with the "ta-rec-disc-address-name" write
      // deleted from useDiscussionReplies.ts's setComposition, this check's
      // own "write" assertion for that key went red (and only that
      // assertion) while the canary above stayed green - the failure mode
      // hole 1 exists to catch, reproduced and confirmed on this surface,
      // then reverted.
      //
      // The key list is DERIVED from the same combinedRecordingSource the
      // canary above scans (never hardcoded a second time - see the avatar
      // block's own comment on why a hardcoded scan-target list has already
      // failed an audit in this repo).
      const discKeys = Array.from(
        new Set(combinedRecordingSource.match(/ta-rec-disc-[a-z-]*/g) ?? [])
      ).sort();

      it("finds at least one ta-rec-disc-* key to check - a check over nothing proves nothing", () => {
        expect(discKeys.length).toBeGreaterThan(0);
      });

      it("finds exactly ten ta-rec-disc-* keys (C5c-ii's nine, plus the 'activate from Knowledge base' group's own ta-rec-disc-kb-context-label)", () => {
        expect(discKeys).toHaveLength(10);
      });

      it.each(discKeys)(
        '"%s" has both a read and a write call wired to that key (directly, or via a const STORAGE_KEY_* binding)',
        (key) => {
          expect(isWired(key, "read"), `expected a read call wired to "${key}"`).toBe(true);
          expect(isWired(key, "write"), `expected a write call wired to "${key}"`).toBe(true);
        }
      );
    });

    describe("every ta-rec-ann-* key is wired to both a read and a write", () => {
      // docs/reply-composition-controls-acceptance-criteria.md C0-1 (this
      // group, implementer C2): the announcement half of the same C5c
      // wiring gap the disc block above closes - the canary above proves a
      // key STRING exists somewhere in this directory, not that it is both
      // written and read back. This surface reads/writes all three
      // ta-rec-ann-* keys directly through bare `window.localStorage
      // .getItem`/`localStorage.setItem` calls with the literal key as the
      // argument (useTakeAnnouncement.ts for the two new keys; that file and
      // RecordingTab.tsx for the pre-existing course key), so the DIRECT
      // branch of the shared isWired() helper above covers all three with no
      // STORAGE_KEY_* indirection to account for.
      const annKeys = Array.from(new Set(combinedRecordingSource.match(/ta-rec-ann-[a-z-]*/g) ?? [])).sort();

      it("finds at least one ta-rec-ann-* key to check - a check over nothing proves nothing", () => {
        expect(annKeys.length).toBeGreaterThan(0);
      });

      it("finds exactly three ta-rec-ann-* keys (course, plus this group's formality and ingredients)", () => {
        expect(annKeys).toHaveLength(3);
      });

      it.each(annKeys)('"%s" has both a read and a write call wired to that key', (key) => {
        expect(isWired(key, "read"), `expected a read call wired to "${key}"`).toBe(true);
        expect(isWired(key, "write"), `expected a write call wired to "${key}"`).toBe(true);
      });
    });
  });
});
