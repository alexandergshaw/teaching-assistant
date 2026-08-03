// Classifies a course module's items - whether sourced from a live LMS or an
// LMS export/cartridge - into the KIND of thing they are for lecture-building
// purposes: the graded assignment, a quiz/test, real instructional content,
// or pure LMS housekeeping/administrative shell that carries no teachable
// subject matter of its own.
//
// Why this exists: a Course Build run for INFO 1020 - Computer Science
// Principles produced a 48-slide Week 8 deck where 3 of 5 sections were
// built from LMS navigation pages ("Module 08 Objectives and Tasks",
// "Module 08 Learning Materials", "Module 08 Discussion Forum") while the
// actual graded assignment (modify starter code from mod10.zip, follow the
// textbook's Try It Out steps 10.38-10.45, submit to GitHub) never appeared
// anywhere in the deck. The upstream cause was structural - the course-export
// path only ever read item TITLES, never bodies (see
// MAX_CARTRIDGE_ITEM_BODY_CHARS in cartridge-import.ts for that half of the
// fix) - but even with full body text available, a generator handed an
// undifferentiated list of module items has no way to know which one is what
// students are graded on versus which one is a forum page that merely
// EXISTS. This module supplies that missing signal, pure and deterministic,
// so registry-helpers.sources.ts can put the assignment first (the "anchor")
// and keep administrative items from being offered as lecture section
// topics.
//
// Deliberately NOT a denylist of this course's exact item titles - the
// strings "Module 08 Discussion Forum", "Module 08 Objectives and Tasks",
// etc, never appear literally anywhere in this file. Every rule below keys
// off either the item's LMS-reported type/content-type, or a generic word
// pattern ("assignment", "quiz", "discussion", "status update", "office
// hours", ...) that recurs across LMS naming conventions independent of
// course subject or numbering scheme. course-item-classifier.test.ts proves
// this two ways: against the real INFO 1020 titles from the bug report, AND
// against a second, differently-named/numbered fixture course (a math
// course using "Homework", "Midterm Exam", "Discussion Board", "Icebreaker",
// etc) - so a rule that had quietly been fitted to only the first course's
// naming would show up as a failure on the second.
//
// Scope note: classification here uses ONLY an item's type and title - not
// due dates, points, or submission requirements - because that is the
// contract the course-export path (this file's only caller today, via
// registry-helpers.sources.ts) can actually supply; a cartridge item never
// carries due-date/points data the way a live LMS module item does. One
// consequence worth naming: a title containing "discussion" always routes to
// "administrative" here, even for a genuinely graded discussion assignment
// that happens to be titled that way - distinguishing "plain participation
// forum" from "graded discussion assignment" would need points/due-date
// data this classifier does not have access to. The live-LMS path
// (gatherLiveModuleItems in registry-helpers.sources.ts) already has that
// data and already treats Assignment/Discussion alike for its own
// description-fetching purposes; it does not use this classifier and is
// unaffected by this trade-off.
//
// Second incident, same classifier, same shape of root cause: a later Course
// Build run against the instructor's REAL Canvas export (not a hand-built
// fixture) surfaced that "(Optional) Module 08 Status Update" - explicit,
// non-graded participation housekeeping - was classified "assignment" and
// put forward as a SECOND "GRADED ASSIGNMENT" anchor alongside the real one.
// Cause: Canvas stores this kind of ungraded participation checkpoint as an
// Assignment content object (ordinarily 0 points, no real submission
// requirement), so its own content_type/type value is indistinguishable from
// a genuinely graded assignment's - TYPE_ASSIGNMENT_PATTERN below matched it
// with exactly the same confidence it matches real graded work, and because
// the original check order tested TYPE before title, the module's own
// "status update" -> administrative title rule never even ran; type
// unconditionally shadowed it. See TITLE_OPTIONAL_MARKER_PATTERN and
// TITLE_ACTION_PATTERN further down for the fix: an unambiguous
// administrative/participation title (or an explicit leading "(Optional)"
// marker) can now DEMOTE a permissive assign*-family TYPE match, while a
// genuinely graded item whose title merely mentions participation vocabulary
// ("Discussion Assignment", "Graded Discussion Post") is left alone.
//
// Third incident, this classifier's regression gate run against the SAME
// instructor's real export (not a hand-built fixture): two more defects, one
// a mirror image of the other, both misjudging what an item's TITLE is
// actually telling a reader to do with it.
//
// (a) "Sign up for Group Project Groups" (a WikiPage, real title, real
// export) classified "assignment" - not because of a type-shadow (its type
// is WikiPage, nowhere near TYPE_ASSIGNMENT_PATTERN), but because
// TITLE_ASSIGNMENT_PATTERN's "project" word fired in the title-only fallback
// chain before anything else got a look at it. It is a sign-up FORM, not
// graded work - the instructor's own "GitHub Sign Up" (a real, separate,
// genuinely assignment-typed item elsewhere in the same export) shows Canvas
// itself does not distinguish "register for X" from "submit X" by type
// alone, so this classifier cannot either without a title signal. See
// TITLE_ACTION_PATTERN below - the fix generalizes the ALREADY-EXISTING
// non-optional-marker demotion idiom (an unambiguous title signal strong
// enough to override a competing type OR vocabulary match on its own, no
// guard needed) to a second unconditional signal: an item whose title names
// an action a student performs (sign up, check office hours, ...) rather
// than content a student reads. ("Register" was originally lumped into this
// same unconditional list too - see the Fourth incident below for why that
// turned out to be wrong and where it lives now.)
//
// (b) The mirror bug: "Getting Started" (a WikiPage, real title, real body
// of 1398 resolved characters of orientation content) classified
// "administrative" purely because TITLE_ADMIN_PATTERN's old "getting
// started" entry matched, which - per formatExportModuleMaterials in
// registry-helpers.sources.ts - collapses an item down to a bare title in a
// parenthetical list and DISCARDS its body outright. "Getting Started",
// "Orientation", and "Welcome" are a fundamentally different kind of word
// than "sign up" or "office hours": the LATTER group names an action with no
// other plausible reading (nobody "reads" a sign-up form as subject-matter
// content), but the FORMER group is exactly as likely to title a genuine,
// substantive welcome/orientation page as it is to title a one-line
// housekeeping stub - the word alone cannot tell those apart. Since this
// classifier now has an item's resolved body length available to it (see
// ClassifiableCourseItem.body below - previously this file was body-blind by
// design; a course-export item's body is exactly the signal that
// distinguishes the two readings), TITLE_AMBIGUOUS_ADMIN_PATTERN's words
// only demote when the item's body is ALSO thin - a real content page with a
// resolved body survives as instructional (see hasSubstantialBody).
//
// Rejected alternative for (b): special-case the literal title "Getting
// Started" (or add it to some course-specific denylist/allowlist). Rejected
// for the same reason the rest of this file rejects literal-title matching -
// it would fix exactly one export and reopen on the next differently-worded
// orientation page (see course-item-classifier.test.ts's MATH 2010 fixture,
// extended with a differently-named orientation-page case specifically to
// prove this generalizes).
//
// Rejected alternative for (a): keep "sign up" in the same guarded bucket as
// "welcome"/"orientation" (demote only when the title does NOT also match
// TITLE_ASSIGNMENT_PATTERN). That guard is exactly what caused defect (a) in
// the first place - "Sign up for Group Project Groups" DOES also match
// TITLE_ASSIGNMENT_PATTERN (the word "project"), so a guarded rule would
// never have fired. A sign-up title is exactly as unambiguous an instructor
// signal as a leading "(Optional)" marker already is (see
// TITLE_OPTIONAL_MARKER_PATTERN's own comment) - it wins outright, no guard,
// even against a title that also carries assignment vocabulary. "Register"
// went into this same unconditional bucket alongside "sign up" at the time,
// on the theory that it was an equally unambiguous action word - see the
// Fourth incident further down for why that theory was wrong: unlike "sign
// up", "register" is ordinary, unrelated academic and technical vocabulary
// in its own right (register allocation, a shift register) and needed the
// exact guarded treatment this paragraph is rejecting for "sign up"
// specifically.
//
// Fourth incident, same regression gate, this classifier's SAME
// TITLE_ACTION_PATTERN from the Third incident above: two of that pattern's
// words - "survey" and "register" - turned out not to belong in an
// unconditional demotion list at all. "Sign up", "office hours", "status
// update", "check-in", and "introduce yourself" each name an action with
// essentially one plausible reading in a course-item title (nobody "reads" a
// sign-up form or a status-update checkpoint as subject matter). "Survey"
// and "register" do not share that property - both are ordinary academic
// and technical vocabulary as well as occasional LMS logistics words: a
// "survey" is a standard assignment genre (a literature survey, "Survey of
// Object Oriented Programming" - literally this instructor's own Module 08
// name), and "register" is CPU/hardware vocabulary (a shift register,
// register allocation) with no logistics reading at all in that context.
// Because TITLE_ACTION_PATTERN demoted unconditionally, every one of the
// following - all graded work, all carrying a substantial resolved body
// that the administrative branch then discards into a bare parenthetical -
// was wrongly demoted:
//
//   "Survey Design Assignment"              (type Assignment)
//   "Literature Survey"                     (type Assignment)
//   "Customer Survey Project"               (type Assignment)
//   "Module 08 Survey"                      (type Assignment)
//   "Shift Register Lab"                    (type Assignment)
//   "Register Allocation Homework"          (type Assignment)
//   "Survey of Object Oriented Programming" (a WikiPage)
//
// The fix: "survey"/"register" move out of TITLE_ACTION_PATTERN (now
// reserved for the phrase-only vocabulary that really is unambiguous - see
// that constant's own comment below) into a new
// TITLE_AMBIGUOUS_ACTION_PATTERN, gated by the SAME two guards
// TITLE_AMBIGUOUS_ADMIN_PATTERN already established for "welcome"/
// "orientation"/"getting started": demote only when the title does NOT also
// carry an explicit assignment/graded word (TITLE_ASSIGNMENT_PATTERN) AND
// the item does NOT carry a substantial resolved body (hasSubstantialBody).
// Both guards are independently load-bearing against the seven titles
// above, not redundant: "Survey Design Assignment", "Customer Survey
// Project", "Shift Register Lab", and "Register Allocation Homework" are
// saved by the assignment-word guard alone (each carries "Assignment"/
// "Project"/"Lab"/"Homework"), while "Literature Survey", "Module 08
// Survey", and "Survey of Object Oriented Programming" carry no such word
// and are saved only by the body guard - exactly mirroring why "Getting
// Started" needed a body signal in the Third incident above, not a
// vocabulary tweak.
//
// Why not just delete "survey"/"register" outright, with no guarded bucket
// at all? Because the ORIGINAL reason TITLE_ACTION_PATTERN exists is real:
// Canvas genuinely stores some ungraded logistics checkpoints ("register for
// a lab session", a brief end-of-term satisfaction survey) as bare
// Assignment content objects with no meaningful body, and those still need
// to demote or they wrongly promote to "assignment" and become anchor
// candidates - the exact failure class the "(Optional) Module 08 Status
// Update" incident was about. A thin, wordless "Register" or "Survey" item
// with no assignment vocabulary and no resolved body is still far more
// likely to be that kind of stub than graded work, so the guarded bucket
// keeps demoting it; only a title that offers EITHER an explicit assignment
// word OR real body substance escapes.
//
// Rejected alternative: keep both words in TITLE_ACTION_PATTERN but add an
// unconditional \bassignment\b-style guard to that whole pattern (not just
// survey/register). Rejected because the rest of TITLE_ACTION_PATTERN's
// vocabulary is deliberately UNGUARDED on purpose - see "Sign up for Group
// Project Groups" in the Third incident above, which must demote despite
// containing "project" (a TITLE_ASSIGNMENT_PATTERN word). Guarding the whole
// pattern would silently resurrect that exact bug for the phrase-only words
// while fixing the bare-word ones; only splitting the pattern in two, with
// different guard behavior per group, fixes one without reopening the
// other.
//
// Fifth incident, same regression gate, a constructed MATH 2010 fixture case
// (not a title from a real export - built specifically to probe whether the
// Fourth incident's two-guard TITLE_AMBIGUOUS_ACTION_PATTERN was actually
// complete): "Register for Your Homework Partner" (type Assignment)
// classified "assignment" - saved from demotion by the assignment-word
// guard because it contains "Homework", exactly the same way the guard
// correctly saves "Register Allocation Homework". This time saving it was
// wrong: a homework-partner sign-up is logistics, not graded work. Both
// titles contain "Register" and "Homework"; vocabulary alone - the only
// thing either guard looks at - genuinely cannot tell them apart. A THIRD
// signal was needed, and it was hiding in the one thing neither the Third
// nor the Fourth incident had looked at: word order.
//
//   "Register for Your Homework Partner"   - "Register" OPENS the title, as
//                                             a VERB, with "for" right after
//                                             it (the object of the
//                                             instruction) and "Your"
//                                             addressing the reader.
//   "Register Allocation Homework"         - "Register" is a NOUN MODIFIER
//                                             ("register" the noun,
//                                             modifying "allocation"); the
//                                             title never addresses a reader
//                                             as "you" at all.
//
// An LMS logistics item is titled as an INSTRUCTION TO THE STUDENT - it
// opens with an imperative verb ("Register...", "Submit...", "Join...")
// because that is literally what it is asking the reader to do. Graded work
// is titled as a NOUN PHRASE naming a deliverable or topic, even when that
// noun phrase happens to start with the exact same word ("Register
// Allocation", "Survey Design", "Shift Register"). See
// TITLE_LEADING_IMPERATIVE_PATTERN and isAmbiguousLogisticsTitle further
// down for the fix: a title that opens with one of a curated set of
// imperative verbs, immediately followed by "for"/"to"/"your" (the
// object-of-the-instruction marker a bare noun modifier never has), now
// defeats the assignment-word guard specifically - that guard's own
// coincidental-word-collision blind spot - without touching the body guard
// at all.
//
// Why the assignment-word guard specifically, and not some broader
// override? Because that is the only one of TITLE_AMBIGUOUS_ACTION_PATTERN's/
// TITLE_AMBIGUOUS_ADMIN_PATTERN's two guards this defect actually
// implicates - "Register for Your Homework Partner" has no resolved body at
// all, so the body guard was never in play here. Leaving the body guard
// untouched is deliberate, not an oversight: a genuinely graded "Submit
// Your Final Project" whose resolved body runs to 2000 characters must stay
// graded work no matter how imperative its title sounds - a substantial
// resolved body is direct evidence of real content, a far stronger signal
// than a title's grammatical mood, and no phrasing signal gets to overrule
// it. (For that particular title it is also, independently, moot - "final
// project" carries no TITLE_AMBIGUOUS_ADMIN_PATTERN/TITLE_AMBIGUOUS_ACTION_
// PATTERN vocabulary at all, so the new signal is never even consulted for
// it; see the next paragraph.)
//
// Why the verb set (register, submit, join, enroll, schedule, complete,
// introduce, post, choose, select) is safe to define broadly even though
// several of its members - "submit" chief among them, per this incident's
// own regression-gate note above - are ALSO completely ordinary openers for
// graded-work titles ("Submit Lab 3", "Complete the Midterm Project"): the
// verb set is never consulted on its own. isAmbiguousLogisticsTitle only
// asks whether a title leads with one of these verbs AFTER already
// confirming the title separately matches TITLE_AMBIGUOUS_ADMIN_PATTERN or
// TITLE_AMBIGUOUS_ACTION_PATTERN - today, "welcome"/"orientation"/"getting
// started"/"announcements"/"register"/"survey". A title has to clear that
// co-occurrence gate before its leading verb ever gets a look, which is
// exactly what keeps "Submit Lab 3" and "Complete the Midterm Project" safe
// (neither contains a word from either ambiguous pattern, so the check
// short-circuits before the leading verb matters) while still letting
// "Complete Your Orientation Checklist" demote on the same footing
// "Register for..." does.
//
// CORRECTION (2026-08-03, found by a regression gate): an earlier version of
// this comment also claimed "Submit Your Course Registration" demotes here.
// It does NOT, and cannot, because TITLE_AMBIGUOUS_ACTION_PATTERN's
// `register(?:ing|ration)?` alternation expands to
// register | registering | registerration - it never matches the correctly
// spelled "registration", so that title never clears the co-occurrence gate
// at all. Observed: "Submit Your Course Registration" -> assignment, and
// "Course Registration Form" (a WikiPage) -> instructional, which means a
// pure logistics page has its full body emitted as lecture material. This
// gap is PRE-EXISTING, not introduced by the leading-imperative rule (the
// previous `registers?` did not match "registration" either), and is
// documented from the other side in this module's test file. It is left
// unfixed here deliberately: correcting the alternation is a BEHAVIOUR
// change that belongs in its own verified pass, not smuggled in alongside a
// comment fix. The false sentence is removed rather than left standing,
// because a wrong load-bearing rationale is worse than a known gap.
// "sign up"
// is deliberately NOT in this new verb set even though it is a textbook
// imperative opener - TITLE_ACTION_PATTERN already demotes any title
// containing that phrase unconditionally, checked earlier in precedence in
// both branches below, so adding it here would be untestable dead code, not
// a second layer of safety.
//
// Rejected alternative: treat "Register for Your Homework Partner" as an
// acceptable over-inclusion and leave TITLE_AMBIGUOUS_ACTION_PATTERN's
// existing two-guard behavior alone (change the test's expectation to
// "assignment" instead of changing the code). Rejected because the
// word-order signal this incident identifies is real and generalizes
// cleanly - see course-item-classifier.test.ts's "Register for Your Project
// Study Group" (a different colliding assignment word) and "Submit Your
// Survey Response Assignment" (a different leading verb entirely) cases -
// and costs nothing against any of the seven Fourth-incident titles or the
// Third-incident sign-up/orientation titles, every one of which is
// re-verified unchanged below. Weakening the test was the fallback plan
// only if this signal turned out not to generalize past the one failing
// string; it did generalize, so the code changed instead.
//
// Where the fix lives structurally: NOT a fourth parallel demotion
// mechanism bolted alongside TITLE_OPTIONAL_MARKER_PATTERN/TITLE_ACTION_
// PATTERN/the ambiguous-vocabulary pair - isAmbiguousLogisticsTitle folds
// TITLE_LEADING_IMPERATIVE_PATTERN into the THIRD mechanism's own guard
// logic (the one TITLE_AMBIGUOUS_ADMIN_PATTERN/TITLE_AMBIGUOUS_ACTION_
// PATTERN already used), consulted from exactly the same two call sites
// that mechanism already had. The only structural change is that the
// title-only fallback chain now consults isAmbiguousLogisticsTitle ahead of
// TITLE_ASSIGNMENT_PATTERN rather than after it - the same repositioning
// TITLE_ACTION_PATTERN itself already needed for the Third incident's
// "Sign up for Group Project Groups", and safe for the identical reason:
// isAmbiguousLogisticsTitle is a no-op for any title that does not clear
// the ambiguous-vocabulary gate, so every title that used to reach
// TITLE_ASSIGNMENT_PATTERN unchallenged still does.

