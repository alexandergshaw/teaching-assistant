// Client-side step catalog: the WEEKLY ANNOUNCEMENT SCHEDULING sibling step
// (docs/weekly-announcement-scheduling-acceptance-criteria.md). Pre-
// schedules a weekly announcement on a chosen weekday for every in-session
// week of a term, IN ONE RUN: each week's announcement is created
// immediately, carrying a future delayed_post_at so Canvas posts it on that
// weekday - this is NOT a recurring schedule that fires weekly (see the AC
// document's own "Mechanism" note).
//
// A DELIBERATE SIBLING of generate-weekly-announcements
// (steps.weekly-announcements.ts), not a replacement or an extension of it:
// that step REQUIRES generated module materials (it grounds each
// announcement in that week's actual objectives/deck/opener/assignment -
// docs/REGRESSION.md #157 AC6) and derives its release date from
// weekStartDate (the course start date's OWN weekday, never a chosen one).
// This step runs standalone against a bare course tile (no Course Build
// materials needed), and its whole reason to exist is a CHOSEN weekday
// (AC1) - so it cannot be built by extending the existing step, and the
// existing step's inputs/behavior/preset bindings are left completely
// UNCHANGED by this file (AC10).
//
// EXTENDED by docs/weekly-announcement-module-content-acceptance-criteria.md:
// each week's announcement is now DRAFTED from that week's Canvas module
// content by default (AC1/AC2), with the message input as the fallback
// (AC3). The mechanism above - one run, the whole term, up front - is
// unchanged; only what each week says changed.
//
// EXTENDED AGAIN by docs/weekly-announcement-package-io-acceptance-criteria.md:
// the term's content can now come from an uploaded course cartridge/export
// instead of a live Canvas course (the IN axis, `draftFrom === "cartridge"`),
// and the run's output can be an importable Common Cartridge and/or a plain
// zip of the drafted announcements instead of (or alongside) creating them in
// Canvas (the OUT axis, the new `deliver` input). Both axes are reached only
// by a NEW input value - `draftFrom === ""` or `"template"` with
// `deliver === ""` (both defaults) reproduces every byte of this file's
// pre-package-io behavior, all the way down to the exact
// scheduleWeeklyAnnouncementsAction call below. All the DECISION logic the
// package path needs (per-week title/message/postAt resolution, format
// selection, report assembly) lives in
// src/lib/workflows/announcement-package-run.ts, not here - this file adds
// only the input reading, the tile/cartridge lookups only IT can do, and the
// dispatch between the live path (unchanged) and the package path.
//
// Every Canvas call and every mapping-table read/write lives behind server
// actions (scheduleWeeklyAnnouncementsAction, planWeeklyAnnouncementsAction,
// draftModuleAnnouncementsAction - all @/app/actions; draftPackageAnnouncementsAction
// too, reached through steps.weekly-announcement-schedule.package-paths.ts
// below) - this file only plans, asks for ONE gather-and-draft call, and
// renders the report the scheduling action (or, on the package path,
// announcement-package-run.ts's orchestrator) returns. This file's only
// SERVER-ACTION import is the literal string "@/app/actions". The cartridge-
// parsing/package-building sub-operations (cartridge-import.ts,
// common-cartridge.ts, announcement-package-zip.ts, and
// announcement-package-run.ts - deliberately built to import NEITHER
// "@/app/actions" nor any server-only module, so it can be unit tested with
// injected fakes, see that file's own header comment) live in
// steps.weekly-announcement-schedule.package-paths.ts, split out only to
// keep this file under the repo-wide 1000-line ceiling (see that file's own
// header comment) - not to change what this file imports transitively. None
// of it pulls in @/lib/supabase/server, @/app/actions/shared, or
// next/headers, even transitively;
// steps.weekly-announcement-schedule.test.ts (modeled on
// course-schedule-docx.test.ts:40-48) reads this file's own source - and, as
// of the package-io feature, announcement-package-run.ts's source too - and
// asserts those three imports never appear in either.
//
// The per-week drafting loop deliberately does NOT live in this file. Next
// serializes client-dispatched Server Functions
// (node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md:206:
// "The client currently dispatches and awaits them one at a time..."), so a
// call per week issued from here would run strictly one at a time and blow
// the unattended 60-second cap. Drafting is therefore ONE call to
// draftModuleAnnouncementsAction (live source) or
// draftPackageAnnouncementsAction (uploaded-package source), each looping
// server-side with its own time budget.
import {
  listCourseHubAction,
  scheduleWeeklyAnnouncementsAction,
  planWeeklyAnnouncementsAction,
  draftModuleAnnouncementsAction,
} from "@/app/actions";
import { type StepDefinition } from "@/lib/workflows/registry-helpers";
import { resolveLmsFromTile, isCanvasLms, canvasOnlySkipText } from "@/lib/workflows/registry/lms-target-guard";
// WEEKDAY_OPTIONS/LABELS, the three report/plan/draft helper functions, and
// the WeekPlanEntry/WeeklyAnnouncementDraft structural types are pure and
// shared with package-paths.ts below - both moved out to
// steps.weekly-announcement-schedule.shared.ts (see its own header comment)
// only to keep this file under the repo-wide 1000-line ceiling. Imported
// here, never redefined, so the two files cannot drift apart.
import {
  WEEKDAY_OPTIONS,
  WEEKDAY_LABELS,
  postTimeInvalidWarning,
  prependWarningToReport,
  prependWarningToLines,
  type WeekPlanEntry,
  type WeeklyAnnouncementDraft,
} from "./steps.weekly-announcement-schedule.shared";
// buildPackageForLiveSource (the live-Canvas-tile package build) and
// runCartridgeSourcedPackage (the uploaded-cartridge/export package build)
// are each a complete, independently-dispatched sub-operation - moved to
// their own leaf for the same file-size reason (see that file's own header
// comment). This file dispatches to them; it does not reimplement them.
import {
  buildPackageForLiveSource,
  runCartridgeSourcedPackage,
} from "./steps.weekly-announcement-schedule.package-paths";

