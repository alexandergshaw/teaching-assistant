"use server";

// WHY this loop lives in ONE server action, not the registry step
// (docs/weekly-announcement-module-content-acceptance-criteria.md AC2 item 7,
// its "revision note"): Next.js serializes client-dispatched Server
// Functions - "The client currently dispatches and awaits them one at a
// time... If you need parallel data fetching... perform parallel work inside
// a single Server Function or Route Handler"
// (node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md:206).
// A registry step that called a per-week drafting action in a loop would
// therefore lose all concurrency in an attended run, and an unattended run -
// which has no per-step deadline check (server-runner.ts checks its deadline
// only BETWEEN fan-out groups) - could be killed mid-loop with nothing
// persisted, re-drafting the whole term on every tick without ever
// converging. Gathering and drafting therefore happen inside this one action,
// with its own time budget, so partial progress converges through the
// existing mapping table instead.

import { requireOwner } from "@/lib/supabase/auth";
import type { LlmProvider } from "@/lib/llm";
import { fetchModuleContentForWeeks } from "@/lib/canvas-modules/module-content";
import {
  buildWeeklyAnnouncementInstruction,
  type WeeklyAnnouncementDraft,
} from "@/lib/announcement-module-content";
import { packageModuleContentForWeeks } from "@/lib/announcement-package-content";
import { draftWeeklyAnnouncements } from "@/lib/announcement-drafting";
import { draftAnnouncementAction } from "./messaging";

// Separate from the 45s Canvas-writing budget in canvas-inbox.ts - this
// action's own budget covers gathering + drafting only, in its own
// invocation (AC2 item 11a).
const DEFAULT_DRAFTING_BUDGET_MS = 25_000;

/**
 * Gather each requested week's Canvas module content and draft an
 * announcement from it, in ONE call (AC2 item 7). Every requested week gets
 * back exactly one WeeklyAnnouncementDraft - never a thrown exception - so
 * the caller (scheduleWeeklyAnnouncementsAction) can resolve title/message
 * per week without special-casing a missing entry.
 */