/** The minimal shape this classifier needs from a module item - deliberately
 * a structural subset (not importing CartridgeModuleItem or the live LMS's
 * item type) so this module has no dependency edge on any specific source's
 * shape and stays trivially reusable from either. */
export interface ClassifiableCourseItem {
  readonly title: string;
  readonly type: string;
  /**
   * Optional resolved body text (mirrors CartridgeModuleItem.body in
   * cartridge-import.ts) - present only when a course-export source
   * successfully resolved the item's linked HTML resource; a live-LMS item
   * routed through this classifier never carries one (see this file's header
   * comment's "Scope note" - the live-LMS path does not use this classifier
   * at all today, but a future caller that does would simply omit this
   * field, same as any other type-"" generic item).
   *
   * Used by exactly one signal below - hasSubstantialBody, consulted by both
   * TITLE_AMBIGUOUS_ADMIN_PATTERN's check and TITLE_AMBIGUOUS_ACTION_PATTERN's
   * check - to tell a genuine orientation/welcome/survey CONTENT page apart
   * from the LMS's own thin housekeeping stub of the same name (see the
   * header comment's "Third incident" and "Fourth incident" for why these two
   * narrow vocabularies need a body signal at all). Every other rule in this
   * file remains deliberately body-blind, exactly as before: structural type,
   * assignment/quiz type and vocabulary, and the unconditional action/
   * logistics vocabulary (TITLE_ACTION_PATTERN) all still key off type/title
   * alone, on purpose - "Sign up for Group Project Groups" is furniture
   * regardless of how much prose surrounds the sign-up link, and
   * "(Optional) Module 08 Status Update" stays administrative at 233
   * characters of body, exactly as it did before body was visible here at
   * all.
   */
  readonly body?: string;
}

