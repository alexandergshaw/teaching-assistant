// Wiring test for the accommodations unselectable mechanism (backlog N4,
// requirements 1 and 2 of the UI build brief).
//
// Asserts by source-text inspection (vitest here is node-env and renders no
// component - docs/loop/this-repo.md - so this is a reading claim, not a
// rendered one, exactly like every other .tsx assertion in this repo):
//
// 1. AccommodationsPanel.module.css's .entryText rule contains
//    `user-select: none`, anchored on the selector AND the property
//    together (not merely "the string appears somewhere in the file").
// 2. AccommodationsText.tsx applies that class via `styles.entryText`.
// 3. AccommodationsPanel.tsx renders every accommodations-derived string
//    (resolved student name/id fallback, note text, resolved course/
//    assignment name in the scope label) through <AccommodationsText>.
// 4. None of the forbidden attributes (title, aria-label, alt, placeholder,
//    value) carries an accommodations-derived value - the known gap
//    requirement 2 names - with one stated, deliberate exception: the
//    edit-note textarea's `value={editNote}`, which is asserted to be
//    exactly that one call site and no other.
//
// SABOTAGE CONTROL (performed once, this build wave, to prove this test can
// fail - see the wave report for the result): the `user-select: none;` line
// was deleted from .entryText, this test was run and confirmed red, the
// line was restored; separately, `styles.entryText` was removed from
// AccommodationsText.tsx's className, this test was run and confirmed red
// again, and the line was restored. Neither mutation survives in the
// committed tree.
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const DIR = path.join(__dirname);
const CSS_SOURCE = readFileSync(path.join(DIR, "AccommodationsPanel.module.css"), "utf8");
const TEXT_SOURCE = readFileSync(path.join(DIR, "AccommodationsText.tsx"), "utf8");
const PANEL_SOURCE = readFileSync(path.join(DIR, "AccommodationsPanel.tsx"), "utf8");
const AMBIENT_SOURCE = readFileSync(path.join(DIR, "AccommodationsAmbientControl.tsx"), "utf8");

describe("accommodations unselectable mechanism wiring", () => {
  it("defines .entryText with user-select: none, anchored on the selector and property together", () => {
    // Anchored so a rule attached to some OTHER selector (e.g. the delete
    // button) cannot satisfy this - the block itself must contain both.
    expect(CSS_SOURCE).toMatch(/\.entryText\s*\{[^}]*user-select:\s*none/);
    expect(CSS_SOURCE).toMatch(/\.entryText\s*\{[^}]*-webkit-user-select:\s*none/);
  });

  it("AccommodationsText.tsx applies styles.entryText to the element it renders", () => {
    expect(TEXT_SOURCE).toContain('import styles from "./AccommodationsPanel.module.css"');
    expect(TEXT_SOURCE).toMatch(/styles\.entryText/);
    // Applied to the returned element's className, not merely referenced.
    expect(TEXT_SOURCE).toMatch(/className=\{combined\}/);
  });

  it("AccommodationsPanel.tsx imports AccommodationsText and renders it as JSX", () => {
    expect(PANEL_SOURCE).toContain('import AccommodationsText from "./AccommodationsText"');
    expect(PANEL_SOURCE).toMatch(/<AccommodationsText[\s>]/);
  });

  it("wraps the resolved student name/id fallback in AccommodationsText", () => {
    expect(PANEL_SOURCE).toMatch(/<AccommodationsText>\{nameDisplay\}<\/AccommodationsText>/);
  });

  it("wraps the note text in AccommodationsText", () => {
    expect(PANEL_SOURCE).toMatch(/<AccommodationsText>\{entry\.note\}<\/AccommodationsText>/);
  });

  it("wraps the AC-X1 scope label (institution/course/assignment names) in AccommodationsText", () => {
    const scopeLabelMatch = PANEL_SOURCE.match(/<AccommodationsText as="p"[^>]*>([\s\S]*?)<\/AccommodationsText>/);
    expect(scopeLabelMatch).not.toBeNull();
    expect(scopeLabelMatch?.[1]).toMatch(/institution/);
    expect(scopeLabelMatch?.[1]).toMatch(/courseName/);
    expect(scopeLabelMatch?.[1]).toMatch(/assignmentName/);
  });

  it("never puts a student's name, note, or id into a title/aria-label/alt/placeholder that is built from data", () => {
    // Every dynamic (template-literal or expression) title/aria-label/alt in
    // both files must NOT reference any accommodations-derived identifier.
    // Static string literals (aria-label="Delete accommodation") are fine -
    // this only flags the DYNAMIC form, `attr={...}` or `attr={\`...`.
    const forbiddenIdentifiers = ["nameDisplay", "resolvedName", "entry.note", "entry.canvasUserId", "courseName", "assignmentName", "newNote", "editNote"];
    const dynamicAttrPattern = /(title|aria-label|alt|placeholder)=\{([^}]*)\}/g;
    for (const source of [PANEL_SOURCE, AMBIENT_SOURCE]) {
      let match: RegExpExecArray | null;
      dynamicAttrPattern.lastIndex = 0;
      while ((match = dynamicAttrPattern.exec(source))) {
        const [, , exprBody] = match;
        for (const forbidden of forbiddenIdentifiers) {
          expect(exprBody, `${match[1]}={${exprBody}} must not reference ${forbidden}`).not.toContain(forbidden);
        }
      }
    }
  });

  it("the only accommodations-derived values in a `value` attribute are the two stated, deliberate note-textarea exceptions", () => {
    const valueAttrPattern = /value=\{([^}]*)\}/g;
    // nameDisplay/resolvedName/entry.note are the DISPLAY-ONLY forms (a
    // resolved name, or an existing note shown read-only) - these may never
    // appear in a value attribute at all. newNote/editNote are the two
    // editable-textarea exceptions this file's header states explicitly:
    // the owner's own freshly-typed text (add form) and the existing note
    // being edited (edit form) - both are the one authoritative editable
    // copy of free text, not a display duplicate.
    const forbiddenInValue = ["nameDisplay", "resolvedName", "entry.note"];
    const allowedInValue = ["newNote", "editNote"];
    const offenders: string[] = [];
    const seenAllowed = new Set<string>();
    let match: RegExpExecArray | null;
    valueAttrPattern.lastIndex = 0;
    while ((match = valueAttrPattern.exec(PANEL_SOURCE))) {
      const expr = match[1].trim();
      if (forbiddenInValue.some((id) => expr.includes(id))) {
        offenders.push(expr);
      }
      for (const allowed of allowedInValue) {
        if (expr === allowed) seenAllowed.add(allowed);
      }
    }
    expect(offenders).toEqual([]);
    expect(Array.from(seenAllowed).sort()).toEqual([...allowedInValue].sort());
  });

  it("the student picker is a native <select>, never an MUI Autocomplete, closing the portal/attribute gap by construction", () => {
    // Checks actual usage (an import or JSX element), not the word appearing
    // anywhere - this file's own comments discuss, by name, the Autocomplete
    // pattern it deliberately avoids, so a bare substring match would flag
    // its own explanatory prose.
    expect(PANEL_SOURCE).not.toMatch(/from ["']@mui\/material\/Autocomplete["']/);
    expect(PANEL_SOURCE).not.toMatch(/<Autocomplete[\s/>]/);
    expect(PANEL_SOURCE).toMatch(/<select[\s\S]*?id="accom-new-student"/);
  });
});