export async function draftModuleAnnouncementsAction(
  courseUrl: string,
  weeks: number[],
  weekCount: number,
  acronym?: string,
  options?: { provider?: LlmProvider; courseName?: string; extraNotes?: string; budgetMs?: number }
): Promise<{ drafts: WeeklyAnnouncementDraft[] } | { error: string }> {
  try {
    await requireOwner();

    const content = await fetchModuleContentForWeeks(courseUrl, weeks, weekCount, acronym);

    const targets: Array<{ week: number; instruction: string }> = [];
    const drafts = new Map<number, WeeklyAnnouncementDraft>();

    for (const week of weeks) {
      const weekContent = content.get(week);
      if (!weekContent || !weekContent.moduleName || !weekContent.materials.trim()) {
        // AC1 item 1 (no module matched) and a matched module with nothing
        // readable in it both resolve the same way: fall back to the
        // template, never guess. DEFECT 4 fix: module-content.ts's `notes`
        // records the REAL reason a week came back empty (a stale token, an
        // unreachable Canvas, an unreadable page, a module whose items
        // failed) - append it when present so an instructor whose token
        // expired is told that, instead of being pointed at a module that
        // already has content in it (AC2 item 11 / AC7).
        const reason = weekContent?.notes.length ? ` (${weekContent.notes.join("; ")})` : "";
        drafts.set(week, {
          week,
          message: "",
          note: `no module content for week ${week} - used the message template${reason}`,
        });
        continue;
      }
      targets.push({
        week,
        instruction: buildWeeklyAnnouncementInstruction({
          week,
          moduleName: weekContent.moduleName,
          courseName: options?.courseName,
          materials: weekContent.materials,
          extraNotes: options?.extraNotes,
        }),
      });
    }

    const outcomes = await draftWeeklyAnnouncements(
      targets,
      (instruction) => draftAnnouncementAction(instruction, options?.provider),
      { budgetMs: options?.budgetMs ?? DEFAULT_DRAFTING_BUDGET_MS }
    );

    for (const target of targets) {
      const outcome = outcomes.get(target.week);
      const weekContent = content.get(target.week)!;

      if (!outcome) {
        // draftWeeklyAnnouncements returns exactly one outcome per target;
        // this is defensive only - fail forward to the template rather than
        // silently dropping the week.
        drafts.set(target.week, {
          week: target.week,
          message: "",
          note: "drafting failed (no outcome returned) - used the message template",
        });
        continue;
      }

      if ("deferred" in outcome) {
        drafts.set(target.week, {
          week: target.week,
          defer: true,
          note: "not drafted this run - stopped for the drafting time budget",
        });
        continue;
      }

      if ("error" in outcome) {
        // Covers both an ordinary drafting failure and a quota-skipped
        // draft (AC2 item 10) - either way, drafting never blocks
        // scheduling: fall back to the template with the real error.
        drafts.set(target.week, {
          week: target.week,
          message: "",
          note: `drafting failed (${outcome.error}) - used the message template`,
        });
        continue;
      }

      // A successful call can still carry an empty (or whitespace-only) body
      // - the model parsed but returned nothing. Reporting "drafted from
      // module X" here would claim the opposite of the truth once
      // scheduleWeeklyAnnouncementsAction falls back to the message template
      // for the actual post, so this is treated as a drafting failure, not a
      // success.
      if (!outcome.message.trim()) {
        drafts.set(target.week, {
          week: target.week,
          message: "",
          note: "drafting returned an empty announcement - used the message template",
        });
        continue;
      }

      const provenance = [`drafted from module "${weekContent.moduleName}"`];
      if (weekContent.matchedBy === "position") provenance.push("matched by position");
      if (weekContent.truncated) provenance.push("materials truncated");
      drafts.set(target.week, {
        week: target.week,
        title: outcome.title,
        message: outcome.message,
        note: provenance.join(", "),
      });
    }

    return { drafts: weeks.map((week) => drafts.get(week)!) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not draft the weekly announcements." };
  }
}

// Package-source twin of draftModuleAnnouncementsAction above
// (docs/weekly-announcement-package-io-acceptance-criteria.md AC1 items 7/8,
// AC6 item 39). Kept as its OWN action rather than a branch inside
// draftModuleAnnouncementsAction so that function - and the frozen-literal
// oracle AC2 item 12 pins against it - stays byte-for-byte unchanged. Mirrors
// its contract exactly: one call gathers AND drafts every requested week
// (the same Next.js one-Server-Function-at-a-time constraint cited at the top
// of this file applies here too - a per-week call would blow the 60s
// unattended cap just the same), the same DEFAULT_DRAFTING_BUDGET_MS budget,
// the same `weeks.map(w => drafts.get(w)!)` one-draft-per-requested-week-in-
// request-order guarantee, the same five emitted draft shapes, and the same
// never-throws + `{error}` fallback.
//
// The only difference from the live action is the content source:
// packageModuleContentForWeeks (src/lib/announcement-package-content.ts)
// resolves each week from an ALREADY-PARSED cartridge/export instead of a
// live Canvas fetch, so this action does no network I/O of its own beyond
// the LLM call itself. It also de-duplicates a repeated requested week
// before drafting (DEFECT 7 fix, below) - the live action does not, since
// that shape is inherited from it and is deliberately left alone there.
//
// `modules` is typed structurally, not as the imported CartridgeModule type:
// a "use server" file may export only async functions (see MEMORY.md's "No
// type re-export from use-server" entry - next build, not tsc, is what
// catches a violation), so no type from @/lib/cartridge-import is imported
// into this file at all. The inline shape below is exactly CartridgeModule's
// own shape, so TypeScript's structural typing accepts it wherever
// packageModuleContentForWeeks needs a CartridgeModule[] - and it is a plain
// serializable array of strings/arrays/optional-strings, safe to cross the
// server-action boundary from an attended browser upload.
export async function draftPackageAnnouncementsAction(
  modules: Array<{
    name: string;
    position: number;
    items: Array<{ title: string; type: string; body?: string }>;
  }>,
  weeks: number[],
  weekCount: number,
  options?: { provider?: LlmProvider; courseName?: string; extraNotes?: string; budgetMs?: number }
): Promise<{ drafts: WeeklyAnnouncementDraft[] } | { error: string }> {
  try {
    await requireOwner();

    // DEFECT 7 fix (package path ONLY - see the comment above
    // draftModuleAnnouncementsAction: the live sibling has the identical
    // positional shape, `weeks.map(w => drafts.get(w)!)`, and is
    // deliberately left unchanged, since this defect is inherited rather
    // than introduced by the package path). A requested week can repeat
    // (`weeks = [1, 1]`); drafting it twice would call the LLM twice for an
    // identical instruction and burn the drafting budget for no reason. Draft
    // each DISTINCT week at most once here, then fan the single draft back
    // out below so the returned array still has one entry per REQUESTED
    // week, in request order, duplicates included.
    const uniqueWeeks = Array.from(new Set(weeks));

    const content = packageModuleContentForWeeks(modules, uniqueWeeks, weekCount);

    const targets: Array<{ week: number; instruction: string }> = [];
    const drafts = new Map<number, WeeklyAnnouncementDraft>();

    for (const week of uniqueWeeks) {
      const weekContent = content.get(week);
      if (!weekContent || !weekContent.moduleName || !weekContent.materials.trim()) {
        // Same fallback wording as draftModuleAnnouncementsAction: a week
        // with no matching module (or a matched module with nothing
        // readable in it) never gets a guessed draft. weekContent.notes is
        // PROBLEMS ONLY (DEFECT 3 fix - see packageModuleContentForWeeks'
        // doc comment): empty for a matched-but-empty module, since nothing
        // actually went wrong there, and populated only for a genuine
        // no-match. Folding it in here means the report says WHY when there
        // is a real reason, and states only the fallback itself when there
        // is not - never a provenance phrase that would contradict "nothing
        // was drafted".
        const reason = weekContent?.notes.length ? ` (${weekContent.notes.join("; ")})` : "";
        drafts.set(week, {
          week,
          message: "",
          note: `no module content for week ${week} - used the message template${reason}`,
        });
        continue;
      }
      targets.push({
        week,
        instruction: buildWeeklyAnnouncementInstruction({
          week,
          moduleName: weekContent.moduleName,
          courseName: options?.courseName,
          materials: weekContent.materials,
          extraNotes: options?.extraNotes,
        }),
      });
    }

    const outcomes = await draftWeeklyAnnouncements(
      targets,
      (instruction) => draftAnnouncementAction(instruction, options?.provider),
      { budgetMs: options?.budgetMs ?? DEFAULT_DRAFTING_BUDGET_MS }
    );

    for (const target of targets) {
      const outcome = outcomes.get(target.week);
      const weekContent = content.get(target.week)!;

      if (!outcome) {
        // draftWeeklyAnnouncements returns exactly one outcome per target;
        // this is defensive only - fail forward to the template rather than
        // silently dropping the week.
        drafts.set(target.week, {
          week: target.week,
          message: "",
          note: "drafting failed (no outcome returned) - used the message template",
        });
        continue;
      }

      if ("deferred" in outcome) {
        drafts.set(target.week, {
          week: target.week,
          defer: true,
          note: "not drafted this run - stopped for the drafting time budget",
        });
        continue;
      }

      if ("error" in outcome) {
        // Covers both an ordinary drafting failure and a quota-skipped draft
        // - either way, drafting never blocks packaging: fall back to the
        // template with the real error.
        drafts.set(target.week, {
          week: target.week,
          message: "",
          note: `drafting failed (${outcome.error}) - used the message template`,
        });
        continue;
      }

      // A successful call can still carry an empty (or whitespace-only) body
      // - the model parsed but returned nothing. Reporting "drafted from
      // module X" here would claim the opposite of the truth once the
      // package build falls back to the message template for the actual
      // announcement, so this is treated as a drafting failure, not a
      // success.
      if (!outcome.message.trim()) {
        drafts.set(target.week, {
          week: target.week,
          message: "",
          note: "drafting returned an empty announcement - used the message template",
        });
        continue;
      }

      // DEFECT 4 fix: the AC1 item 8 literal ("drafted from the uploaded
      // package") now reaches the report on the SUCCESS branch, where it
      // belongs - previously it reached the report only via the FAILURE
      // branch above (through weekContent.notes, before the DEFECT 3 fix),
      // which was exactly inverted from the AC's intent. The matched
      // module's name is still named here too, so a successful week's note
      // stays informative and is distinguishable at a glance from a failed
      // week's note (which never contains this literal).
      const provenance = [`drafted from the uploaded package - module "${weekContent.moduleName}"`];
      if (weekContent.matchedBy === "position") provenance.push("matched by position");
      if (weekContent.truncated) provenance.push("materials truncated");
      drafts.set(target.week, {
        week: target.week,
        title: outcome.title,
        message: outcome.message,
        note: provenance.join(", "),
      });
    }

    // Fans each distinct week's single draft back out to one entry per
    // REQUESTED week, in request order, duplicates included (DEFECT 7 fix) -
    // `drafts` is keyed by week number, so a repeated week here simply reads
    // the same already-computed entry twice rather than recomputing it.
    return { drafts: weeks.map((week) => drafts.get(week)!) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not draft the weekly announcements." };
  }
}