export type CourseItemKind = "assignment" | "quiz" | "instructional" | "administrative";

// ---------------------------------------------------------------------------
// Type-based signals - checked first, since an LMS's own content-type/
// content-handler classification is more reliable than a title guess
// whenever it is specific enough to say something. Loose substring matches
// (not an enum of exact known values) so this keeps working across Canvas
// content_type values ("Assignment", "ContextModuleSubHeader"), Blackboard
// CONTENTHANDLER values ("resource/x-bb-assignment", "resource/x-bb-folder"),
// and generic Common Cartridge items (whose type this app leaves "" - see
// parseGenericCartridge in cartridge-import.ts) - which is exactly why every
// type-based rule below also has a title-based fallback for when type
// carries no signal at all.
//
// Rejected alternative: an exact-match Set of known type strings (the way
// BLACKBOARD_SCAFFOLD_TITLES in cartridge-import.ts matches Blackboard's own
// reserved labels exactly). That works for a small closed set of literal,
// non-user-editable values; it does not work here because "type" varies by
// LMS AND is sometimes simply absent (generic Common Cartridge), so a
// pattern that matches on the recognizable SUBSTRING of a type family
// (any of the many Blackboard "resource/x-bb-*" content-handler values that
// contain "assignment", for instance) generalizes across producers an exact
// Set would silently miss.
const TYPE_STRUCTURAL_PATTERN = /subheader|folder|coursetoc/i;
const TYPE_ASSIGNMENT_PATTERN = /assign/i;
const TYPE_QUIZ_PATTERN = /quiz|test|exam|assess/i;
const TYPE_CONTENT_PATTERN = /page|wiki|file|attachment|document/i;

