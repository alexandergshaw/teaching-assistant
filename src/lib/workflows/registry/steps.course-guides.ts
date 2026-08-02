// Client-side step catalog: the course-wide guide documents (Resources and
// Tutorials, Course Schedule, FAQ, Instructor Contact) - one new step, added
// ONCE to COURSE_REFRESH, reaching all three course-setup workflows
// (COURSE_REFRESH, COURSE_KICKOFF, NO_CODE_KICKOFF) since both kickoffs
// consume COURSE_REFRESH via include-workflow.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  listCourseHubAction,
  listCourseContentAction,
  createModuleAction,
  createPageAction,
  updatePageAction,
  createModuleItemAction,
  generateCourseFaqAction,
} from "@/app/actions";
import {
  type StepDefinition,
  type StepRunHelpers,
  type StepRunResult,
  isGeneratorSelected,
} from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import type { Course } from "@/lib/supabase/courses";
import { buildDocxFromPlainText, stampDocxAppProperties } from "@/lib/docx";
import { markdownLiteToHtml } from "@/lib/markdown-lite";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { resolveCourseKind } from "@/lib/course-kind";
import { renderCourseToolPlanSection, renderHelpfulFreeResourcesSection } from "@/lib/resource-links";
import { stripModelUrls } from "@/lib/urls";
import { renderCourseFacts } from "@/lib/course-facts";
import { hasProject } from "@/lib/course-project";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// The module every guide page is filed under. Chosen to match a naming
// convention this codebase already recognizes elsewhere as a non-week,
// front-matter module (module-value.ts's extractModuleNumber, source-
// alignment.ts's isFrontMatterModuleText) - so it reads consistently with an
// instructor-made "Course Information" module, and with "Start Here"
// (starter-materials' own module), rather than inventing a third convention.
const COURSE_INFO_MODULE_NAME = "Course Information";

/** One resolved week's schedule row, or the "To be announced" placeholder for
 * a week the schedule has no entry for - continuous 1..maxWeek, never
 * dropped (Q1-AC3). */
export interface ScheduleRow {
  week: number;
  topic: string;
  summary: string;
  assignment: string;
}

// Exported (along with buildCourseScheduleDocx/renderScheduleMarkdown below)
// so steps.course-guides.test.ts can verify the "no dates" and "continuous,
// never dropped" requirements directly, without mocking the whole step.
export function resolveContinuousWeeks(schedule: ScheduleWeekPlan[], totalWeeks: number | null): ScheduleRow[] {
  const byWeek = new Map<number, ScheduleWeekPlan>();
  for (const w of schedule) byWeek.set(w.week, w);
  const maxWeek = Math.max(totalWeeks ?? 0, ...schedule.map((w) => w.week), 0);

  const rows: ScheduleRow[] = [];
  for (let week = 1; week <= maxWeek; week++) {
    const entry = byWeek.get(week);
    const topic = entry?.topic?.trim() || "To be announced";
    const summary = entry?.summary?.trim() ?? "";
    const assignment = [entry?.assignmentTitle, entry?.testName]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join("; ");
    rows.push({ week, topic, summary, assignment });
  }
  return rows;
}

