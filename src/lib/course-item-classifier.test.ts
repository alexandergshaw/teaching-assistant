import { describe, it, expect } from "vitest";
import { classifyCourseItemKind, hasLeadingOptionalMarker, partitionCourseItemsByKind } from "./course-item-classifier";

// Real item titles from the INFO 1020 - Computer Science Principles Week 8
// run log that motivated this classifier ("week 8 summary: Covers: Note: We
// skip Chapter 9 and do Chapter 10 this module., Module 08 Objectives &
// Tasks, Module 08 Learning, Module 08 Discussion, Module 08 Assignment,
// Module 8 Chapter 10 Quiz, (Optional) Module 08 Status Update"). Types are
// left "" (the shape a generic Common Cartridge item actually carries - see
// parseGenericCartridge in cartridge-import.ts) so these fixtures prove the
// TITLE-based fallback rules alone are sufficient, not merely that a
// convenient type happened to be present.
describe("classifyCourseItemKind - real INFO 1020 Week 8 item titles", () => {
  it("classifies the graded assignment as 'assignment'", () => {
    expect(classifyCourseItemKind({ title: "Module 08 Assignment", type: "" })).toBe("assignment");
  });

  it("classifies the chapter quiz as 'quiz'", () => {
    expect(classifyCourseItemKind({ title: "Module 8 Chapter 10 Quiz", type: "" })).toBe("quiz");
  });

  it("classifies the learning-materials page as 'instructional'", () => {
    expect(classifyCourseItemKind({ title: "Module 08 Learning", type: "" })).toBe("instructional");
  });

  it("classifies the objectives/tasks page as 'instructional'", () => {
    expect(classifyCourseItemKind({ title: "Module 08 Objectives & Tasks", type: "" })).toBe("instructional");
    // The report's own prose form ("and" instead of "&") must classify the
    // same way - the rule keys off the word "objectives"/"tasks", not the
    // exact punctuation.
    expect(classifyCourseItemKind({ title: "Module 08 Objectives and Tasks", type: "" })).toBe("instructional");
  });

  it("classifies the optional status-update item as 'administrative'", () => {
    expect(classifyCourseItemKind({ title: "(Optional) Module 08 Status Update", type: "" })).toBe(
      "administrative"
    );
  });

  it("classifies the discussion forum as 'administrative' - the reported bug's own example", () => {
    expect(classifyCourseItemKind({ title: "Module 08 Discussion", type: "" })).toBe("administrative");
    expect(classifyCourseItemKind({ title: "Module 08 Discussion Forum", type: "" })).toBe("administrative");
  });

  it("partitions a full Week 8 module's items into the expected buckets", () => {
    const items = [
      { title: "Note: We skip Chapter 9 and do Chapter 10 this module.", type: "" },
      { title: "Module 08 Objectives & Tasks", type: "" },
      { title: "Module 08 Learning", type: "" },
      { title: "Module 08 Discussion", type: "" },
      { title: "Module 08 Assignment", type: "" },
      { title: "Module 8 Chapter 10 Quiz", type: "" },
      { title: "(Optional) Module 08 Status Update", type: "" },
    ];
    const kinds = partitionCourseItemsByKind(items);
    expect(kinds.assignment.map((i) => i.title)).toEqual(["Module 08 Assignment"]);
    expect(kinds.quiz.map((i) => i.title)).toEqual(["Module 8 Chapter 10 Quiz"]);
    expect(kinds.administrative.map((i) => i.title)).toEqual([
      "Module 08 Discussion",
      "(Optional) Module 08 Status Update",
    ]);
    // Everything else - including the free-text module note, which matches
    // none of the keyword buckets - falls to instructional, the safe
    // default (never silently dropped, never wrongly promoted to anchor).
    expect(kinds.instructional.map((i) => i.title)).toEqual([
      "Note: We skip Chapter 9 and do Chapter 10 this module.",
      "Module 08 Objectives & Tasks",
      "Module 08 Learning",
    ]);
  });
});