// ---------------------------------------------------------------------------
// Type-shadow demotion signals - originally the fix for the "(Optional)
// Module 08 Status Update" incident, extended by the "Third incident" (see
// this file's header comment for both full stories). TYPE_ASSIGNMENT_PATTERN
// above is a loose substring match by design, so it is exactly as confident
// about a Canvas Assignment object that carries 0 points and no real
// submission requirement as it is about a genuinely graded one - type alone
// cannot tell those apart. These signals let an unambiguous TITLE override
// ("demote") that permissive type match. All three are ALSO consulted from
// the title-only fallback chain further down (classifyCourseItemKind is
// where each one's exact scope is enforced) so an item that never had a
// permissive TYPE to shadow in the first place - a WikiPage, say - gets the
// same title-driven answer.
//
// TITLE_OPTIONAL_MARKER_PATTERN - a leading "(Optional)"/"[Optional]"/
// "Optional:" label. Anchored to the START of the title (`^`), not a bare
// \boptional\b matched anywhere, so a genuinely graded item that merely
// MENTIONS optionality mid-title - e.g. "Lab 4 (optional exercises
// included)" - is not swept up by a rule meant to catch the LMS's own "this
// whole item is optional" label. An instructor who explicitly marked an item
// optional has already said it carries no grading weight, regardless of
// whatever vocabulary follows or what content-type the LMS happens to store
// it under - so this signal demotes on its own, no vocabulary match needed.
//
// TITLE_ACTION_PATTERN - vocabulary that names an ACTION a student performs
// (sign up, check office hours, post a status update, do an icebreaker,
// introduce yourself) rather than content a student reads, and that has
// essentially no OTHER plausible reading in a course-item title. Exactly
// like the optional marker, this is unambiguous enough to demote entirely on
// its own, no guard against a coincidental TITLE_ASSIGNMENT_PATTERN
// collision needed - and that lack of a guard is the point, not an
// oversight: "Sign up for Group Project Groups" contains "project" (a
// TITLE_ASSIGNMENT_PATTERN word) and must STILL demote, because signing up
// for a group is not the graded project itself. Nobody titles graded work
// "Sign Up", "Office Hours", or "Icebreaker" - an item can say both "sign
// up" and "project" in the same breath, and when it does, the action wins.
//
// "Register" and "survey" are deliberately NOT in this pattern, even though
// both CAN name a logistics action ("register for a lab session", "take the
// course survey") - unlike the words above, both are also ordinary academic
// and technical vocabulary with no action reading at all ("Register
// Allocation Homework", "Shift Register Lab", "Literature Survey", "Survey
// of Object Oriented Programming" - literally this instructor's own Module
// 08 name). An unconditional match here would demote graded work on nothing
// but a coincidental word, exactly the bug this file's header comment's
// "Fourth incident" documents. See TITLE_AMBIGUOUS_ACTION_PATTERN below for
// where these two words actually live now: guarded, the same way
// TITLE_AMBIGUOUS_ADMIN_PATTERN guards "welcome"/"orientation" just below.
//
// TITLE_AMBIGUOUS_ADMIN_PATTERN - vocabulary that is NOT unambiguous the way
// TITLE_ACTION_PATTERN's words are: "Welcome", "Orientation", and "Getting
// Started" are exactly as likely to title a genuine, substantive orientation
// page (a real "Getting Started" WikiPage with 1398 characters of onboarding
// content was wrongly discarded by this exact vocabulary before this fix) as
// they are to title a one-line LMS housekeeping stub. Word choice alone
// cannot tell those two readings apart, so - unlike TITLE_ACTION_PATTERN
// above - this one is gated by hasSubstantialBody below: it demotes only
// when the item ALSO has no substantial resolved body. A second, independent
// guard also still applies here (title must NOT also look like an assignment
// title) for the same reason it always has: "Welcome Week Assignment 1"
// should stay "assignment" even though "welcome" is in this vocabulary.
//
// TITLE_AMBIGUOUS_ACTION_PATTERN - "register"/"survey", carrying the exact
// same two-part guard as TITLE_AMBIGUOUS_ADMIN_PATTERN immediately above, for
// the same reason: the word alone cannot tell a logistics reading ("Register
// for Office Hours") from a content reading ("Register Allocation Homework",
// "Literature Survey") apart, so it demotes only when the title does NOT
// also look like an assignment title AND the item does NOT carry a
// substantial resolved body. See this file's header comment's "Fourth
// incident" for the real titles this fixes and why the two guards are each
// independently load-bearing (some titles are saved only by the
// assignment-word guard, some only by the body guard, depending on whether
// the title happens to also contain an explicit assignment word).
//
// The assignment-word guard above is no longer absolute, though - see this
// file's header comment's "Fifth incident" and isAmbiguousLogisticsTitle
// below. "Register for Your Homework Partner" needs to demote DESPITE
// containing "Homework", the same way "Register Allocation Homework" needs
// to survive BECAUSE it contains "Homework" - two titles the assignment-word
// guard alone cannot tell apart. TITLE_LEADING_IMPERATIVE_PATTERN adds a
// third signal (does the title open with an imperative verb aimed at the
// reader, rather than use the ambiguous word as a noun modifier) that can
// override the assignment-word guard specifically. The body guard is NOT
// overridable this way, by design - see the Fifth incident's own
// "Submit Your Final Project" reasoning for why resolved body length always
// outranks title phrasing.
//
// "discussion" is deliberately excluded from all four signals above and
// lives only in TITLE_ADMIN_PATTERN further down (title-only fallback,
// unconditional, never gated by body). It is the one word in the broader
// admin vocabulary that is genuinely ambiguous in the OPPOSITE direction from
// TITLE_AMBIGUOUS_ADMIN_PATTERN: it names both plain participation forums AND
// real graded discussion assignments ("Discussion Assignment", "Graded
// Discussion Post", "Week 3 Discussion Essay" must all stay "assignment" when
// the LMS's own type says assignment-family). This classifier has no
// due-date/points data to tell those apart (see this file's header comment
// on that pre-existing, documented trade-off), so when a type signal is
// actually present to demote FROM, title-only "discussion" wording is not
// confident enough on its own to overrule it, and a body-substantiality
// escape hatch would not help either - a genuinely graded discussion prompt
// can easily carry a long body too.
//
// Rejected alternative: keep "discussion" in one of the demotion patterns
// above but add the same "does not also look like an assignment title" guard
// TITLE_AMBIGUOUS_ADMIN_PATTERN already carries. That guard cannot substitute
// for excluding "discussion" outright, because "Graded Discussion Post"
// carries none of TITLE_ASSIGNMENT_PATTERN's words (assignment/homework/
// project/deliverable/problem set/lab) for that guard to key off; it would
// still be wrongly demoted. Only a flat exclusion of "discussion" from these
// signals handles every counter-example the bug report named.
const TITLE_OPTIONAL_MARKER_PATTERN = /^\s*[([]?\s*optional\s*[)\]]?\s*[:\-–—]?\s*/i;
const TITLE_ACTION_PATTERN =
  /\b(sign[\s-]?ups?|status updates?|office hours|icebreakers?|introduce yourself|check-?ins?)\b/i;