// Q1-AC3: a real docx TABLE, not bullets - and NO dates or deadlines of any
// kind anywhere in this document. Built directly against the docx library
// (not buildDocxFromPlainText, which has no table path) but stamped through
// the SAME stampDocxAppProperties every other generated .docx goes through.
export async function buildCourseScheduleDocx(
  courseLabel: string,
  rows: ScheduleRow[],
  author?: string
): Promise<ArrayBuffer> {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    HeadingLevel,
    BorderStyle,
    ShadingType,
  } = await import("docx");

  const FONT = "Calibri";
  const BODY = "1F2937";
  const NAVY = "1A2744";

  const hasAssignmentColumn = rows.some((r) => r.assignment.trim().length > 0);
  const headerLabels = ["Week", "Topic", "Summary", ...(hasAssignmentColumn ? ["Assignment"] : [])];

  const headerRow = new TableRow({
    tableHeader: true,
    children: headerLabels.map(
      (label) =>
        new TableCell({
          shading: { fill: NAVY, type: ShadingType.CLEAR, color: "auto" },
          children: [
            new Paragraph({
              children: [new TextRun({ text: label, font: FONT, color: "FFFFFF", bold: true, size: 20 })],
            }),
          ],
        })
    ),
  });

  const bodyRows = rows.map((row) => {
    const values = [String(row.week), row.topic, row.summary, ...(hasAssignmentColumn ? [row.assignment] : [])];
    return new TableRow({
      children: values.map(
        (value) =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: value, font: FONT, color: BODY, size: 20 })] })],
          })
      ),
    });
  });

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });

  const doc = new Document({
    creator: author ?? "",
    lastModifiedBy: author ?? "",
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22, color: BODY },
          paragraph: { spacing: { after: 140, line: 276 } },
        },
        title: {
          run: { font: FONT, color: NAVY, bold: true, size: 36 },
          paragraph: {
            spacing: { after: 200 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, space: 6, color: NAVY } },
          },
        },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun({ text: `${courseLabel} - Course Schedule` })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Weekly topics only - no dates or deadlines. See the LMS course or syllabus for due dates.",
                font: FONT,
                color: BODY,
                italics: true,
                size: 20,
              }),
            ],
            spacing: { after: 200 },
          }),
          table,
        ],
      },
    ],
  });

  return stampDocxAppProperties(await Packer.toArrayBuffer(doc));
}