// The REAL bug report: against the instructor's actual Canvas export (not
// the type-"" fixture above), "(Optional) Module 08 Status Update" is a
// Canvas Assignment content object - type-shadow territory. These fixtures
// use the assignment-family type Canvas really stores it under, proving the
// fix works against the failure mode the bug report actually named (type
// checked BEFORE title let the item's own "status update" -> administrative
// title rule run at all), not just the type-absent case the first fixture
// set above already covered.
describe("classifyCourseItemKind - type-shadow precedence (the real Canvas export bug)", () => {
  it("demotes '(Optional) Module 08 Status Update' to administrative even though Canvas stores it under an assignment-family type", () => {
    expect(classifyCourseItemKind({ title: "(Optional) Module 08 Status Update", type: "Assignment" })).toBe(
      "administrative"
    );
  });

  it("still classifies the real graded assignment as 'assignment' when its own type is assignment-family", () => {
    expect(classifyCourseItemKind({ title: "Module 08 Assignment", type: "Assignment" })).toBe("assignment");
  });

  it("the leading optional marker alone demotes, with no participation vocabulary elsewhere in the title", () => {
    // "Extra Credit Project" contains none of TITLE_TYPE_DEMOTION_PATTERN's
    // words - only the leading "(Optional)" marker is doing the demoting
    // here, proving that signal works independently of the vocabulary one.
    expect(classifyCourseItemKind({ title: "(Optional) Extra Credit Project", type: "Assignment" })).toBe(
      "administrative"
    );
  });

  it("recognizes equivalent optional-marker spellings, all anchored to the start of the title", () => {
    expect(classifyCourseItemKind({ title: "[Optional] Module 08 Status Update", type: "Assignment" })).toBe(
      "administrative"
    );
    expect(classifyCourseItemKind({ title: "Optional: Module 08 Status Update", type: "Assignment" })).toBe(
      "administrative"
    );
  });

  it("participation vocabulary alone demotes, with no leading optional marker", () => {
    expect(classifyCourseItemKind({ title: "Module 08 Status Update", type: "Assignment" })).toBe(
      "administrative"
    );
    expect(classifyCourseItemKind({ title: "Office Hours Sign-up", type: "Assignment" })).toBe("administrative");
  });

  it("does NOT demote a title that merely mentions optionality mid-title rather than opening with it", () => {
    // The marker is anchored to the START of the title on purpose - a
    // genuinely graded item that happens to mention optional sub-parts
    // should not be swept up by a rule meant to catch the LMS's own "this
    // whole item is optional" label.
    expect(classifyCourseItemKind({ title: "Lab 4 (optional exercises included)", type: "Assignment" })).toBe(
      "assignment"
    );
  });

  it("does NOT demote a genuinely graded item whose title merely contains a participation word - the over-correction guard", () => {
    expect(classifyCourseItemKind({ title: "Discussion Assignment", type: "Assignment" })).toBe("assignment");
    expect(classifyCourseItemKind({ title: "Graded Discussion Post", type: "Assignment" })).toBe("assignment");
    expect(classifyCourseItemKind({ title: "Week 3 Discussion Essay", type: "Assignment" })).toBe("assignment");
  });

  it("does NOT demote via vocabulary when a non-discussion demotion word coincides with an explicit assignment word in the same title", () => {
    // TITLE_TYPE_DEMOTION_PATTERN's own "welcome" entry would otherwise fire
    // here - the guard (title must not ALSO look like an assignment title)
    // is what keeps an explicitly-labeled "Assignment" from being demoted
    // just because it happens to open with "Welcome".
    expect(classifyCourseItemKind({ title: "Welcome Week Assignment 1", type: "Assignment" })).toBe("assignment");
  });

  it("the type-shadow demotion never fires when the type itself carries no assignment-family signal - unchanged title-only fallback", () => {
    // Same title as the very first test in this block, but with type "" -
    // this is the pre-existing title-only fallback chain (TITLE_ACTION_PATTERN's
    // "status updates?" entry), which this fix leaves untouched.
    expect(classifyCourseItemKind({ title: "(Optional) Module 08 Status Update", type: "" })).toBe(
      "administrative"
    );
  });
});