const TITLE_AMBIGUOUS_ADMIN_PATTERN = /\b(announcements?|orientation|getting started|welcome)\b/i;
// See this constant's own comment above (immediately before
// TITLE_AMBIGUOUS_ADMIN_PATTERN's) for why "register"/"survey" live here,
// guarded, rather than in the unconditional TITLE_ACTION_PATTERN above.
const TITLE_AMBIGUOUS_ACTION_PATTERN = /\b(register(?:ing|ration)?|surveys?)\b/i;

// TITLE_LEADING_IMPERATIVE_PATTERN - the Fifth-incident signal (see this
// file's header comment). Matches a title that OPENS with one of a curated
// set of imperative verbs, immediately followed by "for"/"to"/"your" - the
// grammatical marker of an instruction addressed to the reader ("Register
// FOR Office Hours", "Submit YOUR GitHub username", "Join TO the study
// group") as opposed to that same word used as a noun or noun modifier
// mid-phrase ("Register Allocation Homework", "Course Feedback Survey
// Assignment"). Anchored to the START of the title (`^`) on purpose, same
// reasoning as TITLE_OPTIONAL_MARKER_PATTERN's own anchor: a word that
// merely APPEARS somewhere in a longer noun-phrase title ("Homework Partner
// Registration Deadlines") is not the same signal as a title whose very
// first move is to instruct the reader.
//
// The "for"/"to"/"your" complement is REQUIRED, not optional decoration -
// it is the actual discriminator, not the verb. "Register" by itself opens
// both "Register for Your Homework Partner" (logistics) and "Register
// Allocation Homework" (graded CPU-architecture homework); only the former
// is followed by a complement that marks it as an instruction rather than a
// noun modifier. A pattern that matched on the leading verb ALONE, with no
// required complement, would match both titles identically and solve
// nothing - see this file's header comment's "Fifth incident" for the
// worked comparison.
//
// Verb set: register, submit, join, enroll, schedule, complete, introduce,
// post, choose, select - see the header comment's "Fifth incident" for why
// it is safe to define this broadly (including verbs like "submit" that are
// ALSO completely ordinary graded-work openers) despite that breadth:
// this pattern is never tested on its own anywhere in this file. Every call
// site below only consults it from inside isAmbiguousLogisticsTitle, AFTER
// that function has already confirmed the title separately matches
// TITLE_AMBIGUOUS_ADMIN_PATTERN or TITLE_AMBIGUOUS_ACTION_PATTERN - so
// "Submit Lab 3" and "Complete the Midterm Project" never reach this
// pattern's verdict at all, regardless of what it says about them.
//
// "sign up" is deliberately excluded from this verb set even though it is
// exactly this kind of imperative opener ("Sign up for Office Hours") -
// TITLE_ACTION_PATTERN already demotes any title containing that phrase
// unconditionally (no leading-anchor, no complement requirement, no
// ambiguous-vocabulary gate at all), checked earlier in precedence in both
// branches of classifyCourseItemKind below. Including "sign up" here too
// would never change an outcome - TITLE_ACTION_PATTERN would already have
// returned first - so it would be untestable dead code, not a second layer
// of safety.
const TITLE_LEADING_IMPERATIVE_PATTERN =
  /^\s*(?:register|submit|join|enroll|schedule|complete|introduce|post|choose|select)\s+(?:for|to|your)\b/i;