// The LMS-page equivalent of the schedule table above: markdownLiteToHtml has
// no table support, so the page renders as one bullet per week instead - same
// content (still no dates), different shape from the docx.
export function renderScheduleMarkdown(courseLabel: string, rows: ScheduleRow[]): string {
  const lines = [
    `# ${courseLabel} - Course Schedule`,
    "",
    "Weekly topics only - no dates or deadlines. See the LMS course or syllabus for due dates.",
    "",
  ];
  for (const row of rows) {
    let line = `Week ${row.week}: ${row.topic}`;
    if (row.summary) line += ` - ${row.summary}`;
    if (row.assignment) line += ` (Assignment: ${row.assignment})`;
    lines.push(`- ${line}`);
  }
  return lines.join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Q4: the Instructor Contact document's content, built in two forms - a
 * markdown-ish `body` (for the .docx via buildDocxFromPlainText, and stored
 * as the file's own `pageText`) and a hand-built `html` (for the LMS page,
 * carrying a REAL `mailto:` anchor). markdownLiteToHtml escapes everything
 * and has no link syntax at all, so the mailto link could not survive a
 * round trip through it - this is the one guide document whose LMS page is
 * NOT `markdownLiteToHtml(pageText)` as a result (see postGuidesToLms's
 * `pageHtml` override).
 *
 * Invents no policy (Q4-AC5): no response-time commitment, no office hours,
 * no preferred-contact-method claim - the syllabus is pointed to instead.
 * The email is written out in full in the docx and is the sole link on the
 * page (Q4-AC7) - both come from `email` (the tile's own `Course.email`
 * column), never invented.
 */
function buildInstructorContactContent(
  courseLabel: string,
  instructorName: string,
  email: string
): { body: string; html: string } {
  const who = instructorName.trim();
  const contactLine = who
    ? `Contact ${who} at ${email} with questions about this course.`
    : `Contact your instructor at ${email} with questions about this course.`;

  const meetingIntro = "To schedule a meeting, send an email that includes:";
  const meetingItems = [
    "The course name and section",
    "What you would like to discuss",
    "Two or three times that work for you",
  ];
  const syllabusLine = "For office hours and other contact details, see the syllabus.";

  const body = [
    `# ${courseLabel} - Instructor Contact`,
    "",
    contactLine,
    "",
    "## Setting Up a Meeting",
    meetingIntro,
    ...meetingItems.map((item) => `- ${item}`),
    "",
    syllabusLine,
  ].join("\n");

  const contactHtml = who
    ? `<p>Contact ${escapeHtml(who)} at <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a> with questions about this course.</p>`
    : `<p>Contact your instructor at <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a> with questions about this course.</p>`;

  const html = [
    contactHtml,
    "<h2>Setting Up a Meeting</h2>",
    `<p>${escapeHtml(meetingIntro)}</p>`,
    `<ul>${meetingItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
    `<p>${escapeHtml(syllabusLine)}</p>`,
  ].join("");

  return { body, html };
}

interface GuideDoc {
  label: string;
  file: GeneratedCourseFile;
  /** Q4: a pre-built LMS page body, used VERBATIM instead of
   * markdownLiteToHtml(file.pageText) - see buildInstructorContactContent's
   * own doc comment for why the Instructor Contact page needs this. */
  pageHtml?: string;
}

// Q1-AC6: the step publishes its own LMS pages, deliberately NOT via
// lms-populate (which clamps weekNumber to at least 1 and would land a
// course-wide document in Module 01, steps.lms-modules.ts). Re-run safe: an
// existing "Course Information" module is reused (never duplicated), and an
// existing page with the same title is UPDATED rather than duplicated -
// createPageAction/createPage does NOT dedupe by title on its own (verified:
// it always POSTs a new page), so that check has to happen here.
async function postGuidesToLms(
  tile: Course,
  docs: GuideDoc[],
  helpers: StepRunHelpers
): Promise<string[]> {
  const courseUrl = (tile.canvasUrl ?? "").trim();
  if (!courseUrl) {
    return docs.map((d) => `${d.label}: not posted - no LMS course on the tile.`);
  }

  const acronym = tile.institution || helpers.activeInstitution || undefined;

  try {
    const content = await listCourseContentAction(courseUrl, acronym);
    if ("error" in content) throw new Error(content.error);

    const existingModule = content.modules.find(
      (m) => m.name.trim().toLowerCase() === COURSE_INFO_MODULE_NAME.toLowerCase()
    );

    let moduleId: number;
    if (existingModule) {
      moduleId = existingModule.id;
    } else {
      const created = await createModuleAction(courseUrl, COURSE_INFO_MODULE_NAME, 1, acronym);
      if ("error" in created) throw new Error(created.error);
      moduleId = created.module.id;
    }

    const alreadyLinkedPageUrls = new Set(
      (existingModule?.items ?? [])
        .filter((item) => item.type === "Page" && item.pageUrl)
        .map((item) => item.pageUrl as string)
    );
    const existingPages = content.pages;

    const notes: string[] = [];
    for (const doc of docs) {
      const title = doc.file.name.replace(/\.[^.]+$/, "");
      try {
        const body = doc.pageHtml ?? markdownLiteToHtml(doc.file.pageText ?? "");
        const existingPage = existingPages.find(
          (p) => p.title.trim().toLowerCase() === title.trim().toLowerCase()
        );

        let pageUrl: string;
        let verb: string;
        if (existingPage) {
          const updated = await updatePageAction(
            courseUrl,
            existingPage.url,
            { title, body, published: true },
            acronym
          );
          if ("error" in updated) throw new Error(updated.error);
          pageUrl = updated.page.url;
          verb = "updated";
        } else {
          const createdPage = await createPageAction(courseUrl, { title, body, published: true }, acronym);
          if ("error" in createdPage) throw new Error(createdPage.error);
          pageUrl = createdPage.page.url;
          verb = "created";
        }

        if (!alreadyLinkedPageUrls.has(pageUrl)) {
          const linked = await createModuleItemAction(courseUrl, moduleId, { type: "Page", pageUrl }, acronym);
          if ("error" in linked) throw new Error(linked.error);
        }

        notes.push(`${doc.label}: page ${verb}.`);
      } catch (err) {
        notes.push(`${doc.label}: LMS error - ${err instanceof Error ? err.message : "unknown error"}.`);
      }
    }
    return notes;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return docs.map((d) => `${d.label}: not posted - ${msg}.`);
  }
}

export const courseGuideSteps: StepDefinition[] = [
  {
    type: "generate-course-guides",
    name: "Generate course guide documents",
    description:
      "Build four course-wide student guides - Resources and Tutorials, Course Schedule (topics only, no dates), FAQ, and Instructor Contact - as Word documents in the terminal zip, and as LMS pages in a Course Information module when the tile has an LMS course.",
    inputs: [
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: true },
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: false,
        help: "Rendered directly into the Course Schedule document - not LLM-generated.",
      },
      {
        key: "courseKind",
        label: "Course type",
        type: "text",
        required: false,
        options: ["coding", "applied"],
        help: "\"applied\" is a no-code course; grounds the FAQ and the Helpful Free Resources section.",
      },
      {
        key: "context",
        label: "Additional context (optional)",
        type: "longtext",
        required: false,
        help: "Optional instructor context folded into the FAQ.",
      },
      {
        key: "instructor",
        label: "Instructor name",
        type: "text",
        required: false,
        help: "Appears on the Instructor Contact document. Blank omits it.",
      },
      {
        key: "postToLms",
        label: "Post guide pages to the LMS",
        type: "boolean",
        required: false,
        help: "On by default. Creates/updates a page per guide in a \"Course Information\" module.",
      },
      {
        key: "files",
        label: "Course files so far",
        type: "files",
        required: false,
        help: "Files generated earlier in the run. The guides are appended to them, so later steps (blackboard-export, save-zip-to-course) ship them too.",
      },
      {
        key: "selected",
        label: "Generate this run",
        type: "boolean",
        required: false,
        help: "From COURSE_BUILD's output selection (steps.course-build-scope.ts). Blank/unbound = generate (unchanged default) - every OTHER preset that uses this step leaves it unbound.",
      },
    ],
    outputs: [
      { key: "files", label: "Course files", type: "files" },
      { key: "guideFiles", label: "Guide documents", type: "files" },
    ],
    run: async (values, helpers, onProgress) => {
      // RCA19 (RCA round 4): server-runner.ts cascades ANY step's thrown
      // failure to every dependent bound to its output (`failedSteps` -
      // see server-runner.ts) - `save-zip-to-course` and `blackboard-export`
      // both depend, transitively, on this step's `files` output, so a bare
      // throw here ("Course tile not found") used to cost the instructor the
      // ENTIRE terminal zip, not just these four guide documents. A missing
      // hubCourse, a listCourseHubAction error, or a tile that no longer
      // matches any id are all recoverable conditions - degrade to "no
      // guides this run", pass the incoming `files` through UNCHANGED, and
      // say why in the summary; reserve throwing for genuinely
      // unrecoverable input (there is none left in this step - every other
      // failure path below already degrades: a missing schedule defaults to
      // [], an FAQ/LLM failure is skipped with a note, and postGuidesToLms
      // catches its own LMS errors per document).
      const incoming = (values.files as GeneratedCourseFile[] | undefined) ?? [];
      const noGuidesGenerated = (reason: string): StepRunResult => ({
        outputs: { files: incoming, guideFiles: [] },
        summary: { kind: "list", label: "Generated 0 of 4 course guide document(s)", items: [reason] },
      });

      // AC1 (COURSE_BUILD's output selector): deselected means "do no work,
      // pass files through unchanged" - never a runIf gate (this step stays
      // in the chain either way, so blackboard-export/save-zip-to-course
      // downstream never skip). isGeneratorSelected treats an unbound value
      // as "generate" (registry-helpers.ts), matching every OTHER preset
      // that uses this step and never binds "selected" at all.
      if (!isGeneratorSelected(values.selected)) {
        return noGuidesGenerated("Skipped - guides were not selected in this run's output selection.");
      }

      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) return noGuidesGenerated("No course guides generated: choose a course tile.");

      const list = await listCourseHubAction();
      if ("error" in list) return noGuidesGenerated(`No course guides generated: ${list.error}`);
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) return noGuidesGenerated("No course guides generated: course tile not found.");

      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];
      const courseKind = resolveCourseKind(values.courseKind);
      const context = String(values.context ?? "").trim();
      // Default ON, matching includeInstructions's own "undefined means the
      // default" idiom (assembleLectureFiles, registry-helpers.ts) - posting
      // guide pages is a low-risk, course-wide convenience, unlike the
      // weekly announcements' opt-in-only default.
      const postToLms = values.postToLms === undefined ? true : String(values.postToLms) === "1";

      const courseLabel = tile.name?.trim() || tile.courseCode?.trim() || "Course";
      const committedToolNames = tile.courseProject?.tools ?? [];
      const docs: GuideDoc[] = [];
      const notes: string[] = [];

      // --- 1. Resources and Tutorials ---------------------------------
      onProgress("Building the Resources and Tutorials document...");
      // Y8-AC6 (tiered toolset): tell the student the PLAN, not just restate
      // the committed set - which CORE tool(s) hold their project data all
      // term, and which SPECIALIST tool(s) (if any) a specific week's own
      // generated materials actually introduced. Scanned from every file
      // generated so far this run (assignment instructions, objectives, and
      // openers all carry their source text as `pageText` - see
      // GeneratedCourseFile's own doc comment) rather than from `bodyText: ""`
      // as before, which made this section render empty every time.
      const allGeneratedText = incoming.map((f) => f.pageText ?? "").join("\n\n");
      const toolsSection = renderCourseToolPlanSection(committedToolNames, allGeneratedText);
      const scanText = [tile.description ?? "", schedule.map((w) => w.topic).join("\n")].join("\n");
      const resourcesSection = renderHelpfulFreeResourcesSection(scanText, 3, courseKind);
      const gettingHelpSection =
        "## Getting Help\nIf you have questions about the course material, an assignment, or anything else, reach out to your instructor directly - contact details and office hours are on the syllabus. Do not wait until something is due to ask for help; the earlier you reach out, the more useful the response can be.";

      const resourcesBodyParts = [`# ${courseLabel} - Resources and Tutorials`];
      if (toolsSection) resourcesBodyParts.push(toolsSection);
      if (resourcesSection) resourcesBodyParts.push(resourcesSection);
      resourcesBodyParts.push(gettingHelpSection);
      const resourcesBody = resourcesBodyParts.join("\n\n");

      const resourcesDocxBuffer = await buildDocxFromPlainText(resourcesBody, [], helpers.author);
      docs.push({
        label: "Resources and Tutorials",
        file: {
          name: buildWorkflowFileName({ course: tile, artifact: "Resources and Tutorials", ext: "docx" }),
          blob: new Blob([resourcesDocxBuffer], { type: DOCX_MIME }),
          mimeType: DOCX_MIME,
          weekNumber: 0,
          sortOrder: 1,
          role: "supplement",
          pageText: resourcesBody,
        },
      });

      // --- 2. Course Schedule (table, no dates) -----------------------
      onProgress("Building the Course Schedule document...");
      const rows = resolveContinuousWeeks(schedule, tile.weeks ?? null);
      const scheduleDocxBuffer = await buildCourseScheduleDocx(courseLabel, rows, helpers.author);
      const scheduleBody = renderScheduleMarkdown(courseLabel, rows);
      docs.push({
        label: "Course Schedule",
        file: {
          name: buildWorkflowFileName({ course: tile, artifact: "Course Schedule", ext: "docx" }),
          blob: new Blob([scheduleDocxBuffer], { type: DOCX_MIME }),
          mimeType: DOCX_MIME,
          weekNumber: 0,
          sortOrder: 2,
          role: "supplement",
          pageText: scheduleBody,
        },
      });

      // --- 3. FAQ (LLM-generated, grounded, no model URLs) ------------
      onProgress("Generating the FAQ...");
      const courseFacts = renderCourseFacts(tile);
      const weeklyTopics = schedule.map((w) => `Week ${w.week}: ${w.topic}`.trim()).filter(Boolean).join("\n");
      const projectBrief = hasProject(tile.courseProject) ? tile.courseProject.brief : "";
      const faqInputFacts = context ? `${courseFacts}\n\nInstructor context: ${context}` : courseFacts;

      const faqResult = await generateCourseFaqAction(
        faqInputFacts,
        weeklyTopics,
        projectBrief,
        committedToolNames,
        helpers.provider,
        courseKind
      );

      if ("error" in faqResult) {
        notes.push(`FAQ: skipped - ${faqResult.error}`);
      } else {
        const pairs = faqResult.pairs
          .map((p) => ({ question: stripModelUrls(p.question).trim(), answer: stripModelUrls(p.answer).trim() }))
          .filter((p) => p.question && p.answer);

        if (pairs.length === 0) {
          notes.push("FAQ: skipped - no usable question/answer pairs after cleanup.");
        } else {
          const faqLines = [`# ${courseLabel} - FAQ`];
          for (const pair of pairs) {
            faqLines.push("");
            faqLines.push(`## ${pair.question}`);
            faqLines.push(pair.answer);
          }
          const faqBody = faqLines.join("\n");
          const faqDocxBuffer = await buildDocxFromPlainText(faqBody, [], helpers.author);
          docs.push({
            label: "FAQ",
            file: {
              name: buildWorkflowFileName({ course: tile, artifact: "FAQ", ext: "docx" }),
              blob: new Blob([faqDocxBuffer], { type: DOCX_MIME }),
              mimeType: DOCX_MIME,
              weekNumber: 0,
              sortOrder: 3,
              role: "supplement",
              pageText: faqBody,
            },
          });
        }
      }

      // --- 4. Instructor Contact (Q4: no email, no document) ----------
      const email = (tile.email ?? "").trim();
      if (!email) {
        // Q4-AC3: a student-facing contact page with no contact is worse
        // than no page - never ship a placeholder or an empty address.
        // Pushed FIRST so it is the most prominent line in the summary.
        notes.unshift("No instructor contact page - the course tile has no email set.");
      } else {
        onProgress("Building the Instructor Contact document...");
        const instructorName = String(values.instructor ?? "").trim();
        const { body: contactBody, html: contactHtml } = buildInstructorContactContent(
          courseLabel,
          instructorName,
          email
        );
        const contactDocxBuffer = await buildDocxFromPlainText(contactBody, [], helpers.author);
        docs.push({
          label: "Instructor Contact",
          file: {
            name: buildWorkflowFileName({ course: tile, artifact: "Instructor Contact", ext: "docx" }),
            blob: new Blob([contactDocxBuffer], { type: DOCX_MIME }),
            mimeType: DOCX_MIME,
            weekNumber: 0,
            sortOrder: 4,
            role: "supplement",
            pageText: contactBody,
          },
          pageHtml: contactHtml,
        });
      }

      // --- Post to the LMS (or explain why not) -----------------------
      let postNotes: string[];
      if (postToLms) {
        onProgress("Posting guide pages to the LMS...");
        postNotes = await postGuidesToLms(tile, docs, helpers);
      } else {
        postNotes = docs.map((d) => `${d.label}: not posted - posting is turned off.`);
      }

      const guideFiles = docs.map((d) => d.file);
      // `notes` (skip explanations - FAQ generation failure, Q4-AC3's "no
      // email" case) leads the list so they cannot be missed scrolling past
      // a long "generated" list - Q4-AC3 requires the no-email case to be
      // reported PROMINENTLY.
      const summaryItems = [...notes, ...docs.map((d) => `${d.label}.docx: generated.`), ...postNotes];

      return {
        outputs: { files: [...incoming, ...guideFiles], guideFiles },
        summary: {
          kind: "list",
          label: `Generated ${guideFiles.length} of 4 course guide document(s)`,
          items: summaryItems,
        },
      };
    },
  },
];