// Two more defects the regression gate found by running this classifier
// against the instructor's ACTUAL Canvas export (26ss-info-1020-2a export),
// not a hand-built fixture - reproduced here with the export's own verbatim
// titles and types (dumped via a throwaway parseCartridgeBlob probe, then
// deleted). See this file's header comment's "Third incident" for the full
// story of both.
describe("classifyCourseItemKind - real defects found against the instructor's actual Canvas export", () => {
  it("defect: 'Sign up for Group Project Groups' (a WikiPage) is a sign-up form, not the graded project - 'project' alone must not promote it", () => {
    // Real title, real type, real module (Module 06) from the export. Before
    // this fix, TITLE_ASSIGNMENT_PATTERN's "project" word fired in the
    // title-only fallback chain before any admin/action signal got a look.
    expect(classifyCourseItemKind({ title: "Sign up for Group Project Groups", type: "WikiPage" })).toBe(
      "administrative"
    );
  });

  it("the same sign-up override also applies when a permissive assignment-family TYPE would otherwise have shadowed it", () => {
    // Also a real title from the same export (Module 05) - Canvas stores
    // this one-time GitHub account-registration checkpoint as a real
    // Assignment content object, exactly the same type-shadow situation
    // "(Optional) Module 08 Status Update" exposed - and exactly like that
    // fix, an unambiguous title signal (this time TITLE_ACTION_PATTERN's
    // "sign up") demotes it regardless of type.
    expect(classifyCourseItemKind({ title: "GitHub Sign Up", type: "Assignment" })).toBe("administrative");
  });

  it("defect: 'Getting Started' (a WikiPage with a substantial resolved body) is real orientation content, not a housekeeping stub", () => {
    // Real title, real type, real module (Start Here) from the export - the
    // real resolved body was 1398 characters; this uses a synthetic filler
    // body of the SAME LENGTH (not the instructor's actual page text) since
    // only the length, not the content, drives this classifier's decision.
    const realBodyLength = 1398;
    expect(
      classifyCourseItemKind({ title: "Getting Started", type: "WikiPage", body: "x".repeat(realBodyLength) })
    ).toBe("instructional");
  });

  it("the SAME title without a substantial body still reads as administrative - proves the fix is body-substantiality, not a 'Getting Started' special case", () => {
    expect(classifyCourseItemKind({ title: "Getting Started", type: "WikiPage" })).toBe("administrative");
    expect(classifyCourseItemKind({ title: "Getting Started", type: "WikiPage", body: "A short blurb." })).toBe(
      "administrative"
    );
  });
});

// Fourth incident: TITLE_ACTION_PATTERN's "survey"/"register" words were
// unconditional (no assignment-word guard, no body guard) and demoted
// genuinely graded work whose title merely happened to contain one of them -
// "survey" is a standard assignment genre (a literature survey), "register"
// is CPU/hardware vocabulary (register allocation, a shift register). See
// this file's header comment's "Fourth incident" for the full story,
// including why the fix is a guarded TITLE_AMBIGUOUS_ACTION_PATTERN (the
// same two-guard idiom TITLE_AMBIGUOUS_ADMIN_PATTERN already established for
// "welcome"/"orientation"), not an outright deletion of the two words.
describe("classifyCourseItemKind - Fourth incident: 'survey'/'register' are ambiguous vocabulary, not unconditional logistics words", () => {
  it("defect: an explicit assignment word in the title defeats the 'survey'/'register' demotion, regardless of body", () => {
    // Each of these four carries an explicit TITLE_ASSIGNMENT_PATTERN word
    // ("Assignment"/"Project"/"Lab"/"Homework") alongside "survey" or
    // "register" - the assignment-word guard alone is enough to save them,
    // with no resolved body at all.
    expect(classifyCourseItemKind({ title: "Survey Design Assignment", type: "Assignment" })).toBe("assignment");
    expect(classifyCourseItemKind({ title: "Customer Survey Project", type: "Assignment" })).toBe("assignment");
    expect(classifyCourseItemKind({ title: "Shift Register Lab", type: "Assignment" })).toBe("assignment");
    expect(classifyCourseItemKind({ title: "Register Allocation Homework", type: "Assignment" })).toBe(
      "assignment"
    );
  });

  it("defect: a substantial resolved body defeats the 'survey'/'register' demotion when the title carries NO assignment word", () => {
    // Neither title contains an TITLE_ASSIGNMENT_PATTERN word, so only the
    // body-substantiality guard can save them - proving that guard, not just
    // the assignment-word one, is load-bearing. Bodies mirror the bug
    // report's own observation that every one of these seven titles carried
    // a substantial resolved body that the old unconditional rule discarded.
    expect(
      classifyCourseItemKind({ title: "Literature Survey", type: "Assignment", body: "x".repeat(400) })
    ).toBe("assignment");
    expect(
      classifyCourseItemKind({ title: "Module 08 Survey", type: "Assignment", body: "x".repeat(400) })
    ).toBe("assignment");
  });

  it("the SAME two titles without a substantial body still demote - proves the fix is a genuine guard, not a blanket exemption for 'survey'/'register'", () => {
    expect(classifyCourseItemKind({ title: "Literature Survey", type: "Assignment" })).toBe("administrative");
    expect(classifyCourseItemKind({ title: "Module 08 Survey", type: "Assignment" })).toBe("administrative");
  });

  it("defect: 'Survey of Object Oriented Programming' (a WikiPage with a substantial resolved body) is real instructional content, not a housekeeping stub - the mirror of the 'Getting Started' fix, and this instructor's own Module 08 name", () => {
    // This exact wording is the instructor's own Module 08 title
    // ("Module 08 - Survey of Object Oriented Programming") from the real
    // export this classifier was built for - severity was "latent" only
    // because no ITEM in the current export happens to be titled this way,
    // not because the defect could not fire.
    expect(
      classifyCourseItemKind({ title: "Survey of Object Oriented Programming", type: "WikiPage", body: "x".repeat(400) })
    ).toBe("instructional");
  });

  it("the SAME title without a substantial body reads as administrative - proves the fix is body-substantiality, not a title-specific special case", () => {
    expect(classifyCourseItemKind({ title: "Survey of Object Oriented Programming", type: "WikiPage" })).toBe(
      "administrative"
    );
  });

  it("a genuinely thin 'survey'/'register' logistics stub - no assignment word, no resolved body - still demotes, exactly as it did before this fix", () => {
    expect(classifyCourseItemKind({ title: "Register", type: "Assignment" })).toBe("administrative");
    expect(classifyCourseItemKind({ title: "Survey", type: "Assignment" })).toBe("administrative");
    // "Registering" (not "Registration") - TITLE_AMBIGUOUS_ACTION_PATTERN's
    // regist(?:er(?:ing)?|ration) group matches "register"/"registering"/
    // "registration", the same forms TITLE_ACTION_PATTERN matched before this
    // fix, PLUS the correctly-spelled "registration" - see the "Sixth
    // incident" describe block below for that fix and why it was carried as
    // a known gap through the Fourth and Fifth incidents first.
    expect(classifyCourseItemKind({ title: "Registering for the Course", type: "Assignment" })).toBe(
      "administrative"
    );
  });

  it("'sign up' (a phrase-only action word, unaffected by this fix) still demotes unconditionally even when it collides with an assignment word", () => {
    // Unlike bare "register"/"survey", the phrase-only words in
    // TITLE_ACTION_PATTERN stay unconditional - this is the pre-existing
    // "Sign up for Group Project Groups" behavior, unchanged by the Fourth
    // incident's fix.
    expect(classifyCourseItemKind({ title: "Sign Up for the Final Project", type: "Assignment" })).toBe(
      "administrative"
    );
  });
});