// How many resolved body characters count as "substantial" for
// TITLE_AMBIGUOUS_ADMIN_PATTERN's and TITLE_AMBIGUOUS_ACTION_PATTERN's
// shared gate - enough to be a real paragraph of orientation/content prose
// rather than a placeholder stub ("See the syllabus.") or an empty/unresolved
// body (0 - the common case for a course-export item this classifier never
// got HTML for; see ClassifiableCourseItem.body's own comment). Deliberately
// well below the real "Getting Started" incident's 1398 characters, not
// tuned to just barely clear that one number - a title
// this ambiguous only needs to prove it is carrying MORE than a one-line
// stub, not match any particular real export's exact body length.
const MIN_SUBSTANTIAL_BODY_CHARS = 200;

/**
 * True when `item.body` clears MIN_SUBSTANTIAL_BODY_CHARS - the signal that
 * lets TITLE_AMBIGUOUS_ADMIN_PATTERN tell a genuine orientation/welcome
 * CONTENT page, and TITLE_AMBIGUOUS_ACTION_PATTERN tell a genuine survey/
 * register-vocabulary CONTENT page, apart from the LMS's own thin
 * housekeeping stub of the same name (see each pattern's own comment above).
 * `.length` on `undefined` is guarded to 0 via `?? 0` rather than a
 * truthiness check, matching the same idiom registry-helpers.sources.ts's
 * isBetterAnchor already uses for the identical "absent body / empty body
 * both compare as 0" reasoning.
 */
function hasSubstantialBody(item: ClassifiableCourseItem): boolean {
  return (item.body?.length ?? 0) >= MIN_SUBSTANTIAL_BODY_CHARS;
}

