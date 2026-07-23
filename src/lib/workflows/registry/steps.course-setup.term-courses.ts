// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  listCoursesByTermAction,
  listCourseHubAction,
  createCourseHubAction,
  listConfiguredInstitutionsAction,
} from "@/app/actions";
import {
  type TermCoursePreviewRow,
  type StepRunResult,
  type StepDefinition,
} from "@/lib/workflows/registry-helpers";
import { parseCanvasCourseId } from "@/lib/canvas-url";

export const courseSetupTermCoursesSteps: StepDefinition[] = [
  {
    type: "fetch-term-courses",
    name: "Fetch term courses (preview)",
    description:
      "List every LMS course in the given term, optionally enriched by uploaded exports, and pause for review before any cards are created.",
    inputs: [
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: true,
      },
      {
        key: "term",
        label: "Term",
        type: "text",
        required: true,
        help: "Matched against the LMS term name, e.g. Fall 2026.",
      },
      {
        key: "exports",
        label: "LMS exports",
        type: "uploads",
        required: false,
        help: "Optional .imscc/zip exports; parsed for extra tile details.",
      },
    ],
    outputs: [{ key: "courses", label: "Course list", type: "courseList" }, { key: "hasCourses", label: "Has courses", type: "boolean" }],
    run: async (values, helpers, onProgress) => {
      const institution = String(values.institution ?? "").trim() || (helpers.activeInstitution ?? "").trim();
      const term = String(values.term ?? "").trim();

      onProgress("Fetching the term's courses...");
      const r = await listCoursesByTermAction(institution, term);
      if ("error" in r) {
        throw new Error(r.error);
      }
      const rows = r.courses;

      // The uploads value type resolves to a runtime File[] (never a
      // persisted string); an unbound input stays undefined and skips the
      // parsing pass entirely.
      const exportFiles = Array.isArray(values.exports)
        ? (values.exports as File[])
        : [];

      const warnings: string[] = [];
      const noteByLmsId = new Map<string, string>();
      const extraRows: Array<{
        id: string;
        name: string;
        courseCode: string | null;
        termName: string | null;
      }> = [];

      // Manifest titles were XML-escaped on export; undo the entities the
      // cartridge writer emits before matching against LMS names.
      const decodeEntities = (s: string): string =>
        s
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&");

      for (const file of exportFiles) {
        try {
          onProgress(`Reading ${file.name}...`);
          const { default: JSZip } = await import("jszip");
          const zip = await JSZip.loadAsync(await file.arrayBuffer());
          const manifest = zip.file("imsmanifest.xml");
          if (!manifest) {
            warnings.push(`${file.name}: no imsmanifest.xml found - skipped`);
            continue;
          }

          const xml = await manifest.async("string");
          const m = xml.match(/<lomimscc:string>([^<]+)<\/lomimscc:string>/);
          const title = m ? decodeEntities(m[1]).trim() : "";
          if (!title) {
            warnings.push(`${file.name}: no course title in manifest - skipped`);
            continue;
          }

          // Loose containment match either direction so "CS 101" pairs with
          // "CS 101 - Intro to Programming" and vice versa.
          const lowered = title.toLowerCase();
          const matched = rows.find((row) => {
            const rowName = row.name.toLowerCase();
            return rowName.includes(lowered) || lowered.includes(rowName);
          });

          if (matched) {
            noteByLmsId.set(matched.id, "export attached");
          } else {
            extraRows.push({
              id: "",
              name: title,
              courseCode: null,
              termName: term,
            });
          }
        } catch (err) {
          // A bad export never fails the preview; it surfaces as a warning.
          warnings.push(
            `${file.name}: ${
              err instanceof Error ? err.message : "could not read the export"
            }`
          );
        }
      }

      const payload: TermCoursePreviewRow[] = [
        ...rows.map((row) => ({
          lmsId: row.id,
          name: row.name,
          courseCode: row.courseCode,
          termName: row.termName,
          canvasUrl: row.id ? `/courses/${row.id}` : "",
          note: noteByLmsId.get(row.id) ?? "",
        })),
        ...extraRows.map((row) => ({
          lmsId: row.id,
          name: row.name,
          courseCode: row.courseCode,
          termName: row.termName,
          canvasUrl: "",
          note: "from export only",
        })),
      ];

      return {
        outputs: { courses: payload, hasCourses: payload.length > 0 ? "1" : "" },
        summary: {
          kind: "list",
          label: `${payload.length} course(s) ready to import`,
          items: [
            ...payload.map(
              (c) =>
                `${c.name}${c.courseCode ? ` [${c.courseCode}]` : ""}${
                  c.termName ? ` - ${c.termName}` : ""
                }${c.note ? ` (${c.note})` : ""}`
            ),
            ...warnings,
          ],
        },
        requireConfirmation:
          "Create a course card for each of these? Existing cards with the same LMS course are skipped.",
      };
    },
  },

  {
    type: "create-course-cards",
    name: "Create course cards",
    description:
      "Create a course tile for each previewed course; tiles whose LMS course already has a card are skipped.",
    inputs: [
      {
        key: "courses",
        label: "Course list",
        type: "courseList",
        required: true,
      },
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: false,
        help: "Applied to rows that do not carry their own institution (the multi-institution scan sets one per row).",
      },
    ],
    outputs: [
      { key: "created", label: "Cards created", type: "number" },
      { key: "hasCreated", label: "Any created?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const rows = values.courses as TermCoursePreviewRow[];
      const boundInstitution = String(values.institution ?? "").trim() || (helpers.activeInstitution ?? "").trim();

      onProgress("Loading existing course cards...");
      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const dedupeSetsByInst = new Map<string, { ids: Set<string>; nameTerms: Set<string> }>();

      const lines: string[] = [];
      let created = 0;
      let skipped = 0;
      let failed = 0;

      for (const row of rows) {
        // Fail-forward: one bad row records its error and the loop moves on.
        try {
          const effectiveInst = (row.institution || boundInstitution).trim().toUpperCase();
          if (!effectiveInst) {
            lines.push(`${row.name}: no institution - skipped`);
            continue;
          }

          if (!dedupeSetsByInst.has(effectiveInst)) {
            const existing = hub.courses.filter((c) => (c.institution ?? "").trim().toUpperCase() === effectiveInst);
            dedupeSetsByInst.set(effectiveInst, {
              ids: new Set(
                existing
                  .map((c) => parseCanvasCourseId(c.canvasUrl ?? ""))
                  .filter((id): id is string => Boolean(id))
              ),
              nameTerms: new Set(
                existing.map((c) => `${(c.name ?? "").trim().toLowerCase()}||${(c.term ?? "").trim().toLowerCase()}`)
              ),
            });
          }

          const dedupe = dedupeSetsByInst.get(effectiveInst)!;
          const nameKey = `${(row.name ?? "").trim().toLowerCase()}||${(row.termName ?? "").trim().toLowerCase()}`;
          if (row.lmsId ? dedupe.ids.has(row.lmsId) : dedupe.nameTerms.has(nameKey)) {
            lines.push(`${row.name}: already exists`);
            skipped++;
            continue;
          }

          onProgress(`Creating "${row.name}"...`);
          const made = await createCourseHubAction({
            name: row.name,
            courseCode: row.courseCode,
            term: row.termName,
            canvasUrl: row.canvasUrl || null,
            institution: effectiveInst,
            lms: row.canvasUrl ? "canvas" : null,
            startDate: row.startAt ? row.startAt.slice(0, 10) : null,
          });

          if ("error" in made) {
            throw new Error(made.error);
          }

          if (row.lmsId) {
            dedupe.ids.add(row.lmsId);
          } else {
            dedupe.nameTerms.add(nameKey);
          }
          lines.push(`${row.name}: created`);
          created++;
        } catch (err) {
          lines.push(
            `${row.name}: ${err instanceof Error ? err.message : "failed"}`
          );
          failed++;
        }
      }

      return {
        outputs: {
          created: String(created),
          hasCreated: created > 0 ? "1" : "",
        },
        summary: {
          kind: "list",
          label: `${created} created, ${skipped} skipped${
            failed ? `, ${failed} failed` : ""
          }`,
          items: lines,
        },
      };
    },
  },

  {
    type: "scan-term-courses",
    name: "Scan term courses across institutions",
    description:
      "Fetch the term's courses from every configured institution's LMS and split them into NEW (no course tile yet) and ALREADY IMPORTED - the start-of-term diff. Optionally pauses so you can review before later steps create anything.",
    inputs: [
      {
        key: "institutions",
        label: "Institutions",
        type: "longtext",
        required: false,
        help: "One institution acronym per line. Blank scans every configured institution.",
      },
      {
        key: "term",
        label: "Term",
        type: "text",
        required: false,
        help: "Matched against the LMS term name (e.g. Fall 2026). Blank lists every course you teach.",
      },
      {
        key: "confirm",
        label: "Pause to review?",
        type: "boolean",
        required: false,
        help: "Pause after the scan so you can review the diff before later steps run.",
      },
    ],
    outputs: [
      { key: "newCourses", label: "New courses", type: "courseList" },
      { key: "coverage", label: "Coverage report", type: "longtext" },
      { key: "newCount", label: "New count", type: "number" },
      { key: "existingCount", label: "Already imported", type: "number" },
      { key: "hasNew", label: "Any new?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      let insts: string[] = [];
      const instInput = String(values.institutions ?? "").trim();
      if (instInput) {
        insts = instInput
          .split("\n")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
      } else {
        onProgress("Loading configured institutions...");
        const listResult = await listConfiguredInstitutionsAction();
        if ("error" in listResult) {
          throw new Error(listResult.error);
        }
        if (listResult.acronyms.length === 0) {
          throw new Error("No institutions are configured on the server.");
        }
        insts = listResult.acronyms.map((a) => a.toUpperCase());
      }

      onProgress("Loading course hub...");
      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const termInput = String(values.term ?? "").trim();
      const coverageLines: string[] = [];
      const newCoursesData: TermCoursePreviewRow[] = [];
      let totalNew = 0;
      let totalExisting = 0;

      for (const inst of insts) {
        try {
          onProgress(`Scanning ${inst} for courses...`);

          const coursesResult = await listCoursesByTermAction(inst, termInput);
          if ("error" in coursesResult) {
            coverageLines.push(`${inst}: ${coursesResult.error}`);
            continue;
          }

          const existingIds = new Set(
            hub.courses
              .filter((c) => (c.institution ?? "").trim().toUpperCase() === inst)
              .map((c) => parseCanvasCourseId(c.canvasUrl ?? ""))
              .filter((id): id is string => Boolean(id))
          );

          const existingNameTerms = new Set(
            hub.courses
              .filter((c) => (c.institution ?? "").trim().toUpperCase() === inst)
              .map((c) => `${(c.name ?? "").trim().toLowerCase()}||${(c.term ?? "").trim().toLowerCase()}`)
          );

          const newLines: string[] = [];
          const importedLines: string[] = [];
          let newCount = 0;
          let existingCount = 0;

          for (const row of coursesResult.courses) {
            const nameKey = `${(row.name ?? "").trim().toLowerCase()}||${(row.termName ?? "").trim().toLowerCase()}`;
            const isNew = row.id
              ? !existingIds.has(row.id)
              : !existingNameTerms.has(nameKey);

            if (isNew) {
              newCount++;
              const code = row.courseCode ? ` [${row.courseCode}]` : "";
              newLines.push(`  - NEW: ${row.name}${code}`);
              newCoursesData.push({
                lmsId: row.id ?? "",
                name: row.name,
                courseCode: row.courseCode,
                termName: row.termName,
                canvasUrl: row.id ? `/courses/${row.id}` : "",
                note: "",
                institution: inst,
                startAt: row.startAt ?? null,
              });
            } else {
              existingCount++;
              const tile = hub.courses.find(
                (c) =>
                  (c.institution ?? "").trim().toUpperCase() === inst &&
                  (row.id
                    ? parseCanvasCourseId(c.canvasUrl ?? "") === row.id
                    : `${(c.name ?? "").trim().toLowerCase()}||${(c.term ?? "").trim().toLowerCase()}` === nameKey)
              );
              const tileName = tile?.name ?? "unknown";
              importedLines.push(`  - imported: ${row.name} (tile ${tileName})`);
            }
          }

          totalNew += newCount;
          totalExisting += existingCount;

          coverageLines.push(`${inst}: ${coursesResult.courses.length} course(s) - ${newCount} new, ${existingCount} already imported`);
          coverageLines.push(...newLines, ...importedLines);
        } catch (err) {
          coverageLines.push(
            `${inst}: ${err instanceof Error ? err.message : "failed to scan"}`
          );
        }
      }

      const coverage = coverageLines.join("\n");
      const shouldConfirm = String(values.confirm ?? "") === "1";

      const result: StepRunResult = {
        outputs: {
          newCourses: JSON.stringify(newCoursesData),
          coverage,
          newCount: String(totalNew),
          existingCount: String(totalExisting),
          hasNew: totalNew > 0 ? "1" : "",
        },
        summary: {
          kind: "list",
          label: `${totalNew} new course(s), ${totalExisting} already imported`,
          items: coverageLines,
        },
      };

      if (shouldConfirm) {
        result.requireConfirmation =
          "Continue to create cards for the NEW courses? Already-imported courses are left untouched.";
      }

      return result;
    },
  },
];