// Every case the task's own "must not regress" list names, reproduced with
// the REAL Canvas type string the export actually carries for that item
// (WikiPage/DiscussionTopic/Quizzes::Quiz/ContextModuleSubHeader/Assignment)
// rather than the idealized type: "" fixtures used earlier in this file -
// so a fix that happened to work only for the type-blind fallback chain, but
// broke once a real type string was present, would show up here.
describe("classifyCourseItemKind - must-not-regress cases against the real export's own type strings", () => {
  it("'(Optional) Module 08 Status Update' (type=Assignment) stays administrative", () => {
    expect(classifyCourseItemKind({ title: "(Optional) Module 08 Status Update", type: "Assignment" })).toBe(
      "administrative"
    );
  });

  it("'Module 08 Assignment' (type=Assignment) stays assignment", () => {
    expect(classifyCourseItemKind({ title: "Module 08 Assignment", type: "Assignment" })).toBe("assignment");
  });

  it("'Module 08 Objectives & Tasks' (type=WikiPage) stays instructional", () => {
    expect(classifyCourseItemKind({ title: "Module 08 Objectives & Tasks", type: "WikiPage" })).toBe(
      "instructional"
    );
  });

  it("'Module 08 Learning' (type=WikiPage) stays instructional", () => {
    expect(classifyCourseItemKind({ title: "Module 08 Learning", type: "WikiPage" })).toBe("instructional");
  });

  it("'Module 08 Discussion' (type=DiscussionTopic) stays administrative", () => {
    expect(classifyCourseItemKind({ title: "Module 08 Discussion", type: "DiscussionTopic" })).toBe(
      "administrative"
    );
  });

  it("'Module 8 Chapter 10 Quiz' (type=Quizzes::Quiz) stays quiz", () => {
    expect(classifyCourseItemKind({ title: "Module 8 Chapter 10 Quiz", type: "Quizzes::Quiz" })).toBe("quiz");
  });

  it("'Note: We skip Chapter 9 and do Chapter 10 this module.' (type=ContextModuleSubHeader) stays administrative", () => {
    expect(
      classifyCourseItemKind({
        title: "Note: We skip Chapter 9 and do Chapter 10 this module.",
        type: "ContextModuleSubHeader",
      })
    ).toBe("administrative");
  });

  it("the title-only discussion counter-examples stay assignment under an assignment-family type", () => {
    expect(classifyCourseItemKind({ title: "Discussion Assignment", type: "Assignment" })).toBe("assignment");
    expect(classifyCourseItemKind({ title: "Graded Discussion Post", type: "Assignment" })).toBe("assignment");
    expect(classifyCourseItemKind({ title: "Week 3 Discussion Essay", type: "Assignment" })).toBe("assignment");
  });
});