/**
 * True when `item`'s title should demote via the ambiguous admin/action
 * vocabulary (TITLE_AMBIGUOUS_ADMIN_PATTERN / TITLE_AMBIGUOUS_ACTION_PATTERN)
 * - the single place both of classifyCourseItemKind's call sites (the
 * type-shadow branch and the title-only fallback chain) go for that check,
 * so the guard logic exists in exactly one place rather than two copies that
 * could drift. See this file's header comment's "Fourth incident" (the
 * original two-guard design) and "Fifth incident" (TITLE_LEADING_IMPERATIVE_
 * PATTERN's addition to it) for the full history.
 *
 * Three checks, in order, each one a hard requirement the checks after it
 * cannot override:
 *
 * 1. The title must actually carry the ambiguous vocabulary in the first
 *    place ("welcome"/"orientation"/"getting started"/"announcements"/
 *    "register"/"survey") - a title with none of these words is never
 *    touched by this function at all, regardless of leading verb or body
 *    length. This is what keeps TITLE_LEADING_IMPERATIVE_PATTERN's
 *    deliberately broad verb set (which includes ordinary graded-work
 *    openers like "submit") from mattering for a title like "Submit Your
 *    Final Project" - that title never clears this first gate.
 * 2. A substantial resolved body (hasSubstantialBody) always wins,
 *    unconditionally - a real, evidently-substantive page is never demoted
 *    by phrasing, no matter how imperative its title reads. This guard is
 *    NOT overridable by TITLE_LEADING_IMPERATIVE_PATTERN; see the Fifth
 *    incident's "Submit Your Final Project" reasoning in the header comment
 *    for why resolved body length outranks title grammar.
 * 3. An explicit assignment word (TITLE_ASSIGNMENT_PATTERN) defeats
 *    demotion UNLESS the title also opens with an imperative verb aimed at
 *    the reader (TITLE_LEADING_IMPERATIVE_PATTERN) - the Fifth-incident
 *    fix. Without an assignment word, ambiguous vocabulary with no
 *    substantial body demotes outright, exactly as it always has.
 */
function isAmbiguousLogisticsTitle(item: ClassifiableCourseItem): boolean {
  const title = item.title ?? "";
  if (!TITLE_AMBIGUOUS_ADMIN_PATTERN.test(title) && !TITLE_AMBIGUOUS_ACTION_PATTERN.test(title)) return false;
  if (hasSubstantialBody(item)) return false;
  return !TITLE_ASSIGNMENT_PATTERN.test(title) || TITLE_LEADING_IMPERATIVE_PATTERN.test(title);
}

/**
 * True when `title` opens with an explicit "(Optional)"/"[Optional]"/
 * "Optional:" marker - see TITLE_OPTIONAL_MARKER_PATTERN's own comment above
 * for why this is anchored to the start of the title rather than matched
 * anywhere in it. Exported so registry-helpers.sources.ts's assignment-anchor
 * selection (the companion fix to this one - see that file's
 * selectAssignmentAnchor) can prefer a non-optional item using the EXACT SAME
 * optional-marker signal this classifier's own type-shadow demotion uses,
 * rather than re-implementing (and risking drifting from) an equivalent
 * pattern in a second file.
 */
export function hasLeadingOptionalMarker(title: string): boolean {
  return TITLE_OPTIONAL_MARKER_PATTERN.test(title ?? "");
}

// ---------------------------------------------------------------------------
// Title-based fallback signals - generic vocabulary an instructor or LMS
// uses to name these kinds of items, independent of subject matter. Checked
// in this order (action, ambiguous-logistics, assignment, quiz,
// administrative, instructional) so a title carrying more than one keyword
// resolves to the most specific/highest-stakes bucket rather than whichever
// pattern happens to be tested last - e.g. "Quiz Corrections Assignment"
// should read as graded work (assignment), not get siphoned off by a looser
// bucket first. TITLE_ACTION_PATTERN is checked FIRST, ahead of
// TITLE_ASSIGNMENT_PATTERN, not merely ahead of the administrative bucket -
// that ordering is itself the fix for defect (a) in this file's header
// comment: "Sign up for Group Project Groups" (type WikiPage, so it never
// even reaches the type-shadow branch above) contains "project", one of
// TITLE_ASSIGNMENT_PATTERN's own words, so if assignment were checked first
// it would win before the action signal ever got a look - exactly the bug.
//
// isAmbiguousLogisticsTitle is checked SECOND, also ahead of
// TITLE_ASSIGNMENT_PATTERN, for the identical reason and by the identical
// mechanism - see this file's header comment's "Fifth incident". Unlike
// TITLE_ACTION_PATTERN, this check is not a blanket demotion: it is a no-op
// for any title that does not separately clear TITLE_AMBIGUOUS_ADMIN_
// PATTERN/TITLE_AMBIGUOUS_ACTION_PATTERN's own vocabulary gate first (see
// that function's own comment). So moving it ahead of TITLE_ASSIGNMENT_
// PATTERN changes the outcome only for the titles it is meant to change -
// an ambiguous-vocabulary title whose leading verb marks it as an
// instruction to the reader - and is provably a no-op for every other
// title in this file's test suite, including "Lecture Notes: Assignment
// Prep" and "Quiz Corrections Assignment" in the "priority ordering" tests
// below (neither carries any TITLE_AMBIGUOUS_ADMIN_PATTERN/TITLE_AMBIGUOUS_
// ACTION_PATTERN vocabulary, so isAmbiguousLogisticsTitle short-circuits to
// false on its very first check before TITLE_ASSIGNMENT_PATTERN would ever
// have mattered).
const TITLE_ASSIGNMENT_PATTERN = /\b(assignments?|homework|projects?|deliverables?|problem sets?|labs?)\b/i;
const TITLE_QUIZ_PATTERN = /\b(quiz(zes)?|tests?|exams?|midterms?|finals?)\b/i;
// Administrative/participation shell: pure course-management or social
// touchpoints that carry no subject-matter content of their own - the
// classic LMS forum/housekeeping vocabulary, not tied to any one course's
// numbering or naming convention. Deliberately narrower than it used to be -
// TITLE_ACTION_PATTERN, TITLE_AMBIGUOUS_ADMIN_PATTERN, and
// TITLE_AMBIGUOUS_ACTION_PATTERN above have already carried off every word
// except "discussion" (see that trio's own comments for why "discussion"
// specifically has to stay here, unconditional, rather than move to any of
// them).
const TITLE_ADMIN_PATTERN = /\b(discussion(?: board| forum)?)\b/i;
// Instructional content: the vocabulary of real subject-matter delivery -
// objectives/tasks lists, learning materials, readings, lecture notes,
// overviews, chapters, slides, video. Checked after assignment/quiz/admin
// (a title can legitimately contain both, e.g. "Lecture Notes: Assignment
// Prep" - the assignment reading wins) and is largely a documentation aid
// rather than load-bearing, since classifyCourseItemKind's final fallback is
// already "instructional" - see the function below.
const TITLE_INSTRUCTIONAL_PATTERN =
  /\b(objectives?|tasks?|learning(?: materials?)?|readings?|lectures?|notes?|overview|materials?|chapters?|slides?|videos?|syllabus)\b/i;

