import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// LIVE-LMS-STUDENT-MESSAGING W3 reachability pins. No component is rendered by
// any test in this repo, so these read source to prove the shipped W1/W3-logic
// modules are reachable from the surface and the surface from the app, and that
// the send path is confined to the W4 driver.

const ROOT = process.cwd();
const COMPONENT_DIR = path.join(ROOT, "src", "app", "components", "live-messaging");

function read(...parts: string[]): string {
  return fs.readFileSync(path.join(ROOT, ...parts), "utf8");
}

/** Source with block and line comments removed, so a comment cannot satisfy a pin. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

function component(name: string): string {
  return codeOnly(fs.readFileSync(path.join(COMPONENT_DIR, name), "utf8"));
}

describe("the surface exists", () => {
  it("reads a non-trivial source for every file the pins below depend on", () => {
    for (const name of [
      "SuccessTrackingView.tsx",
      "SuccessTrackingTable.tsx",
      "MessagingModal.tsx",
      "useLiveEnrollments.ts",
      "useMessagingDraft.ts",
      "SuccessTrackingTab.tsx",
    ]) {
      expect(component(name).length, name).toBeGreaterThan(200);
    }
  });
});

describe("shell -> aggregator (the W1 / W3-logic modules are not dead)", () => {
  it("the shell mounts the table and the modal and drives the live load", () => {
    const view = component("SuccessTrackingView.tsx");
    expect(view).toMatch(/<SuccessTrackingTable\b/);
    expect(view).toMatch(/<MessagingModal\b/);
    expect(view).toMatch(/useLiveEnrollments\(/);
  });

  it("the load hook calls both owner-only read actions", () => {
    const hook = component("useLiveEnrollments.ts");
    expect(hook).toMatch(/listLiveCoursesAction\(/);
    expect(hook).toMatch(/loadCourseEnrollmentsAction\(/);
    expect(hook).toMatch(/combineCourseResults\(/);
  });

  it("the read action guards first, then runs buildLiveEnrollmentReaders -> aggregateEnrollments", () => {
    const action = codeOnly(read("src", "app", "actions", "live-messaging-enrollments.ts"));
    expect(action).toMatch(/aggregateEnrollments\(/);
    expect(action).toMatch(/buildLiveEnrollmentReaders\(/);
    const bodies = action.split(/^export async function /m).slice(1);
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      // The body opens right after the Promise<...> return type's closing ">".
      expect(body, body.slice(0, 40)).toMatch(/>\s*\{\s*await requireAppOwner\(\);/);
    }
  });

  it("the switcher is useInstitutionSelection narrowed to the live-connected subset", () => {
    const view = component("SuccessTrackingView.tsx");
    expect(view).toMatch(/useInstitutionSelection\(/);
    expect(view).toMatch(/filterConnectedInstitutions\(/);
    expect(view).toMatch(/resolveSwitcherSelection\(/);
    expect(view).toMatch(/checkInstitutionsAction\(/);
  });

  it("is cross-course: the shell never asks for a course selection first", () => {
    const view = component("SuccessTrackingView.tsx");
    expect(view).not.toMatch(/useCourses|selectedCourse|courseId\s*=/);
  });
});

describe("table -> L3 logic", () => {
  it("applies the composed view and the pager, over the six columns", () => {
    const table = component("SuccessTrackingTable.tsx");
    expect(table).toMatch(/applyTableView\(/);
    expect(table).toMatch(/paginate\(/);
    expect(table).toMatch(/showingLabel\(/);
    expect(table).toMatch(/TABLE_COLUMNS\.map\(/);
    expect(table).toMatch(/currentStatusFor\(/);
  });

  it("has no Institution column or header", () => {
    const table = component("SuccessTrackingTable.tsx");
    expect(table).not.toMatch(/<th[^>]*>\s*Institution/i);
    expect(table).not.toMatch(/row\.institution/);
  });

  it("the header 'Message (N) Selected Students' button opens the modal", () => {
    const table = component("SuccessTrackingTable.tsx");
    expect(table).toMatch(/onClick=\{onOpenMessaging\}/);
    expect(table).toMatch(/Message \(\$\{selectedKeys\.length\}\) Selected Students/);
    const view = component("SuccessTrackingView.tsx");
    expect(view).toMatch(/onOpenMessaging=\{\(\) => setModalFor\(institution\)\}/);
    expect(view).toMatch(/modalFor === institution/);
  });

  it("pages at the pager default of 200 via the persisted controls", () => {
    const table = component("SuccessTrackingTable.tsx");
    expect(table).toMatch(/DEFAULT_TABLE_CONTROLS/);
    expect(table).toMatch(/TABLE_VIEW_KEY/);
  });
});

describe("modal -> L6 substitution", () => {
  it("the Preview button runs renderForStudents over each student's own values", () => {
    const modal = component("MessagingModal.tsx");
    expect(modal).toMatch(/renderForStudents\(/);
    expect(modal).toMatch(/rowToTokenValues\(row\)/);
    expect(modal).toMatch(/onClick=\{runPreview\}/);
  });

  it("offers every template token in the Variables row", () => {
    const modal = component("MessagingModal.tsx");
    expect(modal).toMatch(/TEMPLATE_TOKENS\.map\(/);
    expect(modal).toMatch(/insertAtSelection\(/);
  });
});

describe("draft persistence is view-level", () => {
  it("the draft hook reads and writes the ta- key and is not keyed by institution", () => {
    const hook = component("useMessagingDraft.ts");
    expect(hook).toMatch(/MESSAGING_DRAFT_KEY/);
    expect(hook).toMatch(/localStorage\.setItem\(/);
    expect(hook).toMatch(/localStorage\.getItem\(/);
    expect(hook).not.toMatch(/institution/i);
  });

  it("the shell owns the draft and hands it to the modal; the modal never touches storage", () => {
    const view = component("SuccessTrackingView.tsx");
    expect(view).toMatch(/useMessagingDraft\(\)/);
    expect(view).toMatch(/draft=\{draft\}/);
    expect(component("MessagingModal.tsx")).not.toMatch(/localStorage/);
  });

  it("the selection is per-institution (read through selectionFor) and the draft is not", () => {
    const view = component("SuccessTrackingView.tsx");
    expect(view).toMatch(/selectionFor\(selection, institution\)/);
  });
});

describe("client bundle stays free of Canvas server code", () => {
  it("components import only TYPES from the aggregator and never the live readers", () => {
    for (const name of fs.readdirSync(COMPONENT_DIR)) {
      if (!/\.tsx?$/.test(name) || name.includes(".test.")) continue;
      const source = component(name);
      const imports = source.matchAll(/import\s+(type\s+)?[^;]*?from\s+"@\/lib\/live-messaging\/enrollment-aggregator"/g);
      for (const m of imports) {
        expect(m[1], `${name}: a runtime import of the aggregator would bundle Canvas server code`).toBeTruthy();
      }
      expect(source, name).not.toMatch(/enrollment-readers/);
      expect(source, name).not.toMatch(/@\/lib\/canvas/);
    }
  });
});

describe("the send path is confined to the W4 driver (LiveSend.wiring.test.ts owns the detailed pins)", () => {
  it("no component or read action references a Canvas conversation builder", () => {
    const forbidden = /createConversation|createCourseConversation|sendStudentConversation|sendLiveMessages|sendMessage|conversations/;
    for (const name of fs.readdirSync(COMPONENT_DIR)) {
      if (!/\.tsx?$/.test(name) || name.includes(".test.")) continue;
      expect(component(name), name).not.toMatch(forbidden);
    }
    expect(codeOnly(read("src", "app", "actions", "live-messaging-enrollments.ts"))).not.toMatch(forbidden);
  });

  it("the modal exposes Cancel, Preview and Send, and hands the send to the confirm panel", () => {
    const modal = component("MessagingModal.tsx");
    expect(modal).toMatch(/Cancel/);
    expect(modal).toMatch(/Preview/);
    expect(modal).toMatch(/>\s*Send\s*</);
    expect(modal).toMatch(/<SendPanel\b/);
  });
});

describe("placement: a top-level tab (orchestrator default, FORK A')", () => {
  it("is registered in the tab registry and rendered by page.tsx", () => {
    const sections = read("src", "app", "components", "tabs", "tab-sections.ts");
    expect(sections).toMatch(/"success-tracking"/);
    const page = codeOnly(read("src", "app", "page.tsx"));
    expect(page).toMatch(/activeTab === "success-tracking"/);
    expect(page).toMatch(/<SuccessTrackingTab\b/);
  });
});