describe("hasLeadingOptionalMarker", () => {
  it("is true for a leading '(Optional)' marker and false without one", () => {
    expect(hasLeadingOptionalMarker("(Optional) Module 08 Status Update")).toBe(true);
    expect(hasLeadingOptionalMarker("Module 08 Status Update")).toBe(false);
  });

  it("is false for a mid-title mention of 'optional'", () => {
    expect(hasLeadingOptionalMarker("Lab 4 (optional exercises included)")).toBe(false);
  });
});

// A second, differently-numbered and differently-worded course, to prove the
// rules above key off generic LMS/subject vocabulary rather than anything
// fitted to INFO 1020's own titles or numbering scheme (Definition of Done
// #2). Nothing here shares a title with the INFO 1020 fixtures above.
describe("classifyCourseItemKind - a differently-named course (MATH 2010) proves this generalizes", () => {
  it("classifies homework/project-style titles as 'assignment'", () => {
    expect(classifyCourseItemKind({ title: "Homework 3: Recursive Sequences", type: "" })).toBe("assignment");
    expect(classifyCourseItemKind({ title: "Final Project Deliverable", type: "" })).toBe("assignment");
  });

  it("classifies exam-style titles as 'quiz'", () => {
    expect(classifyCourseItemKind({ title: "Midterm Exam", type: "" })).toBe("quiz");
    expect(classifyCourseItemKind({ title: "Chapter 5 Test", type: "" })).toBe("quiz");
  });

  it("classifies lecture/reading-style titles as 'instructional'", () => {
    expect(classifyCourseItemKind({ title: "Week 5 Lecture Notes", type: "" })).toBe("instructional");
    expect(classifyCourseItemKind({ title: "Required Reading: Chapter 5", type: "" })).toBe("instructional");
  });

  it("classifies forum/social/housekeeping titles as 'administrative'", () => {
    expect(classifyCourseItemKind({ title: "Discussion Board: Chapter 5 Reflections", type: "" })).toBe(
      "administrative"
    );
    expect(classifyCourseItemKind({ title: "Icebreaker: Introduce Yourself", type: "" })).toBe("administrative");
    expect(classifyCourseItemKind({ title: "Office Hours Sign-up", type: "" })).toBe("administrative");
  });

  it("falls back to a content-bearing type when the title carries no keyword at all", () => {
    expect(classifyCourseItemKind({ title: "Untitled Page 3", type: "WikiPage" })).toBe("instructional");
    expect(classifyCourseItemKind({ title: "xyz-1234", type: "" })).toBe("instructional");
  });

  it("routes a structural/organizational type to 'administrative' regardless of title", () => {
    expect(classifyCourseItemKind({ title: "Syllabus Overview", type: "ContextModuleSubHeader" })).toBe(
      "administrative"
    );
    expect(classifyCourseItemKind({ title: "Week 3", type: "resource/x-bb-folder" })).toBe("administrative");
  });

  it("a type-level assignment/quiz signal wins even when the title alone is ambiguous", () => {
    expect(classifyCourseItemKind({ title: "Week 3 Work", type: "Assignment" })).toBe("assignment");
    expect(classifyCourseItemKind({ title: "Week 3 Check", type: "resource/x-bb-asmt-test-link" })).toBe("quiz");
  });

  // MATH 2010's own optional/participation cases (Definition of Done #2:
  // Part 1's type-shadow fix must generalize past INFO 1020's own titles and
  // numbering, exactly like the rest of this fixture set already does).
  it("demotes an optional participation item even when MATH 2010's own LMS stores it under an assignment-family type", () => {
    expect(classifyCourseItemKind({ title: "(Optional) Weekly Check-in", type: "Assignment" })).toBe(
      "administrative"
    );
    expect(classifyCourseItemKind({ title: "Extra Credit Icebreaker Survey", type: "Assignment" })).toBe(
      "administrative"
    );
  });

  it("still classifies MATH 2010's real graded homework as 'assignment' under the same assignment-family type", () => {
    expect(classifyCourseItemKind({ title: "Week 5 Homework", type: "Assignment" })).toBe("assignment");
  });

  it("does not demote MATH 2010's graded discussion assignment merely because its title mentions discussion", () => {
    expect(classifyCourseItemKind({ title: "Discussion Board Assignment: Chapter 5", type: "Assignment" })).toBe(
      "assignment"
    );
  });

  // MATH 2010's own sign-up and orientation-page cases, under naming that
  // shares NOTHING with the real INFO 1020 export's "Sign up for Group
  // Project Groups" / "Getting Started" - proving the third incident's two
  // fixes generalize past this one export's exact wording (Definition of
  // Done #2, extended for the third incident specifically).
  it("a sign-up/registration title demotes even when it also collides with MATH 2010's own assignment vocabulary", () => {
    // "homework" is one of TITLE_ASSIGNMENT_PATTERN's own words - proving the
    // sign-up override wins the same collision "Sign up for Group Project
    // Groups" (vs. "project") did, under completely different wording.
    expect(classifyCourseItemKind({ title: "Sign Up for a Homework Study Partner", type: "WikiPage" })).toBe(
      "administrative"
    );
    // Resolved by the Fifth incident (see this file's header comment) - this
    // was left deliberately failing as of the Fourth incident fix, because
    // the assignment-word guard alone could not distinguish this title from
    // "Register Allocation Homework" (both contain "Register" and
    // "Homework"; see the "Fourth incident" describe block above, which
    // must stay "assignment"). The discriminator that resolves the
    // collision is word order, not vocabulary: this title OPENS with
    // "Register" as an imperative verb, immediately followed by "for" (the
    // object of the instruction) - "Register Allocation Homework" uses
    // "Register" as a noun modifier, with no "for"/"to"/"your" following it
    // at all. TITLE_LEADING_IMPERATIVE_PATTERN captures exactly that
    // distinction; see isAmbiguousLogisticsTitle's own comment for how it
    // composes with (and does not replace) the assignment-word and body
    // guards. See the "Fifth incident" describe block below for the
    // generalization cases (a different colliding assignment word, a
    // different leading verb, and the "must not regress" proof that a
    // leading imperative verb with no ambiguous vocabulary at all - e.g.
    // "Submit Your Final Project" - is left untouched).
    expect(classifyCourseItemKind({ title: "Register for Your Homework Partner", type: "Assignment" })).toBe(
      "administrative"
    );
  });

  // New Fourth-incident cases, under MATH 2010 naming that shares nothing
  // with the real INFO 1020 export's "Survey Design Assignment" / "Shift
  // Register Lab" / "Survey of Object Oriented Programming" wording -
  // proving the guarded TITLE_AMBIGUOUS_ACTION_PATTERN discriminator
  // generalizes past this one export's exact vocabulary, the same way every
  // other fix in this file has been proven to (Definition of Done #3).
  it("an explicit assignment word defeats the 'survey'/'register' demotion under MATH 2010's own naming", () => {
    // "Course Feedback Survey Assignment" - a graded reflective-writing
    // assignment about a survey topic; "Assignment" saves it exactly the way
    // "Survey Design Assignment" is saved in the INFO 1020 fixtures above.
    expect(classifyCourseItemKind({ title: "Course Feedback Survey Assignment", type: "Assignment" })).toBe(
      "assignment"
    );
    // "Register Machine Simulation Homework" - register machines are a
    // standard theory-of-computation model, the CPU/hardware sense of
    // "register" applied to a different CS subfield than INFO 1020's "Shift
    // Register Lab"; "Homework" saves it the same way.
    expect(classifyCourseItemKind({ title: "Register Machine Simulation Homework", type: "Assignment" })).toBe(
      "assignment"
    );
  });

  it("a genuinely thin 'survey'/'register' logistics stub still demotes under MATH 2010's own naming, with no assignment word and no resolved body", () => {
    expect(classifyCourseItemKind({ title: "End of Term Survey", type: "Assignment" })).toBe("administrative");
    expect(classifyCourseItemKind({ title: "Register for a Study Group", type: "Assignment" })).toBe(
      "administrative"
    );
  });

  it("a survey-titled page with a substantial body is real instructional content under MATH 2010's own naming, not a housekeeping stub", () => {
    expect(
      classifyCourseItemKind({
        title: "Survey of Modern Statistical Methods",
        type: "WikiPage",
        body: "x".repeat(250),
      })
    ).toBe("instructional");
    // Same title, no substantial body - proves this is the body-substantiality
    // guard doing the work, not a special case for this exact wording.
    expect(classifyCourseItemKind({ title: "Survey of Modern Statistical Methods", type: "WikiPage" })).toBe(
      "administrative"
    );
  });

  it("an orientation-style page with a substantial body is real content, not a housekeeping stub, under different wording than 'Getting Started'", () => {
    expect(
      classifyCourseItemKind({
        title: "Course Welcome & Orientation",
        type: "WikiPage",
        body: "x".repeat(250),
      })
    ).toBe("instructional");
  });

  it("the SAME orientation-style title with no substantial body is a housekeeping stub, under different wording than 'Getting Started'", () => {
    expect(classifyCourseItemKind({ title: "Course Welcome & Orientation", type: "WikiPage" })).toBe(
      "administrative"
    );
  });
});