/**
 * Classify one module item into a CourseItemKind. Pure: same input always
 * produces the same output, no I/O, no randomness.
 *
 * Order of checks: structural/organizational type first (a subheader or
 * folder is never real content, regardless of its title), then
 * assignment-family type - but ONLY once an unambiguous administrative/
 * participation/action title has had a chance to demote it (see
 * TITLE_OPTIONAL_MARKER_PATTERN's, TITLE_ACTION_PATTERN's, and
 * isAmbiguousLogisticsTitle's own comments above for why type alone is not
 * trustworthy here) - then quiz type, then the same action-first priority by
 * title (action, ambiguous-logistics, assignment, quiz, administrative,
 * instructional), then a content-bearing type (page/wiki/file/attachment/
 * document), and finally instructional as the safe default - an item this
 * classifier cannot confidently place is kept as supporting material rather
 * than silently dropped as administrative (which would suppress it) or
 * wrongly promoted as the graded anchor (which would mislead the generator
 * worse than the original bug).
 */
export function classifyCourseItemKind(item: ClassifiableCourseItem): CourseItemKind {
  const type = item.type ?? "";
  const title = item.title ?? "";

  if (TYPE_STRUCTURAL_PATTERN.test(type)) return "administrative";

  if (TYPE_ASSIGNMENT_PATTERN.test(type)) {
    // The type-shadow fix: an unambiguous administrative/participation/
    // action title demotes a permissive assign*-family TYPE match. The
    // optional-marker and action signals are each strong enough to demote
    // alone; isAmbiguousLogisticsTitle folds in the two ambiguous-vocabulary
    // signals (admin-ish words like "welcome", and action-ish-but-academic
    // words like "survey"/"register") together with their guards (title
    // must NOT also look like an assignment title UNLESS it opens with an
    // imperative verb aimed at the reader, AND the item must NOT carry a
    // substantial resolved body) so an incidental word collision, or a
    // genuinely substantive page that happens to share this vocabulary,
    // cannot be wrongly demoted. See isAmbiguousLogisticsTitle's own comment
    // for the full rationale and the counter-examples this deliberately
    // does NOT catch ("Discussion Assignment", "Graded Discussion Post",
    // "Survey Design Assignment", "Shift Register Lab", "Register
    // Allocation Homework").
    if (TITLE_OPTIONAL_MARKER_PATTERN.test(title)) return "administrative";
    if (TITLE_ACTION_PATTERN.test(title)) return "administrative";
    if (isAmbiguousLogisticsTitle(item)) return "administrative";
    return "assignment";
  }
  if (TYPE_QUIZ_PATTERN.test(type)) return "quiz";

  // TITLE_ACTION_PATTERN, then isAmbiguousLogisticsTitle, are both checked
  // before TITLE_ASSIGNMENT_PATTERN here (see that pattern's own comment,
  // and the comment above TITLE_ASSIGNMENT_PATTERN, for why the order
  // itself is the fix in both cases) - TITLE_ACTION_PATTERN's line is the
  // path "Sign up for Group Project Groups" (type WikiPage, no
  // assignment-family type to shadow) actually takes; isAmbiguousLogisticsTitle's
  // line is the path a WikiPage-typed "Register for Your Project Study
  // Partner" takes (see this file's header comment's "Fifth incident", and
  // course-item-classifier.test.ts's matching "Fifth incident" describe
  // block) - the same guard logic applies identically regardless of type.
  if (TITLE_ACTION_PATTERN.test(title)) return "administrative";
  if (isAmbiguousLogisticsTitle(item)) return "administrative";
  if (TITLE_ASSIGNMENT_PATTERN.test(title)) return "assignment";
  if (TITLE_QUIZ_PATTERN.test(title)) return "quiz";
  if (TITLE_ADMIN_PATTERN.test(title)) return "administrative";
  if (TITLE_INSTRUCTIONAL_PATTERN.test(title)) return "instructional";
  if (TYPE_CONTENT_PATTERN.test(type)) return "instructional";

  return "instructional";
}

/** Bucket a module's items by CourseItemKind, preserving each bucket's
 * relative order (stable partition, not a sort) - generic over any item
 * shape that satisfies ClassifiableCourseItem so both CartridgeModuleItem and
 * the live LMS's module item type can reuse it without a cast. */
export function partitionCourseItemsByKind<T extends ClassifiableCourseItem>(
  items: readonly T[]
): Record<CourseItemKind, T[]> {
  const result: Record<CourseItemKind, T[]> = {
    assignment: [],
    quiz: [],
    instructional: [],
    administrative: [],
  };
  for (const item of items) {
    result[classifyCourseItemKind(item)].push(item);
  }
  return result;
}