// The select's THREE values, per AC6 item 24a (module-content AC) and AC1
// item 1 (package-io AC). "" (blank) is the default and MUST be a member of
// `options`: RuntimeFieldInput.tsx:259-291 renders a "text" input carrying
// `options` as a MUI select whose MenuItems are exactly `field.options` - an
// options array that omitted the stored default would render an empty
// control with an out-of-range warning. "cartridge" is APPENDED, never
// inserted - a stored binding's saved value is the literal string, and
// reordering would silently repoint every saved/scheduled run of this step.
const DRAFT_FROM_OPTIONS = ["", "template", "cartridge"];
const DRAFT_FROM_LABELS: Record<string, string> = {
  "": "Canvas module content (recommended)",
  template: "The message below, for every week",
  cartridge: "An uploaded course cartridge or export",
};

// AC2 item 11 (package-io AC). Blank is the default and reproduces today's
// behavior exactly - same "options must include the stored default" rule as
// DRAFT_FROM_OPTIONS above.
const DELIVER_OPTIONS = ["", "package", "both"];
const DELIVER_LABELS: Record<string, string> = {
  "": "Schedule them in the LMS",
  package: "Build an importable package only (no LMS changes)",
  both: "Schedule them in the LMS and build the package",
};

// AC4 item 24. Blank defers to each student's own notification settings -
// the only truthful default, since Canvas has no per-announcement email
// setting at all (see the `emailCopy` input's own `help` text below, and
// resolveAnnouncementEmailCopy's header comment in announcement-schedule.ts
// for the full API trace).
const EMAIL_COPY_OPTIONS = ["", "1", "0"];
const EMAIL_COPY_LABELS: Record<string, string> = {
  "": "Use each student's own notification settings",
  "1": "Email a copy to students",
  "0": "Do not email a copy",
};

// AC3 item 16. Blank means BOTH formats, following output-selection.ts's
// parseOutputSelection convention (resolvePackageFormats,
// announcement-package-run.ts, mirrors it exactly).
const PACKAGE_FORMAT_OPTIONS = ["imscc", "zip"];
const PACKAGE_FORMAT_LABELS: Record<string, string> = {
  imscc: "Course import package (.imscc)",
  zip: "Plain zip of the announcement documents",
};