// Fifth incident: the Fourth incident's two-guard TITLE_AMBIGUOUS_ACTION_PATTERN
// still misjudged "Register for Your Homework Partner" (type Assignment) as
// graded work, saved from demotion by the assignment-word guard the exact
// same way "Register Allocation Homework" is correctly saved by it - the
// two titles share both "Register" and "Homework", so vocabulary alone
// cannot separate them. The discriminator is word order: a title that OPENS
// with an imperative verb addressed to the reader ("Register FOR...",
// "Submit YOUR...") is an instruction, not a graded-work noun phrase, even
// when it also contains an assignment word. See TITLE_LEADING_IMPERATIVE_PATTERN
// and isAmbiguousLogisticsTitle in course-item-classifier.ts, and this
// file's header comment's "Fifth incident", for the full design.
describe("classifyCourseItemKind - Fifth incident: leading imperative phrasing overrides the assignment-word guard, not the body guard", () => {
  it("generalizes past 'Homework' to a different colliding assignment word ('Project')", () => {
    // Same mechanism as "Register for Your Homework Partner" above, proving
    // the fix is not fitted to the one word "Homework" happened to be.
    expect(classifyCourseItemKind({ title: "Register for Your Project Study Group", type: "Assignment" })).toBe(
      "administrative"
    );
  });

  it("generalizes past 'register' to a different leading verb in TITLE_LEADING_IMPERATIVE_PATTERN's set ('submit')", () => {
    // "Submit" is deliberately one of the riskier verbs in the set (see the
    // header comment's "Fifth incident" - it is ALSO a completely ordinary
    // graded-work opener), but it only ever matters here because "survey"
    // (TITLE_AMBIGUOUS_ACTION_PATTERN's own vocabulary) is also present -
    // proving the co-occurrence gate, not the verb alone, is what's doing
    // the work.
    expect(classifyCourseItemKind({ title: "Submit Your Survey Response Assignment", type: "Assignment" })).toBe(
      "administrative"
    );
  });

  it("does NOT demote a leading imperative verb when the title carries no ambiguous vocabulary at all - 'Submit your final project' stays graded work", () => {
    // The exact case this file's task/regression gate names explicitly:
    // TITLE_LEADING_IMPERATIVE_PATTERN's verb set includes "submit" - a
    // completely ordinary way to open a real graded-work title - so this
    // must NOT misclassify. It doesn't, because isAmbiguousLogisticsTitle
    // requires TITLE_AMBIGUOUS_ADMIN_PATTERN/TITLE_AMBIGUOUS_ACTION_PATTERN's
    // own vocabulary to match FIRST, and "final project" contains none of
    // it - the leading-verb check is never even reached. TITLE_ASSIGNMENT_
    // PATTERN's ordinary "project" match is what classifies this, unaffected
    // by the Fifth-incident fix.
    expect(classifyCourseItemKind({ title: "Submit Your Final Project", type: "Assignment" })).toBe("assignment");
  });

  it("a substantial resolved body still wins outright even when both an ambiguous word AND a leading imperative verb are present", () => {
    // Unlike the assignment-word guard, the body guard is NOT overridable by
    // TITLE_LEADING_IMPERATIVE_PATTERN - see isAmbiguousLogisticsTitle's own
    // comment for why resolved body length always outranks title phrasing.
    // "Register for Your Homework Partner" itself, given a substantial body,
    // must not demote just because its title still reads as an instruction.
    expect(
      classifyCourseItemKind({
        title: "Register for Your Homework Partner",
        type: "Assignment",
        body: "x".repeat(2000),
      })
    ).toBe("assignment");
  });

  it("the same reordering fix applies in the title-only fallback chain, not only the type-shadow branch", () => {
    // Mirrors "Sign up for Group Project Groups" (a WikiPage, no
    // assignment-family type to shadow) from the Third incident above -
    // isAmbiguousLogisticsTitle is checked ahead of TITLE_ASSIGNMENT_PATTERN
    // in the fallback chain for the identical reason, so this demotes
    // whether or not the LMS happens to store it under an assignment-family
    // type.
    expect(
      classifyCourseItemKind({ title: "Register for Your Project Study Partner", type: "WikiPage" })
    ).toBe("administrative");
  });
});

