// Client-side step catalog: rubric/module-material-pulling steps, split out
// of steps.rubrics.ts (that file was over the 1000-line cap - see
// docs/REGRESSION.md's line-count discipline). "Pull from fallback sources"
// and "Pull current module materials" share no state with the other rubric
// steps beyond the helpers already exported from registry-helpers.ts.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  listCourseContentAction,
  listCourseHubAction,
  ingestRepoAction,
  fetchCanvasMetaAction,
} from "@/app/actions";
import {
  type StepDefinition,
  classifyRubricSource,
  resolveModulesAhead,
  resolveTileCurrentWeek,
  loadTileWeekTopic,
  gatherModuleMaterials,
} from "@/lib/workflows/registry-helpers";
import { courseProgressStatus } from "@/lib/week-numbering";
import { liveModuleValue, findModuleByNumber, extractModuleNumber } from "@/lib/workflows/module-value";

export const rubricMaterialSteps: StepDefinition[] = [
  {
    type: "pull-fallback-sources",
    name: "Pull from fallback sources",
    description:
      "Pull a priority-ordered list of sources (LMS links and/or GitHub repos) one after another, with a mode that controls how far it goes.",
    inputs: [
      {
        key: "sources",
        label: "Sources (one per line, in priority order)",
        type: "longtext",
        required: true,
        help: "One source per line, highest priority first: a Canvas URL (assignment/discussion/course) or a GitHub repo (owner/name or a github.com URL).",
      },
      {
        key: "mode",
        label: "Mode",
        type: "text",
        required: false,
        help: "until-success (default): stop at the first source that returns content. all-sources: pull every source and combine. until-failure: pull in order and stop at the first source that fails or is empty.",
      },
    ],
    outputs: [
      { key: "material", label: "Pulled material", type: "longtext" },
      { key: "sourcesUsed", label: "Sources used", type: "text" },
      { key: "hasResult", label: "Got a result", type: "boolean" },
      { key: "count", label: "Sources pulled", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const lines = String(values.sources ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (lines.length === 0) throw new Error("Add at least one source.");

      const mode = String(values.mode ?? "").trim().toLowerCase() || "until-success";
      const validModes = ["until-success", "all-sources", "until-failure"];
      if (!validModes.includes(mode)) {
        throw new Error("Mode must be until-success, all-sources, or until-failure.");
      }

      // Per-source pull helper: classify, fetch, and return result.
      const pullSource = async (
        line: string
      ): Promise<{ ok: boolean; text: string; note: string; label: string }> => {
        const kind = classifyRubricSource(line);

        if (kind === "lms") {
          try {
            const r = await fetchCanvasMetaAction(line);
            if ("error" in r) {
              return { ok: false, text: "", note: `${line}: ${r.error}`, label: line };
            }
            const combined = [r.rubricText, r.description].filter(Boolean).join("\n\n");
            if (combined.trim()) {
              return { ok: true, text: combined, note: "", label: line };
            }
            return { ok: false, text: "", note: `${line}: resolved but empty`, label: line };
          } catch (err) {
            return {
              ok: false,
              text: "",
              note: `${line}: ${err instanceof Error ? err.message : String(err)}`,
              label: line,
            };
          }
        }

        if (kind === "repo") {
          try {
            const r = await ingestRepoAction(line);
            if ("error" in r) {
              return { ok: false, text: "", note: `${line}: ${r.error}`, label: line };
            }
            const combined = [r.digest.description, r.digest.text].filter(Boolean).join("\n\n");
            if (combined.trim()) {
              return { ok: true, text: combined, note: "", label: line };
            }
            return { ok: false, text: "", note: `${line}: resolved but empty`, label: line };
          } catch (err) {
            return {
              ok: false,
              text: "",
              note: `${line}: ${err instanceof Error ? err.message : String(err)}`,
              label: line,
            };
          }
        }

        // topic or skip: not a pullable source
        return {
          ok: false,
          text: "",
          note: `${line}: not a pullable source (use a Canvas URL or GitHub repo)`,
          label: line,
        };
      };

      const notes: string[] = [];
      const sources: { text: string; label: string }[] = [];
      let stoppedAt: string | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        onProgress(`Pulling source ${i + 1}/${lines.length}...`);
        const result = await pullSource(line);

        if (result.ok) {
          sources.push({ text: result.text, label: result.label });
          if (mode === "until-success") {
            // Stop at first success
            break;
          }
          // For all-sources and until-failure, continue
        } else {
          notes.push(result.note);
          if (mode === "until-failure") {
            // Stop at first failure
            stoppedAt = result.label;
            break;
          }
          // For until-success and all-sources, continue
        }
      }

      const material = sources.map((s) => s.text).join("\n\n---\n\n");
      const sourcesUsed = sources.map((s) => s.label).join(", ");
      const hasResult = material.trim() ? "1" : "";
      const count = sources.length;

      let modeDesc = mode;
      if (mode === "until-success") {
        modeDesc = "until-success";
      } else if (mode === "all-sources") {
        modeDesc = "all-sources";
      } else if (mode === "until-failure") {
        modeDesc = "until-failure";
      }

      const notesText =
        notes.length > 0 && stoppedAt
          ? `Stopped at ${stoppedAt}. Skipped/failed: ${notes.join("; ")}.`
          : notes.length > 0
            ? `Skipped/failed: ${notes.join("; ")}.`
            : "";

      return {
        outputs: { material, sourcesUsed, hasResult, count },
        summary: {
          kind: "text" as const,
          text: `${modeDesc}: pulled ${count} source(s). ${notesText}`.trim(),
        },
      };
    },
  },

  {
    type: "pull-current-materials",
    name: "Pull current module materials",
    description:
      "Pull the current week/module's materials for a course tile from its LMS course and/or GitHub repos. The current module is taken from the bound week (e.g. from Find the current week and module) or derived from the tile's start date and schedule; the LMS module is the one at the current week's position.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
        help: "The current week/module is derived from this tile (start date + schedule), and its LMS course is one source.",
      },
      {
        key: "week",
        label: "Current week (optional)",
        type: "number",
        required: false,
        help: "Bind from Find the current week and module, or leave blank to derive from the tile's start date.",
      },
      {
        key: "moduleRef",
        label: "Module (optional)",
        type: "lmsModule",
        required: false,
        help: "Bind from \"Find the current week and module\" -> Module to target that module by name instead of by position in the LMS module list.",
      },
      {
        key: "repos",
        label: "GitHub repos (one per line, optional)",
        type: "longtext",
        required: false,
        help: "Also pull the week's materials from these repos (owner/name or a github.com URL), one per line.",
      },
      {
        key: "modulesAhead",
        label: "Modules ahead",
        type: "moduleOffset",
        required: false,
        help: "How many modules past the current one to target. 0 or blank = the current module.",
      },
    ],
    outputs: [
      { key: "materials", label: "Materials", type: "longtext" },
      { key: "moduleName", label: "Module", type: "text" },
      { key: "week", label: "Week", type: "number" },
      { key: "sourcesUsed", label: "Sources used", type: "text" },
      { key: "hasMaterials", label: "Got materials", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      // Step 1: Load the hub course tile.
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) throw new Error("Choose a course tile.");

      onProgress("Reading the course...");
      const list = await listCourseHubAction();
      if ("error" in list) throw new Error(list.error);
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) throw new Error("Course tile not found.");

      // Step 2: Resolve the week.
      // Precedence: explicit week > modulesAhead > current
      const boundWeek = Number(values.week);
      let rawWeek: number;
      if (Number.isFinite(boundWeek) && boundWeek > 0) {
        rawWeek = boundWeek;
      } else {
        const weekResolution = await resolveTileCurrentWeek(tile, helpers);
        if ("skip" in weekResolution) {
          throw new Error(
            `"${tile.name}" has no start date set - add one on the course tile, or bind a week.`
          );
        }
        rawWeek = weekResolution.rawWeek;
        // Apply modulesAhead only if week is not bound
        const modulesAhead = resolveModulesAhead(values);
        rawWeek = rawWeek + modulesAhead;
      }
      const status = courseProgressStatus(rawWeek, tile.weeks);
      const displayWeek = tile.weeks && tile.weeks > 0 ? Math.min(rawWeek, tile.weeks) : rawWeek;

      // Topic from the course schedule CSV, when present.
      const wt = await loadTileWeekTopic(tile, displayWeek, helpers);
      const topic = "skip" in wt ? "" : wt.topic;
      let moduleName =
        status === "not-started"
          ? "Not started"
          : status === "complete"
            ? "Complete"
            : `Module ${String(displayWeek).padStart(2, "0")}${topic ? `: ${topic}` : ""}`;

      // Step 3: Collect materials into chunks.
      const MATERIALS_CAP = 20000;
      const chunks: string[] = [];
      const notes: string[] = [];
      const used: string[] = [];
      let total = 0;
      let truncated = false;

      const push = (text: string) => {
        if (!text) return;
        if (total >= MATERIALS_CAP) {
          truncated = true;
          return;
        }
        const slice = text.slice(0, MATERIALS_CAP - total);
        if (slice.length < text.length) truncated = true;
        chunks.push(slice);
        total += slice.length;
      };

      // Step 4: LMS pull (only if tile has a canvas URL and status is in-progress).
      const canvasUrlTrimmed = String(tile.canvasUrl ?? "").trim();
      if (
        canvasUrlTrimmed &&
        status !== "not-started" &&
        status !== "complete"
      ) {
        try {
          const moduleRefRaw = String(values.moduleRef ?? "").trim();
          let gathered: Awaited<ReturnType<typeof gatherModuleMaterials>> | null = null;

          if (moduleRefRaw) {
            // An explicit module reference is bound (e.g. from "Find the
            // current week and module" -> Module) - target it by NAME, with
            // no positional lookup at all. gatherModuleMaterials already
            // knows how to resolve a name-reference value (the byName branch
            // in registry-helpers.sources.ts); do not reimplement matching
            // here.
            onProgress("Reading the LMS course modules...");
            gathered = await gatherModuleMaterials(tile, moduleRefRaw, helpers, onProgress);
          } else {
            onProgress("Reading the LMS course modules...");
            const content = await listCourseContentAction(canvasUrlTrimmed, helpers.activeInstitution || undefined);
            if ("error" in content) {
              notes.push(`LMS: ${content.error}`);
            } else {
              const targetLabel = `Module ${String(displayWeek).padStart(2, "0")}`;
              // Search by NAME first - a leading "Start Here"/"Course
              // Information"/"Module 00" entry must never shift every later
              // week's lookup by one (the reported bug: week 7 read
              // content.modules[6], which was actually named "Module 06").
              // Position is only a last resort, and that fallback is never
              // silent.
              let mod: { id: string | number; name: string } | null = findModuleByNumber(
                content.modules,
                displayWeek
              );
              if (!mod) {
                const positional = content.modules[displayWeek - 1] ?? null;
                if (positional) {
                  notes.push(
                    `no LMS module name matched "${targetLabel}" - used the positional fallback and landed on the module at position ${displayWeek} in the LMS module list ("${positional.name}")`
                  );
                }
                mod = positional;
              }
              if (!mod) {
                notes.push(`no LMS module at week ${displayWeek}`);
              } else {
                gathered = await gatherModuleMaterials(
                  tile,
                  liveModuleValue(mod.id, mod.name),
                  helpers,
                  onProgress
                );
              }
            }
          }

          if (gathered) {
            const g = gathered;
            push(g.materialsText);
            if (g.notes && g.notes.length > 0) {
              notes.push(...g.notes);
            }
            if (g.moduleName) moduleName = g.moduleName;
            if (g.materialsText.trim()) {
              used.push(`LMS module "${g.moduleName}"`);
            }

            // The name and the content can never disagree silently again:
            // compare the gathered module's own number against the targeted
            // week - whichever path resolved it - and surface any mismatch
            // instead of failing forward quietly. A mismatch may be
            // legitimate in an oddly-numbered course, so this only notes it;
            // it never throws.
            const gotNumber = g.moduleName ? extractModuleNumber(g.moduleName) : null;
            if (gotNumber !== null && gotNumber !== displayWeek) {
              notes.push(
                `module name mismatch: targeted week ${displayWeek} but pulled a module named "${g.moduleName}"`
              );
            }
          }
        } catch (err) {
          notes.push(`LMS error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Step 5: Repo pull (for each non-empty line in repos).
      const repoLines = String(values.repos ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      for (let i = 0; i < repoLines.length; i++) {
        const line = repoLines[i];
        try {
          onProgress(`Reading repo ${i + 1}...`);
          const r = await ingestRepoAction(line);
          if ("error" in r) {
            notes.push(`repo ${line}: ${r.error}`);
            continue;
          }

          // Prefer week-matched files.
          const wk = displayWeek;
          const re = new RegExp(`(week|wk|module|unit)[^0-9]?0*${wk}(?![0-9])`, "i");
          const matched = r.digest.files.filter((f) => re.test(f.path));

          let repoPushed = false;
          if (matched.length > 0) {
            const matchedText = matched
              .map((f) => `# ${f.path}\n${f.content}`)
              .join("\n\n");
            push(matchedText);
            repoPushed = true;
          } else {
            const fallbackText = [r.digest.description, r.digest.text]
              .filter(Boolean)
              .join("\n\n");
            if (fallbackText.trim()) {
              push(fallbackText);
              repoPushed = true;
            }
          }

          if (repoPushed) {
            used.push(
              `repo ${line}${matched.length > 0 ? ` (week ${wk} files)` : ""}`
            );
          } else {
            notes.push(`repo ${line}: had no readable material`);
          }
        } catch (err) {
          notes.push(`repo ${line}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (truncated) {
        notes.push("materials truncated to ~20000 characters");
      }

      // Step 6: Build outputs.
      const materials = chunks.join("\n\n---\n\n");
      const hasMaterials = materials.trim() ? "1" : "";

      const summaryText = `${tile.name} - ${moduleName}: ${
        used.length > 0
          ? `pulled from ${used.join(", ")}`
          : "no materials found"
      }${
        notes.length > 0 ? ` (${notes.join("; ")})` : ""
      }.`;

      return {
        outputs: {
          materials,
          moduleName,
          week: displayWeek,
          sourcesUsed: used.join(", "),
          hasMaterials,
        },
        summary: { kind: "text" as const, text: summaryText },
      };
    },
  },
];