export const weeklyAnnouncementScheduleSteps: StepDefinition[] = [
  {
    type: "schedule-weekly-announcements-for-term",
    name: "Schedule weekly announcements for the term",
    description:
      "Pre-schedule one announcement per in-session week (weeks 1..N, from the course tile's start date and week count) on a chosen weekday, for the WHOLE TERM in one run. By default each week's announcement is drafted from that week's Canvas module content; the message below is used as a fallback whenever a week has no module content or its draft fails, or as every week's text when \"Draft from\" is set to the message instead. Each week's announcement is created immediately in Canvas with a future release date, so nothing appears to students until its own week - this is not a recurring schedule that fires weekly. Safe to re-run: already-scheduled weeks are left alone and reported as such, and a start-date edit reschedules existing weeks instead of duplicating the term. Break weeks are NOT excluded - every in-session week is scheduled regardless of breaks. The term's content can also come from an uploaded course cartridge/export instead of a live Canvas course, and the run's output can be an importable package and/or a plain zip of the announcements instead of (or alongside) scheduling them in Canvas - see \"Draft from\" and \"Deliver\" below.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        // Unconditionally required before the package-io feature (AC1 item
        // 9, docs/weekly-announcement-package-io-acceptance-criteria.md) -
        // optional there, since an uploaded-package source needs a tile only
        // to name the output. `requiredWhen` (types.ts:~237) was EQUALS-ONLY
        // at the time (REGRESSION.md entry 239 check 1) - it could express
        // "required exactly when draftFrom is 'template'", but not "required
        // unless draftFrom is 'cartridge'" - so reproducing the pre-existing
        // Run-button block for the live paths would also have blocked it for
        // "cartridge", the opposite of AC1 item 9. This field was downgraded
        // to a plain, ungated `required: false` to work around that, which
        // was itself the regression the fix below closes: the Run button no
        // longer blocked on a missing tile on the (overwhelmingly common)
        // live paths, and the SAME "Choose a course tile." throw the input
        // spec used to enforce ran only from the step, mid-run, instead -
        // strictly worse than a pre-submit block (entry 239 check 8). The
        // fix was to widen `requiredWhen` itself with a `notEquals` arm
        // (types.ts) rather than accept the downgrade: this field is
        // required unless "Draft from" is explicitly the uploaded-package
        // option, matching its original unconditional `required: true` on
        // every other value including a blank, untouched form - see
        // notEqualsGateSatisfied's comment (workflow-field-visibility.ts)
        // for why a blank controller satisfies `notEquals` (the opposite of
        // the `equals` arm's rule) and why that is exactly the behavior this
        // field needs.
        required: false,
        requiredWhen: { fieldKey: "draftFrom", notEquals: "cartridge" },
        help: 'Its start date and week count set the term; its LMS course is where announcements are scheduled. Optional only when "Draft from" is set to an uploaded package, where it is used just to name the output and to supply a course title when the package has none.',
      },
      {
        key: "weekday",
        label: "Post on",
        type: "text",
        required: true,
        options: WEEKDAY_OPTIONS,
        optionLabels: WEEKDAY_LABELS,
        help: "Every week's announcement is scheduled for this weekday, independent of the course start date's own weekday.",
      },
      {
        key: "postTime",
        label: "Post time (optional)",
        // T1 (docs/announcement-post-time-acceptance-criteria.md): a native
        // time picker, not free text - the emitted value is unambiguous
        // "HH:MM" by construction, so this step no longer needs to teach a
        // format the widget itself now enforces (see the help text below).
        type: "time",
        required: false,
        help: "Leave blank to post at 8:00 AM.",
      },
      {
        key: "draftFrom",
        label: "Draft from",
        type: "text",
        required: false,
        options: DRAFT_FROM_OPTIONS,
        optionLabels: DRAFT_FROM_LABELS,
        // DEFECT 5 fix: a File item contributes only its header line (its
        // name), never a download or preview of its body - a deliberate
        // design decision (entry 238 check 10) - so this text must not
        // promise "File content" alongside the item types that really are
        // read in full.
        help: 'Leave as "Canvas module content" to have each week\'s announcement drafted from that week\'s Page/Assignment/Quiz/Discussion content (files are named, not read). Choose the message option to post the message below unchanged for every week instead. Choose the uploaded package option to draft from an .imscc or course-export .zip instead of a live Canvas course - this always builds a package rather than scheduling in Canvas, whatever "Deliver" below is set to.',
      },
      {
        key: "cartridge",
        label: "Course cartridge or export",
        type: "uploads",
        accept: ".imscc,.zip",
        required: false,
        visibleWhen: { fieldKey: "draftFrom", equals: "cartridge" },
        requiredWhen: { fieldKey: "draftFrom", equals: "cartridge" },
        help: "Upload a Common Cartridge (.imscc) or a course export (.zip) to draft each week's announcement from that week's module content in the package instead of a live Canvas course. A package this app generated is refused - upload the LMS's own export.",
      },
      {
        key: "startDate",
        label: "Start date override (optional)",
        type: "date",
        required: false,
        visibleWhen: { fieldKey: "draftFrom", equals: "cartridge" },
        help: "Overrides the term's start date. Leave blank to use the selected course tile's own start date, or the uploaded package's own start date when no tile is selected or the tile has none.",
      },
      {
        key: "weekCount",
        label: "Week count override (optional)",
        type: "number",
        required: false,
        visibleWhen: { fieldKey: "draftFrom", equals: "cartridge" },
        help: "Overrides the term's number of weeks. Leave blank to use the selected course tile's own week count, or one week per module in the uploaded package when no tile is selected or the tile has none.",
      },
      {
        key: "deliver",
        label: "Deliver",
        type: "text",
        required: false,
        options: DELIVER_OPTIONS,
        optionLabels: DELIVER_LABELS,
        help: 'Leave as "Schedule them in the LMS" to reproduce today\'s behavior. "Build an importable package only" makes no LMS changes at all - useful for a course taught outside Canvas, or for reviewing the term\'s announcements before they post. "Schedule them in the LMS and build the package" does both, from the same drafted content. Ignored (always package-only) when "Draft from" above is set to an uploaded package.',
      },
      {
        key: "packageFormats",
        label: "Package formats",
        type: "text",
        options: PACKAGE_FORMAT_OPTIONS,
        optionLabels: PACKAGE_FORMAT_LABELS,
        multi: true,
        required: false,
        // AC3 item 16 asks for this to show only while a package is
        // actually being built. `visibleWhen` supports only ONE {fieldKey,
        // equals|contains} gate on a SINGLE controlling field
        // (types.ts:236), and a package is built under THREE different
        // conditions here (deliver === "package", deliver === "both", or
        // draftFrom === "cartridge" regardless of deliver) - a 2-of-3 OR
        // across two different fields that the gate type cannot express (no
        // union of gates, and `equals` cannot mean "not blank"). Left
        // unconditionally visible rather than gated on the single closest
        // value (which would hide it during "both", one of the very cases
        // it matters for) - the field is simply inert whenever no package
        // is built, so this costs correctness nothing, only shows one extra
        // control on the live-schedule-only path. See REGRESSION.md entry
        // 239 check 1 for the same equals-only limitation recorded as a
        // deliberate, load-bearing design choice elsewhere in this codebase.
        help: 'Which package format(s) to build. Leave blank to build both. Only used when "Deliver" builds a package, or when "Draft from" is set to an uploaded package.',
      },
      {
        key: "emailCopy",
        label: "Email a copy to students",
        type: "text",
        options: EMAIL_COPY_OPTIONS,
        optionLabels: EMAIL_COPY_LABELS,
        required: false,
        // AC4 item 28: the rule stated BEFORE the run, not only in the
        // report.
        help: "Canvas has no per-announcement email setting - students are always notified by their own Canvas notification preferences, whatever is chosen here. For every other LMS (including a packaged output with no LMS course selected), this choice is recorded into the package: each week's file front matter, the package README, and (Common Cartridge output) the app's own stamp file.",
      },
      {
        key: "title",
        label: "Title",
        type: "text",
        required: false,
        requiredWhen: { fieldKey: "draftFrom", equals: "template" },
        help: 'Optional. When drafting from module content, overrides the drafted title for every week (use {week} for the week number) - leave blank to use each week\'s drafted title, or "Week N" when none was drafted. Required when "Draft from" is set to the message below, since it is the only title that would ever be posted.',
      },
      {
        key: "message",
        label: "Message",
        type: "longtext",
        required: false,
        requiredWhen: { fieldKey: "draftFrom", equals: "template" },
        help: 'Optional when drafting from module content: used only as the fallback for a week with no module content or a failed draft. Required when "Draft from" is set to the message below, since it is posted for every week (use {week} for the week number).',
      },
      {
        key: "extraNotes",
        label: "Extra notes (optional)",
        type: "longtext",
        required: false,
        help: "Folded into every week's drafted announcement - a reminder, a policy note, anything the module content itself will not mention. Ignored when posting the message template.",
      },
    ],
    outputs: [
      { key: "scheduledCount", label: "Newly scheduled this run", type: "number" },
      { key: "report", label: "Report", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      // AC1 (package-io AC): an uploaded package as the content source.
      // Dispatched BEFORE the hubCourse check below - AC1 item 9 makes the
      // course tile optional for this source, so none of the live path's
      // checks (which all assume a required tile) apply.
      const draftFromRaw = String(values.draftFrom ?? "").trim();
      if (draftFromRaw === "cartridge") {
        return runCartridgeSourcedPackage(values, helpers, onProgress);
      }

      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) {
        throw new Error("Choose a course tile.");
      }

      const weekdayRaw = String(values.weekday ?? "").trim();
      if (!WEEKDAY_OPTIONS.includes(weekdayRaw)) {
        throw new Error("Choose a weekday to post on.");
      }
      const weekday = Number.parseInt(weekdayRaw, 10);
      const postTime = String(values.postTime ?? "").trim();
      // T2 (docs/announcement-post-time-acceptance-criteria.md): computed
      // once, applied at every return site below - null on every ordinary
      // run (blank, or a valid HH:MM the T1 time picker already guarantees).
      const postTimeWarning = postTimeInvalidWarning(postTime);

      const title = String(values.title ?? "").trim();
      const message = String(values.message ?? "").trim();
      const extraNotes = String(values.extraNotes ?? "").trim() || undefined;

      // Blank means module content - the new default (AC6 item 24a/29).
      // "template" is the one opt-out value; anything else typed into the
      // stored value falls back to module mode the same way an unrecognized
      // option would for any other select-backed text input here.
      //
      // Deliberately TRIMMED here, unlike the run form's requiredWhen gate
      // on title/message (isFieldRequired, workflow-field-visibility.ts),
      // which compares this same value with an EXACT, untrimmed match. A
      // stored " template " is not pre-blocked by the Run button, so it
      // falls through to this step's own check below - the same throw that
      // shipped before the gate existed. That asymmetry is intentional: the
      // alternative is matching the gate's exact comparison here, which
      // would silently resolve a padded value to module mode and post
      // drafted announcements in place of the instructor's template.
      // Unreachable through the select today (DRAFT_FROM_OPTIONS only ever
      // stores "", "template" or "cartridge", the last already dispatched
      // above), so the tolerance costs nothing here.
      const draftFrom = draftFromRaw;
      const mode: "template" | "module" = draftFrom === "template" ? "template" : "module";

      // Template mode has nothing else to post, so it keeps the ORIGINAL
      // unconditional check, at its original position (before the course
      // tile is even looked up) - module mode requires neither (AC4 item
      // 17): the action rejects a blank title when drafting is off, and
      // this step must not surface that as a raw error.
      if (mode === "template" && (!title || !message)) {
        throw new Error("Provide a title and message for the announcement.");
      }

      const list = await listCourseHubAction();
      if ("error" in list) {
        throw new Error(list.error);
      }
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        throw new Error("Choose a course tile.");
      }

      // Canvas-only guard, BEFORE any database write: this step's Canvas
      // calls go through canvas-core.ts's resolveCourse, which THROWS on a
      // non-Canvas course URL - and a Blackboard tile's canvasUrl field is
      // NOT blank (docs/REGRESSION.md #218, #229 - it holds the Blackboard
      // URL), so the old `!tile.canvasUrl` check below could never catch
      // it. Checking the tile's own `lms` field first (the same
      // authoritative signal lms-modules.ts/lms-populate/lms-wipe/
      // lms-assignments already use via lms-target-guard.ts) catches a
      // Blackboard/Brightspace/etc. tile and returns a clean, successful
      // skip - never reaching planWeeklyAnnouncementsAction,
      // draftModuleAnnouncementsAction or scheduleWeeklyAnnouncementsAction,
      // so no pending row is ever written for a course this step can never
      // serve.
      const tileLms = await resolveLmsFromTile(tile, helpers);
      if (!isCanvasLms(tileLms)) {
        const text = prependWarningToReport(canvasOnlySkipText(tileLms), postTimeWarning);
        return {
          outputs: { scheduledCount: 0, report: text },
          summary: { kind: "text", text },
        };
      }

      if (!tile.canvasUrl) {
        throw new Error("The course tile has no LMS course linked.");
      }
      if (!tile.startDate) {
        throw new Error("The course tile has no start date set.");
      }
      if (!tile.weeks || tile.weeks <= 0) {
        throw new Error("The course tile has no number of weeks set.");
      }

      const acronym = tile.institution || helpers.activeInstitution || undefined;
      onProgress(`Scheduling weekly announcements for ${tile.name}...`);

      // AC2 (package-io AC): the new delivery axis. Blank ("", the default)
      // reproduces today's behavior EXACTLY (AC2 item 12) all the way down
      // through the existing scheduleWeeklyAnnouncementsAction call below -
      // every line from here through that call is UNCHANGED for that value.
      // "package" diverts to a Canvas-write-free path BEFORE any Canvas or
      // mapping-table call is made (AC2 item 14). "both" lets everything
      // below run exactly as it always has and adds a package build AFTER
      // it (AC2 item 15).
      const deliver = String(values.deliver ?? "").trim();

      if (deliver === "package") {
        const packaged = await buildPackageForLiveSource({
          tile,
          canvasUrl: tile.canvasUrl,
          startDateRaw: tile.startDate,
          tileWeeks: tile.weeks,
          mode,
          weekdayRaw,
          weekday,
          postTime,
          title,
          message,
          extraNotes,
          acronym,
          values,
          helpers,
        });
        const reportLines = prependWarningToLines(packaged.reportLines, postTimeWarning);
        return {
          outputs: {
            scheduledCount: 0,
            report: reportLines.join("\n"),
            ...packaged.outputs,
          },
          summary: {
            kind: "list",
            label: `${packaged.packagedCount} week(s) packaged`,
            items: reportLines,
          },
        };
      }

      let drafts: WeeklyAnnouncementDraft[] | undefined;

      if (mode === "module") {
        // ONE plan call decides what needs a draft; ONE gather-and-draft
        // call does the work (AC2 item 7). A planning failure must never
        // cost the user the run - scheduleWeeklyAnnouncementsAction
        // re-plans from scratch (AC5 item 23) and will report the same
        // failure per week, just without a drafted head start.
        let planWeeks: WeekPlanEntry[] = [];
        try {
          const plan = (await planWeeklyAnnouncementsAction(
            tile.id,
            tile.canvasUrl,
            acronym,
            tile.startDate,
            tile.weeks,
            weekday,
            postTime
          )) as { weeks: WeekPlanEntry[] } | { error: string } | null | undefined;
          if (plan && !("error" in plan)) {
            planWeeks = plan.weeks;
          }
        } catch {
          planWeeks = [];
        }

        // A reschedule only moves a date and must NEVER be re-drafted (AC5
        // item 22). already-present/skip-past/leave-posted need no text
        // either. resolve-pending may still have to create, so it DOES.
        const weeksNeedingText = planWeeks
          .filter((w) => w.action === "create" || w.action === "resolve-pending")
          .map((w) => w.week);

        // Nothing to draft is what makes a re-run against a fully
        // scheduled term cost zero LLM calls (AC1 item 6) - no draft call
        // at all, not a call asking for zero weeks.
        if (weeksNeedingText.length > 0) {
          onProgress(
            `Drafting ${weeksNeedingText.length} week announcement${weeksNeedingText.length === 1 ? "" : "s"} from module content...`
          );
          try {
            const drafted = (await draftModuleAnnouncementsAction(
              tile.canvasUrl,
              weeksNeedingText,
              tile.weeks,
              acronym,
              { provider: helpers.provider, courseName: tile.name, extraNotes }
            )) as { drafts: WeeklyAnnouncementDraft[] } | { error: string } | null | undefined;
            if (drafted && !("error" in drafted)) {
              drafts = drafted.drafts;
            }
            // Drafting never blocks scheduling (AC2 item 11): an { error }
            // here just leaves `drafts` unset and every week falls back to
            // the message template inside scheduleWeeklyAnnouncementsAction.
          } catch {
            drafts = undefined;
          }
        }
      }

      // Template mode calls exactly as before this feature existed - no
      // trailing arguments, no plan call, no draft call (AC3 item 14:
      // byte-for-byte the original behavior). Module mode ALWAYS appends the
      // (unused) testOverrides slot and a drafts option, even an empty one:
      // the action reads the option's PRESENCE (not its contents) as "resolve
      // per week", and its ABSENCE as "template mode, both templates
      // required" (AC3 item 15). `drafts` is undefined on several reachable
      // module-mode paths - a fully scheduled term, a term entirely in the
      // past, a start-date edit that only reschedules, or a planning/drafting
      // failure - and conditionally omitting the option on those paths would
      // fall through into template mode's blanket rejection, breaking the
      // "safe to re-run" guarantee (entry 236 check 4). Do not reintroduce a
      // conditional spread here.
      const result =
        mode === "template"
          ? await scheduleWeeklyAnnouncementsAction(
              tile.id,
              tile.canvasUrl,
              acronym,
              tile.startDate,
              tile.weeks,
              weekday,
              postTime,
              title,
              message
            )
          : await scheduleWeeklyAnnouncementsAction(
              tile.id,
              tile.canvasUrl,
              acronym,
              tile.startDate,
              tile.weeks,
              weekday,
              postTime,
              title,
              message,
              undefined,
              { drafts: drafts ?? [] }
            );
      if ("error" in result) {
        throw new Error(result.error);
      }

      const { result: run } = result;
      const scheduledCount = run.createdCount + run.resolvedCreatedCount;

      if (deliver !== "both") {
        // Byte-identical to this step's behavior before the package-io
        // feature existed (AC2 item 12) - reached whenever `deliver` is its
        // default "" (or, degrading the same way every other unrecognized
        // stored value in this step does, anything other than "package" or
        // "both") - EXCEPT for the postTimeWarning prefix (T2), which is
        // null (so this stays byte-identical) whenever postTime is blank or
        // valid, i.e. on every run the frozen AC2-item-12 test below covers.
        return {
          outputs: {
            scheduledCount,
            report: prependWarningToReport(run.report, postTimeWarning),
          },
          summary: {
            kind: "list",
            label: `${scheduledCount + run.rescheduledCount} week(s) updated in Canvas${run.stoppedEarly ? " - stopped early on the time budget, re-run to finish" : ""}`,
            items: prependWarningToLines(run.lines, postTimeWarning),
          },
        };
      }

      // AC2 item 15: "both" - the live path above already ran, unchanged,
      // and wrote to Canvas. The package is now built from the SAME
      // resolved title/message/postAt triples that path used - reusing
      // `drafts` (module mode) rather than drafting a second time (AC6 item
      // 39). A package-build failure must NEVER fail a run that already
      // wrote to Canvas: it degrades to a report note instead.
      try {
        const packaged = await buildPackageForLiveSource({
          tile,
          canvasUrl: tile.canvasUrl,
          startDateRaw: tile.startDate,
          tileWeeks: tile.weeks,
          mode,
          weekdayRaw,
          weekday,
          postTime,
          title,
          message,
          extraNotes,
          acronym,
          values,
          helpers,
          drafts: mode === "module" ? (drafts ?? []) : undefined,
        });
        return {
          outputs: {
            scheduledCount,
            report: prependWarningToReport(`${run.report}\n${packaged.reportLines.join("\n")}`, postTimeWarning),
            ...packaged.outputs,
          },
          summary: {
            kind: "list",
            label: `${scheduledCount + run.rescheduledCount} week(s) updated in Canvas, ${packaged.packagedCount} week(s) packaged${run.stoppedEarly ? " - stopped early on the time budget, re-run to finish" : ""}`,
            items: prependWarningToLines([...run.lines, ...packaged.reportLines], postTimeWarning),
          },
        };
      } catch (err) {
        const detail = err instanceof Error ? err.message : "unknown error";
        const note = `Could not build the package: ${detail}.`;
        return {
          outputs: {
            scheduledCount,
            report: prependWarningToReport(`${run.report}\n${note}`, postTimeWarning),
          },
          summary: {
            kind: "list",
            label: `${scheduledCount + run.rescheduledCount} week(s) updated in Canvas${run.stoppedEarly ? " - stopped early on the time budget, re-run to finish" : ""}`,
            items: prependWarningToLines([...run.lines, note], postTimeWarning),
          },
        };
      }
    },
  },
];