// Sixth incident: TITLE_AMBIGUOUS_ACTION_PATTERN's register(?:ing|ration)?
// alternation expanded to register | registering | registerration - a
// doubled "r" that never matches the correctly spelled "registration" - so a
// pure logistics title using that word never cleared the ambiguous-vocabulary
// gate at all. See this file's header comment's "Sixth incident" for the
// full history (why it was left as a known, written-down gap through the
// Fourth and Fifth incidents, and why it is fixed here as its own pass).
describe("classifyCourseItemKind - Sixth incident: TITLE_AMBIGUOUS_ACTION_PATTERN now actually matches 'registration'", () => {
  it("'Course Registration Form' (a WikiPage) classifies as administrative logistics, not instructional - the defect this incident is named for", () => {
    expect(classifyCourseItemKind({ title: "Course Registration Form", type: "WikiPage" })).toBe(
      "administrative"
    );
  });

  it("'Submit Your Course Registration' (type Assignment) now demotes, where it previously slipped through as 'assignment'", () => {
    // Pre-fix this returned "assignment": "Registration" never matched the
    // broken alternation, so isAmbiguousLogisticsTitle's vocabulary gate
    // never even opened - the type-assignment branch fell straight through
    // to its unconditional "return assignment". No leading-imperative
    // phrasing is needed to save this one either: "Submit Your Course
    // Registration" carries no TITLE_ASSIGNMENT_PATTERN word, so the
    // assignment-word guard was never even a factor.
    expect(classifyCourseItemKind({ title: "Submit Your Course Registration", type: "Assignment" })).toBe(
      "administrative"
    );
  });

  it("a bare 'Registration' stub - no assignment word, no resolved body - demotes, exactly like the bare 'Register'/'Survey' stubs above", () => {
    expect(classifyCourseItemKind({ title: "Registration", type: "Assignment" })).toBe("administrative");
  });

  it("an explicit assignment word still defeats the demotion for a genuinely graded 'registration'-titled item, proving the fixed alternation did not remove the existing guard", () => {
    expect(
      classifyCourseItemKind({ title: "Registration System Design Project", type: "Assignment" })
    ).toBe("assignment");
  });

  it("a substantial resolved body still defeats the demotion for a genuine 'registration'-titled content page", () => {
    expect(
      classifyCourseItemKind({
        title: "Course Registration Policies",
        type: "WikiPage",
        body: "x".repeat(400),
      })
    ).toBe("instructional");
  });
});

describe("classifyCourseItemKind - priority ordering", () => {
  it("prefers assignment over a coincidental instructional keyword in the same title", () => {
    expect(classifyCourseItemKind({ title: "Lecture Notes: Assignment Prep", type: "" })).toBe("assignment");
  });

  it("prefers quiz over a coincidental assignment-adjacent word ordering", () => {
    expect(classifyCourseItemKind({ title: "Quiz Corrections Assignment", type: "" })).toBe("assignment");
  });
});

describe("partitionCourseItemsByKind", () => {
  it("preserves each bucket's relative order (stable partition) and never drops an item", () => {
    const items = [
      { title: "Assignment A", type: "" },
      { title: "Quiz A", type: "" },
      { title: "Assignment B", type: "" },
      { title: "Discussion A", type: "" },
      { title: "Lecture Notes A", type: "" },
    ];
    const kinds = partitionCourseItemsByKind(items);
    expect(kinds.assignment.map((i) => i.title)).toEqual(["Assignment A", "Assignment B"]);
    const total =
      kinds.assignment.length + kinds.quiz.length + kinds.instructional.length + kinds.administrative.length;
    expect(total).toBe(items.length);
  });

  it("returns empty buckets (not undefined) for an empty item list", () => {
    const kinds = partitionCourseItemsByKind([]);
    expect(kinds).toEqual({ assignment: [], quiz: [], instructional: [], administrative: [] });
  });
});
